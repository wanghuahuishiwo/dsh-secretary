export function objectOf(raw: unknown, label: string): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`secretary: ${label} must be an object`)
  }
  return raw as Record<string, unknown>
}

export function normalizeName(raw: unknown, label: string): string {
  if (typeof raw !== 'string') throw new Error(`secretary: ${label} must be a string`)
  const name = raw.trim()
  if (name === '') throw new Error(`secretary: ${label} must not be empty`)
  if (name.length > 120) throw new Error(`secretary: ${label} must be at most 120 characters`)
  return name
}

function validCalendarDate(iso: string): boolean {
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  const day = Number(iso.slice(8, 10))
  const date = new Date(Date.UTC(0, month - 1, day))
  date.setUTCFullYear(year)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function parseInstant(raw: unknown, label: string): string {
  if (typeof raw !== 'string') throw new Error(`secretary: ${label} must be an ISO time with an explicit offset`)
  const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/
  if (!instant.test(raw) || !validCalendarDate(raw) || !Number.isFinite(Date.parse(raw))) {
    throw new Error(`secretary: ${label} must be an ISO time with an explicit offset`)
  }
  return raw
}

export interface TimeRange {
  readonly startAt: string
  readonly endAt: string
  readonly timeZone: string
}

export function parseTimeRange(raw: unknown, label = 'time range'): TimeRange {
  const value = objectOf(raw, label)
  const startAt = parseInstant(value.startAt, `${label}.startAt`)
  const endAt = parseInstant(value.endAt, `${label}.endAt`)
  if (Date.parse(endAt) <= Date.parse(startAt)) {
    throw new Error(`secretary: ${label}.endAt must be after startAt`)
  }
  if (typeof value.timeZone !== 'string') throw new Error(`secretary: ${label}.timeZone must be a string`)
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value.timeZone }).format()
  } catch {
    throw new Error(`secretary: ${label}.timeZone is invalid`)
  }
  return { startAt, endAt, timeZone: value.timeZone }
}

export function withoutUndefined<Value extends Record<string, unknown>>(value: Value): Value {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Value
}

export function optionalString(raw: unknown, label: string): string | undefined {
  if (raw === undefined) return undefined
  if (typeof raw !== 'string') throw new Error(`secretary: ${label} must be a string`)
  return raw
}
