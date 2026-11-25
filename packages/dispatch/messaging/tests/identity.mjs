import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { initNodeId, nodeIdPath, readNodeId } from '../lib/index.js'

async function home(t) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-messaging-identity-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

test('a plain start only reads: missing identity is an error and no file is created; a damaged file is never replaced', async t => {
  const dshHome = await home(t)
  assert.equal(nodeIdPath(dshHome), join(dshHome, 'dispatch', 'node', 'identity.json'))
  await assert.rejects(readNodeId(dshHome), { code: 'messaging/identity-missing' })
  await assert.rejects(readFile(nodeIdPath(dshHome)), { code: 'ENOENT' })
  await mkdir(dirname(nodeIdPath(dshHome)), { recursive: true })
  await writeFile(nodeIdPath(dshHome), '{"nodeId":"not-a-uuid"}\n')
  await assert.rejects(readNodeId(dshHome), { code: 'messaging/identity-invalid' })
  assert.equal(await readFile(nodeIdPath(dshHome), 'utf8'), '{"nodeId":"not-a-uuid"}\n', 'a damaged file is left as is')
  await writeFile(nodeIdPath(dshHome), '')
  await assert.rejects(readNodeId(dshHome), { code: 'messaging/identity-invalid' })
})

test('explicit initialization writes a UUIDv4 once and never overwrites; later starts read the same nodeId', async t => {
  const dshHome = await home(t)
  // All-zero bytes except the version/variant nibbles: proves the file holds UUIDv4 of the given random source.
  const bytes = new Uint8Array(16)
  const nodeId = await initNodeId(dshHome, bytes)
  assert.equal(nodeId, '00000000-0000-4000-8000-000000000000')
  assert.equal(await readFile(nodeIdPath(dshHome), 'utf8'), `${JSON.stringify({ nodeId }, null, 2)}\n`)
  await assert.rejects(initNodeId(dshHome), { code: 'messaging/identity-exists' })
  assert.equal(await readNodeId(dshHome), nodeId)
  const fresh = await initNodeId(await home(t))
  assert.notEqual(fresh, nodeId)
})
