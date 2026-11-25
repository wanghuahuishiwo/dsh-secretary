/**
 * The messaging plugin: one NKey-authenticated NATS connection per role, the CloudEvents envelope, the single
 * JetStream stream and a durable consumer per subscription. Seeds are resolved from `ctx.credentials` here and
 * never leave this object.
 */
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { Context } from '@deepseek-ai/cordis'
import { AckPolicy, jetstream, jetstreamManager } from '@nats-io/jetstream'
import type { ConsumerMessages, JetStreamClient, JetStreamManager, JsMsg } from '@nats-io/jetstream'
import { nkeyAuthenticator, type NatsConnection } from '@nats-io/nats-core'
import { JetStreamApiError } from '@nats-io/jetstream'
import { connect } from '@nats-io/transport-node'
import { CREDENTIAL_REFS, defaultDshHome, readSettings } from 'dsh-secretary-dispatch-gateway'
import type { GatewayRole } from 'dsh-secretary-dispatch-gateway'
import { assertDeclared, durableName, planStream, STREAM_NAME, writePermissions } from './catalog.ts'
import type { EventCatalog } from './catalog.ts'
import { createEvent, CENTER_SOURCE, nodeSource, parseEvent, subjectFor } from './envelope.ts'
import type { CloudEvent, EventInput } from './envelope.ts'
import { MessagingError } from './errors.ts'
import { initNodeId, readNodeId } from './identity.ts'
import {
  DispatchMessaging, SERVICE_KEY,
} from './contract.ts'
import type { EventHandler, PublishedEvent, RejectedEvent, SubscriptionHandle } from './contract.ts'

export { SERVICE_KEY }
export type { EventMeta, EventHandler, EventSubscription, PublishedEvent, RejectedEvent, SubscriptionHandle } from './contract.ts'

export interface Config {
  /** Which role this instance serves; decides the NKey user, the event `source` and the subject permissions. */
  readonly role: GatewayRole
  /** DSH home that holds `gateway/` and `dispatch/`; defaults to `$DSH_HOME`, else `~/.dsh`. */
  readonly dshHome?: string
  /** Explicit initialization: create the node identity file when it is missing (never overwrites one). */
  readonly initNodeId?: boolean
  /** Event types this role publishes. */
  readonly publish?: readonly string[]
  /** Event types this role subscribes to. */
  readonly subscribe?: readonly string[]
}

const TYPES = { publish: 'publish', subscribe: 'subscribe' } as const
const RECONNECT_RETRY_MS = 500

export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-secretary-dispatch-messaging',
    validate(raw: unknown) {
      if (raw === undefined) return { issues: [{ message: 'dispatch: messaging config must specify role' }] }
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { issues: [{ message: 'dispatch: messaging config must be an object' }] }
      const value = raw as Record<string, unknown>
      const { role, dshHome, initNodeId } = value
      if (role !== 'center' && role !== 'node') return { issues: [{ message: 'dispatch: messaging role must be center or node' }] }
      if (dshHome !== undefined && (typeof dshHome !== 'string' || dshHome === '')) return { issues: [{ message: 'dispatch: messaging dshHome must be a non-empty string' }] }
      if (initNodeId !== undefined && typeof initNodeId !== 'boolean') return { issues: [{ message: 'dispatch: messaging initNodeId must be a boolean' }] }
      const types = (list: unknown): string[] | string => {
        if (list === undefined) return []
        if (!Array.isArray(list) || list.some(type => typeof type !== 'string')) return 'must be an array of event type strings'
        for (const type of list as string[]) {
          try { subjectFor(type) } catch (error) { return (error as Error).message }
        }
        return [...(list as string[])]
      }
      const out: Record<string, unknown> = { role }
      if (dshHome !== undefined) out.dshHome = dshHome
      if (initNodeId !== undefined) out.initNodeId = initNodeId
      for (const key of ['publish', 'subscribe'] as const) {
        const checked = types(value[key])
        if (typeof checked === 'string') return { issues: [{ message: `dispatch: messaging ${key} ${checked}` }] }
        out[key] = checked
      }
      return { value: out as unknown as Config }
    },
  },
}

/** The plugin's NATS side: everything obtained after the connection is up. */
interface Session {
  readonly nc: NatsConnection
  readonly jsm: JetStreamManager
  readonly js: JetStreamClient
}

export class NatsDispatchMessaging extends DispatchMessaging {
  static inject = ['credentials']
  override readonly role: GatewayRole
  private nodeIdValue: string | undefined
  override get nodeId(): string | undefined { return this.nodeIdValue }
  /** Resolves when the Gateway connection is up; rejects with the reason when it never came up. */
  readonly ready: Promise<void>

  private readonly catalog: EventCatalog
  private readonly session: Promise<Session>
  private readonly subscriptions = new Set<SubscriptionHandle>()

  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.role = config.role
    this.catalog = { publish: config.publish ?? [], subscribe: config.subscribe ?? [] }
    this.session = this.open(config)
    this.ready = this.session.then(() => undefined)
    ctx.effect(() => async () => {
      for (const handle of [...this.subscriptions]) await handle.stop()
      const session = await this.session.catch(() => undefined)
      await session?.nc.close()
    })
  }

  private async open(config: Config): Promise<Session> {
    const dshHome = config.dshHome ?? defaultDshHome()
    const settings = await readSettings(dshHome)
    const local = settings.mode === 'local'
    const url = local ? `nats://127.0.0.1:${settings.clientPort}` : settings.remote.url
    const ref = local ? settings.keys?.[this.role]?.ref : settings.remote.credentials[this.role]
    if (ref === undefined) {
      throw new MessagingError('messaging/role-not-configured', `${this.role} 角色没有凭据引用：请在底座控制台 Gateway 分区${local ? '先生成 NKey' : '配置远程凭据'}`)
    }
    if (!local && !url.startsWith('tls://')) throw new MessagingError('messaging/tls-required', `远程 Gateway 必须使用 tls:// 地址：${url}`)
    const resolved = await this.ctx.credentials.resolve(credentialRef(ref))
    const seed = resolved?.value.trim()
    if (seed === undefined || seed === '') throw new MessagingError('messaging/seed-unavailable', `凭据 ${ref}（${CREDENTIAL_REFS[this.role]}）解析不到 seed`)
    if (local) await writePermissions(dshHome, this.role, this.catalog)
    if (this.role === 'node') {
      if (config.initNodeId === true) await initNodeId(dshHome).catch((error: unknown) => {
        if (error instanceof MessagingError && error.code === 'messaging/identity-exists') return undefined
        throw error
      })
      this.nodeIdValue = await readNodeId(dshHome)
    }
    const nc = await connect({
      servers: url.replace(/^tls:\/\//, ''),
      ...(url.startsWith('tls://') ? { tls: {} } : {}),
      authenticator: nkeyAuthenticator(new TextEncoder().encode(seed)),
    })
    return { nc, jsm: await jetstreamManager(nc), js: jetstream(nc) }
  }

  private get source(): string {
    return this.role === 'center' ? CENTER_SOURCE : nodeSource(this.nodeId as string)
  }

  /** Make sure the single stream captures `subjects`, creating or updating it online. */
  private async ensureCapture(subjects: readonly string[]): Promise<void> {
    const { jsm } = await this.session
    let current: string[] | undefined
    try {
      current = (await jsm.streams.info(STREAM_NAME)).config.subjects
    } catch (error) {
      if (!(error instanceof JetStreamApiError && error.code === 40406)) throw error // anything else is not "stream missing"
    }
    const plan = planStream(current, subjects)
    if (plan.create) await jsm.streams.add({ name: STREAM_NAME, subjects: plan.subjects, storage: 'file', retention: 'limits' })
    else if (plan.add.length > 0) await jsm.streams.update(STREAM_NAME, { subjects: [...(current ?? []), ...plan.add] })
  }

  override async publish(input: EventInput): Promise<PublishedEvent> {
    assertDeclared(this.catalog, TYPES.publish, input.type)
    const event = createEvent(input, this.source)
    const { js } = await this.session
    const subject = subjectFor(event.type)
    await this.ensureCapture([subject])
    const ack = await js.publish(subject, new TextEncoder().encode(JSON.stringify(event)), { msgID: event.id })
    return { event, stream: ack.stream, seq: ack.seq, duplicate: ack.duplicate }
  }

  override async subscribe(subscription: { readonly type: string }, handler: EventHandler): Promise<SubscriptionHandle> {
    assertDeclared(this.catalog, TYPES.subscribe, subscription.type)
    const subject = subjectFor(subscription.type)
    const durable = durableName(this.role, subject)
    const { jsm, js } = await this.session
    await this.ensureCapture([subject])
    await jsm.consumers.addOrUpdate(STREAM_NAME, { durable_name: durable, filter_subject: subject, ack_policy: AckPolicy.Explicit })
    const handle: SubscriptionHandle = {
      type: subscription.type, subject, durable,
      stop: async () => { stopped = true; messages?.stop(); this.subscriptions.delete(handle) },
    }
    let stopped = false
    let messages: ConsumerMessages | undefined
    this.subscriptions.add(handle)
    // The official client reconnects by itself; this loop only re-opens the consume iterator when it ends.
    void (async () => {
      while (!stopped) {
        try {
          const consumer = await js.consumers.get(STREAM_NAME, durable)
          messages = await consumer.consume()
          for await (const message of messages) await this.deliver(message, handler)
        } catch (error) {
          if (!stopped) this.reject(error, subject, 'consume')
        }
        if (!stopped) await new Promise(resolve => setTimeout(resolve, RECONNECT_RETRY_MS))
      }
    })()
    return handle
  }

  /** Simplest ACK semantics until #100 (durable acceptance): ACK after the handler resolves, NAK when it throws. */
  private async deliver(message: JsMsg, handler: EventHandler): Promise<void> {
    const meta = { subject: message.subject, stream: STREAM_NAME, seq: message.seq }
    let event: CloudEvent
    try {
      event = parseEvent(message.subject, message.data)
    } catch (error) {
      message.term() // an invalid envelope is never going to become valid: do not redeliver
      this.ctx.emit('dispatch/envelope-rejected', { ...meta, reason: (error as Error).message } satisfies RejectedEvent)
      return
    }
    try {
      await handler(event, meta)
      message.ack()
    } catch (error) {
      message.nak()
      this.reject(error, message.subject, 'handler')
    }
  }

  private reject(error: unknown, subject: string, stage: string): void {
    this.ctx.logger.error(`dispatchMessaging ${this.role}: ${stage} failed for ${subject}: ${error instanceof Error ? error.message : String(error)}`)
  }
}
