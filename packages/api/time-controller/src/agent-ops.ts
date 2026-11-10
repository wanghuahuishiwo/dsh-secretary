import type {
  ApplyPlanTemplateInput, CreateActualInput, CreatePlanInput, CreatePlanTemplateInput,
  DeepCellPosition, DeepRange, DeepWeekQuery, ListActualQuery, ListPlanQuery,
  ListPlanTemplateQuery, SetDeepCellInput, SetDeepRangeInput, StartActualInput, TimeService,
  UndoPlanTemplateInput, UpdateActualInput, UpdatePlanInput, UpdatePlanTemplateInput,
} from 'dsh-secretary-time-block/contract'
import type { CreateTagInput, TagService, UpdateTagInput } from 'dsh-secretary-tag-service/contract'
import type { TagAgentInvoke, TagAgentResult, TimeAgentInvoke, TimeAgentResult } from './types.ts'

/** One `secretary_time` op through the real TimeService; errors keep the Service contract's messages. */
export async function invokeTimeOp(time: TimeService, input: TimeAgentInvoke): Promise<TimeAgentResult> {
  switch (input.op) {
    case 'plan.create': {
      const { op: _op, ...args } = input
      return { block: await time.createPlan(args as CreatePlanInput) }
    }
    case 'plan.get':
      return { block: await time.getPlan(input.id) }
    case 'plan.list': {
      const { op: _op, ...args } = input
      return { blocks: await time.listPlan(args as ListPlanQuery) }
    }
    case 'plan.update': {
      const { op: _op, id, ...args } = input
      return { block: await time.updatePlan(id, args as UpdatePlanInput) }
    }
    case 'plan.delete':
      return { block: await time.deletePlan(input.id) }
    case 'template.list': {
      const { op: _op, ...args } = input
      return { blocks: await time.listPlanTemplate(args as ListPlanTemplateQuery) }
    }
    case 'template.create': {
      const { op: _op, ...args } = input
      return { block: await time.createPlanTemplate(args as CreatePlanTemplateInput) }
    }
    case 'template.update': {
      const { op: _op, id, ...args } = input
      return { block: await time.updatePlanTemplate(id, args as UpdatePlanTemplateInput) }
    }
    case 'template.delete':
      return { block: await time.deletePlanTemplate(input.id) }
    case 'template.apply': {
      const { op: _op, ...args } = input
      return { blocks: await time.applyPlanTemplate(args as ApplyPlanTemplateInput) }
    }
    case 'template.undo': {
      const { op: _op, ...args } = input
      return { blocks: await time.undoPlanTemplate(args as UndoPlanTemplateInput) }
    }
    case 'actual.create': {
      const { op: _op, ...args } = input
      return { block: await time.createActual(args as CreateActualInput) }
    }
    case 'actual.get':
      return { block: await time.getActual(input.id) }
    case 'actual.list': {
      const { op: _op, ...args } = input
      return { blocks: await time.listActual(args as ListActualQuery) }
    }
    case 'actual.update': {
      const { op: _op, id, ...args } = input
      return { block: await time.updateActual(id, args as UpdateActualInput) }
    }
    case 'actual.delete':
      return { block: await time.deleteActual(input.id) }
    case 'actual.start': {
      const { op: _op, ...args } = input
      return { block: await time.startActual(args as StartActualInput) }
    }
    case 'actual.stop':
      return { block: await time.stopActual(input.id, input.endAt) }
    case 'deep.getWeek': {
      const { op: _op, ...args } = input
      return { week: await time.getDeepWeek(args as DeepWeekQuery) }
    }
    case 'deep.setCell': {
      const { op: _op, ...args } = input
      return { week: await time.setDeepCell(args as SetDeepCellInput) }
    }
    case 'deep.clearCell': {
      const { op: _op, ...args } = input
      return { week: await time.clearDeepCell(args as DeepCellPosition) }
    }
    case 'deep.setRange': {
      const { op: _op, ...args } = input
      return { week: await time.setDeepRange(args as SetDeepRangeInput) }
    }
    case 'deep.clearRange': {
      const { op: _op, ...args } = input
      return { week: await time.clearDeepRange(args as DeepRange) }
    }
    case 'reload':
      await time.reload()
      return { reloaded: true }
  }
}

/** One `secretary_tag` op through the real TagService; errors keep the Service contract's messages. */
export async function invokeTagOp(tags: TagService, input: TagAgentInvoke): Promise<TagAgentResult> {
  switch (input.op) {
    case 'create': {
      const { op: _op, ...args } = input
      return { tag: await tags.createTag(args as CreateTagInput) }
    }
    case 'get':
      return { tag: await tags.getTag(input.id) }
    case 'list': {
      const { op: _op, ...args } = input
      return { tags: await tags.listTags(args.kind) }
    }
    case 'update': {
      const { op: _op, id, ...args } = input
      return { tag: await tags.updateTag(id, args as UpdateTagInput) }
    }
    case 'move':
      return { tag: await tags.moveTag(input.id, input.parentId) }
    case 'delete':
      return { tag: await tags.deleteTag(input.id) }
    case 'reload':
      await tags.reload()
      return { reloaded: true }
  }
}
