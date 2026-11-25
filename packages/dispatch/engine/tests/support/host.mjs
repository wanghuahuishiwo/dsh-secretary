/**
 * Test support for the #102 tracer: the test graph and the role realms of one DSH host, shared by the in-process
 * scenarios and by the child process that plays a crashing host.
 */
import { Context } from '@deepseek-ai/cordis'
import { jetstreamManager } from '@nats-io/jetstream'
import * as MESSAGING from 'dsh-secretary-dispatch-messaging'
import * as ENGINE from '../../lib/index.js'
import { defineNode } from '../../lib/index.js'

export const STARTED = ENGINE.STARTED
export const FINISHED = ENGINE.FINISHED
export const CENTER = {
  role: 'center',
  publish: [STARTED, FINISHED, 'task.assigned', 'task.report', 'task.broken', 'nobody.listens', 'work.reported'],
  subscribe: ['task.assigned', 'task.report', 'task.broken', 'nobody.listens'],
}
export const NODE = { role: 'node', initNodeId: true, publish: [STARTED, FINISHED, 'work.reported'], subscribe: ['task.assigned'] }

const ticket = { type: 'ticket', check: value => typeof value === 'string' }

/** The test graph: `work` reports through `emit`; `broken` throws; with `crash`, a `report` node follows `work` and calls it. */
export function graph(engine, crash, broken = true) {
  engine.nodes.register(defineNode({ name: 'work', inputs: { ticket }, outputs: { ticket }, async run(ctx, { ticket }) {
    await ctx.activities.emit({ type: 'work.reported', data: { ticket } })
    return { ticket }
  } }))
  engine.nodes.register(defineNode({ name: 'broken', inputs: { ticket }, outputs: {}, async run() { throw new Error('node blew up') } }))
  engine.declareEntry({ graph: 'task', on: 'task.assigned', node: 'work', output: { ticket }, adapt: event => event.data })
  if (broken) engine.declareEntry({ graph: 'broken', on: 'task.broken', node: 'broken', output: { ticket }, adapt: event => event.data })
  if (crash !== undefined) {
    engine.activities.register('crash', crash)
    engine.nodes.register(defineNode({ name: 'report', inputs: { ticket }, outputs: { ticket }, async run(ctx, inputs) {
      await ctx.activities.crash({})
      return inputs
    } }))
    engine.declareEntry({ graph: 'report', on: 'task.report', node: 'work', edges: [{ from: 'work', to: 'report' }], output: { ticket }, adapt: event => event.data })
  }
}

/** One DSH host: the root context with a `credentials` stub that holds the seeds by credential reference. */
export function host(seeds) {
  const root = new Context()
  const stored = seeds instanceof Map ? seeds : new Map(Object.entries(seeds))
  root.provide('credentials', { async resolve(ref) { const value = stored.get(String(ref)); return value === undefined ? undefined : { value, source: 'tracer' } } })
  return root
}

/** One role of a host: what the Loader does for `isolate: { dispatchMessaging: true, dispatchEngine: true, graphNodes: true }`. */
export async function bootRole(root, dshHome, config) {
  const realm = root.isolate('dispatchMessaging').isolate('dispatchEngine').isolate('graphNodes')
  await realm.plugin(MESSAGING, { dshHome, ...config })
  await realm.plugin(ENGINE, { role: config.role })
  return { realm, messaging: realm.get('dispatchMessaging'), engine: realm.get('dispatchEngine') }
}

/** Everything the stream holds, oldest first, as the JSON envelopes stored there. */
export async function streamEvents(nc) {
  const jsm = await jetstreamManager(nc)
  const total = (await jsm.streams.info('dsh-events')).state.messages
  const events = []
  for (let seq = 0; events.length < total;) {
    try { events.push(JSON.parse(new TextDecoder().decode((await jsm.streams.getMessage('dsh-events', { seq: ++seq })).data))) } catch { /* a deleted sequence */ }
  }
  return events
}
