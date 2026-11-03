import { Service, type Context } from '@deepseek-ai/cordis'
import type { TimeRange } from 'dsh-secretary-core/validation'

export type ActualSource = 'user_reported' | 'agent_observed' | 'imported'
export type TimeUse = 'dedicated' | 'parallel'

/**
 * 专注档位：固定封闭枚举，只有深度与浅层两档，没有任何自定义入口。
 * 沿用知识库 2026-10-25 的口径：深度和中度统一叫「深度」，连续性比分级重要。
 * 它描述「这段时间里这个人能专注到什么程度」，用于校准一天中的状态曲线；
 * 不是 lifecycle status（active / completed / dropped），也不表示时间花在哪条线。
 */
export const FOCUS_LEVELS = ['deep', 'shallow'] as const
export type FocusLevel = (typeof FOCUS_LEVELS)[number]

export const FOCUS_LABELS: Record<FocusLevel, string> = {
  deep: '深度',
  shallow: '浅层',
}

export function isFocusLevel(raw: unknown): raw is FocusLevel {
  return typeof raw === 'string' && (FOCUS_LEVELS as readonly string[]).includes(raw)
}

export interface TimeBlock {
  readonly id: string
  readonly actionId: string
  readonly planned: TimeRange
  readonly actual?: TimeRange
  readonly actualSource?: ActualSource
  readonly focus?: FocusLevel
  readonly use: TimeUse
  readonly preparationReminderId?: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CreateTimeBlockInput {
  readonly actionId: string
  readonly planned: TimeRange
  readonly use?: TimeUse
}

export interface UpdateTimeBlockInput {
  readonly planned?: TimeRange
  readonly use?: TimeUse
  readonly preparationReminderId?: string | null
}

export abstract class TimeBlockService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'timeBlocks')
  }

  abstract createBlock(input: CreateTimeBlockInput): Promise<TimeBlock>
  abstract getBlock(id: string): Promise<TimeBlock>
  abstract listBlocks(): Promise<TimeBlock[]>
  abstract updateBlock(id: string, input: UpdateTimeBlockInput): Promise<TimeBlock>
  abstract recordActual(id: string, actual: TimeRange, actualSource: ActualSource, focus?: FocusLevel): Promise<TimeBlock>
}
