/**
 * Test-only Host fixture of the console browser test (#105): a real link (Gateway started through the Host's own
 * Remote, one center and one node messaging realm in isolated realms), a hosted NATS service, engine history rows and
 * a trigger to publish more. Purpose-built for the test, never a production Remote.
 */
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Svcm } from '@nats-io/services'
import { openEventHistory } from 'dsh-secretary-dispatch-engine/history'
import * as MESSAGING from 'dsh-secretary-dispatch-messaging'

const CENTER = { role: 'center', publish: ['graph.instance.started', 'task.assigned'], subscribe: ['aone.bug.created', 'graph.instance.finished'] }
const NODE = { role: 'node', initNodeId: true, publish: ['aone.bug.created', 'graph.instance.finished'], subscribe: ['graph.instance.started', 'task.assigned'] }
/** Enough task events that the first page (200) is full and the oldest ones need the second page. */
export const TASK_EVENTS = 201

export const inject = ['connection']

export function apply(ctx) {
  let link
  let service

  async function handle(input) {
    if (input.op === 'link') {
      const { dshHome, historyPath, binary, clientPort, monitorPort } = input
      await MESSAGING.writePermissions(dshHome, 'node', { publish: NODE.publish, subscribe: NODE.subscribe })
      await MESSAGING.writePermissions(dshHome, 'center', { publish: CENTER.publish, subscribe: CENTER.subscribe })
      const gateway = ctx.get('dispatchGateway')
      await gateway.updateSettings({ clientPort, monitorPort, binary })
      await gateway.start()
      const boot = async config => {
        const realm = ctx.isolate(MESSAGING.SERVICE_KEY)
        await realm.plugin(MESSAGING, { dshHome, ...config })
        return realm.get(MESSAGING.SERVICE_KEY)
      }
      const center = await boot(CENTER)
      const node = await boot(NODE)
      link = { center, node }
      const published = []
      const publish = async (role, type, data) => {
        const sent = await link[role].publish({ type, data })
        published.push({ role, type, seq: sent.seq, event: sent.event })
        return sent
      }
      await publish('node', 'aone.bug.created', { bugId: 'AONE-1', title: '登录超时', nested: { ok: true, list: [1, 2, 3] } })
      const started = await publish('center', 'graph.instance.started', { graphId: 'g-1', instanceId: 'inst-1', input: 'AONE-1' })
      for (let n = 0; n < TASK_EVENTS; n += 1) await publish('center', 'task.assigned', { n, worker: `worker-${n % 3}` })
      const finished = await publish('node', 'graph.instance.finished', { graphId: 'g-1', instanceId: 'inst-1', outcome: 'done' })
      await mkdir(dirname(historyPath), { recursive: true })
      const history = openEventHistory(historyPath)
      const records = {
        [started.event.id]: { kind: 'instance.opened', instanceId: 'inst-1', graphId: 'g-1', eventId: started.event.id, payload: { input: 'AONE-1' } },
        [finished.event.id]: { kind: 'node.completed', instanceId: 'inst-1', graphId: 'g-1', nodeId: node.nodeId, eventId: finished.event.id, payload: { node: 'report', ok: true } },
      }
      const written = {}
      for (const [eventId, record] of Object.entries(records)) written[eventId] = history.append(record)
      history.close()
      const { nc } = await node.session
      service = await new Svcm(nc).add({ name: 'node-agent', version: '0.3.0', description: '节点代理', metadata: { nodeId: node.nodeId, region: 'sh' } })
      // No endpoint: an endpoint listens on its own subject, and which subjects a node may serve is not decided yet (#105 leaves service registration out).
      await new Promise(resolve => setTimeout(resolve, 200)) // let the service's subscriptions register
      return { nodeId: node.nodeId, published, service: service.info(), records: written }
    }
    if (input.op === 'discover') {
      const out = []
      try { for await (const info of await new Svcm((await link.center.session).nc).client().info()) out.push(info) } catch (error) { out.push({ error: String(error) }) }
      return out
    }
    if (input.op === 'publish') {
      const sent = await link[input.role].publish({ type: input.type, data: input.data })
      return { role: input.role, type: input.type, seq: sent.seq, event: sent.event }
    }
    if (input.op === 'stream') {
      const { streams } = await nodeManager()
      const info = await streams.info(MESSAGING.STREAM_NAME)
      const messages = []
      for (let seq = info.state.first_seq; seq <= info.state.last_seq; seq += 1) {
        const stored = await streams.getMessage(MESSAGING.STREAM_NAME, { seq })
        messages.push({ seq, subject: stored.subject, event: JSON.parse(new TextDecoder().decode(stored.data)) })
      }
      return { firstSeq: info.state.first_seq, lastSeq: info.state.last_seq, messages }
    }
    throw new Error(`unknown dispatch fixture op ${input.op}`)
  }

  async function nodeManager() {
    const { jetstreamManager } = await import('@nats-io/jetstream')
    return jetstreamManager((await link.node.session).nc)
  }

  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/secretary-test.dispatch', methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      try {
        return Response.json(await handle(await request.json()))
      } catch (error) {
        return Response.json({ error: String(error), stack: error?.stack }, { status: 500 })
      }
    },
  }), 'test-only dispatch fixture')
}
