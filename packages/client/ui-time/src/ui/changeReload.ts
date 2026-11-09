import type { TimeView } from './contract.ts'

/**
 * The parts of a `TimeView` that prove a host-side write happened. `today`,
 * `nowMinute` and the adapter-owned `canUndo` move on their own between reads,
 * so they must not trigger a repaint; blocks, tags and the deep week do.
 */
export function viewSignature(view: TimeView): string {
  return JSON.stringify([view.days, view.weekStart, view.tags, view.blocks, view.deep])
}

export interface ChangeReloadOptions {
  /** Re-reads the current window; a change mark only says that data moved. */
  readonly load: () => Promise<TimeView>
  /** The view the surface currently displays; the comparison baseline. */
  readonly current: () => TimeView
  /** Applies a view whose data actually changed; never called with equal data. */
  readonly apply: (view: TimeView) => void
  /** Returns true while a local interaction must not be disturbed by a repaint. */
  readonly isHeld: () => boolean
  /** Coalesce one write's burst of marks into a single reload; default 50ms. */
  readonly debounceMs?: number
}

export interface ChangeReload {
  /** A change mark arrived; reload once the burst settles, or while held, defer. */
  notify(): void
  /** The surface was released; apply a change that arrived while it was held. */
  release(): void
  dispose(): void
}

/**
 * Applies host-side Time changes to an open surface without polling: the host
 * pushes a mark through the `secretaryTime/watch` stream exactly when a
 * mutation persisted, and only a real data change repaints. A reload failure
 * is skipped, not surfaced: the manual refresh stays the error-reporting path.
 */
export function createChangeReload(options: ChangeReloadOptions): ChangeReload {
  const debounceMs = options.debounceMs ?? 50
  let pending = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let loading = false

  const reload = async (): Promise<void> => {
    if (loading) {
      pending = true
      return
    }
    loading = true
    try {
      const next = await options.load()
      if (viewSignature(next) !== viewSignature(options.current())) options.apply(next)
    } catch {
      // A transient read failure leaves the last good view in place.
    } finally {
      loading = false
    }
  }

  const drain = () => {
    if (!pending) return
    pending = false
    void reload()
  }

  const cancelTimer = () => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  return {
    notify() {
      pending = true
      if (options.isHeld()) return
      cancelTimer()
      timer = setTimeout(() => {
        timer = undefined
        drain()
      }, debounceMs)
    },
    release() {
      cancelTimer()
      drain()
    },
    dispose() {
      cancelTimer()
      pending = false
    },
  }
}
