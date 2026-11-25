/**
 * Service Definition of the messaging plugin: what a business plugin uses to publish and receive CloudEvents.
 * Center and node each load their own instance under `cordis:group` + `isolate: { dispatchMessaging: true }`.
 */
import { Service, type Context } from '@deepseek-ai/cordis'
import type { GatewayRole } from 'dsh-secretary-dispatch-gateway'
import type { CloudEvent, EventInput } from './envelope.ts'

/** Cordis service key; isolate it per role group. */
export const SERVICE_KEY = 'dispatchMessaging'

/** A published event as stored by JetStream. */
export interface PublishedEvent {
  readonly event: CloudEvent
  readonly stream: string
  readonly seq: number
  readonly duplicate: boolean
}

/** Where a delivered event came from. */
export interface EventMeta {
  readonly subject: string
  readonly stream: string
  readonly seq: number
}

/** Receives one valid event; it is ACKed when it resolves and redelivered when it throws. */
export type EventHandler = (event: CloudEvent, meta: EventMeta) => void | Promise<void>

/** One subscription: the NATS subject is derived from the event `type`. */
export interface EventSubscription {
  readonly type: string
}

export interface SubscriptionHandle {
  readonly type: string
  readonly subject: string
  readonly durable: string
  stop(): Promise<void>
}

/** Cordis event emitted when a received event fails envelope validation; the message is terminated, not redelivered. */
export interface RejectedEvent {
  readonly subject: string
  readonly stream: string
  readonly seq: number
  readonly reason: string
}

export abstract class DispatchMessaging extends Service {
  constructor(ctx: Context) {
    super(ctx, SERVICE_KEY)
  }

  abstract readonly role: GatewayRole
  /** The persisted node identity; `undefined` for the center. */
  abstract readonly nodeId: string | undefined

  /** Build a DSH event from the role's `source`, validate it and publish it with `Nats-Msg-Id = event.id`. */
  abstract publish(input: EventInput): Promise<PublishedEvent>

  /** Subscribe to an event type with a durable consumer created or reused online. */
  abstract subscribe(subscription: EventSubscription, handler: EventHandler): Promise<SubscriptionHandle>
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    'dispatch/envelope-rejected': (event: RejectedEvent) => void
  }
}
