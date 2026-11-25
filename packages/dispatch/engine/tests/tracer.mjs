/**
 * Gateway tracer for #102 on a real nats-server + JetStream: events enter the graph through the durable consumer, the
 * engine announces the instance, nodes speak through `emit`, and an event nobody claims is recorded.
 * register(test, { strict }); the link helpers are those of the messaging plugin's tracer.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { jetstreamManager } from '@nats-io/jetstream'
import { writePermissions } from 'dsh-secretary-dispatch-messaging'
import { eventually, requireNatsServer, startLink } from '../../messaging/tests/scenario.mjs'
import { bootRole, CENTER, FINISHED, graph, host, NODE, STARTED, streamEvents } from './support/host.mjs'

const HINT = '需要真实的 nats-server 二进制。安装后重跑：brew install nats-server，或用 DSH_NATS_SERVER=<二进制路径> 指定。'
const HERE = new URL('.', import.meta.url).pathname

export function register(test, { strict }) {
  const binary = process.env.DSH_NATS_SERVER
  const skip = binary === undefined && !strict ? 'set DSH_NATS_SERVER=<nats-server binary> to run against a real Gateway' : false

  /** A DSH home with a running Gateway that already carries both roles' permissions, plus the root host context. */
  async function linked(t) {
    const probe = await requireNatsServer()
    if (!probe.found) assert.fail(`${HINT}（当前未找到 ${probe.configured}）`)
    const link = await startLink(t, probe.found ? probe.configured : binary)
    await writePermissions(link.dshHome, 'center', CENTER)
    await writePermissions(link.dshHome, 'node', NODE)
    const { stopGateway, startGateway } = await import('dsh-secretary-dispatch-gateway')
    await stopGateway(link.dshHome)
    await startGateway(link.dshHome)
    const root = host(link.stored)
    t.after(() => root.fiber.dispose())
    return { ...link, root }
  }

  const consumers = async nc => (await (await jetstreamManager(nc)).consumers.list('dsh-events').next()).map(info => info.config.filter_subject)

  test('#102: an entry event opens an instance; the stream shows started, the emitted node event, then finished, in that order', { skip, timeout: 120_000 }, async t => {
    const { dshHome, root, rawClient } = await linked(t)
    const center = await bootRole(root, dshHome, CENTER)
    const node = await bootRole(root, dshHome, NODE)
    graph(center.engine)
    graph(node.engine, undefined, false)
    const nc = await rawClient('center')
    await eventually(async () => (await consumers(nc)).includes('dsh.events.task.assigned'))

    const sent = await center.messaging.publish({ type: 'task.assigned', data: { ticket: 'T-1' } })
    await eventually(async () => (await streamEvents(nc)).filter(event => event.type === FINISHED).length === 2)

    const events = await streamEvents(nc)
    assert.deepEqual(events.map(event => event.type), ['task.assigned', STARTED, 'work.reported', FINISHED, STARTED, 'work.reported', FINISHED])
    const bySource = source => events.filter(event => event.source === source)
    const nodeSource = `urn:dsh:node:${node.messaging.nodeId}`
    for (const [source, entryEventId] of [['urn:dsh:center', sent.event.id], [nodeSource, sent.event.id]]) {
      const [started, report, finished] = bySource(source).filter(event => event.type !== 'task.assigned')
      assert.deepEqual([started.type, report.type, finished.type], [STARTED, 'work.reported', FINISHED])
      assert.deepEqual(started.data, { instanceId: started.data.instanceId, graphId: 'task', entryEventId })
      assert.deepEqual(report.data, { ticket: 'T-1' }, 'the node event data is passed through as is')
      assert.deepEqual(finished.data, { instanceId: started.data.instanceId, graphId: 'task', outcome: 'ok' })
      const engine = source === 'urn:dsh:center' ? center.engine : node.engine
      assert.deepEqual(engine.history.listByInstance(started.data.instanceId).map(record => record.kind), ['instance.opened', 'node.started', 'activity.completed', 'node.completed'])
    }
    assert.deepEqual(center.messaging.outbox.entries().map(entry => [entry.type, entry.status]).slice(1), [[STARTED, 'published'], ['work.reported', 'published'], [FINISHED, 'published']], 'all three went through the Outbox')
  })

  test('#102: an event no entry claims is recorded as unmatched and puts nothing on the stream; a failing node ends with outcome error', { skip, timeout: 120_000 }, async t => {
    const { dshHome, root, rawClient } = await linked(t)
    const center = await bootRole(root, dshHome, CENTER)
    graph(center.engine)
    const nc = await rawClient('center')
    await eventually(async () => (await consumers(nc)).includes('dsh.events.nobody.listens') && (await consumers(nc)).includes('dsh.events.task.broken'))

    const nobody = await center.messaging.publish({ type: 'nobody.listens', data: { hello: 'anybody' } })
    await eventually(() => center.engine.history.listByEventId(nobody.event.id).length === 1)
    assert.deepEqual(center.engine.history.listByEventId(nobody.event.id).map(record => [record.kind, record.payload]), [['unmatched', { type: 'nobody.listens' }]])
    await new Promise(resolve => setTimeout(resolve, 300))
    assert.deepEqual(center.messaging.outbox.entries().map(entry => entry.type), ['nobody.listens'], 'only the event itself; no lifecycle event for it')

    const broken = await center.messaging.publish({ type: 'task.broken', data: { ticket: 'T-2' } })
    await eventually(async () => (await streamEvents(nc)).filter(event => event.type === FINISHED).length === 1)
    const events = await streamEvents(nc)
    assert.deepEqual(events.map(event => event.type), ['nobody.listens', 'task.broken', STARTED, FINISHED])
    assert.deepEqual(events[2].data, { instanceId: events[2].data.instanceId, graphId: 'broken', entryEventId: broken.event.id })
    assert.deepEqual(events[3].data, { instanceId: events[2].data.instanceId, graphId: 'broken', outcome: 'error' })
    assert.match(center.engine.history.listByInstance(events[2].data.instanceId).at(-1).payload.error, /node blew up/)
  })

  test('#102: a host that dies right after a node emitted its event resumes on restart without being told to and without emitting it again', { skip, timeout: 120_000 }, async t => {
    const { dshHome, root, rawClient, stored } = await linked(t)
    // A real process exit right after the `emit` committed: the next node calls `crash`, which exits the host once.
    const script = `
      import { existsSync, writeFileSync } from 'node:fs'
      import { join } from 'node:path'
      import { bootRole, CENTER, FINISHED, graph, host } from ${JSON.stringify(new URL('./support/host.mjs', import.meta.url).pathname)}
      const { engine } = await bootRole(host(${JSON.stringify(Object.fromEntries(stored))}), ${JSON.stringify(dshHome)}, CENTER)
      const flag = join(${JSON.stringify(dshHome)}, 'crashed')
      graph(engine, () => { if (!existsSync(flag)) { writeFileSync(flag, ''); process.exit(9) } return null })
      process.stdout.write(${JSON.stringify(FINISHED)} + '\\n')
      await new Promise(() => {})
    `
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { cwd: HERE, stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += chunk })
    const dead = new Promise(resolve => child.on('exit', (code, signal) => resolve({ code, signal })))
    let attempts = 0
    const nc = await rawClient('center')
    t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL') })
    await eventually(async () => {
      if (child.exitCode !== null) assert.fail(`the crashing host exited early (${child.exitCode}): ${stderr}`)
      if (attempts++ === 100) assert.fail(`no consumer for task.report after 5 s; the crashing host said: ${stderr.trim() || '(nothing)'}`)
      return (await consumers(nc)).includes('dsh.events.task.report')
    })

    const sender = await bootRole(root, dshHome, CENTER)
    await sender.messaging.publish({ type: 'task.report', data: { ticket: 'T-3' } })
    assert.deepEqual(await dead, { code: 9, signal: null }, stderr)

    // The restarted host finds the unfinished instance by its history and resumes it on its own: replay injects the recorded emit.
    const center = await bootRole(root, dshHome, CENTER)
    let crashes = 0
    graph(center.engine, () => { crashes += 1; return null })
    const [instanceId] = center.engine.history.instanceIds()
    assert.deepEqual(center.engine.history.listByInstance(instanceId).map(record => record.kind), ['instance.opened', 'node.started', 'activity.completed', 'node.completed', 'node.started'], 'the host died while `report` ran')

    await eventually(async () => (await streamEvents(nc)).filter(event => event.type === FINISHED).length === 1)
    const events = await streamEvents(nc)
    assert.deepEqual(events.map(event => event.type), ['task.report', STARTED, 'work.reported', FINISHED])
    assert.deepEqual(center.messaging.outbox.entries().map(entry => [entry.type, entry.status]).slice(1), [[STARTED, 'published'], ['work.reported', 'published'], [FINISHED, 'published']])
    const emitted = center.messaging.outbox.entries().find(entry => entry.type === 'work.reported')
    assert.equal(events[2].id, emitted.id, 'the event the crashed host queued is the one copy on the stream')
    assert.equal(emitted.status, 'published')
    assert.equal(crashes, 1)
    const records = center.engine.history.listByInstance(instanceId)
    assert.deepEqual(records.filter(record => record.kind === 'node.started').map(record => record.nodeId), ['work', 'report', 'report'], 'only the unfinished node re-ran, from the top')
    assert.equal(records.filter(record => record.payload.name === 'emit').length, 1, 'the recorded emit was injected, not repeated')
  })
}
