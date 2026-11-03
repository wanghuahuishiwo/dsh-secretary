import { Service, type Context } from '@deepseek-ai/cordis'

export type ProjectType = 'parallel' | 'sequential' | 'single_action_list'
export type ProjectStatus = 'active' | 'on-hold' | 'completed' | 'dropped'
export type ActionStatus = 'active' | 'completed' | 'dropped'
export type Availability = 'available' | 'blocked' | 'unavailable'

export interface Project {
  readonly id: string
  readonly title: string
  readonly outcome: string
  readonly type: ProjectType
  readonly status: ProjectStatus
  readonly createdAt: string
  readonly updatedAt: string
}

export interface Action {
  readonly id: string
  readonly projectId: string
  readonly position: number
  readonly title: string
  readonly note?: string
  readonly status: ActionStatus
  readonly deferAt?: string
  readonly dueAt?: string
  readonly estimatedMinutes?: number
  readonly completedAt?: string
  readonly droppedAt?: string
  readonly preparationReminderId?: string
  readonly preparationResultRef?: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface ActionView extends Action {
  readonly availability: Availability
}

export interface InboxItem {
  readonly id: string
  readonly title: string
  readonly raw: string
  readonly source: string
  readonly status: 'open'
  readonly createdAt: string
}

export interface CaptureInboxInput {
  readonly title: string
  readonly raw: string
  readonly source: string
}

export interface ClarifyInboxInput {
  readonly id: string
  readonly project: {
    readonly title: string
    readonly outcome: string
    readonly type: ProjectType
  }
  readonly action: {
    readonly title: string
    readonly note?: string
    readonly deferAt?: string
    readonly dueAt?: string
    readonly estimatedMinutes?: number
  }
}

export interface UpdateActionInput {
  readonly title?: string
  readonly note?: string | null
  readonly deferAt?: string | null
  readonly dueAt?: string | null
  readonly estimatedMinutes?: number | null
  readonly preparationReminderId?: string | null
  readonly preparationResultRef?: string | null
}

export abstract class GtdService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'gtd')
  }

  abstract captureInbox(input: CaptureInboxInput): Promise<InboxItem>
  abstract clarifyInbox(input: ClarifyInboxInput): Promise<{ project: Project; action: ActionView }>
  abstract listInbox(): Promise<InboxItem[]>
  abstract listProjects(): Promise<Project[]>
  abstract listActions(): Promise<ActionView[]>
  abstract getAction(id: string): Promise<ActionView>
  abstract updateAction(id: string, input: UpdateActionInput): Promise<ActionView>
  abstract completeAction(id: string, completedAt: string): Promise<ActionView>
}
