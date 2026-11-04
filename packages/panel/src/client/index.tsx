/**
 * Browser half of the secretary product: one right-Sidebar tab that carries the
 * 时间块 canvas, the 深度时间 week grid, and the 事项 list.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { SecretaryProduct } from './Shell.tsx'

/** This implementation's identity in the tab system, and the key its body registers under. */
const TAB_ID = 'dsh-secretary-panel'

/** The tab kind; one tab holds every first-level module behind the drawer. */
const TAB_KIND = 'secretary'

/** Browser services this plugin needs. */
export const inject = ['slots', 'sidebarRightTabs']

/**
 * Register the product as a right-Sidebar tab type, its guide entry, and its body.
 * @param ctx - browser services used by these contributions.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: TAB_ID,
    kind: TAB_KIND,
    priority: 'builtin',
    title: () => '小秘书',
    guide: [{
      id: 'product',
      order: 20,
      title: () => '小秘书',
      description: () => '时间块、深度时间与事项',
    }],
  }), 'dsh-secretary-panel: tab type')

  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: TAB_ID,
  }, SecretaryProduct)), 'dsh-secretary-panel: tab body')
}
