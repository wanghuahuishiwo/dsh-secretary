import type { RemoteResult, TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type {} from 'dsh-secretary-dispatch-controller/remote'
import type { DispatchConsoleAdapter, UpdateGatewaySettings } from '../ui/contract.ts'

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
}

/** A Remote failure (e.g. `secretaryDispatch/gateway-error`) rejects; a success yields its value. */
async function settle<T>(result: Promise<RemoteResult<T>>): Promise<T> {
  const settled = await result
  if (!settled.ok) throw settled.error
  return settled.value
}
