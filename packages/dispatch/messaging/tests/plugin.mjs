/** Plugin start-up that needs no Gateway: config validation, identity and connection refusals are explicit errors. */
import assert from 'node:assert/strict'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { saveSettings } from 'dsh-secretary-dispatch-gateway'
import * as PLUGIN from '../lib/index.js'
import { createNKeyPair } from 'dsh-secretary-dispatch-gateway'

async function home(t) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-messaging-plugin-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

/** One role realm in a host whose credentials store holds both seeds; the Gateway port is closed. */
async function boot(dshHome, config) {
  const center = createNKeyPair(), node = createNKeyPair()
  const stored = new Map([[CREDENTIAL.center, center.seed], [CREDENTIAL.node, node.seed]])
  await saveSettings(dshHome, { mode: 'local', clientPort: 1, monitorPort: 2, binary: 'nats-server', remote: { url: '', credentials: {} },
    keys: { center: { ref: CREDENTIAL.center, publicKey: center.publicKey }, node: { ref: CREDENTIAL.node, publicKey: node.publicKey } } })
  const root = new Context()
  root.provide('credentials', { async resolve(ref) { const value = stored.get(String(ref)); return value === undefined ? undefined : { value, source: 'test' } } })
  const realm = root.isolate(PLUGIN.SERVICE_KEY)
  return { root, realm, start: async () => realm.plugin(PLUGIN, { dshHome, ...config }) }
}
const CREDENTIAL = { center: 'NATS_NKEY_SEED_CENTER', node: 'NATS_NKEY_SEED_NODE' }

test('config: role is required; publish/subscribe must be valid event types', () => {
  const issues = raw => PLUGIN.Config['~standard'].validate(raw).issues?.map(issue => issue.message) ?? []
  assert.deepEqual(issues(undefined), ['dispatch: messaging config must specify role'])
  assert.deepEqual(issues({ role: 'worker' }), ['dispatch: messaging role must be center or node'])
  assert.match(issues({ role: 'node', publish: ['Bad.Type'] })[0], /messaging publish .*type/)
  assert.match(issues({ role: 'node', initNodeId: 'yes' })[0], /initNodeId must be a boolean/)
  assert.deepEqual(PLUGIN.Config['~standard'].validate({ role: 'center' }).value, { role: 'center', publish: [], subscribe: [] })
})

test('node without identity: a plain start fails with identity-missing and creates nothing; initNodeId writes it once', async t => {
  const dshHome = await home(t)
  const host = await boot(dshHome, { role: 'node' })
  await assert.rejects(host.start(), { code: 'messaging/identity-missing' })
  await assert.rejects(access(join(dshHome, 'dispatch', 'node', 'identity.json')))
  const initializing = await boot(dshHome, { role: 'node', initNodeId: true })
  // The identity now exists; what still fails is the Gateway connection, which is refused explicitly below.
  await assert.rejects(initializing.start(), error => error.code !== 'messaging/identity-missing')
  assert.match(await PLUGIN.readNodeId(dshHome), /^[0-9a-f-]{36}$/)
  await assert.rejects(initializing.start(), error => error.code !== 'messaging/identity-missing', 'an existing identity is kept, not replaced')
})

test('without a reachable Gateway the plugin fails to load instead of connecting silently later', { timeout: 30_000 }, async t => {
  const dshHome = await home(t)
  const host = await boot(dshHome, { role: 'center', publish: ['a'], subscribe: ['b'] })
  await assert.rejects(host.start(), error => !(error instanceof PLUGIN.MessagingError), 'a connection error from the official client')
  assert.equal(host.realm.get(PLUGIN.SERVICE_KEY), undefined)
  assert.deepEqual(JSON.parse(await (await import('node:fs/promises')).readFile(join(dshHome, 'gateway', 'permissions.center.json'), 'utf8')),
    { publish: ['dsh.events.a'], subscribe: ['dsh.events.b'] }, 'the role permissions are declared before connecting')
})

test('remote mode: a role without a credential reference or a non-TLS address is refused before any connection', async t => {
  const dshHome = await home(t)
  const host = await boot(dshHome, { role: 'node' })
  await saveSettings(dshHome, { mode: 'remote', clientPort: 1, monitorPort: 2, binary: 'nats-server', remote: { url: 'nats://example.com:4222', credentials: { center: 'X' } }, keys: null })
  await assert.rejects(host.start(), { code: 'messaging/role-not-configured' })
  await saveSettings(dshHome, { mode: 'remote', clientPort: 1, monitorPort: 2, binary: 'nats-server', remote: { url: 'nats://example.com:4222', credentials: { node: 'NATS_NKEY_SEED_NODE' } }, keys: null })
  await assert.rejects(host.start(), { code: 'messaging/tls-required' })
})
