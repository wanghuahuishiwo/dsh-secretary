import { Service, type Context } from '@deepseek-ai/cordis'

export type ActualSource = 'user_reported' | 'agent_observed' | 'imported'
export const FOCUS_LEVELS = ['deep', 'shallow'] as const
export type FocusLevel = (typeof FOCUS_LEVELS)[number]
export const FOCUS_LABELS: Record<FocusLevel, string> = { deep: '深度', shallow: '浅层' }

export function isFocusLevel(raw: unknown): raw is FocusLevel {
  return typeof raw === 'string' && (FOCUS_LEVELS as readonly string[]).includes(raw)
}

export interface TimeBlockContent {
  readonly timeTagId: number
  readonly note?: string
}

export interface ActualBlock extends TimeBlockContent {
  readonly id: number
  readonly startAt: string
  readonly endAt?: string
  readonly actualSource: ActualSource
  readonly focus?: FocusLevel
}

export interface CreateActualInput extends TimeBlockContent {
  readonly startAt: string
  readonly endAt?: string
  readonly actualSource: ActualSource
  readonly focus?: FocusLevel
}

export interface StartActualInput extends TimeBlockContent {
  readonly startAt?: string
  readonly actualSource: ActualSource
  readonly focus?: FocusLevel
}

export interface UpdateActualInput {
  readonly timeTagId?: number
  readonly note?: string | null
  readonly startAt?: string
  readonly endAt?: string | null
  readonly actualSource?: ActualSource
  readonly focus?: FocusLevel | null
}

export interface ListActualQuery {
  readonly date?: string
  readonly timeZone?: string
  readonly from?: string
  readonly to?: string
  readonly timeTagId?: number
}

export abstract class TimeService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'time')
  }

  abstract createActual(input: CreateActualInput): Promise<ActualBlock>
  abstract getActual(id: number): Promise<ActualBlock>
  abstract listActual(query?: ListActualQuery): Promise<ActualBlock[]>
  abstract updateActual(id: number, input: UpdateActualInput): Promise<ActualBlock>
  abstract deleteActual(id: number): Promise<ActualBlock>
  abstract startActual(input: StartActualInput): Promise<ActualBlock>
  abstract stopActual(id: number, endAt?: string): Promise<ActualBlock>
}
