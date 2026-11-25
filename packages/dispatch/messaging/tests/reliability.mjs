/**
 * Reliability tracer for #100 on a real Gateway (nats-server + JetStream), the four scenarios of #83:
 * register(test, { strict }). Crashes are real process exits of a child node process that hosts a role realm.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmod, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { jetstreamManager } from '@nats-io/jetstream'
import { eventually, requireNatsServer, startLink } from './scenario.mjs'

const HERE = new URL('.', import.meta.url).pathname
const HINT = '需要真实的 nats-server 二进制。安装后重跑：brew install nats-server，或用 DSH_NATS_SERVER=<二进制路径> 指定。'
const CENTER = { role: 'center', publish: ['task.assigned'], subscribe: ['aone.bug.created'] }
const NODE = { role: 'node', initNodeId: true, publish: ['aone.bug.created'], subscribe: ['task.assigned'] }

/** A real process that hosts role realms of this plugin and exits on its own; `seeds` go through a 0600 file. */
async function crashingHost(t, dshHome, seeds, body) {
  const seedFile = join(dshHome, 'seeds.json')
  await writeFile(seedFile, JSON.stringify(Object.fromEntries(seeds)), { mode: 0o600 })
  await chmod(seedFile, 0o600)
  const script = `
    import { readFile } from 'node:fs/promises'
    import { bootRoles } from ${JSON.stringify(new URL('./support/role.mjs', import.meta.url).pathname)}
    const { roles } = await bootRoles(${JSON.stringify(dshHome)}, ${JSON.stringify(seedFile)}, ${JSON.stringify([CENTER, NODE])})
    const out = value => process.stdout.write(JSON.stringify(value) + '\\n')
    await (${body})(roles, out)
  `
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], { cwd: HERE, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', stderr = ''
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })
  const exited = new Promise(resolve => child.on('exit', (code, signal) => resolve({ code, signal, stdout, stderr })))
  return { exited, child }
}

const linesOf = stdout => stdout.split('\n').filter(Boolean).map(line => JSON.parse(line))

async function link(t, binary) {
  const env = await startLink(t, binary)
  return env
}

export function register(test, { strict }) {
  const binary = process.env.DSH_NATS_SERVER
  const skip = binary === undefined && !strict ? 'set DSH_NATS_SERVER=<nats-server binary> to run against a real Gateway' : false
  const need = async () => {
    const probe = await requireNatsServer()
    if (!probe.found) assert.fail(`${HINT}（当前未找到 ${probe.configured}）`)
    return probe.found ? probe.configured : binary
  }

  test('#83 1: an event committed while the Gateway is down is relayed after the restart; the durable consumers resume', { skip, timeout: 120_000 }, async t => {
    const { stopGateway, startGateway, probeGateway, isProcessAlive } = await import('dsh-secretary-dispatch-gateway')
    const { writePermissions } = await import('dsh-secretary-dispatch-messaging')
    const { bootRoles } = await import('./support/role.mjs')
    const nats = await need()
    const link0 = await link(t, nats)
    await writePermissions(link0.dshHome, 'center', CENTER)
    await writePermissions(link0.dshHome, 'node', NODE)
    await stopGateway(link0.dshHome)
    await startGateway(link0.dshHome)
    const host = await bootRoles(link0.dshHome, Object.fromEntries(link0.stored), [CENTER, NODE])
    t.after(() => host.dispose())
    const { center, node } = host.roles
    const received = []
    await node.messaging.subscribe({ type: 'task.assigned' }, (event, meta) => { received.push({ event, seq: meta.seq }) })
    const first = await center.messaging.publish({ type: 'task.assigned', data: { n: 1 } })
    await eventually(() => received.length === 1)

    await stopGateway(link0.dshHome)
    // `publish` promises the event reaches the stream, not that it reaches it now: while the Gateway is down the
    // calls stay pending and the events sit in the Outbox.
    const during = [2, 3].map(n => center.messaging.publish({ type: 'task.assigned', data: { n } }))
    await new Promise(resolve => setTimeout(resolve, 1_500))
    assert.deepEqual(center.messaging.outbox.pending().map(entry => [entry.event.data.n, entry.status]), [[2, 'pending'], [3, 'pending']])
    assert.equal(received.length, 1)
    await startGateway(link0.dshHome)
    const relayed = await Promise.all(during)
    await eventually(() => received.length === 3)
    assert.deepEqual(relayed.map(item => item.seq).sort((a, b) => a - b), received.filter(item => item.seq !== first.seq).map(item => item.seq).sort((a, b) => a - b))
    const seqs = received.map(item => item.seq).sort((a, b) => a - b)
    assert.equal(seqs[0], first.seq)
    assert.deepEqual(received.map(item => item.event.data), [{ n: 1 }, { n: 2 }, { n: 3 }], 'in stream order after the restart')
    const jsm = await jetstreamManager(await link0.rawClient('node'))
    const durables = (await jsm.consumers.list('dsh-events').next()).map(info => info.name).sort()
    const { durableName } = await import('dsh-secretary-dispatch-messaging')
    const durable = durableName('node', 'dsh.events.task.assigned')
    assert.ok(durables.includes(durable), 'the node durable consumer survived the restart')
    const info = await jsm.consumers.info('dsh-events', durable)
    assert.equal(info.num_pending, 0)
    assert.ok(isProcessAlive((await probeGateway(link0.dshHome)).pid))
  })

  test('#83 2: a host that crashes after committing a business row and its event, before the relay publishes, delivers the same event.id on restart', { skip, timeout: 120_000 }, async t => {
    const nats = await need()
    const env = await link(t, nats)
    const { writePermissions, openOutbox, outboxPath } = await import('dsh-secretary-dispatch-messaging')
    const { bootRoles } = await import('./support/role.mjs')
    await writePermissions(env.dshHome, 'center', CENTER)
    await writePermissions(env.dshHome, 'node', NODE)
    const { stopGateway, startGateway } = await import('dsh-secretary-dispatch-gateway')
    await stopGateway(env.dshHome)
    await startGateway(env.dshHome)

    // The host dies right after the transaction returns: nothing has been published yet.
    const crash = await crashingHost(t, env.dshHome, env.stored, `(roles, out) => {
      const store = roles.center.messaging.outbox
      store.db.exec('CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, status TEXT NOT NULL)')
      const event = store.transaction(tx => {
        tx.db.prepare('INSERT INTO tickets VALUES (?, ?)').run('T-9', 'In Progress')
        return tx.publish({ type: 'task.assigned', data: { ticket: 'T-9' } }, 'urn:dsh:center')
      })
      out({ id: event.id })
      process.exit(7)
    }`)
    const dead = await crash.exited
    assert.equal(dead.code, 7, dead.stderr)
    assert.equal(dead.stdout.trim().split('\n').filter(Boolean).length, 1, dead.stderr)
    const [{ id }] = linesOf(dead.stdout)
    const onDisk = openOutbox(outboxPath(env.dshHome, 'center'))
    const [entry] = onDisk.pending()
    assert.deepEqual([entry.id, entry.status, entry.attempts], [id, 'pending', 0], 'the business row and the event were committed; the relay never ran')
    assert.deepEqual(onDisk.db.prepare('SELECT status FROM tickets').all().map(row => ({ ...row })), [{ status: 'In Progress' }])
    onDisk.close()

    const host = await bootRoles(env.dshHome, Object.fromEntries(env.stored), [CENTER, NODE])
    t.after(() => host.dispose())
    const received = []
    await host.roles.node.messaging.subscribe({ type: 'task.assigned' }, (event, meta) => { received.push({ event, seq: meta.seq }) })
    await eventually(() => received.length === 1)
    assert.deepEqual([received[0].event.id, received[0].event.data], [id, { ticket: 'T-9' }], 'the same event id, published by the restarted host')
    assert.equal(host.roles.center.messaging.outbox.entries()[0].status, 'published')
    const jsm = await jetstreamManager(await env.rawClient('node'))
    assert.equal((await jsm.streams.info('dsh-events')).state.messages, 1, 'one copy in the stream')
  })

  test('#83 3: a consumer that crashes after committing its acceptance, before the ACK, gets the event redelivered and does not repeat the effect', { skip, timeout: 120_000 }, async t => {
    const nats = await need()
    const env = await link(t, nats)
    const { writePermissions, durableName } = await import('dsh-secretary-dispatch-messaging')
    const { bootRoles } = await import('./support/role.mjs')
    await writePermissions(env.dshHome, 'center', CENTER)
    await writePermissions(env.dshHome, 'node', NODE)
    const { stopGateway, startGateway } = await import('dsh-secretary-dispatch-gateway')
    await stopGateway(env.dshHome)
    await startGateway(env.dshHome)

    // The consumer host: the handler records the effect inside the transaction, then the process dies before the
    // plugin can ACK. The connection is closed first so the ACK that follows the commit cannot leave the process.
    const crash = await crashingHost(t, env.dshHome, env.stored, `async (roles, out) => {
      const store = roles.node.messaging.outbox
      store.db.exec('CREATE TABLE IF NOT EXISTS effects (eventId TEXT PRIMARY KEY)')
      const handle = await roles.node.messaging.subscribe({ type: 'task.assigned' }, async (event, meta, tx) => {
        tx.db.prepare('INSERT INTO effects VALUES (?)').run(event.id)
        out({ got: event.id })
        // The plugin commits and ACKs once this handler returns: close the connection first so that ACK cannot
        // leave the process, and exit once the commit has happened.
        setTimeout(() => process.exit(9), 300)
        const { nc } = await roles.node.messaging.session
        await nc.close()
      })
      out({ ready: true })
    }`)
    await new Promise((resolve, reject) => { crash.child.stdout.on('data', chunk => { if (chunk.toString().includes('"ready"')) resolve() }); crash.exited.then(result => { if (result.code !== 9) reject(new Error(result.stderr)) }) })
    const publisher = await bootRoles(env.dshHome, Object.fromEntries(env.stored), [CENTER])
    t.after(() => publisher.dispose())
    const sent = await publisher.roles.center.messaging.publish({ type: 'task.assigned', data: { n: 1 } })
    const dead = await crash.exited
    assert.equal(dead.code, 9, dead.stderr)
    assert.deepEqual(linesOf(dead.stdout).map(line => line.got).filter(id => id !== undefined), [sent.event.id], 'the handler ran once before the crash')
    const jsm = await jetstreamManager(await env.rawClient('center'))
    const durable = durableName('node', 'dsh.events.task.assigned')
    assert.equal((await jsm.consumers.info('dsh-events', durable)).num_ack_pending, 1, 'the server still counts the message as unacknowledged')

    // The consumer host restarts: the server redelivers after the consumer's ack wait (30s by default), the event is
    // recognised and ACKed without running the handler again.
    const consumer = await bootRoles(env.dshHome, Object.fromEntries(env.stored), [NODE])
    t.after(() => consumer.dispose())
    let calls = 0
    await consumer.roles.node.messaging.subscribe({ type: 'task.assigned' }, (event, meta, tx) => { calls += 1; tx.db.prepare('INSERT INTO effects VALUES (?)').run(event.id) })
    await eventually(async () => (await jsm.consumers.info('dsh-events', durable)).num_ack_pending === 0, 90_000)
    const store = consumer.roles.node.messaging.outbox
    store.db.exec('CREATE TABLE IF NOT EXISTS effects (eventId TEXT PRIMARY KEY)')
    assert.deepEqual([calls, store.db.prepare('SELECT * FROM effects').all().map(row => row.eventId)], [0, [sent.event.id]], 'the redelivery is ACKed without running the handler; the effect exists exactly once')
  })

  test('#83 4: a lost PubAck, a relay retry and a publish beyond the dedupe window never produce a second acceptance', { skip, timeout: 240_000 }, async t => {
    const nats = await need()
    const env = await link(t, nats)
    const { writePermissions, STREAM_NAME } = await import('dsh-secretary-dispatch-messaging')
    const { bootRoles } = await import('./support/role.mjs')
    await writePermissions(env.dshHome, 'center', CENTER)
    await writePermissions(env.dshHome, 'node', NODE)
    const { stopGateway, startGateway } = await import('dsh-secretary-dispatch-gateway')
    await stopGateway(env.dshHome)
    await startGateway(env.dshHome)
    const host = await bootRoles(env.dshHome, Object.fromEntries(env.stored), [CENTER, NODE])
    t.after(() => host.dispose())
    const { center, node } = host.roles
    const accepted = []
    await node.messaging.subscribe({ type: 'task.assigned' }, (event) => { accepted.push(event.id) })

    // Lost PubAck: the event reached the stream (here published on the wire by the role's own user, which is what the
    // relay does) but the Outbox row is still pending, as after a crash between the PubAck and markPublished.
    const lost = center.messaging.outbox.transaction(tx => tx.publish({ type: 'task.assigned', data: { n: 'lost' } }, 'urn:dsh:center'))
    const rogue = (await import('@nats-io/jetstream')).jetstream(await env.rawClient('center'))
    await rogue.publish('dsh.events.task.assigned', new TextEncoder().encode(JSON.stringify(lost)), { msgID: lost.id })
    // Retry: the relay failed once before (the row keeps the attempt) and publishes again.
    center.messaging.outbox.markFailed(lost.id, 'simulated: PubAck lost')
    center.messaging.kickRelay()
    await eventually(() => center.messaging.outbox.entries().find(entry => entry.id === lost.id).status === 'published')
    assert.equal(center.messaging.outbox.entries().find(entry => entry.id === lost.id).lastError, null)

    // Beyond the stream's short dedupe window: the same id is published again by the role's own user, so the stream
    // holds two copies; the consumer accepts it once.
    const jsm = await jetstreamManager(await env.rawClient('center'))
    const late = await center.messaging.publish({ type: 'task.assigned', data: { n: 'late' } })
    await eventually(() => accepted.length === 2)
    // Shrink the stream's dedupe window (nats-server: at least 100ms) and let the id age out of it.
    await jsm.streams.update(STREAM_NAME, { duplicate_window: 1_000_000_000 })
    await new Promise(resolve => setTimeout(resolve, 1_500))
    await rogue.publish('dsh.events.task.assigned', new TextEncoder().encode(JSON.stringify(late.event)), { msgID: late.event.id })
    await eventually(async () => (await jsm.streams.info(STREAM_NAME)).state.messages === 3)
    await new Promise(resolve => setTimeout(resolve, 1_000))
    assert.deepEqual(accepted.sort(), [lost.id, late.event.id].sort(), 'each event id accepted exactly once')
    assert.equal((await jsm.streams.info(STREAM_NAME)).state.messages, 3, 'the stream holds the duplicates; the inbox does not repeat the effect')
    assert.equal(node.messaging.outbox.accepted().length, 2)
  })
}
