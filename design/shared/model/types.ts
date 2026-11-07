export type TimeLayer = 'plan' | 'actual'
export type Theme = 'dark' | 'light'

/** 标签颜色可以是设计 token 引用，也可以是生产 Adapter 返回的 CSS 色值。 */
export interface TimeTag {
  readonly id: string
  readonly name: string
  readonly color: string
  readonly parentId?: string
}

/** 单日内的半开时间区间，start/end 均为本地午夜后的分钟数。 */
export interface TimeBlock {
  readonly id: string
  readonly date: string
  readonly start: number
  readonly end: number
  readonly tagId: string
  readonly note?: string
}

export interface TimeRun {
  readonly date: string
  readonly start: number
  readonly end: number
}

export interface TimeBlockSnapshot {
  readonly today: string
  readonly nowMinute: number
  readonly tags: readonly TimeTag[]
  readonly blocks: Readonly<Record<TimeLayer, readonly TimeBlock[]>>
  readonly canUndo: Readonly<Record<TimeLayer, boolean>>
}
