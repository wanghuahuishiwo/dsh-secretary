import { runSecretaryCommand } from './commands.ts'
import type { SecretaryStore } from './store.ts'

interface ToolHost {
  tools: { register(definition: unknown): unknown }
  effect(register: () => unknown, label: string): void
}

const OUTPUT = {
  schema: { type: 'object' },
  render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }],
}

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })
const TIME_RANGE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    startAt: { type: 'string', description: 'ISO time with an explicit offset.' },
    endAt: { type: 'string', description: 'ISO time with an explicit offset, after startAt.' },
    timeZone: { type: 'string', description: 'IANA time zone, for example Asia/Shanghai.' },
  },
  required: ['startAt', 'endAt', 'timeZone'],
}
const ACTUAL_SOURCE = { type: 'string', enum: ['user_reported', 'agent_observed', 'imported'] }
const USE = { type: 'string', enum: ['dedicated', 'parallel'] }
const STATUS = { type: 'string', enum: ['active', 'completed', 'dropped'] }

function operation(op: string, properties: Record<string, unknown>, required: string[] = []) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: { op: { const: op }, ...properties },
    required: ['op', ...required],
  }
}

const ID = { id: { type: 'string' } }
const ACTION_CREATE = {
  parentId: nullable({ type: 'string' }),
  title: { type: 'string' },
  note: { type: 'string' },
  timeCategoryId: { type: 'string' },
  estimatedMinutes: { type: 'integer', minimum: 1 },
  planned: TIME_RANGE,
  actual: TIME_RANGE,
  actualSource: ACTUAL_SOURCE,
  use: USE,
  preparationReminderId: { type: 'string' },
  preparationResultRef: { type: 'string' },
}
const ACTION_UPDATE = {
  parentId: nullable({ type: 'string' }),
  title: { type: 'string' },
  note: nullable({ type: 'string' }),
  timeCategoryId: nullable({ type: 'string' }),
  estimatedMinutes: nullable({ type: 'integer', minimum: 1 }),
  planned: nullable(TIME_RANGE),
  actual: nullable(TIME_RANGE),
  actualSource: nullable(ACTUAL_SOURCE),
  status: STATUS,
  use: USE,
  preparationReminderId: nullable({ type: 'string' }),
  preparationResultRef: nullable({ type: 'string' }),
}
const ACTION_LIST = {
  parentId: nullable({ type: 'string' }),
  status: STATUS,
  timeCategoryId: { type: 'string' },
  timeKind: { type: 'string', enum: ['planned', 'actual'] },
  from: { type: 'string' },
  to: { type: 'string' },
}

export function registerAgentTools(ctx: ToolHost, store: SecretaryStore): void {
  ctx.effect(() => ctx.tools.register({
    name: 'secretary_action',
    description: 'Read and mutate the Action tree. Each concrete occurrence is its own child Action with optional planned and actual time. '
      + 'Changing planned never changes actual. Completing a child never completes its parent. Preparing an Action must not write actual or complete it.',
    parameters: {
      type: 'object',
      oneOf: [
        operation('list', ACTION_LIST),
        operation('get', ID, ['id']),
        operation('create', ACTION_CREATE, ['title']),
        operation('update', { ...ID, ...ACTION_UPDATE }, ['id']),
        operation('complete', { ...ID, actual: TIME_RANGE, actualSource: ACTUAL_SOURCE }, ['id']),
        operation('delete', ID, ['id']),
      ],
    },
    output: OUTPUT,
    execute: async (args: unknown) => {
      const value = args as Record<string, unknown>
      return runSecretaryCommand(store, { ...value, op: `action.${String(value.op)}` })
    },
  }), 'secretary: action tool')

  ctx.effect(() => ctx.tools.register({
    name: 'secretary_time_category',
    description: 'Read and mutate two-level TimeCategory records. TimeCategory describes the kind of time and is independent from Action ownership.',
    parameters: {
      type: 'object',
      oneOf: [
        operation('list', {}),
        operation('get', ID, ['id']),
        operation('create', { parentId: nullable({ type: 'string' }), name: { type: 'string' } }, ['name']),
        operation('update', { ...ID, name: { type: 'string' } }, ['id', 'name']),
        operation('delete', ID, ['id']),
      ],
    },
    output: OUTPUT,
    execute: async (args: unknown) => {
      const value = args as Record<string, unknown>
      return runSecretaryCommand(store, { ...value, op: `timeCategory.${String(value.op)}` })
    },
  }), 'secretary: time category tool')
}
