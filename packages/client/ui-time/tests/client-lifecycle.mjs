import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
import { Context } from '@deepseek-ai/cordis'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import * as gatewayClient from '@deepseek-ai/dsh-api-gateway/client'

async function loadClient() {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  let registration
  const window = { __ModuleLoader__: { load(value) { registration = value } } }
  vm.runInNewContext(source, { window, console })
  assert.equal(registration.id, 'dsh-secretary-ui-time')
  const require = createRequire(import.meta.url)
  return registration.factory(require)
}

async function clientHarness(t) {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  await ctx.plugin(TypertRegistry)
  let pendingSignal
  const connection = {
    interactions: 'answer', isLoopback: true,
    openWebSocket: () => { throw new Error('unexpected WebSocket') },
    generation: { getSnapshot: () => undefined, subscribe: () => () => {} },
    state: { getSnapshot: () => undefined, subscribe: () => () => {} },
    reconnect: () => {},
    rpc: {
      open: async function * () { throw new Error('unexpected stream') },
      call: (_channel, _endpoint, _payload, signal) => new Promise(resolve => {
        pendingSignal = signal
        signal.addEventListener('abort', () => resolve({
          ok: false,
          error: new RemoteError('gateway/cancelled', 'cancelled', {}),
        }), { once: true })
      }),
    },
    registerGenerationSource: () => () => {},
    start: () => ({ stop: () => {} }),
  }
  ctx.provide('connection', connection)
  await ctx.plugin({ inject: gatewayClient.inject, apply: gatewayClient.apply })
  const client = await loadClient()
  return { ctx, client, pendingSignal: () => pendingSignal }
}

function uiProviders(ctx, fail = false) {
  let tabs = 0
  let shouldFail = fail
  ctx.provide('sidebarRightTabs', {
    register() {
      if (shouldFail) throw new Error('injected UI activation failure')
      tabs += 1
      return () => { tabs -= 1 }
    },
  })
  ctx.provide('slots', {
    inject: (_name, register) => register(),
    register: () => () => {},
  })
  return { tabs: () => tabs, fail: value => { shouldFail = value } }
}

test('built Client rolls back Remote when child UI activation fails, then remounts without residue', async (t) => {
  const { ctx, client } = await clientHarness(t)
  const failedUi = uiProviders(ctx, true)
  await assert.rejects(client.apply(ctx), /injected UI activation failure/)
  assert.equal(failedUi.tabs(), 0)
  assert.equal(ctx.get('remote.secretaryTime'), undefined)
  assert.deepEqual(ctx.typert.remotes.list(), [])
  failedUi.fail(false)
  const dispose = await client.apply(ctx)
  assert.ok(ctx.get('remote.secretaryTime'))
  assert.equal(failedUi.tabs(), 1)
  await dispose()
  assert.equal(failedUi.tabs(), 0)
  assert.equal(ctx.get('remote.secretaryTime'), undefined)
})

test('built Client disposal cancels an in-flight call and rejects a stale generated method', async (t) => {
  const { ctx, client, pendingSignal } = await clientHarness(t)
  const ui = uiProviders(ctx)
  const dispose = await client.apply(ctx)
  assert.ok(ctx.get('remote.secretaryTime'))
  assert.equal(ui.tabs(), 1)
  const stale = ctx.remote.secretaryTime.readWindow
  const pending = stale({ anchor: '2026-11-02', timeZone: 'Asia/Shanghai' })
  await Promise.resolve()
  assert.ok(pendingSignal(), 'the generated method reached the real Client Gateway carrier boundary')
  await dispose()
  assert.equal(pendingSignal().aborted, true)
  const cancelled = await pending
  assert.equal(cancelled.ok, false)
  assert.match(cancelled.error.message, /no longer mounted/)
  assert.equal(ui.tabs(), 0)
  assert.equal(ctx.get('remote.secretaryTime'), undefined)
  const staleResult = await stale({ anchor: '2026-11-02', timeZone: 'Asia/Shanghai' })
  assert.equal(staleResult.ok, false)
  assert.match(staleResult.error.message, /no longer mounted/)
})
