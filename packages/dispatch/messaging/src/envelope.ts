/**
 * CloudEvents 1.0.2 Core + JSON Event Format + NATS Protocol Binding (structured content mode), with the DSH profile:
 * - `id` is generated as a UUID (globally unique), `data` and `time` (RFC 3339) are required;
 * - `source` is `urn:dsh:center` or `urn:dsh:node:<nodeId>`;
 * - the NATS subject is `dsh.events.<type>`, so `type` is restricted to dot-separated lowercase tokens.
 * No extension attribute is defined, `dataschema` is passed through and `data` is not validated.
 */
import { randomUUID } from 'node:crypto'
import { MessagingError } from './errors.ts'

export const SPECVERSION = '1.0'
/** Fixed prefix of the DSH event address space; a NATS subject is the prefix plus the event `type`. */
export const SUBJECT_PREFIX = 'dsh.events.'
export const CENTER_SOURCE = 'urn:dsh:center'

const TYPE = /^[a-z0-9][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)*$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const ATTRIBUTE_NAME = /^[a-z0-9_]+$/

/** One CloudEvent as exchanged on the wire; attribute names follow the JSON Event Format. */
export interface CloudEvent {
  readonly specversion: typeof SPECVERSION
  readonly id: string
  readonly source: string
  readonly type: string
  readonly time: string
  readonly data: unknown
  readonly [attribute: string]: unknown
}

/** What a publisher provides; `id` and `time` are optional so a retry can repeat the same event. */
export interface EventInput {
  readonly type: string
  readonly data: unknown
  readonly id?: string
  readonly time?: string
  readonly datacontenttype?: string
  readonly dataschema?: string
}

/** The NATS subject of an event type. */
export function subjectFor(type: string): string {
  if (typeof type !== 'string' || !TYPE.test(type)) {
    throw new MessagingError('messaging/type-invalid', `事件 type 只能是点分的小写 token（a-z 0-9 _ -）：${JSON.stringify(type)}`)
  }
  return SUBJECT_PREFIX + type
}

/** The `source` of events published by a node. */
export function nodeSource(nodeId: string): string {
  return `urn:dsh:node:${nodeId}`
}

function invalid(reason: string): never {
  throw new MessagingError('messaging/envelope-invalid', `事件信封不符合 CloudEvents 1.0.2 / DSH profile：${reason}`)
}

/** Build a valid event; the `source` is decided by the role, never by the caller. */
export function createEvent(input: EventInput, source: string): CloudEvent {
  subjectFor(input.type)
  if (!hasOwn(input, 'data')) invalid('data 必填')
  const time = input.time ?? new Date().toISOString()
  const event: Record<string, unknown> = { specversion: SPECVERSION, id: input.id ?? randomUUID(), source, type: input.type, time }
  event.datacontenttype = input.datacontenttype ?? 'application/json'
  if (input.dataschema !== undefined) event.dataschema = input.dataschema
  event.data = input.data
  return parseEvent(subjectFor(input.type), new TextEncoder().encode(JSON.stringify(event)))
}

const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key)

/** Decode and validate one structured-mode event received on `subject`. */
export function parseEvent(subject: string, payload: Uint8Array): CloudEvent {
  let raw: unknown
  try {
    raw = JSON.parse(new TextDecoder().decode(payload))
  } catch {
    invalid('不是合法 JSON')
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) invalid('必须是一个 JSON 对象')
  const event: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(raw)) {
    if (value === null) continue // JSON Event Format: null means unset
    if (name === 'data') {
      event.data = value
      continue
    }
    if (!ATTRIBUTE_NAME.test(name) || typeof value !== 'string') invalid(`${name} 必须是字符串属性`)
    event[name] = value
  }
  if (event.specversion !== SPECVERSION) invalid('specversion 必须是 "1.0"')
  for (const name of ['id', 'source', 'type']) if (typeof event[name] !== 'string' || event[name] === '') invalid(`${name} 必填且非空`)
  if (!hasOwn(event, 'data')) invalid('data 必填')
  if (typeof event.time !== 'string' || !RFC3339.test(event.time) || Number.isNaN(Date.parse(event.time))) invalid('time 必须是 RFC 3339')
  const source = event.source as string
  if (source !== CENTER_SOURCE && !(source.startsWith('urn:dsh:node:') && UUID.test(source.slice('urn:dsh:node:'.length)))) {
    invalid('source 必须是 urn:dsh:center 或 urn:dsh:node:<UUID>')
  }
  if (subjectFor(event.type as string) !== subject) invalid(`type 与 NATS subject 不配对（收到 ${subject}）`)
  return event as CloudEvent
}
