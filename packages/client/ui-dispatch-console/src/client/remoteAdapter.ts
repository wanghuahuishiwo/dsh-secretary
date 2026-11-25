import type { RemoteResult, TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type {} from 'dsh-secretary-dispatch-controller/remote'
import type {
  DispatchConsoleAdapter, EventPage, ServiceInstance, UpdateGatewaySettings,
} from '../ui/contract.ts'

/** The generated `secretaryDispatch` browser client, without the plugin's own Context shape. */
export type DispatchRemote = TypertRemoteNamespaceMap['secretaryDispatch']

/** Maps the console contract onto the Remote; every call re-probes on the Host, nothing is cached here. */
export class RemoteDispatchAdapter implements DispatchConsoleAdapter {
  constructor(private readonly remote: DispatchRemote) {}

  readStatus() { return settle(this.remote.readStatus()) }
  start() { return settle(this.remote.start()) }
  stop() { return settle(this.remote.stop()) }
  restart() { return settle(this.remote.restart()) }
  readSettings() { return settle(this.remote.readSettings()) }
  updateSettings(input: UpdateGatewaySettings) { return settle(this.remote.updateSettings(input)) }
  /** The Remote carries the raw documents as JSON text; nothing is mapped field by field. */
  async listServices(): Promise<ServiceInstance[]> { return JSON.parse(await settle(this.remote.listServices())) }
  async listEvents(query: { readonly before?: number; readonly limit?: number }): Promise<EventPage> {
    const { before, limit } = query
    return JSON.parse(await settle(this.remote.listEvents({ ...(before === undefined ? {} : { before }), ...(limit === undefined ? {} : { limit }) })))
  }
  watchEvents(onChange: () => void): () => void {
    const handle = this.remote.watch()
    void (async () => {
      try {
        for await (const _mark of handle) onChange()
      } catch {
        // Stream lost with the carrier; the surface keeps its last good page.
      }
    })()
    return () => { void handle.dispose() }
  }
}

/** A Remote failure (e.g. `secretaryDispatch/gateway-error`) rejects; a success yields its value. */
async function settle<T>(result: Promise<RemoteResult<T>>): Promise<T> {
  const settled = await result
  if (!settled.ok) throw settled.error
  return settled.value
}
