import type { ReactNode } from 'react'
import { WEEKDAY_LABELS, addDays } from './model.ts'

export type TimeModule = 'time' | 'deep'

export const MODULES: { id: TimeModule; name: string; icon: ReactNode }[] = [
  { id: 'time', name: '时间块', icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="2" y="2" width="12" height="12" rx="3" /><path d="M2 6h12M6 6v8" /></svg> },
  { id: 'deep', name: '深度时间', icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M2 12l3.5-5 3 3.5L12 4" /><path d="M2 14h12" /></svg> },
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
  readonly titleSub: string
  readonly dateLabel: string
  readonly canUndo: boolean
  readonly busy: boolean
  readonly subMenuOpen: boolean
  readonly pickerOpen: boolean
  /** Host-owned control rendered in the header's trailing slot. */
  readonly action?: ReactNode
  readonly onDrawer: () => void
  readonly onSubMenu: () => void
  readonly onPicker: () => void
  readonly onStep: (amount: number) => void
  readonly onUndo: () => void
}

/** 产品头部：菜单、标题/层切换、日期导航、今天、撤销。 */
export function TimeHeader({ module, titleSub, dateLabel, canUndo, busy, subMenuOpen, pickerOpen, action, onDrawer, onSubMenu, onPicker, onStep, onUndo }: TimeHeaderProps) {
  return (
    <header className="sec-head">
      <button className="sec-hbtn" type="button" aria-label="一级模块" onClick={onDrawer}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2.5 4h11M2.5 8h11M2.5 12h11" /></svg>
      </button>
      <button className="sec-title" type="button" aria-expanded={subMenuOpen} onClick={onSubMenu}>
        <span>{MODULES.find(item => item.id === module)?.name ?? ''}</span>
        <span className="tsub">{titleSub}</span>
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M2.5 4.5L6 8l3.5-3.5" /></svg>
      </button>
      <span className="grow" />
      <button className="sec-hbtn" type="button" aria-label={module === 'deep' ? '上一周' : '上一天'} onClick={() => onStep(module === 'deep' ? -7 : -1)}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9.5 4L5.5 8l4 4" /></svg>
      </button>
      <button className="sec-daylabel" type="button" aria-label={module === 'deep' ? '选择一周' : '选择日期'} aria-expanded={pickerOpen} onClick={onPicker}>
        {dateLabel}
      </button>
      <button className="sec-hbtn" type="button" aria-label={module === 'deep' ? '下一周' : '下一天'} onClick={() => onStep(module === 'deep' ? 7 : 1)}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6.5 4l4 4-4 4" /></svg>
      </button>
      <button className="sec-now" type="button" onClick={() => onStep(0)}>{module === 'deep' ? '本周' : '今天'}</button>
      <button className="sec-hbtn" type="button" title="撤销" disabled={!canUndo || busy} onClick={onUndo}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M3 7h6.5a3.5 3.5 0 010 7H6" /><path d="M5.5 4L2.5 7l3 3" /></svg>
      </button>
      {action}
    </header>
  )
}
