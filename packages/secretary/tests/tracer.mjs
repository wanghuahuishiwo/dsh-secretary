import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import Storage, { storageBackendServiceKey } from '@deepseek-ai/dsh-storage'
import { SqliteStorageBackend } from '@deepseek-ai/dsh-storage-sqlite'
import { GtdService } from 'dsh-secretary-gtd/contract'
import { TimeBlockService } from 'dsh-secretary-time-block/contract'

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
    import('dsh-secretary-time-block'),
    import('dsh-secretary-time-block/tools'),
    import('dsh-secretary-statistics'),
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
  return { ctx, tools, skills, databasePath: resolvedDatabasePath, close }
}

function execute(harness, name, args) {
  const tool = harness.tools.get(name)
  assert.ok(tool, `missing public tool ${name}`)
  return tool.execute(args)
}

test('user delegates an outcome, negotiates time, completes it, and sees actual statistics', async (t) => {
  const harness = await sqliteHarness(t)

  const captured = await execute(harness, 'secretary_gtd', {
    op: 'inbox.capture',
    title: '准备产品评审',
    raw: '周五前准备好产品评审，先整理评审材料。',
    source: 'user_request',
  })
  assert.equal(captured.item.raw, '周五前准备好产品评审，先整理评审材料。')
  assert.equal(captured.item.status, 'open')

  const clarified = await execute(harness, 'secretary_gtd', {
    op: 'inbox.clarify',
    id: captured.item.id,
    project: {
      title: '产品评审',
      outcome: '评审材料完整，能够支持周五做出产品决策。',
      type: 'sequential',
    },
    action: {
      title: '整理评审材料',
      dueAt: '2026-10-30T17:00:00+08:00',
      estimatedMinutes: 60,
    },
  })
  assert.equal(clarified.project.status, 'active')
  assert.equal(clarified.action.projectId, clarified.project.id)
  assert.equal(clarified.action.status, 'active')
  assert.equal(clarified.action.availability, 'available')
  assert.deepEqual(JSON.parse(JSON.stringify(clarified)), clarified)
  assert.equal((await execute(harness, 'secretary_gtd', { op: 'inbox.list' })).items.length, 0)

  const proposed = await execute(harness, 'secretary_time_block', {
    op: 'create',
    actionId: clarified.action.id,
    planned: {
      startAt: '2026-10-28T19:00:00+08:00',
      endAt: '2026-10-28T20:00:00+08:00',
      timeZone: 'Asia/Shanghai',
    },
  })

  const rescheduled = await execute(harness, 'secretary_time_block', {
    op: 'update',
    id: proposed.block.id,
    planned: {
      startAt: '2026-10-29T19:00:00+08:00',
      endAt: '2026-10-29T20:00:00+08:00',
      timeZone: 'Asia/Shanghai',
    },
  })
  assert.equal(rescheduled.block.actual, undefined)
  assert.deepEqual(JSON.parse(JSON.stringify(rescheduled)), rescheduled)

  const actual = {
    startAt: '2026-10-29T19:10:00+08:00',
    endAt: '2026-10-29T20:05:00+08:00',
    timeZone: 'Asia/Shanghai',
  }
  await execute(harness, 'secretary_time_block', {
    op: 'record_actual',
    id: proposed.block.id,
    actual,
    actualSource: 'user_reported',
    focus: 'deep',
  })
  const movedAfterActual = await execute(harness, 'secretary_time_block', {
    op: 'update',
    id: proposed.block.id,
    planned: {
      startAt: '2026-10-30T19:00:00+08:00',
      endAt: '2026-10-30T20:00:00+08:00',
      timeZone: 'Asia/Shanghai',
    },
  })
  assert.deepEqual(movedAfterActual.block.actual, actual)
  assert.equal(movedAfterActual.block.planned.startAt, '2026-10-30T19:00:00+08:00')
  const completed = await execute(harness, 'secretary_gtd', {
    op: 'action.complete',
    id: clarified.action.id,
    completedAt: '2026-10-29T20:05:00+08:00',
  })
  assert.equal(completed.action.status, 'completed')
  assert.equal(completed.action.completedAt, '2026-10-29T20:05:00+08:00')

  const statistics = await execute(harness, 'secretary_statistics', {
    op: 'focus_by_hour',
    from: '2026-10-29T00:00:00+08:00',
    to: '2026-10-30T00:00:00+08:00',
  })
  assert.deepEqual(statistics.totals, { deep: 55, shallow: 0, unlabelled: 0 })
  assert.deepEqual(statistics.hours[19].minutes, { deep: 50, shallow: 0, unlabelled: 0 })
  assert.deepEqual(statistics.hours[20].minutes, { deep: 5, shallow: 0, unlabelled: 0 })
  assert.equal(statistics.hours.length, 24)

  const overnight = await execute(harness, 'secretary_time_block', {
    op: 'create',
    actionId: clarified.action.id,
    planned: {
      startAt: '2026-10-28T23:00:00+08:00',
      endAt: '2026-10-28T23:30:00+08:00',
      timeZone: 'Asia/Shanghai',
    },
  })
  await execute(harness, 'secretary_time_block', {
    op: 'record_actual',
    id: overnight.block.id,
    actual: {
      startAt: '2026-10-28T23:30:00+08:00',
      endAt: '2026-10-29T00:30:00+08:00',
      timeZone: 'Asia/Shanghai',
    },
    actualSource: 'user_reported',
    focus: 'shallow',
  })
  const clipped = await execute(harness, 'secretary_statistics', {
    op: 'focus_by_hour',
    from: '2026-10-29T00:00:00+08:00',
    to: '2026-10-30T00:00:00+08:00',
  })
  assert.deepEqual(clipped.totals, { deep: 55, shallow: 30, unlabelled: 0 })
  assert.deepEqual(clipped.hours[0].minutes, { deep: 0, shallow: 30, unlabelled: 0 })
  assert.deepEqual(clipped.hours[23].minutes, { deep: 0, shallow: 0, unlabelled: 0 })
})

test('GTD and TimeBlock facts reopen from the same SQLite file after a full shutdown', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-secretary-restart-'))
  const databasePath = join(directory, 'secretary.sqlite')
  t.after(async () => { await rm(directory, { recursive: true, force: true }) })

  const first = await sqliteHarness(t, databasePath)
  const captured = await execute(first, 'secretary_gtd', {
    op: 'inbox.capture', title: '持久化验证', raw: '重启后继续处理持久化验证。', source: 'user_request',
  })
  const clarified = await execute(first, 'secretary_gtd', {
    op: 'inbox.clarify',
    id: captured.item.id,
    project: { title: '持久化项目', outcome: '重启后事实仍然存在。', type: 'sequential' },
    action: { title: '验证重启恢复' },
  })
  const { block } = await execute(first, 'secretary_time_block', {
    op: 'create',
    actionId: clarified.action.id,
    planned: {
      startAt: '2026-10-29T19:00:00+08:00',
      endAt: '2026-10-29T20:00:00+08:00',
      timeZone: 'Asia/Shanghai',
    },
  })
  await execute(first, 'secretary_time_block', {
    op: 'record_actual',
    id: block.id,
    actual: {
      startAt: '2026-10-29T19:05:00+08:00',
      endAt: '2026-10-29T19:45:00+08:00',
      timeZone: 'Asia/Shanghai',
    },
    actualSource: 'user_reported',
    focus: 'shallow',
  })
  await first.close()

  const reopened = await sqliteHarness(t, databasePath)
  const action = await execute(reopened, 'secretary_gtd', { op: 'action.get', id: clarified.action.id })
  assert.equal(action.action.title, '验证重启恢复')
  assert.equal(action.action.projectId, clarified.project.id)
  const restored = await execute(reopened, 'secretary_time_block', { op: 'get', id: block.id })
  assert.equal(restored.block.actionId, clarified.action.id)
  assert.equal(restored.block.planned.startAt, '2026-10-29T19:00:00+08:00')
  assert.equal(restored.block.focus, 'shallow')
})

test('focus is a closed enum reported with actual time, never a lifecycle status or custom category', async (t) => {
  const harness = await sqliteHarness(t)
  const captured = await execute(harness, 'secretary_gtd', {
    op: 'inbox.capture', title: '记录状态', raw: '记录一段时间的状态。', source: 'user_request',
  })
  const clarified = await execute(harness, 'secretary_gtd', {
    op: 'inbox.clarify',
    id: captured.item.id,
    project: { title: '状态项目', outcome: '状态档位固定可查。', type: 'single_action_list' },
    action: { title: '记录状态' },
  })
  const { block } = await execute(harness, 'secretary_time_block', {
    op: 'create',
    actionId: clarified.action.id,
    planned: {
      startAt: '2026-10-29T09:00:00+08:00',
      endAt: '2026-10-29T10:00:00+08:00',
      timeZone: 'Asia/Shanghai',
    },
  })
  assert.equal(block.focus, undefined)

  await assert.rejects(
    execute(harness, 'secretary_time_block', {
      op: 'record_actual',
      id: block.id,
      actual: { startAt: '2026-10-29T09:00:00+08:00', endAt: '2026-10-29T10:00:00+08:00', timeZone: 'Asia/Shanghai' },
      actualSource: 'user_reported',
      focus: '专注',
    }),
    /invalid focus level/,
  )
  const recorded = await execute(harness, 'secretary_time_block', {
    op: 'record_actual',
    id: block.id,
    actual: { startAt: '2026-10-29T09:00:00+08:00', endAt: '2026-10-29T10:00:00+08:00', timeZone: 'Asia/Shanghai' },
    actualSource: 'user_reported',
    focus: 'deep',
  })
  assert.equal(recorded.block.focus, 'deep')

  const tool = harness.tools.get('secretary_time_block')
  assert.deepEqual(tool.parameters.properties.focus.enum, ['deep', 'shallow'])
  assert.equal(tool.parameters.properties.timeCategoryId, undefined)
  assert.ok(!tool.parameters.properties.op.enum.some(name => name.startsWith('category.')))
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
  assert.ok(harness.ctx.timeBlocks instanceof TimeBlockService)
  for (const name of ['secretary_gtd', 'secretary_time_block', 'secretary_statistics']) {
    assert.equal(harness.tools.get(name).parameters.oneOf, undefined)
    assert.equal(harness.tools.get(name).parameters.type, 'object')
  }

  const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  for (const row of [
    "name: '@deepseek-ai/dsh-storage-sqlite'",
    "name: 'dsh-secretary-storage'",
    "name: 'dsh-secretary-gtd'",
    "name: 'dsh-secretary-time-block'",
    "name: 'dsh-secretary-gtd/tools'",
    "name: 'dsh-secretary-time-block/tools'",
    "name: 'dsh-secretary-statistics'",
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
