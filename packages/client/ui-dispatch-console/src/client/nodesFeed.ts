import type { DispatchConsoleAdapter, ServiceInstance } from '../ui/contract.ts'

/** How often the node list is read; the header count and the 节点 section share it. */
export const NODES_POLL_MS = 10_000

/** One polling node list per plugin instance, shared by the header count and the 节点 section. */
export interface NodesFeed {
  getSnapshot(): NodesSnapshot | undefined
  subscribe(listener: () => void): () => void
  start(intervalMs: number): () => void
}

export interface NodesSnapshot {
  readonly services: readonly ServiceInstance[]
  /** Last read failure, if any, so the section shows it instead of pretending. */
  readonly error: string | undefined
}

export function createNodesFeed(adapter: DispatchConsoleAdapter): NodesFeed {
  let snapshot: NodesSnapshot | undefined
  const listeners = new Set<() => void>()
  const emit = () => { for (const listener of listeners) listener() }
  const refresh = async () => {
    try {
      snapshot = { services: await adapter.listServices(), error: undefined }
    } catch (cause) {
      snapshot = { services: [], error: cause instanceof Error ? cause.message : String(cause) }
    }
    emit()
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    start(intervalMs) {
      void refresh()
      const timer = setInterval(() => { void refresh() }, intervalMs)
      return () => clearInterval(timer)
    },
  }
}
