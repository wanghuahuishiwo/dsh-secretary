import { useCallback, useEffect, useMemo, useState } from 'react'
import { RailShell } from '../../shared/components/RailShell.tsx'
import type { TimeBlockAdapter } from '../../shared/model/adapter.ts'
import { addDays } from '../../shared/model/time.ts'
import type { Theme, TimeBlockSnapshot, TimeLayer, TimeRun } from '../../shared/model/types.ts'
import { FixtureTimeAdapter } from './FixtureTimeAdapter.ts'
import { TimeBlockPage } from './TimeBlockPage.tsx'

export function App() {
  // 组合根可以选择 Fixture；页面与组件不感知具体 Adapter。
  const adapter = useMemo<TimeBlockAdapter>(() => new FixtureTimeAdapter(), [])
  const [snapshot, setSnapshot] = useState<TimeBlockSnapshot>()
  const [layer, setLayer] = useState<TimeLayer>('plan')
  const [date, setDate] = useState('')
  const [theme, setTheme] = useState<Theme>('dark')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    void adapter.load().then(next => {
      if (!active) return
      setSnapshot(next)
      setDate(current => current === '' ? next.today : current)
    })
    return () => { active = false }
  }, [adapter])

  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])

  useEffect(() => {
    if (notice === '') return
    const timer = window.setTimeout(() => setNotice(''), 1800)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (snapshot === undefined) return
      const target = event.target as HTMLElement | null
      if (target !== null && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, PageUp: -7, PageDown: 7 }
      const offset = offsets[event.key]
      if (offset === undefined) return
      event.preventDefault()
      setDate(current => addDays(current, offset))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [snapshot])

  const paint = useCallback(async (runs: readonly TimeRun[], tagId: string) => {
    setBusy(true)
    try {
      const next = await adapter.paint({ layer, runs, tagId })
      setSnapshot(next)
      setNotice(`已上色 · ${next.tags.find(tag => tag.id === tagId)?.name ?? '时间标签'}`)
    } finally {
      setBusy(false)
    }
  }, [adapter, layer])

  const erase = useCallback(async (runs: readonly TimeRun[]) => {
    setBusy(true)
    try {
      setSnapshot(await adapter.erase({ layer, runs }))
      setNotice('已擦除选区')
    } finally {
      setBusy(false)
    }
  }, [adapter, layer])

  const undo = useCallback(async () => {
    setBusy(true)
    try {
      const result = await adapter.undo(layer)
      if (result === undefined) return
      setSnapshot(result.snapshot)
      setDate(result.date)
      setNotice('已撤销上一步')
    } finally {
      setBusy(false)
    }
  }, [adapter, layer])

  if (snapshot === undefined || date === '') {
    return <div className="tb-loading" role="status">正在装入设计 Fixtures…</div>
  }

  return (
    <RailShell
      layer={layer}
      date={date}
      today={snapshot.today}
      theme={theme}
      canUndo={snapshot.canUndo[layer]}
      busy={busy}
      onLayerChange={next => { setLayer(next); setNotice('') }}
      onDateChange={setDate}
      onUndo={() => { void undo() }}
      onThemeToggle={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}
    >
      <TimeBlockPage
        layer={layer}
        date={date}
        snapshot={snapshot}
        busy={busy}
        onPaint={paint}
        onErase={erase}
      />
      {notice !== '' && <div className="tb-toast" data-testid="toast" role="status">{notice}</div>}
    </RailShell>
  )
}
