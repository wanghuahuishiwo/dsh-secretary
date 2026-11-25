import { readFile } from 'node:fs/promises'
import { GatewayError } from './errors.ts'
import type { GatewayRole } from './nkey.ts'
import { gatewayPaths } from './paths.ts'

/**
 * What one role may do with events, as NATS subjects: `dsh.events.<type>` it publishes and subscribes to.
 * Kept in `$DSH_HOME/gateway/permissions.<role>.json`; the Gateway reads it when it starts.
 */
export interface SubjectPermissions {
  readonly publish: readonly string[]
  readonly subscribe: readonly string[]
}

/**
 * Fixed subjects of every role: the JetStream API and its reply inboxes (ACK is a publish on `$JS.ACK.>`), plus the
 * subjects of a hosted NATS service (it listens under `$SRV.>` and answers on inboxes). Reading is never trimmed by
 * the event catalog: every role may subscribe to all events, so the console's read path sees the stream as it is.
 */
const ALWAYS_PUBLISH = ['"$JS.API.>"', '"$JS.ACK.>"', '"_INBOX.>"']
const ALWAYS_SUBSCRIBE = ['"$JS.API.>"', '"_INBOX.>"', '"$SRV.>"', '"dsh.events.>"']
/** Only the center runs service discovery (`ping`/`info` requests). */
const DISCOVERY_PUBLISH = ['"$SRV.PING"', '"$SRV.INFO"']

const EVENT_SUBJECT = /^dsh\.events\.[a-z0-9][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)*$/

function invalid(path: string): never {
  throw new GatewayError('gateway/invalid-permissions', `${path} 必须是 { publish: string[], subscribe: string[] }，subject 只能是不含通配符的 dsh.events.<type>`)
}

function parse(path: string, text: string): SubjectPermissions {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    invalid(path)
  }
  const list = (value: unknown): string[] => {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !EVENT_SUBJECT.test(item))) invalid(path)
    return [...new Set(value as string[])]
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) invalid(path)
  const { publish, subscribe } = raw as Record<string, unknown>
  if (publish === undefined || subscribe === undefined) invalid(path)
  return { publish: list(publish), subscribe: list(subscribe) }
}

/** The `permission: { … }` body of one user in `nats-server.conf`. */
export function renderPermissions(role: GatewayRole, permissions: SubjectPermissions): string[] {
  const publish = role === 'center' ? [...ALWAYS_PUBLISH, ...DISCOVERY_PUBLISH] : ALWAYS_PUBLISH
  const allow = (base: string[], subjects: readonly string[]) => `[${[...base, ...subjects.map(subject => `"${subject}"`)].join(', ')}]`
  return [
    'permission: {',
    `  publish: { allow: ${allow(publish, permissions.publish)} },`,
    `  subscribe: { allow: ${allow(ALWAYS_SUBSCRIBE, [])} }`,
    '}',
  ]
}

/** Read both roles' declared permissions; a role without a file may only use JetStream itself. */
export async function readPermissions(dshHome: string): Promise<Record<GatewayRole, SubjectPermissions>> {
  const empty: SubjectPermissions = { publish: [], subscribe: [] }
  const out = { center: empty, node: empty } as Record<GatewayRole, SubjectPermissions>
  for (const role of ['center', 'node'] as const) {
    const path = gatewayPaths(dshHome).permissions(role)
    let text: string
    try {
      text = await readFile(path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    out[role] = parse(path, text)
  }
  return out
}
