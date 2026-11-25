import type { DispatchConsoleAdapter, GatewayStatus } from '../ui/contract.ts'

/** One polling status per plugin instance, shared by the header, the Gateway section and the overlay notice. */
export interface StatusFeed {
  getSnapshot(): GatewayStatus | undefined
  subscribe(listener: () => void): () => void
  /** Probe now (after a command); also resets the polling clock. */
  refresh(): Promise<void>
  start(intervalMs: number): () => void
  /** Last probe failure, if any, so the UI can show it instead of pretending. */
  error(): string | undefined
}

export const STATUS_POLL_MS = 3000

export function createStatusFeed(adapter: DispatchConsoleAdapter): StatusFeed {
  let status: GatewayStatus | undefined
  let failure: string | undefined
  const listeners = new Set<() => void>()
  const emit = () => { for (const listener of listeners) listener() }
  const refresh = async () => {
    try {
      status = await adapter.readStatus()
      failure = undefined
    } catch (cause) {
      failure = cause instanceof Error ? cause.message : String(cause)
    }
    emit()
  }
  return {
    getSnapshot: () => status,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    refresh,
    error: () => failure,
    start(intervalMs) {
      void refresh()
      const timer = setInterval(() => { void refresh() }, intervalMs)
      return () => clearInterval(timer)
    },
  }
}
