/**
 * Console read path (#105) against a real Gateway: the Host's center-credential connection discovers NATS services and
 * pages the event stream through an ephemeral pull consumer, whatever the roles declared in their event catalogs.
 * Runs only when `DSH_NATS_SERVER` names the nats-server binary (or it is on PATH).
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { jetstream, jetstreamManager } from '@nats-io/jetstream'
import { nkeyAuthenticator } from '@nats-io/nats-core'
import { Svcm } from '@nats-io/services'
import { connect } from '@nats-io/transport-node'
import { openEventHistory } from 'dsh-secretary-dispatch-engine/history'
import {
  CREDENTIAL_REFS, locateNatsServer, stopGateway,
} from 'dsh-secretary-dispatch-gateway'
import { writePermissions } from 'dsh-secretary-dispatch-messaging'
import { DispatchGatewayService } from '../lib/index.js'

const configured = process.env.DSH_NATS_SERVER ?? 'nats-server'
const skip = process.env.DSH_NATS_SERVER === undefined && !(await locateNatsServer(configured)).found
  ? 'set DSH_NATS_SERVER=<nats-server binary> to run against a real Gateway' : false

async function freePort() {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise(resolve => server.close(resolve))
  return port
}

const envelope = (type, data, n) => ({
  specversion: '1.0', id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  source: 'urn:dsh:node:11111111-1111-4111-8111-111111111111', type, time: `2026-11-26T01:00:0${n % 10}.000Z`,
  datacontenttype: 'application/json', data,
})

/** A Host service on a temporary DSH_HOME whose Gateway is started through its own Remote, plus a raw node user. */
async function harness(t, binary) {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-dispatch-console-'))
  const stored = new Map()
  const historyPath = join(dshHome, 'history.sqlite')
  const ctx = new Context()
  ctx.provide('credentials', {
    async resolve(ref) { const value = stored.get(String(ref)); return value === undefined ? undefined : { value, source: 'test' } },
    async set(ref, value) { stored.set(String(ref), value) },
  })
  const service = new DispatchGatewayService(ctx, { dshHome, historyPath })
  const clients = []
  t.after(async () => {
    for (const nc of clients) await nc.close()
    await ctx.fiber.dispose()
    try { await stopGateway(dshHome) } catch { /* never started */ }
    await rm(dshHome, { recursive: true, force: true })
  })
  // The node declares two published types; the center declares nothing at all. Reading must not depend on either.
  await writePermissions(dshHome, 'node', { publish: ['task.result', 'graph.instance.started'], subscribe: [] })
  const [clientPort, monitorPort] = await Promise.all([freePort(), freePort()])
  await service.updateSettings({ clientPort, monitorPort, binary })
  assert.equal((await service.start()).state, 'running')
  const node = async () => {
    const nc = await connect({ port: clientPort, authenticator: nkeyAuthenticator(new TextEncoder().encode(stored.get(CREDENTIAL_REFS.node))) })
    clients.push(nc)
    return nc
  }
  return { service, node, historyPath, clientPort }
}

async function publish(nc, events) {
  const js = jetstream(nc)
  await (await jetstreamManager(nc)).streams.add({ name: 'dsh-events', subjects: ['dsh.events.>'], storage: 'file', retention: 'limits' })
  for (const event of events) {
    await js.publish(`dsh.events.${event.type}`, new TextEncoder().encode(JSON.stringify(event)), { msgID: event.id, timeout: 5_000 })
  }
}

test('nodes: service discovery lists every online instance as returned, and nothing once it is gone', { skip, timeout: 60_000 }, async t => {
  const binary = (await locateNatsServer(configured)).found ? configured : undefined
  const { service, node } = await harness(t, binary)
  assert.equal(await service.listServices(), '[]', 'the wire carries JSON text')
  const nc = await node()
  const svc = await new Svcm(nc).add({ name: 'worker', version: '1.2.3', description: '测试 worker', metadata: { nodeId: 'n-1', region: 'sh' } })
  svc.addGroup('tasks').addEndpoint('run', () => {})
  let listed
  for (let attempt = 0; listed === undefined && attempt < 50; attempt += 1) {
    const found = JSON.parse(await service.listServices())
    if (found.length > 0) listed = found
    else await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.equal(listed.length, 1)
  assert.deepEqual(Object.keys(listed[0]).sort(), ['description', 'endpoints', 'id', 'metadata', 'name', 'type', 'version'])
  const { id, ...rest } = listed[0]
  assert.match(id, /^[A-Za-z0-9_-]+$/)
  assert.deepEqual(rest, {
    type: 'io.nats.micro.v1.info_response', name: 'worker', version: '1.2.3', description: '测试 worker',
    metadata: { nodeId: 'n-1', region: 'sh' },
    endpoints: [{ name: 'run', subject: 'tasks.run', queue_group: 'q' }],
  })
  await svc.stop()
  await new Promise(resolve => setTimeout(resolve, 300))
  assert.deepEqual(JSON.parse(await service.listServices()), [])
  assert.equal((await service.readStatus()).state, 'running', 'reading never touches the Gateway process')
})

test('events: the stream is paged newest-first with the engine history of each event, regardless of the declared catalogs', { skip, timeout: 60_000 }, async t => {
  const binary = (await locateNatsServer(configured)).found ? configured : undefined
  const { service, node, historyPath } = await harness(t, binary)
  // Before the first event there is no stream at all: the page is simply empty.
  assert.deepEqual(JSON.parse(await service.listEvents({ before: 10, limit: 200 })), { firstSeq: 0, lastSeq: 0, events: [] })
  const nc = await node()
  // Both types are the node's; the center's catalog is empty, yet it reads both as they lie.
  await publish(nc, [envelope('task.result', { n: 1 }, 1), envelope('graph.instance.started', { n: 2 }, 2), envelope('task.result', { n: 3 }, 3)])
  const history = openEventHistory(historyPath)
  history.append({ kind: 'instance.opened', instanceId: 'inst-1', graphId: 'g', eventId: '00000000-0000-4000-8000-000000000002', payload: { a: 1 } })
  history.append({ kind: 'unmatched', instanceId: null, graphId: null, eventId: '00000000-0000-4000-8000-000000000003', payload: null })
  history.close()

  const page = JSON.parse(await service.listEvents({}))
  assert.deepEqual([page.firstSeq, page.lastSeq], [1, 3])
  assert.deepEqual(page.events.map(item => [item.seq, item.subject, item.event.type, item.event.data, item.history.length]), [
    [3, 'dsh.events.task.result', 'task.result', { n: 3 }, 1],
    [2, 'dsh.events.graph.instance.started', 'graph.instance.started', { n: 2 }, 1],
    [1, 'dsh.events.task.result', 'task.result', { n: 1 }, 0],
  ])
  assert.deepEqual(page.events[1].event, envelope('graph.instance.started', { n: 2 }, 2), 'the envelope is passed through field by field')
  assert.equal(page.events[1].history[0].kind, 'instance.opened')
  assert.equal(page.events[1].history[0].instanceId, 'inst-1')
  assert.deepEqual(page.events[1].history[0].payload, { a: 1 })
  assert.deepEqual([page.events[0].history[0].kind, page.events[0].history[0].instanceId, page.events[0].history[0].payload], ['unmatched', null, null])

  // Smaller page, then further back from its oldest sequence; past the first message there is nothing more.
  const recent = JSON.parse(await service.listEvents({ limit: 1 }))
  assert.deepEqual(recent.events.map(item => item.seq), [3])
  const older = JSON.parse(await service.listEvents({ before: recent.events[0].seq, limit: 1 }))
  assert.deepEqual(older.events.map(item => item.seq), [2])
  const oldest = JSON.parse(await service.listEvents({ before: 2 }))
  assert.deepEqual(oldest.events.map(item => item.seq), [1])
  assert.deepEqual((JSON.parse(await service.listEvents({ before: 1 }))).events, [])
  const past = JSON.parse(await service.listEvents({ before: 99, limit: 2 }))
  assert.deepEqual(past.events.map(item => item.seq), [3, 2], 'a start past the end reads the newest page')

  // A new event pushes exactly one mark through the watch stream.
  const marks = []
  const reader = (async () => { for await (const mark of service.watch()) { marks.push(mark); if (marks.length === 1) break } })()
  await publish(nc, [envelope('task.result', { n: 4 }, 4)])
  await reader
  assert.deepEqual(marks, [{ changed: true }])
  const after = JSON.parse(await service.listEvents({}))
  assert.deepEqual([after.lastSeq, after.events[0].seq], [4, 4])
  // No host leftovers: the read path drops its ephemeral consumer once the page is read.
  const { consumers } = await jetstreamManager(nc)
  assert.deepEqual((await consumers.list('dsh-events').next()).map(info => info.name), [])
})
