import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  CREDENTIAL_REFS, GatewayError, createNKeyPair, defaultDshHome, gatewayPaths, readSettings, renderServerConfig,
  saveSettings, updateSettings, readPermissions, DEFAULT_SETTINGS as DEFAULT,
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
  assert.equal(paths.permissions('node'), '/tmp/x/y/gateway/permissions.node.json')
  const { permissions: _permissions, ...files } = paths
  assert.deepEqual(files, {
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

test('permissions: each role gets its own publish allowlist; reading every event and JetStream is always allowed', async t => {
  const dshHome = await home(t)
  const paths = gatewayPaths(dshHome)
  const center = createNKeyPair(), node = createNKeyPair()
  const settings = { ...DEFAULT, keys: { center: { ref: CREDENTIAL_REFS.center, publicKey: center.publicKey }, node: { ref: CREDENTIAL_REFS.node, publicKey: node.publicKey } } }
  assert.deepEqual(await readPermissions(dshHome), { center: { publish: [], subscribe: [] }, node: { publish: [], subscribe: [] } })
  // No declared events: nothing may be published, but every event stays readable by the console's read path.
  const closed = renderServerConfig(settings, paths, await readPermissions(dshHome))
  assert.ok(!closed.includes('publish: { allow: ["$JS.API.>", "$JS.ACK.>", "dsh.events.'), closed)
  assert.equal(closed.split('"dsh.events.>"').length - 1, 2, closed)
  const permissions = {
    center: { publish: ['dsh.events.task.assigned'], subscribe: ['dsh.events.aone.bug.created'] },
    node: { publish: ['dsh.events.aone.bug.created', 'dsh.events.task.result'], subscribe: ['dsh.events.task.assigned'] },
  }
  const conf = renderServerConfig(settings, paths, permissions)
  const [centerBlock, nodeBlock] = ['center', 'node'].map(role => {
    const lines = conf.split('\n')
    const start = lines.findIndex(line => line.startsWith(`    { nkey: ${settings.keys[role].publicKey}`))
    return lines.slice(start, start + lines.slice(start).findIndex(line => line.startsWith('    }')) + 1)
      .map((line, index, all) => line.slice(index === all.length - 1 ? 4 : 6)).join('\n')
  })
  assert.deepEqual(centerBlock, [
    `nkey: ${center.publicKey},`,
    'permission: {',
    '  publish: { allow: ["$JS.API.>", "$JS.ACK.>", "_INBOX.>", "$SRV.PING", "$SRV.INFO", "dsh.events.task.assigned"] },',
    '  subscribe: { allow: ["$JS.API.>", "_INBOX.>", "$SRV.>", "dsh.events.>"] }',
    '}',
    '},',
  ].join('\n'))
  assert.equal(conf.split('\n').filter(line => line === '    },').length, 1, 'exactly one comma between the two users')
  assert.deepEqual(nodeBlock, [
    `nkey: ${node.publicKey},`,
    'permission: {',
    '  publish: { allow: ["$JS.API.>", "$JS.ACK.>", "_INBOX.>", "dsh.events.aone.bug.created", "dsh.events.task.result"] },',
    '  subscribe: { allow: ["$JS.API.>", "_INBOX.>", "$SRV.>", "dsh.events.>"] }',
    '}',
    '}',
  ].join('\n'))
  assert.ok(conf.indexOf(`nkey: ${center.publicKey}`) < conf.indexOf(`nkey: ${node.publicKey}`), 'users keep the center, node order')
  assert.match(conf, new RegExp(`\\n    }\\n  \\]\\n}\\n$`), 'the last user has no trailing comma')
  assert.ok(!conf.includes(center.seed) && !conf.includes(node.seed))
})

test('permissions: a role file is read back per role; a malformed or wildcarded file is an error, not a silent allow', async t => {
  const dshHome = await home(t)
  const paths = gatewayPaths(dshHome)
  assert.equal(paths.permissions('center'), join(paths.dir, 'permissions.center.json'))
  await mkdir(paths.dir, { recursive: true })
  await writeFile(paths.permissions('node'), `${JSON.stringify({ publish: ['dsh.events.task.result'], subscribe: [] })}\n`)
  assert.deepEqual(await readPermissions(dshHome), {
    center: { publish: [], subscribe: [] }, node: { publish: ['dsh.events.task.result'], subscribe: [] },
  })
  await writeFile(paths.permissions('center'), '{ not json')
  await assert.rejects(readPermissions(dshHome), { code: 'gateway/invalid-permissions' })
  await writeFile(paths.permissions('center'), JSON.stringify({ publish: ['dsh.events.>'], subscribe: [] }))
  await assert.rejects(readPermissions(dshHome), { code: 'gateway/invalid-permissions' })
})
