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

/** Every role needs the JetStream API and its reply inboxes; ACK is a publish on `$JS.ACK.>`. */
const JETSTREAM_PUBLISH = ['"$JS.API.>"', '"$JS.ACK.>"']
const JETSTREAM_SUBSCRIBE = ['"$JS.API.>"', '"_INBOX.>"']

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
export function renderPermissions(permissions: SubjectPermissions): string[] {
  const allow = (base: string[], subjects: readonly string[]) => `[${[...base, ...subjects.map(subject => `"${subject}"`)].join(', ')}]`
  return [
    'permission: {',
    `  publish: { allow: ${allow(JETSTREAM_PUBLISH, permissions.publish)} },`,
    `  subscribe: { allow: ${allow(JETSTREAM_SUBSCRIBE, permissions.subscribe)} }`,
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
