import { useState, type ReactNode } from 'react'
import type { GatewayStatus } from './contract.ts'
import { STATE_TONES } from './model.ts'
import { SECTIONS, type SectionId } from './sections.ts'
import { consoleTokens } from './styles.ts'

export interface ConsoleProps {
  /** Current Gateway status for the always-visible header. */
  readonly status: GatewayStatus | undefined
  /** Renders the body of one section; the shell owns navigation and the header only. */
  readonly renderSection: (section: SectionId) => ReactNode
  readonly theme?: 'light' | 'dark'
}

function HeaderStatus({ status }: { readonly status: GatewayStatus | undefined }) {
  if (status === undefined) return <span className="dc-muted">Gateway：读取中…</span>
  return (
    <span className={`dc-tone-${STATE_TONES[status.state]}`}>
      <strong>Gateway</strong> {status.label}
      {status.version === undefined ? null : <span className="dc-muted">　{status.version}</span>}
    </span>
  )
}

/** The console shell: header (Gateway status + node count), page-local left nav, full-page content. */
export function Console({ status, renderSection, theme = 'light' }: ConsoleProps) {
  const [active, setActive] = useState<SectionId>('gateway')
  return (
    <div className="dc" data-dc-theme={theme}>
      <style>{consoleTokens}</style>
      <header className="dc-header" aria-label="底座状态">
        <HeaderStatus status={status} />
        {/* 在线节点数来自 NATS service discovery（基础通信工单），此前只留数位。 */}
        <span className="dc-muted">节点在线　—</span>
      </header>
      <div className="dc-body">
        <nav className="dc-nav" aria-label="底座分区">
          {SECTIONS.map(section => (
            <button key={section.id} type="button" aria-current={active === section.id ? 'page' : undefined} onClick={() => setActive(section.id)}>
              {section.label}
            </button>
          ))}
        </nav>
        <div className="dc-content" role="region" aria-label={SECTIONS.find(section => section.id === active)?.label}>
          {renderSection(active)}
        </div>
      </div>
    </div>
  )
}
