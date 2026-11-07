import { useEffect, useMemo, useState } from 'react'
import { SelectionBar } from '../../shared/components/SelectionBar.tsx'
import { TagShelf } from '../../shared/components/TagShelf.tsx'
import { runsOfSelection } from '../../shared/model/time.ts'
import type { TimeBlockSnapshot, TimeLayer, TimeRun } from '../../shared/model/types.ts'
import { TimeCanvas } from './components/TimeCanvas.tsx'

interface TimeBlockPageProps {
  readonly layer: TimeLayer
  readonly date: string
  readonly snapshot: TimeBlockSnapshot
  readonly busy: boolean
  readonly onPaint: (runs: readonly TimeRun[], tagId: string) => Promise<void>
  readonly onErase: (runs: readonly TimeRun[]) => Promise<void>
}

/** 计划与实录共用的完整产品页面，只通过 Adapter 命令写入当前层。 */
export function TimeBlockPage({ layer, date, snapshot, busy, onPaint, onErase }: TimeBlockPageProps) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const runs = useMemo(() => runsOfSelection(date, selected), [date, selected])
  const blocks = useMemo(
    () => snapshot.blocks[layer].filter(block => block.date === date),
    [date, layer, snapshot.blocks],
  )

  useEffect(() => { setSelected(new Set()) }, [date, layer])

  const paint = async (tagId: string) => {
    if (runs.length === 0 || busy) return
    await onPaint(runs, tagId)
    setSelected(new Set())
  }

  const erase = async () => {
    if (runs.length === 0 || busy) return
    await onErase(runs)
    setSelected(new Set())
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target !== null && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (event.key === 'Escape') {
        setSelected(new Set())
        return
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace' || selected.size === 0) return
      event.preventDefault()
      void erase()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <>
      <main className="tb-page" role="tabpanel" aria-labelledby={`tab-${layer}`}>
        <TimeCanvas
          layer={layer}
          date={date}
          today={snapshot.today}
          nowMinute={snapshot.nowMinute}
          blocks={blocks}
          tags={snapshot.tags}
          selected={selected}
          busy={busy}
          onSelectionChange={setSelected}
        />
        <TagShelf
          tags={snapshot.tags}
          hasSelection={selected.size > 0}
          busy={busy}
          onPaint={tag => { void paint(tag.id) }}
        />
      </main>
      <SelectionBar count={selected.size} busy={busy} onClear={() => setSelected(new Set())} onErase={() => { void erase() }} />
    </>
  )
}
