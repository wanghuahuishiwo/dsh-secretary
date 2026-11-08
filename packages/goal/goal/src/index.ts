import type { Context } from '@deepseek-ai/cordis'
import { GoalService } from 'dsh-secretary-goal/contract'

/**
 * Empty Goal Provider: lets consumers express and verify their upstream service
 * dependency before Goal facts, storage, tools, or UI exist.
 */
export class EmptyGoalService extends GoalService {}

export const name = 'dsh-secretary-goal'

export function apply(ctx: Context): void {
  ctx.plugin(EmptyGoalService)
}
