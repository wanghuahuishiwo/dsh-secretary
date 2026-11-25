import { DatabaseSync } from 'node:sqlite'

export type HistoryKind = 'instance.opened' | 'node.started' | 'node.completed' | 'activity.completed' | 'unmatched'

export interface HistoryInput {
  readonly kind: HistoryKind
  readonly instanceId: string | null
  readonly graphId: string | null
  readonly nodeId?: string
  readonly eventId?: string
  readonly payload: unknown
}

export interface HistoryRecord extends HistoryInput {
  readonly seq: number
  readonly at: string
}

/** Append-only event history in its own SQLite file; never shares a database with the host. */
export interface EventHistory {
  append(input: HistoryInput): HistoryRecord
  listByInstance(instanceId: string): HistoryRecord[]
  listByEventId(eventId: string): HistoryRecord[]
  instanceIds(): string[]
  close(): void
}

const KINDS: readonly HistoryKind[] = ['instance.opened', 'node.started', 'activity.completed', 'node.completed', 'unmatched']

export function openEventHistory(path: string): EventHistory {
  const db = new DatabaseSync(path)
  db.exec(`CREATE TABLE IF NOT EXISTS history (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    kind TEXT NOT NULL,
    instanceId TEXT,
    graphId TEXT,
    nodeId TEXT,
    eventId TEXT,
    payload TEXT NOT NULL
  )`)
  const insert = db.prepare('INSERT INTO history (at, kind, instanceId, graphId, nodeId, eventId, payload) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const byInstance = db.prepare('SELECT * FROM history WHERE instanceId = ? ORDER BY seq')
  const byEvent = db.prepare('SELECT * FROM history WHERE eventId = ? ORDER BY seq')
  const instances = db.prepare('SELECT DISTINCT instanceId FROM history WHERE instanceId IS NOT NULL ORDER BY seq')

  function read(row: Record<string, unknown>): HistoryRecord {
    return {
      seq: row.seq as number,
      at: row.at as string,
      kind: row.kind as HistoryKind,
      instanceId: (row.instanceId as string | null) ?? null,
      graphId: (row.graphId as string | null) ?? null,
      ...(row.nodeId === null ? {} : { nodeId: row.nodeId as string }),
      ...(row.eventId === null ? {} : { eventId: row.eventId as string }),
      payload: JSON.parse(row.payload as string),
    }
  }

  return {
    append(input) {
      if (!KINDS.includes(input.kind)) throw new Error(`dispatch: unknown history kind "${input.kind}"`)
      const record: HistoryRecord = { seq: 0, at: new Date().toISOString(), ...input }
      const { lastInsertRowid } = insert.run(record.at, record.kind, record.instanceId, record.graphId, record.nodeId ?? null, record.eventId ?? null, JSON.stringify(record.payload) ?? 'null')
      return { ...record, seq: Number(lastInsertRowid) }
    },
    listByInstance: instanceId => (byInstance.all(instanceId) as Record<string, unknown>[]).map(read),
    listByEventId: eventId => (byEvent.all(eventId) as Record<string, unknown>[]).map(read),
    instanceIds: () => (instances.all() as { instanceId: string }[]).map(row => row.instanceId),
    close: () => db.close(),
  }
}
