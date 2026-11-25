import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { gatewayPaths, readPermissions } from 'dsh-secretary-dispatch-gateway'
import { STREAM_NAME, durableName, planStream, streamConfig, writePermissions } from '../lib/index.js'

test('declared event types become the role\'s subject permissions file, which the Gateway reads at start', async t => {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-messaging-catalog-'))
  t.after(() => rm(dshHome, { recursive: true, force: true }))
  await writePermissions(dshHome, 'node', { publish: ['aone.bug.created', 'task.result'], subscribe: ['task.assigned'] })
  assert.deepEqual(await readPermissions(dshHome), {
    center: { publish: [], subscribe: [] },
    node: { publish: ['dsh.events.aone.bug.created', 'dsh.events.task.result'], subscribe: ['dsh.events.task.assigned'] },
  })
  assert.equal(gatewayPaths(dshHome).permissions('node'), join(dshHome, 'gateway', 'permissions.node.json'))
  await writePermissions(dshHome, 'node', { publish: [], subscribe: ['task.result'] })
  assert.deepEqual((await readPermissions(dshHome)).node, { publish: [], subscribe: ['dsh.events.task.result'] }, 'a later declaration replaces the file')
  await assert.rejects(writePermissions(dshHome, 'node', { publish: ['Bad'], subscribe: [] }), { code: 'messaging/type-invalid' })
})

test('one File/Limits stream captures every declared subject; a new subject is added online, an existing one changes nothing', () => {
  assert.deepEqual(streamConfig(['dsh.events.a', 'dsh.events.b']), {
    name: STREAM_NAME, subjects: ['dsh.events.a', 'dsh.events.b'], storage: 'file', retention: 'limits',
  })
  assert.deepEqual(planStream(undefined, ['dsh.events.a']), { create: true, subjects: ['dsh.events.a'] })
  assert.deepEqual(planStream(['dsh.events.a'], ['dsh.events.a']), { create: false, add: [] })
  assert.deepEqual(planStream(['dsh.events.a'], ['dsh.events.a', 'dsh.events.b', 'dsh.events.c']), { create: false, add: ['dsh.events.b', 'dsh.events.c'] })
  assert.deepEqual(planStream(['dsh.events.>'], ['dsh.events.z']), { create: false, add: [] }, 'a wildcard capture already covers it')
  assert.match(STREAM_NAME, /^[a-zA-Z0-9_-]+$/, 'a stream name has no dots or spaces')
})

test('a durable consumer is named per role and subject, stable across restarts and distinct for distinct subjects', () => {
  const a = durableName('node', 'dsh.events.task.assigned')
  assert.equal(a, durableName('node', 'dsh.events.task.assigned'))
  assert.match(a, /^[a-zA-Z0-9_-]+$/)
  assert.ok(a.startsWith('node-task-assigned-'), a)
  assert.notEqual(a, durableName('center', 'dsh.events.task.assigned'))
  assert.notEqual(durableName('node', 'dsh.events.a.b'), durableName('node', 'dsh.events.a-b'))
})
