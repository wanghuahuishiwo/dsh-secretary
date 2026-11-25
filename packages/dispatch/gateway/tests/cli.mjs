import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { test } from 'node:test'
import { CREDENTIAL_REFS, createNKeyPair, gatewayPaths, isProcessAlive, saveSettings } from '../lib/index.js'

const run = promisify(execFile)
const BIN = new URL('../../../secretary/cli/bin/dsh-secretary.mjs', import.meta.url).pathname
const FAKE = new URL('./fixtures/fake-nats-server.mjs', import.meta.url).pathname

async function cli(args, env) {
  try {
    const { stdout, stderr } = await run(process.execPath, [BIN, ...args], { env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env } })
    return { code: 0, stdout, stderr }
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr }
  }
}

async function reservePort() {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise(resolve => server.close(resolve))
  return port
}

async function home(t, settings = {}) {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-gateway-cli-'))
  t.after(async () => {
    try {
      const { pid } = JSON.parse(await readFile(gatewayPaths(dshHome).launch, 'utf8'))
      if (isProcessAlive(pid)) process.kill(pid, 'SIGKILL')
    } catch { /* nothing launched */ }
    await rm(dshHome, { recursive: true, force: true })
  })
  const keys = Object.fromEntries(['center', 'node'].map(role => [role, { ref: CREDENTIAL_REFS[role], publicKey: createNKeyPair().publicKey }]))
  await saveSettings(dshHome, { mode: 'local', clientPort: await reservePort(), monitorPort: await reservePort(), binary: FAKE, remote: { url: '', credentials: {} }, keys, ...settings })
  return dshHome
}

test('gateway status works outside a DSH session (no DSH_SECRETARY_URL/TOKEN) and prints the status JSON', async t => {
  const dshHome = await home(t)
  const result = await cli(['gateway', 'status'], { DSH_HOME: dshHome })
  assert.equal(result.code, 0)
  assert.equal(result.stderr, '')
  const status = JSON.parse(result.stdout)
  assert.equal(status.state, 'not-started')
  assert.equal(status.label, '未启动')
})

test('gateway start | restart | stop drive the same Gateway as the console and stay usable without the host', async t => {
  const dshHome = await home(t)
  const started = await cli(['gateway', 'start'], { DSH_HOME: dshHome })
  assert.equal(started.code, 0, started.stderr)
  const running = JSON.parse(started.stdout)
  assert.equal(running.state, 'running')
  assert.equal(running.startedBy, 'cli')
  const restarted = await cli(['gateway', 'restart'], { DSH_HOME: dshHome })
  assert.equal(restarted.code, 0, restarted.stderr)
  assert.equal(JSON.parse(restarted.stdout).state, 'running')
  assert.notEqual(JSON.parse(restarted.stdout).pid, running.pid)
  const stopped = await cli(['gateway', 'stop'], { DSH_HOME: dshHome })
  assert.equal(stopped.code, 0, stopped.stderr)
  assert.equal(JSON.parse(stopped.stdout).state, 'stopped')
  assert.equal(JSON.parse((await cli(['gateway', 'status'], { DSH_HOME: dshHome })).stdout).state, 'stopped')
})

test('failures exit 1 with {"error":{code,message}} on stderr; usage exits 2', async t => {
  const dshHome = await home(t, { binary: 'dsh-secretary-no-such-nats-server' })
  const failed = await cli(['gateway', 'start'], { DSH_HOME: dshHome })
  assert.equal(failed.code, 1)
  assert.equal(failed.stdout, '')
  assert.deepEqual(Object.keys(JSON.parse(failed.stderr)), ['error'])
  assert.equal(JSON.parse(failed.stderr).error.code, 'gateway/not-installed')
  assert.match(JSON.parse(failed.stderr).error.message, /brew install nats-server/)
  for (const args of [['gateway'], ['gateway', 'bogus'], ['gateway', 'start', 'extra']]) {
    const usage = await cli(args, { DSH_HOME: dshHome })
    assert.equal(usage.code, 2, args.join(' '))
    assert.match(usage.stderr, /dsh-secretary gateway <start\|stop\|restart\|status>/)
  }
  const other = await cli(['time', 'list'], { DSH_HOME: dshHome })
  assert.equal(other.code, 2)
  assert.match(other.stderr, /inside a DSH session/)
})

test('a start without keys and without a seed store explains where keys come from', async t => {
  const dshHome = await home(t, { keys: null })
  const result = await cli(['gateway', 'start'], { DSH_HOME: dshHome })
  assert.equal(result.code, 1)
  assert.equal(JSON.parse(result.stderr).error.code, 'gateway/keys-unavailable')
})
