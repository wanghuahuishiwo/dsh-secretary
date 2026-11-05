import type { Tag } from 'dsh-secretary-tag/contract'
import type {} from '@deepseek-ai/dsh-typert-protocol'
import type { ActualBlock, DeepWeek, PlanBlock } from 'dsh-secretary-time-block/contract'

export type TimeLayer = 'actual' | 'plan'

/** One half-open local-day interval painted in ten-minute canvas coordinates. */
export interface PaintRun {
  readonly date: string
  readonly start: number
  readonly end: number
}

/** A single paint operation on either independent Time layer. */
export interface PaintTimeBlocksRequest {
  readonly layer: TimeLayer
  readonly tagId: number | null
  readonly runs: readonly PaintRun[]
  readonly timeZone: string
}

export interface PaintResult { readonly ok: true }

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The Time product rejected an invalid request or a domain rule refused it. */
    'secretaryTime/invalid-input': { readonly operation: 'readWindow' | 'paint' }
    /** A block selected by an in-flight paint no longer exists. */
    'secretaryTime/not-found': { readonly blockId: number }
    /** A Time write or its compensation failed; the original cause stays in Host logs. */
    'secretaryTime/write-failed': { readonly operation: 'paint' }
  }
}

/** Inputs for the Time product's current three-module window. */
export interface TimeWindowRequest {
  readonly anchor: string
  readonly timeZone: string
  readonly weekStart?: string
  readonly from?: string
  readonly to?: string
}

/** The Time-only projection; it deliberately has no GTD facts or warnings. */
export interface TimeWindowProjection {
  readonly anchor: string
  readonly timeZone: string
  readonly today: string
  readonly nowMs: number
  readonly from: string
  readonly to: string
  readonly days: readonly string[]
  readonly weekStart: string
  readonly tags: readonly Tag[]
  readonly actual: readonly ActualBlock[]
  readonly plan: readonly PlanBlock[]
  readonly deep: DeepWeek
}
