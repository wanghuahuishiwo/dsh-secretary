import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { gatewayPaths, isProcessAlive } from 'dsh-secretary-dispatch-gateway'
import { DispatchGatewayService, toSettingsPatch } from '../lib/index.js'

const FAKE = new URL('../../../dispatch/gateway/tests/fixtures/fake-nats-server.mjs', import.meta.url).pathname

async function freePort() {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise(resolve => server.close(resolve))
  return port
}

/** The Host service wired to a stub `credentials` provider, the way the Loader would. */
async function harness(t) {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-dispatch-controller-'))
  const stored = new Map()
  const ctx = new Context()
  ctx.provide('credentials', {
    async resolve(ref) { const value = stored.get(String(ref)); return value === undefined ? undefined : { value, source: 'test' } },
    async set(ref, value) { stored.set(String(ref), value) },
  })
  const service = new DispatchGatewayService(ctx, { dshHome })
  const settings = await service.updateSettings({ clientPort: await freePort(), monitorPort: await freePort(), binary: FAKE })
  t.after(async () => {
    await ctx.fiber.dispose()
    try {
      const { pid } = JSON.parse(await readFile(gatewayPaths(dshHome).launch, 'utf8'))
      if (isProcessAlive(pid)) process.kill(pid, 'SIGKILL')
    } catch { /* nothing launched */ }
    await rm(dshHome, { recursive: true, force: true })
  })
  return { service, stored, dshHome, settings }
}

test('the Remote exposes exactly the six Gateway methods on namespace secretaryDispatch', async () => {
  const remote = await import('../lib/typert.remote-client.js')
  assert.deepEqual(remote.default.descriptors.map(item => `${item.namespace}/${item.method}`), [
    'secretaryDispatch/readSettings', 'secretaryDispatch/readStatus', 'secretaryDispatch/restart',
    'secretaryDispatch/start', 'secretaryDispatch/stop', 'secretaryDispatch/updateSettings',
  ])
  for (const descriptor of remote.default.descriptors) {
    assert.equal(descriptor.result.mode, 'strict', descriptor.method)
    for (const parameter of descriptor.parameters) assert.equal(parameter.codec.mode, 'strict', descriptor.method)
  }
})

test('console start generates both NKeys into DSH-managed credentials and never into files', async t => {
  const { service, stored, dshHome } = await harness(t)
  const running = await service.start()
  assert.equal(running.state, 'running')
  assert.equal(running.startedBy, 'console')
  assert.deepEqual([...stored.keys()].sort(), ['NATS_NKEY_SEED_CENTER', 'NATS_NKEY_SEED_NODE'])
  const paths = gatewayPaths(dshHome)
  for (const path of [paths.conf, paths.log, paths.launch, paths.settings]) {
    const text = await readFile(path, 'utf8')
    for (const seed of stored.values()) assert.ok(!text.includes(seed), `${seed} in ${path}`)
  }
  assert.equal((await service.readStatus()).state, 'running')
  assert.equal((await service.stop()).state, 'stopped')
  assert.equal((await service.restart()).state, 'running')
})

test('settings changes persist through the Remote and are rejected with a Remote error when invalid', async t => {
  const { service } = await harness(t)
  const saved = await service.updateSettings({ mode: 'remote', remoteUrl: 'tls://gw.example:4222', nodeCredential: 'NODE_KEY' })
  assert.deepEqual(saved.remote, { url: 'tls://gw.example:4222', credentials: { node: 'NODE_KEY' } })
  assert.deepEqual(await service.readSettings(), saved)
  assert.equal((await service.readStatus()).state, 'remote')
  await assert.rejects(service.start(), error => error.code === 'secretaryDispatch/gateway-error' && error.details.code === 'gateway/remote-mode')
  await assert.rejects(service.updateSettings({ clientPort: 0 }), error => error.code === 'secretaryDispatch/gateway-error' && error.details.code === 'gateway/invalid-settings')
  assert.deepEqual(toSettingsPatch({ binary: 'x' }), { binary: 'x' })
})

test('a failed start surfaces as secretaryDispatch/gateway-error with the shared code', async t => {
  const { service } = await harness(t)
  await service.updateSettings({ binary: 'dsh-secretary-no-such-nats-server' })
  await assert.rejects(service.start(), error => {
    assert.equal(error.code, 'secretaryDispatch/gateway-error')
    assert.equal(error.details.code, 'gateway/not-installed')
    assert.match(error.message, /brew install nats-server/)
    return true
  })
  assert.equal((await service.readStatus()).state, 'not-started')
})
