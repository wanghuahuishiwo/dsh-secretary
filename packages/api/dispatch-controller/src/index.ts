import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { Remote, RemoteError, RemoteStream, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  GatewayError, defaultDshHome, probeGateway, readSettings, restartGateway, startGateway, stopGateway,
  updateSettings,
} from 'dsh-secretary-dispatch-gateway'
import type { GatewaySettings, GatewayStatus, SecretStore } from 'dsh-secretary-dispatch-gateway'
import { ConsoleReader } from './reader.ts'
import { toSettingsPatch } from './types.ts'
import type { EventQuery, UpdateGatewaySettings } from './types.ts'

export type {
  EventPage, EventQuery, GatewayKeyRef, GatewayMode, GatewaySettings, GatewayState, GatewayStatus, ServiceInstance, StreamEvent, UpdateGatewaySettings,
} from './types.ts'
export { toSettingsPatch } from './types.ts'

export interface Config {
  /** DSH home that owns `gateway/`; defaults to `$DSH_HOME`, else `~/.dsh`. */
  readonly dshHome?: string
  /** SQLite file of the center engine's event history, read-only; omitted means no consumption records are shown. */
  readonly historyPath?: string
}

export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-secretary-dispatch-controller',
    validate(raw: unknown) {
      if (raw === undefined) return { value: {} }
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return { issues: [{ message: 'dispatch: config must be an object' }] }
      }
      const { dshHome, historyPath } = raw as Record<string, unknown>
      if (dshHome !== undefined && (typeof dshHome !== 'string' || dshHome === '')) {
        return { issues: [{ message: 'dispatch: dshHome must be a non-empty string' }] }
      }
      if (historyPath !== undefined && (typeof historyPath !== 'string' || historyPath === '')) {
        return { issues: [{ message: 'dispatch: historyPath must be a non-empty string' }] }
      }
      return { value: { ...(dshHome === undefined ? {} : { dshHome }), ...(historyPath === undefined ? {} : { historyPath }) } }
    },
  },
}

/** Turn a shared-logic failure into the Remote error the console and CLI callers see. */
function remoteFailure(error: unknown, operation: string): never {
  if (error instanceof GatewayError) {
    throw new RemoteError('secretaryDispatch/gateway-error', error.message, { code: error.code }, { cause: error })
  }
  throw new RemoteError('secretaryDispatch/gateway-error', `gateway ${operation} failed: ${error instanceof Error ? error.message : String(error)}`, { code: 'gateway/unknown' }, { cause: error })
}

/** Host application Service for the dispatch foundation console: Gateway management, and the read path of #105. */
export class DispatchGatewayService extends TypertRemoteService {
  private readonly dshHome: string
  /** Seeds live in DSH-managed credentials; this object is the only path to them. */
  private readonly secrets: SecretStore
  /** The console read path: service discovery and stream paging with the center credential. */
  private readonly reader: ConsoleReader

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'dispatchGateway', { namespace: 'secretaryDispatch' })
    this.dshHome = config.dshHome ?? defaultDshHome()
    const credentials = ctx.credentials
    this.secrets = {
      async resolve(ref) { return (await credentials.resolve(credentialRef(ref)))?.value },
      async set(ref, value) { await credentials.set(credentialRef(ref), value) },
    }
    this.reader = new ConsoleReader(this.dshHome, this.secrets, config.historyPath)
    ctx.effect(() => () => { void this.reader.close() }, 'dispatchGateway: console reader')
  }

  /** JSON text of `ServiceInstance[]`: online NATS services exactly as the official discovery returned them. */
  @Remote('listServices')
  async listServices(): Promise<string> {
    return JSON.stringify(await this.reader.listServices())
  }

  /** JSON text of one `EventPage`: the stream newest first, each event with the engine history rows naming it. */
  @Remote('listEvents')
  async listEvents(query: EventQuery): Promise<string> {
    return JSON.stringify(await this.reader.listEvents({ before: query.before ?? Number.MAX_SAFE_INTEGER, limit: query.limit ?? 200 }))
  }

  /** One mark per event the Gateway delivers from now on; the stream carries no data, the client re-reads. */
  @Remote({ name: 'watch', mode: 'stream' })
  watch(): RemoteStream<{ changed: true }> {
    let wake: (() => void) | undefined
    const marks: Array<{ changed: true }> = []
    const unsubscribe = this.reader.onEvent(() => { marks.push({ changed: true }); wake?.() })
    return {
      async *[Symbol.asyncIterator]() {
        try {
          for (;;) {
            while (marks.length > 0) yield marks.shift()!
            await new Promise<void>(resolve => { wake = resolve })
          }
        } finally {
          wake = undefined
          unsubscribe()
        }
      },
    }
  }

  /** Probe the Gateway from files, the recorded pid and `/varz`; never holds a process handle. */
  @Remote('readStatus')
  async readStatus(): Promise<GatewayStatus> {
    try {
      return await probeGateway(this.dshHome)
    } catch (error) {
      remoteFailure(error, 'status')
    }
  }

  /** Start the local Gateway as a detached process that outlives DSH. */
  @Remote('start')
  async start(): Promise<GatewayStatus> {
    try {
      return await startGateway(this.dshHome, { by: 'console', secrets: this.secrets })
    } catch (error) {
      remoteFailure(error, 'start')
    }
  }

  /** SIGTERM the recorded Gateway; never force-kills. */
  @Remote('stop')
  async stop(): Promise<GatewayStatus> {
    try {
      return await stopGateway(this.dshHome)
    } catch (error) {
      remoteFailure(error, 'stop')
    }
  }

  /** Explicit restart: stop, then start. */
  @Remote('restart')
  async restart(): Promise<GatewayStatus> {
    try {
      return await restartGateway(this.dshHome, { by: 'console', secrets: this.secrets })
    } catch (error) {
      remoteFailure(error, 'restart')
    }
  }

  /** The stored settings; no seeds are part of them. */
  @Remote('readSettings')
  async readSettings(): Promise<GatewaySettings> {
    try {
      return await readSettings(this.dshHome)
    } catch (error) {
      remoteFailure(error, 'readSettings')
    }
  }

  /** Validate and persist a settings change; it applies on the next start or explicit restart. */
  @Remote('updateSettings')
  async updateSettings(input: UpdateGatewaySettings): Promise<GatewaySettings> {
    try {
      return await updateSettings(this.dshHome, toSettingsPatch(input))
    } catch (error) {
      remoteFailure(error, 'updateSettings')
    }
  }
}

export const name = 'dsh-secretary-dispatch-controller'
export const inject = ['credentials']

export function apply(ctx: Context, config: Config = {}): void {
  new DispatchGatewayService(ctx, config)
}
