import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { openEventHistory } from '../lib/history.js'

function tmpFile(t) {
  const dir = mkdtempSync(join(tmpdir(), 'dispatch-history-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return join(dir, 'history.sqlite')
}

test('history appends records with increasing seq and reads them back per instance and per event id', t => {
  const history = openEventHistory(tmpFile(t))
  t.after(() => history.close())
  const first = history.append({ kind: 'instance.opened', instanceId: 'i1', graphId: 'dispatch', eventId: 'e1', payload: { event: { id: 'e1', type: 'ticket.opened' } } })
  history.append({ kind: 'node.started', instanceId: 'i1', graphId: 'dispatch', nodeId: 'assign', payload: { inputs: { ticket: 'T-1' } } })
  history.append({ kind: 'unmatched', instanceId: null, graphId: null, eventId: 'e2', payload: { type: 'ticket.closed' } })

  assert.equal(first.seq, 1)
  assert.match(first.at, /^\d{4}-\d{2}-\d{2}T/)
  assert.deepEqual(
    history.listByInstance('i1').map(r => [r.seq, r.kind, r.nodeId ?? null]),
    [[1, 'instance.opened', null], [2, 'node.started', 'assign']],
  )
  assert.deepEqual(history.listByEventId('e2').map(r => r.kind), ['unmatched'])
  assert.deepEqual(history.listByEventId('missing'), [])
  assert.deepEqual(history.instanceIds(), ['i1'])
})

test('history survives reopening the same file and keeps appending after the last seq', t => {
  const path = tmpFile(t)
  const first = openEventHistory(path)
  first.append({ kind: 'instance.opened', instanceId: 'i1', graphId: 'dispatch', eventId: 'e1', payload: {} })
  first.close()
  const second = openEventHistory(path)
  t.after(() => second.close())
  const next = second.append({ kind: 'node.started', instanceId: 'i1', graphId: 'dispatch', nodeId: 'assign', payload: {} })
  assert.equal(next.seq, 2)
  assert.equal(second.listByInstance('i1').length, 2)
})

test('history rejects unknown kinds', t => {
  const history = openEventHistory(tmpFile(t))
  t.after(() => history.close())
  assert.throws(() => history.append({ kind: 'node.cancelled', instanceId: 'i1', graphId: 'dispatch', payload: {} }), /unknown history kind/)
})
