import type { Tag } from 'dsh-secretary-tag/contract'
import type { ActionView, InboxItem, Project } from 'dsh-secretary-gtd/contract'
import type { ActualBlock, DeepWeek, PlanBlock, PlanTemplateBlock } from 'dsh-secretary-time-block/contract'

export interface PanelWarning {
  readonly domain: string
  readonly message: string
}

export interface PanelState {
  readonly tags: Tag[]
  readonly blocks: ActualBlock[]
  readonly plans: PlanBlock[]
  readonly templates: PlanTemplateBlock[]
  readonly templateUndo: boolean
  readonly deepWeek: DeepWeek
  readonly inbox: InboxItem[]
  readonly projects: Project[]
  readonly actions: ActionView[]
  readonly nextActions: ActionView[]
  readonly forecast: ActionView[]
  readonly warnings?: PanelWarning[]
}

export type PanelCommand = Record<string, unknown> & {
  readonly domain: 'gtd' | 'tag' | 'time'
  readonly op: string
}

async function read(response: Response): Promise<any> {
  if (response.status === 404) throw new Error('宿主端面板尚未加载，请重载插件后重试')
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? `请求失败（${response.status}）`)
  return body
}

export async function fetchState(date: string, timeZone: string, forecastDate = date): Promise<PanelState> {
  const query = new URLSearchParams({ date, timeZone, forecastDate })
  return read(await fetch(`/api/secretary.state?${query}`, { headers: { accept: 'application/json' } }))
}

export async function sendCommand(command: PanelCommand): Promise<any> {
  return read(await fetch('/api/secretary.command', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(command),
  }))
}
