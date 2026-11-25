import { useEffect, useState, type FormEvent } from 'react'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DispatchConsoleAdapter, GatewaySettings, GatewayStatus, UpdateGatewaySettings } from './contract.ts'
import { STATE_TONES, availableActions } from './model.ts'

export interface GatewaySectionProps {
  readonly adapter: DispatchConsoleAdapter
  readonly status: GatewayStatus | undefined
  /** Ask the shell for a fresh status after a command or a settings change. */
  readonly refresh: () => Promise<void>
}

const DOT: Record<ReturnType<typeof tone>, 'done' | 'ongoing' | 'idle' | 'warning' | 'error'> = {
  ok: 'done', ongoing: 'ongoing', idle: 'idle', warning: 'warning', error: 'error',
}
function tone(status: GatewayStatus) { return STATE_TONES[status.state] }

type Tab = 'overview' | 'settings'

/** The Gateway section: an overview tab (raw status + process actions) and a settings tab. */
export function GatewaySection({ adapter, status, refresh }: GatewaySectionProps) {
  const [tab, setTab] = useState<Tab>('overview')
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const run = async (action: 'start' | 'stop' | 'restart') => {
    setBusy(true)
    setError(undefined)
    try {
      await adapter[action]()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
      await refresh()
    }
  }
  return (
    <section aria-label="Gateway">
      <div className="dc-tabs" role="tablist">
        {(['overview', 'settings'] as const).map(id => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{id === 'overview' ? '概览' : '设置'}</button>
        ))}
      </div>
      {tab === 'overview' ? (
        <>
          {status === undefined ? <p className="dc-muted">读取中…</p> : (
            <>
              <div className="dc-row">
                <StateDot state={DOT[tone(status)]} />
                <strong>{status.label}</strong>
                {status.version === undefined ? null : <span>nats-server {status.version}</span>}
              </div>
              {status.detail === undefined ? null : <p className={`dc-tone-${tone(status)}`}>{status.detail}</p>}
              {error === undefined ? null : <p role="alert" className="dc-tone-error">{error}</p>}
              {status.binary.found ? null : <p className="dc-tone-warning">找不到 nats-server（{status.binary.configured}）。安装：<code>{status.binary.hint}</code>，或在「设置」里手填二进制路径。</p>}
              <div className="dc-actions">
                {availableActions(status.state).has('start') ? <Button variant="primary" size="sm" disabled={busy} onClick={() => void run('start')}>启动</Button> : null}
                {availableActions(status.state).has('stop') ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void run('stop')}>停止</Button> : null}
                {availableActions(status.state).has('restart') ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void run('restart')}>重启</Button> : null}
              </div>
              <table className="dc-table"><tbody>
                <tr><td>状态</td><td>{status.state}</td></tr>
                <tr><td>模式</td><td>{status.mode === 'remote' ? '远程' : '本机'}</td></tr>
                <tr><td>客户端地址</td><td className="dc-mono">{status.clientUrl}</td></tr>
                {status.monitorUrl === undefined ? null : <tr><td>监控地址</td><td className="dc-mono">{status.monitorUrl}</td></tr>}
                {status.pid === undefined ? null : <tr><td>pid</td><td className="dc-mono">{status.pid}</td></tr>}
                {status.startedAt === undefined ? null : <tr><td>启动时间</td><td className="dc-mono">{status.startedAt}（{status.startedBy === 'cli' ? '命令行' : '控制台'}）</td></tr>}
                {status.endedAt === undefined ? null : <tr><td>结束时间</td><td className="dc-mono">{status.endedAt}</td></tr>}
                <tr><td>二进制</td><td className="dc-mono">{status.binary.found ? status.binary.configured : `未找到 ${status.binary.configured}`}</td></tr>
              </tbody></table>
              {status.logTail === undefined ? null : (<><p className="dc-muted">nats-server.log 尾部</p><pre className="dc-log">{status.logTail}</pre></>)}
            </>
          )}
        </>
      ) : (
        <GatewaySettingsForm adapter={adapter} onSaved={refresh} />
      )}
    </section>
  )
}

function GatewaySettingsForm({ adapter, onSaved }: { readonly adapter: DispatchConsoleAdapter; readonly onSaved: () => Promise<void> }) {
  const [current, setCurrent] = useState<GatewaySettings | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    void adapter.readSettings().then(setCurrent, cause => setError(cause instanceof Error ? cause.message : String(cause)))
  }, [adapter])
  if (current === undefined) return <p className="dc-muted">{error ?? '读取中…'}</p>
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(undefined)
    setSaved(false)
    const form = new FormData(event.currentTarget)
    const text = (key: string) => String(form.get(key) ?? '').trim()
    const input: UpdateGatewaySettings = current.mode === 'local'
      ? { binary: text('binary'), clientPort: Number(text('clientPort')), monitorPort: Number(text('monitorPort')) }
      : {
        binary: text('binary'), remoteUrl: text('remoteUrl'),
        ...(text('centerCredential') === '' ? {} : { centerCredential: text('centerCredential') }),
        ...(text('nodeCredential') === '' ? {} : { nodeCredential: text('nodeCredential') }),
      }
    try {
      setCurrent(await adapter.updateSettings(input))
      setSaved(true)
      await onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const remote = current.mode === 'remote'
  return (
    <form onSubmit={event => void submit(event)} aria-label="Gateway 设置">
      <p className="dc-muted">
        {remote ? '远程模式：只配置 Gateway 地址与本机凭据引用，不提供远程进程控制。' : '本机模式：端口只绑 loopback，改动在下次启动或手动重启时生效。'}
        {' '}模式切换见 <code>$DSH_HOME/gateway/settings.json</code>。
      </p>
      <div className="dc-field"><label htmlFor="dc-binary">nats-server 二进制</label><input id="dc-binary" name="binary" defaultValue={current.binary} /></div>
      {remote ? (
        <>
          <div className="dc-field"><label htmlFor="dc-url">Gateway 地址</label><input id="dc-url" name="remoteUrl" defaultValue={current.remote.url} required /></div>
          <div className="dc-field"><label htmlFor="dc-center">中心凭据引用</label><input id="dc-center" name="centerCredential" defaultValue={current.remote.credentials.center ?? ''} placeholder="NATS_NKEY_SEED_CENTER" /></div>
          <div className="dc-field"><label htmlFor="dc-node">节点凭据引用</label><input id="dc-node" name="nodeCredential" defaultValue={current.remote.credentials.node ?? ''} placeholder="NATS_NKEY_SEED_NODE" /></div>
        </>
      ) : (
        <>
          <div className="dc-field"><label htmlFor="dc-client">客户端端口</label><input id="dc-client" name="clientPort" type="number" defaultValue={current.clientPort} required /></div>
          <div className="dc-field"><label htmlFor="dc-monitor">监控端口</label><input id="dc-monitor" name="monitorPort" type="number" defaultValue={current.monitorPort} required /></div>
        </>
      )}
      {error === undefined ? null : <p role="alert" className="dc-tone-error">{error}</p>}
      {saved ? <p role="status">已保存。</p> : null}
      <Button variant="primary" size="sm" type="submit">保存</Button>
    </form>
  )
}
