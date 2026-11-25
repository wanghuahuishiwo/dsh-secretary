import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { defineNode } from '../lib/contract.js'
import { DispatchEngine, name, apply, fingerprint } from '../lib/index.js'

const fingerprintOf = async (name, args) => fingerprint(name, args)

const ticket = { type: 'ticket', check: value => typeof value === 'string' }
const text = { type: 'text', check: value => typeof value === 'string' }

function harness(t) {
  const dir = mkdtempSync(join(tmpdir(), 'dispatch-engine-'))
  const ctx = new Context()
  const engine = new DispatchEngine(ctx, { role: 'center', historyPath: join(dir, 'history.sqlite') })
  t.after(() => { engine.close(); ctx.fiber.dispose(); rmSync(dir, { recursive: true, force: true }) })
  return engine
}

test('a declared node and entry turn an event into an instance recorded in the history', async t => {
  const engine = harness(t)
  const disposeNode = engine.nodes.register(defineNode({
    name: 'assign',
    inputs: { ticket },
    outputs: { note: text },
    async run(_ctx, { ticket }) { return { note: `assigned ${ticket}` } },
  }))
  engine.declareEntry({ graph: 'dispatch', on: 'ticket.opened', node: 'assign', output: { ticket }, adapt: event => ({ ticket: event.data.ticket }) })

  const outcome = await engine.feed({ id: 'e1', type: 'ticket.opened', data: { ticket: 'T-1' } })

  assert.equal(outcome.matched, true)
  const records = engine.history.listByInstance(outcome.instanceIds[0])
  assert.deepEqual(records.map(r => [r.kind, r.nodeId ?? null, r.eventId ?? null]), [
    ['instance.opened', null, 'e1'],
    ['node.started', 'assign', null],
    ['node.completed', 'assign', null],
  ])
  assert.deepEqual(records[2].payload, { outputs: { note: 'assigned T-1' } })
  assert.ok(disposeNode() === undefined)
})

test('activity results are appended to the history and emit hands the event to the sink', async t => {
  const engine = harness(t)
  const emitted = []
  engine.setEmitSink(event => emitted.push(event))
  let agentRuns = 0
  engine.activities.register('agent', async ({ prompt }) => { agentRuns += 1; return { text: `done ${prompt}` } })
  engine.nodes.register(defineNode({
    name: 'work',
    inputs: { ticket },
    outputs: { note: text },
    async run(ctx, { ticket }) {
      const agent = await ctx.activities.agent({ prompt: ticket })
      await ctx.activities.emit({ type: 'work.reported', data: { note: agent.text } })
      return { note: agent.text }
    },
  }))
  engine.declareEntry({ graph: 'task', on: 'task.assigned', node: 'work', output: { ticket }, adapt: event => ({ ticket: event.data.ticket }) })

  const { instanceIds: [id] } = await engine.feed({ id: 'e1', type: 'task.assigned', data: { ticket: 'T-1' } })

  assert.deepEqual(engine.history.listByInstance(id).map(r => [r.kind, r.nodeId ?? null, r.payload]), [
    ['instance.opened', null, { node: 'work', edges: [], event: { id: 'e1', type: 'task.assigned', data: { ticket: 'T-1' } }, inputs: { ticket: 'T-1' } }],
    ['node.started', 'work', { inputs: { ticket: 'T-1' } }],
    ['activity.completed', 'work', { name: 'agent', fingerprint: await fingerprintOf('agent', { prompt: 'T-1' }), result: { text: 'done T-1' } }],
    ['activity.completed', 'work', { name: 'emit', fingerprint: await fingerprintOf('emit', { type: 'work.reported', data: { note: 'done T-1' } }), result: null }],
    ['node.completed', 'work', { outputs: { note: 'done T-1' } }],
  ])
  assert.deepEqual(emitted, [{ id: emitted[0].id, type: 'work.reported', data: { note: 'done T-1' } }])
  assert.match(emitted[0].id, /^[0-9a-f-]{36}$/)
  assert.equal(agentRuns, 1)
})

test('edges chain nodes in order and hand upstream outputs to the downstream node as its inputs', async t => {
  const engine = harness(t)
  const order = []
  engine.nodes.register(defineNode({
    name: 'work',
    inputs: { ticket },
    outputs: { note: text },
    async run(_ctx, { ticket }) { order.push(`work ${ticket}`); return { note: `done ${ticket}` } },
  }))
  engine.nodes.register(defineNode({
    name: 'report',
    inputs: { note: text },
    outputs: { note: text },
    async run(ctx, { note }) { order.push(`report ${note}`); await ctx.activities.emit({ type: 'work.reported', data: { note } }); return { note: `reported ${note}` } },
  }))
  engine.setEmitSink(() => {})
  engine.declareEntry({ graph: 'task', on: 'task.assigned', node: 'work', edges: [{ from: 'work', to: 'report' }], output: { ticket }, adapt: event => event.data })

  const { instanceIds: [id] } = await engine.feed({ id: 'e1', type: 'task.assigned', data: { ticket: 'T-1' } })

  assert.deepEqual(order, ['work T-1', 'report done T-1'])
  assert.deepEqual(engine.history.listByInstance(id).map(r => [r.kind, r.nodeId ?? null, r.payload.inputs ?? r.payload.outputs ?? null]), [
    ['instance.opened', null, { ticket: 'T-1' }],
    ['node.started', 'work', { ticket: 'T-1' }],
    ['node.completed', 'work', { note: 'done T-1' }],
    ['node.started', 'report', { note: 'done T-1' }],
    ['activity.completed', 'report', null],
    ['node.completed', 'report', { note: 'reported done T-1' }],
  ])
  assert.deepEqual(await engine.resume(id), { instanceId: id, status: 'completed', outputs: { note: 'reported done T-1' } })
  assert.deepEqual(order, ['work T-1', 'report done T-1'])
})

test('after a crash mid-chain, resume returns completed nodes from the history and only re-runs the unfinished node', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'dispatch-engine-'))
  const historyPath = join(dir, 'history.sqlite')
  const event = { id: 'e1', type: 'task.assigned', data: { ticket: 'T-1' } }
  const chain = (engine, state) => {
    engine.nodes.register(defineNode({ name: 'work', inputs: { ticket }, outputs: { note: text }, async run(_ctx, { ticket }) { state.work += 1; return { note: `done ${ticket}` } } }))
    engine.nodes.register(defineNode({
      name: 'report',
      inputs: { note: text },
      outputs: { note: text },
      async run(ctx, { note }) {
        state.report += 1
        const agent = await ctx.activities.agent({ prompt: note })
        await ctx.activities.emit({ type: 'work.reported', data: { note: agent.text } })
        return { note: agent.text }
      },
    }))
    engine.declareEntry({ graph: 'task', on: 'task.assigned', node: 'work', edges: [{ from: 'work', to: 'report' }], output: { ticket }, adapt: e => e.data })
  }
  const crashedState = { work: 0, report: 0 }
  const crashed = new DispatchEngine(new Context(), { role: 'node', historyPath })
  chain(crashed, crashedState)
  crashed.activities.register('agent', async () => ({ text: 'done' }))
  // The process dies while the emit is in flight: nothing after the agent turn reaches the history.
  crashed.setEmitSink(() => crashed.history.close())
  await assert.rejects(crashed.feed(event))
  assert.deepEqual(crashedState, { work: 1, report: 1 })

  const ctx = new Context()
  const engine = new DispatchEngine(ctx, { role: 'node', historyPath })
  t.after(() => { engine.close(); ctx.fiber.dispose(); rmSync(dir, { recursive: true, force: true }) })
  assert.deepEqual(engine.history.instanceIds().flatMap(id => engine.history.listByInstance(id).map(r => [r.kind, r.nodeId])), [
    ['instance.opened', undefined], ['node.started', 'work'], ['node.completed', 'work'], ['node.started', 'report'], ['activity.completed', 'report'],
  ])
  const state = { work: 0, report: 0 }
  const emitted = []
  let agentRuns = 0
  engine.setEmitSink(e => emitted.push(e))
  engine.activities.register('agent', async () => { agentRuns += 1; return { text: 'rerun' } })
  chain(engine, state)

  const outcome = await engine.resume(engine.history.instanceIds()[0])

  assert.deepEqual(outcome, { instanceId: engine.history.instanceIds()[0], status: 'completed', outputs: { note: 'done' } })
  assert.deepEqual(state, { work: 0, report: 1 })
  assert.equal(agentRuns, 0)
  assert.deepEqual(emitted.map(e => e.type), ['work.reported'])
  assert.deepEqual(engine.history.listByInstance(outcome.instanceId).map(r => [r.kind, r.nodeId, r.payload.inputs ?? r.payload.result ?? r.payload.outputs ?? r.payload.error ?? null]), [
    ['instance.opened', undefined, { ticket: 'T-1' }],
    ['node.started', 'work', { ticket: 'T-1' }],
    ['node.completed', 'work', { note: 'done T-1' }],
    ['node.started', 'report', { note: 'done T-1' }],
    ['activity.completed', 'report', { text: 'done' }],
    ['node.started', 'report', { note: 'done T-1' }],
    ['activity.completed', 'report', null],
    ['node.completed', 'report', { note: 'done' }],
  ])
})

function crashingWorker(engine, state) {
  engine.nodes.register(defineNode({
    name: 'work',
    inputs: { ticket },
    outputs: { note: text },
    async run(ctx, { ticket }) {
      const agent = await ctx.activities.agent({ prompt: `${ticket}${state.suffix}` })
      await ctx.activities.emit({ type: 'work.reported', data: { note: agent.text } })
      return { note: agent.text }
    },
  }))
  engine.declareEntry({ graph: 'task', on: 'task.assigned', node: 'work', output: { ticket }, adapt: event => ({ ticket: event.data.ticket }) })
}

test('after a crash mid-node, replay reuses the recorded agent turn and only runs what was never recorded', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'dispatch-engine-'))
  const historyPath = join(dir, 'history.sqlite')
  const crashed = new DispatchEngine(new Context(), { role: 'node', historyPath })
  let agentRuns = 0
  crashingWorker(crashed, { suffix: '' })
  crashed.activities.register('agent', async () => { agentRuns += 1; return { text: 'done' } })
  // The process dies while the emit is in flight: nothing after the agent turn reaches the history.
  crashed.setEmitSink(() => crashed.history.close())
  await assert.rejects(crashed.feed({ id: 'e1', type: 'task.assigned', data: { ticket: 'T-1' } }))
  assert.equal(agentRuns, 1)

  const ctx = new Context()
  const engine = new DispatchEngine(ctx, { role: 'node', historyPath })
  t.after(() => { engine.close(); ctx.fiber.dispose(); rmSync(dir, { recursive: true, force: true }) })
  const emitted = []
  engine.setEmitSink(event => emitted.push(event))
  engine.activities.register('agent', async () => { agentRuns += 1; return { text: 'rerun' } })
  crashingWorker(engine, { suffix: '' })

  const [id] = engine.history.instanceIds()
  const outcome = await engine.resume(id)

  assert.equal(outcome.status, 'completed')
  assert.deepEqual(outcome.outputs, { note: 'done' })
  assert.equal(agentRuns, 1)
  assert.deepEqual(emitted.map(event => event.type), ['work.reported'])
  assert.deepEqual(engine.history.listByInstance(id).map(r => r.kind), ['instance.opened', 'node.started', 'activity.completed', 'node.started', 'activity.completed', 'node.completed'])
})

test('replay reports the node when a call does not match the recorded fingerprint', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'dispatch-engine-'))
  const historyPath = join(dir, 'history.sqlite')
  const crashed = new DispatchEngine(new Context(), { role: 'node', historyPath })
  crashingWorker(crashed, { suffix: '' })
  crashed.activities.register('agent', async () => ({ text: 'done' }))
  crashed.setEmitSink(() => crashed.history.close())
  await assert.rejects(crashed.feed({ id: 'e1', type: 'task.assigned', data: { ticket: 'T-1' } }))

  const ctx = new Context()
  const engine = new DispatchEngine(ctx, { role: 'node', historyPath })
  t.after(() => { engine.close(); ctx.fiber.dispose(); rmSync(dir, { recursive: true, force: true }) })
  engine.setEmitSink(() => {})
  engine.activities.register('agent', async () => ({ text: 'rerun' }))
  crashingWorker(engine, { suffix: '-changed' })

  const [id] = engine.history.instanceIds()
  const outcome = await engine.resume(id)

  assert.equal(outcome.status, 'failed')
  assert.match(outcome.error, /non-deterministic node "work"/)
  assert.ok(!engine.history.listByInstance(id).some(r => r.kind === 'activity.completed' && r.payload.result.text === 'rerun'))
})

test('entries are checked against the entry node input ports when declared', t => {
  const engine = harness(t)
  engine.nodes.register(defineNode({ name: 'assign', inputs: { ticket }, outputs: {}, async run() { return {} } }))
  assert.throws(
    () => engine.declareEntry({ graph: 'dispatch', on: 'ticket.opened', node: 'missing', output: { ticket }, adapt: event => event.data }),
    /unregistered node "missing"/,
  )
  assert.throws(
    () => engine.declareEntry({ graph: 'dispatch', on: 'ticket.opened', node: 'assign', output: { ticket: text }, adapt: event => event.data }),
    /do not match the inputs of node "assign"/,
  )
  assert.throws(
    () => engine.declareEntry({ graph: 'dispatch', on: 'ticket.opened', node: 'assign', output: { ticket, extra: text }, adapt: event => event.data }),
    /do not match the inputs of node "assign"/,
  )
})

test('edges are checked against the port sets and type labels of both nodes when declared', t => {
  const engine = harness(t)
  engine.nodes.register(defineNode({ name: 'work', inputs: { ticket }, outputs: { note: text }, async run() { return { note: '' } } }))
  engine.nodes.register(defineNode({ name: 'report', inputs: { note: text }, outputs: { summary: text }, async run(_ctx, { note }) { return { summary: note } } }))
  engine.nodes.register(defineNode({ name: 'count', inputs: { note: { type: 'number', check: value => typeof value === 'number' } }, outputs: {}, async run() { return {} } }))
  const entry = { graph: 'task', on: 'task.assigned', node: 'work', output: { ticket }, adapt: event => event.data }
  assert.equal(engine.declareEntry({ ...entry, edges: [{ from: 'work', to: 'report' }] })(), undefined)

  assert.throws(
    () => engine.declareEntry({ ...entry, edges: [{ from: 'work', to: 'missing' }] }),
    /edge "work" -> "missing" names unregistered node "missing"/,
  )
  assert.throws(
    () => engine.declareEntry({ ...entry, edges: [{ from: 'missing', to: 'work' }] }),
    /edge "missing" -> "work" names unregistered node "missing"/,
  )
  assert.throws(
    () => engine.declareEntry({ ...entry, edges: [{ from: 'work', to: 'count' }] }),
    /edge "work" -> "count" output ports do not match the inputs of node "count": port "note" of output of node "work" \(type "text"\) is incompatible with port "note" of input of node "count" \(type "number"\)/,
  )
  assert.throws(
    () => engine.declareEntry({ ...entry, edges: [{ from: 'work', to: 'report' }, { from: 'work', to: 'count' }] }),
    /more than one edge from node "work"/,
  )
  assert.throws(
    () => engine.declareEntry({ ...entry, edges: [{ from: 'report', to: 'work' }] }),
    /edge into entry node "work"/,
  )
  assert.throws(
    () => engine.declareEntry({ ...entry, edges: [{ from: 'report', to: 'report' }] }),
    /edge cycle at node "report"/,
  )
  assert.throws(
    () => engine.declareEntry({ ...entry, edges: [{ from: 'work', to: 'report' }, { from: 'report', to: 'report' }] }),
    /has more than one edge into node "report"/,
  )
})

test('adapter output that fails the structural check fails the instance before the node runs', async t => {
  const engine = harness(t)
  let runs = 0
  engine.nodes.register(defineNode({ name: 'assign', inputs: { ticket }, outputs: {}, async run() { runs += 1; return {} } }))
  engine.declareEntry({ graph: 'dispatch', on: 'ticket.opened', node: 'assign', output: { ticket }, adapt: () => ({ ticket: 42 }) })
  const { instanceIds: [id] } = await engine.feed({ id: 'e1', type: 'ticket.opened', data: {} })
  const records = engine.history.listByInstance(id)
  assert.equal(runs, 0)
  assert.match(records.at(-1).payload.error, /input port "ticket" does not satisfy type "ticket"/)
})

test('an event no entry claims is recorded as unmatched and opens nothing', async t => {
  const engine = harness(t)
  const outcome = await engine.feed({ id: 'e9', type: 'nobody.listens' })
  assert.deepEqual(outcome, { matched: false, instanceIds: [] })
  assert.deepEqual(engine.history.listByEventId('e9').map(r => [r.kind, r.instanceId, r.graphId, r.payload]), [['unmatched', null, null, { type: 'nobody.listens' }]])
  assert.deepEqual(engine.history.instanceIds(), [])
})

test('center and node engines in one host keep registry, history and service apart', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'dispatch-engine-'))
  const ctx = new Context()
  t.after(() => { ctx.fiber.dispose(); rmSync(dir, { recursive: true, force: true }) })
  // What the Loader does for `isolate: { dispatchEngine: true, graphNodes: true }` on each entry.
  const realms = { center: ctx.isolate('dispatchEngine').isolate('graphNodes'), node: ctx.isolate('dispatchEngine').isolate('graphNodes') }
  realms.center.plugin({ name, apply }, { role: 'center', historyPath: join(dir, 'center-history.sqlite') })
  realms.node.plugin({ name, apply }, { role: 'node', historyPath: join(dir, 'node-history.sqlite') })
  await new Promise(resolve => setImmediate(resolve))
  const { center, node } = realms

  const emitted = []
  center.dispatchEngine.setEmitSink((event) => { emitted.push(event); return node.dispatchEngine.feed(event) })
  center.dispatchEngine.nodes.register(defineNode({ name: 'assign', inputs: { ticket }, outputs: { note: text }, async run(ctx, { ticket }) {
    await ctx.activities.emit({ type: 'task.assigned', data: { ticket } })
    return { note: 'sent' }
  } }))
  center.dispatchEngine.declareEntry({ graph: 'dispatch', on: 'ticket.opened', node: 'assign', output: { ticket }, adapt: event => event.data })
  const sameName = defineNode({ name: 'assign', inputs: { ticket }, outputs: { note: text }, async run(_ctx, { ticket }) { return { note: `ran on node ${ticket}` } } })
  node.dispatchEngine.nodes.register(sameName)
  node.dispatchEngine.declareEntry({ graph: 'task', on: 'task.assigned', node: 'assign', output: { ticket }, adapt: event => event.data })

  const outcome = await center.dispatchEngine.feed({ id: 'e1', type: 'ticket.opened', data: { ticket: 'T-1' } })

  assert.equal(outcome.matched, true)
  assert.ok(center.dispatchEngine !== node.dispatchEngine)
  assert.ok(center.graphNodes !== node.graphNodes)
  assert.deepEqual(center.dispatchEngine.nodes.list().map(n => n.name), ['assign'])
  assert.deepEqual(node.dispatchEngine.nodes.list().map(n => n.name), ['assign'])
  assert.deepEqual(node.dispatchEngine.history.listByEventId('e1'), [])
  const nodeInstance = node.dispatchEngine.history.instanceIds()
  assert.equal(nodeInstance.length, 1)
  assert.deepEqual(node.dispatchEngine.history.listByInstance(nodeInstance[0]).map(r => [r.kind, r.eventId ?? null, r.payload.outputs ?? null]), [
    ['instance.opened', emitted[0].id, null],
    ['node.started', null, null],
    ['node.completed', null, { note: 'ran on node T-1' }],
  ])
  assert.deepEqual(center.dispatchEngine.history.instanceIds().length, 1)
  center.dispatchEngine.close()
  node.dispatchEngine.close()
})

test('a failing activity or node marks the instance failed in the history, and a finished instance is not re-run', async t => {
  const engine = harness(t)
  let agentRuns = 0
  engine.nodes.register(defineNode({ name: 'work', inputs: { ticket }, outputs: {}, async run(ctx) { return { text: (await ctx.activities.agent({ prompt: 'go' })).text } } }))
  engine.declareEntry({ graph: 'task', on: 'task.assigned', node: 'work', output: { ticket }, adapt: event => event.data })
  const event = { id: 'e1', type: 'task.assigned', data: { ticket: 'T-1' } }
  const { instanceIds: [first] } = await engine.feed(event)
  assert.match(engine.history.listByInstance(first).at(-1).payload.error, /activity "agent" is not registered/)

  engine.activities.register('agent', async () => { agentRuns += 1; throw new Error('model down') })
  const { instanceIds: [second] } = await engine.feed(event)
  assert.equal(agentRuns, 1)
  assert.deepEqual(engine.history.listByInstance(second).map(r => r.kind), ['instance.opened', 'node.started', 'node.completed'])
  assert.match(engine.history.listByInstance(second).at(-1).payload.error, /model down/)
  assert.deepEqual(await engine.resume(second), { instanceId: second, status: 'failed', error: 'model down' })
  assert.equal(agentRuns, 1)
})

test('plugin entry provides ctx.dispatchEngine and ctx.graphNodes', t => {
  const dir = mkdtempSync(join(tmpdir(), 'dispatch-engine-'))
  const ctx = new Context()
  t.after(() => { ctx.fiber.dispose(); rmSync(dir, { recursive: true, force: true }) })
  ctx.plugin({ name, apply }, { role: 'node', historyPath: join(dir, 'history.sqlite') })
  return new Promise(resolve => setImmediate(resolve)).then(() => {
    assert.ok(ctx.dispatchEngine)
    assert.equal(ctx.graphNodes, ctx.dispatchEngine.nodes)
    ctx.dispatchEngine.close()
  })
})
