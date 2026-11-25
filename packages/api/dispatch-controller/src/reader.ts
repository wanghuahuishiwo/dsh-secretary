/**
 * The console read path (#105): service discovery and stream paging over the Host's own read-only connection with the
 * center credential. Nothing is stored, derived or filtered here: what the Gateway holds is what the caller gets.
 */
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { AckPolicy, DeliverPolicy, JetStreamApiCodes, JetStreamApiError, jetstream, jetstreamManager } from '@nats-io/jetstream'
import type { JetStreamManager } from '@nats-io/jetstream'
import { errors, nkeyAuthenticator, type NatsConnection } from '@nats-io/nats-core'
import { Svcm } from '@nats-io/services'
import { connect } from '@nats-io/transport-node'
import { CREDENTIAL_REFS, readSettings } from 'dsh-secretary-dispatch-gateway'
import type { SecretStore } from 'dsh-secretary-dispatch-gateway'
import { STREAM_NAME } from 'dsh-secretary-dispatch-messaging'
import { DatabaseSync } from 'node:sqlite'
import type { EventPage, StreamEvent } from './types.ts'

/** Every DSH event travels under this subject, whatever an event catalog declared. */
const EVENTS_SUBJECT = 'dsh.events.>'
/** An ephemeral consumer is dropped by the Gateway once idle for this long. */
const CONSUMER_IDLE_NS = 5_000_000_000
/** A fetch waits this long before answering when deleted sequences leave it fewer messages than it asked for. */
const FETCH_EXPIRES_MS = 1_000

export interface ReaderSession {
  readonly nc: NatsConnection
  readonly jsm: JetStreamManager
}

async function openSession(dshHome: string, secrets: SecretStore, onEvent: () => void): Promise<ReaderSession> {
  const settings = await readSettings(dshHome)
  const local = settings.mode === 'local'
  const url = local ? `nats://127.0.0.1:${settings.clientPort}` : settings.remote.url
  const ref = local ? settings.keys?.center?.ref : settings.remote.credentials.center
  if (ref === undefined) throw new Error('center 角色没有凭据引用：请在底座控制台 Gateway 分区先生成 NKey 或配置远程凭据')
  const seed = (await secrets.resolve(credentialRef(ref)))?.trim()
  if (seed === undefined || seed === '') throw new Error(`凭据 ${ref}（${CREDENTIAL_REFS.center}）解析不到 seed`)
  const nc = await connect({
    servers: url.replace(/^tls:\/\//, ''),
    ...(url.startsWith('tls://') ? { tls: {} } : {}),
    authenticator: nkeyAuthenticator(new TextEncoder().encode(seed)),
  })
  // Every event the Gateway holds from now on is a mark; the mark carries no data, the client decides what to re-read.
  const subscription = await nc.subscribe(EVENTS_SUBJECT, { callback: () => { onEvent() } })
  nc.closed().then(() => { subscription.unsubscribe() })
  return { nc, jsm: await jetstreamManager(nc) }
}

/** One read-only center connection per Host; a failed or closed one is replaced on the next read. */
export class ConsoleReader {
  private session: Promise<ReaderSession> | undefined
  private readonly listeners = new Set<() => void>()

  constructor(
    private readonly dshHome: string,
    private readonly secrets: SecretStore,
    /** SQLite file of the center engine's event history; `undefined` when no engine is configured here. */
    private readonly historyPath: string | undefined,
  ) {}

  private async connection(): Promise<ReaderSession> {
    this.session ??= openSession(this.dshHome, this.secrets, () => { for (const notify of this.listeners) notify() })
      .catch(error => { this.session = undefined; throw error })
    const { nc } = await this.session
    if (nc.isClosed()) { this.session = undefined; return this.connection() }
    return this.session
  }

  /** Called once per event the Gateway delivers from now on; the return value stops it. */
  onEvent(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Every service instance answering the official discovery request, exactly as the SDK returned it. */
  async listServices(): Promise<Array<Record<string, unknown>>> {
    const { nc } = await this.connection()
    const out: Array<Record<string, unknown>> = []
    try {
      for await (const info of await new Svcm(nc).client().info()) out.push(info as unknown as Record<string, unknown>)
    } catch (error) {
      // Nobody listening on the discovery subject is the plain fact that no service is online; anything else is a failure.
      if (!(error instanceof errors.NoRespondersError && error.subject === '$SRV.INFO')) throw error
    }
    return out
  }

  /**
   * Up to `limit` messages that lie before stream sequence `before`, newest first; without `before`, the newest.
   * Read through a fresh ephemeral pull consumer that is never given a durable name.
   */
  async listEvents(query: { before: number; limit: number }): Promise<EventPage> {
    const { nc, jsm } = await this.connection()
    const { before, limit } = query
    const events: Array<{ seq: number; subject: string; event: unknown; history: StreamEvent['history'] }> = []
    const stream = await jsm.streams.info(STREAM_NAME).catch((error: unknown) => {
      if (error instanceof JetStreamApiError && error.code === JetStreamApiCodes.StreamNotFound) return undefined // no event has been published yet
      throw error
    })
    if (stream === undefined) return { firstSeq: 0, lastSeq: 0, events }
    const end = Math.min(before, stream.state.last_seq + 1) // exclusive
    const start = Math.max(stream.state.first_seq, end - limit)
    if (end > start && stream.state.messages > 0) {
      const info = await jsm.consumers.add(STREAM_NAME, {
        deliver_policy: DeliverPolicy.StartSequence, opt_start_seq: start, ack_policy: AckPolicy.None,
        inactive_threshold: CONSUMER_IDLE_NS, // ephemeral: no durable name, gone once idle
      })
      try {
        const consumer = await jetstream(nc).consumers.get(STREAM_NAME, info.name)
        const messages = await consumer.fetch({ max_messages: end - start, expires: FETCH_EXPIRES_MS })
        for await (const message of messages) {
          if (message.seq >= end) continue // deleted sequences shift the window: keep only what was asked for
          events.push({ seq: message.seq, subject: message.subject, event: decode(message.data), history: [] })
        }
      } finally {
        // The page is read: the consumer is dropped now instead of waiting for its idle timeout.
        await jsm.consumers.delete(STREAM_NAME, info.name).catch(() => { /* already gone */ })
      }
    }
    events.sort((a, b) => b.seq - a.seq)
    const idOf = (item: { event: unknown }): string | undefined => {
      const id = envelopeId(item.event)
      return typeof id === 'string' ? id : undefined
    }
    const history = readHistory(this.historyPath, events.map(idOf).filter((id): id is string => id !== undefined))
    for (const item of events) {
      const id = idOf(item)
      item.history = (id === undefined ? undefined : history.get(id)) ?? []
    }
    return { firstSeq: stream.state.first_seq, lastSeq: stream.state.last_seq, events }
  }

  async close(): Promise<void> {
    const session = await this.session?.catch(() => undefined)
    this.session = undefined
    await session?.nc.close()
  }
}

/** The stored payload as published: a parsed JSON document, or the text itself when it is not JSON. */
function decode(payload: Uint8Array): unknown {
  const text = new TextDecoder().decode(payload)
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function envelopeId(event: unknown): unknown {
  return typeof event === 'object' && event !== null ? (event as { id?: unknown }).id : undefined
}

/** Engine event history rows naming one of `eventIds`, in the engine's own record shape; none when there is no file. */
export function readHistory(historyPath: string | undefined, eventIds: readonly string[]): Map<string, Array<Record<string, unknown>>> {
  const out = new Map<string, Array<Record<string, unknown>>>()
  if (historyPath === undefined || eventIds.length === 0) return out
  let db: DatabaseSync
  try {
    db = new DatabaseSync(historyPath, { readOnly: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as { code?: string }).code === 'SQLITE_CANTOPEN') return out
    throw error
  }
  try {
    const byEvent = db.prepare('SELECT * FROM history WHERE eventId = ? ORDER BY seq')
    for (const eventId of eventIds) {
      const rows = (byEvent.all(eventId) as Array<Record<string, unknown>>).map(row => {
        // The engine's own record shape (`openEventHistory`): absent ids are omitted, the others stay as stored.
        const record: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(row)) {
          if (value === null) {
            if (key === 'instanceId' || key === 'graphId') record[key] = null
            continue
          }
          record[key] = key === 'payload' ? JSON.parse(String(value)) : value
        }
        return record
      })
      if (rows.length > 0) out.set(eventId, rows)
    }
  } finally {
    db.close()
  }
  return out
}
