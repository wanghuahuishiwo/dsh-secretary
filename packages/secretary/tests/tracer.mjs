import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import Storage, { storageBackendServiceKey } from '@deepseek-ai/dsh-storage'
import { SqliteStorageBackend } from '@deepseek-ai/dsh-storage-sqlite'
import { GtdService } from 'dsh-secretary-gtd/contract'
import { TagService } from 'dsh-secretary-tag/contract'
import { TimeService } from 'dsh-secretary-time-block/contract'

async function sqliteHarness(t, databasePath, failOn) {
  const directory = databasePath === undefined ? await mkdtemp(join(tmpdir(), 'dsh-secretary-tracer-')) : undefined
  const resolvedDatabasePath = databasePath ?? join(directory, 'secretary.sqlite')
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = new SqliteStorageBackend({ path: resolvedDatabasePath, journalMode: 'delete' })
  if (failOn !== undefined) {
    const open = backend.kv.open
    backend.kv.open = async descriptor => {
      const unit = await open(descriptor)
      const wrapped = Object.create(unit)
      wrapped.putRecord = async (table, key, value) => {
        if (failOn.put === table) throw new Error(`injected put failure on ${table}`)
        return unit.putRecord(table, key, value)
      }
      wrapped.deleteRecord = async (table, key) => {
        if (failOn.delete === table) throw new Error(`injected delete failure on ${table}`)
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
    import('dsh-secretary-panel'),
  ])
  for (const module of modules) await ctx.plugin(module)

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
  return { ctx, tools, skills, routes, databasePath: resolvedDatabasePath, close, failOn }
}

function execute(harness, name, args) {
  const tool = harness.tools.get(name)
  assert.ok(tool, `missing public tool ${name}`)
  return tool.execute(args)
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
  harness.failOn.put = 'plan_days'
  await assert.rejects(execute(harness, 'secretary_time', {
    op: 'template.apply', weekday: 1, targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
  }), /injected put failure/)
  harness.failOn.put = undefined
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'plan.list' })).blocks, [original])

  const applied = await execute(harness, 'secretary_time', {
    op: 'template.apply', weekday: 1, targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
  })
  harness.failOn.put = 'plan_days'
  await assert.rejects(execute(harness, 'secretary_time', {
    op: 'template.undo', targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
  }), /injected put failure/)
  harness.failOn.put = undefined
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'plan.list' })).blocks, applied.blocks)
  assert.deepEqual((await execute(harness, 'secretary_time', {
    op: 'template.undo', targetDate: '2026-11-02', timeZone: 'Asia/Shanghai',
  })).blocks, [original])
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'actual.list' })).blocks.map(block => block.id), [actual.id])
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

test('GTD Completed and Actual start/stop remain independent facts', async (t) => {
  const harness = await sqliteHarness(t)
  const captured = await execute(harness, 'secretary_gtd', {
    op: 'inbox.capture', title: '整理评审材料', raw: '周五前准备好产品评审。', source: 'user_request',
  })
  const clarified = await execute(harness, 'secretary_gtd', {
    op: 'inbox.clarify', id: captured.item.id,
    project: { title: '产品评审', outcome: '评审材料完整。', type: 'sequential' },
    action: { title: '整理评审材料', dueAt: '2026-10-30T17:00:00+08:00', estimatedMinutes: 60 },
  })
  assert.equal(clarified.action.availability, 'available')
  assert.equal((await execute(harness, 'secretary_gtd', { op: 'inbox.list' })).items.length, 0)

  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
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
  assert.deepEqual(JSON.parse(JSON.stringify(stopped)), stopped)
})

test('Tag, Actual, and GTD facts reopen from the same SQLite file after a full shutdown', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-secretary-restart-'))
  const databasePath = join(directory, 'secretary.sqlite')
  t.after(async () => { await rm(directory, { recursive: true, force: true }) })

  const first = await sqliteHarness(t, databasePath)
  const captured = await execute(first, 'secretary_gtd', {
    op: 'inbox.capture', title: '持久化验证', raw: '重启后继续处理持久化验证。', source: 'user_request',
  })
  const clarified = await execute(first, 'secretary_gtd', {
    op: 'inbox.clarify', id: captured.item.id,
    project: { title: '持久化项目', outcome: '重启后事实仍然存在。', type: 'sequential' },
    action: { title: '验证重启恢复' },
  })
  const { tag: root } = await execute(first, 'secretary_tag', { op: 'create', name: '工作', kind: 'time', color: '#477bc7' })
  const { tag: child } = await execute(first, 'secretary_tag', { op: 'create', name: '实现', parentId: root.id })
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

test('deep.getWeek returns a reusable base week with 168 independently unset cells', async (t) => {
  const harness = await sqliteHarness(t)
  const { week } = await execute(harness, 'secretary_time', { op: 'deep.getWeek' })
  assert.equal(week.scope, 'base')
  assert.equal(week.cells.length, 168)
  assert.deepEqual(week.cells[0], { weekday: 1, hour: 0, level: 'unset' })
  assert.deepEqual(week.cells[167], { weekday: 7, hour: 23, level: 'unset' })
  assert.ok(week.cells.every(cell => cell.level === 'unset'))
  assert.deepEqual(JSON.parse(JSON.stringify(week)), week)
})

test('deep.setCell writes one high cell and restores the base scope after a full SQLite restart', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-secretary-deep-cell-'))
  const databasePath = join(directory, 'secretary.sqlite')
  t.after(async () => { await rm(directory, { recursive: true, force: true }) })
  const first = await sqliteHarness(t, databasePath)
  const { week } = await execute(first, 'secretary_time', {
    op: 'deep.setCell', weekday: 2, hour: 9, level: 'high',
  })
  assert.deepEqual(week.cells.find(cell => cell.weekday === 2 && cell.hour === 9), { weekday: 2, hour: 9, level: 'high' })
  assert.equal(week.cells.filter(cell => cell.level !== 'unset').length, 1)
  await first.close()

  const reopened = await sqliteHarness(t, databasePath)
  const restored = await execute(reopened, 'secretary_time', { op: 'deep.getWeek' })
  assert.equal(restored.week.scope, 'base')
  assert.deepEqual(restored.week.cells.find(cell => cell.weekday === 2 && cell.hour === 9), { weekday: 2, hour: 9, level: 'high' })
  assert.equal(restored.week.cells.filter(cell => cell.level !== 'unset').length, 1)
})

test('deep.clearCell returns only the selected cell to unset without turning it into low', async (t) => {
  const harness = await sqliteHarness(t)
  await execute(harness, 'secretary_time', { op: 'deep.setCell', weekday: 1, hour: 8, level: 'low' })
  await execute(harness, 'secretary_time', { op: 'deep.setCell', weekday: 1, hour: 9, level: 'high' })
  const { week } = await execute(harness, 'secretary_time', { op: 'deep.clearCell', weekday: 1, hour: 8 })
  assert.deepEqual(week.cells.find(cell => cell.weekday === 1 && cell.hour === 8), { weekday: 1, hour: 8, level: 'unset' })
  assert.deepEqual(week.cells.find(cell => cell.weekday === 1 && cell.hour === 9), { weekday: 1, hour: 9, level: 'high' })
  assert.notEqual(week.cells.find(cell => cell.weekday === 1 && cell.hour === 8).level, 'low')
})

test('deep.setRange writes an inclusive weekday-by-hour rectangle in one base-template update', async (t) => {
  const harness = await sqliteHarness(t)
  const { week } = await execute(harness, 'secretary_time', {
    op: 'deep.setRange', startWeekday: 1, startHour: 9, endWeekday: 2, endHour: 10, level: 'medium',
  })
  const changed = week.cells.filter(cell => cell.level !== 'unset')
  assert.deepEqual(changed, [
    { weekday: 1, hour: 9, level: 'medium' },
    { weekday: 1, hour: 10, level: 'medium' },
    { weekday: 2, hour: 9, level: 'medium' },
    { weekday: 2, hour: 10, level: 'medium' },
  ])
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'deep.getWeek' })).week, week)
})

test('deep.clearRange clears an inclusive rectangle while preserving cells outside it', async (t) => {
  const harness = await sqliteHarness(t)
  await execute(harness, 'secretary_time', {
    op: 'deep.setRange', startWeekday: 3, startHour: 13, endWeekday: 4, endHour: 15, level: 'low',
  })
  const { week } = await execute(harness, 'secretary_time', {
    op: 'deep.clearRange', startWeekday: 3, startHour: 14, endWeekday: 4, endHour: 14,
  })
  assert.deepEqual(week.cells.filter(cell => cell.level === 'low').map(cell => [cell.weekday, cell.hour]), [
    [3, 13], [3, 15], [4, 13], [4, 15],
  ])
  assert.equal(week.cells.find(cell => cell.weekday === 3 && cell.hour === 14).level, 'unset')
  assert.equal(week.cells.find(cell => cell.weekday === 4 && cell.hour === 14).level, 'unset')
})

test('deep public tools reject invalid levels, coordinates, and reversed ranges without overwriting the week', async (t) => {
  const harness = await sqliteHarness(t)
  await execute(harness, 'secretary_time', { op: 'deep.setCell', weekday: 1, hour: 9, level: 'high' })
  const invalid = [
    { op: 'deep.setCell', weekday: 0, hour: 9, level: 'high' },
    { op: 'deep.setCell', weekday: 8, hour: 9, level: 'high' },
    { op: 'deep.setCell', weekday: 1.5, hour: 9, level: 'high' },
    { op: 'deep.setCell', weekday: 1, hour: -1, level: 'high' },
    { op: 'deep.setCell', weekday: 1, hour: 24, level: 'high' },
    { op: 'deep.setCell', weekday: 1, hour: 9.5, level: 'high' },
    { op: 'deep.setCell', weekday: 1, hour: 9, level: 'unset' },
    { op: 'deep.setCell', weekday: 1, hour: 9, level: 'flow' },
    { op: 'deep.clearCell', weekday: 7.1, hour: 9 },
    { op: 'deep.clearCell', weekday: 7, hour: 23.1 },
    { op: 'deep.setRange', startWeekday: 2, startHour: 9, endWeekday: 1, endHour: 10, level: 'low' },
    { op: 'deep.setRange', startWeekday: 1, startHour: 11, endWeekday: 2, endHour: 10, level: 'low' },
    { op: 'deep.clearRange', startWeekday: 1, startHour: 9, endWeekday: 8, endHour: 10 },
    { op: 'deep.clearRange', startWeekday: 1, startHour: 9, endWeekday: 2, endHour: 24 },
  ]
  for (const args of invalid) {
    await assert.rejects(execute(harness, 'secretary_time', args), /weekday|hour|deep level|deep range/)
  }
  const { week } = await execute(harness, 'secretary_time', { op: 'deep.getWeek' })
  assert.deepEqual(week.cells.filter(cell => cell.level !== 'unset'), [{ weekday: 1, hour: 9, level: 'high' }])
  const tool = harness.tools.get('secretary_time')
  assert.deepEqual(tool.parameters.properties.level.enum, ['high', 'medium', 'low'])
  assert.equal(tool.parameters.properties.weekday.minimum, 1)
  assert.equal(tool.parameters.properties.weekday.maximum, 7)
  assert.equal(tool.parameters.properties.hour.minimum, 0)
  assert.equal(tool.parameters.properties.hour.maximum, 23)
})

test('deep base template and Actual facts never derive from or rewrite each other', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const { block: actual } = await execute(harness, 'secretary_time', {
    op: 'actual.create', timeTagId: tag.id, startAt: '2026-11-02T09:00:00+08:00',
    endAt: '2026-11-02T11:00:00+08:00', actualSource: 'user_reported', focus: 'deep', note: '实录保持原样',
  })
  assert.ok((await execute(harness, 'secretary_time', { op: 'deep.getWeek' })).week.cells.every(cell => cell.level === 'unset'))
  await execute(harness, 'secretary_time', {
    op: 'deep.setRange', startWeekday: 1, startHour: 9, endWeekday: 1, endHour: 10, level: 'high',
  })
  assert.deepEqual((await execute(harness, 'secretary_time', { op: 'actual.get', id: actual.id })).block, actual)
  const { block: later } = await execute(harness, 'secretary_time', {
    op: 'actual.create', timeTagId: tag.id, startAt: '2026-11-03T14:00:00+08:00',
    endAt: '2026-11-03T15:00:00+08:00', actualSource: 'agent_observed', focus: 'shallow',
  })
  const { week } = await execute(harness, 'secretary_time', { op: 'deep.getWeek' })
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

test('panel Host routes expose the deep base week and mutations through the same TimeService', async (t) => {
  const harness = await sqliteHarness(t)
  const stateRoute = harness.routes.get('/api/secretary.state')
  const commandRoute = harness.routes.get('/api/secretary.command')
  const state = async () => {
    const response = await stateRoute.fetch(new Request('http://test.local/api/secretary.state?date=2026-11-02&timeZone=Asia%2FShanghai'))
    assert.equal(response.status, 200)
    return response.json()
  }
  const command = body => commandRoute.fetch(new Request('http://test.local/api/secretary.command', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }))
  assert.equal((await state()).deepWeek.scope, 'base')
  const set = await command({
    domain: 'time', op: 'deep.setRange', startWeekday: 1, startHour: 9, endWeekday: 2, endHour: 10, level: 'medium',
  })
  assert.equal(set.status, 200)
  const fromTool = await execute(harness, 'secretary_time', { op: 'deep.getWeek' })
  assert.equal(fromTool.week.cells.filter(cell => cell.level === 'medium').length, 4)
  const cleared = await command({ domain: 'time', op: 'deep.clearCell', weekday: 2, hour: 10 })
  assert.equal(cleared.status, 200)
  const after = await state()
  assert.equal(after.deepWeek.cells.find(cell => cell.weekday === 2 && cell.hour === 10).level, 'unset')
  assert.equal(after.deepWeek.cells.filter(cell => cell.level === 'medium').length, 3)
})

test('panel Host routes and public tools share the same Tag and Time Services', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  assert.ok(harness.routes, 'missing panel route registry')
  const stateRoute = harness.routes.get('/api/secretary.state')
  assert.ok(stateRoute, 'missing panel state route')
  const state = await stateRoute.fetch(new Request('http://test.local/api/secretary.state?date=2026-11-02&timeZone=Asia%2FShanghai'))
  assert.equal(state.status, 200)
  assert.deepEqual((await state.json()).tags.map(item => item.id), [tag.id])

  const commandRoute = harness.routes.get('/api/secretary.command')
  assert.ok(commandRoute, 'missing panel command route')
  const created = await commandRoute.fetch(new Request('http://test.local/api/secretary.command', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      domain: 'time', op: 'actual.create', timeTagId: tag.id,
      startAt: '2026-11-02T09:00:00+08:00', endAt: '2026-11-02T10:00:00+08:00', actualSource: 'user_reported',
    }),
  }))
  assert.equal(created.status, 200)
  const { block } = await created.json()
  const fromTool = await execute(harness, 'secretary_time', { op: 'actual.get', id: block.id })
  assert.equal(fromTool.block.timeTagId, tag.id)
})

test('panel Host routes expose Plan and Template apply/undo through the same TimeService', async (t) => {
  const harness = await sqliteHarness(t)
  const { tag } = await execute(harness, 'secretary_tag', { op: 'create', name: '工作', kind: 'time' })
  const commandRoute = harness.routes.get('/api/secretary.command')
  const stateRoute = harness.routes.get('/api/secretary.state')
  const command = body => commandRoute.fetch(new Request('http://test.local/api/secretary.command', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }))
  const state = async () => {
    const response = await stateRoute.fetch(new Request('http://test.local/api/secretary.state?date=2026-11-02&timeZone=Asia%2FShanghai'))
    assert.equal(response.status, 200)
    return response.json()
  }
  const originalResponse = await command({
    domain: 'time', op: 'plan.create', date: '2026-11-02', timeZone: 'Asia/Shanghai', timeTagId: tag.id,
    startAt: '2026-11-02T08:00:00+08:00', endAt: '2026-11-02T08:30:00+08:00', note: 'Host 原计划',
  })
  assert.equal(originalResponse.status, 200)
  const { block: original } = await originalResponse.json()
  assert.equal((await execute(harness, 'secretary_time', { op: 'plan.get', id: original.id })).block.note, 'Host 原计划')
  await command({ domain: 'time', op: 'template.create', weekday: 1, startTime: '09:00', endTime: '10:00', timeTagId: tag.id })
  const applied = await command({ domain: 'time', op: 'template.apply', weekday: 1, targetDate: '2026-11-02', timeZone: 'Asia/Shanghai' })
  assert.equal(applied.status, 200)
  const afterApply = await state()
  assert.equal(afterApply.plans.length, 1)
  assert.equal(afterApply.plans[0].startAt, '2026-11-02T09:00:00+08:00')
  assert.equal(afterApply.templates.length, 1)
  assert.equal(afterApply.templateUndo, true)
  assert.deepEqual(afterApply.blocks, [])
  const undone = await command({ domain: 'time', op: 'template.undo', targetDate: '2026-11-02', timeZone: 'Asia/Shanghai' })
  assert.equal(undone.status, 200)
  const afterUndo = await state()
  assert.deepEqual(afterUndo.plans, [original])
  assert.equal(afterUndo.templateUndo, false)
})

test('Secretary composition registers one coherent assistant and user-only GTD skills over SQLite services', async (t) => {
  const harness = await sqliteHarness(t)
  const gtdAgent = await import('dsh-secretary-gtd/agent')
  const secretary = await import('dsh-secretary')
  await harness.ctx.plugin(gtdAgent)
  await harness.ctx.plugin(secretary, { defaultTimeZone: 'Asia/Shanghai' })

  assert.equal(harness.skills.get('gtd-inbox-capture').invocation.modelInvocable, false)
  assert.equal(harness.skills.get('gtd-inbox-capture').invocation.userInvocable, true)
  assert.equal(harness.skills.get('gtd-clarify').invocation.modelInvocable, false)
  assert.equal(harness.skills.get('gtd-clarify').invocation.userInvocable, true)
  assert.equal(harness.skills.get('secretary').invocation.modelInvocable, true)
  assert.equal(harness.skills.get('secretary').invocation.userInvocable, true)
  assert.ok(harness.ctx.gtd instanceof GtdService)
  assert.ok(harness.ctx.tags instanceof TagService)
  assert.ok(harness.ctx.time instanceof TimeService)
  for (const name of ['secretary_gtd', 'secretary_tag', 'secretary_time']) {
    assert.equal(harness.tools.get(name).parameters.oneOf, undefined)
    assert.equal(harness.tools.get(name).parameters.type, 'object')
  }
  assert.equal(harness.tools.has('secretary_time_block'), false)
  assert.equal(harness.tools.has('secretary_statistics'), false)
  assert.ok(harness.routes.has('/api/secretary.state'))
  assert.ok(harness.routes.has('/api/secretary.command'))

  const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  for (const row of [
    "name: '@deepseek-ai/dsh-storage-sqlite'",
    "name: 'dsh-secretary-storage'",
    "name: 'dsh-secretary-gtd'",
    "name: 'dsh-secretary-tag'",
    "name: 'dsh-secretary-time-block'",
    "name: 'dsh-secretary-panel'",
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
})

test('Action scheduling fields stay editable and Availability remains derived through the public tool', async (t) => {
  const harness = await sqliteHarness(t)
  const captured = await execute(harness, 'secretary_gtd', {
    op: 'inbox.capture', title: '更新行动约束', raw: '更新行动的日期与估计。', source: 'user_request',
  })
  const clarified = await execute(harness, 'secretary_gtd', {
    op: 'inbox.clarify',
    id: captured.item.id,
    project: { title: '约束项目', outcome: '日期与估计可以维护。', type: 'sequential' },
    action: { title: '维护约束' },
  })
  const tool = harness.tools.get('secretary_gtd')
  const updateSchema = tool.parameters
  for (const field of ['deferAt', 'dueAt', 'estimatedMinutes']) {
    assert.ok(updateSchema.properties[field], `action.update is missing ${field}`)
  }

  const deferred = await execute(harness, 'secretary_gtd', {
    op: 'action.update',
    id: clarified.action.id,
    deferAt: '2099-01-01T09:00:00+08:00',
    dueAt: '2099-01-02T17:00:00+08:00',
    estimatedMinutes: 45,
  })
  assert.equal(deferred.action.deferAt, '2099-01-01T09:00:00+08:00')
  assert.equal(deferred.action.dueAt, '2099-01-02T17:00:00+08:00')
  assert.equal(deferred.action.estimatedMinutes, 45)
  assert.equal(deferred.action.availability, 'blocked')

  const cleared = await execute(harness, 'secretary_gtd', {
    op: 'action.update',
    id: clarified.action.id,
    deferAt: null, dueAt: null, estimatedMinutes: null,
  })
  assert.equal(cleared.action.deferAt, undefined)
  assert.equal(cleared.action.dueAt, undefined)
  assert.equal(cleared.action.estimatedMinutes, undefined)
  assert.equal(cleared.action.availability, 'available')
  await assert.rejects(
    execute(harness, 'secretary_gtd', { op: 'action.update', id: clarified.action.id, estimatedMinutes: -2 }),
    /positive integer/,
  )
  const unchanged = await execute(harness, 'secretary_gtd', { op: 'action.get', id: clarified.action.id })
  assert.equal(unchanged.action.estimatedMinutes, undefined)
  await assert.rejects(
    execute(harness, 'secretary_gtd', {
      op: 'action.update', id: clarified.action.id, action: { preparationResultRef: 'nested-by-mistake' },
    }),
    /top-level/,
  )

  const completed = await execute(harness, 'secretary_gtd', {
    op: 'action.complete', id: clarified.action.id, completedAt: '2026-10-29T20:05:00+08:00',
  })
  assert.equal(completed.action.availability, 'unavailable')
})

test('clarification restores the original Inbox and removes partial writes after backend failures', async (t) => {
  for (const failOn of [{ put: 'actions' }, { delete: 'inbox' }]) {
    const harness = await sqliteHarness(t, undefined, failOn)
    const captured = await execute(harness, 'secretary_gtd', {
      op: 'inbox.capture', title: '原子澄清', raw: '失败时不能留下半承接状态。', source: 'user_request',
    })
    await assert.rejects(
      execute(harness, 'secretary_gtd', {
        op: 'inbox.clarify', id: captured.item.id,
        project: { title: '原子项目', outcome: '失败时全部回滚。', type: 'sequential' },
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
