import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const files = [
  'typert.host.js',
  'typert.host.d.ts',
  'typert.remote-client.js',
  'typert.remote-client.d.ts',
  'typert.remote-client.d.ts.map',
]

test('official generator emits five importable/readable Time artifacts with exactly eight product Remote methods', async () => {
  for (const file of files) await readFile(new URL(`../lib/${file}`, import.meta.url), 'utf8')
  const host = await import(new URL('../lib/typert.host.js', import.meta.url).href)
  const remote = await import(new URL('../lib/typert.remote-client.js', import.meta.url).href)
  assert.equal(host.TYPERT.package, 'dsh-secretary-time-controller')
  assert.equal(remote.default.package, 'dsh-secretary-time-controller')
  assert.deepEqual(remote.default.descriptors.map(item => `${item.namespace}/${item.method}`), [
    'secretaryTag/agentInvoke',
    'secretaryTime/agentInvoke', 'secretaryTime/deleteBlock', 'secretaryTime/paint', 'secretaryTime/paintDeep',
    'secretaryTime/readWindow', 'secretaryTime/reloadWindow', 'secretaryTime/replaceDay', 'secretaryTime/updateBlock',
    'secretaryTime/watch',
  ])
  assert.equal(remote.default.descriptors[0].result.mode, 'strict')
  assert.equal(remote.default.descriptors[0].parameters[0].codec.mode, 'strict')
  const watch = remote.default.descriptors.at(-1)
  assert.equal(watch.method, 'watch')
  assert.equal(watch.mode, 'stream')
})
