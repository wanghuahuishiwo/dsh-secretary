import { open, readFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { join } from 'node:path'
import { locateNatsServer } from './binary.ts'
import { gatewayPaths } from './paths.ts'
import { readSettings, type GatewaySettings } from './settings.ts'

/** Every state the shared logic can report. */
export type GatewayState =
  | 'not-started'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'start-failed'
  | 'abnormal-exit'
  | 'record-invalid'
  | 'unknown'
  | 'unmanaged'
  | 'remote'

/** Chinese label of each state, shared by the console and the CLI. */
export const STATE_LABELS: Readonly<Record<GatewayState, string>> = {
  'not-started': '未启动',
  starting: '启动中',
  running: '运行中',
  stopping: '停止中',
  stopped: '已停止',
  'start-failed': '启动失败',
  'abnormal-exit': '非正常结束',
  'record-invalid': '记录失效',
  unknown: '无法确认',
  unmanaged: '发现未托管 Gateway',
  remote: '远程模式',
}

/** The launch record (`launch.json`): the only thing that ties a pid to "our" Gateway. */
export interface LaunchRecord {
  readonly pid: number
  readonly startedAt: string
  readonly by: 'console' | 'cli'
  readonly stopRequestedAt?: string
  readonly exit?: { readonly reason: 'stopped' | 'abnormal'; readonly at: string }
}

/** Result of probing the Gateway; a pure derivation from files, the pid and `/varz`. */
export interface GatewayStatus {
  readonly state: GatewayState
  readonly mode: GatewaySettings['mode']
  readonly label: string
  readonly pid?: number
  readonly version?: string
  readonly startedAt?: string
  readonly startedBy?: LaunchRecord['by']
  readonly endedAt?: string
  /** Client address: `nats://127.0.0.1:<port>` locally, the configured address in remote mode. */
  readonly clientUrl: string
  /** Monitoring base URL (`/varz`, `/healthz`); absent in remote mode. */
  readonly monitorUrl?: string
  readonly binary: { readonly configured: string; readonly found: boolean; readonly hint?: string }
  /** Last lines of nats-server.log, attached to failure states. */
  readonly logTail?: string
  /** Human-readable reason for the state when it is not obvious. */
  readonly detail?: string
}

/** Seconds a start may take before it counts as failed and the process is terminated. */
export const READY_TIMEOUT_MS = 10_000
/** Seconds a stop may take after SIGTERM before it is reported as stuck (never force-killed). */
export const STOP_TIMEOUT_MS = 10_000
const PROBE_TIMEOUT_MS = 500
const LOG_TAIL_BYTES = 2048

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

async function readLaunch(dshHome: string): Promise<{ record?: LaunchRecord; broken: boolean }> {
  let text: string
  try {
    text = await readFile(gatewayPaths(dshHome).launch, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { broken: false }
    throw error
  }
  try {
    const raw = JSON.parse(text)
    if (raw === null || typeof raw !== 'object' || !Number.isInteger(raw.pid) || typeof raw.startedAt !== 'string') return { broken: true }
    if (raw.by !== 'console' && raw.by !== 'cli') return { broken: true }
    return { record: raw as LaunchRecord, broken: false }
  } catch {
    return { broken: true }
  }
}

async function getJson(url: string): Promise<Record<string, unknown> | undefined> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    if (!response.ok) return undefined
    return await response.json() as Record<string, unknown>
  } catch {
    return undefined
  }
}

async function isHealthy(monitorUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${monitorUrl}/healthz?js-enabled-only=true`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    return response.ok
  } catch {
    return false
  }
}

function portOpen(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = connect({ port, host: '127.0.0.1' })
    const finish = (open: boolean) => { socket.destroy(); resolve(open) }
    socket.setTimeout(PROBE_TIMEOUT_MS, () => finish(false))
    socket.on('connect', () => finish(true))
    socket.on('error', () => finish(false))
  })
}

async function logTail(dshHome: string): Promise<string | undefined> {
  const path = gatewayPaths(dshHome).log
  try {
    const handle = await open(path, 'r')
    try {
      const size = (await handle.stat()).size
      const buffer = Buffer.alloc(Math.min(size, LOG_TAIL_BYTES))
      await handle.read(buffer, 0, buffer.length, size - buffer.length)
      return buffer.toString('utf8')
    } finally {
      await handle.close()
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

/** nats-server appends this directory to the configured `jetstream.store_dir`; `/varz` reports the result. */
export const JETSTREAM_STORE_SUBDIR = 'jetstream'

/** `/varz` must describe the Gateway we configured: same client port, same (derived) store_dir. */
function varzMatches(varz: Record<string, unknown> | undefined, settings: GatewaySettings, jetstream: string): boolean {
  if (varz === undefined) return false
  const storeDir = (varz.jetstream as { config?: { store_dir?: unknown } } | undefined)?.config?.store_dir
  return varz.port === settings.clientPort && storeDir === join(jetstream, JETSTREAM_STORE_SUBDIR)
}

const ageMs = (at: string) => Date.now() - Date.parse(at)

/** Derive the Gateway status without holding any process handle. */
export async function probeGateway(dshHome: string): Promise<GatewayStatus> {
  const settings = await readSettings(dshHome)
  const paths = gatewayPaths(dshHome)
  const { path: _path, ...binary } = await locateNatsServer(settings.binary)
  if (settings.mode === 'remote') {
    return { state: 'remote', mode: 'remote', label: STATE_LABELS.remote, clientUrl: settings.remote.url, binary }
  }
  const monitorUrl = `http://127.0.0.1:${settings.monitorPort}`
  const base = { mode: 'local' as const, clientUrl: `nats://127.0.0.1:${settings.clientPort}`, monitorUrl, binary }
  const { record, broken } = await readLaunch(dshHome)
  const withRecord = (state: GatewayState, extra: Partial<GatewayStatus> = {}): GatewayStatus => ({
    ...base, state, label: STATE_LABELS[state], pid: record?.pid, startedAt: record?.startedAt, startedBy: record?.by, ...extra,
  })
  if (broken) return { ...withRecord('unknown'), pid: undefined, detail: 'launch.json 无法解析，不接管、不发信号' }

  if (record !== undefined && isProcessAlive(record.pid)) {
    const varz = await getJson(`${monitorUrl}/varz`)
    const version = typeof varz?.version === 'string' ? varz.version : undefined
    if (!varzMatches(varz, settings, paths.jetstream)) {
      return withRecord('record-invalid', { version, detail: 'pid 存活但 /varz 的端口或 store_dir 与本机配置不符，不接管、不发信号', logTail: await logTail(dshHome) })
    }
    if (record.stopRequestedAt !== undefined) return withRecord('stopping', { version, detail: '已发 SIGTERM，进程尚未退出' })
    if (await isHealthy(monitorUrl)) return withRecord('running', { version })
    if (record.exit === undefined && ageMs(record.startedAt) < READY_TIMEOUT_MS) return withRecord('starting', { version })
    return withRecord('start-failed', { version, detail: '进程存活但就绪探针（/healthz?js-enabled-only=true）未通过', logTail: await logTail(dshHome) })
  }

  if (record !== undefined) {
    const endedAt = record.exit?.at
    const explicitStop = record.exit?.reason === 'stopped' || (record.exit === undefined && record.stopRequestedAt !== undefined)
    const early = endedAt !== undefined && Date.parse(endedAt) - Date.parse(record.startedAt) < READY_TIMEOUT_MS
    const state: GatewayState = explicitStop ? 'stopped' : early ? 'start-failed' : 'abnormal-exit'
    if (await portOpen(settings.clientPort)) {
      return { ...base, state: 'unmanaged', label: STATE_LABELS.unmanaged, detail: `启动记录的进程已结束（${STATE_LABELS[state]}），客户端端口被其他进程占用，不接管` }
    }
    if (state === 'stopped') return withRecord('stopped', { endedAt })
    return withRecord(state, { endedAt, detail: '进程已退出，日志尾部见 logTail', logTail: await logTail(dshHome) })
  }

  if (await portOpen(settings.clientPort)) return { ...base, state: 'unmanaged', label: STATE_LABELS.unmanaged, detail: '没有启动记录，但客户端端口已被占用，不接管' }
  return { ...base, state: 'not-started', label: STATE_LABELS['not-started'] }
}
