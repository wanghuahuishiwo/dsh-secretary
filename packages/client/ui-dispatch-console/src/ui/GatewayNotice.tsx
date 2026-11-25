import type { GatewayStatus } from './contract.ts'
import { STATE_TONES } from './model.ts'
import { noticeTokens } from './styles.ts'

export interface GatewayNoticeProps {
  readonly status: GatewayStatus | undefined
  /** Open the console on its Gateway section. */
  readonly open: () => void
  readonly theme?: 'light' | 'dark'
}

/** `shell.overlay` entry: shown only while the Gateway is not in a healthy or calm state. */
export function GatewayNotice({ status, open, theme = 'light' }: GatewayNoticeProps) {
  if (status === undefined) return null
  const tone = STATE_TONES[status.state]
  if (tone !== 'error' && tone !== 'warning') return null
  return (
    <div className="dc-notice" data-dc-theme={theme} role="status">
      <style>{noticeTokens}</style>
      <span className={`dc-tone-${tone}`}>Gateway {status.label}</span>
      {status.detail === undefined ? null : <span>{status.detail}</span>}
      <button type="button" onClick={open}>查看底座控制台</button>
    </div>
  )
}
