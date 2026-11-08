/** Product-local Time Remote assembly and its independent right-Sidebar UI. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import contribution from 'dsh-secretary-time-controller/remote'
import { TimeClient } from './TimeClient.tsx'

const TAB_ID = 'dsh-secretary-time-panel'

function registerUi(ctx: Context): void {
  const Product = () => <TimeClient ctx={ctx} />
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: TAB_ID,
    kind: 'secretary-time-block',
    priority: 'builtin',
    title: () => '小秘书-时间块',
    guide: [{
      id: 'product', order: 21, title: () => '小秘书-时间块',
      description: () => '实录、计划与深度时间',
    }],
  }), 'time-ui: tab type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: TAB_ID,
  }, Product)), 'time-ui: tab body')
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
