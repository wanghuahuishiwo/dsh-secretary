export { CENTER_SOURCE, SUBJECT_PREFIX, createEvent, nodeSource, parseEvent, subjectFor } from './envelope.ts'
export type { CloudEvent, EventInput } from './envelope.ts'
export { MessagingError } from './errors.ts'
export type { MessagingErrorCode } from './errors.ts'
export { initNodeId, nodeIdPath, readNodeId } from './identity.ts'
export { STREAM_NAME, assertDeclared, durableName, planStream, streamConfig, writePermissions } from './catalog.ts'
export type { EventCatalog } from './catalog.ts'
export { Config, NatsDispatchMessaging } from './service.ts'
export { DispatchMessaging, SERVICE_KEY } from './contract.ts'
export type { EventMeta, EventHandler, EventSubscription, PublishedEvent, RejectedEvent, SubscriptionHandle } from './contract.ts'

/** Plugin entry: one role per `cordis:group` with `isolate: { dispatchMessaging: true }`. */
import type { Context } from '@deepseek-ai/cordis'
import type { Config } from './service.ts'
import { NatsDispatchMessaging } from './service.ts'

export const name = 'dsh-secretary-dispatch-messaging'
export const inject = ['credentials']

export async function apply(ctx: Context, config: Config): Promise<void> {
  const service = new NatsDispatchMessaging(ctx, config)
  await service.ready
}
