import type { Context } from '@deepseek-ai/cordis'
import type { TagService } from 'dsh-secretary-tag/contract'
import type { GtdService } from 'dsh-secretary-gtd/contract'
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
  gtd: GtdService
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
  if (input.domain === 'gtd') {
    switch (input.op) {
      case 'inbox.capture': return { item: await ctx.gtd.captureInbox(input) }
      case 'inbox.clarify': return ctx.gtd.clarifyInbox(input)
      case 'inbox.delete': return { item: await ctx.gtd.deleteInbox(input.id) }
      case 'project.create': return { project: await ctx.gtd.createProject(input) }
      case 'project.update': return { project: await ctx.gtd.updateProject(input.id, input) }
      case 'project.delete': return { project: await ctx.gtd.deleteProject(input.id) }
      case 'action.create': return { action: await ctx.gtd.createAction(input) }
      case 'action.update': return { action: await ctx.gtd.updateAction(input.id, input) }
      case 'action.delete': return { action: await ctx.gtd.deleteAction(input.id) }
      case 'action.complete': return { action: await ctx.gtd.completeAction(input.id, input.completedAt) }
      case 'action.drop': return { action: await ctx.gtd.dropAction(input.id, input.droppedAt) }
      default: throw new Error(`secretary: unsupported panel gtd operation ${JSON.stringify(input.op)}`)
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
      case 'deep.setCell': return { week: await ctx.time.setDeepCell(input) }
      case 'deep.clearCell': return { week: await ctx.time.clearDeepCell(input) }
      case 'deep.setRange': return { week: await ctx.time.setDeepRange(input) }
      case 'deep.clearRange': return { week: await ctx.time.clearDeepRange(input) }
      default: throw new Error(`secretary: unsupported panel time operation ${JSON.stringify(input.op)}`)
    }
  }
  throw new Error('secretary: panel command domain must be gtd, tag, or time')
}

export const name = 'dsh-secretary-panel'
export const inject = ['connection', 'tags', 'gtd', 'time']

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
        const forecastDate = url.searchParams.get('forecastDate') ?? date
        if (date === undefined || timeZone === undefined) throw new Error('secretary: panel state requires date and timeZone')
        const [tags, blocks, plans, templates, templateUndo, deepWeek, inbox, projects, actions, nextActions, forecast] = await Promise.all([
          ctx.tags.listTags(),
          ctx.time.listActual({ date, timeZone }),
          ctx.time.listPlan({ date, timeZone }),
          ctx.time.listPlanTemplate(),
          ctx.time.canUndoPlanTemplate({ targetDate: date, timeZone }),
          ctx.time.getDeepWeek(),
          ctx.gtd.listInbox(),
          ctx.gtd.listProjects(),
          ctx.gtd.listActions(),
          ctx.gtd.listNextActions(),
          ctx.gtd.listForecast({ date: forecastDate, timeZone }),
        ])
        return json({ tags, blocks, plans, templates, templateUndo, deepWeek, inbox, projects, actions, nextActions, forecast })
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
