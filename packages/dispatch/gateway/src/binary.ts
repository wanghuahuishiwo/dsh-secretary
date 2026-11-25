import { access, constants } from 'node:fs/promises'
import { delimiter, dirname, isAbsolute, join } from 'node:path'
import { GatewayError } from './errors.ts'

/** Where the configured `nats-server` binary was found, or why not. */
export interface BinaryProbe {
  /** The configured value: a PATH entry name or a path. */
  readonly configured: string
  readonly found: boolean
  /** Absolute path when found. */
  readonly path?: string
  /** The install command when not found. */
  readonly hint?: string
}

export const NATS_SERVER_INSTALL_HINT = 'brew install nats-server'

async function executable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** Probe the configured binary: a path is checked directly, a bare name is searched on PATH. */
export async function locateNatsServer(configured: string, env: NodeJS.ProcessEnv = process.env): Promise<BinaryProbe> {
  if (configured.includes('/') || isAbsolute(configured)) {
    const path = isAbsolute(configured) ? configured : join(process.cwd(), configured)
    return (await executable(path)) ? { configured, found: true, path } : { configured, found: false, hint: NATS_SERVER_INSTALL_HINT }
  }
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (dir === '') continue
    const path = join(dir, configured)
    if (await executable(path)) return { configured, found: true, path: dirname(path) === dir ? path : path }
  }
  return { configured, found: false, hint: NATS_SERVER_INSTALL_HINT }
}

/** Resolve the binary or fail with the install hint. */
export async function requireNatsServer(configured: string, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const probe = await locateNatsServer(configured, env)
  if (!probe.found) {
    throw new GatewayError('gateway/not-installed', `找不到 nats-server（${configured}）。请自行安装后重试：${NATS_SERVER_INSTALL_HINT}（或在设置里手填二进制路径）`)
  }
  return probe.path!
}
