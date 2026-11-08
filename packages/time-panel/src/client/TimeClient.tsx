import { useEffect, useMemo, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { timeZoneOf } from '../ui/model.ts'
import { TimeProduct } from '../ui/TimeProduct.tsx'
import { hostTokens } from './hostTokens.ts'
import { RemoteTimeAdapter } from './remoteAdapter.ts'

/** The DSH shell: one Remote Adapter, host token binding, then the shared UI root. */
export function TimeClient({ ctx }: { readonly ctx: Context }) {
  const adapter = useMemo(() => new RemoteTimeAdapter(ctx.remote.secretaryTime, timeZoneOf()), [ctx])
  const [dark, setDark] = useState(() => document.body.hasAttribute('data-ds-dark-theme'))
  useEffect(() => {
    const update = () => setDark(document.body.hasAttribute('data-ds-dark-theme'))
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    return () => observer.disconnect()
  }, [])
  return (
    <div className={`tb-host${dark ? ' tb-host-dark' : ''}`}>
      <style>{hostTokens}</style>
      <TimeProduct adapter={adapter} />
    </div>
  )
}
