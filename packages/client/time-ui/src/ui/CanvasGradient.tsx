/**
 * The fixed reference-material background used by both canvases.
 *
 * It is a sibling of the scrolling content, never a child of a day column, so
 * the light ramp stays in the same place while days scroll. The parent decides
 * the horizontal bounds (the day grid skips its date/hour rail; the deep grid
 * covers only its weekday columns).
 */
export function CanvasGradient() {
  return <div className="tb-canvas-bg" aria-hidden="true" />
}
