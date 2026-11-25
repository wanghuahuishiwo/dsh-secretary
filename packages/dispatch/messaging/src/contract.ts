/**
 * Service Definition of the messaging plugin: what a business plugin uses to publish and receive CloudEvents.
 * Center and node each load their own instance under `cordis:group` + `isolate: { dispatchMessaging: true }`.
 */
import { Service, type Context } from '@deepseek-ai/cordis'
import type { GatewayRole } from 'dsh-secretary-dispatch-gateway'
import type { CloudEvent, EventInput } from './envelope.ts'
import type { Outbox, OutboxTransaction } from './outbox.ts'

/** Cordis service key; isolate it per role group. */
export const SERVICE_KEY = 'dispatchMessaging'

/** A published event as stored by JetStream; `publish` resolves with it once the relay saw the PubAck. */
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

/**
 * Receives one valid event that was not accepted before. It runs inside the Inbox transaction: rows written through
 * `tx` (the acceptance itself included) commit together when the handler resolves, and only then is the consumer ACK
 * sent. The ACK means durable acceptance, not that the execution finished; a throw rolls back and redelivers.
 * An event whose id is already in the Inbox is ACKed without calling the handler.
 */
export type EventHandler = (event: CloudEvent, meta: EventMeta, tx: OutboxTransaction) => void | Promise<void>

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
  /** The role whose subscription rejected it: Cordis events are not scoped to a role realm, listeners must filter. */
  readonly role: GatewayRole
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

  /** The role's Outbox and Inbox store; `transaction` is where a business result and its event commit together. */
  abstract readonly outbox: Outbox

  /**
   * Queue an event in the Outbox and resolve once the relay saw its PubAck (`Nats-Msg-Id = event.id`), however many
   * Gateway restarts or retries that takes. Without the Gateway it stays pending; it is never dropped.
   */
  abstract publish(input: EventInput): Promise<PublishedEvent>

  /** Wake the relay: drain the pending events now instead of at the next poll. */
  abstract kickRelay(): void

  /** Subscribe to an event type with a durable consumer created or reused online. */
  abstract subscribe(subscription: EventSubscription, handler: EventHandler): Promise<SubscriptionHandle>
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    'dispatch/envelope-rejected': (event: RejectedEvent) => void
  }
}
