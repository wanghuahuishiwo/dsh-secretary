import type { GatewaySettings, GatewayStatus, UpdateGatewaySettings } from 'dsh-secretary-dispatch-controller/types'

/** What the console needs from the foundation Host API; the production adapter wraps the `secretaryDispatch` Remote. */
export interface DispatchConsoleAdapter {
  readStatus(): Promise<GatewayStatus>
  start(): Promise<GatewayStatus>
  stop(): Promise<GatewayStatus>
  restart(): Promise<GatewayStatus>
  readSettings(): Promise<GatewaySettings>
  updateSettings(input: UpdateGatewaySettings): Promise<GatewaySettings>
}

export type { GatewaySettings, GatewayStatus, UpdateGatewaySettings }
