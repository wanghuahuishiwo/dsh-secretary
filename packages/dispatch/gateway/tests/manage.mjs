import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  CREDENTIAL_REFS, createNKeyPair, gatewayPaths, isProcessAlive, probeGateway, readSettings, restartGateway,
  saveSettings, startGateway, stopGateway, updateSettings,
} from '../lib/index.js'

const FAKE = new URL('./fixtures/fake-nats-server.mjs', import.meta.url).pathname
const alive = pid => isProcessAlive(pid)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

/** Kill whatever a test left behind, then remove its home. */
function track(t) {
  const pids = []
  t.after(async () => {
    for (const pid of pids) { try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ } }
    await delay(50)
    for (const dir of dirs) await rm(dir, { recursive: true, force: true })
  })
  const dirs = []
  return {
    async home(settings = {}) {
      const dir = await mkdtemp(join(tmpdir(), 'dsh-gateway-manage-'))
      dirs.push(dir)
      await saveSettings(dir, {
        mode: 'local', clientPort: 4222, monitorPort: 8222, binary: FAKE, remote: { url: '', credentials: {} }, keys: null, ...settings,
      })
      return dir
    },
    remember(pid) { if (pid !== undefined) pids.push(pid) },
  }
}

function secretStore(initial = {}) {
  const values = new Map(Object.entries(initial))
  const log = []
  return {
    values, log,
    async resolve(ref) { return values.get(ref) },
    async set(ref, value) { log.push(ref); values.set(ref, value) },
  }
}

async function reservePort() {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise(resolve => server.close(resolve))
  return port
}

/** Occupy a port with something that is not our Gateway. */
async function occupy(t) {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  return server.address().port
}

async function fixtureProcess(t, dshHome, mode) {
  // A process that answers /varz like a Gateway but was not started by us.
  const settings = await readSettings(dshHome)
  const paths = gatewayPaths(dshHome)
  await writeFile(paths.conf, `listen: 127.0.0.1:${settings.clientPort}\nhttp: 127.0.0.1:${settings.monitorPort}\njetstream {\n  store_dir: "${paths.jetstream}"\n}\n`)
  const child = spawn(process.execPath, [FAKE, '-c', paths.conf], { env: { PATH: process.env.PATH, FAKE_MODE: mode }, stdio: 'ignore' })
  t.after(async () => { try { process.kill(child.pid, 'SIGKILL') } catch { /* gone */ } })
  for (let i = 0; i < 100; i += 1) {
    try { await fetch(`http://127.0.0.1:${settings.monitorPort}/healthz?js-enabled-only=true`); return child.pid } catch { await delay(20) }
  }
  throw new Error('fake server never became ready')
}

test('fresh home: not started, binary probed on PATH with the install hint when missing', async t => {
  const h = track(t)
  const dshHome = await h.home({ clientPort: await reservePort(), monitorPort: await reservePort(), binary: 'dsh-secretary-no-such-nats-server' })
  const status = await probeGateway(dshHome)
  assert.equal(status.state, 'not-started')
  assert.equal(status.mode, 'local')
  assert.equal(status.binary.found, false)
  assert.match(status.binary.hint, /brew install nats-server/)
  assert.equal(status.clientUrl, `nats://127.0.0.1:${(await readSettings(dshHome)).clientPort}`)
})

test('start → running (version, pid, startedBy), seeds only in the secret store, never in files or the child env', async t => {
  const h = track(t)
  const dshHome = await h.home()
  const secrets = secretStore()
  const status = await startGateway(dshHome, { by: 'cli', secrets })
  h.remember(status.pid)
  assert.equal(status.state, 'running')
  assert.equal(status.version, '9.9.9')
  assert.equal(status.startedBy, 'cli')
  assert.ok(alive(status.pid))
  const paths = gatewayPaths(dshHome)
  const files = await Promise.all([paths.conf, paths.log, paths.launch, paths.settings].map(path => readFile(path, 'utf8')))
  const seeds = [...secrets.values.values()]
  assert.deepEqual([...secrets.values.keys()].sort(), ['NATS_NKEY_SEED_CENTER', 'NATS_NKEY_SEED_NODE'])
  for (const text of files) for (const seed of seeds) assert.ok(!text.includes(seed), `${seed} leaked into a file`)
  for (const text of files) assert.ok(!/SU[A-Z2-7]{55}/.test(text), 'no seed-shaped string in any Gateway file')
  // The child got a minimal environment: no Host variables, no seeds.
  const childEnv = JSON.parse(/^env=(.*)$/m.exec(files[1])[1])
  assert.deepEqual(Object.keys(childEnv).sort(), ['HOME', 'LANG', 'PATH', 'TMPDIR', 'USER'].concat(Object.keys(childEnv).filter(key => key.startsWith('__')).sort()).sort())
  for (const seed of seeds) assert.ok(!files[1].includes(seed), 'seed leaked into the child environment / log')
  const settings = await readSettings(dshHome)
  assert.equal(settings.keys.center.ref, CREDENTIAL_REFS.center)
  assert.equal(settings.keys.node.publicKey.length, 56)
  const launch = JSON.parse(files[2])
  assert.deepEqual(Object.keys(launch).sort(), ['by', 'pid', 'startedAt'])
  await access(paths.jetstream)
  const again = await probeGateway(dshHome)
  assert.equal(again.state, 'running')
  assert.equal(again.pid, status.pid)
  // Starting again does not spawn a second process.
  assert.equal((await startGateway(dshHome, { secrets })).pid, status.pid)
})

test('stop → stopped with an explicit-stop record; restart → running under a new pid; crash → abnormal-exit with the log tail', async t => {
  const h = track(t)
  const dshHome = await h.home()
  const secrets = secretStore()
  const first = await startGateway(dshHome, { by: 'console', secrets })
  h.remember(first.pid)
  const stopped = await stopGateway(dshHome)
  assert.equal(stopped.state, 'stopped')
  assert.ok(!alive(first.pid))
  assert.deepEqual(JSON.parse(await readFile(gatewayPaths(dshHome).launch, 'utf8')).exit, { reason: 'stopped', at: stopped.endedAt })
  assert.equal((await probeGateway(dshHome)).state, 'stopped')
  assert.equal((await stopGateway(dshHome)).state, 'stopped', 'stopping a stopped Gateway is a no-op')
  const second = await restartGateway(dshHome, { by: 'cli', secrets })
  h.remember(second.pid)
  assert.equal(second.state, 'running')
  assert.notEqual(second.pid, first.pid)
  assert.equal(second.startedBy, 'cli')
  process.kill(second.pid, 'SIGKILL')
  await delay(100)
  const crashed = await probeGateway(dshHome)
  assert.equal(crashed.state, 'abnormal-exit')
  assert.match(crashed.logTail, /fake nats-server v9\.9\.9/)
})

test('not ready within the limit → start-failed, the process is terminated and recorded', async t => {
  const h = track(t)
  const dshHome = await h.home()
  await assert.rejects(startGateway(dshHome, { secrets: secretStore(), readyTimeoutMs: 400, env: { FAKE_MODE: 'deaf' } }), error => {
    assert.equal(error.code, 'gateway/start-failed')
    assert.match(error.message, /未就绪/)
    h.remember(error.status.pid)
    return true
  })
  await delay(100)
  const status = await probeGateway(dshHome)
  assert.equal(status.state, 'start-failed')
  assert.equal(JSON.parse(await readFile(gatewayPaths(dshHome).launch, 'utf8')).exit.reason, 'abnormal')
})

test('a process that exits at once → start-failed with the log tail', async t => {
  const h = track(t)
  const dshHome = await h.home()
  await assert.rejects(startGateway(dshHome, { secrets: secretStore(), env: { FAKE_MODE: 'exit' } }), error => error.code === 'gateway/start-failed' && /fake nats-server/.test(error.status.logTail))
  assert.equal((await probeGateway(dshHome)).state, 'start-failed')
})

test('missing binary → not-installed with the Homebrew command; nothing is started', async t => {
  const h = track(t)
  const dshHome = await h.home({ binary: 'dsh-secretary-no-such-nats-server' })
  await assert.rejects(startGateway(dshHome, { secrets: secretStore() }), error => {
    assert.equal(error.code, 'gateway/not-installed')
    assert.match(error.message, /brew install nats-server/)
    return true
  })
  assert.equal((await probeGateway(dshHome)).state, 'not-started')
})

test('another process on the client port → unmanaged; start fails instead of adopting it; stop refuses', async t => {
  const h = track(t)
  const dshHome = await h.home({ clientPort: await occupy(t), monitorPort: await reservePort() })
  const status = await probeGateway(dshHome)
  assert.equal(status.state, 'unmanaged')
  await assert.rejects(startGateway(dshHome, { secrets: secretStore() }), { code: 'gateway/start-failed' })
  await assert.rejects(stopGateway(dshHome), { code: 'gateway/not-managed' })
})

test('a live pid whose /varz disagrees on store_dir → record-invalid: no adoption, no signal', async t => {
  const h = track(t)
  const dshHome = await h.home()
  const pid = await fixtureProcess(t, dshHome, 'wrong-store')
  h.remember(pid)
  await writeFile(gatewayPaths(dshHome).launch, JSON.stringify({ pid, startedAt: new Date().toISOString(), by: 'cli' }))
  const status = await probeGateway(dshHome)
  assert.equal(status.state, 'record-invalid')
  assert.equal(status.pid, pid)
  await assert.rejects(stopGateway(dshHome), { code: 'gateway/not-managed' })
  assert.ok(alive(pid))
})

test('stop that is ignored for the limit → stop-timeout, no SIGKILL, status stays stopping', async t => {
  const h = track(t)
  const dshHome = await h.home()
  const running = await startGateway(dshHome, { secrets: secretStore(), env: { FAKE_MODE: 'ignore-sigterm' } })
  h.remember(running.pid)
  await assert.rejects(stopGateway(dshHome, { stopTimeoutMs: 400 }), { code: 'gateway/stop-timeout' })
  assert.ok(alive(running.pid))
  const status = await probeGateway(dshHome)
  assert.equal(status.state, 'stopping')
  assert.match(status.detail, /未退出/)
  await assert.rejects(restartGateway(dshHome, { secrets: secretStore(), stopTimeoutMs: 200 }), { code: 'gateway/stop-timeout' })
})

test('a dead pid that was asked to stop → stopped; a dead pid never seen exiting → abnormal-exit', async t => {
  const h = track(t)
  const dshHome = await h.home()
  const base = { startedAt: new Date(Date.now() - 60_000).toISOString(), by: 'console' }
  await writeFile(gatewayPaths(dshHome).launch, JSON.stringify({ pid: 2147483646, ...base, stopRequestedAt: new Date().toISOString() }))
  assert.equal((await probeGateway(dshHome)).state, 'stopped')
  await writeFile(gatewayPaths(dshHome).launch, JSON.stringify({ pid: 2147483646, ...base }))
  assert.equal((await probeGateway(dshHome)).state, 'abnormal-exit')
  await writeFile(gatewayPaths(dshHome).launch, '{ broken')
  assert.equal((await probeGateway(dshHome)).state, 'unknown')
})

test('remote mode: status is remote with the configured address; process control is refused', async t => {
  const h = track(t)
  const dshHome = await h.home()
  await updateSettings(dshHome, { mode: 'remote', remote: { url: 'tls://gw.example:4222', credentials: { node: 'NODE_KEY' } } })
  const status = await probeGateway(dshHome)
  assert.equal(status.state, 'remote')
  assert.equal(status.clientUrl, 'tls://gw.example:4222')
  assert.equal(status.monitorUrl, undefined)
  await assert.rejects(startGateway(dshHome, { secrets: secretStore() }), { code: 'gateway/remote-mode' })
  await assert.rejects(stopGateway(dshHome), { code: 'gateway/remote-mode' })
})

test('keys: no store and no keys → keys-unavailable; seeds resolvable from the store are used to derive the public keys', async t => {
  const h = track(t)
  const dshHome = await h.home()
  await assert.rejects(startGateway(dshHome), { code: 'gateway/keys-unavailable' })
  const center = createNKeyPair()
  const node = createNKeyPair()
  const env = { async resolve(ref) { return { NATS_NKEY_SEED_CENTER: center.seed, NATS_NKEY_SEED_NODE: node.seed }[ref] }, async set() { throw new Error('read-only') } }
  const status = await startGateway(dshHome, { secrets: env })
  h.remember(status.pid)
  assert.equal(status.state, 'running')
  const conf = await readFile(gatewayPaths(dshHome).conf, 'utf8')
  assert.ok(conf.includes(center.publicKey) && conf.includes(node.publicKey) && !conf.includes(center.seed))
})

test('settings changes apply on the next start: the derived conf is rewritten with the new ports', async t => {
  const h = track(t)
  const clientPort = await reservePort()
  const monitorPort = await reservePort()
  const dshHome = await h.home()
  await startGateway(dshHome, { secrets: secretStore() }).then(status => h.remember(status.pid))
  await stopGateway(dshHome)
  await updateSettings(dshHome, { clientPort, monitorPort })
  const status = await startGateway(dshHome, { secrets: secretStore() })
  h.remember(status.pid)
  assert.equal(status.state, 'running')
  assert.match(await readFile(gatewayPaths(dshHome).conf, 'utf8'), new RegExp(`listen: 127\\.0\\.0\\.1:${clientPort}\\nhttp: 127\\.0\\.0\\.1:${monitorPort}`))
  assert.equal(status.monitorUrl, `http://127.0.0.1:${monitorPort}`)
})
