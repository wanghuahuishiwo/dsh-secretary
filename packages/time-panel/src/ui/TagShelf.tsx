import { useState } from 'react'
import type { TimeTag } from './model.ts'

const FALLBACK_COLOR = '#477bc7'
const CHEVRONS = <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 5.2L6 2.4l3 2.8M3 9.5L6 6.7l3 2.8" /></svg>

interface TagShelfProps {
  readonly tags: readonly TimeTag[]
  readonly onAssign: (tagId: number) => void
}

/** 层级时间标签架：可展开/收起子级、可整体收窄；点标签给选区上色。 */
export function TagShelf({ tags, onAssign }: TagShelfProps) {
  const [mini, setMini] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})
  const [brushTagId, setBrushTagId] = useState<number | undefined>(undefined)

  const roots = tags.filter(tag => tag.parentId === undefined)
  const tagOf = (id: number) => tags.find(tag => tag.id === id)
  const tagColor = (id: number) => tagOf(id)?.color ?? FALLBACK_COLOR

  return (
    <aside className={`sec-shelf${mini ? ' mini' : ''}`} aria-label="时间标签架">
      {mini && <span className="sec-brush" style={{ background: brushTagId === undefined ? FALLBACK_COLOR : tagColor(brushTagId) }} />}
      <button className="sec-shelf-head" type="button" onClick={() => setMini(value => !value)}>
        {CHEVRONS}
        <span>合上所有内容</span>
      </button>
      <div className="sec-shelf-list">
        {roots.map(tag => {
          const kids = tags.filter(item => item.parentId === tag.id)
          const open = collapsed[tag.id] !== true
          return (
            <div key={tag.id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <button
                className="sec-cat"
                type="button"
                style={{ background: tag.color ?? FALLBACK_COLOR }}
                aria-expanded={kids.length > 0 ? open : undefined}
                onClick={event => {
                  if (kids.length > 0 && (event.target as HTMLElement).closest('.caret') !== null) {
                    setCollapsed(previous => ({ ...previous, [tag.id]: open }))
                    return
                  }
                  setBrushTagId(tag.id)
                  onAssign(tag.id)
                  if (kids.length > 0) setCollapsed(previous => ({ ...previous, [tag.id]: false }))
                }}
              >
                <span>{tag.name}</span>
                {kids.length > 0 && (
                  <svg className="caret" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 2.5L7.5 6 4 9.5" /></svg>
                )}
              </button>
              {open && kids.map(kid => (
                <button key={kid.id} className="sec-cat sub" type="button" style={{ background: kid.color ?? FALLBACK_COLOR }} onClick={() => { setBrushTagId(kid.id); onAssign(kid.id) }}>
                  <span>{kid.name}</span>
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
