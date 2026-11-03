import type { Context } from '@deepseek-ai/cordis'
import type { GtdService } from './contract.ts'
import { noConfig, OUTPUT, registerTool } from 'dsh-secretary-core/tooling'

export interface Config {}
export const Config = noConfig('dsh-secretary-gtd-tools')
export const name = 'dsh-secretary-gtd-tools'
export const inject = ['tools', 'gtd']

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })
const PROJECT = {
  type: 'object', additionalProperties: false,
  properties: {
    title: { type: 'string' }, outcome: { type: 'string' },
    type: { type: 'string', enum: ['parallel', 'sequential', 'single_action_list'] },
  },
  required: ['title', 'outcome', 'type'],
}
const ACTION = {
  type: 'object', additionalProperties: false,
  properties: {
    title: { type: 'string' }, note: { type: 'string' },
    deferAt: { type: 'string' }, dueAt: { type: 'string' },
    estimatedMinutes: { type: 'integer', minimum: 1 },
  },
  required: ['title'],
}

export function apply(ctx: Context): void {
  const gtd = () => (ctx as Context & { gtd: GtdService }).gtd
  registerTool(ctx, {
    name: 'secretary_gtd',
    description: 'Capture and clarify GTD inbox items, and inspect or complete Projects and Actions. Use op=inbox.capture with title/raw/source; op=inbox.clarify with id/project/action; other ops use their named fields. For action.update, always put changes directly at the top level; never nest preparation fields or other updates under action. Capture is separate from clarification. Availability is derived; Completed is distinct from actual work time.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        op: {
          type: 'string',
          enum: [
            'inbox.capture', 'inbox.list', 'inbox.clarify', 'project.list',
            'action.list', 'action.get', 'action.update', 'action.complete',
          ],
        },
        id: { type: 'string' },
        title: { type: 'string' },
        raw: { type: 'string' },
        source: { type: 'string' },
        project: PROJECT,
        action: ACTION,
        note: nullable({ type: 'string' }),
        deferAt: nullable({ type: 'string' }),
        dueAt: nullable({ type: 'string' }),
        estimatedMinutes: nullable({ type: 'integer', minimum: 1 }),
        preparationReminderId: nullable({ type: 'string' }),
        preparationResultRef: nullable({ type: 'string' }),
        completedAt: { type: 'string' },
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
        case 'project.list': return { projects: await gtd().listProjects() }
        case 'action.list': return { actions: await gtd().listActions() }
        case 'action.get': return { action: await gtd().getAction(args.id) }
        case 'action.update':
          if (Object.hasOwn(args, 'action')) {
            throw new Error('secretary: action.update fields must be top-level; do not nest updates under action')
          }
          return { action: await gtd().updateAction(args.id, args) }
        case 'action.complete': return { action: await gtd().completeAction(args.id, args.completedAt) }
        default: throw new Error(`secretary: unknown gtd operation ${JSON.stringify(args.op)}`)
      }
    },
  })
}
