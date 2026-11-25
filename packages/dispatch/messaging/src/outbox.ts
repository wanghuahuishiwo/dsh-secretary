/**
 * Transactional Outbox and Inbox in one self-managed `node:sqlite` file per role (`$DSH_HOME/dispatch/<role>/outbox.sqlite`).
 * Business tables may live in the same file: a transaction then covers the business rows and the event to publish.
 * The file is opened by one connection only: `transaction` is synchronous and refuses to nest.
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createEvent, subjectFor } from './envelope.ts'
import type { CloudEvent, EventInput } from './envelope.ts'
import { MessagingError } from './errors.ts'

export const OUTBOX_FILENAME = 'outbox.sqlite'

export type OutboxStatus = 'pending' | 'published'

/** One queued event; `pending` until the relay saw its PubAck. */
export interface OutboxEntry {
  readonly id: string
  readonly type: string
  readonly subject: string
  readonly event: CloudEvent
  readonly status: OutboxStatus
  readonly attempts: number
  readonly createdAt: string
  /** When the relay saw the PubAck; `null` while pending. */
  readonly publishedAt: string | null
  readonly stream: string | null
  readonly seq: number | null
  /** The last relay error; `null` when the last attempt succeeded. */
  readonly lastError: string | null
}

/** A durable acceptance: the consumer ACK is sent only after this row is committed. */
export interface InboxRecord {
  readonly id: string
  readonly type: string
  readonly subject: string
  readonly stream: string
  readonly seq: number
  readonly acceptedAt: string
}

/** The Outbox file of a role under `$DSH_HOME/dispatch/`. */
export function outboxPath(dshHome: string, role: string): string {
  return `${dshHome}/dispatch/${role}/${OUTBOX_FILENAME}`
}

/** What a transaction may do: write business rows on `db`, queue events, record acceptances. */
export interface OutboxTransaction {
  /** The connection inside the open transaction. */
  readonly db: DatabaseSync
  /** Queue an event; it is published by the relay after the transaction commits. */
  publish(input: EventInput, source: string): CloudEvent
  /** Record that an event is accepted; returns `false` when its id was already accepted. */
  accept(event: CloudEvent, meta: { readonly subject: string; readonly stream: string; readonly seq: number }): boolean
  seen(eventId: string): boolean
}

export interface Outbox {
  readonly db: DatabaseSync
  /** Run `fn` in one transaction; a throw rolls back everything written through `tx`. */
  transaction<T>(fn: (tx: OutboxTransaction) => T): T
  pending(): OutboxEntry[]
  /** All queued events, oldest first. */
  entries(): OutboxEntry[]
  /** All accepted events, oldest first. */
  accepted(): InboxRecord[]
  markPublished(id: string, position: { readonly stream: string; readonly seq: number }): void
  markFailed(id: string, error: string): void
  close(): void
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as PromiseLike<unknown> | undefined)?.then === 'function'
}

export function openOutbox(path: string): Outbox {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      subject TEXT NOT NULL,
      event TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      publishedAt TEXT,
      stream TEXT,
      seq INTEGER,
      lastError TEXT
    );
    CREATE INDEX IF NOT EXISTS outbox_pending ON outbox (status, createdAt);
    CREATE TABLE IF NOT EXISTS inbox (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      subject TEXT NOT NULL,
      stream TEXT NOT NULL,
      seq INTEGER NOT NULL,
      acceptedAt TEXT NOT NULL
    );
  `)
  const insertOutbox = db.prepare('INSERT INTO outbox (id, type, subject, event, createdAt) VALUES (?, ?, ?, ?, ?)')
  const pending = db.prepare('SELECT * FROM outbox WHERE status = ? ORDER BY createdAt, rowid')
  const markPublished = db.prepare("UPDATE outbox SET status = 'published', publishedAt = ?, stream = ?, seq = ?, lastError = NULL WHERE id = ?")
  const markFailed = db.prepare('UPDATE outbox SET attempts = attempts + 1, lastError = ? WHERE id = ?')
  const insertInbox = db.prepare('INSERT INTO inbox (id, type, subject, stream, seq, acceptedAt) VALUES (?, ?, ?, ?, ?, ?)')
  const seen = db.prepare('SELECT 1 FROM inbox WHERE id = ?')
  const accepted = db.prepare('SELECT * FROM inbox ORDER BY acceptedAt, rowid')

  let open = false
  const settle = <T>(result: T, commit: () => void): T => {
    if (!isThenable(result)) { commit(); return result }
    return result.then(
      value => { commit(); return value },
      error => { db.exec('ROLLBACK'); open = false; throw error },
    ) as T
  }
  function transaction<T>(fn: (tx: OutboxTransaction) => T): T {
    if (open) throw new MessagingError('messaging/outbox-busy', 'dispatch: a transaction is already open on this connection')
    open = true
    db.exec('BEGIN IMMEDIATE')
    const tx: OutboxTransaction = {
      db,
      publish(input, source) {
        const event = createEvent(input, source)
        const subject = subjectFor(event.type)
        try { insertOutbox.run(event.id, event.type, subject, JSON.stringify(event), new Date().toISOString()) } catch (error) {
          if (error instanceof Error && error.message.includes('UNIQUE')) throw new MessagingError('messaging/outbox-duplicate-id', `事件 ${event.id} 已在 Outbox 中`, { cause: error })
          throw error
        }
        return event
      },
      accept(event, meta) {
        if (seen.get(event.id)) return false
        insertInbox.run(event.id, event.type, meta.subject, meta.stream, meta.seq, new Date().toISOString())
        return true
      },
      seen: eventId => seen.get(eventId) !== undefined,
    }
    try {
      // A promise-returning callback keeps the transaction open until it settles, so a handler commits when it resolves.
      return settle(fn(tx), () => { db.exec('COMMIT'); open = false })
    } catch (error) {
      db.exec('ROLLBACK')
      open = false
      throw error
    }
  }

  function read(row: Record<string, unknown>): OutboxEntry {
    return {
      id: row.id as string, type: row.type as string, subject: row.subject as string, event: JSON.parse(row.event as string),
      status: row.status as OutboxStatus, attempts: row.attempts as number, createdAt: row.createdAt as string,
      publishedAt: (row.publishedAt as string | null) ?? null, stream: (row.stream as string | null) ?? null,
      seq: (row.seq as number | null) ?? null, lastError: (row.lastError as string | null) ?? null,
    }
  }

  return {
    db, transaction,
    pending: () => (pending.all('pending') as Record<string, unknown>[]).map(read),
    entries: () => (db.prepare('SELECT * FROM outbox ORDER BY createdAt, rowid').all() as Record<string, unknown>[]).map(read),
    accepted: () => accepted.all() as unknown as InboxRecord[],
    markPublished: (id, position) => { markPublished.run(new Date().toISOString(), position.stream, position.seq, id) },
    markFailed: (id, error) => { markFailed.run(error, id) },
    close: () => db.close(),
  }
}
