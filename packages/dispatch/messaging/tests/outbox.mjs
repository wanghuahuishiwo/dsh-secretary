/** The Outbox/Inbox store needs no Gateway: one file, one transaction for business rows and the pending event. */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { openOutbox } from '../lib/index.js'

async function store(t) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-messaging-outbox-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const path = join(dir, 'outbox.sqlite')
  const outbox = openOutbox(path)
  t.after(() => outbox.close())
  // A business table lives in the same file: that is what makes its rows and the event one transaction.
  outbox.db.exec('CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, status TEXT NOT NULL)')
  return { outbox, path }
}

const source = 'urn:dsh:center'

test('a business row and its event commit together; a throwing transaction leaves neither', async t => {
  const { outbox } = await store(t)
  const event = outbox.transaction(tx => {
    tx.db.prepare('INSERT INTO tickets VALUES (?, ?)').run('T-1', 'In Progress')
    return tx.publish({ type: 'task.assigned', data: { ticket: 'T-1' } }, source)
  })
  assert.equal(event.source, source)
  assert.match(event.id, /^[0-9a-f-]{36}$/)
  assert.deepEqual(outbox.db.prepare('SELECT * FROM tickets').all().map(row => row.id), ['T-1'])
  assert.deepEqual(outbox.pending().map(entry => entry.event), [event])

  assert.throws(() => outbox.transaction(tx => {
    tx.db.prepare('INSERT INTO tickets VALUES (?, ?)').run('T-2', 'Done')
    tx.publish({ type: 'task.assigned', data: { ticket: 'T-2' } }, source)
    throw new Error('business rule failed')
  }), /business rule failed/)
  assert.deepEqual(outbox.db.prepare('SELECT * FROM tickets').all().map(row => row.id), ['T-1'], 'the business row rolled back with the event')
  assert.equal(outbox.pending().length, 1)
})

test('the same id cannot be queued twice; marking published records the stream position and drops the entry from pending', async t => {
  const { outbox } = await store(t)
  const event = outbox.transaction(tx => tx.publish({ type: 'task.assigned', data: 1, id: '11111111-1111-4111-8111-111111111111', time: '2026-11-26T01:00:00Z' }, source))
  assert.deepEqual([event.id, event.time], ['11111111-1111-4111-8111-111111111111', '2026-11-26T01:00:00Z'])
  assert.throws(() => outbox.transaction(tx => tx.publish({ type: 'task.assigned', data: 1, id: event.id }, source)), { code: 'messaging/outbox-duplicate-id' })
  const failed = outbox.pending()[0]
  outbox.markFailed(failed.id, 'gateway down')
  assert.deepEqual([outbox.pending()[0].attempts, outbox.pending()[0].lastError], [1, 'gateway down'])
  outbox.markPublished(event.id, { stream: 'dsh-events', seq: 7 })
  assert.deepEqual(outbox.pending(), [])
  const [stored] = outbox.entries()
  assert.deepEqual([stored.id, stored.status, stored.stream, stored.seq, stored.publishedAt !== null], [event.id, 'published', 'dsh-events', 7, true])
})

test('inbox: the first acceptance is recorded with its stream position, the same event id is a duplicate afterwards', async t => {
  const { outbox } = await store(t)
  const event = { id: '22222222-2222-4222-8222-222222222222', type: 'aone.bug.created', source, time: '2026-11-26T01:00:00Z', data: 1 }
  const meta = { subject: 'dsh.events.aone.bug.created', stream: 'dsh-events', seq: 3 }
  assert.equal(outbox.transaction(tx => tx.accept(event, meta)), true)
  assert.equal(outbox.transaction(tx => tx.accept(event, meta)), false, 'already accepted')
  const [record] = outbox.accepted()
  assert.deepEqual([record.id, record.type, record.subject, record.stream, record.seq], [event.id, event.type, meta.subject, 'dsh-events', 3])
  assert.match(record.acceptedAt, /^\d{4}-\d{2}-\d{2}T/)
  assert.deepEqual(outbox.transaction(tx => [tx.seen(event.id), tx.seen('nope')]), [true, false])
})

test('afterCommit callbacks run only once the transaction has committed, in order; a rolled-back transaction runs none', async t => {
  const { outbox } = await store(t)
  const seen = []
  outbox.transaction((tx) => {
    tx.afterCommit(() => seen.push('first'))
    tx.afterCommit(() => seen.push(`second, row visible: ${tx.db.prepare('SELECT COUNT(*) AS n FROM tickets').get().n}`))
    seen.push('inside')
    tx.db.prepare('INSERT INTO tickets VALUES (?, ?)').run('T-3', 'New')
  })
  assert.deepEqual(seen, ['inside', 'first', 'second, row visible: 1'])
  assert.throws(() => outbox.transaction((tx) => {
    tx.afterCommit(() => seen.push('rolled back'))
    throw new Error('nope')
  }), /nope/)
  assert.equal(seen.length, 3)
})
