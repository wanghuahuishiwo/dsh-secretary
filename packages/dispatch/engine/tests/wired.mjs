/**
 * The engine wired to a `dispatchMessaging` service (#102), without a Gateway: the subscription handler, the Outbox
 * and the Inbox are the real ones; only the NATS side is a stand-in that hands delivered events to the handler.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { openOutbox } from 'dsh-secretary-dispatch-messaging'
import { defineNode } from '../lib/contract.js'
import { name, apply } from '../lib/index.js'

const plugin = { name, inject: ['dispatchMessaging'], apply }

const ticket = { type: 'ticket', check: value => typeof value === 'string' }
const text = { type: 'text', check: value => typeof value === 'string' }
const STARTED = 'graph.instance.started'
const FINISHED = 'graph.instance.finished'
const NODE_ID = '6f1c0f36-3d3e-4c3a-9c1f-2b7d5a0e8c11'

async function until(predicate) {
  for (const deadline = Date.now() + 5_000; !predicate(); await new Promise(resolve => setTimeout(resolve, 5))) {
    if (Date.now() > deadline) assert.fail('condition not met in time')
  }
}

/** A host whose `dispatchMessaging` is a stand-in: real Outbox file, subscriptions kept in memory. */
async function wired(t, { role = 'center', publish = [STARTED, FINISHED, 'work.reported'], subscribe = ['task.assigned'], dir } = {}) {
  dir ??= mkdtempSync(join(tmpdir(), 'dispatch-engine-wired-'))
  const outbox = openOutbox(join(dir, 'outbox.sqlite'))
  const handlers = new Map()
  const messaging = {
    role, nodeId: role === 'node' ? NODE_ID : undefined, outbox, catalog: { publish, subscribe },
    async subscribe({ type }, handler) { handlers.set(type, handler); return { type, subject: type, durable: type, stop: async () => { handlers.delete(type) } } },
  }
  const ctx = new Context()
  ctx.provide('dispatchMessaging', messaging)
  t.after(() => { ctx.fiber.dispose(); outbox.close(); rmSync(dir, { recursive: true, force: true }) })
  ctx.plugin(plugin, { role })
  await until(() => ctx.get('dispatchEngine') !== undefined)
  /** What `deliver` does for one message: acceptance and handler in one transaction, nothing else. */
  const deliver = (event, seq = 1) => {
    const meta = { subject: `dsh.events.${event.type}`, stream: 'dsh-events', seq }
    return outbox.transaction(tx => (tx.accept(event, meta) ? handlers.get(event.type)(event, meta, tx) : undefined))
  }
  return { ctx, engine: ctx.dispatchEngine, outbox, deliver, handlers }
}

test('wired: the role subscribes to its catalog, a delivered entry event opens an instance and the Outbox receives started, the node event and finished in order', async t => {
  const { engine, outbox, deliver, handlers } = await wired(t)
  assert.deepEqual([...handlers.keys()], ['task.assigned'], 'one subscription per declared type')
  let runs = 0
  engine.nodes.register(defineNode({ name: 'work', inputs: { ticket }, outputs: { note: text }, async run(ctx, { ticket }) {
    runs += 1
    await ctx.activities.emit({ type: 'work.reported', data: { note: `done ${ticket}` } })
    return { note: `done ${ticket}` }
  } }))
  engine.declareEntry({ graph: 'task', on: 'task.assigned', node: 'work', output: { ticket }, adapt: event => event.data })

  await deliver({ id: 'e1', type: 'task.assigned', source: 'urn:dsh:node:x', data: { ticket: 'T-1' } })
  await until(() => outbox.entries().length === 3)

  const [started, nodeEvent, finished] = outbox.entries().map(entry => entry.event)
  assert.deepEqual([started.type, nodeEvent.type, finished.type], [STARTED, 'work.reported', FINISHED])
  const [instanceId] = engine.history.instanceIds()
  assert.deepEqual(started.data, { instanceId, graphId: 'task', entryEventId: 'e1' })
  assert.deepEqual(nodeEvent.data, { note: 'done T-1' }, 'the node event data is passed through as is')
  assert.deepEqual(finished.data, { instanceId, graphId: 'task', outcome: 'ok' })
  assert.ok([started, nodeEvent, finished].every(event => event.source === 'urn:dsh:center' && event.specversion === '1.0'))
  assert.deepEqual(engine.history.listByEventId('e1').map(r => r.kind), ['instance.opened'])
  assert.deepEqual(engine.history.listByInstance(instanceId).map(r => r.kind), ['instance.opened', 'node.started', 'activity.completed', 'node.completed'])
  assert.deepEqual(outbox.db.prepare('SELECT kind FROM history ORDER BY seq').all().map(row => row.kind), ['instance.opened', 'node.started', 'activity.completed', 'node.completed'], 'the history is a table of the Outbox file')
  assert.equal(runs, 1)
})

test('wired: a delivered event no entry claims is recorded as unmatched and queues nothing; an accepted id is not handled twice', async t => {
  const { engine, outbox, deliver, handlers } = await wired(t, { subscribe: ['task.assigned', 'nobody.listens'] })
  assert.deepEqual([...handlers.keys()], ['task.assigned', 'nobody.listens'])
  const event = { id: 'e9', type: 'nobody.listens', source: 'urn:dsh:node:x', data: null }
  await deliver(event)
  await deliver(event)
  await until(() => outbox.db.prepare('SELECT COUNT(*) AS n FROM history').get().n === 1)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(engine.history.listByEventId('e9').map(r => [r.kind, r.instanceId, r.payload]), [['unmatched', null, { type: 'nobody.listens' }]])
  assert.deepEqual(outbox.entries(), [], 'no lifecycle event for an unmatched event')
})

test('wired: emit of an undeclared type fails the instance, and the failing node record and finished(error) are one commit', async t => {
  const { engine, outbox, deliver } = await wired(t, { publish: [STARTED, FINISHED] })
  engine.nodes.register(defineNode({ name: 'work', inputs: { ticket }, outputs: {}, async run(ctx, { ticket }) {
    await ctx.activities.emit({ type: 'work.reported', data: { note: ticket } })
    return {}
  } }))
  engine.declareEntry({ graph: 'task', on: 'task.assigned', node: 'work', output: { ticket }, adapt: event => event.data })

  await deliver({ id: 'e1', type: 'task.assigned', source: 'urn:dsh:node:x', data: { ticket: 'T-1' } })
  await until(() => outbox.entries().length === 2)

  const [started, finished] = outbox.entries().map(entry => entry.event)
  assert.deepEqual([started.type, finished.type], [STARTED, FINISHED])
  assert.deepEqual(finished.data, { instanceId: started.data.instanceId, graphId: 'task', outcome: 'error' })
  const records = engine.history.listByInstance(started.data.instanceId)
  assert.deepEqual(records.map(r => r.kind), ['instance.opened', 'node.started', 'node.completed'])
  assert.match(records.at(-1).payload.error, /messaging\/not-declared|未在 publish 中声明/)
})

test('wired: a catalog without the lifecycle types fails the engine to load; an entry whose type is not subscribed is refused when declared', async t => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  let subscriptions = 0
  ctx.provide('dispatchMessaging', {
    role: 'center', nodeId: undefined, outbox: openOutbox(join(mkdtempSync(join(tmpdir(), 'dispatch-engine-wired-')), 'outbox.sqlite')),
    catalog: { publish: [STARTED], subscribe: ['task.assigned'] }, async subscribe() { subscriptions += 1; throw new Error('not reached') },
  })
  ctx.plugin({ name, inject: ['dispatchMessaging'], apply }, { role: 'center' })
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.equal(ctx.get('dispatchEngine'), undefined, 'the engine is not provided')
  assert.equal(subscriptions, 0)

  const { engine } = await wired(t)
  engine.nodes.register(defineNode({ name: 'work', inputs: { ticket }, outputs: {}, async run() { return {} } }))
  assert.throws(
    () => engine.declareEntry({ graph: 'task', on: 'nobody.listens', node: 'work', output: { ticket }, adapt: event => event.data }),
    /nobody\.listens/,
  )
})

test('wired on a node: the source of lifecycle and node events is the node identity; a finished instance is not run or announced again', async t => {
  const { engine, outbox, deliver } = await wired(t, { role: 'node', publish: [STARTED, FINISHED, 'work.reported'], subscribe: ['task.assigned'] })
  let runs = 0
  engine.nodes.register(defineNode({ name: 'work', inputs: { ticket }, outputs: { note: text }, async run(ctx, { ticket }) {
    runs += 1
    await ctx.activities.emit({ type: 'work.reported', data: { note: ticket } })
    return { note: ticket }
  } }))
  engine.declareEntry({ graph: 'task', on: 'task.assigned', node: 'work', output: { ticket }, adapt: event => event.data })
  await deliver({ id: 'e1', type: 'task.assigned', source: 'urn:dsh:center', data: { ticket: 'T-1' } })
  await until(() => outbox.entries().length === 3)
  const [instanceId] = engine.history.instanceIds()
  assert.ok(outbox.entries().every(entry => entry.event.source === `urn:dsh:node:${NODE_ID}`))

  assert.deepEqual(await engine.resume(instanceId), { instanceId, status: 'completed', outputs: { note: 'T-1' } })
  assert.equal(runs, 1)
  assert.equal(outbox.entries().length, 3, 'no second finished event')
})

test('wired: an instance a previous host left unfinished is resumed when the engine loads, without repeating what already happened', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'dispatch-engine-wired-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  // The first host: `work` has emitted and completed, `report` is stuck in an activity when the host goes away.
  const before = await wired(t, { dir, subscribe: ['task.assigned', 'task.report'] })
  before.engine.nodes.register(defineNode({ name: 'work', inputs: { ticket }, outputs: { ticket }, async run(ctx, { ticket }) {
    await ctx.activities.emit({ type: 'work.reported', data: { ticket } })
    return { ticket }
  } }))
  before.engine.activities.register('wait', () => new Promise(() => {}))
  before.engine.nodes.register(defineNode({ name: 'report', inputs: { ticket }, outputs: { note: text }, async run(ctx, { ticket }) {
    await ctx.activities.wait({ ticket })
    return { note: `reported ${ticket}` }
  } }))
  before.engine.declareEntry({ graph: 'report', on: 'task.report', node: 'work', edges: [{ from: 'work', to: 'report' }], output: { ticket }, adapt: event => event.data })
  await before.deliver({ id: 'e1', type: 'task.report', source: 'urn:dsh:node:x', data: { ticket: 'T-3' } })
  await until(() => before.engine.history.listByInstance(before.engine.history.instanceIds()[0]).length === 5)
  const [instanceId] = before.engine.history.instanceIds()
  const queuedBefore = before.outbox.entries().map(entry => entry.event.id)
  before.ctx.fiber.dispose()

  // The restarted host: nodes are registered after the engine has loaded, as in a real assembly.
  let workRuns = 0
  let reportRuns = 0
  const after = await wired(t, { dir, subscribe: ['task.assigned', 'task.report'] })
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(after.outbox.entries().length, 2, 'nothing runs while the node it stopped at is not registered')
  after.engine.activities.register('wait', async () => 'waited')
  after.engine.nodes.register(defineNode({ name: 'work', inputs: { ticket }, outputs: { ticket }, async run() {
    workRuns += 1
    return {}
  } }))
  after.engine.nodes.register(defineNode({ name: 'report', inputs: { ticket }, outputs: { note: text }, async run(ctx, { ticket }) {
    reportRuns += 1
    await ctx.activities.wait({ ticket })
    return { note: `reported ${ticket}` }
  } }))
  await until(() => after.outbox.entries().length === 3)

  const [started, nodeEvent, finished] = after.outbox.entries().map(entry => entry.event)
  assert.deepEqual([started.type, nodeEvent.type, finished.type], [STARTED, 'work.reported', FINISHED])
  assert.deepEqual(finished.data, { instanceId, graphId: 'report', outcome: 'ok' })
  assert.deepEqual([started.id, nodeEvent.id], queuedBefore, 'started and the node event are the copies the first host queued')
  assert.deepEqual(after.engine.history.listByInstance(instanceId).map(r => [r.kind, r.nodeId ?? null]), [
    ['instance.opened', null], ['node.started', 'work'], ['activity.completed', 'work'], ['node.completed', 'work'], ['node.started', 'report'],
    ['node.started', 'report'], ['activity.completed', 'report'], ['node.completed', 'report'],
  ])
  assert.equal(workRuns, 0, 'the completed node was not re-run')
  assert.equal(reportRuns, 1)
})
