/**
 * Browser half of the secretary panel: a global main panel where the weekly
 * hour grid lives, plus its sidebar entry. Each list id addresses the matching
 * main panel, so both registrations share one `PANEL_ID`.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { HourGrid } from './HourGrid.tsx'
import { TimeIcon } from './TimeIcon.tsx'

/** Panel key; the sidebar's panel list uses the same id to address this panel. */
const PANEL_ID = 'secretary-time' as MainPanelId

/** Browser services this plugin needs. */
export const inject = ['slots']

/**
 * Register the weekly hour grid as a global main panel and add its sidebar row.
 * @param ctx - browser services used by these contributions.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
  }, HourGrid)), 'dsh-secretary-panel: main panel')

  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 30,
    label: () => '时间',
  }, TimeIcon)), 'dsh-secretary-panel: sidebar entry')
}
