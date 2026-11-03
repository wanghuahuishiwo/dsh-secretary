import type { Tag } from 'dsh-secretary-tag/contract'
import type { ActualBlock, PlanBlock, PlanTemplateBlock } from 'dsh-secretary-time-block/contract'

export interface PanelState {
  readonly tags: Tag[]
  readonly blocks: ActualBlock[]
  readonly plans: PlanBlock[]
  readonly templates: PlanTemplateBlock[]
  readonly templateUndo: boolean
}

export type PanelCommand = Record<string, unknown> & {
  readonly domain: 'tag' | 'time'
  readonly op: string
}

async function read(response: Response): Promise<any> {
  if (response.status === 404) throw new Error('宿主端面板尚未加载，请重载插件后重试')
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? `请求失败（${response.status}）`)
  return body
}

export async function fetchState(date: string, timeZone: string): Promise<PanelState> {
  const query = new URLSearchParams({ date, timeZone })
  return read(await fetch(`/api/secretary.state?${query}`, { headers: { accept: 'application/json' } }))
}

export async function sendCommand(command: PanelCommand): Promise<any> {
  return read(await fetch('/api/secretary.command', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(command),
  }))
}
