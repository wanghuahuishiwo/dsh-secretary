import type { TimeRun } from './types.ts'

export const CELL_MINUTES = 10
export const CELLS_PER_HOUR = 6
export const MINUTES_PER_DAY = 24 * 60

export function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00`)
  value.setDate(value.getDate() + amount)
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

export function formatDateLabel(date: string): string {
  const value = new Date(`${date}T12:00:00`)
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][value.getDay()]
  return `${value.getMonth() + 1}月${value.getDate()}日 ${weekday}`
}

export function formatClock(minute: number): string {
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分`
}

export function runsOfSelection(date: string, selected: ReadonlySet<number>): TimeRun[] {
  const sorted = [...selected].sort((left, right) => left - right)
  const runs: TimeRun[] = []
  for (const minute of sorted) {
    const previous = runs[runs.length - 1]
    if (previous !== undefined && previous.end === minute) {
      runs[runs.length - 1] = { ...previous, end: minute + CELL_MINUTES }
    } else {
      runs.push({ date, start: minute, end: minute + CELL_MINUTES })
    }
  }
  return runs
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
