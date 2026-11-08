import type { ReactNode } from 'react'
import { WEEKDAY_LABELS, addDays } from './model.ts'

export type TimeModule = 'actual' | 'plan' | 'deep'

export const MODULES: { id: TimeModule; name: string; icon: ReactNode }[] = [
  { id: 'actual', name: '实录', icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.5 1.5" /></svg> },
  { id: 'plan', name: '计划', icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="2" y="3.5" width="12" height="10.5" rx="2" /><path d="M2 6.5h12M5 2v2.5M11 2v2.5" /><path d="M5 9.5l1.5 1.5L11 7.5" /></svg> },
  { id: 'deep', name: '深度时间', icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M2 4.5h12M4 8h8M6 11.5h4" /></svg> },
]

export function dayLabel(date: string): string {
  const value = new Date(`${date}T12:00:00`)
  return `${value.getMonth() + 1}月${value.getDate()}日 ${WEEKDAY_LABELS[(value.getDay() + 6) % 7]}`
}

export function weekLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T12:00:00`)
  const end = new Date(`${addDays(weekStart, 6)}T12:00:00`)
  return `${start.getMonth() + 1}月${start.getDate()}日 – ${end.getMonth() + 1}月${end.getDate()}日`
}

interface TimeHeaderProps {
  readonly module: TimeModule
  readonly dateLabel: string
  readonly canUndo: boolean
  readonly busy: boolean
  readonly pickerOpen: boolean
  readonly drawerOpen: boolean
  /** Host-owned control rendered in the header's trailing slot. */
  readonly action?: ReactNode
  readonly onDrawer: () => void
  readonly onPicker: () => void
  readonly onStep: (amount: number) => void
  readonly onUndo: () => void
}

/** 产品头部：菜单、模块名、日期导航、今天、撤销。 */
export function TimeHeader({ module, dateLabel, canUndo, busy, pickerOpen, drawerOpen, action, onDrawer, onPicker, onStep, onUndo }: TimeHeaderProps) {
  return (
    <header className={`tb-head${action === undefined || action === null ? '' : ' has-action'}`}>
      <button
        className="tb-module-switch"
        type="button"
        aria-label="切换一级模块"
        aria-haspopup="menu"
        aria-expanded={drawerOpen}
        onClick={onDrawer}
      >
        <svg className="tb-switch-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2.5 4h11M2.5 8h11M2.5 12h11" /></svg>
        <span className="tb-title">{MODULES.find(item => item.id === module)?.name ?? ''}</span>
        <svg className="tb-switch-caret" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M2.5 4.5L6 8l3.5-3.5" /></svg>
      </button>
      <span className="grow" />
      <button className="tb-hbtn" type="button" aria-label={module === 'deep' ? '上一周' : '上一天'} onClick={() => onStep(module === 'deep' ? -7 : -1)}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9.5 4L5.5 8l4 4" /></svg>
      </button>
      <button className="tb-daylabel" type="button" aria-label={module === 'deep' ? '选择一周' : '选择日期'} aria-expanded={pickerOpen} onClick={onPicker}>
        {dateLabel}
      </button>
      <button className="tb-hbtn" type="button" aria-label={module === 'deep' ? '下一周' : '下一天'} onClick={() => onStep(module === 'deep' ? 7 : 1)}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6.5 4l4 4-4 4" /></svg>
      </button>
      <button className="tb-now" type="button" onClick={() => onStep(0)}>{module === 'deep' ? '本周' : '今天'}</button>
      <button className="tb-hbtn" type="button" title="撤销" disabled={!canUndo || busy} onClick={onUndo}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M3 7h6.5a3.5 3.5 0 010 7H6" /><path d="M5.5 4L2.5 7l3 3" /></svg>
      </button>
      {action}
    </header>
  )
}
