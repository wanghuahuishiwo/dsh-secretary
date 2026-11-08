/**
 * The TimeBlock UI data contract.
 *
 * The UI only knows this module: it sends commands and renders the `TimeView`
 * each one returns. Hosts fulfil it at the edge — the production client maps
 * the Typert Remote, the OpenDesign shell maps an in-memory fixture. IDs are
 * strings here so a fixture is not forced to invent numeric identities.
 */
export type TimeLayer = 'plan' | 'actual'

export interface TimeTagView {
  readonly id: string
  readonly name: string
  readonly parentId?: string
  readonly color?: string
}

export interface TimeBlockView {
  readonly id: string
  /** Local day the block segment belongs to. */
  readonly date: string
  /** Minutes after local midnight. */
  readonly start: number
  readonly end: number
  readonly tagId: string
  readonly note?: string
}

/** A half-open interval of one local day, in minutes. */
export interface TimeRunView {
  readonly date: string
  readonly start: number
  readonly end: number
}

export type DeepLevel = 'high' | 'medium' | 'low'
export type DeepCellLevel = DeepLevel | 'unset'
export type DeepWeekSource = 'own' | 'inherited' | 'seed'

export interface DeepWeekData {
  readonly source: DeepWeekSource
  /** Seven weekdays by twenty-four hours, Monday first. */
  readonly levels: readonly DeepCellLevel[]
}

/** One rectangle of the deep-week grid: weekday 1..7 and hour 0..23, both inclusive. */
export interface DeepRect {
  readonly startWeekday: number
  readonly startHour: number
  readonly endWeekday: number
  readonly endHour: number
}

export interface TimeView {
  readonly today: string
  readonly nowMinute: number
  readonly from: string
  readonly to: string
  readonly days: readonly string[]
  readonly weekStart: string
  /** Only tags of kind `time`. */
  readonly tags: readonly TimeTagView[]
  readonly blocks: Readonly<Record<TimeLayer, readonly TimeBlockView[]>>
  readonly deep: DeepWeekData
  readonly canUndo: Readonly<Record<TimeLayer, boolean>>
}

export interface TimeQuery {
  readonly anchor: string
  readonly from: string
  readonly to: string
  readonly weekStart: string
}

export interface PaintCommand {
  readonly layer: TimeLayer
  /** `null` erases the selection. */
  readonly tagId: string | null
  readonly runs: readonly TimeRunView[]
  /**
   * `overwrite` (default) cuts and replaces what the runs cover.
   * `parallel` keeps every existing record and adds one new record per run.
   */
  readonly mode?: 'overwrite' | 'parallel'
}

export interface PaintDeepCommand {
  readonly weekStart: string
  /** `null` erases the rectangles. */
  readonly level: DeepLevel | null
  readonly rects: readonly DeepRect[]
}

export interface UpdateBlockCommand {
  readonly layer: TimeLayer
  readonly id: string
  readonly date: string
  readonly start: number
  readonly end: number
  readonly tagId: string
  readonly note?: string
}

export interface DeleteBlockCommand {
  readonly layer: TimeLayer
  readonly id: string
}

/**
 * The UI's only data boundary. Every write returns the fresh view, so the UI
 * never asks for an implicit reload; errors reject and the UI reports them.
 */
export interface TimeAdapter {
  load(query: TimeQuery): Promise<TimeView>
  paint(command: PaintCommand): Promise<TimeView>
  undo(layer: TimeLayer): Promise<TimeView | undefined>
  paintDeep(command: PaintDeepCommand): Promise<TimeView>
  updateBlock(command: UpdateBlockCommand): Promise<TimeView>
  deleteBlock(command: DeleteBlockCommand): Promise<TimeView>
}

export interface TimeProductProps {
  readonly adapter: TimeAdapter
  /**
   * The product day this surface opens on. Production omits it and follows the
   * host's local day; a fixture preview pins one so screenshots and scenarios
   * stay reproducible. The adapter's `TimeView.today` stays authoritative.
   */
  readonly today?: string
}
