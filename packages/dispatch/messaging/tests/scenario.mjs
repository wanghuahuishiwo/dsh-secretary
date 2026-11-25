/**
 * Messaging tracer against a real Gateway (nats-server + JetStream): register(test, { strict }).
 * `strict` fails loudly when the binary is missing (bundle tracer); otherwise the tests are skipped unless
 * `DSH_NATS_SERVER` points at the binary. It is shared with `packages/bundle/secretary/tests/messaging.mjs`.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { jetstream, jetstreamManager } from '@nats-io/jetstream'
import { nkeyAuthenticator } from '@nats-io/nats-core'
import { connect } from '@nats-io/transport-node'
import {
  CREDENTIAL_REFS, gatewayPaths, isProcessAlive, locateNatsServer, probeGateway, saveSettings, startGateway, stopGateway,
} from 'dsh-secretary-dispatch-gateway'
import { SERVICE_KEY, STREAM_NAME, durableName, writePermissions } from 'dsh-secretary-dispatch-messaging'
import * as MESSAGING from 'dsh-secretary-dispatch-messaging'

const HINT = '需要真实的 nats-server 二进制。安装后重跑：brew install nats-server，或用 DSH_NATS_SERVER=<二进制路径> 指定。'

export async function requireNatsServer() {
  const configured = process.env.DSH_NATS_SERVER ?? 'nats-server'
  return { configured, ...(await locateNatsServer(configured)) }
}

async function freePort() {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise(resolve => server.close(resolve))
  return port
}

async function eventually(assertion, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      if (await assertion()) return
    } catch { /* keep waiting */ }
    if (Date.now() > deadline) assert.fail('condition not met in time')
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

/** A temporary DSH_HOME with a running Gateway and a `credentials` stub holding both seeds. */
async function startLink(t, binary) {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-secretary-messaging-home-'))
  const [clientPort, monitorPort] = await Promise.all([freePort(), freePort()])
  await saveSettings(dshHome, { mode: 'local', clientPort, monitorPort, binary, remote: { url: '', credentials: {} }, keys: null })
  const stored = new Map()
  t.after(async () => {
    try {
      await stopGateway(dshHome)
    } catch { /* already stopped */ }
    await rm(dshHome, { recursive: true, force: true })
  })
  const running = await startGateway(dshHome, { by: 'console', secrets: {
    async resolve(ref) { return stored.get(String(ref)) },
    async set(ref, value) { stored.set(String(ref), value) },
  } })
  assert.equal(running.state, 'running', JSON.stringify(running))
  // One DSH host: a root context with the credentials service and one isolated realm per role.
  const root = new Context()
  root.provide('credentials', { async resolve(ref) { const value = stored.get(String(ref)); return value === undefined ? undefined : { value, source: 'tracer' } } })
  t.after(() => root.fiber.dispose())
  const rawClients = []
  t.after(async () => { for (const nc of rawClients) await nc.close() })
  /** A client of the role's own NKey user that bypasses the plugin, as a misbehaving publisher would. */
  async function rawClient(role) {
    const nc = await connect({ port: clientPort, authenticator: nkeyAuthenticator(new TextEncoder().encode(stored.get(CREDENTIAL_REFS[role]))) })
    rawClients.push(nc)
    return nc
  }
  async function bootRole(config) {
    const realm = root.isolate(SERVICE_KEY)
    const plugin = realm.plugin(MESSAGING, { dshHome, ...config })
    await plugin
    return { realm, plugin, messaging: realm.get(SERVICE_KEY) }
  }
  return { dshHome, root, bootRole, rawClient, stored }
}

const CENTER = { role: 'center', publish: ['task.assigned'], subscribe: ['aone.bug.created', 'node.heartbeat'] }
/** The center before it declares an interest in node heartbeats. */
const CENTER_FIRST = { ...CENTER, subscribe: ['aone.bug.created'] }
const NODE = { role: 'node', initNodeId: true, publish: ['aone.bug.created', 'node.heartbeat'], subscribe: ['task.assigned'] }

/** Both roles linked through the Gateway with their permissions applied; collects what each role receives and rejects. */
async function linked(t, binary, { center: centerConfig = CENTER } = {}) {
  const link = await startLink(t, binary)
  // Declared first, so the derived nats-server.conf carries them when the Gateway starts.
  await writePermissions(link.dshHome, 'center', centerConfig)
  await writePermissions(link.dshHome, 'node', NODE)
  await stopGateway(link.dshHome)
  await startGateway(link.dshHome)
  const center = await link.bootRole(centerConfig)
  const node = await link.bootRole(NODE)
  const received = []
  const rejected = []
  for (const role of ['center', 'node']) {
    const { realm, messaging } = role === 'center' ? center : node
    realm.on('dispatch/envelope-rejected', event => { if (event.role === role) rejected.push({ role, ...event }) })
    for (const type of role === 'center' ? centerConfig.subscribe : NODE.subscribe) {
      await messaging.subscribe({ type }, (event, meta) => { received.push({ role, type, event, meta }) })
    }
  }
  return { ...link, center, node, received, rejected }
}

export function register(test, { strict }) {
  const binary = process.env.DSH_NATS_SERVER
  const skip = binary === undefined && !strict ? 'set DSH_NATS_SERVER=<nats-server binary> to run against a real Gateway' : false

  test('same host, two realms: center → node and node → center travel the real Gateway; wire format, Nats-Msg-Id, nodeId', { skip, timeout: 90_000 }, async t => {
    const probe = await requireNatsServer()
    if (!probe.found) assert.fail(`${HINT}（当前未找到 ${probe.configured}）`)
    const link = await linked(t, probe.found ? probe.configured : binary)
    assert.equal(link.root.get(SERVICE_KEY), undefined, 'the service key is private to each role realm')
    assert.notEqual(link.center.messaging, link.node.messaging)
    assert.equal(link.center.messaging.role, 'center')
    assert.equal(link.center.messaging.nodeId, undefined)
    assert.match(link.node.messaging.nodeId, /^[0-9a-f-]{36}$/)
    const { readNodeId, nodeIdPath } = MESSAGING
    assert.equal(await readNodeId(link.dshHome), link.node.messaging.nodeId)
    assert.equal(nodeIdPath(link.dshHome), join(link.dshHome, 'dispatch', 'node', 'identity.json'))

    const sent = await link.center.messaging.publish({ type: 'task.assigned', data: { task: 'T-1' } })
    assert.equal(sent.stream, STREAM_NAME)
    assert.equal(sent.event.source, 'urn:dsh:center')
    assert.equal(sent.event.specversion, '1.0')
    assert.equal(sent.duplicate, false)
    const back = await link.node.messaging.publish({ type: 'aone.bug.created', data: { bugId: 'T-1' } })
    assert.equal(back.event.source, `urn:dsh:node:${link.node.messaging.nodeId}`)
    await eventually(() => link.received.length === 2)
    const [toNode, toCenter] = [link.received.find(item => item.role === 'node'), link.received.find(item => item.role === 'center')]
    assert.deepEqual({ type: toNode.type, event: toNode.event, subject: toNode.meta.subject, seq: toNode.meta.seq },
      { type: 'task.assigned', event: sent.event, subject: 'dsh.events.task.assigned', seq: sent.seq })
    assert.deepEqual({ type: toCenter.type, event: toCenter.event, subject: toCenter.meta.subject, seq: toCenter.meta.seq },
      { type: 'aone.bug.created', event: back.event, subject: 'dsh.events.aone.bug.created', seq: back.seq })

    // What lies in the stream is the CloudEvents JSON with Nats-Msg-Id = event.id.
    const jsm = await jetstreamManager(await link.rawClient('node'))
    const info = await jsm.streams.info(STREAM_NAME)
    // The center also subscribed to node.heartbeat above, which is captured online like any other subscription.
    assert.deepEqual({ storage: info.config.storage, retention: info.config.retention, subjects: info.config.subjects },
      { storage: 'file', retention: 'limits', subjects: ['dsh.events.aone.bug.created', 'dsh.events.node.heartbeat', 'dsh.events.task.assigned'] })
    const stored = await jsm.streams.getMessage(STREAM_NAME, { seq: sent.seq })
    assert.equal(stored.subject, 'dsh.events.task.assigned')
    assert.equal(stored.header.get('Nats-Msg-Id'), sent.event.id)
    assert.deepEqual(JSON.parse(new TextDecoder().decode(stored.data)), sent.event)
    assert.equal(info.config.storage, 'file')

    // A type the role did not declare is refused before it reaches the Gateway.
    await assert.rejects(link.center.messaging.publish({ type: 'aone.bug.created', data: 1 }), { code: 'messaging/not-declared' })
    await assert.rejects(link.center.messaging.subscribe({ type: 'task.assigned' }, () => {}), { code: 'messaging/not-declared' })
    const conf = await (await import('node:fs/promises')).readFile(gatewayPaths(link.dshHome).conf, 'utf8')
    assert.match(conf, /"dsh\.events\.task\.assigned"/)
    for (const seed of link.stored.values()) assert.ok(!conf.includes(seed), 'no seed in the derived config')
  })

  test('a bad envelope is rejected and recorded, never delivered; a publish outside the role’s permissions is refused by the Gateway', { skip, timeout: 90_000 }, async t => {
    const probe = await requireNatsServer()
    if (!probe.found) assert.fail(`${HINT}（当前未找到 ${probe.configured}）`)
    const link = await linked(t, probe.found ? probe.configured : binary)
    // Cordis events cross role realms: every realm hears every rejection, so a listener tells them apart by `role`.
    const rejectedBy = role => link.rejected.filter(item => item.role === role)
    const rogue = jetstream(await link.rawClient('node'))
    const bad = { specversion: '1.0', id: '11111111-1111-4111-8111-111111111111', source: 'urn:dsh:center', type: 'aone.bug.created', time: '2026-11-14T10:00:00Z' }
    await rogue.publish('dsh.events.aone.bug.created', new TextEncoder().encode(JSON.stringify(bad)), { msgID: bad.id })
    const good = await link.node.messaging.publish({ type: 'aone.bug.created', data: { ok: true } })
    await eventually(() => link.received.length === 1 && rejectedBy('center').length === 1)
    assert.deepEqual(link.received[0].event, good.event, 'only the valid event reaches the handler')
    assert.equal(rejectedBy('center')[0].reason.includes('data'), true, rejectedBy('center')[0].reason)
    assert.equal(rejectedBy('node').length, 0, 'the node role does not subscribe to this subject')
    await new Promise(resolve => setTimeout(resolve, 300))
    assert.equal(link.received.length, 1, 'the rejected message is terminated, not redelivered')

    // The center user may publish task.assigned only: the Gateway refuses its publish on the node's subject outright.
    const centerRaw = jetstream(await link.rawClient('center'))
    await assert.rejects(
      centerRaw.publish('dsh.events.aone.bug.created', new TextEncoder().encode(JSON.stringify({ ...bad, source: 'urn:dsh:center', data: 1 })), { msgID: '22222222-2222-4222-8222-222222222222', timeout: 3_000 }),
      /Permissions Violation for Publish to "dsh\.events\.aone\.bug\.created"/,
    )
    const before = link.received.length
    const sneaky = { ...bad, type: 'task.assigned', source: 'urn:dsh:center', data: { forged: true } }
    await assert.rejects(
      rogue.publish('dsh.events.task.assigned', new TextEncoder().encode(JSON.stringify(sneaky)), { msgID: sneaky.id }),
      /Permissions Violation for Publish to "dsh\.events\.task\.assigned"/,
      'the node user has no publish right on task.assigned',
    )
    await new Promise(resolve => setTimeout(resolve, 500))
    assert.equal(link.received.length, before, 'nothing arrives')
  })

  test('after a Gateway restart both connections recover by the official reconnect and the durable consumers resume', { skip, timeout: 120_000 }, async t => {
    const probe = await requireNatsServer()
    if (!probe.found) assert.fail(`${HINT}（当前未找到 ${probe.configured}）`)
    const link = await linked(t, probe.found ? probe.configured : binary)
    const first = await link.center.messaging.publish({ type: 'task.assigned', data: { n: 1 } })
    await eventually(() => link.received.length === 1)
    const pid = (await startGateway(link.dshHome)).pid
    assert.ok(isProcessAlive(pid))
    await stopGateway(link.dshHome)
    const second = await link.center.messaging.publish({ type: 'task.assigned', data: { n: 2 } }).catch(error => ({ error }))
    await startGateway(link.dshHome)
    // A request issued while the official client is still reconnecting is dropped by the SDK (it times out, it is not
    // replayed), so wait for the plugin's own connection to answer again before publishing the second event.
    const { nc } = await link.center.messaging.session
    await eventually(async () => { await nc.request('$JS.API.STREAM.INFO.dsh-events', new Uint8Array(), { timeout: 500 }); return true })
    const third = second.error === undefined ? null : await link.center.messaging.publish({ type: 'task.assigned', data: { n: 2 } })
    await eventually(() => link.received.filter(item => item.role === 'node').length === 2)
    const seqs = link.received.filter(item => item.role === 'node').map(item => item.meta.seq).sort()
    assert.deepEqual(seqs, [first.seq, (third ?? second).seq])
  })

  test('a type declared later gets its stream capture and durable consumer online; the Gateway does not restart', { skip, timeout: 90_000 }, async t => {
    const probe = await requireNatsServer()
    if (!probe.found) assert.fail(`${HINT}（当前未找到 ${probe.configured}）`)
    // The center starts without node.heartbeat in its catalog: neither the stream nor a consumer knows the subject yet.
    const link = await linked(t, probe.found ? probe.configured : binary, { center: CENTER_FIRST })
    const subject = 'dsh.events.node.heartbeat'
    const durable = durableName('center', subject)
    const jsm = await jetstreamManager(await link.rawClient('center'))
    const durables = async () => (await jsm.consumers.list(STREAM_NAME).next()).map(info => info.name).sort()
    const pid = (await probeGateway(link.dshHome)).pid
    assert.ok(isProcessAlive(pid))
    assert.ok(!(await jsm.streams.info(STREAM_NAME)).config.subjects.includes(subject), 'the stream does not capture the subject yet')
    assert.ok(!(await durables()).includes(durable), 'no durable consumer for the subject yet')

    // The catalog is fixed when the plugin loads: a type outside it is refused locally, so a later declaration goes
    // through a plugin reload with the widened config (the cordis way to apply a new config), not a live API.
    await assert.rejects(link.center.messaging.subscribe({ type: 'node.heartbeat' }, () => {}), { code: 'messaging/not-declared' })
    const nodeSession = link.node.messaging.session
    await link.center.plugin.dispose()
    const center = await link.bootRole({ ...CENTER_FIRST, subscribe: [...CENTER_FIRST.subscribe, 'node.heartbeat'] })
    assert.equal((await probeGateway(link.dshHome)).pid, pid, 'the Gateway process is the same')
    assert.ok(isProcessAlive(pid))
    assert.equal(link.node.messaging.session, nodeSession, 'the node connection is not rebuilt')
    // The permissions the Gateway loaded at start do not list this subject for the center: the reload rewrites the
    // permissions file, and the running server must still deliver the new consumer's messages.
    const handle = await center.messaging.subscribe({ type: 'node.heartbeat' }, (event, meta) => { link.received.push({ role: 'center', type: 'node.heartbeat', event, meta }) })
    await eventually(async () => (await jsm.streams.info(STREAM_NAME)).config.subjects.includes(subject))
    assert.ok((await durables()).includes(durable))
    const heartbeat = await link.node.messaging.publish({ type: 'node.heartbeat', data: { up: true } })
    await eventually(() => link.received.some(item => item.type === 'node.heartbeat'))
    const got = link.received.find(item => item.type === 'node.heartbeat')
    assert.deepEqual([got.event, got.meta.subject, got.meta.seq, handle.subject, handle.durable], [heartbeat.event, subject, heartbeat.seq, subject, durable])
    await handle.stop()
    assert.equal((await probeGateway(link.dshHome)).pid, pid)
  })
}
