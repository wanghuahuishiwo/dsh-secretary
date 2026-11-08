import type { Context } from '@deepseek-ai/cordis'
import type { GtdService } from 'dsh-secretary-gtd-service/contract'
import { noConfig, OUTPUT, registerTool } from 'dsh-secretary-tooling'

export interface Config {}
export const Config = noConfig('dsh-secretary-tool-gtd')
export const name = 'dsh-secretary-tool-gtd'
export const inject = ['tools', 'gtd']

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })
const TAG_IDS = { type: 'array', items: { type: 'integer', minimum: 1 }, uniqueItems: true }
const PROJECT = {
  type: 'object', additionalProperties: false,
  properties: {
    title: { type: 'string' }, outcome: { type: 'string' },
    type: { type: 'string', enum: ['parallel', 'sequential', 'single_action_list'] },
    tagIds: TAG_IDS,
  },
  required: ['title', 'type'],
}
const ACTION = {
  type: 'object', additionalProperties: false,
  properties: {
    title: { type: 'string' }, note: { type: 'string' },
    projectId: { type: 'integer', minimum: 1 }, parentActionId: { type: 'integer', minimum: 1 },
    tagIds: TAG_IDS,
    deferAt: { type: 'string' }, plannedAt: { type: 'string' }, dueAt: { type: 'string' },
    estimatedMinutes: { type: 'integer', minimum: 1 },
  },
  required: ['title'],
}

export function apply(ctx: Context): void {
  const gtd = () => (ctx as Context & { gtd: GtdService }).gtd
  registerTool(ctx, {
    name: 'secretary_gtd',
    description: 'Capture and clarify GTD inbox items, and inspect or complete Projects and Actions. Use op=inbox.capture with title/raw/source; op=inbox.clarify with id/action and optional project (omit project for a standalone root Action). Project tagIds must contain exactly one time Tag; standalone Actions need their own time Tag. Use action.next, action.forecast with date/timeZone, and action.effectiveTags for derived queries. For action.update, put changes at the top level, never nested under action. Availability and effective Tags are derived; Completed is distinct from actual work time.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        op: {
          type: 'string',
          enum: [
            'inbox.capture', 'inbox.list', 'inbox.clarify', 'inbox.delete',
            'project.list', 'project.get', 'project.create', 'project.update', 'project.delete',
            'action.list', 'action.create', 'action.get', 'action.effectiveTags', 'action.next', 'action.forecast', 'action.update', 'action.delete', 'action.complete', 'action.drop',
          ],
        },
        id: { type: 'integer', minimum: 1 },
        title: { type: 'string' },
        raw: { type: 'string' },
        source: { type: 'string' },
        project: PROJECT,
        action: ACTION,
        projectId: { type: 'integer', minimum: 1 },
        parentActionId: { type: 'integer', minimum: 1 },
        note: nullable({ type: 'string' }),
        tagIds: TAG_IDS,
        deferAt: nullable({ type: 'string' }),
        plannedAt: nullable({ type: 'string' }),
        dueAt: nullable({ type: 'string' }),
        estimatedMinutes: nullable({ type: 'integer', minimum: 1 }),
        preparationReminderId: nullable({ type: 'string' }),
        preparationResultRef: nullable({ type: 'string' }),
        completedAt: { type: 'string' },
        droppedAt: { type: 'string' },
        status: { type: 'string', enum: ['active', 'on-hold', 'completed', 'dropped'] },
        type: { type: 'string', enum: ['parallel', 'sequential', 'single_action_list'] },
        outcome: nullable({ type: 'string' }),
        date: { type: 'string' },
        timeZone: { type: 'string' },
      },
      required: ['op'],
    },
    output: OUTPUT,
    async execute(raw: unknown) {
      const args = raw as Record<string, any>
      switch (args.op) {
        case 'inbox.capture': return { item: await gtd().captureInbox(args) }
        case 'inbox.list': return { items: await gtd().listInbox() }
        case 'inbox.clarify': return gtd().clarifyInbox(args)
        case 'inbox.delete': return { item: await gtd().deleteInbox(args.id) }
        case 'project.list': return { projects: await gtd().listProjects() }
        case 'project.get': return { project: await gtd().getProject(args.id) }
        case 'project.create': return { project: await gtd().createProject(args) }
        case 'project.update': return { project: await gtd().updateProject(args.id, args) }
        case 'project.delete': return { project: await gtd().deleteProject(args.id) }
        case 'action.list': return { actions: await gtd().listActions() }
        case 'action.create': return { action: await gtd().createAction(args) }
        case 'action.get': return { action: await gtd().getAction(args.id) }
        case 'action.effectiveTags': return { tagIds: await gtd().getEffectiveTags(args.id) }
        case 'action.next': return { actions: await gtd().listNextActions() }
        case 'action.forecast': return { actions: await gtd().listForecast(args) }
        case 'action.update':
          if (Object.hasOwn(args, 'action')) {
            throw new Error('secretary: action.update fields must be top-level; do not nest updates under action')
          }
          return { action: await gtd().updateAction(args.id, args) }
        case 'action.delete': return { action: await gtd().deleteAction(args.id) }
        case 'action.complete': return { action: await gtd().completeAction(args.id, args.completedAt) }
        case 'action.drop': return { action: await gtd().dropAction(args.id, args.droppedAt) }
        default: throw new Error(`secretary: unknown gtd operation ${JSON.stringify(args.op)}`)
      }
    },
  })
}
