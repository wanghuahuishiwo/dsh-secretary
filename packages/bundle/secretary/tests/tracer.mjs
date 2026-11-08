import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import Storage, { storageBackendServiceKey } from '@deepseek-ai/dsh-storage'
import { SqliteStorageBackend } from '@deepseek-ai/dsh-storage-sqlite'
import { GoalService } from 'dsh-secretary-goal/contract'
import { GtdService } from 'dsh-secretary-gtd/contract'
import { TagService } from 'dsh-secretary-tag/contract'
import { TimeService } from 'dsh-secretary-time-block/contract'

async function sqliteHarness(t, databasePath, failOn, beforePlugins, includeGoal = true) {
  const directory = databasePath === undefined ? await mkdtemp(join(tmpdir(), 'dsh-secretary-tracer-')) : undefined
  const resolvedDatabasePath = databasePath ?? join(directory, 'secretary.sqlite')
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = new SqliteStorageBackend({ path: resolvedDatabasePath, journalMode: 'delete' })
  let nextFailure
  const consumeFailure = table => {
    if (nextFailure?.table !== table) return false
    nextFailure.count += 1
    if (!nextFailure.indexes.has(nextFailure.count)) return false
    if (nextFailure.count === Math.max(...nextFailure.indexes)) nextFailure = undefined
    return true
  }
  if (failOn !== undefined) {
    const open = backend.kv.open
    backend.kv.open = async descriptor => {
      const unit = await open(descriptor)
      const wrapped = Object.create(unit)
      wrapped.putRecord = async (table, key, value) => {
        if (failOn.put === table || consumeFailure(table)) throw new Error(`injected put failure on ${table}`)
        return unit.putRecord(table, key, value)
      }
      wrapped.deleteRecord = async (table, key) => {
        if (failOn.delete === table || consumeFailure(table)) throw new Error(`injected delete failure on ${table}`)
        return unit.deleteRecord(table, key)
      }
      return wrapped
    }
  }
  ctx.storage.backend.register('sqlite', backend)
  ctx.provide(storageBackendServiceKey('sqlite'), backend)
  const storageModule = await import('dsh-secretary-storage')
  await ctx.plugin(storageModule)
  const facility = ctx.secretaryStorageDomain
  await beforePlugins?.(facility)

  const tools = new Map()
  const skills = new Map()
  const routes = new Map()
  ctx.provide('connection', {
    fetch: {
      register(route) {
        routes.set(route.path, route)
        return () => { routes.delete(route.path) }
      },
    },
  })
  ctx.provide('tools', {
    register(definition) {
      tools.set(definition.name, definition)
      return () => { tools.delete(definition.name) }
    },
  })
  ctx.provide('skills', {
    register(definition) {
      skills.set(definition.name, definition)
      return () => { skills.delete(definition.name) }
    },
  })

  const modules = await Promise.all([
    import('dsh-secretary-gtd'),
    import('dsh-secretary-gtd/tools'),
    import('dsh-secretary-tag'),
    import('dsh-secretary-tag/tools'),
    import('dsh-secretary-time-block'),
    import('dsh-secretary-time-block/tools'),
    import('dsh-secretary-time-controller'),
    ...(includeGoal ? [import('dsh-secretary-goal')] : []),
  ])
  // Create every module before awaiting them, as the real Loader does. Cordis
  // service readiness, not this list's order, determines who can activate.
  const pending = modules.map(module => ctx.plugin(module))
  if (includeGoal) await Promise.all(pending)

  let closed = false
  const close = async () => {
    if (closed) return
    closed = true
    await ctx.fiber.dispose()
    await facility.closeAll()
    await backend.close()
  }
  t.after(async () => {
    await close()
    if (directory !== undefined) await rm(directory, { recursive: true, force: true })
  })
  return {
    ctx, tools, skills, routes, databasePath: resolvedDatabasePath, close, failOn,
    failNextWrite(table, index = 1) { nextFailure = { table, indexes: new Set([index]), count: 0 } },
    failWriteSequence(table, indexes) { nextFailure = { table, indexes: new Set(indexes), count: 0 } },
    async provideGoal() {
      if (includeGoal) throw new Error('secretary: test harness already includes Goal')
      const goal = await import('dsh-secretary-goal')
      const provider = await ctx.plugin(goal)
      await Promise.all(pending)
      return provider
    },
  }
}

function execute(harness, name, args) {
  const tool = harness.tools.get(name)
  assert.ok(tool, `missing public tool ${name}`)
  return tool.execute(args)
}

async function eventually(assertion) {
  let lastError
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }
  throw lastError
}

test('Tag public tools create and list a unified time/context tree with numeric ids', async (t) => {
  const harness = await sqliteHarness(t)
  const work = await execute(harness, 'secretary_tag', {
    op: 'create', name: '工作', kind: 'time', color: '#477bc7',
  })
  assert.equal(work.tag.id, 1)
  assert.deepEqual(work.tag, { id: 1, name: '工作', kind: 'time', color: '#477bc7' })

  const context = await execute(harness, 'secretary_tag', {
    op: 'create', name: '工作', kind: 'context',
  })
  assert.equal(context.tag.id, 2)
  const timeTags = await execute(harness, 'secretary_tag', { op: 'list', kind: 'time' })
  assert.deepEqual(timeTags.tags.map(tag => tag.id), [work.tag.id])
  const fetched = await execute(harness, 'secretary_tag', { op: 'get', id: context.tag.id })
  assert.equal(fetched.tag.kind, 'context')
})

test('Tag hierarchy inherits kind and supports rename, color selection, and moves', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag: root } = await execute(harness, 'secretary_tag', {
    op: 'create', name: '个人发展', kind: 'time', color: '#4b8b6a',
  })
  const { tag: child } = await execute(harness, 'secretary_tag', {
    op: 'create', name: '技术', parentId: root.id,
  })
  assert.equal(child.kind, 'time')
  assert.equal(child.parentId, root.id)

  const updated = await execute(harness, 'secretary_tag', {
    op: 'update', id: child.id, name: '技术实践', color: '#876cae',
  })
  assert.equal(updated.tag.name, '技术实践')
  assert.equal(updated.tag.color, '#876cae')

  const rootMoved = await execute(harness, 'secretary_tag', { op: 'move', id: child.id, parentId: null })
  assert.equal(rootMoved.tag.parentId, undefined)
  const nested = await execute(harness, 'secretary_tag', { op: 'move', id: child.id, parentId: root.id })
  assert.equal(nested.tag.parentId, root.id)
  const cleared = await execute(harness, 'secretary_tag', { op: 'update', id: child.id, color: null })
  assert.equal(cleared.tag.color, undefined)
})

test('Tag moves reject cycles and cross-kind parents, and delete protects children', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag: root } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const { tag: child } = await execute(harness, 'secretary_tag', { op: 'create', name: '会议', parentId: root.id })
  const { tag: context } = await execute(harness, 'secretary_tag', { op: 'create', name: '地点', kind: 'context' })

  await assert.rejects(
    execute(harness, 'secretary_tag', { op: 'move', id: root.id, parentId: child.id }),
    /cycle|descendant/,
  )
  await assert.rejects(
    execute(harness, 'secretary_tag', { op: 'move', id: child.id, parentId: context.id }),
    /across kinds/,
  )
  await assert.rejects(
    execute(harness, 'secretary_tag', { op: 'create', name: '非法子级', kind: 'context', parentId: root.id }),
    /same kind/,
  )
  await assert.rejects(execute(harness, 'secretary_tag', { op: 'delete', id: root.id }), /children/)
  const deleted = await execute(harness, 'secretary_tag', { op: 'delete', id: child.id })
  assert.equal(deleted.tag.id, child.id)
  await assert.rejects(execute(harness, 'secretary_tag', { op: 'get', id: child.id }), /no tag/)
})

test('ActualBlock public tools persist independent, arbitrarily overlapping actual intervals', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '技术', kind: 'time' })
  const created = await execute(harness, 'secretary_time', {
    op: 'actual.create',
    timeTagId: tag.id,
    startAt: '2026-11-02T09:00:00+08:00',
    endAt: '2026-11-02T10:00:00+08:00',
    actualSource: 'user_reported',
    focus: 'deep',
    note: '实现标签闭环',
  })
  assert.equal(created.block.id, 1)
  assert.equal(created.block.timeTagId, tag.id)
  assert.equal(created.block.actionId, undefined)
  assert.equal(created.block.planned, undefined)
  assert.equal(created.block.use, undefined)

  const overlap = await execute(harness, 'secretary_time', {
    op: 'actual.create',
    timeTagId: tag.id,
    startAt: '2026-11-02T09:00:00+08:00',
    endAt: '2026-11-02T10:00:00+08:00',
    actualSource: 'agent_observed',
    focus: 'shallow',
  })
  assert.equal(overlap.block.id, 2)
  const listed = await execute(harness, 'secretary_time', {
    op: 'actual.list', date: '2026-11-02', timeZone: 'Asia/Shanghai',
  })
  assert.deepEqual(listed.blocks.map(block => block.id), [1, 2])

  const updated = await execute(harness, 'secretary_time', {
    op: 'actual.update', id: 1, endAt: '2026-11-02T09:30:00+08:00', focus: null, note: '缩短区间',
  })
  assert.equal(updated.block.endAt, '2026-11-02T09:30:00+08:00')
  assert.equal(updated.block.focus, undefined)
  assert.equal(updated.block.note, '缩短区间')
  const fetched = await execute(harness, 'secretary_time', { op: 'actual.get', id: 1 })
  assert.equal(fetched.block.actualSource, 'user_reported')
  await execute(harness, 'secretary_time', { op: 'actual.delete', id: 2 })
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'actual.list' })).blocks.map(block => block.id), [1])
})

test('PlanBlock public tools provide numeric-id CRUD on a concrete date', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '专注工作', kind: 'time' })
  const created = await execute(harness, 'secretary_time', {
    op: 'plan.create', date: '2026-11-02', timeZone: 'Asia/Shanghai', timeTagId: tag.id,
    startAt: '2026-11-02T09:00:00+08:00', endAt: '2026-11-02T10:00:00+08:00', note: '实现日期计划',
  })
  assert.deepEqual(created.block, {
    id: 1, timeTagId: tag.id, note: '实现日期计划',
    startAt: '2026-11-02T09:00:00+08:00', endAt: '2026-11-02T10:00:00+08:00',
  })
  const overlap = await execute(harness, 'secretary_time', {
    op: 'plan.create', date: '2026-11-02', timeZone: 'Asia/Shanghai', timeTagId: tag.id,
    startAt: '2026-11-02T09:00:00+08:00', endAt: '2026-11-02T10:00:00+08:00',
  })
  assert.equal(overlap.block.id, 2)
  const listed = await execute(harness, 'secretary_time', {
    op: 'plan.list', date: '2026-11-02', timeZone: 'Asia/Shanghai',
  })
  assert.deepEqual(listed.blocks.map(block => block.id), [1, 2])
  const updated = await execute(harness, 'secretary_time', {
    op: 'plan.update', id: 1, endAt: '2026-11-02T09:30:00+08:00', note: '缩短计划',
  })
  assert.equal(updated.block.endAt, '2026-11-02T09:30:00+08:00')
  assert.equal(updated.block.note, '缩短计划')
  assert.equal((await execute(harness, 'secretary_time', { op: 'plan.get', id: 1 })).block.id, 1)
  await execute(harness, 'secretary_time', { op: 'plan.delete', id: 2 })
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'plan.list' })).blocks.map(block => block.id), [1])
})

test('Plan dates honor explicit time zones and overnight intervals while CRUD never rewrites Actual', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '通勤', kind: 'time' })
  const { block: actual } = await execute(harness, 'secretary_time', {
    op: 'actual.create', timeTagId: tag.id, startAt: '2026-11-02T23:30:00-05:00',
    endAt: '2026-11-03T00:30:00-05:00', actualSource: 'user_reported', note: '实录不变',
  })
  const { block: overnight } = await execute(harness, 'secretary_time', {
    op: 'plan.create', date: '2026-11-02', timeZone: 'America/New_York', timeTagId: tag.id,
    startAt: '2026-11-02T23:30:00-05:00', endAt: '2026-11-03T00:30:00-05:00',
  })
  for (const date of ['2026-11-02', '2026-11-03']) {
    const listed = await execute(harness, 'secretary_time', { op: 'plan.list', date, timeZone: 'America/New_York' })
    assert.deepEqual(listed.blocks.map(block => block.id), [overnight.id])
  }
  const holiday = await execute(harness, 'secretary_time', {
    op: 'plan.create', date: '2026-11-04', timeZone: 'America/New_York', timeTagId: tag.id,
    startAt: '2026-11-04T09:00:00-05:00', endAt: '2026-11-04T10:00:00-05:00', note: '小长假独立安排',
  })
  await execute(harness, 'secretary_time', { op: 'plan.update', id: overnight.id, note: '只调整计划' })
  await execute(harness, 'secretary_time', { op: 'plan.delete', id: holiday.block.id })
  assert.equal((await execute(harness, 'secretary_time', { op: 'actual.get', id: actual.id })).block.note, '实录不变')
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'plan.list' })).blocks.map(block => block.id), [overnight.id])
  await assert.rejects(execute(harness, 'secretary_time', {
    op: 'plan.create', date: '2026-02-31', timeZone: 'Asia/Shanghai', timeTagId: tag.id,
    startAt: '2026-03-01T09:00:00+08:00', endAt: '2026-03-01T10:00:00+08:00',
  }), /invalid date/)
  await assert.rejects(execute(harness, 'secretary_time', {
    op: 'plan.create', date: '2026-11-02', timeZone: 'Asia/Shanghai', timeTagId: tag.id,
    startAt: '2026-11-02T23:30:00-05:00', endAt: '2026-11-03T00:30:00-05:00',
  }), /must fall on date/)
  await assert.rejects(execute(harness, 'secretary_time', {
    op: 'plan.list', date: '2026-11-02', timeZone: 'Not/A_Zone',
  }), /invalid timeZone/)
})

test('Plan update moves a record between dates without leaving it in the original day', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const { block } = await execute(harness, 'secretary_time', {
    op: 'plan.create', date: '2026-11-02', timeZone: 'Asia/Shanghai', timeTagId: tag.id,
    startAt: '2026-11-02T09:00:00+08:00', endAt: '2026-11-02T10:00:00+08:00',
  })
  await execute(harness, 'secretary_time', {
    op: 'plan.update', id: block.id,
    startAt: '2026-11-03T11:00:00+08:00', endAt: '2026-11-03T12:00:00+08:00',
  })
  assert.deepEqual((await execute(harness, 'secretary_time', {
    op: 'plan.list', date: '2026-11-02', timeZone: 'Asia/Shanghai',
  })).blocks, [], 'day A must no longer contain the moved PlanBlock')
  assert.deepEqual((await execute(harness, 'secretary_time', {
    op: 'plan.list', date: '2026-11-03', timeZone: 'Asia/Shanghai',
  })).blocks.map(item => item.id), [block.id], 'day B must contain the moved PlanBlock')

  await execute(harness, 'secretary_time', {
    op: 'template.create', weekday: 1, startTime: '13:00', endTime: '14:00', timeTagId: tag.id,
  })
  await execute(harness, 'secretary_time', {
    op: 'template.apply', weekday: 1, targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
  })
  assert.deepEqual((await execute(harness, 'secretary_time', {
    op: 'plan.list', date: '2026-11-02', timeZone: 'Asia/Shanghai',
  })).blocks.map(item => item.startAt), ['2026-11-02T13:00:00+08:00'])
  assert.deepEqual((await execute(harness, 'secretary_time', {
    op: 'plan.list', date: '2026-11-03', timeZone: 'Asia/Shanghai',
  })).blocks.map(item => item.id), [block.id], 'replacing day A must not delete a PlanBlock already moved to day B')
})

test('PlanTemplateBlock public tools maintain weekday-local template records with numeric ids', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '晨间例行', kind: 'time' })
  const created = await execute(harness, 'secretary_time', {
    op: 'template.create', weekday: 1, startTime: '09:00', endTime: '10:00', timeTagId: tag.id, note: '周模板',
  })
  assert.deepEqual(created.block, {
    id: 1, weekday: 1, startTime: '09:00', endTime: '10:00', timeTagId: tag.id, note: '周模板',
  })
  const updated = await execute(harness, 'secretary_time', {
    op: 'template.update', id: 1, weekday: 6, startTime: '10:15', endTime: '11:30', note: null,
  })
  assert.equal(updated.block.weekday, 6)
  assert.equal(updated.block.startTime, '10:15')
  assert.equal(updated.block.endTime, '11:30')
  assert.equal(updated.block.note, undefined)
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'template.list', weekday: 1 })).blocks, [])
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'template.list', weekday: 6 })).blocks.map(block => block.id), [1])
  await execute(harness, 'secretary_time', { op: 'template.delete', id: 1 })
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'template.list' })).blocks, [])
})

test('template.apply atomically replaces a date plan and template.undo restores it without touching Actual or Template', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const { block: actual } = await execute(harness, 'secretary_time', {
    op: 'actual.create', timeTagId: tag.id, startAt: '2026-11-02T09:00:00+08:00',
    endAt: '2026-11-02T10:00:00+08:00', actualSource: 'user_reported', note: '真实实录',
  })
  const { block: original } = await execute(harness, 'secretary_time', {
    op: 'plan.create', date: '2026-11-02', timeZone: 'Asia/Shanghai', timeTagId: tag.id,
    startAt: '2026-11-02T08:00:00+08:00', endAt: '2026-11-02T08:30:00+08:00', note: '原计划',
  })
  await execute(harness, 'secretary_time', {
    op: 'template.create', weekday: 1, startTime: '09:00', endTime: '10:00', timeTagId: tag.id, note: '模板工作',
  })
  await execute(harness, 'secretary_time', {
    op: 'template.create', weekday: 1, startTime: '23:30', endTime: '00:30', timeTagId: tag.id, note: '跨日模板',
  })
  const applied = await execute(harness, 'secretary_time', {
    op: 'template.apply', weekday: 1, targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
  })
  assert.deepEqual(applied.blocks.map(block => block.id), [5, 6])
  assert.equal(applied.blocks[0].startAt, '2026-11-02T09:00:00+08:00')
  assert.equal(applied.blocks[1].startAt, '2026-11-02T23:30:00+08:00')
  assert.equal(applied.blocks[1].endAt, '2026-11-03T00:30:00+08:00')
  assert.deepEqual((await execute(harness, 'secretary_time', {
    op: 'plan.list', date: '2026-11-02', timeZone: 'Asia/Shanghai',
  })).blocks.map(block => block.id), [5, 6])
  assert.deepEqual((await execute(harness, 'secretary_time', {
    op: 'actual.list', date: '2026-11-02', timeZone: 'Asia/Shanghai',
  })).blocks.map(block => block.id), [actual.id])

  const undone = await execute(harness, 'secretary_time', {
    op: 'template.undo', targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
  })
  assert.deepEqual(undone.blocks, [original])
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'plan.list' })).blocks, [original])
  assert.equal((await execute(harness, 'secretary_time', { op: 'actual.get', id: actual.id })).block.note, '真实实录')
  const templates = await execute(harness, 'secretary_time', { op: 'template.list', weekday: 1 })
  assert.deepEqual(templates.blocks.map(block => [block.id, block.startTime, block.endTime]), [[3, '09:00', '10:00'], [4, '23:30', '00:30']])

  await execute(harness, 'secretary_time', { op: 'template.update', id: 3, startTime: '11:00', endTime: '12:00' })
  assert.equal((await execute(harness, 'secretary_time', { op: 'plan.get', id: original.id })).block.startAt, '2026-11-02T08:00:00+08:00')
  await execute(harness, 'secretary_time', { op: 'plan.update', id: original.id, note: '只改日期计划' })
  assert.equal((await execute(harness, 'secretary_time', { op: 'template.list', weekday: 1 })).blocks[0].note, '模板工作')
})

test('template apply replaces overlapping overnight Plans on either date and undo restores the exact before set', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '夜间', kind: 'time' })
  const { block: actual } = await execute(harness, 'secretary_time', {
    op: 'actual.create', timeTagId: tag.id, startAt: '2026-11-01T23:30:00+08:00',
    endAt: '2026-11-02T00:30:00+08:00', actualSource: 'user_reported', note: 'Actual 不变',
  })
  const { block: before } = await execute(harness, 'secretary_time', {
    op: 'plan.create', date: '2026-11-01', timeZone: 'Asia/Shanghai', timeTagId: tag.id,
    startAt: '2026-11-01T23:30:00+08:00', endAt: '2026-11-02T00:30:00+08:00', note: '前夜原计划',
  })
  const { block: template } = await execute(harness, 'secretary_time', {
    op: 'template.create', weekday: 1, startTime: '23:00', endTime: '01:00', timeTagId: tag.id, note: '模板不变',
  })
  const applied = await execute(harness, 'secretary_time', {
    op: 'template.apply', weekday: 1, targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
  })
  assert.deepEqual((await execute(harness, 'secretary_time', {
    op: 'plan.list', date: '2026-11-01', timeZone: 'Asia/Shanghai',
  })).blocks, [], 'the previous-day overnight Plan must be replaced')
  for (const date of ['2026-11-02', '2026-11-03']) {
    const listed = await execute(harness, 'secretary_time', { op: 'plan.list', date, timeZone: 'Asia/Shanghai' })
    assert.deepEqual(listed.blocks.map(block => block.id), [applied.blocks[0].id], `target overlap semantics failed on ${date}`)
  }
  assert.deepEqual((await execute(harness, 'secretary_time', {
    op: 'template.undo', targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
  })).blocks, [before])
  for (const date of ['2026-11-01', '2026-11-02']) {
    assert.deepEqual((await execute(harness, 'secretary_time', {
      op: 'plan.list', date, timeZone: 'Asia/Shanghai',
    })).blocks, [before])
  }
  assert.deepEqual((await execute(harness, 'secretary_time', {
    op: 'plan.list', date: '2026-11-03', timeZone: 'Asia/Shanghai',
  })).blocks, [])
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'actual.get', id: actual.id })).block, actual)
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'template.list' })).blocks, [template])
})

test('multi-record template apply and undo roll back on a real SQLite write failure', async (t) => {
  const harness = await sqliteHarness(t, undefined, {})
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const { block: actual } = await execute(harness, 'secretary_time', {
    op: 'actual.create', timeTagId: tag.id, startAt: '2026-11-02T09:00:00+08:00',
    endAt: '2026-11-02T10:00:00+08:00', actualSource: 'user_reported',
  })
  const { block: original } = await execute(harness, 'secretary_time', {
    op: 'plan.create', date: '2026-11-02', timeZone: 'Asia/Shanghai', timeTagId: tag.id,
    startAt: '2026-11-02T08:00:00+08:00', endAt: '2026-11-02T08:30:00+08:00',
  })
  for (const [startTime, endTime] of [['09:00', '10:00'], ['10:00', '11:00']]) {
    await execute(harness, 'secretary_time', { op: 'template.create', weekday: 1, startTime, endTime, timeTagId: tag.id })
  }
  harness.failNextWrite('plan_template_undos')
  await assert.rejects(execute(harness, 'secretary_time', {
    op: 'template.apply', weekday: 1, targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
  }), /injected put failure/)
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'plan.list' })).blocks, [original])

  const applied = await execute(harness, 'secretary_time', {
    op: 'template.apply', weekday: 1, targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
  })
  harness.failNextWrite('plan_template_undos')
  await assert.rejects(execute(harness, 'secretary_time', {
    op: 'template.undo', targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
  }), /injected (put|delete) failure/)
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'plan.list' })).blocks, applied.blocks)
  assert.deepEqual((await execute(harness, 'secretary_time', {
    op: 'template.undo', targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
  })).blocks, [original])
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'actual.list' })).blocks.map(block => block.id), [actual.id])
})

test('every intermediate PlanBlock write failure compensates template apply and preserves retryable undo', async (t) => {
  for (const phase of ['apply', 'undo']) {
    for (const index of [1, 2, 3, 4]) {
      const harness = await sqliteHarness(t, undefined, {})
      const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
      const originals = []
      for (const [startAt, endAt] of [
        ['2026-11-02T08:00:00+08:00', '2026-11-02T08:30:00+08:00'],
        ['2026-11-02T08:30:00+08:00', '2026-11-02T09:00:00+08:00'],
      ]) {
        const { block } = await execute(harness, 'secretary_time', {
          op: 'plan.create', date: '2026-11-02', timeZone: 'Asia/Shanghai', timeTagId: tag.id, startAt, endAt,
        })
        originals.push(block)
      }
      for (const [startTime, endTime] of [['09:00', '10:00'], ['10:00', '11:00']]) {
        await execute(harness, 'secretary_time', { op: 'template.create', weekday: 1, startTime, endTime, timeTagId: tag.id })
      }
      const applied = phase === 'undo' ? (await execute(harness, 'secretary_time', {
        op: 'template.apply', weekday: 1, targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
      })).blocks : undefined
      harness.failNextWrite('plan_blocks', index)
      await assert.rejects(execute(harness, 'secretary_time', phase === 'apply'
        ? { op: 'template.apply', weekday: 1, targetDate: '2026-11-02', timeZone: 'Asia/Shanghai' }
        : { op: 'template.undo', targetDate: '2026-11-02', timeZone: 'Asia/Shanghai' }), /injected (put|delete) failure/)
      assert.deepEqual((await execute(harness, 'secretary_time', { op: 'plan.list' })).blocks,
        phase === 'apply' ? originals : applied, `${phase} write ${index} must leave a complete Plan set`)
      if (phase === 'apply') {
        await assert.rejects(execute(harness, 'secretary_time', {
          op: 'template.undo', targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
        }), /no template apply/)
      } else {
        assert.deepEqual((await execute(harness, 'secretary_time', {
          op: 'template.undo', targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
        })).blocks, originals)
      }
      await harness.close()
    }
  }
})

test('a failed template apply with a second compensation failure reports and reopens its actual partial facts', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-secretary-double-failure-'))
  const databasePath = join(directory, 'secretary.sqlite')
  t.after(async () => { await rm(directory, { recursive: true, force: true }) })
  const harness = await sqliteHarness(t, databasePath, {})
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const originals = []
  for (const [startAt, endAt] of [
    ['2026-11-02T08:00:00+08:00', '2026-11-02T08:30:00+08:00'],
    ['2026-11-02T08:30:00+08:00', '2026-11-02T09:00:00+08:00'],
  ]) {
    originals.push((await execute(harness, 'secretary_time', {
      op: 'plan.create', date: '2026-11-02', timeZone: 'Asia/Shanghai', timeTagId: tag.id, startAt, endAt,
    })).block)
  }
  for (const [startTime, endTime] of [['09:00', '10:00'], ['10:00', '11:00']]) {
    await execute(harness, 'secretary_time', { op: 'template.create', weekday: 1, startTime, endTime, timeTagId: tag.id })
  }
  // put after[0], fail put after[1], then fail the compensation delete of after[0].
  harness.failWriteSequence('plan_blocks', [2, 5])
  await assert.rejects(execute(harness, 'secretary_time', {
    op: 'template.apply', weekday: 1, targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
  }), /rollback failed/)
  const partial = await execute(harness, 'secretary_time', { op: 'plan.list' })
  assert.deepEqual(partial.blocks.map(block => block.id), [originals[0].id, originals[1].id, 5])
  await harness.close()

  const reopened = await sqliteHarness(t, databasePath)
  assert.deepEqual((await execute(reopened, 'secretary_time', { op: 'plan.list' })).blocks, partial.blocks,
    'a double failure is durable evidence of the non-transactional boundary, not an atomicity claim')
  await assert.rejects(execute(reopened, 'secretary_time', {
    op: 'template.undo', targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
  }), /no template apply/)
})

test('an existing v1 Time schema reopens legacy Actual, Template, and Deep records and accepts new Plan writes', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-secretary-v1-time-'))
  const databasePath = join(directory, 'secretary.sqlite')
  t.after(async () => { await rm(directory, { recursive: true, force: true }) })
  const actual = {
    id: 1, timeTagId: 1, note: 'v1 实录', startAt: '2026-11-02T09:00:00+08:00',
    endAt: '2026-11-02T10:00:00+08:00', actualSource: 'user_reported', focus: 'deep',
  }
  const template = { id: 2, weekday: 1, startTime: '10:00', endTime: '11:00', timeTagId: 1, note: 'v1 模板' }
  const levels = Array.from({ length: 168 }, () => 'unset')
  levels[0] = 'high'
  const legacy = await sqliteHarness(t, databasePath, undefined, async facility => {
    const schema = { parse: value => value }
    const domain = await facility.open({
      name: 'secretary_time', version: 1,
      tables: {
        actual_blocks: { valueSchema: schema }, deep_templates: { valueSchema: schema },
        plan_days: { valueSchema: schema }, plan_template_blocks: { valueSchema: schema },
      },
      global: { initial: 1, schema },
    })
    await domain.table('actual_blocks').put('1', actual)
    await domain.table('plan_template_blocks').put('2', template)
    await domain.table('deep_templates').put('base', { scope: 'base', levels })
    await domain.table('plan_days').put('2026-11-02', { date: '2026-11-02', blocks: [] })
    await domain.global.set(3)
    await domain.close()
  })
  await legacy.close()

  const reopened = await sqliteHarness(t, databasePath)
  await execute(reopened, 'secretary_tag', { op: 'create', name: 'v1 工作', kind: 'time' })
  assert.deepEqual((await execute(reopened, 'secretary_time', { op: 'actual.get', id: 1 })).block, actual)
  assert.deepEqual((await execute(reopened, 'secretary_time', { op: 'template.list' })).blocks, [template])
  const legacyDeep = (await execute(reopened, 'secretary_time', { op: 'deep.getWeek', weekStart: '2026-11-02' })).week
  assert.equal(legacyDeep.weekStart, '2026-11-02')
  assert.equal(legacyDeep.source, 'seed')
  assert.equal(legacyDeep.cells[0].level, 'high')
  const ownDeep = (await execute(reopened, 'secretary_time', {
    op: 'deep.setCell', weekStart: '2026-11-02', weekday: 2, hour: 9, level: 'low',
  })).week
  assert.equal(ownDeep.source, 'own')
  assert.equal(ownDeep.cells[0].level, 'high')
  assert.equal(ownDeep.cells[33].level, 'low')
  const earlierDeep = (await execute(reopened, 'secretary_time', { op: 'deep.getWeek', weekStart: '2026-10-26' })).week
  assert.equal(earlierDeep.source, 'seed')
  assert.equal(earlierDeep.cells[0].level, 'high')
  assert.equal(earlierDeep.cells[33].level, 'unset', 'own-week writes must not rewrite the base seed')
  const created = await execute(reopened, 'secretary_time', {
    op: 'plan.create', date: '2026-11-02', timeZone: 'Asia/Shanghai', timeTagId: 1,
    startAt: '2026-11-02T12:00:00+08:00', endAt: '2026-11-02T12:30:00+08:00', note: '新 Plan 模型',
  })
  assert.equal(created.block.id, 3)
  assert.deepEqual((await execute(reopened, 'secretary_time', {
    op: 'plan.list', date: '2026-11-02', timeZone: 'Asia/Shanghai',
  })).blocks, [created.block])
})

test('Plan, Template, and pending template undo recover after a complete SQLite restart', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-secretary-plan-restart-'))
  const databasePath = join(directory, 'secretary.sqlite')
  t.after(async () => { await rm(directory, { recursive: true, force: true }) })
  const first = await sqliteHarness(t, databasePath)
  const { tag } = await execute(first, 'secretary_tag', { op: 'create', name: '生活', kind: 'time' })
  const { block: original } = await execute(first, 'secretary_time', {
    op: 'plan.create', date: '2026-11-02', timeZone: 'Asia/Shanghai', timeTagId: tag.id,
    startAt: '2026-11-02T07:30:00+08:00', endAt: '2026-11-02T08:00:00+08:00', note: '原有安排',
  })
  const { block: template } = await execute(first, 'secretary_time', {
    op: 'template.create', weekday: 1, startTime: '09:00', endTime: '10:00', timeTagId: tag.id,
  })
  const applied = await execute(first, 'secretary_time', {
    op: 'template.apply', weekday: 1, targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
  })
  await first.close()

  const reopened = await sqliteHarness(t, databasePath)
  assert.deepEqual((await execute(reopened, 'secretary_time', { op: 'plan.list' })).blocks, applied.blocks)
  assert.deepEqual((await execute(reopened, 'secretary_time', { op: 'template.list' })).blocks, [template])
  assert.deepEqual((await execute(reopened, 'secretary_time', {
    op: 'template.undo', targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
  })).blocks, [original])
  const next = await execute(reopened, 'secretary_time', {
    op: 'plan.create', date: '2026-11-02', timeZone: 'Asia/Shanghai', timeTagId: tag.id,
    startAt: '2026-11-02T12:00:00+08:00', endAt: '2026-11-02T12:30:00+08:00',
  })
  assert.equal(next.block.id, applied.blocks[0].id + 1)
})

test('template.undo refuses to overwrite subsequent date-plan edits', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  await execute(harness, 'secretary_time', {
    op: 'template.create', weekday: 1, startTime: '09:00', endTime: '10:00', timeTagId: tag.id,
  })
  const applied = await execute(harness, 'secretary_time', {
    op: 'template.apply', weekday: 1, targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
  })
  const extra = await execute(harness, 'secretary_time', {
    op: 'plan.create', date: '2026-11-02', timeZone: 'Asia/Shanghai', timeTagId: tag.id,
    startAt: '2026-11-02T12:00:00+08:00', endAt: '2026-11-02T12:30:00+08:00',
  })
  await assert.rejects(execute(harness, 'secretary_time', {
    op: 'template.undo', targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
  }), /changed after template apply/)
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'plan.list' })).blocks.map(block => block.id), [applied.blocks[0].id, extra.block.id])
})

test('Actual start/stop persists running state and enforces source and focus enums', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '专注工作', kind: 'time' })
  const started = await execute(harness, 'secretary_time', {
    op: 'actual.start', timeTagId: tag.id, startAt: '2026-11-02T14:00:00+08:00',
    actualSource: 'agent_observed', focus: 'deep', note: '正在实现',
  })
  assert.equal(started.block.endAt, undefined)
  assert.equal(started.block.actualSource, 'agent_observed')
  assert.equal(started.block.focus, 'deep')

  const stopped = await execute(harness, 'secretary_time', {
    op: 'actual.stop', id: started.block.id, endAt: '2026-11-02T14:45:00+08:00',
  })
  assert.equal(stopped.block.endAt, '2026-11-02T14:45:00+08:00')
  await assert.rejects(
    execute(harness, 'secretary_time', { op: 'actual.stop', id: started.block.id, endAt: '2026-11-02T15:00:00+08:00' }),
    /not running/,
  )
  await assert.rejects(
    execute(harness, 'secretary_time', {
      op: 'actual.create', timeTagId: tag.id, startAt: '2026-11-02T10:00:00+08:00',
      endAt: '2026-11-02T11:00:00+08:00', actualSource: 'user_reported', focus: 'flow',
    }),
    /invalid focus level/,
  )
  await assert.rejects(
    execute(harness, 'secretary_time', {
      op: 'actual.create', timeTagId: tag.id, startAt: '2026-11-02T10:00:00+08:00',
      endAt: '2026-11-02T11:00:00+08:00', actualSource: 'guessed',
    }),
    /invalid actualSource/,
  )
})

test('Actual list by a parent Tag includes direct and descendant associations without duplicate records', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag: parent } = await execute(harness, 'secretary_tag', { op: 'create', name: '个人发展', kind: 'time' })
  const { tag: child } = await execute(harness, 'secretary_tag', { op: 'create', name: '技术', parentId: parent.id })
  const { tag: grandchild } = await execute(harness, 'secretary_tag', { op: 'create', name: 'TypeScript', parentId: child.id })
  for (const [index, timeTagId] of [parent.id, child.id, grandchild.id].entries()) {
    const hour = String(8 + index).padStart(2, '0')
    await execute(harness, 'secretary_time', {
      op: 'actual.create', timeTagId,
      startAt: `2026-11-02T${hour}:00:00+08:00`, endAt: `2026-11-02T${hour}:30:00+08:00`,
      actualSource: 'user_reported',
    })
  }
  const all = await execute(harness, 'secretary_time', { op: 'actual.list', timeTagId: parent.id })
  assert.deepEqual(all.blocks.map(block => block.id), [1, 2, 3])
  assert.equal(new Set(all.blocks.map(block => block.id)).size, 3)
  const descendants = await execute(harness, 'secretary_time', { op: 'actual.list', timeTagId: child.id })
  assert.deepEqual(descendants.blocks.map(block => block.id), [2, 3])
})

test('Plan list by a parent Tag includes direct and descendant associations exactly once', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag: parent } = await execute(harness, 'secretary_tag', { op: 'create', name: '个人发展', kind: 'time' })
  const { tag: child } = await execute(harness, 'secretary_tag', { op: 'create', name: '技术', parentId: parent.id })
  const { tag: grandchild } = await execute(harness, 'secretary_tag', { op: 'create', name: 'TypeScript', parentId: child.id })
  for (const [index, timeTagId] of [parent.id, child.id, grandchild.id].entries()) {
    const hour = String(8 + index).padStart(2, '0')
    await execute(harness, 'secretary_time', {
      op: 'plan.create', date: '2026-11-02', timeZone: 'Asia/Shanghai', timeTagId,
      startAt: `2026-11-02T${hour}:00:00+08:00`, endAt: `2026-11-02T${hour}:30:00+08:00`,
    })
  }
  const all = await execute(harness, 'secretary_time', { op: 'plan.list', timeTagId: parent.id })
  assert.deepEqual(all.blocks.map(block => block.id), [1, 2, 3], 'direct parent and every descendant must match')
  assert.equal(new Set(all.blocks.map(block => block.id)).size, all.blocks.length, 'a PlanBlock must appear only once')
  const descendants = await execute(harness, 'secretary_time', { op: 'plan.list', timeTagId: child.id })
  assert.deepEqual(descendants.blocks.map(block => block.id), [2, 3])
})

test('Tag deletion protects Actual references, including concurrent create/delete', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const { block } = await execute(harness, 'secretary_time', {
    op: 'actual.create', timeTagId: tag.id,
    startAt: '2026-11-02T09:00:00+08:00', endAt: '2026-11-02T10:00:00+08:00', actualSource: 'user_reported',
  })
  await assert.rejects(execute(harness, 'secretary_tag', { op: 'delete', id: tag.id }), /referenced/)
  await execute(harness, 'secretary_time', { op: 'actual.delete', id: block.id })

  const outcomes = await Promise.allSettled([
    execute(harness, 'secretary_time', {
      op: 'actual.create', timeTagId: tag.id,
      startAt: '2026-11-02T11:00:00+08:00', endAt: '2026-11-02T12:00:00+08:00', actualSource: 'user_reported',
    }),
    execute(harness, 'secretary_tag', { op: 'delete', id: tag.id }),
  ])
  assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1)
  const remaining = await execute(harness, 'secretary_time', { op: 'actual.list' })
  const survivingTag = await execute(harness, 'secretary_tag', { op: 'get', id: tag.id }).catch(() => undefined)
  if (survivingTag === undefined) assert.equal(remaining.blocks.length, 0)
  else assert.equal(remaining.blocks.length, 1)

  const { tag: context } = await execute(harness, 'secretary_tag', { op: 'create', name: '公司', kind: 'context' })
  await assert.rejects(
    execute(harness, 'secretary_time', {
      op: 'actual.create', timeTagId: context.id,
      startAt: '2026-11-02T12:00:00+08:00', endAt: '2026-11-02T13:00:00+08:00', actualSource: 'user_reported',
    }),
    /requires a time tag/,
  )
})

test('Tag deletion protects Plan, Template, and recoverable template-undo references', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag: originalTag } = await execute(harness, 'secretary_tag', { op: 'create', name: '原计划标签', kind: 'time' })
  const { tag: templateTag } = await execute(harness, 'secretary_tag', { op: 'create', name: '模板标签', kind: 'time' })
  await execute(harness, 'secretary_time', {
    op: 'plan.create', date: '2026-11-02', timeZone: 'Asia/Shanghai', timeTagId: originalTag.id,
    startAt: '2026-11-02T08:00:00+08:00', endAt: '2026-11-02T09:00:00+08:00',
  })
  await execute(harness, 'secretary_time', {
    op: 'template.create', weekday: 1, startTime: '10:00', endTime: '11:00', timeTagId: templateTag.id,
  })
  await execute(harness, 'secretary_time', {
    op: 'template.apply', weekday: 1, targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
  })
  await assert.rejects(execute(harness, 'secretary_tag', { op: 'delete', id: originalTag.id }), /referenced/)
  await assert.rejects(execute(harness, 'secretary_tag', { op: 'delete', id: templateTag.id }), /referenced/)
})

test('Tag deletion ignores an apply history invalidated by a later Plan edit but protects an executable undo', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag: originalTag } = await execute(harness, 'secretary_tag', { op: 'create', name: '仅在过去', kind: 'time' })
  const { tag: appliedTag } = await execute(harness, 'secretary_tag', { op: 'create', name: '仅在应用后', kind: 'time' })
  const { tag: editedTag } = await execute(harness, 'secretary_tag', { op: 'create', name: '后续编辑', kind: 'time' })
  await execute(harness, 'secretary_time', {
    op: 'plan.create', date: '2026-11-02', timeZone: 'Asia/Shanghai', timeTagId: originalTag.id,
    startAt: '2026-11-02T08:00:00+08:00', endAt: '2026-11-02T09:00:00+08:00',
  })
  const { block: template } = await execute(harness, 'secretary_time', {
    op: 'template.create', weekday: 1, startTime: '10:00', endTime: '11:00', timeTagId: appliedTag.id,
  })
  const applied = await execute(harness, 'secretary_time', {
    op: 'template.apply', weekday: 1, targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
  })
  await assert.rejects(execute(harness, 'secretary_tag', { op: 'delete', id: originalTag.id }), /referenced/,
    'an executable undo must still protect a before-only Tag')
  await execute(harness, 'secretary_time', { op: 'template.delete', id: template.id })
  await execute(harness, 'secretary_time', {
    op: 'plan.update', id: applied.blocks[0].id, timeTagId: editedTag.id,
  })
  await assert.rejects(execute(harness, 'secretary_time', {
    op: 'template.undo', targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
  }), /changed after template apply/)
  await execute(harness, 'secretary_tag', { op: 'delete', id: originalTag.id })
  await execute(harness, 'secretary_tag', { op: 'delete', id: appliedTag.id })
  assert.equal((await execute(harness, 'secretary_time', {
    op: 'plan.get', id: applied.blocks[0].id,
  })).block.timeTagId, editedTag.id)
})

test('GTD Completed and Actual start/stop remain independent facts', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const captured = await execute(harness, 'secretary_gtd', {
    op: 'inbox.capture', title: '整理评审材料', raw: '周五前准备好产品评审。', source: 'user_request',
  })
  const clarified = await execute(harness, 'secretary_gtd', {
    op: 'inbox.clarify', id: captured.item.id,
    project: { title: '产品评审', outcome: '评审材料完整。', type: 'sequential', tagIds: [tag.id] },
    action: { title: '整理评审材料', dueAt: '2026-10-30T17:00:00+08:00', estimatedMinutes: 60 },
  })
  assert.equal(clarified.action.availability, 'available')
  assert.equal((await execute(harness, 'secretary_gtd', { op: 'inbox.list' })).items.length, 0)

  const firstCycle = await execute(harness, 'secretary_time', {
    op: 'actual.start', timeTagId: tag.id, startAt: '2026-10-29T18:00:00+08:00', actualSource: 'user_reported',
  })
  await execute(harness, 'secretary_time', { op: 'actual.stop', id: firstCycle.block.id, endAt: '2026-10-29T18:10:00+08:00' })
  assert.equal((await execute(harness, 'secretary_gtd', { op: 'action.get', id: clarified.action.id })).action.status, 'active')
  const started = await execute(harness, 'secretary_time', {
    op: 'actual.start', timeTagId: tag.id, startAt: '2026-10-29T19:10:00+08:00',
    actualSource: 'user_reported', focus: 'deep', note: `Action ${clarified.action.id} 仅作备注提及`,
  })
  const completed = await execute(harness, 'secretary_gtd', {
    op: 'action.complete', id: clarified.action.id, completedAt: '2026-10-29T20:05:00+08:00',
  })
  assert.equal(completed.action.status, 'completed')
  const stillRunning = await execute(harness, 'secretary_time', { op: 'actual.get', id: started.block.id })
  assert.equal(stillRunning.block.endAt, undefined)
  assert.equal(stillRunning.block.actionId, undefined)

  const stopped = await execute(harness, 'secretary_time', {
    op: 'actual.stop', id: started.block.id, endAt: '2026-10-29T20:10:00+08:00',
  })
  assert.equal(stopped.block.endAt, '2026-10-29T20:10:00+08:00')
  const action = await execute(harness, 'secretary_gtd', { op: 'action.get', id: clarified.action.id })
  assert.equal(action.action.completedAt, '2026-10-29T20:05:00+08:00')
  assert.equal((await execute(harness, 'secretary_time', { op: 'actual.get', id: firstCycle.block.id })).block.endAt, '2026-10-29T18:10:00+08:00')
  assert.equal((await execute(harness, 'secretary_time', { op: 'actual.list' })).blocks.length, 2)
  assert.deepEqual(JSON.parse(JSON.stringify(stopped)), stopped)
})

test('Tag, Actual, and GTD facts reopen from the same SQLite file after a full shutdown', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-secretary-restart-'))
  const databasePath = join(directory, 'secretary.sqlite')
  t.after(async () => { await rm(directory, { recursive: true, force: true }) })

  const first = await sqliteHarness(t, databasePath)
  const { tag: root } = await execute(first, 'secretary_tag', { op: 'create', name: '工作', kind: 'time', color: '#477bc7' })
  const { tag: child } = await execute(first, 'secretary_tag', { op: 'create', name: '实现', parentId: root.id })
  const captured = await execute(first, 'secretary_gtd', {
    op: 'inbox.capture', title: '持久化验证', raw: '重启后继续处理持久化验证。', source: 'user_request',
  })
  const clarified = await execute(first, 'secretary_gtd', {
    op: 'inbox.clarify', id: captured.item.id,
    project: { title: '持久化项目', outcome: '重启后事实仍然存在。', type: 'sequential', tagIds: [root.id] },
    action: { title: '验证重启恢复', tagIds: [child.id], plannedAt: '2026-11-03T09:00:00+08:00' },
  })
  const { block: running } = await execute(first, 'secretary_time', {
    op: 'actual.start', timeTagId: child.id, startAt: '2026-11-02T09:00:00+08:00',
    actualSource: 'agent_observed', focus: 'deep',
  })
  const { block: stopped } = await execute(first, 'secretary_time', {
    op: 'actual.create', timeTagId: root.id, startAt: '2026-11-01T10:00:00+08:00',
    endAt: '2026-11-01T11:00:00+08:00', actualSource: 'user_reported', focus: 'shallow',
  })
  await first.close()

  const reopened = await sqliteHarness(t, databasePath)
  const action = await execute(reopened, 'secretary_gtd', { op: 'action.get', id: clarified.action.id })
  assert.equal(action.action.title, '验证重启恢复')
  assert.equal(action.action.plannedAt, '2026-11-03T09:00:00+08:00')
  assert.deepEqual(action.action.tagIds, [child.id])
  assert.deepEqual(new Set(action.action.effectiveTags), new Set([root.id, child.id]))
  const nextAction = await execute(reopened, 'secretary_gtd', { op: 'action.create', title: '重开后数字 ID', tagIds: [root.id] })
  assert.equal(nextAction.action.id, clarified.action.id + 1)
  const restoredChild = await execute(reopened, 'secretary_tag', { op: 'get', id: child.id })
  assert.equal(restoredChild.tag.parentId, root.id)
  assert.equal(restoredChild.tag.color, undefined)
  const restoredRunning = await execute(reopened, 'secretary_time', { op: 'actual.get', id: running.id })
  assert.equal(restoredRunning.block.endAt, undefined)
  assert.equal(restoredRunning.block.focus, 'deep')
  const restoredStopped = await execute(reopened, 'secretary_time', { op: 'actual.get', id: stopped.id })
  assert.equal(restoredStopped.block.focus, 'shallow')
  await assert.rejects(execute(reopened, 'secretary_tag', { op: 'delete', id: child.id }), /referenced/)
  const nextTag = await execute(reopened, 'secretary_tag', { op: 'create', name: '新标签', kind: 'context' })
  assert.equal(nextTag.tag.id, 3)
  const nextActual = await execute(reopened, 'secretary_time', {
    op: 'actual.create', timeTagId: root.id, startAt: '2026-11-03T10:00:00+08:00',
    endAt: '2026-11-03T11:00:00+08:00', actualSource: 'imported',
  })
  assert.equal(nextActual.block.id, 3)
})

test('one SQLite file restores Plan, Actual, PlanTemplate, DeepTime, and Tag together after a full restart', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-secretary-all-time-restart-'))
  const databasePath = join(directory, 'secretary.sqlite')
  t.after(async () => { await rm(directory, { recursive: true, force: true }) })
  const first = await sqliteHarness(t, databasePath)
  const { tag: root } = await execute(first, 'secretary_tag', { op: 'create', name: '生活', kind: 'time', color: '#477bc7' })
  const { tag: child } = await execute(first, 'secretary_tag', { op: 'create', name: '睡眠', parentId: root.id })
  const { block: plan } = await execute(first, 'secretary_time', {
    op: 'plan.create', date: '2026-11-02', timeZone: 'Asia/Shanghai', timeTagId: child.id,
    startAt: '2026-11-02T23:00:00+08:00', endAt: '2026-11-03T07:00:00+08:00', note: '同源计划',
  })
  const { block: actual } = await execute(first, 'secretary_time', {
    op: 'actual.create', timeTagId: child.id, startAt: '2026-11-01T23:00:00+08:00',
    endAt: '2026-11-02T06:30:00+08:00', actualSource: 'imported', focus: 'deep', note: '同源实录',
  })
  const { block: template } = await execute(first, 'secretary_time', {
    op: 'template.create', weekday: 1, startTime: '23:00', endTime: '07:00', timeTagId: child.id, note: '同源模板',
  })
  await execute(first, 'secretary_time', { op: 'deep.setCell', weekStart: '2026-11-02', weekday: 1, hour: 23, level: 'low' })
  await first.close()

  const reopened = await sqliteHarness(t, databasePath)
  assert.equal(reopened.databasePath, databasePath)
  assert.deepEqual((await execute(reopened, 'secretary_time', { op: 'plan.get', id: plan.id })).block, plan)
  assert.deepEqual((await execute(reopened, 'secretary_time', { op: 'actual.get', id: actual.id })).block, actual)
  assert.deepEqual((await execute(reopened, 'secretary_time', { op: 'template.list' })).blocks, [template])
  const restoredDeep = (await execute(reopened, 'secretary_time', { op: 'deep.getWeek', weekStart: '2026-11-02' })).week
  assert.equal(restoredDeep.source, 'own')
  assert.deepEqual(restoredDeep.cells.filter(cell => cell.level !== 'unset'), [{ weekday: 1, hour: 23, level: 'low' }])
  assert.deepEqual((await execute(reopened, 'secretary_tag', { op: 'get', id: child.id })).tag, child)
  assert.equal((await execute(reopened, 'secretary_tag', { op: 'get', id: root.id })).tag.color, '#477bc7')
})

test('deep.getWeek normalizes any date to Monday and returns an unset seed for an empty store', async (t) => {
  const harness = await sqliteHarness(t)
  const { week } = await execute(harness, 'secretary_time', { op: 'deep.getWeek', weekStart: '2026-11-08' })
  assert.equal(week.weekStart, '2026-11-02')
  assert.equal(week.source, 'seed')
  assert.equal(week.scope, undefined)
  assert.equal(week.cells.length, 168)
  assert.deepEqual(week.cells[0], { weekday: 1, hour: 0, level: 'unset' })
  assert.deepEqual(week.cells[167], { weekday: 7, hour: 23, level: 'unset' })
  assert.ok(week.cells.every(cell => cell.level === 'unset'))
  assert.deepEqual(JSON.parse(JSON.stringify(week)), week)
})

test('deep.setCell writes one own week and restores it after a full SQLite restart', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-secretary-deep-cell-'))
  const databasePath = join(directory, 'secretary.sqlite')
  t.after(async () => { await rm(directory, { recursive: true, force: true }) })
  const first = await sqliteHarness(t, databasePath)
  const { week } = await execute(first, 'secretary_time', {
    op: 'deep.setCell', weekStart: '2026-11-04', weekday: 2, hour: 9, level: 'high',
  })
  assert.equal(week.weekStart, '2026-11-02')
  assert.equal(week.source, 'own')
  assert.deepEqual(week.cells.find(cell => cell.weekday === 2 && cell.hour === 9), { weekday: 2, hour: 9, level: 'high' })
  assert.equal(week.cells.filter(cell => cell.level !== 'unset').length, 1)
  await first.close()

  const reopened = await sqliteHarness(t, databasePath)
  const restored = await execute(reopened, 'secretary_time', { op: 'deep.getWeek', weekStart: '2026-11-02' })
  assert.equal(restored.week.weekStart, '2026-11-02')
  assert.equal(restored.week.source, 'own')
  assert.deepEqual(restored.week.cells.find(cell => cell.weekday === 2 && cell.hour === 9), { weekday: 2, hour: 9, level: 'high' })
  assert.equal(restored.week.cells.filter(cell => cell.level !== 'unset').length, 1)
})

test('deep weeks inherit only the nearest earlier own week without changing adjacent or earlier weeks', async (t) => {
  const harness = await sqliteHarness(t)
  const first = (await execute(harness, 'secretary_time', {
    op: 'deep.setCell', weekStart: '2026-11-02', weekday: 1, hour: 9, level: 'high',
  })).week
  const later = (await execute(harness, 'secretary_time', {
    op: 'deep.setCell', weekStart: '2026-11-16', weekday: 2, hour: 10, level: 'medium',
  })).week
  assert.equal(later.source, 'own')
  assert.deepEqual(later.cells.filter(cell => cell.level !== 'unset'), [
    { weekday: 1, hour: 9, level: 'high' }, { weekday: 2, hour: 10, level: 'medium' },
  ], 'a new own week starts from the nearest inherited cells')

  const inherited = (await execute(harness, 'secretary_time', {
    op: 'deep.getWeek', weekStart: '2026-11-12',
  })).week
  assert.equal(inherited.weekStart, '2026-11-09')
  assert.equal(inherited.source, 'inherited')
  assert.deepEqual(inherited.cells, first.cells)
  const nearest = (await execute(harness, 'secretary_time', {
    op: 'deep.getWeek', weekStart: '2026-11-23',
  })).week
  assert.equal(nearest.source, 'inherited')
  assert.deepEqual(nearest.cells, later.cells)

  const earlier = (await execute(harness, 'secretary_time', {
    op: 'deep.getWeek', weekStart: '2026-10-26',
  })).week
  assert.equal(earlier.source, 'seed')
  assert.ok(earlier.cells.every(cell => cell.level === 'unset'))
  assert.deepEqual((await execute(harness, 'secretary_time', {
    op: 'deep.getWeek', weekStart: '2026-11-02',
  })).week, first, 'writing a later week must not rewrite an earlier own week')
})

test('deep inheritance looks back 52 weeks but no further', async (t) => {
  const harness = await sqliteHarness(t)
  await execute(harness, 'secretary_time', {
    op: 'deep.setCell', weekStart: '2024-11-04', weekday: 1, hour: 9, level: 'high',
  })
  const atLimit = (await execute(harness, 'secretary_time', {
    op: 'deep.getWeek', weekStart: '2025-11-03',
  })).week
  assert.equal(atLimit.source, 'inherited')
  assert.equal(atLimit.cells[9].level, 'high')
  const beyondLimit = (await execute(harness, 'secretary_time', {
    op: 'deep.getWeek', weekStart: '2025-11-10',
  })).week
  assert.equal(beyondLimit.source, 'seed')
  assert.ok(beyondLimit.cells.every(cell => cell.level === 'unset'))
})

test('deep.clearCell returns only the selected cell to unset without turning it into low', async (t) => {
  const harness = await sqliteHarness(t)
  await execute(harness, 'secretary_time', { op: 'deep.setCell', weekStart: '2026-11-02', weekday: 1, hour: 8, level: 'low' })
  await execute(harness, 'secretary_time', { op: 'deep.setCell', weekStart: '2026-11-02', weekday: 1, hour: 9, level: 'high' })
  const { week } = await execute(harness, 'secretary_time', { op: 'deep.clearCell', weekStart: '2026-11-02', weekday: 1, hour: 8 })
  assert.deepEqual(week.cells.find(cell => cell.weekday === 1 && cell.hour === 8), { weekday: 1, hour: 8, level: 'unset' })
  assert.deepEqual(week.cells.find(cell => cell.weekday === 1 && cell.hour === 9), { weekday: 1, hour: 9, level: 'high' })
  assert.notEqual(week.cells.find(cell => cell.weekday === 1 && cell.hour === 8).level, 'low')
})

test('deep.setRange writes an inclusive weekday-by-hour rectangle in one own-week update', async (t) => {
  const harness = await sqliteHarness(t)
  const { week } = await execute(harness, 'secretary_time', {
    op: 'deep.setRange', weekStart: '2026-11-02', startWeekday: 1, startHour: 9, endWeekday: 2, endHour: 10, level: 'medium',
  })
  const changed = week.cells.filter(cell => cell.level !== 'unset')
  assert.deepEqual(changed, [
    { weekday: 1, hour: 9, level: 'medium' },
    { weekday: 1, hour: 10, level: 'medium' },
    { weekday: 2, hour: 9, level: 'medium' },
    { weekday: 2, hour: 10, level: 'medium' },
  ])
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'deep.getWeek', weekStart: '2026-11-02' })).week, week)
})

test('deep.clearRange clears an inclusive rectangle while preserving cells outside it', async (t) => {
  const harness = await sqliteHarness(t)
  await execute(harness, 'secretary_time', {
    op: 'deep.setRange', weekStart: '2026-11-02', startWeekday: 3, startHour: 13, endWeekday: 4, endHour: 15, level: 'low',
  })
  const { week } = await execute(harness, 'secretary_time', {
    op: 'deep.clearRange', weekStart: '2026-11-02', startWeekday: 3, startHour: 14, endWeekday: 4, endHour: 14,
  })
  assert.deepEqual(week.cells.filter(cell => cell.level === 'low').map(cell => [cell.weekday, cell.hour]), [
    [3, 13], [3, 15], [4, 13], [4, 15],
  ])
  assert.equal(week.cells.find(cell => cell.weekday === 3 && cell.hour === 14).level, 'unset')
  assert.equal(week.cells.find(cell => cell.weekday === 4 && cell.hour === 14).level, 'unset')
})

test('deep public tools reject invalid levels, coordinates, and reversed ranges without overwriting the week', async (t) => {
  const harness = await sqliteHarness(t)
  await execute(harness, 'secretary_time', { op: 'deep.setCell', weekStart: '2026-11-02', weekday: 1, hour: 9, level: 'high' })
  const invalid = [
    { op: 'deep.getWeek' },
    { op: 'deep.getWeek', weekStart: '2026-02-31' },
    { op: 'deep.getWeek', weekStart: '11/02/2026' },
    { op: 'deep.setCell', weekStart: '2026-11-02', weekday: 0, hour: 9, level: 'high' },
    { op: 'deep.setCell', weekStart: '2026-11-02', weekday: 8, hour: 9, level: 'high' },
    { op: 'deep.setCell', weekStart: '2026-11-02', weekday: 1.5, hour: 9, level: 'high' },
    { op: 'deep.setCell', weekStart: '2026-11-02', weekday: 1, hour: -1, level: 'high' },
    { op: 'deep.setCell', weekStart: '2026-11-02', weekday: 1, hour: 24, level: 'high' },
    { op: 'deep.setCell', weekStart: '2026-11-02', weekday: 1, hour: 9.5, level: 'high' },
    { op: 'deep.setCell', weekStart: '2026-11-02', weekday: 1, hour: 9, level: 'unset' },
    { op: 'deep.setCell', weekStart: '2026-11-02', weekday: 1, hour: 9, level: 'flow' },
    { op: 'deep.clearCell', weekStart: '2026-11-02', weekday: 7.1, hour: 9 },
    { op: 'deep.clearCell', weekStart: '2026-11-02', weekday: 7, hour: 23.1 },
    { op: 'deep.setRange', weekStart: '2026-11-02', startWeekday: 2, startHour: 9, endWeekday: 1, endHour: 10, level: 'low' },
    { op: 'deep.setRange', weekStart: '2026-11-02', startWeekday: 1, startHour: 11, endWeekday: 2, endHour: 10, level: 'low' },
    { op: 'deep.clearRange', weekStart: '2026-11-02', startWeekday: 1, startHour: 9, endWeekday: 8, endHour: 10 },
    { op: 'deep.clearRange', weekStart: '2026-11-02', startWeekday: 1, startHour: 9, endWeekday: 2, endHour: 24 },
  ]
  for (const args of invalid) {
    await assert.rejects(execute(harness, 'secretary_time', args), /weekday|hour|deep level|deep range|weekStart|date/)
  }
  const { week } = await execute(harness, 'secretary_time', { op: 'deep.getWeek', weekStart: '2026-11-02' })
  assert.deepEqual(week.cells.filter(cell => cell.level !== 'unset'), [{ weekday: 1, hour: 9, level: 'high' }])
  const tool = harness.tools.get('secretary_time')
  assert.deepEqual(tool.parameters.properties.level.enum, ['high', 'medium', 'low'])
  assert.equal(tool.parameters.properties.weekday.minimum, 1)
  assert.equal(tool.parameters.properties.weekday.maximum, 7)
  assert.equal(tool.parameters.properties.hour.minimum, 0)
  assert.equal(tool.parameters.properties.hour.maximum, 23)
  assert.equal(tool.parameters.properties.weekStart.type, 'string')
})

test('deep weekly templates and Actual facts never derive from or rewrite each other', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const { block: actual } = await execute(harness, 'secretary_time', {
    op: 'actual.create', timeTagId: tag.id, startAt: '2026-11-02T09:00:00+08:00',
    endAt: '2026-11-02T11:00:00+08:00', actualSource: 'user_reported', focus: 'deep', note: '实录保持原样',
  })
  assert.ok((await execute(harness, 'secretary_time', { op: 'deep.getWeek', weekStart: '2026-11-02' })).week.cells.every(cell => cell.level === 'unset'))
  await execute(harness, 'secretary_time', {
    op: 'deep.setRange', weekStart: '2026-11-02', startWeekday: 1, startHour: 9, endWeekday: 1, endHour: 10, level: 'high',
  })
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'actual.get', id: actual.id })).block, actual)
  const { block: later } = await execute(harness, 'secretary_time', {
    op: 'actual.create', timeTagId: tag.id, startAt: '2026-11-03T14:00:00+08:00',
    endAt: '2026-11-03T15:00:00+08:00', actualSource: 'agent_observed', focus: 'shallow',
  })
  const { week } = await execute(harness, 'secretary_time', { op: 'deep.getWeek', weekStart: '2026-11-02' })
  assert.deepEqual(week.cells.filter(cell => cell.level !== 'unset'), [
    { weekday: 1, hour: 9, level: 'high' }, { weekday: 1, hour: 10, level: 'high' },
  ])
  assert.equal((await execute(harness, 'secretary_time', { op: 'actual.get', id: later.id })).block.focus, 'shallow')
})

test('Time tool exposes only the new Plan/Template/Actual/DeepTime model and rejects invalid intervals without overwriting facts', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const { block } = await execute(harness, 'secretary_time', {
    op: 'actual.create', timeTagId: tag.id, startAt: '2026-10-29T09:00:00+08:00',
    endAt: '2026-10-29T10:00:00+08:00', actualSource: 'user_reported', focus: 'deep',
  })
  await assert.rejects(
    execute(harness, 'secretary_time', {
      op: 'actual.update', id: block.id, startAt: '2026-10-29T11:00:00+08:00',
    }),
    /endAt must be after startAt/,
  )
  assert.equal((await execute(harness, 'secretary_time', { op: 'actual.get', id: block.id })).block.startAt, '2026-10-29T09:00:00+08:00')

  const tool = harness.tools.get('secretary_time')
  assert.deepEqual(tool.parameters.properties.focus.anyOf[0].enum, ['deep', 'shallow'])
  for (const field of ['actionId', 'planned', 'actual', 'use', 'gtdRefs', 'preparationReminderId']) {
    assert.equal(tool.parameters.properties[field], undefined)
  }
  assert.ok(!tool.parameters.properties.op.enum.includes('record_actual'))
  assert.ok(tool.parameters.properties.op.enum.includes('actual.start'))
  assert.ok(tool.parameters.properties.op.enum.includes('actual.stop'))
  for (const op of [
    'plan.list', 'plan.get', 'plan.create', 'plan.update', 'plan.delete',
    'template.list', 'template.create', 'template.update', 'template.delete', 'template.apply', 'template.undo',
    'deep.getWeek', 'deep.setCell', 'deep.clearCell', 'deep.setRange', 'deep.clearRange',
  ]) assert.ok(tool.parameters.properties.op.enum.includes(op), `missing public operation ${op}`)
  assert.equal(tool.parameters.properties.id.type, 'integer')
  assert.equal(tool.parameters.properties.timeTagId.type, 'integer')
  assert.equal(tool.parameters.properties.weekday.type, 'integer')
})


test('Actual date and range queries include overnight intervals and reject invalid calendar dates', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '通勤', kind: 'time' })
  const { block } = await execute(harness, 'secretary_time', {
    op: 'actual.create', timeTagId: tag.id, startAt: '2026-11-02T23:30:00+08:00',
    endAt: '2026-11-03T00:30:00+08:00', actualSource: 'user_reported',
  })
  for (const date of ['2026-11-02', '2026-11-03']) {
    const result = await execute(harness, 'secretary_time', { op: 'actual.list', date, timeZone: 'Asia/Shanghai' })
    assert.deepEqual(result.blocks.map(item => item.id), [block.id])
  }
  const range = await execute(harness, 'secretary_time', {
    op: 'actual.list', from: '2026-11-03T00:00:00+08:00', to: '2026-11-03T01:00:00+08:00',
  })
  assert.deepEqual(range.blocks.map(item => item.id), [block.id])
  await assert.rejects(
    execute(harness, 'secretary_time', { op: 'actual.list', date: '2026-02-31', timeZone: 'Asia/Shanghai' }),
    /invalid date/,
  )
})

test('Time product readWindow returns only the three Time modules and Tags from real SQLite', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const product = harness.ctx.get('timeProduct')
  assert.ok(product, 'TimeProductService must be registered as timeProduct')
  const window = await product.readWindow({ anchor: '2026-11-02', timeZone: 'Asia/Shanghai' })
  assert.equal(window.from, '2026-10-30')
  assert.equal(window.to, '2026-11-12')
  assert.equal(window.weekStart, '2026-11-02')
  assert.equal(window.days.length, 14)
  assert.deepEqual(window.tags.map(item => item.id), [tag.id])
  assert.deepEqual(window.actual, [])
  assert.deepEqual(window.plan, [])
  assert.equal(window.deep.cells.length, 168)
  for (const key of ['inbox', 'projects', 'actions', 'nextActions', 'forecast', 'warnings']) {
    assert.equal(key in window, false, `Time window must not expose ${key}`)
  }
})

test('Time product paint writes one ActualBlock through TimeService into the same SQLite facts', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: 'Remote 工作', kind: 'time' })
  const product = harness.ctx.get('timeProduct')
  assert.ok(product)
  assert.deepEqual(await product.paint({
    layer: 'actual', tagId: tag.id, timeZone: 'Asia/Shanghai',
    runs: [{ date: '2026-11-02', start: 480, end: 540 }],
  }), { ok: true })
  const fromTool = await execute(harness, 'secretary_time', {
    op: 'actual.list', date: '2026-11-02', timeZone: 'Asia/Shanghai',
  })
  assert.deepEqual(fromTool.blocks.map(block => [block.startAt, block.endAt, block.timeTagId]), [
    ['2026-11-02T00:00:00.000Z', '2026-11-02T01:00:00.000Z', tag.id],
  ])
  const window = await product.readWindow({ anchor: '2026-11-02', timeZone: 'Asia/Shanghai' })
  assert.deepEqual(window.actual, fromTool.blocks)
})

test('Time product paint rejects missing and context Tags without deleting existing SQLite facts', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag: time } = await execute(harness, 'secretary_tag', { op: 'create', name: '时间', kind: 'time' })
  const { tag: context } = await execute(harness, 'secretary_tag', { op: 'create', name: '地点', kind: 'context' })
  const product = harness.ctx.get('timeProduct')
  assert.ok(product)

  for (const layer of ['actual', 'plan']) {
    await product.paint({
      layer, tagId: time.id, timeZone: 'Asia/Shanghai',
      runs: [{ date: '2026-11-02', start: 480, end: 600 }],
    })
    const before = (await product.readWindow({
      anchor: '2026-11-02', timeZone: 'Asia/Shanghai', from: '2026-11-02', to: '2026-11-02',
    }))[layer]
    assert.equal(before.length, 1)
    for (const tagId of [999999, context.id]) {
      await assert.rejects(product.paint({
        layer, tagId, timeZone: 'Asia/Shanghai',
        runs: [{ date: '2026-11-02', start: 500, end: 540 }],
      }), error => {
        assert.equal(error.code, 'secretaryTime/invalid-input')
        assert.deepEqual(error.details, { operation: 'paint' })
        return true
      })
      const read = await product.readWindow({
        anchor: '2026-11-02', timeZone: 'Asia/Shanghai', from: '2026-11-02', to: '2026-11-02',
      })
      assert.deepEqual(read[layer], before, `${layer} paint with Tag ${tagId} must leave SQLite unchanged`)
    }
    await assert.rejects(product.paint({ layer, tagId: 999999, timeZone: 'Asia/Shanghai', runs: [] }), error => {
      assert.equal(error.code, 'secretaryTime/invalid-input')
      return true
    })
    const after = await product.readWindow({
      anchor: '2026-11-02', timeZone: 'Asia/Shanghai', from: '2026-11-02', to: '2026-11-02',
    })
    assert.deepEqual(after[layer], before)
  }
})

test('Time product paint cuts, overwrites, merges, erases, and keeps Plan independent from Actual', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag: work } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const { tag: life } = await execute(harness, 'secretary_tag', { op: 'create', name: '生活', kind: 'time' })
  const product = harness.ctx.get('timeProduct')
  assert.ok(product)
  const paint = (layer, tagId, runs) => product.paint({ layer, tagId, runs, timeZone: 'Asia/Shanghai' })
  const read = () => product.readWindow({ anchor: '2026-11-02', timeZone: 'Asia/Shanghai', from: '2026-11-02', to: '2026-11-03' })
  const spans = blocks => blocks.map(block => [block.startAt, block.endAt, block.timeTagId])

  await paint('actual', work.id, [{ date: '2026-11-02', start: 480, end: 600 }])
  await paint('actual', life.id, [{ date: '2026-11-02', start: 500, end: 510 }])
  assert.deepEqual(spans((await read()).actual), [
    ['2026-11-02T00:00:00.000Z', '2026-11-02T00:20:00.000Z', work.id],
    ['2026-11-02T00:20:00.000Z', '2026-11-02T00:30:00.000Z', life.id],
    ['2026-11-02T00:30:00.000Z', '2026-11-02T02:00:00.000Z', work.id],
  ])
  await paint('actual', work.id, [{ date: '2026-11-02', start: 500, end: 510 }])
  assert.deepEqual(spans((await read()).actual), [
    ['2026-11-02T00:00:00.000Z', '2026-11-02T02:00:00.000Z', work.id],
  ], 'adjacent identical pieces merge back into one ActualBlock')
  await paint('actual', null, [{ date: '2026-11-02', start: 540, end: 570 }])
  assert.deepEqual(spans((await read()).actual), [
    ['2026-11-02T00:00:00.000Z', '2026-11-02T01:00:00.000Z', work.id],
    ['2026-11-02T01:30:00.000Z', '2026-11-02T02:00:00.000Z', work.id],
  ])
  await paint('plan', work.id, [{ date: '2026-11-03', start: 540, end: 600 }])
  const both = await read()
  assert.equal(both.actual.length, 2)
  assert.deepEqual(spans(both.plan), [['2026-11-03T01:00:00.000Z', '2026-11-03T02:00:00.000Z', work.id]])
})

test('Time product paintDeep preserves inclusive rectangles, ordered writes, and week inheritance', async (t) => {
  const harness = await sqliteHarness(t)
  await eventually(() => assert.ok(harness.ctx.get('timeProduct')))
  const product = harness.ctx.get('timeProduct')
  const painted = await product.paintDeep({
    weekStart: '2026-11-03', level: 'medium',
    rects: [
      { startWeekday: 1, startHour: 9, endWeekday: 2, endHour: 10 },
      { startWeekday: 4, startHour: 20, endWeekday: 4, endHour: 20 },
    ],
  })
  assert.equal(painted.week.weekStart, '2026-11-02', 'a midweek request is normalized to Monday')
  assert.equal(painted.week.source, 'own')
  assert.equal(painted.week.cells.filter(cell => cell.level === 'medium').length, 5)
  assert.equal(painted.week.cells.find(cell => cell.weekday === 1 && cell.hour === 9).level, 'medium')
  assert.equal(painted.week.cells.find(cell => cell.weekday === 2 && cell.hour === 10).level, 'medium')
  assert.equal(painted.week.cells.find(cell => cell.weekday === 4 && cell.hour === 20).level, 'medium')
  const next = await product.readWindow({ anchor: '2026-11-09', weekStart: '2026-11-09', timeZone: 'Asia/Shanghai' })
  assert.equal(next.deep.source, 'inherited')
  assert.equal(next.deep.cells.filter(cell => cell.level === 'medium').length, 5)
  const cleared = await product.paintDeep({
    weekStart: '2026-11-02', level: null,
    rects: [{ startWeekday: 2, startHour: 10, endWeekday: 2, endHour: 10 }],
  })
  assert.equal(cleared.week.cells.find(cell => cell.weekday === 2 && cell.hour === 10).level, 'unset')
  assert.equal(cleared.week.cells.filter(cell => cell.level === 'medium').length, 4)
})

test('Time product rejects invalid replace, update, delete, and deep inputs before any SQLite write', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '校验', kind: 'time' })
  const product = harness.ctx.get('timeProduct')
  const cases = [
    ['replaceDay', { layer: 'actual', date: '2026-11-02', timeZone: 'Asia/Shanghai', intervals: [{ start: 600, end: 600, timeTagId: tag.id }] }],
    ['updateBlock', { layer: 'actual', id: 0, note: '不应写入' }],
    ['deleteBlock', { layer: 'plan', id: -1 }],
    ['paintDeep', { weekStart: '2026-11-02', level: 'high', rects: [{ startWeekday: 1, startHour: 10, endWeekday: 1, endHour: 9 }] }],
  ]
  for (const [method, input] of cases) {
    await assert.rejects(product[method](input), error => {
      assert.equal(error.code, 'secretaryTime/invalid-input', `${method}: ${error.message}`)
      assert.deepEqual(error.details, { operation: method })
      return true
    })
  }
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'actual.list' })).blocks, [])
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'plan.list' })).blocks, [])
  const deep = await execute(harness, 'secretary_time', { op: 'deep.getWeek', weekStart: '2026-11-02' })
  assert.equal(deep.week.source, 'seed')
  assert.equal(deep.week.cells.filter(cell => cell.level !== 'unset').length, 0)
})

test('Time product deleteBlock deletes only the requested layer and reports missing ids', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const actual = await execute(harness, 'secretary_time', {
    op: 'actual.create', timeTagId: tag.id, actualSource: 'user_reported',
    startAt: '2026-11-02T08:00:00+08:00', endAt: '2026-11-02T09:00:00+08:00',
  })
  const plan = await execute(harness, 'secretary_time', {
    op: 'plan.create', date: '2026-11-02', timeZone: 'Asia/Shanghai', timeTagId: tag.id,
    startAt: '2026-11-02T10:00:00+08:00', endAt: '2026-11-02T11:00:00+08:00',
  })
  const product = harness.ctx.get('timeProduct')
  const deleted = await product.deleteBlock({ layer: 'actual', id: actual.block.id })
  assert.equal(deleted.ok, true)
  assert.equal(deleted.block.id, actual.block.id)
  assert.equal((await execute(harness, 'secretary_time', { op: 'plan.get', id: plan.block.id })).block.id, plan.block.id)
  await assert.rejects(product.deleteBlock({ layer: 'actual', id: actual.block.id }), error => {
    assert.equal(error.code, 'secretaryTime/not-found')
    assert.deepEqual(error.details, { blockId: actual.block.id })
    return true
  })
  assert.equal((await product.deleteBlock({ layer: 'plan', id: plan.block.id })).block.id, plan.block.id)
})

test('Time product updateBlock edits Actual and Plan through their existing Service behavior', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag: work } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const { tag: life } = await execute(harness, 'secretary_tag', { op: 'create', name: '生活', kind: 'time' })
  const actual = await execute(harness, 'secretary_time', {
    op: 'actual.create', timeTagId: work.id, actualSource: 'agent_observed', focus: 'deep', note: '原备注',
    startAt: '2026-11-02T08:00:00+08:00', endAt: '2026-11-02T09:00:00+08:00',
  })
  const plan = await execute(harness, 'secretary_time', {
    op: 'plan.create', date: '2026-11-02', timeZone: 'Asia/Shanghai', timeTagId: work.id, note: '计划备注',
    startAt: '2026-11-02T10:00:00+08:00', endAt: '2026-11-02T11:00:00+08:00',
  })
  const product = harness.ctx.get('timeProduct')
  const actualResult = await product.updateBlock({
    layer: 'actual', id: actual.block.id, timeTagId: life.id, note: null,
    startAt: '2026-11-02T08:10:00+08:00', endAt: '2026-11-02T09:20:00+08:00',
  })
  assert.equal(actualResult.block.timeTagId, life.id)
  assert.equal(actualResult.block.note, undefined)
  assert.equal(actualResult.block.actualSource, 'agent_observed')
  assert.equal(actualResult.block.focus, 'deep')
  assert.equal(actualResult.block.startAt, '2026-11-02T08:10:00+08:00')
  assert.equal(actualResult.block.endAt, '2026-11-02T09:20:00+08:00')
  const planResult = await product.updateBlock({ layer: 'plan', id: plan.block.id, note: null })
  assert.equal(planResult.block.note, undefined)
  assert.equal(planResult.block.timeTagId, work.id)
  await assert.rejects(product.updateBlock({ layer: 'actual', id: 9999, note: '不存在' }), error => {
    assert.equal(error.code, 'secretaryTime/not-found')
    assert.deepEqual(error.details, { blockId: 9999 })
    return true
  })
})

test('Time product replaceDay restores a clipped day snapshot without changing the other layer', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag: work } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const { tag: life } = await execute(harness, 'secretary_tag', { op: 'create', name: '生活', kind: 'time' })
  const product = harness.ctx.get('timeProduct')
  assert.ok(product)
  await product.paint({
    layer: 'actual', tagId: work.id, timeZone: 'Asia/Shanghai',
    runs: [{ date: '2026-11-02', start: 480, end: 600 }],
  })
  await product.paint({
    layer: 'plan', tagId: life.id, timeZone: 'Asia/Shanghai',
    runs: [{ date: '2026-11-02', start: 540, end: 570 }],
  })
  assert.deepEqual(await product.replaceDay({
    layer: 'actual', date: '2026-11-02', timeZone: 'Asia/Shanghai',
    intervals: [{ start: 500, end: 550, timeTagId: life.id, note: '撤销快照' }],
  }), { ok: true })
  const actual = await execute(harness, 'secretary_time', {
    op: 'actual.list', date: '2026-11-02', timeZone: 'Asia/Shanghai',
  })
  assert.deepEqual(actual.blocks.map(block => [block.startAt, block.endAt, block.timeTagId, block.note, block.actualSource]), [
    ['2026-11-02T00:20:00.000Z', '2026-11-02T01:10:00.000Z', life.id, '撤销快照', 'user_reported'],
  ])
  const plan = await execute(harness, 'secretary_time', {
    op: 'plan.list', date: '2026-11-02', timeZone: 'Asia/Shanghai',
  })
  assert.equal(plan.blocks.length, 1, 'replaceDay only replaces its selected layer')
})

test('Time product replaceDay prevalidates every Tag before deleting existing SQLite facts', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag: time } = await execute(harness, 'secretary_tag', { op: 'create', name: '时间', kind: 'time' })
  const { tag: context } = await execute(harness, 'secretary_tag', { op: 'create', name: '地点', kind: 'context' })
  const product = harness.ctx.get('timeProduct')
  assert.ok(product)

  for (const layer of ['actual', 'plan']) {
    await product.paint({
      layer, tagId: time.id, timeZone: 'Asia/Shanghai',
      runs: [{ date: '2026-11-02', start: 480, end: 600 }],
    })
    const before = (await product.readWindow({
      anchor: '2026-11-02', timeZone: 'Asia/Shanghai', from: '2026-11-02', to: '2026-11-02',
    }))[layer]
    assert.equal(before.length, 1)
    for (const tagId of [999999, context.id]) {
      await assert.rejects(product.replaceDay({
        layer, date: '2026-11-02', timeZone: 'Asia/Shanghai',
        intervals: [
          { start: 480, end: 540, timeTagId: time.id, note: '前置合法快照' },
          { start: 540, end: 600, timeTagId: tagId, note: '非法引用不得写入' },
        ],
      }), error => {
        assert.equal(error.code, 'secretaryTime/invalid-input')
        assert.deepEqual(error.details, { operation: 'replaceDay' })
        return true
      })
      const read = await product.readWindow({
        anchor: '2026-11-02', timeZone: 'Asia/Shanghai', from: '2026-11-02', to: '2026-11-02',
      })
      assert.deepEqual(read[layer], before, `${layer} replaceDay with Tag ${tagId} must leave SQLite unchanged`)
    }
  }
})

test('Time product paint maps a real SQLite write failure to write-failed with only safe operation details', async (t) => {
  const harness = await sqliteHarness(t, undefined, {})
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '故障写入', kind: 'time' })
  const product = harness.ctx.get('timeProduct')
  assert.ok(product)
  harness.failNextWrite('actual_blocks')
  await assert.rejects(product.paint({
    layer: 'actual', tagId: tag.id, timeZone: 'Asia/Shanghai',
    runs: [{ date: '2026-11-02', start: 480, end: 540 }],
  }), error => {
    assert.equal(error.code, 'secretaryTime/write-failed')
    assert.deepEqual(error.details, { operation: 'paint' })
    assert.equal(error.message.includes('injected put failure'), false)
    assert.equal(error.cause.message, 'injected put failure on actual_blocks')
    return true
  })
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'actual.list' })).blocks, [])
})

test('Time product paint preserves not-found when a concurrent erase wins the real Service write queue', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '并发擦除', kind: 'time' })
  await execute(harness, 'secretary_time', {
    op: 'actual.create', timeTagId: tag.id, actualSource: 'user_reported',
    startAt: '2026-11-02T08:00:00+08:00', endAt: '2026-11-02T09:00:00+08:00',
  })
  const product = harness.ctx.get('timeProduct')
  assert.ok(product)
  const input = {
    layer: 'actual', tagId: null, timeZone: 'Asia/Shanghai',
    runs: [{ date: '2026-11-02', start: 480, end: 540 }],
  }
  const outcomes = await Promise.allSettled([product.paint(input), product.paint(input)])
  const missing = outcomes.find(outcome => outcome.status === 'rejected' && outcome.reason.code === 'secretaryTime/not-found')
  assert.ok(missing, JSON.stringify(outcomes.map(outcome => outcome.status === 'rejected' ? outcome.reason : outcome.value)))
  assert.deepEqual(missing.reason.details, { blockId: 1 })
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'actual.list' })).blocks, [])
})

test('Time product replaceDay keeps legacy partial-write semantics and safe failure details', async (t) => {
  const harness = await sqliteHarness(t, undefined, {})
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: 'Undo 故障', kind: 'time' })
  await execute(harness, 'secretary_time', {
    op: 'actual.create', timeTagId: tag.id, actualSource: 'user_reported',
    startAt: '2026-11-02T08:00:00+08:00', endAt: '2026-11-02T09:00:00+08:00',
  })
  const product = harness.ctx.get('timeProduct')
  harness.failNextWrite('actual_blocks', 2)
  await assert.rejects(product.replaceDay({
    layer: 'actual', date: '2026-11-02', timeZone: 'Asia/Shanghai',
    intervals: [{ start: 480, end: 540, timeTagId: tag.id, note: '恢复快照' }],
  }), error => {
    assert.equal(error.code, 'secretaryTime/write-failed')
    assert.deepEqual(error.details, { operation: 'replaceDay' })
    assert.equal(error.message.includes('injected delete'), false)
    assert.match(error.cause.message, /injected put failure/)
    return true
  })
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'actual.list' })).blocks, [],
    'the old multi-call delete then recreate flow has no new transaction guarantee')
})

test('Time product paintDeep maps an ordered mid-batch SQLite failure without hiding its cause in Host', async (t) => {
  const harness = await sqliteHarness(t, undefined, {})
  await eventually(() => assert.ok(harness.ctx.get('timeProduct')))
  const product = harness.ctx.get('timeProduct')
  harness.failNextWrite('deep_templates', 2)
  await assert.rejects(product.paintDeep({
    weekStart: '2026-11-02', level: 'low',
    rects: [
      { startWeekday: 1, startHour: 9, endWeekday: 1, endHour: 9 },
      { startWeekday: 2, startHour: 10, endWeekday: 2, endHour: 10 },
    ],
  }), error => {
    assert.equal(error.code, 'secretaryTime/write-failed')
    assert.deepEqual(error.details, { operation: 'paintDeep' })
    assert.equal(error.message.includes('injected put failure'), false)
    assert.match(error.cause.message, /injected put failure on deep_templates/)
    return true
  })
  const stored = await execute(harness, 'secretary_time', { op: 'deep.getWeek', weekStart: '2026-11-02' })
  assert.equal(stored.week.cells.find(cell => cell.weekday === 1 && cell.hour === 9).level, 'low')
  assert.equal(stored.week.cells.find(cell => cell.weekday === 2 && cell.hour === 10).level, 'unset')
})

test('Time product readWindow returns the default window and requested deep week through the same TimeService', async (t) => {
  const harness = await sqliteHarness(t)
  await eventually(() => assert.ok(harness.ctx.get('timeProduct')))
  const product = harness.ctx.get('timeProduct')
  assert.ok(product)
  const state = (weekStart = '2026-11-02') => product.readWindow({
    anchor: '2026-11-02', timeZone: 'Asia/Shanghai', weekStart,
  })

  const initial = await state()
  assert.equal(initial.weekStart, '2026-11-02')
  assert.equal(initial.deep.weekStart, '2026-11-02')
  assert.equal(initial.deep.source, 'seed')
  assert.deepEqual(initial.days, [
    '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05',
    '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12',
  ], 'the default window starts three days before the anchor and runs ten days after it')

  await product.paintDeep({
    weekStart: '2026-11-02', level: 'medium',
    rects: [{ startWeekday: 1, startHour: 9, endWeekday: 2, endHour: 10 }],
  })
  const stored = await execute(harness, 'secretary_time', { op: 'deep.getWeek', weekStart: '2026-11-02' })
  assert.equal(stored.week.source, 'own')
  assert.equal(stored.week.cells.filter(cell => cell.level === 'medium').length, 4)

  const cleared = await product.paintDeep({
    weekStart: '2026-11-02', level: null,
    rects: [{ startWeekday: 2, startHour: 10, endWeekday: 2, endHour: 10 }],
  })
  assert.equal(cleared.week.cells.find(cell => cell.weekday === 2 && cell.hour === 10).level, 'unset')

  const inherited = await state('2026-11-09')
  assert.equal(inherited.deep.weekStart, '2026-11-09')
  assert.equal(inherited.deep.source, 'inherited')
  assert.equal(inherited.deep.cells.filter(cell => cell.level === 'medium').length, 3)
  const earlier = await state('2026-10-26')
  assert.equal(earlier.deep.source, 'seed')
  assert.equal(earlier.deep.cells.filter(cell => cell.level !== 'unset').length, 0)
})

test('Time product paint cuts runs out of one layer and replaceDay, updateBlock, and deleteBlock preserve its facts', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag: work } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const { tag: life } = await execute(harness, 'secretary_tag', { op: 'create', name: '生活', kind: 'time' })
  const product = harness.ctx.get('timeProduct')
  assert.ok(product)
  const paint = (layer, tagId, runs) => product.paint({ layer, tagId, runs, timeZone: 'Asia/Shanghai' })
  const state = () => product.readWindow({
    anchor: '2026-11-02', timeZone: 'Asia/Shanghai', weekStart: '2026-11-02',
  })
  const spans = blocks => blocks.map(block => [block.startAt, block.endAt, block.timeTagId])

  await paint('actual', work.id, [{ date: '2026-11-02', start: 480, end: 600 }])
  assert.deepEqual(spans((await state()).actual), [['2026-11-02T00:00:00.000Z', '2026-11-02T02:00:00.000Z', work.id]])

  await paint('actual', life.id, [{ date: '2026-11-02', start: 500, end: 510 }])
  assert.deepEqual(spans((await state()).actual), [
    ['2026-11-02T00:00:00.000Z', '2026-11-02T00:20:00.000Z', work.id],
    ['2026-11-02T00:20:00.000Z', '2026-11-02T00:30:00.000Z', life.id],
    ['2026-11-02T00:30:00.000Z', '2026-11-02T02:00:00.000Z', work.id],
  ])

  await paint('actual', null, [{ date: '2026-11-02', start: 540, end: 570 }])
  assert.deepEqual(spans((await state()).actual), [
    ['2026-11-02T00:00:00.000Z', '2026-11-02T00:20:00.000Z', work.id],
    ['2026-11-02T00:20:00.000Z', '2026-11-02T00:30:00.000Z', life.id],
    ['2026-11-02T00:30:00.000Z', '2026-11-02T01:00:00.000Z', work.id],
    ['2026-11-02T01:30:00.000Z', '2026-11-02T02:00:00.000Z', work.id],
  ])

  await paint('plan', work.id, [{ date: '2026-11-03', start: 540, end: 600 }])
  const both = await state()
  assert.deepEqual(spans(both.plan), [['2026-11-03T01:00:00.000Z', '2026-11-03T02:00:00.000Z', work.id]])
  assert.equal(both.actual.length, 4, 'painting the plan must not touch the actual layer')

  await product.replaceDay({
    layer: 'actual', date: '2026-11-02', timeZone: 'Asia/Shanghai',
    intervals: [{ start: 480, end: 600, timeTagId: work.id, note: 'Host 原计划' }],
  })
  assert.deepEqual(spans((await state()).actual), [['2026-11-02T00:00:00.000Z', '2026-11-02T02:00:00.000Z', work.id]])
  const listed = await execute(harness, 'secretary_time', { op: 'actual.list', date: '2026-11-02', timeZone: 'Asia/Shanghai' })
  assert.deepEqual(listed.blocks.map(block => block.note), ['Host 原计划'])

  await product.updateBlock({ layer: 'actual', id: listed.blocks[0].id, note: '改过', timeTagId: life.id })
  const edited = await execute(harness, 'secretary_time', { op: 'actual.get', id: listed.blocks[0].id })
  assert.equal(edited.block.note, '改过')
  assert.equal(edited.block.timeTagId, life.id)
  await product.deleteBlock({ layer: 'actual', id: listed.blocks[0].id })
  assert.deepEqual((await state()).actual, [])
})

test('Time product keeps Time and Tag available when GTD storage holds an unreadable legacy record', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const message = "domain 'secretary_gtd': stored record '5ff171ac-1193-4225-a4db-d55be3880eec' in table 'inbox' does not match its schema"
  for (const method of ['listInbox', 'listProjects', 'listActions', 'listNextActions', 'listForecast']) {
    harness.ctx.gtd[method] = async () => { throw new Error(message) }
  }
  const product = harness.ctx.get('timeProduct')
  assert.ok(product)
  const state = await product.readWindow({ anchor: '2026-11-02', timeZone: 'Asia/Shanghai', weekStart: '2026-11-02' })
  assert.deepEqual(state.tags.map(item => item.id), [tag.id])
  assert.equal(Array.isArray(state.actual), true)
  assert.equal(Array.isArray(state.plan), true)
  assert.equal(Array.isArray(state.deep.cells), true)
  for (const key of ['inbox', 'projects', 'actions', 'nextActions', 'forecast', 'warnings']) {
    assert.equal(key in state, false, `Time projection must not contain aggregate GTD field ${key}`)
  }

  await product.paint({
    layer: 'actual', tagId: tag.id, timeZone: 'Asia/Shanghai',
    runs: [{ date: '2026-11-02', start: 540, end: 600 }],
  })
  const after = await product.readWindow({ anchor: '2026-11-02', timeZone: 'Asia/Shanghai', weekStart: '2026-11-02' })
  assert.equal(after.actual.length, 1, 'Time writes still work while GTD is unreadable')
})

test('Time product and public tools share the same Tag and Time Services without aggregate routes', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const product = harness.ctx.get('timeProduct')
  assert.ok(product)
  const state = await product.readWindow({ anchor: '2026-11-02', timeZone: 'Asia/Shanghai', weekStart: '2026-11-02' })
  assert.deepEqual(state.tags.map(item => item.id), [tag.id])

  await product.paint({
    layer: 'actual', tagId: tag.id, timeZone: 'Asia/Shanghai',
    runs: [{ date: '2026-11-02', start: 540, end: 600 }],
  })
  const fromTool = await execute(harness, 'secretary_time', { op: 'actual.list', date: '2026-11-02', timeZone: 'Asia/Shanghai' })
  assert.deepEqual(fromTool.blocks.map(block => block.timeTagId), [tag.id])
  assert.equal(fromTool.blocks[0].startAt, '2026-11-02T01:00:00.000Z')
  assert.equal(harness.routes.has('/api/secretary.state'), false)
  assert.equal(harness.routes.has('/api/secretary.command'), false)
})

test('GTD public tools preserve capture, clarification, Next, Forecast, and completion facts without a product API', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const captured = await execute(harness, 'secretary_gtd', {
    op: 'inbox.capture', title: '工具捕获', raw: '公共工具与 Service 同源', source: 'user_request',
  })
  assert.equal(typeof captured.item.id, 'number')
  assert.equal((await execute(harness, 'secretary_gtd', { op: 'inbox.list' })).items[0].id, captured.item.id)
  const clarified = await execute(harness, 'secretary_gtd', {
    op: 'inbox.clarify', id: captured.item.id,
    project: { title: '工具项目', outcome: '各次读取看到同一事实', type: 'parallel', tagIds: [tag.id] },
    action: { title: '工具下一步', plannedAt: '2026-11-03T09:00:00+08:00' },
  })
  assert.equal(clarified.action.availability, 'available')
  assert.deepEqual((await execute(harness, 'secretary_gtd', { op: 'inbox.list' })).items, [])
  assert.deepEqual((await execute(harness, 'secretary_gtd', { op: 'project.list' })).projects.map(project => project.id), [clarified.project.id])
  assert.deepEqual((await execute(harness, 'secretary_gtd', { op: 'action.next' })).actions.map(action => action.id), [clarified.action.id])
  assert.deepEqual((await execute(harness, 'secretary_gtd', {
    op: 'action.forecast', date: '2026-11-03', timeZone: 'Asia/Shanghai',
  })).actions.map(action => action.id), [clarified.action.id])
  assert.deepEqual((await execute(harness, 'secretary_gtd', { op: 'action.list' })).actions[0].effectiveTags, [tag.id])
  const completed = await execute(harness, 'secretary_gtd', {
    op: 'action.complete', id: clarified.action.id, completedAt: '2026-11-03T10:00:00+08:00',
  })
  assert.equal(completed.action.status, 'completed')
  assert.equal((await execute(harness, 'secretary_gtd', { op: 'action.get', id: clarified.action.id })).action.completedAt, '2026-11-03T10:00:00+08:00')
  assert.deepEqual((await execute(harness, 'secretary_gtd', { op: 'action.next' })).actions, [])
  assert.equal(harness.routes.size, 0, 'the GTD domain needs no legacy state/command routes')
})

test('Goal is an upstream Provider: Time, GTD and TimeProduct wait for it and unload with it', async (t) => {
  const harness = await sqliteHarness(t, undefined, undefined, undefined, false)
  await eventually(() => assert.ok(harness.ctx.get('tags') instanceof TagService))
  assert.equal(harness.ctx.get('goals'), undefined)
  assert.equal(harness.ctx.get('gtd'), undefined)
  assert.equal(harness.ctx.get('time'), undefined)
  assert.equal(harness.ctx.get('timeProduct'), undefined)
  assert.equal(harness.routes.size, 0)

  const provider = await harness.provideGoal()
  assert.ok(harness.ctx.get('goals') instanceof GoalService)
  assert.ok(harness.ctx.get('gtd') instanceof GtdService)
  assert.ok(harness.ctx.get('time') instanceof TimeService)
  assert.ok(harness.ctx.get('timeProduct'))
  assert.equal(harness.routes.size, 0)

  await provider.dispose()
  await eventually(() => {
    assert.equal(harness.ctx.get('goals'), undefined)
    assert.equal(harness.ctx.get('gtd'), undefined)
    assert.equal(harness.ctx.get('time'), undefined)
    assert.equal(harness.ctx.get('timeProduct'), undefined)
    assert.equal(harness.routes.size, 0)
  })
})

test('GTD product composition and unload preserve domain Services, Agent tools, and the independent Time product', async (t) => {
  const harness = await sqliteHarness(t)
  const gtd = harness.ctx.get('gtd')
  const time = harness.ctx.get('time')
  const product = await harness.ctx.plugin(await import('dsh-secretary-gtd-ui'))
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '独立装卸', kind: 'time' })
  const { action } = await execute(harness, 'secretary_gtd', { op: 'action.create', title: '装卸后继续存在', tagIds: [tag.id] })
  const tools = [...harness.tools.keys()]
  const routes = [...harness.routes.keys()]

  await product.dispose()
  assert.ok(harness.ctx.gtd instanceof GtdService)
  assert.ok(harness.ctx.time instanceof TimeService)
  assert.deepEqual([...harness.tools.keys()], tools)
  assert.deepEqual([...harness.routes.keys()], routes)
  assert.equal((await gtd.getAction(action.id)).title, '装卸后继续存在')
  assert.equal((await execute(harness, 'secretary_gtd', { op: 'action.get', id: action.id })).action.title, '装卸后继续存在')
  const actual = await execute(harness, 'secretary_time', {
    op: 'actual.create', timeTagId: tag.id, startAt: '2026-11-02T09:00:00+08:00',
    endAt: '2026-11-02T09:30:00+08:00', actualSource: 'user_reported',
  })
  assert.equal(actual.block.timeTagId, tag.id)
  assert.equal((await time.getActual(actual.block.id)).timeTagId, tag.id)

  await harness.ctx.plugin(await import('dsh-secretary-gtd-ui'))
  assert.ok(harness.ctx.gtd instanceof GtdService)
  assert.ok(harness.ctx.time instanceof TimeService)
  const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.ok(patch.includes("name: 'dsh-secretary-gtd-ui'"), 'the installable bundle mounts the independent GTD product')
  assert.ok(patch.includes("name: 'dsh-secretary-time-controller'"), 'the installable bundle mounts the independent Time Host API')
  assert.ok(patch.includes("name: 'dsh-secretary-time-ui'"), 'the installable bundle mounts the independent Time browser UI')
  assert.doesNotMatch(patch, /dsh-secretary-panel|secretary\.state|secretary\.command/)
})

test('Secretary composition registers one coherent assistant and user-only GTD skills over SQLite services', async (t) => {
  const harness = await sqliteHarness(t)
  const gtdAgent = await import('dsh-secretary-gtd/agent')
  const secretary = await import('dsh-secretary')
  const timePanel = await import('dsh-secretary-time-controller')
  assert.deepEqual(timePanel.inject, ['time', 'tags'], 'Time product must not inject GTD')
  await harness.ctx.plugin(gtdAgent)
  await harness.ctx.plugin(secretary, { defaultTimeZone: 'Asia/Shanghai' })

  assert.equal(harness.skills.get('gtd-inbox-capture').invocation.modelInvocable, false)
  assert.equal(harness.skills.get('gtd-inbox-capture').invocation.userInvocable, true)
  assert.equal(harness.skills.get('gtd-clarify').invocation.modelInvocable, false)
  assert.equal(harness.skills.get('gtd-clarify').invocation.userInvocable, true)
  assert.equal(harness.skills.get('secretary').invocation.modelInvocable, true)
  assert.equal(harness.skills.get('secretary').invocation.userInvocable, true)
  assert.ok(harness.ctx.gtd instanceof GtdService)
  assert.ok(harness.ctx.goals instanceof GoalService)
  assert.ok(harness.ctx.tags instanceof TagService)
  assert.ok(harness.ctx.time instanceof TimeService)
  for (const name of ['secretary_gtd', 'secretary_tag', 'secretary_time']) {
    assert.equal(harness.tools.get(name).parameters.oneOf, undefined)
    assert.equal(harness.tools.get(name).parameters.type, 'object')
  }
  assert.equal(harness.tools.has('secretary_time_block'), false)
  assert.equal(harness.tools.has('secretary_statistics'), false)
  assert.equal(harness.routes.has('/api/secretary.state'), false)
  assert.equal(harness.routes.has('/api/secretary.command'), false)
  assert.equal(harness.routes.size, 0, 'the final products register no legacy aggregate routes')

  const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  for (const row of [
    "name: '@deepseek-ai/dsh-storage-sqlite'",
    "name: 'dsh-secretary-storage'",
    "name: 'dsh-secretary-goal'",
    "name: 'dsh-secretary-gtd'",
    "name: 'dsh-secretary-tag'",
    "name: 'dsh-secretary-time-block'",
    "name: 'dsh-secretary-time-controller'",
    "name: 'dsh-secretary-time-ui'",
    "name: 'dsh-secretary-gtd-ui'",
    "name: 'dsh-secretary-gtd/tools'",
    "name: 'dsh-secretary-tag/tools'",
    "name: 'dsh-secretary-time-block/tools'",
    "name: 'dsh-secretary-gtd/agent'",
    "name: 'dsh-secretary'",
    "name: '@deepseek-ai/dsh-skill-filesystem'",
    "name: '@deepseek-ai/dsh-tool-bash'",
    "name: '@deepseek-ai/dsh-tool-web'",
    "name: '@deepseek-ai/dsh-tool-todo'",
    "name: '@deepseek-ai/dsh-tool-goal'",
    "name: '@deepseek-ai/dsh-compaction-basic'",
    "name: '@deepseek-ai/dsh-tool-subagent'",
    "name: '@deepseek-ai/dsh-plan-mode'",
    "name: '@deepseek-ai/dsh-tool-ask-user'",
  ]) assert.ok(patch.includes(row), `missing bundle row ${row}`)
  assert.ok(patch.includes("- id: skill-office\n  disabled: true"), 'office skills must stay disabled')
  assert.doesNotMatch(patch, /^- id: storage-domain$/m)
  assert.doesNotMatch(patch, /dsh-secretary-panel|secretary-panel|secretary\.state|secretary\.command/)
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.dependencies['dsh-secretary-panel'], undefined)
  assert.equal(manifest.dependencies['dsh-secretary-time-controller'], 'workspace:*')
  assert.equal(manifest.dependencies['dsh-secretary-time-ui'], 'workspace:*')
  assert.equal(manifest.dependencies['dsh-secretary-gtd-ui'], 'workspace:*')
})

test('Tag deletion protects GTD references and shares its serial boundary with Action create/update', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag: time } = await execute(harness, 'secretary_tag', { op: 'create', name: '项目时间', kind: 'time' })
  const captured = await execute(harness, 'secretary_gtd', {
    op: 'inbox.capture', title: '保护引用', raw: '标签不能留下悬空引用。', source: 'user_request',
  })
  await execute(harness, 'secretary_gtd', {
    op: 'inbox.clarify', id: captured.item.id,
    project: { title: '引用保护', outcome: '所有引用一致', type: 'parallel', tagIds: [time.id] },
    action: { title: '验证删除保护' },
  })
  await assert.rejects(execute(harness, 'secretary_tag', { op: 'delete', id: time.id }), /referenced/)
  assert.equal((await execute(harness, 'secretary_tag', { op: 'get', id: time.id })).tag.name, '项目时间')

  const standalone = await execute(harness, 'secretary_gtd', {
    op: 'action.create', title: '独立标签事项', tagIds: [time.id],
  })
  for (const operation of ['action.create', 'action.update']) {
    const { tag: race } = await execute(harness, 'secretary_tag', { op: 'create', name: `竞态 ${operation}`, kind: 'time' })
    const write = operation === 'action.create'
      ? { op: operation, title: '并发创建', tagIds: [race.id] }
      : { op: operation, id: standalone.action.id, tagIds: [race.id] }
    const outcomes = await Promise.allSettled([
      execute(harness, 'secretary_gtd', write),
      execute(harness, 'secretary_tag', { op: 'delete', id: race.id }),
    ])
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1)
    const survivingTag = await execute(harness, 'secretary_tag', { op: 'get', id: race.id }).catch(() => undefined)
    const references = (await execute(harness, 'secretary_gtd', { op: 'action.list' })).actions
      .filter(action => action.tagIds.includes(race.id))
    if (survivingTag === undefined) assert.equal(references.length, 0)
    else assert.equal(references.length, 1)
  }
})

test('Action effectiveTags accumulate Project and every parent Action without copying inherited direct tagIds', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag: time } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const { tag: projectContext } = await execute(harness, 'secretary_tag', { op: 'create', name: '办公室', kind: 'context' })
  const { tag: parentContext } = await execute(harness, 'secretary_tag', { op: 'create', name: '电脑', kind: 'context' })
  const { tag: ownTime } = await execute(harness, 'secretary_tag', { op: 'create', name: '写作', kind: 'time' })
  const captured = await execute(harness, 'secretary_gtd', {
    op: 'inbox.capture', title: '撰写文档', raw: '完成一篇可发布的文档。', source: 'user_request',
  })
  const { project, action: parent } = await execute(harness, 'secretary_gtd', {
    op: 'inbox.clarify', id: captured.item.id,
    project: { title: '撰写文档', outcome: '文档发布', type: 'parallel', tagIds: [time.id, projectContext.id] },
    action: { title: '准备文档内容', tagIds: [parentContext.id] },
  })
  const created = await execute(harness, 'secretary_gtd', {
    op: 'action.create', parentActionId: parent.id, title: '撰写初稿', tagIds: [ownTime.id, parentContext.id],
  })
  assert.equal(created.action.projectId, project.id)
  assert.equal(created.action.parentActionId, parent.id)
  assert.deepEqual(created.action.tagIds, [ownTime.id, parentContext.id])
  assert.deepEqual(new Set(created.action.effectiveTags), new Set([time.id, projectContext.id, parentContext.id, ownTime.id]))
  const fetched = await execute(harness, 'secretary_gtd', { op: 'action.get', id: created.action.id })
  assert.deepEqual(fetched.action.effectiveTags, created.action.effectiveTags)
  const effective = await execute(harness, 'secretary_gtd', { op: 'action.effectiveTags', id: created.action.id })
  assert.deepEqual(effective.tagIds, created.action.effectiveTags)
  assert.deepEqual((await execute(harness, 'secretary_gtd', { op: 'action.get', id: parent.id })).action.tagIds, [parentContext.id])
  assert.deepEqual(JSON.parse(JSON.stringify(created)), created)
})

test('Project clarification requires exactly one direct time Tag and SAL never invents an outcome', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag: time } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const { tag: secondTime } = await execute(harness, 'secretary_tag', { op: 'create', name: '学习', kind: 'time' })
  const { tag: context } = await execute(harness, 'secretary_tag', { op: 'create', name: '电脑', kind: 'context' })
  const captured = await execute(harness, 'secretary_gtd', {
    op: 'inbox.capture', title: '发布版本', raw: '准备并发布下一版。', source: 'user_request',
  })
  for (const tagIds of [[], [context.id], [time.id, secondTime.id]]) {
    await assert.rejects(execute(harness, 'secretary_gtd', {
      op: 'inbox.clarify', id: captured.item.id,
      project: { title: '发布版本', outcome: '版本可供用户使用', type: 'parallel', tagIds },
      action: { title: '检查发布内容' },
    }), /exactly one direct time tag/)
  }
  assert.equal((await execute(harness, 'secretary_gtd', { op: 'inbox.list' })).items.length, 1)

  const clarified = await execute(harness, 'secretary_gtd', {
    op: 'inbox.clarify', id: captured.item.id,
    project: { title: '发布版本', outcome: '版本可供用户使用', type: 'parallel', tagIds: [time.id, context.id] },
    action: { title: '检查发布内容', tagIds: [context.id] },
  })
  assert.equal(typeof clarified.project.id, 'number')
  assert.equal(typeof clarified.action.id, 'number')
  assert.deepEqual(clarified.project.tagIds, [time.id, context.id])
  assert.equal(clarified.action.projectId, clarified.project.id)
  assert.deepEqual(clarified.action.tagIds, [context.id])

  const inbox = await execute(harness, 'secretary_gtd', {
    op: 'inbox.capture', title: '杂务', raw: '整理一组互不依赖的杂务。', source: 'user_request',
  })
  const sal = await execute(harness, 'secretary_gtd', {
    op: 'inbox.clarify', id: inbox.item.id,
    project: { title: '零散杂务', type: 'single_action_list', tagIds: [time.id] },
    action: { title: '缴水电费' },
  })
  assert.equal(sal.project.outcome, undefined)
  assert.equal(sal.project.type, 'single_action_list')
  assert.deepEqual(JSON.parse(JSON.stringify(sal)), sal)
})

test('GTD capture and standalone clarification allocate lossless numeric ids without creating a Project', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '个人', kind: 'time' })
  const captured = await execute(harness, 'secretary_gtd', {
    op: 'inbox.capture', title: '预约牙医', raw: '下周找个时间预约牙医。', source: 'user_request',
  })
  assert.equal(captured.item.id, 1)
  assert.equal(typeof captured.item.id, 'number')
  assert.equal(captured.item.raw, '下周找个时间预约牙医。')
  assert.equal((await execute(harness, 'secretary_gtd', { op: 'project.list' })).projects.length, 0)

  const clarified = await execute(harness, 'secretary_gtd', {
    op: 'inbox.clarify', id: captured.item.id,
    action: { title: '打电话预约牙医', tagIds: [tag.id], estimatedMinutes: 10 },
  })
  assert.equal(clarified.project, undefined)
  assert.equal(clarified.action.id, 2)
  assert.equal(typeof clarified.action.id, 'number')
  assert.equal(clarified.action.projectId, undefined)
  assert.equal(clarified.action.parentActionId, undefined)
  assert.deepEqual(clarified.action.tagIds, [tag.id])
  assert.equal(clarified.action.availability, 'available')
  assert.deepEqual(JSON.parse(JSON.stringify(clarified)), clarified)
  assert.deepEqual((await execute(harness, 'secretary_gtd', { op: 'inbox.list' })).items, [])
  assert.deepEqual((await execute(harness, 'secretary_gtd', { op: 'project.list' })).projects, [])
  await assert.rejects(execute(harness, 'secretary_gtd', { op: 'action.update', id: clarified.action.id, tagIds: [] }), /standalone action requires its own time tag/)
  assert.deepEqual((await execute(harness, 'secretary_gtd', { op: 'action.get', id: clarified.action.id })).action.tagIds, [tag.id])
  assert.equal(harness.tools.get('secretary_gtd').parameters.properties.id.type, 'integer')
})

test('Inbox, Project, and Action atomic CRUD rejects structural deletion that would orphan children', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const captured = await execute(harness, 'secretary_gtd', {
    op: 'inbox.capture', title: '丢弃条目', raw: '这条不需要继续处理。', source: 'user_request',
  })
  const discarded = await execute(harness, 'secretary_gtd', { op: 'inbox.delete', id: captured.item.id })
  assert.equal(discarded.item.raw, '这条不需要继续处理。')
  assert.deepEqual((await execute(harness, 'secretary_gtd', { op: 'inbox.list' })).items, [])

  const created = await execute(harness, 'secretary_gtd', {
    op: 'project.create', title: '原子项目', outcome: '公开 CRUD 可用', type: 'parallel', tagIds: [tag.id],
  })
  assert.equal((await execute(harness, 'secretary_gtd', { op: 'project.get', id: created.project.id })).project.title, '原子项目')
  const parent = await execute(harness, 'secretary_gtd', {
    op: 'action.create', projectId: created.project.id, title: '父事项',
  })
  const child = await execute(harness, 'secretary_gtd', {
    op: 'action.create', parentActionId: parent.action.id, title: '子事项',
  })
  await assert.rejects(execute(harness, 'secretary_gtd', { op: 'action.delete', id: parent.action.id }), /children/)
  await assert.rejects(execute(harness, 'secretary_gtd', { op: 'project.delete', id: created.project.id }), /actions/)
  assert.equal((await execute(harness, 'secretary_gtd', { op: 'action.get', id: child.action.id })).action.title, '子事项')
  await execute(harness, 'secretary_gtd', { op: 'action.delete', id: child.action.id })
  await execute(harness, 'secretary_gtd', { op: 'action.delete', id: parent.action.id })
  await execute(harness, 'secretary_gtd', { op: 'project.delete', id: created.project.id })
  assert.deepEqual((await execute(harness, 'secretary_gtd', { op: 'project.list' })).projects, [])
  assert.deepEqual((await execute(harness, 'secretary_gtd', { op: 'action.list' })).actions, [])
  await execute(harness, 'secretary_tag', { op: 'delete', id: tag.id })
})

test('Next Actions contain only currently available leaves across parallel, sequential, SAL, and standalone Actions', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const makeProject = async (title, type) => {
    const captured = await execute(harness, 'secretary_gtd', {
      op: 'inbox.capture', title, raw: title, source: 'user_request',
    })
    return execute(harness, 'secretary_gtd', {
      op: 'inbox.clarify', id: captured.item.id,
      project: { title, ...(type === 'single_action_list' ? {} : { outcome: `${title}完成` }), type, tagIds: [tag.id] },
      action: { title: `${title} 第一项` },
    })
  }
  const nextIds = async () => (await execute(harness, 'secretary_gtd', { op: 'action.next' })).actions.map(action => action.id)

  const parallel = await makeProject('并行项目', 'parallel')
  const parallelSecond = await execute(harness, 'secretary_gtd', {
    op: 'action.create', projectId: parallel.project.id, title: '并行第二项',
  })
  assert.deepEqual(new Set(await nextIds()), new Set([parallel.action.id, parallelSecond.action.id]))
  const child = await execute(harness, 'secretary_gtd', {
    op: 'action.create', parentActionId: parallel.action.id, title: '并行动作子项',
  })
  assert.ok(!(await nextIds()).includes(parallel.action.id), 'parent Action is not a leaf')
  assert.ok((await nextIds()).includes(child.action.id))
  assert.ok((await nextIds()).includes(parallelSecond.action.id))

  const sequential = await makeProject('顺序项目', 'sequential')
  const sequentialSecond = await execute(harness, 'secretary_gtd', {
    op: 'action.create', projectId: sequential.project.id, title: '顺序第二项',
  })
  assert.equal((await execute(harness, 'secretary_gtd', { op: 'action.get', id: sequentialSecond.action.id })).action.availability, 'blocked')
  assert.ok((await nextIds()).includes(sequential.action.id))
  assert.ok(!(await nextIds()).includes(sequentialSecond.action.id))
  await execute(harness, 'secretary_gtd', {
    op: 'action.update', id: sequential.action.id, deferAt: '2099-01-01T09:00:00+08:00',
  })
  assert.ok(!(await nextIds()).includes(sequential.action.id))
  assert.ok(!(await nextIds()).includes(sequentialSecond.action.id), 'a deferred active predecessor still blocks later siblings')
  await execute(harness, 'secretary_gtd', { op: 'action.update', id: sequential.action.id, deferAt: null })
  await execute(harness, 'secretary_gtd', {
    op: 'action.complete', id: sequential.action.id, completedAt: '2026-11-03T12:00:00+08:00',
  })
  assert.ok((await nextIds()).includes(sequentialSecond.action.id))

  const sal = await makeProject('单一行动清单', 'single_action_list')
  const salSecond = await execute(harness, 'secretary_gtd', {
    op: 'action.create', projectId: sal.project.id, title: '清单第二项',
  })
  assert.ok((await nextIds()).includes(sal.action.id))
  assert.ok((await nextIds()).includes(salSecond.action.id))
  const standalone = await execute(harness, 'secretary_gtd', { op: 'action.create', title: '独立下一步', tagIds: [tag.id] })
  assert.ok((await nextIds()).includes(standalone.action.id))

  const held = await execute(harness, 'secretary_gtd', { op: 'project.update', id: parallel.project.id, status: 'on-hold' })
  assert.equal(held.project.status, 'on-hold')
  for (const id of [parallelSecond.action.id, child.action.id]) {
    assert.equal((await execute(harness, 'secretary_gtd', { op: 'action.get', id })).action.availability, 'unavailable')
    assert.ok(!(await nextIds()).includes(id))
  }
  await execute(harness, 'secretary_gtd', { op: 'project.update', id: parallel.project.id, status: 'active' })
  const dropped = await execute(harness, 'secretary_gtd', {
    op: 'action.drop', id: parallelSecond.action.id, droppedAt: '2026-11-03T13:00:00+08:00',
  })
  assert.equal(dropped.action.availability, 'unavailable')
  assert.ok(!(await nextIds()).includes(parallelSecond.action.id))
  assert.deepEqual(JSON.parse(JSON.stringify(dropped)), dropped)
})

test('Action date fields are independent offset instants and Forecast queries explicit calendar dates', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const created = await execute(harness, 'secretary_gtd', {
    op: 'action.create', title: '维护日期语义', tagIds: [tag.id],
    deferAt: '2000-01-01T09:00:00+08:00', plannedAt: '2026-11-03T23:30:00+08:00',
    dueAt: '2026-11-04T09:00:00+08:00', estimatedMinutes: 45,
  })
  assert.equal(created.action.plannedAt, '2026-11-03T23:30:00+08:00')
  assert.equal(created.action.dueAt, '2026-11-04T09:00:00+08:00')
  assert.equal(created.action.estimatedMinutes, 45)
  assert.equal(created.action.availability, 'available')
  for (const date of ['2026-11-03', '2026-11-04']) {
    const forecast = await execute(harness, 'secretary_gtd', { op: 'action.forecast', date, timeZone: 'Asia/Shanghai' })
    assert.deepEqual(forecast.actions.map(action => action.id), [created.action.id])
  }
  assert.deepEqual((await execute(harness, 'secretary_gtd', {
    op: 'action.forecast', date: '2026-11-05', timeZone: 'Asia/Shanghai',
  })).actions, [])
  const utc = await execute(harness, 'secretary_gtd', {
    op: 'action.create', title: '跨时区截止', tagIds: [tag.id], dueAt: '2026-11-03T01:00:00Z',
  })
  assert.deepEqual((await execute(harness, 'secretary_gtd', {
    op: 'action.forecast', date: '2026-11-03', timeZone: 'Asia/Shanghai',
  })).actions.map(action => action.id), [created.action.id, utc.action.id])

  const flexible = await execute(harness, 'secretary_gtd', {
    op: 'action.update', id: created.action.id, deferAt: null, plannedAt: '2099-01-01T09:00:00+08:00', dueAt: '2000-01-01T09:00:00+08:00',
  })
  assert.equal(flexible.action.availability, 'available', 'Planned and past Due must not change Availability')
  const tool = harness.tools.get('secretary_gtd')
  for (const field of ['deferAt', 'plannedAt', 'dueAt', 'estimatedMinutes']) assert.ok(tool.parameters.properties[field])
  for (const input of [
    { plannedAt: '2026-11-03T09:00:00' },
    { dueAt: '2026-02-31T09:00:00+08:00' },
    { estimatedMinutes: -2 },
  ]) await assert.rejects(execute(harness, 'secretary_gtd', { op: 'action.update', id: created.action.id, ...input }))
  await assert.rejects(execute(harness, 'secretary_gtd', {
    op: 'action.update', id: created.action.id, action: { preparationResultRef: 'nested-by-mistake' },
  }), /top-level/)
  await assert.rejects(execute(harness, 'secretary_gtd', { op: 'action.forecast', date: '2026-02-31', timeZone: 'Asia/Shanghai' }), /invalid date/)
  const unchanged = await execute(harness, 'secretary_gtd', { op: 'action.get', id: created.action.id })
  assert.equal(unchanged.action.estimatedMinutes, 45)
  assert.equal(unchanged.action.plannedAt, '2099-01-01T09:00:00+08:00')
  assert.deepEqual(JSON.parse(JSON.stringify(flexible)), flexible)
})

test('clarification restores the original Inbox and removes partial writes after backend failures', async (t) => {
  for (const failOn of [{ put: 'actions' }, { delete: 'inbox' }]) {
    const harness = await sqliteHarness(t, undefined, failOn)
    const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
    const captured = await execute(harness, 'secretary_gtd', {
      op: 'inbox.capture', title: '原子澄清', raw: '失败时不能留下半承接状态。', source: 'user_request',
    })
    await assert.rejects(
      execute(harness, 'secretary_gtd', {
        op: 'inbox.clarify', id: captured.item.id,
        project: { title: '原子项目', outcome: '失败时全部回滚。', type: 'sequential', tagIds: [tag.id] },
        action: { title: '不能留下部分写入' },
      }),
      /injected/,
    )
    assert.equal((await execute(harness, 'secretary_gtd', { op: 'project.list' })).projects.length, 0)
    assert.equal((await execute(harness, 'secretary_gtd', { op: 'action.list' })).actions.length, 0)
    const inbox = await execute(harness, 'secretary_gtd', { op: 'inbox.list' })
    assert.deepEqual(inbox.items.map(item => item.id), [captured.item.id])
    await harness.close()
  }
})
