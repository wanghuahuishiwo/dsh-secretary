import { Service, type Context } from '@deepseek-ai/cordis'

/**
 * Emitted after every successfully persisted Time mutation (plans, actuals,
 * templates, deep cells, reload) so in-process consumers — the Remote watch
 * stream — can push a re-read mark without polling.
 */
declare module '@deepseek-ai/cordis' {
  interface Events {
    'secretary/time-changed': () => void
  }
}

export type ActualSource = 'user_reported' | 'agent_observed' | 'imported'
export const FOCUS_LEVELS = ['deep', 'shallow'] as const
export type FocusLevel = (typeof FOCUS_LEVELS)[number]
export const FOCUS_LABELS: Record<FocusLevel, string> = { deep: '深度', shallow: '浅层' }

export function isFocusLevel(raw: unknown): raw is FocusLevel {
  return typeof raw === 'string' && (FOCUS_LEVELS as readonly string[]).includes(raw)
}

export type DeepLevel = 'high' | 'medium' | 'low'
export type DeepCellLevel = DeepLevel | 'unset'

export interface DeepCell {
  readonly weekday: number
  readonly hour: number
  readonly level: DeepCellLevel
}

export type DeepWeekSource = 'own' | 'inherited' | 'seed'
export interface DeepWeek {
  readonly weekStart: string
  readonly source: DeepWeekSource
  readonly cells: readonly DeepCell[]
}

export interface DeepWeekQuery {
  readonly weekStart: string
}

export interface DeepCellPosition {
  readonly weekStart: string
  readonly weekday: number
  readonly hour: number
}

export interface SetDeepCellInput extends DeepCellPosition {
  readonly level: DeepLevel
}

export interface DeepRange {
  readonly weekStart: string
  readonly startWeekday: number
  readonly startHour: number
  readonly endWeekday: number
  readonly endHour: number
}

export interface SetDeepRangeInput extends DeepRange {
  readonly level: DeepLevel
}

export interface TimeBlockContent {
  readonly timeTagId: number
  readonly note?: string
}

export interface PlanTemplateBlock extends TimeBlockContent {
  readonly id: number
  readonly weekday: number
  readonly startTime: string
  readonly endTime: string
}

export interface CreatePlanTemplateInput extends TimeBlockContent {
  readonly weekday: number
  readonly startTime: string
  readonly endTime: string
}

export interface UpdatePlanTemplateInput {
  readonly timeTagId?: number
  readonly note?: string | null
  readonly weekday?: number
  readonly startTime?: string
  readonly endTime?: string
}

export interface ListPlanTemplateQuery {
  readonly weekday?: number
}

export interface ApplyPlanTemplateInput {
  readonly weekday: number
  readonly targetDate: string
  readonly timeZone: string
}

export interface UndoPlanTemplateInput {
  readonly targetDate: string
  readonly timeZone: string
}

export interface PlanBlock extends TimeBlockContent {
  readonly id: number
  readonly startAt: string
  readonly endAt: string
}

export interface CreatePlanInput extends TimeBlockContent {
  readonly date: string
  readonly timeZone: string
  readonly startAt: string
  readonly endAt: string
}

export interface UpdatePlanInput {
  readonly timeTagId?: number
  readonly note?: string | null
  readonly startAt?: string
  readonly endAt?: string
}

export interface ListPlanQuery {
  readonly date?: string
  readonly timeZone?: string
  readonly timeTagId?: number
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

  abstract createPlanTemplate(input: CreatePlanTemplateInput): Promise<PlanTemplateBlock>
  abstract listPlanTemplate(query?: ListPlanTemplateQuery): Promise<PlanTemplateBlock[]>
  abstract updatePlanTemplate(id: number, input: UpdatePlanTemplateInput): Promise<PlanTemplateBlock>
  abstract deletePlanTemplate(id: number): Promise<PlanTemplateBlock>
  abstract applyPlanTemplate(input: ApplyPlanTemplateInput): Promise<PlanBlock[]>
  abstract undoPlanTemplate(input: UndoPlanTemplateInput): Promise<PlanBlock[]>
  abstract canUndoPlanTemplate(input: UndoPlanTemplateInput): Promise<boolean>
  abstract createPlan(input: CreatePlanInput): Promise<PlanBlock>
  abstract getPlan(id: number): Promise<PlanBlock>
  abstract listPlan(query?: ListPlanQuery): Promise<PlanBlock[]>
  abstract updatePlan(id: number, input: UpdatePlanInput): Promise<PlanBlock>
  abstract deletePlan(id: number): Promise<PlanBlock>
  abstract createActual(input: CreateActualInput): Promise<ActualBlock>
  abstract getActual(id: number): Promise<ActualBlock>
  abstract listActual(query?: ListActualQuery): Promise<ActualBlock[]>
  abstract updateActual(id: number, input: UpdateActualInput): Promise<ActualBlock>
  abstract deleteActual(id: number): Promise<ActualBlock>
  abstract startActual(input: StartActualInput): Promise<ActualBlock>
  abstract stopActual(id: number, endAt?: string): Promise<ActualBlock>
  abstract getDeepWeek(query: DeepWeekQuery): Promise<DeepWeek>
  abstract setDeepCell(input: SetDeepCellInput): Promise<DeepWeek>
  abstract clearDeepCell(input: DeepCellPosition): Promise<DeepWeek>
  abstract setDeepRange(input: SetDeepRangeInput): Promise<DeepWeek>
  abstract clearDeepRange(input: DeepRange): Promise<DeepWeek>
  /** Re-read persisted plans, actuals, and templates; no host restart. */
  abstract reload(): Promise<void>
}
