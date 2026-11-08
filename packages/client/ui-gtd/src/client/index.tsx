/** The independent 小秘书-事项 left-Sidebar entry and its blank global main. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { IconChecklistOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/** One stable identity addresses both the launcher and its main registration. */
const PANEL_ID = 'dsh-secretary-gtd' as MainPanelId

/** Browser declarations are supplied by the Host Loader's client dependency graph. */
export const inject = ['slots']

function GtdPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <IconChecklistOutlineRegular size={size} />
}

/** Deliberately empty until a later ticket authorizes real GTD page capabilities. */
function EmptyGtdMain() {
  return <main aria-label="小秘书-事项" />
}

/** Register only product navigation; Conversation return remains DSH workspace navigation. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
  }, EmptyGtdMain)), 'dsh-secretary-ui-gtd: blank main')

  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 20,
    label: '小秘书-事项',
  }, GtdPanelIcon)), 'dsh-secretary-ui-gtd: Sidebar entry')
}
