import { homedir } from 'node:os'
import { join } from 'node:path'
import type { GatewayRole } from './nkey.ts'

/** `$DSH_HOME` when set, else the DSH default `~/.dsh` (same rule as the DSH home-paths helper). */
export function defaultDshHome(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.DSH_HOME
  return fromEnv === undefined || fromEnv === '' ? join(homedir(), '.dsh') : fromEnv
}

/** Every file the Gateway management owns, all under `$DSH_HOME/gateway/`. */
export interface GatewayPaths {
  readonly dir: string
  readonly settings: string
  readonly conf: string
  readonly log: string
  readonly launch: string
  readonly jetstream: string
  /** Subject permissions a role declares for itself; the messaging plugin writes it, the Gateway reads it at start. */
  readonly permissions: (role: GatewayRole) => string
}

export function gatewayPaths(dshHome: string): GatewayPaths {
  const dir = join(dshHome, 'gateway')
  return {
    dir,
    settings: join(dir, 'settings.json'),
    conf: join(dir, 'nats-server.conf'),
    log: join(dir, 'nats-server.log'),
    launch: join(dir, 'launch.json'),
    jetstream: join(dir, 'jetstream'),
    permissions: role => join(dir, `permissions.${role}.json`),
  }
}
