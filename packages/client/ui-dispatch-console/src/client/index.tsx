/** The 底座控制台 left-Sidebar entry, its full-page main and the `shell.overlay` Gateway notice. */
import { useSyncExternalStore } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { IconDatabaseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import contribution from 'dsh-secretary-dispatch-controller/remote'
import { Console } from '../ui/Console.tsx'
import type { DispatchConsoleAdapter, GatewayStatus } from '../ui/contract.ts'
import { GatewayNotice } from '../ui/GatewayNotice.tsx'
import { GatewaySection } from '../ui/GatewaySection.tsx'
import { RemoteDispatchAdapter } from './remoteAdapter.ts'
import { STATUS_POLL_MS, createStatusFeed, type StatusFeed } from './statusFeed.ts'

/** One stable identity addresses both the launcher and its main registration. */
const PANEL_ID = 'dsh-secretary-dispatch-console' as MainPanelId
const NOTICE_ID = 'secretary-dispatch.gateway-notice'

function ConsoleIcon({ size }: { readonly size: number }) {
  return <IconDatabaseOutlineRegular size={size} />
}

function useStatus(feed: StatusFeed): GatewayStatus | undefined {
  return useSyncExternalStore(feed.subscribe, feed.getSnapshot, feed.getSnapshot)
}

function useTheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    listener => {
      const observer = new MutationObserver(listener)
      observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
      return () => observer.disconnect()
    },
    () => document.body.hasAttribute('data-ds-dark-theme'),
    () => false,
  ) ? 'dark' : 'light'
}

/** A section placeholder until its ticket lands; the nav and the layout stay as they are. */
function ReservedSection({ label }: { readonly label: string }) {
  return <p className="dc-placeholder">{label} 分区尚未实现。</p>
}

function registerUi(ctx: ClientContext, adapter: DispatchConsoleAdapter): void {
  const feed = createStatusFeed(adapter)
  const open = () => { ctx.layout.selectPanel(PANEL_ID) }
  ctx.effect(() => feed.start(STATUS_POLL_MS), 'dispatch-console: status polling')

  const Main = () => {
    const status = useStatus(feed)
    const theme = useTheme()
    return (
      <Console
        status={status}
        theme={theme}
        renderSection={section => section === 'gateway'
          ? <GatewaySection adapter={adapter} status={status} refresh={feed.refresh} />
          : <ReservedSection label={section === 'nodes' ? '节点' : section === 'events' ? '事件' : 'Graph'} />}
      />
    )
  }
  const Notice = () => <GatewayNotice status={useStatus(feed)} open={open} theme={useTheme()} />

  ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, Main)), 'dispatch-console: main')
  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL_ID, order: 21, label: '底座控制台',
  }, ConsoleIcon)), 'dispatch-console: Sidebar entry')
  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: NOTICE_ID }, Notice)), 'dispatch-console: Gateway notice')
}

/** The root waits only for Remote; the child owns every UI dependency. */
export const inject = ['remote']

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const unmountRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.secretaryDispatch', 'slots', 'layout'], child => registerUi(child, new RemoteDispatchAdapter(child.remote.secretaryDispatch)))
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
