/** Bundle tracer for #98: the real nats-server, started/stopped through the shared Gateway logic behind the console Remote. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'
import { Context } from '@deepseek-ai/cordis'
import { CREDENTIAL_REFS, gatewayPaths, isProcessAlive, locateNatsServer, saveSettings } from 'dsh-secretary-dispatch-gateway'

const run = promisify(execFile)
const CLI = new URL('../../../secretary/cli/bin/dsh-secretary.mjs', import.meta.url).pathname
const HOST = { id: 'dsh-secretary-dispatch-controller', ...await import('dsh-secretary-dispatch-controller') }

/** One DSH "process": a fresh Cordis context with the controller plugin and a stub `credentials` provider. */
async function bootHost(t, dshHome, stored) {
  const ctx = new Context()
  ctx.provide('credentials', {
    async resolve(ref) { const value = stored.get(String(ref)); return value === undefined ? undefined : { value, source: 'tracer' } },
    async set(ref, value) { stored.set(String(ref), value) },
  })
  await ctx.plugin(HOST, { dshHome })
  return { ctx, gateway: ctx.get('dispatchGateway') }
}

async function gatewayHome(t) {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-secretary-gateway-home-'))
  t.after(async () => {
    try {
      const { pid } = JSON.parse(await readFile(gatewayPaths(dshHome).launch, 'utf8'))
      if (isProcessAlive(pid)) process.kill(pid, 'SIGKILL')
    } catch { /* nothing launched */ }
    await rm(dshHome, { recursive: true, force: true })
  })
  // The binary is the user's: PATH, or an explicit path for tests.
  await saveSettings(dshHome, {
    mode: 'local', clientPort: 4222, monitorPort: 8222, binary: process.env.DSH_NATS_SERVER ?? 'nats-server',
    remote: { url: '', credentials: {} }, keys: null,
  })
  const probe = await locateNatsServer(process.env.DSH_NATS_SERVER ?? 'nats-server')
  if (!probe.found) {
    assert.fail(`需要真实的 nats-server 二进制（当前未找到 ${probe.configured}）。安装后重跑：brew install nats-server，或用 DSH_NATS_SERVER=<二进制路径> 指定。`)
  }
  return dshHome
}

async function noSeedsInFiles(dshHome, stored) {
  const paths = gatewayPaths(dshHome)
  for (const path of [paths.conf, paths.log, paths.launch, paths.settings]) {
    const text = await readFile(path, 'utf8')
    for (const seed of stored.values()) assert.ok(!text.includes(seed), `seed leaked into ${path}`)
    assert.ok(!/SU[A-Z2-7]{55}/.test(text), `seed-shaped string in ${path}`)
  }
}

test('console start → real nats-server ready → stop; DSH exit keeps it running and a reopened DSH adopts the same pid', { timeout: 120_000 }, async t => {
  const dshHome = await gatewayHome(t)
  const stored = new Map()
  const first = await bootHost(t, dshHome, stored)

  const running = await first.gateway.start()
  assert.equal(running.state, 'running', JSON.stringify(running))
  assert.match(running.version ?? '', /^\d+\.\d+\.\d+$/, 'status carries the /varz version')
  assert.equal(running.startedBy, 'console')
  assert.ok(isProcessAlive(running.pid))
  const healthz = await fetch('http://127.0.0.1:8222/healthz?js-enabled-only=true')
  assert.equal(healthz.status, 200)
  assert.deepEqual([...stored.keys()].sort(), [CREDENTIAL_REFS.center, CREDENTIAL_REFS.node])
  await noSeedsInFiles(dshHome, stored)
  const conf = await readFile(gatewayPaths(dshHome).conf, 'utf8')
  assert.match(conf, /listen: 127\.0\.0\.1:4222/)
  for (const publicKey of (await readFile(gatewayPaths(dshHome).settings, 'utf8')).match(/"publicKey": "(U[A-Z2-7]{55})"/g) ?? []) assert.ok(conf.includes(publicKey.slice(15, -1)))

  // The CLI sees and drives the very same process through the same record.
  const cliStatus = JSON.parse((await run(process.execPath, [CLI, 'gateway', 'status'], { env: { ...process.env, DSH_HOME: dshHome } })).stdout)
  assert.equal(cliStatus.pid, running.pid)
  assert.equal(cliStatus.state, 'running')

  // DSH exits: the Gateway is a detached process and must survive.
  const pid = running.pid
  await first.ctx.fiber.dispose()
  await new Promise(resolve => setTimeout(resolve, 200))
  assert.ok(isProcessAlive(pid), 'Gateway outlives the DSH host that started it')

  // DSH reopens: probing alone adopts the running Gateway, no "recovery" step.
  const reopened = await bootHost(t, dshHome, stored)
  assert.equal(reopened.gateway.constructor.name, first.gateway.constructor.name)
  const adopted = await reopened.gateway.readStatus()
  assert.equal(adopted.state, 'running')
  assert.equal(adopted.pid, pid)
  assert.equal(adopted.startedBy, 'console')

  const stopped = await reopened.gateway.stop()
  assert.equal(stopped.state, 'stopped')
  assert.ok(!isProcessAlive(pid))
  assert.equal((await reopened.gateway.readStatus()).state, 'stopped')
  await reopened.ctx.fiber.dispose()
  await noSeedsInFiles(dshHome, stored)
})

test('a second start after an explicit stop runs again; the record tells stopped from crashed', { timeout: 120_000 }, async t => {
  const dshHome = await gatewayHome(t)
  const stored = new Map()
  const { ctx, gateway } = await bootHost(t, dshHome, stored)
  t.after(() => ctx.fiber.dispose())
  const a = await gateway.start()
  await gateway.stop()
  const b = await gateway.restart()
  assert.equal(b.state, 'running')
  assert.notEqual(b.pid, a.pid)
  process.kill(b.pid, 'SIGKILL')
  for (let i = 0; i < 50 && isProcessAlive(b.pid); i += 1) await new Promise(resolve => setTimeout(resolve, 20))
  const crashed = await gateway.readStatus()
  assert.equal(crashed.state, 'abnormal-exit')
  assert.match(crashed.logTail ?? '', /./, 'the log tail is attached to a failure state')
  await gateway.stop().catch(() => undefined)
})
