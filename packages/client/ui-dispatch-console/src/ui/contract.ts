import type {
  EventPage, GatewaySettings, GatewayStatus, ServiceInstance, StreamEvent, UpdateGatewaySettings,
} from 'dsh-secretary-dispatch-controller/types'

/** What the console needs from the foundation Host API; the production adapter wraps the `secretaryDispatch` Remote. */
export interface DispatchConsoleAdapter {
  readStatus(): Promise<GatewayStatus>
  start(): Promise<GatewayStatus>
  stop(): Promise<GatewayStatus>
  restart(): Promise<GatewayStatus>
  readSettings(): Promise<GatewaySettings>
  updateSettings(input: UpdateGatewaySettings): Promise<GatewaySettings>
  /** Online NATS service instances, as the official service discovery returned them. */
  listServices(): Promise<ServiceInstance[]>
  /** One page of the event stream, newest first; `before` is the stream sequence to read up to. */
  listEvents(query: { readonly before?: number; readonly limit?: number }): Promise<EventPage>
  /** Marks pushed when an event reaches the Gateway; the stream carries no data. */
  watchEvents?(onChange: () => void): () => void
}

export type {
  EventPage, GatewaySettings, GatewayStatus, ServiceInstance, StreamEvent, UpdateGatewaySettings,
}
