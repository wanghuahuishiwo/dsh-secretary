/**
 * The event catalog of a role: the event types it publishes and subscribes to. It derives the subject permissions the
 * Gateway enforces and the one JetStream stream every role reads and writes.
 */
import { createHash } from 'node:crypto'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { gatewayPaths, type GatewayRole } from 'dsh-secretary-dispatch-gateway'
import { MessagingError } from './errors.ts'
import { subjectFor } from './envelope.ts'

/** The event types a role declares; subjects are always derived from the type. */
export interface EventCatalog {
  readonly publish: readonly string[]
  readonly subscribe: readonly string[]
}

/** Name of the single File/Limits stream that captures every DSH event. */
export const STREAM_NAME = 'dsh-events'

export function streamConfig(subjects: readonly string[]): { name: string; subjects: string[]; storage: 'file'; retention: 'limits' } {
  return { name: STREAM_NAME, subjects: [...subjects].sort(), storage: 'file', retention: 'limits' }
}

function covers(pattern: string, subject: string): boolean {
  const p = pattern.split('.')
  const s = subject.split('.')
  for (let i = 0; i < p.length; i += 1) {
    if (p[i] === '>') return true
    if (i >= s.length || (p[i] !== '*' && p[i] !== s[i])) return false
  }
  return p.length === s.length
}

/** What to do so the stream captures `needed` subjects: create it, add the uncovered subjects, or nothing. */
export function planStream(existing: readonly string[] | undefined, needed: readonly string[]): { create: true; subjects: string[] } | { create: false; add: string[] } {
  const subjects = [...new Set(needed)]
  if (existing === undefined) return { create: true, subjects }
  return { create: false, add: subjects.filter(subject => !existing.some(pattern => covers(pattern, subject))) }
}

/** Durable consumer name of one role's subscription to one subject: stable, and free of `.` and other special characters. */
export function durableName(role: GatewayRole, subject: string): string {
  const digest = createHash('sha256').update(subject).digest('hex').slice(0, 8)
  return `${role}-${subject.replace(/^dsh\.events\./, '').replace(/\./g, '-')}-${digest}`
}

/** Write the role's declared permissions where the Gateway reads them when it (re)starts. */
export async function writePermissions(dshHome: string, role: GatewayRole, catalog: EventCatalog): Promise<void> {
  const subjects = (types: readonly string[]) => [...new Set(types.map(subjectFor))].sort()
  const path = gatewayPaths(dshHome).permissions(role)
  await mkdir(dirname(path), { recursive: true })
  const text = `${JSON.stringify({ publish: subjects(catalog.publish), subscribe: subjects(catalog.subscribe) }, null, 2)}\n`
  await writeFile(`${path}.tmp`, text)
  await rename(`${path}.tmp`, path)
}

/** Whether a type is declared for the role; undeclared ones are refused locally instead of being dropped by the Gateway. */
export function assertDeclared(catalog: EventCatalog, direction: 'publish' | 'subscribe', type: string): void {
  if (!catalog[direction].includes(type)) {
    throw new MessagingError('messaging/not-declared', `事件 type ${type} 未在 ${direction} 中声明`)
  }
}
