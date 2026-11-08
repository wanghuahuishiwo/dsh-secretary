import { Service, type Context } from '@deepseek-ai/cordis'

/**
 * Shared upstream Goal capability.
 *
 * The product architecture makes Time, GTD, and future products consumers of
 * Goal. The Goal model is not designed yet, so this interface deliberately has
 * no fields or methods: it establishes the service seam, not a fake goal model.
 */
export abstract class GoalService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'goals')
  }
}
