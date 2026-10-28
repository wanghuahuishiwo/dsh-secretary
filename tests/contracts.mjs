// Contract tests run against the built lib/index.js under plain Node.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

function memoryHost() {
  const tables = new Map()
  return {
    storageDomain: {
      open: async () => ({
        table(name) {
          if (!tables.has(name)) {
            const rows = new Map()
            tables.set(name, {
              get size() { return rows.size },
              get: id => rows.get(id),
              entries: () => rows.entries(),
              put: async (id, record) => { rows.set(id, record) },
              delete: async id => rows.delete(id),
            })
          }
          return tables.get(name)
        },
        close: async () => {},
      })
    },
  }
}

function deferredMemoryHost() {
  const host = memoryHost()
  const open = host.storageDomain.open
  host.storageDomain.open = async spec => {
    const domain = await open(spec)
    return {
      ...domain,
      table(name) {
        const table = domain.table(name)
        return {
          ...table,
          put: async (id, record) => {
            await Promise.resolve()
            await table.put(id, record)
          },
          delete: async id => {
            await Promise.resolve()
            return table.delete(id)
          },
        }
      },
    }
  }
  return host
}

test('plugin module loads', async () => {
  const mod = await import('../lib/index.js')
  assert.equal(typeof mod.apply, 'function')
  assert.equal(mod.name, 'dsh-secretary')
})

test('plugin Config implements Cordis Standard Schema validation', async () => {
  const mod = await import('../lib/index.js')
  const validate = mod.Config['~standard']?.validate
  assert.equal(typeof validate, 'function')
  const valid = validate({ timePlanPath: '/tmp/time-plan.md' })
  assert.equal(valid.issues, undefined)
  assert.equal(valid.value.defaultTimeZone, 'Asia/Shanghai')
  assert.equal(valid.value.timePlanPath, '/tmp/time-plan.md')
  assert.ok(validate({ timePlanPath: 'relative/time-plan.md' }).issues)
  assert.ok(validate({ defaultTimeZone: 'Invalid/TimeZone' }).issues)
  assert.deepEqual(JSON.parse(JSON.stringify(validate({}))), validate({}))
})

test('shared commands create and list two-level time categories', async () => {
  const mod = await import('../lib/index.js')
  const store = await mod.openSecretaryStore(memoryHost())
  try {
    const created = await mod.runSecretaryCommand(store, {
      op: 'timeCategory.create',
      name: '运动',
    })
    await mod.runSecretaryCommand(store, {
      op: 'timeCategory.create',
      parentId: created.category.id,
      name: '私教',
    })
    const listed = await mod.runSecretaryCommand(store, { op: 'timeCategory.list' })
    assert.deepEqual(listed.categories.map(category => category.name), ['运动', '私教'])
    assert.equal(listed.categories[1].parentId, created.category.id)
  } finally {
    await store.close()
  }
})

test('concrete actions keep occurrence history and complete independently', async () => {
  const mod = await import('../lib/index.js')
  const store = await mod.openSecretaryStore(memoryHost())
  try {
    const { category } = await mod.runSecretaryCommand(store, {
      op: 'timeCategory.create',
      name: '运动',
    })
    const { action: parent } = await mod.runSecretaryCommand(store, {
      op: 'action.create',
      title: '私教',
    })
    const { action: tuesday } = await mod.runSecretaryCommand(store, {
      op: 'action.create',
      parentId: parent.id,
      title: '周二 20:00 练胸私教课',
      timeCategoryId: category.id,
      planned: {
        startAt: '2026-10-27T20:00:00+08:00',
        endAt: '2026-10-27T21:00:00+08:00',
        timeZone: 'Asia/Shanghai',
      },
    })
    assert.equal(tuesday.estimatedMinutes, undefined)
    const { action: thursday } = await mod.runSecretaryCommand(store, {
      op: 'action.create',
      parentId: parent.id,
      title: '周四 20:00 练背私教课',
      timeCategoryId: category.id,
      planned: {
        startAt: '2026-10-29T20:00:00+08:00',
        endAt: '2026-10-29T21:00:00+08:00',
        timeZone: 'Asia/Shanghai',
      },
    })
    const actual = {
      startAt: '2026-10-27T20:05:00+08:00',
      endAt: '2026-10-27T21:02:00+08:00',
      timeZone: 'Asia/Shanghai',
    }
    const completed = await mod.runSecretaryCommand(store, {
      op: 'action.complete',
      id: tuesday.id,
      actual,
      actualSource: 'user_reported',
    })
    assert.deepEqual(completed.action.actual, actual)
    assert.deepEqual(completed.action.planned, tuesday.planned)
    assert.equal(completed.action.status, 'completed')
    const parentAfter = await mod.runSecretaryCommand(store, { op: 'action.get', id: parent.id })
    const thursdayAfter = await mod.runSecretaryCommand(store, { op: 'action.get', id: thursday.id })
    assert.equal(parentAfter.action.status, 'active')
    assert.equal(thursdayAfter.action.status, 'active')
    assert.equal(thursdayAfter.action.actual, undefined)
    assert.deepEqual(completed.ancestors.map(action => action.title), ['私教'])
  } finally {
    await store.close()
  }
})

test('updates, range queries, and restart preserve one action history', async () => {
  const mod = await import('../lib/index.js')
  const host = memoryHost()
  const store = await mod.openSecretaryStore(host)
  const { category } = await mod.runSecretaryCommand(store, { op: 'timeCategory.create', name: '技术' })
  const { action: created } = await mod.runSecretaryCommand(store, {
    op: 'action.create',
    title: '梳理 Action 数据契约',
    timeCategoryId: category.id,
    planned: {
      startAt: '2026-10-27T20:00:00+08:00',
      endAt: '2026-10-27T21:00:00+08:00',
      timeZone: 'Asia/Shanghai',
    },
  })
  const actual = {
    startAt: '2026-10-27T20:10:00+08:00',
    endAt: '2026-10-27T20:50:00+08:00',
    timeZone: 'Asia/Shanghai',
  }
  await mod.runSecretaryCommand(store, {
    op: 'action.complete',
    id: created.id,
    actual,
    actualSource: 'user_reported',
  })
  const planned = {
    startAt: '2026-10-28T20:00:00+08:00',
    endAt: '2026-10-28T21:00:00+08:00',
    timeZone: 'Asia/Shanghai',
  }
  await mod.runSecretaryCommand(store, {
    op: 'action.update',
    id: created.id,
    planned,
    note: '改到第二天，历史执行不变',
    preparationReminderId: 'reminder-1',
    preparationResultRef: '/tmp/secretary-preparation.md',
  })
  const queried = await mod.runSecretaryCommand(store, {
    op: 'action.list',
    timeKind: 'planned',
    from: '2026-10-28T00:00:00+08:00',
    to: '2026-10-29T00:00:00+08:00',
  })
  assert.deepEqual(queried.actions.map(action => action.id), [created.id])
  await store.close()

  const reopened = await mod.openSecretaryStore(host)
  try {
    const detail = await mod.runSecretaryCommand(reopened, { op: 'action.get', id: created.id })
    assert.deepEqual(detail.action.actual, actual)
    assert.deepEqual(detail.action.planned, planned)
    assert.equal(detail.action.preparationResultRef, '/tmp/secretary-preparation.md')
  } finally {
    await reopened.close()
  }
})

test('CRUD operations preserve hierarchy and category references', async () => {
  const mod = await import('../lib/index.js')
  const store = await mod.openSecretaryStore(memoryHost())
  try {
    const { category: root } = await mod.runSecretaryCommand(store, { op: 'timeCategory.create', name: '运动' })
    const { category: childCategory } = await mod.runSecretaryCommand(store, {
      op: 'timeCategory.create',
      parentId: root.id,
      name: '私教',
    })
    await mod.runSecretaryCommand(store, { op: 'timeCategory.update', id: childCategory.id, name: '私教课程' })
    const categoryDetail = await mod.runSecretaryCommand(store, { op: 'timeCategory.get', id: childCategory.id })
    assert.equal(categoryDetail.category.name, '私教课程')
    await assert.rejects(
      mod.runSecretaryCommand(store, { op: 'timeCategory.create', parentId: childCategory.id, name: '练胸' }),
      /two levels/,
    )

    const { action: parent } = await mod.runSecretaryCommand(store, { op: 'action.create', title: '私教' })
    const { action: child } = await mod.runSecretaryCommand(store, {
      op: 'action.create',
      parentId: parent.id,
      title: '周二练胸',
      timeCategoryId: childCategory.id,
    })
    const children = await mod.runSecretaryCommand(store, { op: 'action.list', parentId: parent.id })
    assert.deepEqual(children.actions.map(action => action.id), [child.id])
    await assert.rejects(
      mod.runSecretaryCommand(store, { op: 'action.update', id: parent.id, parentId: child.id }),
      /cycle|descendant/,
    )
    await assert.rejects(mod.runSecretaryCommand(store, { op: 'action.delete', id: parent.id }), /children/)
    await assert.rejects(mod.runSecretaryCommand(store, { op: 'timeCategory.delete', id: root.id }), /children/)
    await assert.rejects(mod.runSecretaryCommand(store, { op: 'timeCategory.delete', id: childCategory.id }), /in use/)

    await mod.runSecretaryCommand(store, { op: 'action.delete', id: child.id })
    await mod.runSecretaryCommand(store, { op: 'timeCategory.delete', id: childCategory.id })
    await mod.runSecretaryCommand(store, { op: 'timeCategory.delete', id: root.id })
    await mod.runSecretaryCommand(store, { op: 'action.delete', id: parent.id })
    const remaining = await mod.runSecretaryCommand(store, { op: 'action.list' })
    assert.deepEqual(remaining.actions, [])
  } finally {
    await store.close()
  }
})

test('unplanned actuals, field corrections, and completion without time stay flexible', async () => {
  const mod = await import('../lib/index.js')
  const store = await mod.openSecretaryStore(memoryHost())
  try {
    const { category: work } = await mod.runSecretaryCommand(store, { op: 'timeCategory.create', name: '工作' })
    const { category: review } = await mod.runSecretaryCommand(store, { op: 'timeCategory.create', name: '评审' })
    const actual = {
      startAt: '2026-10-27T16:00:00+08:00',
      endAt: '2026-10-27T16:40:00+08:00',
      timeZone: 'Asia/Shanghai',
    }
    const { action: unplanned } = await mod.runSecretaryCommand(store, {
      op: 'action.create',
      title: '临时处理 O1 评审',
      timeCategoryId: work.id,
      actual,
      actualSource: 'user_reported',
      use: 'parallel',
      note: '未提前安排',
    })
    assert.equal(unplanned.planned, undefined)
    assert.equal(unplanned.status, 'active')
    const corrected = await mod.runSecretaryCommand(store, {
      op: 'action.update',
      id: unplanned.id,
      title: '完成 O1 评审',
      timeCategoryId: review.id,
      estimatedMinutes: 45,
      use: 'dedicated',
      status: 'completed',
      note: null,
    })
    assert.equal(corrected.action.title, '完成 O1 评审')
    assert.equal(corrected.action.timeCategoryId, review.id)
    assert.equal(corrected.action.estimatedMinutes, 45)
    assert.equal(corrected.action.use, 'dedicated')
    assert.equal(corrected.action.note, undefined)
    assert.deepEqual(corrected.action.actual, actual)

    const { action: decision } = await mod.runSecretaryCommand(store, { op: 'action.create', title: '确认一个决定' })
    const completed = await mod.runSecretaryCommand(store, { op: 'action.complete', id: decision.id })
    assert.equal(completed.action.status, 'completed')
    assert.equal(completed.action.actual, undefined)

    const { action: planned } = await mod.runSecretaryCommand(store, {
      op: 'action.create',
      title: '可取消的安排',
      timeCategoryId: work.id,
      planned: {
        startAt: '2026-10-28T10:00:00+08:00',
        endAt: '2026-10-28T11:00:00+08:00',
        timeZone: 'Asia/Shanghai',
      },
    })
    const cleared = await mod.runSecretaryCommand(store, { op: 'action.update', id: planned.id, planned: null })
    assert.equal(cleared.action.planned, undefined)
    await assert.rejects(
      mod.runSecretaryCommand(store, { op: 'action.update', id: planned.id, actual, note: 'missing source' }),
      /actualSource/,
    )
  } finally {
    await store.close()
  }
})

test('agent assembly supports create, prepare, and complete through public tools', async () => {
  const mod = await import('../lib/index.js')
  const tools = []
  const skills = []
  const ctx = {
    ...memoryHost(),
    tools: { register: definition => { tools.push(definition); return () => {} } },
    skills: { register: definition => { skills.push(definition); return () => {} } },
    effect: register => register(),
  }
  await mod.apply(ctx, { defaultTimeZone: 'Asia/Shanghai', timePlanPath: '/tmp/time-plan.md' })
  const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]))
  assert.deepEqual(Object.keys(byName).sort(), ['secretary_action', 'secretary_time_category'])
  assert.equal(skills.length, 1)
  assert.equal(skills[0].invocation.modelInvocable, true)
  assert.ok(!skills[0].content.startsWith('---'))
  assert.match(skills[0].content, /\/tmp\/time-plan\.md/)

  const { category } = await byName.secretary_time_category.execute({ op: 'create', name: '运动' })
  const { action } = await byName.secretary_action.execute({
    op: 'create',
    title: '周二 20:00 练胸私教课',
    timeCategoryId: category.id,
    planned: {
      startAt: '2026-10-27T20:00:00+08:00',
      endAt: '2026-10-27T21:00:00+08:00',
      timeZone: 'Asia/Shanghai',
    },
    preparationReminderId: 'reminder-private-lesson',
  })
  await byName.secretary_action.execute({
    op: 'update',
    id: action.id,
    preparationResultRef: '/tmp/private-lesson-preparation.md',
  })
  const prepared = await byName.secretary_action.execute({ op: 'get', id: action.id })
  assert.equal(prepared.action.preparationResultRef, '/tmp/private-lesson-preparation.md')
  assert.equal(prepared.action.actual, undefined)
  assert.equal(prepared.action.status, 'active')

  const completed = await byName.secretary_action.execute({
    op: 'complete',
    id: action.id,
    actual: {
      startAt: '2026-10-27T20:03:00+08:00',
      endAt: '2026-10-27T21:01:00+08:00',
      timeZone: 'Asia/Shanghai',
    },
    actualSource: 'user_reported',
  })
  assert.equal(completed.action.status, 'completed')
  assert.equal(completed.action.actualSource, 'user_reported')
})

test('preset mounts secretary-only tools, persona, skill loader, and native reminders', async () => {
  const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.match(patch, /id: preset-secretary/)
  assert.match(patch, /name: '@deepseek-ai\/dsh-agent-preset'/)
  assert.match(patch, /id: secretary\n\s+name: Secretary/)
  assert.doesNotMatch(patch, /^    - id: secretary$/m)
  for (const dependency of ['dsh-persona', 'dsh-tool-fs', 'dsh-tool-fs-search', 'dsh-tool-schedule', 'dsh-tool-skill']) {
    assert.match(patch, new RegExp(`@deepseek-ai/${dependency}`))
  }
  assert.match(patch, /name: 'dsh-secretary'/)
  assert.match(patch, /sampleOverCapGlobResults: false/)
  assert.match(patch, /准备不写 actual、不自动完成 Action/)
})

test('invalid dates and unsupported actual provenance fail without mutation', async () => {
  const mod = await import('../lib/index.js')
  const store = await mod.openSecretaryStore(memoryHost())
  try {
    const { category } = await mod.runSecretaryCommand(store, { op: 'timeCategory.create', name: '工作' })
    await assert.rejects(
      mod.runSecretaryCommand(store, {
        op: 'action.create',
        title: '不存在的日期',
        timeCategoryId: category.id,
        planned: {
          startAt: '2026-02-30T10:00:00+08:00',
          endAt: '2026-02-30T11:00:00+08:00',
          timeZone: 'Asia/Shanghai',
        },
      }),
      /ISO time|valid/,
    )
    const { action } = await mod.runSecretaryCommand(store, { op: 'action.create', title: '只确认完成' })
    await assert.rejects(
      mod.runSecretaryCommand(store, { op: 'action.complete', id: action.id, actualSource: 'user_reported' }),
      /actualSource|actual time/,
    )
    const after = await mod.runSecretaryCommand(store, { op: 'action.get', id: action.id })
    assert.equal(after.action.status, 'active')
    assert.equal(after.action.actualSource, undefined)
    const listed = await mod.runSecretaryCommand(store, { op: 'action.list' })
    assert.deepEqual(listed.actions.map(item => item.id), [action.id])
  } finally {
    await store.close()
  }
})

test('action command results survive lossless JSON normalization', async () => {
  const mod = await import('../lib/index.js')
  const store = await mod.openSecretaryStore(memoryHost())
  const roundTrip = value => JSON.parse(JSON.stringify(value))
  try {
    const created = await mod.runSecretaryCommand(store, { op: 'action.create', title: '无额外字段' })
    assert.deepEqual(roundTrip(created), created)
    const fetched = await mod.runSecretaryCommand(store, { op: 'action.get', id: created.action.id })
    assert.deepEqual(roundTrip(fetched), fetched)
    const listed = await mod.runSecretaryCommand(store, { op: 'action.list' })
    assert.deepEqual(roundTrip(listed), listed)
    const updated = await mod.runSecretaryCommand(store, { op: 'action.update', id: created.action.id, note: '保留 JSON 安全' })
    assert.deepEqual(roundTrip(updated), updated)
    const completed = await mod.runSecretaryCommand(store, { op: 'action.complete', id: created.action.id })
    assert.deepEqual(roundTrip(completed), completed)
  } finally {
    await store.close()
  }
})

test('concurrent stores cannot create orphans or lose independent updates', async () => {
  const mod = await import('../lib/index.js')
  const host = deferredMemoryHost()
  const first = await mod.openSecretaryStore(host)
  const second = await mod.openSecretaryStore(host)
  try {
    const { action: parent } = await mod.runSecretaryCommand(first, { op: 'action.create', title: '父 Action' })
    const [deleted, created] = await Promise.allSettled([
      mod.runSecretaryCommand(second, { op: 'action.delete', id: parent.id }),
      mod.runSecretaryCommand(first, { op: 'action.create', parentId: parent.id, title: '子 Action' }),
    ])
    assert.equal(deleted.status, 'fulfilled')
    assert.equal(created.status, 'rejected')
    const afterDelete = await mod.runSecretaryCommand(first, { op: 'action.list' })
    assert.deepEqual(afterDelete.actions, [])

    const { action: editable } = await mod.runSecretaryCommand(first, { op: 'action.create', title: '原标题' })
    await Promise.all([
      mod.runSecretaryCommand(first, { op: 'action.update', id: editable.id, note: '并发备注' }),
      mod.runSecretaryCommand(second, { op: 'action.update', id: editable.id, title: '并发标题' }),
    ])
    const updated = await mod.runSecretaryCommand(first, { op: 'action.get', id: editable.id })
    assert.equal(updated.action.note, '并发备注')
    assert.equal(updated.action.title, '并发标题')
  } finally {
    await first.close()
    await second.close()
  }
})

test('tool schemas match operations and unload awaits store close', async () => {
  const mod = await import('../lib/index.js')
  const tools = []
  const disposers = []
  const ctx = {
    ...memoryHost(),
    tools: { register: definition => { tools.push(definition); return () => {} } },
    skills: { register: () => () => {} },
    effect: register => {
      const dispose = register()
      if (typeof dispose === 'function') disposers.push(dispose)
      return dispose
    },
  }
  await mod.apply(ctx)
  const actionTool = tools.find(tool => tool.name === 'secretary_action')
  assert.equal(actionTool.parameters.type, 'object')
  const create = actionTool.parameters.oneOf.find(schema => schema.properties.op.const === 'create')
  const update = actionTool.parameters.oneOf.find(schema => schema.properties.op.const === 'update')
  assert.equal(create.properties.status, undefined)
  assert.deepEqual(create.required.sort(), ['op', 'title'])
  assert.deepEqual(create.properties.note, { type: 'string' })
  assert.ok(update.properties.note.anyOf.some(schema => schema.type === 'null'))
  await assert.rejects(actionTool.execute({ op: 'create', title: '状态不能被丢弃', status: 'completed' }), /unknown|status/)
  const closeResult = disposers[0]()
  assert.equal(typeof closeResult?.then, 'function')
  await closeResult
})
