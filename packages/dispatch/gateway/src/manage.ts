import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, open, readFile, writeFile } from 'node:fs/promises'
import { GatewayError } from './errors.ts'
import { createNKeyPair, nkeyPublicKeyFromSeed, CREDENTIAL_REFS, type GatewayRole } from './nkey.ts'
import { requireNatsServer } from './binary.ts'
import { gatewayPaths } from './paths.ts'
import { renderServerConfig, readSettings, saveSettings, type GatewayKeyRef, type GatewaySettings } from './settings.ts'
import {
  READY_TIMEOUT_MS, STOP_TIMEOUT_MS, isProcessAlive, probeGateway, type GatewayStatus, type LaunchRecord,
} from './status.ts'

/** Where private seeds live: DSH-managed credentials in the Host, the environment in the CLI. */
export interface SecretStore {
  resolve(ref: string): Promise<string | undefined>
  set(ref: string, value: string): Promise<void>
}

const ROLES: readonly GatewayRole[] = ['center', 'node']
const POLL_MS = 100
/** The only environment a Gateway needs; nothing of the Host's (seeds included) is passed through. */
const CHILD_ENV_KEYS = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'USER'] as const

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function writeLaunch(dshHome: string, record: LaunchRecord): Promise<void> {
  await writeFile(gatewayPaths(dshHome).launch, `${JSON.stringify(record, null, 2)}\n`)
}

/** Public keys for both roles: existing ones win, otherwise seeds are resolved or generated and stored. */
async function ensureKeys(settings: GatewaySettings, secrets: SecretStore | undefined): Promise<Record<GatewayRole, GatewayKeyRef>> {
  const keys: Partial<Record<GatewayRole, GatewayKeyRef>> = { ...settings.keys }
  for (const role of ROLES) {
    if (keys[role] !== undefined) continue
    const ref = CREDENTIAL_REFS[role]
    const seed = secrets === undefined ? undefined : await secrets.resolve(ref)
    if (seed !== undefined) {
      keys[role] = { ref, publicKey: nkeyPublicKeyFromSeed(seed) }
      continue
    }
    if (secrets === undefined || secrets.set === undefined) {
      throw new GatewayError('gateway/keys-unavailable', `无法取得 ${ref}：本机模式首次启动需要在底座控制台生成并保存 NKey`)
    }
    const pair = createNKeyPair()
    await secrets.set(ref, pair.seed)
    keys[role] = { ref, publicKey: pair.publicKey }
  }
  return keys as Record<GatewayRole, GatewayKeyRef>
}

/** Rewrite the derived `nats-server.conf` and make sure the JetStream directory exists. */
async function materialize(dshHome: string, settings: GatewaySettings): Promise<string> {
  const paths = gatewayPaths(dshHome)
  await mkdir(paths.jetstream, { recursive: true })
  const conf = renderServerConfig(settings, paths)
  await writeFile(paths.conf, conf)
  return conf
}

async function waitUntil(done: () => boolean | 'exited' | Promise<boolean | 'exited'>, timeoutMs: number): Promise<boolean | 'exited'> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const result = await done()
    if (result === true || result === 'exited') return result
    if (Date.now() >= deadline) return false
    await delay(POLL_MS)
  }
}

export interface StartOptions {
  /** Who asked for the start; recorded in launch.json. */
  readonly by?: LaunchRecord['by']
  /** Private-seed store for first-time key generation. */
  readonly secrets?: SecretStore
  /** Ready deadline; the default is the 10 second contract. */
  readonly readyTimeoutMs?: number
  /** Extra environment for the child beyond PATH/HOME/TMPDIR/LANG; never pass seeds here. */
  readonly env?: Readonly<Record<string, string>>
}

/** Start the Gateway as a detached child; returns once the readiness probe passes. */
export async function startGateway(dshHome: string, options: StartOptions = {}): Promise<GatewayStatus> {
  const by = options.by ?? 'console'
  const readyTimeoutMs = options.readyTimeoutMs ?? READY_TIMEOUT_MS
  const before = await probeGateway(dshHome)
  if (before.state === 'remote') throw new GatewayError('gateway/remote-mode', '远程模式不管理本机 Gateway 进程', before)
  if (before.state === 'running' || before.state === 'starting' || before.state === 'stopping') return before
  if (before.state === 'unmanaged') {
    throw new GatewayError('gateway/start-failed', `客户端端口被未托管进程占用，不接管；请先停止该进程或修改设置中的端口`, before)
  }
  const binary = await requireNatsServer(before.binary.configured)
  let settings = await readSettings(dshHome)
  if (settings.keys === null || ROLES.some(role => settings.keys?.[role] === undefined)) {
    settings = await saveSettings(dshHome, { ...settings, keys: await ensureKeys(settings, options.secrets) })
  }
  const paths = gatewayPaths(dshHome)
  await materialize(dshHome, settings)
  const log = await open(paths.log, 'a')
  const child: ChildProcess = spawn(binary, ['-c', paths.conf], {
    cwd: paths.dir,
    detached: true,
    stdio: ['ignore', log.fd, log.fd],
    env: { ...Object.fromEntries(CHILD_ENV_KEYS.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]])), ...options.env },
  })
  child.unref()
  await log.close()
  if (child.pid === undefined) {
    // spawn failed (ENOENT after the probe lost the race): the 'error' event carries the cause.
    await new Promise<void>((_, reject) => child.once('error', reject))
    throw new GatewayError('gateway/start-failed', 'nats-server 未能启动', before)
  }
  const startedAt = new Date().toISOString()
  const record: LaunchRecord = { pid: child.pid, startedAt, by }
  await writeLaunch(dshHome, record)
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  const monitorUrl = `http://127.0.0.1:${settings.monitorPort}`
  const ready = await waitUntil(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return 'exited'
    const response = await fetch(`${monitorUrl}/healthz?js-enabled-only=true`, { signal: AbortSignal.timeout(500) }).catch(() => undefined)
    return response?.ok === true
  }, readyTimeoutMs)
  if (ready !== true) {
    if (ready === 'exited') await exited
    else {
      process.kill(record.pid, 'SIGTERM')
      await Promise.race([exited, delay(2000)])
    }
    await writeLaunch(dshHome, { ...record, exit: { reason: 'abnormal', at: new Date().toISOString() } })
  }
  const after = await probeGateway(dshHome)
  if (after.state !== 'running') {
    throw new GatewayError('gateway/start-failed', `nats-server ${readyTimeoutMs / 1000} 秒内未就绪（/healthz?js-enabled-only=true），已终止该进程；日志见 ${paths.log}`, after)
  }
  return after
}

export interface StopOptions {
  /** How long SIGTERM may take; the default is the 10 second contract. Never SIGKILL. */
  readonly stopTimeoutMs?: number
}

/** Send SIGTERM to our recorded Gateway and wait for it to exit; never force-kills. */
export async function stopGateway(dshHome: string, options: StopOptions = {}): Promise<GatewayStatus> {
  const stopTimeoutMs = options.stopTimeoutMs ?? STOP_TIMEOUT_MS
  const before = await probeGateway(dshHome)
  if (before.state === 'remote') throw new GatewayError('gateway/remote-mode', '远程模式不管理本机 Gateway 进程', before)
  if (before.state === 'stopped' || before.state === 'not-started') return before
  if (before.state !== 'running' && before.state !== 'starting' && before.state !== 'stopping') {
    throw new GatewayError('gateway/not-managed', `当前状态「${before.label}」，不是本记录管理的进程，不发信号`, before)
  }
  const { record } = await readLaunch(dshHome)
  if (record === undefined) throw new GatewayError('gateway/not-managed', '没有启动记录，不发信号', before)
  if (record.stopRequestedAt === undefined) {
    await writeLaunch(dshHome, { ...record, stopRequestedAt: new Date().toISOString() })
  }
  process.kill(record.pid, 'SIGTERM')
  const exited = await waitUntil(() => !isProcessAlive(record.pid), stopTimeoutMs)
  if (!exited) {
    throw new GatewayError('gateway/stop-timeout', `已发 SIGTERM，${stopTimeoutMs / 1000} 秒后进程 ${record.pid} 仍未退出；不强杀，请人工检查日志 ${gatewayPaths(dshHome).log}`, before)
  }
  await writeLaunch(dshHome, { ...record, exit: { reason: 'stopped', at: new Date().toISOString() } })
  return probeGateway(dshHome)
}

/** Explicit restart: stop first; a stop that times out aborts without starting. */
export async function restartGateway(dshHome: string, options: StartOptions & StopOptions = {}): Promise<GatewayStatus> {
  await stopGateway(dshHome, options)
  return startGateway(dshHome, options)
}

async function readLaunch(dshHome: string): Promise<{ record?: LaunchRecord }> {
  try {
    return { record: JSON.parse(await readFile(gatewayPaths(dshHome).launch, 'utf8')) as LaunchRecord }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
}
