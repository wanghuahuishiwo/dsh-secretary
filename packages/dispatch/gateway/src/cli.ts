import { GatewayError } from './errors.ts'
import { defaultDshHome } from './paths.ts'
import { probeGateway, type GatewayStatus } from './status.ts'
import { restartGateway, startGateway, stopGateway, type StartOptions, type StopOptions } from './manage.ts'

export const GATEWAY_USAGE = 'usage: dsh-secretary gateway <start|stop|restart|status>'

/** Where the CLI reads/writes; `env` defaults to `process.env`. */
export interface CliIo {
  readonly stdout: { write(chunk: string): unknown }
  readonly stderr: { write(chunk: string): unknown }
  readonly env?: NodeJS.ProcessEnv
  readonly argv?: readonly string[]
}

/**
 * `dsh-secretary gateway <action>`: the same shared logic as the console buttons, usable while DSH is not running.
 * Resolves to the process exit code: 0 on success, 1 for a reported error, 2 for usage.
 */
export async function gatewayCommand(args: readonly string[], io: CliIo): Promise<number> {
  const [action, ...rest] = args
  type Action = 'start' | 'stop' | 'restart' | 'status'
  const actions: Record<Action, (dshHome: string, options?: StartOptions & StopOptions) => Promise<GatewayStatus>> = {
    start: startGateway, stop: stopGateway, restart: restartGateway, status: probeGateway,
  }
  if (action === undefined || !Object.hasOwn(actions, action) || rest.length > 0) {
    io.stderr.write(`${GATEWAY_USAGE}\n`)
    return 2
  }
  const env = io.env ?? process.env
  // Outside the Host the only seed source is the environment (`$DSH_HOME/.env` is loaded by the caller's shell).
  const secrets = {
    async resolve(ref: string) { return env[ref] === undefined || env[ref] === '' ? undefined : env[ref] },
    async set(ref: string) { throw new GatewayError('gateway/keys-unavailable', `无法保存 ${ref}：命令行只能读取环境变量中的 seed，首次生成请在底座控制台启动一次`) },
  }
  try {
    const status = await actions[action as Action](defaultDshHome(env), { by: 'cli', secrets })
    io.stdout.write(`${JSON.stringify(status)}\n`)
    return 0
  } catch (error) {
    if (error instanceof GatewayError) {
      io.stderr.write(`${JSON.stringify({ error: { code: error.code, message: error.message } })}\n`)
      return 1
    }
    throw error
  }
}
