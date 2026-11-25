import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  CREDENTIAL_REFS, GatewayError, createNKeyPair, defaultDshHome, gatewayPaths, readSettings, renderServerConfig,
  saveSettings, updateSettings,
} from '../lib/index.js'

async function home(t) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-gateway-settings-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

test('a fresh DSH_HOME has no settings file and reads back the fixed loopback defaults', async t => {
  const dshHome = await home(t)
  assert.deepEqual(await readSettings(dshHome), {
    mode: 'local', clientPort: 4222, monitorPort: 8222, binary: 'nats-server',
    remote: { url: '', credentials: {} }, keys: null,
  })
  await assert.rejects(readFile(gatewayPaths(dshHome).settings), { code: 'ENOENT' })
})

test('defaultDshHome follows DSH_HOME, else ~/.dsh; every Gateway file lives under gateway/', async t => {
  const previous = process.env.DSH_HOME
  t.after(() => { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous })
  process.env.DSH_HOME = '/tmp/x/y'
  assert.equal(defaultDshHome(), '/tmp/x/y')
  delete process.env.DSH_HOME
  assert.equal(defaultDshHome(), join(process.env.HOME, '.dsh'))
  const paths = gatewayPaths('/tmp/x/y')
  assert.deepEqual(paths, {
    dir: '/tmp/x/y/gateway', settings: '/tmp/x/y/gateway/settings.json', conf: '/tmp/x/y/gateway/nats-server.conf',
    log: '/tmp/x/y/gateway/nats-server.log', launch: '/tmp/x/y/gateway/launch.json', jetstream: '/tmp/x/y/gateway/jetstream',
  })
})

test('settings round-trip and reject malformed files with an explicit error', async t => {
  const dshHome = await home(t)
  const saved = await updateSettings(dshHome, { clientPort: 5222, binary: '/opt/homebrew/bin/nats-server' })
  assert.equal(saved.clientPort, 5222)
  assert.equal(saved.binary, '/opt/homebrew/bin/nats-server')
  assert.equal(saved.monitorPort, 8222)
  assert.deepEqual(await readSettings(dshHome), saved)
  await writeFile(gatewayPaths(dshHome).settings, '{ not json')
  await assert.rejects(readSettings(dshHome), error => error instanceof GatewayError && error.code === 'gateway/invalid-settings')
})

test('invalid port, mode or remote address are refused before touching the file', async t => {
  const dshHome = await home(t)
  for (const patch of [{ clientPort: 0 }, { clientPort: 70000 }, { monitorPort: 'x' }, { mode: 'cloud' },
    { mode: 'remote', remote: { url: '', credentials: {} } }, { mode: 'remote', remote: { url: 'http://a', credentials: {} } },
    { remote: { url: 'nats://b', credentials: { center: 'has space' } } }]) {
    await assert.rejects(updateSettings(dshHome, patch), { code: 'gateway/invalid-settings' })
  }
  await assert.rejects(readFile(gatewayPaths(dshHome).settings), { code: 'ENOENT' })
})

test('remote mode keeps only the Gateway address and credential references', async t => {
  const dshHome = await home(t)
  const saved = await updateSettings(dshHome, { mode: 'remote', remote: { url: 'tls://gw.example:4222', credentials: { node: 'NODE_NKEY' } } })
  assert.deepEqual(saved.remote, { url: 'tls://gw.example:4222', credentials: { node: 'NODE_NKEY' } })
  assert.equal(saved.keys, null)
})

test('derived nats-server.conf binds loopback, points store_dir at the explicit dir and carries public keys only', async t => {
  const dshHome = await home(t)
  const center = createNKeyPair()
  const node = createNKeyPair()
  const settings = await saveSettings(dshHome, {
    mode: 'local', clientPort: 4222, monitorPort: 8222, binary: 'nats-server',
    remote: { url: '', credentials: {} },
    keys: { center: { ref: CREDENTIAL_REFS.center, publicKey: center.publicKey }, node: { ref: CREDENTIAL_REFS.node, publicKey: node.publicKey } },
  })
  const paths = gatewayPaths(dshHome)
  const conf = renderServerConfig(settings, paths)
  assert.match(conf, /listen: 127\.0\.0\.1:4222\n/)
  assert.match(conf, /http: 127\.0\.0\.1:8222\n/)
  assert.match(conf, new RegExp(`store_dir: "${paths.jetstream.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"`))
  assert.ok(conf.includes(`nkey: ${center.publicKey}`) && conf.includes(`nkey: ${node.publicKey}`))
  assert.ok(!conf.includes(center.seed) && !conf.includes(node.seed) && !conf.includes('SU'), 'no seed in the derived config')
  assert.throws(() => renderServerConfig({ ...settings, keys: null }, paths), { code: 'gateway/keys-missing' })
  assert.throws(() => renderServerConfig({ ...settings, mode: 'remote' }, paths), { code: 'gateway/remote-mode' })
})
