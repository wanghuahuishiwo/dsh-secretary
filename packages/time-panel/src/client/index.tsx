/** Product-local Time Remote assembly and its independent right-Sidebar UI. */
import { useEffect, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import contribution from 'dsh-secretary-time-panel/remote'
import type { TimeWindowProjection } from '../types.ts'

const TAB_ID = 'dsh-secretary-time-panel'

function localDate(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function TimeRemoteProduct({ ctx }: { readonly ctx: Context }) {
  const [window, setWindow] = useState<TimeWindowProjection>()
  const [error, setError] = useState<string>()
  const [painting, setPainting] = useState(false)
  const [painted, setPainted] = useState(false)
  useEffect(() => {
    let active = true
    const read = async () => {
      const result = await ctx.remote.secretaryTime.readWindow({
        anchor: localDate(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      if (!result.ok) throw result.error
      if (active) setWindow(result.value)
    }
    void read().catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : String(cause))
    })
    return () => { active = false }
  }, [ctx])
  const paint = async () => {
    if (window === undefined) return
    const tag = window.tags.find(item => item.kind === 'time')
    if (tag === undefined) throw new Error('请先创建时间标签')
    setPainting(true)
    setError(undefined)
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const result = await ctx.remote.secretaryTime.paint({
        layer: 'actual', tagId: tag.id, timeZone,
        runs: [{ date: localDate(), start: 540, end: 550 }],
      })
      if (!result.ok) throw result.error
      const reread = await ctx.remote.secretaryTime.readWindow({ anchor: localDate(), timeZone })
      if (!reread.ok) throw reread.error
      setWindow(reread.value)
      setPainted(true)
    } finally {
      setPainting(false)
    }
  }
  if (error !== undefined) return <section data-time-remote data-remote-state="error" role="alert">{error}</section>
  if (window === undefined) return <section data-time-remote data-remote-state="loading">正在读取时间窗口</section>
  return <section data-time-remote data-remote-state="ready" aria-label="小秘书-时间块 Remote 曳光弹">
    <div data-remote-module="actual">实录 {window.actual.length}</div>
    <div data-remote-module="plan">计划 {window.plan.length}</div>
    <div data-remote-module="deep">深度时间 {window.deep.cells.length} 格</div>
    <ul aria-label="时间标签">
      {window.tags.filter(tag => tag.kind === 'time').map(tag => <li key={tag.id} data-remote-tag={tag.id}>{tag.name}</li>)}
    </ul>
    <button type="button" disabled={painting} onClick={() => { void paint().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause))
    }) }}>上色 09:00–09:10</button>
    {painted && <span data-remote-paint="written" role="status">已写入并重读</span>}
  </section>
}

function registerUi(ctx: Context): void {
  const Product = () => <TimeRemoteProduct ctx={ctx} />
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: TAB_ID,
    kind: 'secretary-time-block',
    priority: 'builtin',
    title: () => '小秘书-时间块',
    guide: [{
      id: 'product', order: 21, title: () => '小秘书-时间块',
      description: () => '实录、计划与深度时间',
    }],
  }), 'time-panel: tab type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: TAB_ID,
  }, Product)), 'time-panel: tab body')
}

/** The root waits only for Remote; the child owns every UI dependency. */
export const inject = ['remote']

export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const unmountRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.secretaryTime', 'slots', 'sidebarRightTabs'], registerUi)
  try {
    await ui
  } catch (error) {
    await ui.dispose()
    await unmountRemote()
    throw error
  }
  return async () => {
    await ui.dispose()
    await unmountRemote()
  }
}
