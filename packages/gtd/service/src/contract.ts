import { Service, type Context } from '@deepseek-ai/cordis'

export type ProjectType = 'parallel' | 'sequential' | 'single_action_list'
export type ProjectStatus = 'active' | 'on-hold' | 'completed' | 'dropped'
export type ActionStatus = 'active' | 'completed' | 'dropped'
export type Availability = 'available' | 'blocked' | 'unavailable'

export interface Project {
  readonly id: number
  readonly title: string
  readonly outcome?: string
  readonly type: ProjectType
  readonly status: ProjectStatus
  readonly tagIds: readonly number[]
  readonly createdAt: string
  readonly updatedAt: string
}

export interface Action {
  readonly id: number
  readonly projectId?: number
  readonly parentActionId?: number
  readonly position: number
  readonly title: string
  readonly note?: string
  readonly status: ActionStatus
  readonly tagIds: readonly number[]
  readonly deferAt?: string
  readonly plannedAt?: string
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
  /** Derived direct + ancestor Tag ids; never persisted on the Action. */
  readonly effectiveTags: readonly number[]
}

export interface InboxItem {
  readonly id: number
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

export interface ProjectInput {
  readonly title: string
  readonly outcome?: string
  readonly type: ProjectType
  readonly tagIds?: readonly number[]
}

export interface ActionInput {
  readonly title: string
  readonly note?: string
  readonly projectId?: number
  readonly parentActionId?: number
  readonly tagIds?: readonly number[]
  readonly deferAt?: string
  readonly plannedAt?: string
  readonly dueAt?: string
  readonly estimatedMinutes?: number
}

export interface ClarifyInboxInput {
  readonly id: number
  readonly project?: ProjectInput
  readonly action: ActionInput
}

export interface ForecastQuery {
  readonly date: string
  readonly timeZone: string
}

export interface UpdateProjectInput {
  readonly title?: string
  readonly outcome?: string | null
  readonly type?: ProjectType
  readonly status?: ProjectStatus
  readonly tagIds?: readonly number[]
}

export interface UpdateActionInput {
  readonly title?: string
  readonly note?: string | null
  readonly tagIds?: readonly number[]
  readonly deferAt?: string | null
  readonly plannedAt?: string | null
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
  abstract clarifyInbox(input: ClarifyInboxInput): Promise<{ project?: Project; action: ActionView }>
  abstract listInbox(): Promise<InboxItem[]>
  abstract deleteInbox(id: number): Promise<InboxItem>
  abstract listProjects(): Promise<Project[]>
  abstract getProject(id: number): Promise<Project>
  abstract createProject(input: ProjectInput): Promise<Project>
  abstract updateProject(id: number, input: UpdateProjectInput): Promise<Project>
  abstract deleteProject(id: number): Promise<Project>
  abstract listActions(): Promise<ActionView[]>
  abstract listNextActions(): Promise<ActionView[]>
  abstract listForecast(query: ForecastQuery): Promise<ActionView[]>
  abstract createAction(input: ActionInput): Promise<ActionView>
  abstract getAction(id: number): Promise<ActionView>
  abstract getEffectiveTags(id: number): Promise<number[]>
  abstract updateAction(id: number, input: UpdateActionInput): Promise<ActionView>
  abstract deleteAction(id: number): Promise<Action>
  abstract completeAction(id: number, completedAt: string): Promise<ActionView>
  abstract dropAction(id: number, droppedAt: string): Promise<ActionView>
  /** Re-read persisted projects, actions, and inbox items; no host restart. */
  abstract reload(): Promise<void>
}
