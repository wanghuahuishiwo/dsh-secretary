import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { GatewayError } from './errors.ts'
import { isNKeyPublicKey, type GatewayRole } from './nkey.ts'
import { gatewayPaths } from './paths.ts'

export type GatewayMode = 'local' | 'remote'

/** A public key of one role's NKey user plus the credential reference that holds its seed elsewhere. */
export interface GatewayKeyRef {
  readonly ref: string
  readonly publicKey: string
}

/** The persisted Gateway settings (`settings.json`); never contains a seed. */
export interface GatewaySettings {
  readonly mode: GatewayMode
  /** Client port, bound on 127.0.0.1 only. */
  readonly clientPort: number
  /** Monitoring port (`/varz`, `/healthz`), bound on 127.0.0.1 only. */
  readonly monitorPort: number
  /** `nats-server` binary: a PATH entry name or an absolute path. */
  readonly binary: string
  /** Remote mode: Gateway address plus the credential references of the roles enabled on this machine. */
  readonly remote: {
    readonly url: string
    readonly credentials: Readonly<Partial<Record<GatewayRole, string>>>
  }
  /** Local mode: the generated public keys; the seeds live in DSH-managed credentials. */
  readonly keys: Readonly<Partial<Record<GatewayRole, GatewayKeyRef>>> | null
}

/** A settings change; omitted fields keep their current value. */
export interface GatewaySettingsPatch {
  readonly mode?: GatewayMode
  readonly clientPort?: number
  readonly monitorPort?: number
  readonly binary?: string
  readonly remote?: GatewaySettings['remote']
}

export const DEFAULT_SETTINGS: GatewaySettings = Object.freeze({
  mode: 'local',
  clientPort: 4222,
  monitorPort: 8222,
  binary: 'nats-server',
  remote: Object.freeze({ url: '', credentials: Object.freeze({}) }),
  keys: null,
})

const CREDENTIAL_REF = /^[A-Za-z_][A-Za-z0-9_]*$/
const ADDRESS = /^(nats|tls|ws|wss):\/\/[^\s]+$/

function invalid(message: string): never {
  throw new GatewayError('gateway/invalid-settings', message)
}

function port(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) invalid(`${field} must be an integer port`)
  return value
}

function roles(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object') invalid('credentials must be an object')
  return value as Record<string, unknown>
}

function credentials(value: unknown): Partial<Record<GatewayRole, string>> {
  const out: Partial<Record<GatewayRole, string>> = {}
  for (const role of ['center', 'node'] as const) {
    const ref = roles(value)[role]
    if (ref === undefined) continue
    if (typeof ref !== 'string' || !CREDENTIAL_REF.test(ref)) invalid(`credential reference for ${role} is malformed`)
    out[role] = ref
  }
  return out
}

function remote(value: unknown): GatewaySettings['remote'] {
  if (value === null || typeof value !== 'object') invalid('remote must be an object')
  const { url, credentials: refs } = value as Record<string, unknown>
  if (typeof url !== 'string') invalid('remote.url must be a string')
  return { url, credentials: credentials(refs) }
}

function keys(value: unknown): GatewaySettings['keys'] {
  if (value === null) return null
  if (typeof value !== 'object') invalid('keys must be an object or null')
  const out: Partial<Record<GatewayRole, GatewayKeyRef>> = {}
  for (const role of ['center', 'node'] as const) {
    const entry = (value as Record<string, unknown>)[role]
    if (entry === undefined) continue
    const { ref, publicKey } = (entry ?? {}) as Record<string, unknown>
    if (typeof ref !== 'string' || !CREDENTIAL_REF.test(ref) || !isNKeyPublicKey(publicKey)) invalid(`keys.${role} is malformed`)
    out[role] = { ref, publicKey }
  }
  return out
}

function mode(value: unknown): GatewayMode {
  if (value !== 'local' && value !== 'remote') invalid('mode must be local or remote')
  return value
}

/** Read `settings.json` under `$DSH_HOME/gateway/`; absent means defaults. */
export async function readSettings(dshHome: string): Promise<GatewaySettings> {
  let text: string
  try {
    text = await readFile(gatewayPaths(dshHome).settings, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return DEFAULT_SETTINGS
    throw error
  }
  return parseSettings(text)
}

function parseSettings(text: string): GatewaySettings {
  let raw: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) invalid('settings.json is malformed')
    raw = parsed as Record<string, unknown>
  } catch {
    invalid('settings.json is not valid JSON')
  }
  if (raw === null || typeof raw !== 'object' || typeof raw.binary !== 'string' || raw.binary.trim() === '') {
    invalid('settings.json is malformed')
  }
  const current: GatewaySettings = {
    mode: mode(raw.mode),
    clientPort: port(raw.clientPort, 'clientPort'),
    monitorPort: port(raw.monitorPort, 'monitorPort'),
    binary: raw.binary,
    remote: remote(raw.remote),
    keys: keys(raw.keys),
  }
  if (current.clientPort === current.monitorPort) invalid('clientPort and monitorPort must differ')
  if (current.mode === 'remote') validateRemote(current.remote)
  return current
}

function validateRemote(value: GatewaySettings['remote']): void {
  if (!ADDRESS.test(value.url)) invalid('remote.url must be a nats://, tls://, ws:// or wss:// address')
}

/** Validate a patch against the stored settings and persist the merged result. */
export async function updateSettings(dshHome: string, patch: GatewaySettingsPatch): Promise<GatewaySettings> {
  const current = await readSettings(dshHome)
  const next: GatewaySettings = {
    mode: patch.mode === undefined ? current.mode : mode(patch.mode),
    clientPort: patch.clientPort === undefined ? current.clientPort : port(patch.clientPort, 'clientPort'),
    monitorPort: patch.monitorPort === undefined ? current.monitorPort : port(patch.monitorPort, 'monitorPort'),
    binary: patch.binary === undefined ? current.binary : patch.binary.trim(),
    remote: patch.remote === undefined ? current.remote : remote(patch.remote),
    keys: current.keys,
  }
  if (next.binary === '') invalid('binary must not be empty')
  if (next.clientPort === next.monitorPort) invalid('clientPort and monitorPort must differ')
  if (next.mode === 'remote') validateRemote(next.remote)
  return saveSettings(dshHome, next)
}

/** Write settings atomically (mode 0600 is unnecessary: the file never holds a secret). */
export async function saveSettings(dshHome: string, settings: GatewaySettings): Promise<GatewaySettings> {
  const path = gatewayPaths(dshHome).settings
  await mkdir(dirname(path), { recursive: true })
  const text = `${JSON.stringify(settings, null, 2)}\n`
  await writeFile(`${path}.tmp`, text)
  await rename(`${path}.tmp`, path)
  return settings
}

/** The derived `nats-server.conf` text: loopback ports, explicit JetStream store_dir, public keys only. */
export function renderServerConfig(settings: GatewaySettings, paths: { readonly jetstream: string }): string {
  if (settings.mode === 'remote') throw new GatewayError('gateway/remote-mode', '远程模式不管理本机 Gateway 进程，没有 nats-server.conf')
  const users = (['center', 'node'] as const).map(role => settings.keys?.[role]?.publicKey)
  if (users.some(key => key === undefined)) throw new GatewayError('gateway/keys-missing', '中心／节点 NKey 公钥缺失，无法生成 nats-server.conf')
  const quote = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  return [
    '# 派生物：由 dsh-secretary-dispatch-gateway 每次启动重写，请勿手改；改 settings.json 后在下次启动或手动重启时生效。',
    `listen: 127.0.0.1:${settings.clientPort}`,
    `http: 127.0.0.1:${settings.monitorPort}`,
    'jetstream {',
    `  store_dir: ${quote(paths.jetstream)}`,
    '}',
    'authorization {',
    '  users: [',
    ...users.map(key => `    { nkey: ${key} }`),
    '  ]',
    '}',
    '',
  ].join('\n')
}
