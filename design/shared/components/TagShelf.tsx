import { useState, type CSSProperties } from 'react'
import type { TimeTag } from '../model/types.ts'

interface TagShelfProps {
  readonly tags: readonly TimeTag[]
  readonly hasSelection: boolean
  readonly busy: boolean
  readonly onPaint: (tag: TimeTag) => void
}

/** 可层级展开、可整体收窄的标签架；标签只有存在选区时才可写入。 */
export function TagShelf({ tags, hasSelection, busy, onPaint }: TagShelfProps) {
  const [mini, setMini] = useState(false)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const roots = tags.filter(tag => tag.parentId === undefined)

  const toggleCategory = (id: string) => {
    setCollapsed(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <aside className={`tb-tag-shelf${mini ? ' is-mini' : ''}`} aria-label="时间标签架">
      <button
        className="tb-shelf-toggle"
        type="button"
        aria-label={mini ? '展开标签架' : '收起标签架'}
        aria-expanded={!mini}
        onClick={() => setMini(value => !value)}
      >
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="m3 2.5 3 3.5-3 3.5M7 2.5l3 3.5-3 3.5" /></svg>
        <span>时间标签</span>
      </button>

      <div className="tb-shelf-list">
        {roots.map(root => {
          const children = tags.filter(tag => tag.parentId === root.id)
          const open = !collapsed.has(root.id)
          return (
            <section className="tb-tag-category" key={root.id}>
              <div className="tb-tag-root-row">
                <button
                  type="button"
                  className="tb-tag-root"
                  style={tagStyle(root.color)}
                  data-testid={`tag-${root.id}`}
                  disabled={!hasSelection || busy}
                  onClick={() => onPaint(root)}
                >
                  <span className="tb-tag-dot" />
                  <span>{root.name}</span>
                </button>
                {children.length > 0 && (
                  <button
                    type="button"
                    className="tb-category-toggle"
                    aria-label={`${open ? '收起' : '展开'}${root.name}分类`}
                    aria-expanded={open}
                    onClick={() => toggleCategory(root.id)}
                  >
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m3.5 4.5 2.5 3 2.5-3" /></svg>
                  </button>
                )}
              </div>
              {open && children.map(tag => (
                <button
                  key={tag.id}
                  type="button"
                  className="tb-tag-child"
                  style={tagStyle(tag.color)}
                  data-testid={`tag-${tag.id}`}
                  disabled={!hasSelection || busy}
                  onClick={() => onPaint(tag)}
                >
                  <span className="tb-tag-dot" />
                  <span>{tag.name}</span>
                </button>
              ))}
            </section>
          )
        })}
      </div>
      <p className="tb-shelf-hint">{hasSelection ? '点标签写入选区' : '先在左侧选择时间'}</p>
    </aside>
  )
}

function tagStyle(color: string): CSSProperties {
  return { '--tag-color': color } as CSSProperties
}
