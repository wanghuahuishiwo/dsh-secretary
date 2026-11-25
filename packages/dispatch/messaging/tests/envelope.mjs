import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CENTER_SOURCE, MessagingError, createEvent, nodeSource, parseEvent, subjectFor,
} from '../lib/index.js'

const NODE_ID = '2f0c3a5e-9b1d-4c6e-8a7f-1d2e3f4a5b6c'
const GOOD = {
  specversion: '1.0',
  id: '4f4b1b1f-3f2f-4ef4-a31b-e8f9265f50f0',
  source: `urn:dsh:node:${NODE_ID}`,
  type: 'aone.bug.created',
  time: '2026-11-14T10:00:00Z',
  datacontenttype: 'application/json',
  data: { bugId: 'T-1' },
}
const SUBJECT = 'dsh.events.aone.bug.created'
const wire = value => new TextEncoder().encode(JSON.stringify(value))
const invalid = (payload, subject = SUBJECT) =>
  assert.throws(() => parseEvent(subject, typeof payload === 'string' || payload instanceof Uint8Array ? payload : wire(payload)), error => {
    assert.ok(error instanceof MessagingError, `MessagingError, got ${error}`)
    assert.equal(error.code, 'messaging/envelope-invalid')
    return true
  })

test('subjectFor: a NATS subject is the fixed prefix plus the event type; only dot-separated lowercase tokens map', () => {
  assert.equal(subjectFor('aone.bug.created'), 'dsh.events.aone.bug.created')
  assert.equal(subjectFor('task_result-done.v2'), 'dsh.events.task_result-done.v2')
  for (const type of ['', 'Aone.bug', 'aone..bug', 'aone.bug.', '.aone', 'aone.*', 'aone.>', 'a one', '$JS.API', 'urn:dsh:node:1']) {
    assert.throws(() => subjectFor(type), error => error.code === 'messaging/type-invalid', JSON.stringify(type))
  }
  assert.equal(nodeSource(NODE_ID), `urn:dsh:node:${NODE_ID}`)
  assert.equal(CENTER_SOURCE, 'urn:dsh:center')
})

test('a known-good DSH event decodes with its attributes intact; optional attributes pass through', () => {
  assert.deepEqual(parseEvent(SUBJECT, wire(GOOD)), GOOD)
  const withOptionals = parseEvent(SUBJECT, wire({ ...GOOD, dataschema: 'https://example.com/aone.schema.json', subject: 'T-1', traceparent: '00-abc-def-01' }))
  assert.deepEqual(withOptionals, { ...GOOD, dataschema: 'https://example.com/aone.schema.json', subject: 'T-1', traceparent: '00-abc-def-01' })
})

test('createEvent fills id (UUID), time and content type; an explicit id and time are kept for retries with the same event', () => {
  const before = Date.now()
  const event = createEvent({ type: 'aone.bug.created', data: { bugId: 'T-1' } }, CENTER_SOURCE)
  assert.equal(event.specversion, '1.0')
  assert.equal(event.source, 'urn:dsh:center')
  assert.equal(event.type, 'aone.bug.created')
  assert.equal(event.datacontenttype, 'application/json')
  assert.match(event.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.ok(Date.parse(event.time) >= before)
  assert.deepEqual(parseEvent(SUBJECT, wire(event)), event)
  const retried = createEvent({ type: 'aone.bug.created', data: 1, id: GOOD.id, time: GOOD.time }, nodeSource(NODE_ID))
  assert.deepEqual(retried, { ...GOOD, source: `urn:dsh:node:${NODE_ID}`, data: 1 })
  assert.throws(() => createEvent({ type: 'Bad', data: 1 }, CENTER_SOURCE), { code: 'messaging/type-invalid' })
})

test('CloudEvents 1.0.2 JSON format: a non-object, a wrong specversion, a missing REQUIRED attribute or a non-string attribute is rejected', () => {
  for (const text of ['nope', '[]', 'null', '"x"', '']) invalid(text)
  for (const patch of [{ specversion: '1.0.1' }, { specversion: 1 }, { id: undefined }, { id: '' }, { source: undefined }, { type: undefined }]) {
    invalid({ ...GOOD, ...patch })
  }
  invalid({ ...GOOD, datacontenttype: 5 })
  invalid({ ...GOOD, time: 1763200800000 })
})

test('DSH profile: data and time are required, the source is the center or a node URN, and the type must pair with the NATS subject', () => {
  const { data: _data, ...withoutData } = GOOD
  invalid(withoutData)
  invalid({ ...GOOD, data: null })
  const { time: _time, ...withoutTime } = GOOD
  invalid(withoutTime)
  for (const time of ['', '2026-11-14 10:00:00', 'yesterday', '2026-13-40T10:00:00Z']) invalid({ ...GOOD, time })
  for (const source of ['', 'urn:dsh:', 'urn:dsh:node', 'urn:dsh:node:', '/mycontext', `urn:dsh:nodes:${NODE_ID}`]) invalid({ ...GOOD, source })
  assert.deepEqual(parseEvent(SUBJECT, wire({ ...GOOD, source: 'urn:dsh:center' })), { ...GOOD, source: 'urn:dsh:center' })
  assert.equal(parseEvent(SUBJECT, wire(GOOD)).source, `urn:dsh:node:${NODE_ID}`)
  invalid(GOOD, 'dsh.events.aone.bug.updated')
  invalid(GOOD, 'dsh.other.aone.bug.created')
})

test('a null OPTIONAL attribute means unset in the JSON format and is dropped, not rejected', () => {
  const parsed = parseEvent(SUBJECT, wire({ ...GOOD, dataschema: null, subject: null }))
  assert.deepEqual(parsed, GOOD)
})
