import type { Tag } from 'dsh-secretary-tag/contract'
import type { ActionView, InboxItem, Project } from 'dsh-secretary-gtd/contract'
import type { ActualBlock, DeepWeek, PlanBlock } from 'dsh-secretary-time-block/contract'

export interface PanelWarning {
  readonly domain: string
  readonly message: string
}

export interface PanelState {
  readonly anchor: string
  readonly timeZone: string
  readonly from: string
  readonly to: string
  readonly today: string
  readonly nowMs: number
  readonly days: string[]
  readonly weekStart: string
  readonly tags: Tag[]
  readonly actual: ActualBlock[]
  readonly plan: PlanBlock[]
  readonly deep: DeepWeek
  readonly inbox: InboxItem[]
  readonly projects: Project[]
  readonly actions: ActionView[]
  readonly nextActions: ActionView[]
  readonly forecast: ActionView[]
  readonly warnings?: PanelWarning[]
}

export type PanelCommand = Record<string, unknown> & {
  readonly domain: 'gtd' | 'tag' | 'time' | 'deep'
  readonly op: string
}

async function read(response: Response): Promise<any> {
  if (response.status === 404) throw new Error('宿主端面板尚未加载，请重载插件后重试')
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? `请求失败（${response.status}）`)
  return body
}

/** Read one panel snapshot: a canvas date window and the requested deep week. */
export async function fetchState(
  anchor: string, timeZone: string, weekStart: string, from: string, to: string,
): Promise<PanelState> {
  const query = new URLSearchParams({ anchor, timeZone, weekStart, from, to })
  return read(await fetch(`/api/secretary.state?${query}`, { headers: { accept: 'application/json' } }))
}

export async function sendCommand(command: PanelCommand): Promise<any> {
  return read(await fetch('/api/secretary.command', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(command),
  }))
}
