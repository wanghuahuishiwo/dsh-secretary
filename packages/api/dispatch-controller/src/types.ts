/** Wire-facing types of the `secretaryDispatch` Remote; the Gateway shapes come from the shared package. */
import type { GatewaySettingsPatch } from 'dsh-secretary-dispatch-gateway'

export type {
  GatewayState, GatewayStatus, GatewaySettings, GatewayMode, GatewayKeyRef,
} from 'dsh-secretary-dispatch-gateway'

/** Settings change from the console; omitted fields keep their stored value. */
export interface UpdateGatewaySettings {
  readonly mode?: 'local' | 'remote'
  readonly clientPort?: number
  readonly monitorPort?: number
  /** `nats-server` binary: a PATH entry name or an absolute path. */
  readonly binary?: string
  /** Remote mode only: the Gateway address. */
  readonly remoteUrl?: string
  /** Remote mode only: credential references of the roles enabled on this machine. */
  readonly centerCredential?: string
  readonly nodeCredential?: string
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The shared Gateway logic refused or failed an operation; `code` is its stable error code. */
    'secretaryDispatch/gateway-error': { readonly code: string }
  }
}

/**
 * Shapes of the console read path (#105): what the Gateway holds, passed through as it is. The Remote carries each
 * one as JSON text (`JSON.stringify` of the shape), because a strict codec cannot describe unconstrained documents.
 */

/** One online NATS service instance as the official service discovery returned it (name, id, version, metadata, endpoints…). */
export type ServiceInstance = Readonly<Record<string, unknown>>

/** One message of the event stream. */
export interface StreamEvent {
  /** Stream sequence. */
  readonly seq: number
  /** NATS subject the event was published on. */
  readonly subject: string
  /** The stored payload: the CloudEvents envelope when it is JSON, else the text as it lies. */
  readonly event: unknown
  /** Rows of the engine event history naming this event, in the engine's own record shape; empty when there is none. */
  readonly history: readonly Record<string, unknown>[]
}

/** A page of the stream, newest first. */
export interface EventPage {
  /** First and last sequence the stream currently holds. */
  readonly firstSeq: number
  readonly lastSeq: number
  readonly events: readonly StreamEvent[]
}

export interface EventQuery {
  /** Read the messages before this stream sequence; omitted means from the newest. */
  readonly before?: number
  /** Page size, 200 by default. */
  readonly limit?: number
}

/** Turn the flat console input into the shared settings patch. */
export function toSettingsPatch(input: UpdateGatewaySettings): GatewaySettingsPatch {
  const { remoteUrl, centerCredential, nodeCredential, ...rest } = input
  if (remoteUrl === undefined && centerCredential === undefined && nodeCredential === undefined) return rest
  const credentials: Record<string, string> = {}
  if (centerCredential !== undefined) credentials.center = centerCredential
  if (nodeCredential !== undefined) credentials.node = nodeCredential
  return { ...rest, remote: { url: remoteUrl ?? '', credentials } }
}
