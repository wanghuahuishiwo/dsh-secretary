import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TimeProduct } from 'dsh-secretary-time-panel/ui'
import { FixtureTimeAdapter } from './FixtureTimeAdapter.ts'
import { FIXTURE_TODAY } from './fixtures.ts'

type Theme = 'dark' | 'light'

const MIN_RAIL = 320
const MAX_RAIL = 720
const DEFAULT_RAIL = 390

const PREVIEW_BADGE = {
  padding: '1px 5px',
  border: '1px solid var(--tb-border-strong)',
  borderRadius: 'var(--tb-radius-sm)',
  color: 'var(--tb-text-tertiary)',
  fontSize: '9px',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
} as const

const PREVIEW_ROW = {
  display: 'flex',
  flex: '0 0 100%',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 5,
  paddingTop: 3,
  borderTop: '1px solid var(--tb-border-subtle)',
} as const

/** The OD-only theme control; the product header just receives it in its slot. */
function ThemeToggle({ theme, onToggle }: { readonly theme: Theme; readonly onToggle: () => void }) {
  const dark = theme === 'dark'
  return (
    <button
      className="tb-hbtn"
      type="button"
      title="切换主题"
      aria-label={dark ? '切换到浅色主题' : '切换到深色主题'}
      onClick={onToggle}
    >
      {dark
        ? <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="8" cy="8" r="3.2" /><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" /></svg>
        : <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M12.8 9.6A5.2 5.2 0 016.4 3.2a5.4 5.4 0 106.4 6.4z" /></svg>}
    </button>
  )
}

/**
 * OpenDesign shell: it owns the fixture adapter, the review theme, the preview
 * marker and the resizable rail width (mimicking the DSH host sidebar resize).
 */
export function App() {
  const adapter = useMemo(() => new FixtureTimeAdapter(), [])
  const [theme, setTheme] = useState<Theme>('dark')
  const [railWidth, setRailWidth] = useState(DEFAULT_RAIL)
  const widthRef = useRef(railWidth)
  widthRef.current = railWidth

  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])

  const startResize = useCallback((event: React.PointerEvent) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = widthRef.current
    const move = (e: PointerEvent) => {
      const delta = startX - e.clientX
      setRailWidth(Math.max(MIN_RAIL, Math.min(MAX_RAIL, startWidth + delta)))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [])

  return (
    <div className="od-rail" style={{ width: `min(100vw, ${railWidth}px)` }}>
      <div className="od-resize" role="separator" aria-orientation="vertical" aria-label="调整预览栏宽度" onPointerDown={startResize} />
      <TimeProduct
        adapter={adapter}
        today={FIXTURE_TODAY}
        headerAction={(
          <span style={PREVIEW_ROW}>
            <span style={PREVIEW_BADGE} title="OpenDesign Fixture 预览">设计预览</span>
            <ThemeToggle theme={theme} onToggle={() => setTheme(value => (value === 'dark' ? 'light' : 'dark'))} />
          </span>
        )}
      />
    </div>
  )
}
