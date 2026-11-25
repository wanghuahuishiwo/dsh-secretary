import { useState } from 'react'
import type { ServiceInstance } from './contract.ts'

export interface NodesSectionProps {
  /** Online service instances as the discovery returned them; `undefined` while the first read is in flight. */
  readonly services: readonly ServiceInstance[] | undefined
  /** Last read failure, if any. */
  readonly error: string | undefined
}

const json = (value: unknown) => JSON.stringify(value, null, 2)
const text = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value))

/**
 * The 节点 section: one row per online service instance, in the order the discovery answered. A row expands in place
 * to its complete JSON; nothing is derived, filtered or labelled.
 */
export function NodesSection({ services, error }: NodesSectionProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const toggle = (key: string) => {
    const next = new Set(expanded)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setExpanded(next)
  }
  return (
    <section aria-label="节点">
      {error === undefined ? null : <p role="alert" className="dc-tone-error">{error}</p>}
      {services === undefined ? <p className="dc-muted">读取中…</p> : services.length === 0 ? <p className="dc-muted">没有在线的服务实例。</p> : (
        <table className="dc-grid" data-dc-nodes>
          <thead>
            <tr><th /><th>服务名</th><th>实例 ID</th><th>版本</th><th>metadata</th><th>endpoints</th></tr>
          </thead>
          <tbody>
            {services.map((service, index) => {
              const key = `${index}`
              const open = expanded.has(key)
              return [
                <tr key={key} data-dc-node={text(service.id)}>
                  <td><button type="button" aria-expanded={open} aria-label={open ? '收起' : '展开'} onClick={() => toggle(key)}>{open ? '▾' : '▸'}</button></td>
                  <td>{text(service.name)}</td>
                  <td className="dc-mono">{text(service.id)}</td>
                  <td>{service.version === undefined ? '' : text(service.version)}</td>
                  <td className="dc-mono dc-cell-json">{service.metadata === undefined ? '' : json(service.metadata)}</td>
                  <td className="dc-mono dc-cell-json">{json(service.endpoints)}</td>
                </tr>,
                open ? (
                  <tr key={`${key}:json`} data-dc-node-json>
                    <td /><td colSpan={5}><pre className="dc-json">{json(service)}</pre></td>
                  </tr>
                ) : null,
              ]
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
