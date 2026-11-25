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

/** Turn the flat console input into the shared settings patch. */
export function toSettingsPatch(input: UpdateGatewaySettings): GatewaySettingsPatch {
  const { remoteUrl, centerCredential, nodeCredential, ...rest } = input
  if (remoteUrl === undefined && centerCredential === undefined && nodeCredential === undefined) return rest
  const credentials: Record<string, string> = {}
  if (centerCredential !== undefined) credentials.center = centerCredential
  if (nodeCredential !== undefined) credentials.node = nodeCredential
  return { ...rest, remote: { url: remoteUrl ?? '', credentials } }
}
