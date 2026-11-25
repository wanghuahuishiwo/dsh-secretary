/** Real nats-server regression: runs when `DSH_NATS_SERVER` names the binary (or it is on PATH), otherwise skipped. */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { gatewayPaths, isProcessAlive, JETSTREAM_STORE_SUBDIR, locateNatsServer, probeGateway, saveSettings, startGateway, stopGateway } from '../lib/index.js'

const configured = process.env.DSH_NATS_SERVER ?? 'nats-server'
const skip = process.env.DSH_NATS_SERVER === undefined && !(await locateNatsServer(configured)).found
  ? 'set DSH_NATS_SERVER=<nats-server binary> to run against a real nats-server' : false

async function freePort() {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise(resolve => server.close(resolve))
  return port
}

test('real nats-server: /varz store_dir is the configured dir plus "jetstream", so the record is recognised and can be stopped', { skip, timeout: 60_000 }, async t => {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-gateway-real-'))
  t.after(async () => {
    try { await stopGateway(dshHome) } catch { /* never started */ }
    await rm(dshHome, { recursive: true, force: true })
  })
  // Not 4222/8222: test files run in parallel and tests/manage.mjs uses those for its fake server.
  const [clientPort, monitorPort] = await Promise.all([freePort(), freePort()])
  await saveSettings(dshHome, { mode: 'local', clientPort, monitorPort, binary: configured, remote: { url: '', credentials: {} }, keys: null })
  const running = await startGateway(dshHome, { secrets: { async resolve() { return undefined }, async set() {} } })
  assert.equal(running.state, 'running', JSON.stringify(running))
  assert.match(running.version ?? '', /^\d+\.\d+\.\d+$/)
  const paths = gatewayPaths(dshHome)
  assert.match(await readFile(paths.conf, 'utf8'), new RegExp(`store_dir: "${paths.jetstream}"`), 'the conf names our explicit dir')
  const varz = await (await fetch(`http://127.0.0.1:${monitorPort}/varz`)).json()
  assert.equal(varz.jetstream.config.store_dir, join(paths.jetstream, JETSTREAM_STORE_SUBDIR), 'nats-server appends its own directory')
  assert.equal((await probeGateway(dshHome)).state, 'running')
  const stopped = await stopGateway(dshHome)
  assert.equal(stopped.state, 'stopped')
  assert.ok(!isProcessAlive(running.pid))
})
