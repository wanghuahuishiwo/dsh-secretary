/** Decorative glyph for the time panel's sidebar row. */
import { IconClockOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/**
 * Render the clock glyph at the edge the sidebar asks for. The sidebar owns the
 * accessible navigation label.
 * @param props - the sidebar's icon share.
 * @returns decorative clock icon.
 */
export function TimeIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <IconClockOutlineRegular size={size} />
}
