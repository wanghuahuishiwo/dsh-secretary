import type { ActualSource, TimeRange } from './model.ts'
import type { ActionListFilter, CreateActionInput, SecretaryStore, UpdateActionInput } from './store.ts'

export type SecretaryCommand =
  | { readonly op: 'timeCategory.list' }
  | { readonly op: 'timeCategory.get'; readonly id: string }
  | { readonly op: 'timeCategory.create'; readonly parentId?: string | null; readonly name: string }
  | { readonly op: 'timeCategory.update'; readonly id: string; readonly name: string }
  | { readonly op: 'timeCategory.delete'; readonly id: string }
  | { readonly op: 'action.get'; readonly id: string }
  | { readonly op: 'action.list'; readonly filter?: ActionListFilter }
  | ({ readonly op: 'action.create' } & CreateActionInput)
  | { readonly op: 'action.update'; readonly id: string; readonly input: UpdateActionInput }
  | { readonly op: 'action.complete'; readonly id: string; readonly actual?: TimeRange; readonly actualSource?: ActualSource }
  | { readonly op: 'action.delete'; readonly id: string }

function objectOf(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('secretary: command must be an object')
  }
  return raw as Record<string, unknown>
}

function stringField(value: Record<string, unknown>, key: string): string {
  if (typeof value[key] !== 'string') throw new Error(`secretary: ${key} must be a string`)
  return value[key] as string
}

function optionalParent(value: Record<string, unknown>): string | null | undefined {
  if (value.parentId !== undefined && typeof value.parentId !== 'string' && value.parentId !== null) {
    throw new Error('secretary: parentId must be a string or null')
  }
  return value.parentId as string | null | undefined
}

const COMMAND_FIELDS: Record<string, readonly string[]> = {
  'timeCategory.list': ['op'],
  'timeCategory.get': ['op', 'id'],
  'timeCategory.create': ['op', 'parentId', 'name'],
  'timeCategory.update': ['op', 'id', 'name'],
  'timeCategory.delete': ['op', 'id'],
  'action.get': ['op', 'id'],
  'action.list': ['op', 'parentId', 'status', 'timeCategoryId', 'timeKind', 'from', 'to'],
  'action.create': [
    'op', 'parentId', 'title', 'note', 'timeCategoryId', 'estimatedMinutes', 'planned', 'actual',
    'actualSource', 'use', 'preparationReminderId', 'preparationResultRef',
  ],
  'action.update': [
    'op', 'id', 'parentId', 'title', 'note', 'timeCategoryId', 'estimatedMinutes', 'planned', 'actual',
    'actualSource', 'status', 'use', 'preparationReminderId', 'preparationResultRef',
  ],
  'action.complete': ['op', 'id', 'actual', 'actualSource'],
  'action.delete': ['op', 'id'],
}

export function parseSecretaryCommand(raw: unknown): SecretaryCommand {
  const value = objectOf(raw)
  const fields = COMMAND_FIELDS[String(value.op)]
  if (fields === undefined) throw new Error(`secretary: unknown operation ${JSON.stringify(value.op)}`)
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) throw new Error(`secretary: unknown field "${key}" for ${String(value.op)}`)
  }
  switch (value.op) {
    case 'timeCategory.list':
      return { op: value.op }
    case 'timeCategory.get':
    case 'timeCategory.delete':
      return { op: value.op, id: stringField(value, 'id') }
    case 'timeCategory.create':
      return { op: value.op, name: stringField(value, 'name'), parentId: optionalParent(value) }
    case 'timeCategory.update':
      return { op: value.op, id: stringField(value, 'id'), name: stringField(value, 'name') }
    case 'action.get':
    case 'action.delete':
      return { op: value.op, id: stringField(value, 'id') }
    case 'action.list':
      if (value.timeKind !== undefined && !['planned', 'actual'].includes(value.timeKind as string)) {
        throw new Error('secretary: timeKind is invalid')
      }
      if (value.status !== undefined && !['active', 'completed', 'dropped'].includes(value.status as string)) {
        throw new Error('secretary: status is invalid')
      }
      return {
        op: value.op,
        filter: {
          parentId: optionalParent(value),
          status: value.status as ActionListFilter['status'],
          timeCategoryId: value.timeCategoryId as string | undefined,
          timeKind: value.timeKind as 'planned' | 'actual' | undefined,
          from: value.from as string | undefined,
          to: value.to as string | undefined,
        },
      }
    case 'action.create':
      return {
        op: value.op,
        title: stringField(value, 'title'),
        parentId: optionalParent(value),
        note: value.note as string | undefined,
        timeCategoryId: value.timeCategoryId as string | undefined,
        estimatedMinutes: value.estimatedMinutes as number | undefined,
        planned: value.planned as TimeRange | undefined,
        actual: value.actual as TimeRange | undefined,
        actualSource: value.actualSource as ActualSource | undefined,
        use: value.use as CreateActionInput['use'],
        preparationReminderId: value.preparationReminderId as string | undefined,
        preparationResultRef: value.preparationResultRef as string | undefined,
      }
    case 'action.update':
      return {
        op: value.op,
        id: stringField(value, 'id'),
        input: {
          parentId: optionalParent(value),
          title: value.title as string | undefined,
          note: value.note as string | null | undefined,
          timeCategoryId: value.timeCategoryId as string | null | undefined,
          estimatedMinutes: value.estimatedMinutes as number | null | undefined,
          planned: value.planned as TimeRange | null | undefined,
          actual: value.actual as TimeRange | null | undefined,
          actualSource: value.actualSource as ActualSource | null | undefined,
          status: value.status as UpdateActionInput['status'],
          use: value.use as UpdateActionInput['use'],
          preparationReminderId: value.preparationReminderId as string | null | undefined,
          preparationResultRef: value.preparationResultRef as string | null | undefined,
        },
      }
    case 'action.complete':
      if (value.actualSource !== undefined
        && !['user_reported', 'agent_observed', 'imported'].includes(value.actualSource as string)) {
        throw new Error('secretary: actualSource is invalid')
      }
      return {
        op: value.op,
        id: stringField(value, 'id'),
        actual: value.actual as TimeRange | undefined,
        actualSource: value.actualSource as ActualSource | undefined,
      }
    default:
      throw new Error(`secretary: unknown operation ${JSON.stringify(value.op)}`)
  }
}

export async function runSecretaryCommand(store: SecretaryStore, raw: unknown): Promise<unknown> {
  const command = parseSecretaryCommand(raw)
  switch (command.op) {
    case 'timeCategory.list':
      return { categories: store.listTimeCategories() }
    case 'timeCategory.get':
      return { category: store.getTimeCategory(command.id) }
    case 'timeCategory.create':
      return { category: await store.createTimeCategory(command) }
    case 'timeCategory.update':
      return { category: await store.updateTimeCategory(command.id, command) }
    case 'timeCategory.delete':
      await store.deleteTimeCategory(command.id)
      return { id: command.id, deleted: true }
    case 'action.get':
      return store.getAction(command.id)
    case 'action.list':
      return { actions: store.listActions(command.filter ?? {}) }
    case 'action.create':
      return { action: await store.createAction(command) }
    case 'action.update':
      return { action: await store.updateAction(command.id, command.input) }
    case 'action.complete':
      return store.completeAction(command.id, command)
    case 'action.delete':
      await store.deleteAction(command.id)
      return { id: command.id, deleted: true }
  }
}
