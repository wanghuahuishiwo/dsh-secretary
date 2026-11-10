import type { Tag, TagKind } from 'dsh-secretary-tag-service/contract'
import type {} from '@deepseek-ai/dsh-typert-protocol'
import type {
  ActualBlock, ActualSource, DeepLevel, DeepWeek, FocusLevel, PlanBlock, PlanTemplateBlock,
} from 'dsh-secretary-time-block/contract'

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
  /** `overwrite` is the default canvas behavior; `parallel` keeps existing records. */
  readonly mode?: 'overwrite' | 'parallel'
}

export interface PaintResult { readonly ok: true }

/** A complete local-day snapshot used to restore one canvas Undo entry. */
export interface ReplaceTimeDayRequest {
  readonly layer: TimeLayer
  readonly date: string
  readonly timeZone: string
  readonly intervals: readonly {
    readonly start: number
    readonly end: number
    readonly timeTagId: number
    readonly note?: string
  }[]
}

export interface UpdateTimeBlockRequest {
  readonly layer: TimeLayer
  readonly id: number
  readonly timeTagId?: number
  readonly note?: string | null
  readonly startAt?: string
  readonly endAt?: string
}

export interface DeleteTimeBlockRequest {
  readonly layer: TimeLayer
  readonly id: number
}

export interface PaintDeepRequest {
  readonly weekStart: string
  readonly level: 'high' | 'medium' | 'low' | null
  readonly rects: readonly {
    readonly startWeekday: number
    readonly startHour: number
    readonly endWeekday: number
    readonly endHour: number
  }[]
}

export interface UpdateTimeBlockResult {
  readonly block: ActualBlock | PlanBlock
}

export interface DeleteTimeBlockResult {
  readonly ok: true
  readonly block: ActualBlock | PlanBlock
}

export interface PaintDeepResult {
  readonly week: DeepWeek
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The Time product rejected an invalid request or a domain rule refused it. */
    'secretaryTime/invalid-input': { readonly operation: 'readWindow' | 'paint' | 'replaceDay' | 'updateBlock' | 'deleteBlock' | 'paintDeep' | 'agentInvoke' }
    /** A block selected by an in-flight paint no longer exists. */
    'secretaryTime/not-found': { readonly blockId: number }
    /** A Time write or its compensation failed; the original cause stays in Host logs. */
    'secretaryTime/write-failed': { readonly operation: 'paint' | 'replaceDay' | 'updateBlock' | 'deleteBlock' | 'paintDeep' | 'agentInvoke' }
    /** A CLI tag op named a tag that does not exist. */
    'secretaryTag/not-found': { readonly tagId: number }
    /** The Tag domain refused the op; the message keeps the Service contract text. */
    'secretaryTag/invalid-input': Record<string, never>
    /** A tag op failed outside the domain contract; the cause stays in Host logs. */
    'secretaryTag/agent-op-failed': Record<string, never>
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

/**
 * The retired session tools' exact op surfaces, kept as typed unions so the
 * CLI and the Remote methods share one contract with the Service layer.
 */
export type TimeAgentInvoke =
  | { readonly op: 'plan.create'; readonly date: string; readonly timeZone: string; readonly startAt: string; readonly endAt: string; readonly timeTagId: number; readonly note?: string }
  | { readonly op: 'plan.get'; readonly id: number }
  | { readonly op: 'plan.list'; readonly date?: string; readonly timeZone?: string; readonly timeTagId?: number }
  | { readonly op: 'plan.update'; readonly id: number; readonly timeTagId?: number; readonly note?: string | null; readonly startAt?: string; readonly endAt?: string }
  | { readonly op: 'plan.delete'; readonly id: number }
  | { readonly op: 'template.list'; readonly weekday?: number }
  | { readonly op: 'template.create'; readonly weekday: number; readonly startTime: string; readonly endTime: string; readonly timeTagId: number; readonly note?: string }
  | { readonly op: 'template.update'; readonly id: number; readonly timeTagId?: number; readonly note?: string | null; readonly weekday?: number; readonly startTime?: string; readonly endTime?: string }
  | { readonly op: 'template.delete'; readonly id: number }
  | { readonly op: 'template.apply'; readonly weekday: number; readonly targetDate: string; readonly timeZone: string }
  | { readonly op: 'template.undo'; readonly targetDate: string; readonly timeZone: string }
  | { readonly op: 'actual.create'; readonly startAt: string; readonly endAt?: string; readonly timeTagId: number; readonly actualSource: ActualSource; readonly focus?: FocusLevel; readonly note?: string }
  | { readonly op: 'actual.get'; readonly id: number }
  | { readonly op: 'actual.list'; readonly date?: string; readonly timeZone?: string; readonly from?: string; readonly to?: string; readonly timeTagId?: number }
  | { readonly op: 'actual.update'; readonly id: number; readonly timeTagId?: number; readonly note?: string | null; readonly startAt?: string; readonly endAt?: string | null; readonly actualSource?: ActualSource; readonly focus?: FocusLevel | null }
  | { readonly op: 'actual.delete'; readonly id: number }
  | { readonly op: 'actual.start'; readonly startAt?: string; readonly timeTagId: number; readonly actualSource: ActualSource; readonly focus?: FocusLevel; readonly note?: string }
  | { readonly op: 'actual.stop'; readonly id: number; readonly endAt?: string }
  | { readonly op: 'deep.getWeek'; readonly weekStart: string }
  | { readonly op: 'deep.setCell'; readonly weekStart: string; readonly weekday: number; readonly hour: number; readonly level: DeepLevel }
  | { readonly op: 'deep.clearCell'; readonly weekStart: string; readonly weekday: number; readonly hour: number }
  | { readonly op: 'deep.setRange'; readonly weekStart: string; readonly startWeekday: number; readonly startHour: number; readonly endWeekday: number; readonly endHour: number; readonly level: DeepLevel }
  | { readonly op: 'deep.clearRange'; readonly weekStart: string; readonly startWeekday: number; readonly startHour: number; readonly endWeekday: number; readonly endHour: number }
  | { readonly op: 'reload' }

export type TimeAgentBlock = PlanTemplateBlock | PlanBlock | ActualBlock

export type TimeAgentResult =
  | { readonly block: TimeAgentBlock }
  | { readonly blocks: readonly TimeAgentBlock[] }
  | { readonly week: DeepWeek }
  | { readonly reloaded: true }

export type TagAgentInvoke =
  | { readonly op: 'create'; readonly name: string; readonly kind?: TagKind; readonly parentId?: number; readonly color?: string; readonly description?: string }
  | { readonly op: 'get'; readonly id: number }
  | { readonly op: 'list'; readonly kind?: TagKind }
  | { readonly op: 'update'; readonly id: number; readonly name?: string; readonly color?: string | null; readonly description?: string | null }
  | { readonly op: 'move'; readonly id: number; readonly parentId: number | null }
  | { readonly op: 'delete'; readonly id: number }
  | { readonly op: 'reload' }

export type TagAgentResult =
  | { readonly tag: Tag }
  | { readonly tags: readonly Tag[] }
  | { readonly reloaded: true }
