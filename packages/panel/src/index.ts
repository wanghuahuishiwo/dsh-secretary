import type { Context } from '@deepseek-ai/cordis'
import type { TagService } from 'dsh-secretary-tag/contract'
import type { TimeService } from 'dsh-secretary-time-block/contract'

export const STATE_PATH = '/api/secretary.state'
export const COMMAND_PATH = '/api/secretary.command'

interface Route {
  path: string
  methods: string[]
  requestBody: 'buffered'
  fetch(request: Request): Promise<Response>
}

interface PanelContext extends Context {
  connection: { fetch: { register(route: Route): () => void } }
  tags: TagService
  time: TimeService
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function command(ctx: PanelContext, raw: unknown): Promise<unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('secretary: panel command must be an object')
  const input = raw as Record<string, any>
  if (input.domain === 'tag') {
    switch (input.op) {
      case 'create': return { tag: await ctx.tags.createTag(input) }
      case 'update': return { tag: await ctx.tags.updateTag(input.id, input) }
      case 'move': return { tag: await ctx.tags.moveTag(input.id, input.parentId) }
      case 'delete': return { tag: await ctx.tags.deleteTag(input.id) }
      default: throw new Error(`secretary: unsupported panel tag operation ${JSON.stringify(input.op)}`)
    }
  }
  if (input.domain === 'time') {
    switch (input.op) {
      case 'plan.create': return { block: await ctx.time.createPlan(input) }
      case 'plan.update': return { block: await ctx.time.updatePlan(input.id, input) }
      case 'plan.delete': return { block: await ctx.time.deletePlan(input.id) }
      case 'template.create': return { block: await ctx.time.createPlanTemplate(input) }
      case 'template.update': return { block: await ctx.time.updatePlanTemplate(input.id, input) }
      case 'template.delete': return { block: await ctx.time.deletePlanTemplate(input.id) }
      case 'template.apply': return { blocks: await ctx.time.applyPlanTemplate(input) }
      case 'template.undo': return { blocks: await ctx.time.undoPlanTemplate(input) }
      case 'actual.create': return { block: await ctx.time.createActual(input) }
      case 'actual.update': return { block: await ctx.time.updateActual(input.id, input) }
      case 'actual.delete': return { block: await ctx.time.deleteActual(input.id) }
      case 'actual.start': return { block: await ctx.time.startActual(input) }
      case 'actual.stop': return { block: await ctx.time.stopActual(input.id, input.endAt) }
      default: throw new Error(`secretary: unsupported panel time operation ${JSON.stringify(input.op)}`)
    }
  }
  throw new Error('secretary: panel command domain must be tag or time')
}

export const name = 'dsh-secretary-panel'
export const inject = ['connection', 'tags', 'time']

export function apply(context: Context): void {
  const ctx = context as PanelContext
  ctx.effect(() => ctx.connection.fetch.register({
    path: STATE_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async request => {
      try {
        const url = new URL(request.url)
        const date = url.searchParams.get('date') ?? undefined
        const timeZone = url.searchParams.get('timeZone') ?? undefined
        const [tags, blocks, plans, templates, templateUndo] = await Promise.all([
          ctx.tags.listTags(),
          ctx.time.listActual({ date, timeZone }),
          ctx.time.listPlan({ date, timeZone }),
          ctx.time.listPlanTemplate(),
          date === undefined ? false : ctx.time.canUndoPlanTemplate({ targetDate: date, timeZone: timeZone ?? 'Asia/Shanghai' }),
        ])
        return json({ tags, blocks, plans, templates, templateUndo })
      } catch (error) {
        return json({ error: errorMessage(error) }, 400)
      }
    },
  }), 'secretary: panel state route')

  ctx.effect(() => ctx.connection.fetch.register({
    path: COMMAND_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async request => {
      try {
        return json(await command(ctx, await request.json()))
      } catch (error) {
        return json({ error: errorMessage(error) }, 400)
      }
    },
  }), 'secretary: panel command route')
}
