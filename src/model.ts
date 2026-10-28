export interface TimeCategory {
  readonly id: string
  readonly parentId: string | null
  readonly name: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface TimeRange {
  readonly startAt: string
  readonly endAt: string
  readonly timeZone: string
}

export type ActionStatus = 'active' | 'completed' | 'dropped'
export type ActualSource = 'user_reported' | 'agent_observed' | 'imported'
export type TimeUse = 'dedicated' | 'parallel'

export interface Action {
  readonly id: string
  readonly parentId: string | null
  readonly title: string
  readonly note?: string
  readonly timeCategoryId?: string
  readonly estimatedMinutes?: number
  readonly planned?: TimeRange
  readonly actual?: TimeRange
  readonly actualSource?: ActualSource
  readonly status: ActionStatus
  readonly use: TimeUse
  readonly preparationReminderId?: string
  readonly preparationResultRef?: string
  readonly createdAt: string
  readonly updatedAt: string
}

export function normalizeName(raw: unknown, label: string): string {
  if (typeof raw !== 'string') throw new Error(`secretary: ${label} must be a string`)
  const name = raw.trim()
  if (name === '') throw new Error(`secretary: ${label} must not be empty`)
  if (name.length > 120) throw new Error(`secretary: ${label} must be at most 120 characters`)
  return name
}

function objectOf(raw: unknown, label: string): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`secretary: ${label} must be an object`)
  }
  return raw as Record<string, unknown>
}

function validDateString(raw: unknown): raw is string {
  return typeof raw === 'string' && Number.isFinite(Date.parse(raw))
}

function validCalendarDate(iso: string): boolean {
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  const day = Number(iso.slice(8, 10))
  const date = new Date(Date.UTC(0, month - 1, day))
  date.setUTCFullYear(year)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function parseTimeRange(raw: unknown, label = 'time range'): TimeRange {
  const value = objectOf(raw, label)
  const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/
  for (const key of ['startAt', 'endAt'] as const) {
    if (typeof value[key] !== 'string' || !instant.test(value[key]) || !validCalendarDate(value[key]) || !validDateString(value[key])) {
      throw new Error(`secretary: ${label} ${key} must be an ISO time with an explicit offset`)
    }
  }
  if (Date.parse(value.endAt as string) <= Date.parse(value.startAt as string)) {
    throw new Error(`secretary: ${label} endAt must be after startAt`)
  }
  if (typeof value.timeZone !== 'string') throw new Error(`secretary: ${label} timeZone must be a string`)
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value.timeZone }).format()
  } catch {
    throw new Error(`secretary: ${label} has an invalid timeZone`)
  }
  return { startAt: value.startAt as string, endAt: value.endAt as string, timeZone: value.timeZone }
}

export function parseTimeCategory(raw: unknown): TimeCategory {
  const value = objectOf(raw, 'time category')
  if (typeof value.id !== 'string' || value.id === '') throw new Error('secretary: time category needs a string id')
  if (typeof value.parentId !== 'string' && value.parentId !== null) {
    throw new Error(`secretary: time category ${value.id} needs a string parentId or null`)
  }
  normalizeName(value.name, 'time category name')
  for (const key of ['createdAt', 'updatedAt'] as const) {
    if (!validDateString(value[key])) throw new Error(`secretary: time category ${value.id} needs a valid ${key}`)
  }
  return value as unknown as TimeCategory
}

export function parseAction(raw: unknown): Action {
  const value = objectOf(raw, 'action')
  if (typeof value.id !== 'string' || value.id === '') throw new Error('secretary: action needs a string id')
  if (typeof value.parentId !== 'string' && value.parentId !== null) {
    throw new Error(`secretary: action ${value.id} needs a string parentId or null`)
  }
  normalizeName(value.title, 'action title')
  for (const key of ['note', 'timeCategoryId', 'preparationReminderId', 'preparationResultRef'] as const) {
    if (value[key] !== undefined && typeof value[key] !== 'string') {
      throw new Error(`secretary: action ${value.id} field ${key} must be a string`)
    }
  }
  if (value.estimatedMinutes !== undefined
    && (typeof value.estimatedMinutes !== 'number' || !Number.isSafeInteger(value.estimatedMinutes) || value.estimatedMinutes <= 0)) {
    throw new Error(`secretary: action ${value.id} estimatedMinutes must be a positive integer`)
  }
  const planned = value.planned === undefined ? undefined : parseTimeRange(value.planned, 'planned')
  const actual = value.actual === undefined ? undefined : parseTimeRange(value.actual, 'actual')
  if ((planned !== undefined || actual !== undefined) && typeof value.timeCategoryId !== 'string') {
    throw new Error(`secretary: action ${value.id} needs timeCategoryId when it has a time range`)
  }
  if (actual !== undefined && !['user_reported', 'agent_observed', 'imported'].includes(value.actualSource as string)) {
    throw new Error(`secretary: action ${value.id} needs a valid actualSource`)
  }
  if (actual === undefined && value.actualSource !== undefined) {
    throw new Error(`secretary: action ${value.id} actualSource requires actual time`)
  }
  if (!['active', 'completed', 'dropped'].includes(value.status as string)) {
    throw new Error(`secretary: action ${value.id} has an invalid status`)
  }
  if (!['dedicated', 'parallel'].includes(value.use as string)) {
    throw new Error(`secretary: action ${value.id} has an invalid use`)
  }
  for (const key of ['createdAt', 'updatedAt'] as const) {
    if (!validDateString(value[key])) throw new Error(`secretary: action ${value.id} needs a valid ${key}`)
  }
  const result = { ...value, planned, actual } as Record<string, unknown>
  for (const key of Object.keys(result)) {
    if (result[key] === undefined) delete result[key]
  }
  return result as unknown as Action
}
