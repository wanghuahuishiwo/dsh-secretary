import type { ReactNode } from 'react'
import type { Theme, TimeLayer } from '../model/types.ts'
import { addDays, formatDateLabel } from '../model/time.ts'

interface RailShellProps {
  readonly layer: TimeLayer
  readonly date: string
  readonly today: string
  readonly theme: Theme
  readonly canUndo: boolean
  readonly busy: boolean
  readonly onLayerChange: (layer: TimeLayer) => void
  readonly onDateChange: (date: string) => void
  readonly onUndo: () => void
  readonly onThemeToggle: () => void
  readonly children: ReactNode
}

/** TimeBlock 的 390px 产品窄栏；不是跨 GTD / TimeBlock 的共享产品 Shell。 */
export function RailShell({
  layer, date, today, theme, canUndo, busy, onLayerChange, onDateChange,
  onUndo, onThemeToggle, children,
}: RailShellProps) {
  return (
    <div className="tb-rail" data-testid="time-block-preview">
      <header className="tb-rail-header">
        <div className="tb-title-row">
          <div className="tb-title-group">
            <h1>小秘书 <span>·</span> 时间块</h1>
            <span className="tb-preview-badge">设计预览</span>
          </div>
          <button
            className="tb-icon-button"
            type="button"
            data-testid="theme-toggle"
            aria-label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
            title={theme === 'dark' ? '浅色主题' : '深色主题'}
            onClick={onThemeToggle}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            className="tb-undo-button"
            type="button"
            data-testid="undo"
            aria-label="撤销"
            disabled={!canUndo || busy}
            onClick={onUndo}
          >
            <UndoIcon />
            <span>撤销</span>
          </button>
        </div>

        <div className="tb-navigation-row">
          <div className="tb-layer-switch" role="tablist" aria-label="时间块页面">
            {(['plan', 'actual'] as const).map(item => (
              <button
                key={item}
                id={`tab-${item}`}
                type="button"
                role="tab"
                aria-selected={layer === item}
                data-testid={`${item}-tab`}
                className={layer === item ? 'is-active' : ''}
                onClick={() => onLayerChange(item)}
              >
                {item === 'plan' ? '计划' : '实录'}
              </button>
            ))}
          </div>
          <nav className="tb-date-navigation" aria-label="日期导航">
            <button type="button" className="tb-icon-button" data-testid="previous-day" aria-label="上一天" onClick={() => onDateChange(addDays(date, -1))}>
              <Chevron direction="left" />
            </button>
            <span className="tb-date-label" data-testid="current-date" data-date={date}>{formatDateLabel(date)}</span>
            <button type="button" className="tb-icon-button" data-testid="next-day" aria-label="下一天" onClick={() => onDateChange(addDays(date, 1))}>
              <Chevron direction="right" />
            </button>
            <button type="button" className="tb-today-button" data-testid="today" disabled={date === today} onClick={() => onDateChange(today)}>今天</button>
          </nav>
        </div>
      </header>
      {children}
    </div>
  )
}

function Chevron({ direction }: { readonly direction: 'left' | 'right' }) {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d={direction === 'left' ? 'M10 3.5 5.5 8 10 12.5' : 'm6 3.5 4.5 4.5-4.5 4.5'} /></svg>
}

function UndoIcon() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M3 6.5h6.5a3.5 3.5 0 0 1 0 7H6" /><path d="M5.5 3.5 2.5 6.5l3 3" /></svg>
}

function SunIcon() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" aria-hidden="true"><circle cx="8" cy="8" r="2.7" /><path d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M12.6 3.4l-.9.9M4.3 11.7l-.9.9" /></svg>
}

function MoonIcon() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" aria-hidden="true"><path d="M13.3 10.1A5.8 5.8 0 0 1 5.9 2.7a5.8 5.8 0 1 0 7.4 7.4Z" /></svg>
}
