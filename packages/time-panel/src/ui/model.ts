/** One cell of the 时间块 canvas: ten minutes. */
export const CELL = 10
/** Cells in one hour row. */
export const PER_HOUR = 60 / CELL
/** Smallest hour height the canvas falls back to before it lets the day scroll. */
export const MIN_ROW_H = 22
export const MAX_ROW_H = 64

import { pinyin } from 'pinyin-pro'

/** The shape of a tag as the pure UI sees it — structurally compatible with the domain Tag. */
export interface TimeTag {
  readonly id: number
  readonly name: string
  readonly kind: 'time' | 'context'
  readonly parentId?: number
  readonly color?: string
}

export type DeepLevel = 'high' | 'medium' | 'low'
export type DeepCellLevel = DeepLevel | 'unset'
export type DeepWeekSource = 'own' | 'inherited' | 'seed'

/** The deep-week grid data as the pure UI sees it — structurally compatible with the domain DeepWeek. */
export interface DeepWeekData {
  readonly weekStart: string
  readonly source: DeepWeekSource
  readonly cells: readonly { readonly level: DeepCellLevel }[]
}

export interface DayRecord {
  readonly id: number
  readonly start: number
  readonly end: number
  readonly timeTagId: number
  readonly note?: string
}

/** A half-open interval of one local day, in minutes. */
export interface Run {
  readonly date: string
  readonly start: number
  readonly end: number
}

export interface BlockLike {
  readonly id: number
  readonly startAt: string
  readonly endAt?: string
  readonly timeTagId: number
  readonly note?: string
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function clock(minute: number): string {
  const value = ((minute % 1440) + 1440) % 1440
  return `${pad(Math.floor(value / 60))}:${pad(value % 60)}`
}

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00`)
  value.setDate(value.getDate() + amount)
  return localDate(value)
}

/** The host's IANA time zone, with a stable fallback when the runtime omits it. */
export function timeZoneOf(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
}

/** `11月6日 周五` for one local date. */
export function formatDateLabel(date: string): string {
  const value = new Date(`${date}T12:00:00`)
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][value.getDay()]
  return `${value.getMonth() + 1}月${value.getDate()}日 ${weekday}`
}

/** Weekday of a local date, Monday = 1 … Sunday = 7. */
export function weekdayOf(date: string): number {
  return (new Date(`${date}T12:00:00`).getDay() + 6) % 7 + 1
}

/** The Monday of the week containing `date`. */
export function weekStartOf(date: string): string {
  return addDays(date, 1 - weekdayOf(date))
}

export function snapDown(minute: number): number {
  return Math.floor(minute / CELL) * CELL
}

export function snapUp(minute: number): number {
  return Math.ceil(minute / CELL) * CELL
}

/** The local date an instant falls on. */
export function localDateOf(instant: string | number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(instant))
  const field = (type: string) => parts.find(part => part.type === type)?.value ?? ''
  return `${field('year')}-${field('month')}-${field('day')}`
}

/** Minutes from local midnight for an instant. */
export function minuteOf(instant: string | number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instant))
  const field = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0)
  return field('hour') * 60 + field('minute')
}

/** The instant of a local date and minute. */
export function atMinute(date: string, minute: number): string {
  const value = new Date(`${date}T00:00:00`)
  value.setMinutes(minute)
  return value.toISOString()
}

/**
 * One day's slice of a block list, clipped to the day and dropped when it has no
 * length on it. A running block ends at the current minute.
 */
export function recordsOfDay(
  blocks: readonly BlockLike[], date: string, timeZone: string, nowMs: number,
): DayRecord[] {
  const result: DayRecord[] = []
  for (const block of blocks) {
    const startDate = localDateOf(block.startAt, timeZone)
    const endDate = block.endAt === undefined ? localDateOf(nowMs, timeZone) : localDateOf(block.endAt, timeZone)
    if (startDate > date || endDate < date) continue
    const start = startDate === date ? minuteOf(block.startAt, timeZone) : 0
    const end = endDate === date ? minuteOf(block.endAt ?? new Date(nowMs).toISOString(), timeZone) : 1440
    if (end <= start) continue
    result.push({ id: block.id, start, end, timeTagId: block.timeTagId, note: block.note })
  }
  return result.sort((left, right) => left.start - right.start || left.id - right.id)
}

/** The record covering one minute of a day, if any. */
export function recordAt(records: readonly DayRecord[], minute: number): DayRecord | undefined {
  return records.find(record => record.start <= minute && minute < record.end)
}

/** Merge a day's selected minutes into contiguous runs. */
export function runsOf(day: string, minutes: readonly number[]): Run[] {
  const sorted = [...new Set(minutes)].sort((left, right) => left - right)
  const runs: Run[] = []
  for (const minute of sorted) {
    const last = runs[runs.length - 1]
    if (last !== undefined && last.end === minute) {
      runs[runs.length - 1] = { date: day, start: last.start, end: minute + CELL }
      continue
    }
    if (last !== undefined && minute < last.end) continue
    runs.push({ date: day, start: minute, end: minute + CELL })
  }
  return runs
}

/** Every minute a record covers. */
export function minutesOfRecord(record: DayRecord): number[] {
  const minutes: number[] = []
  for (let minute = snapDown(record.start); minute < record.end; minute += CELL) minutes.push(minute)
  return minutes
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} 分`
  const hours = Math.floor(minutes / 60)
  return minutes % 60 === 0 ? `${hours} 小时` : `${hours} 小时 ${minutes % 60} 分`
}

export const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/**
 * Convert a (Chinese) tag name to its pinyin initials in uppercase.
 * 深度工作 → SDGZ, 用餐 → YC, Work → W. Used for compact block labels.
 */
export function tagInitials(name: string): string {
  const letters = pinyin(name, { pattern: 'first', type: 'array' })
    .filter(item => item.length > 0)
    .map(item => item[0].toUpperCase())
  return letters.join('') || name
}

/**
 * The pure date/time toolkit as one object. Fixtures, tests and boundary code
 * reuse it instead of copying date math or depending on an internal module.
 */
export const timeMath = {
  CELL,
  PER_HOUR,
  MIN_ROW_H,
  MAX_ROW_H,
  WEEKDAY_LABELS,
  clock,
  localDate,
  addDays,
  timeZoneOf,
  formatDateLabel,
  weekdayOf,
  weekStartOf,
  snapDown,
  snapUp,
  localDateOf,
  minuteOf,
  atMinute,
  recordsOfDay,
  recordAt,
  runsOf,
  minutesOfRecord,
  durationLabel,
  tagInitials,
}
