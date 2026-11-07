import { useMemo } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { timeZoneOf } from '../ui/model.ts'
import { TimeProduct } from '../ui/TimeProduct.tsx'
import { hostTokens } from './hostTokens.ts'
import { RemoteTimeAdapter } from './remoteAdapter.ts'

/** The DSH shell: one Remote Adapter, host token binding, then the shared UI root. */
export function TimeClient({ ctx }: { readonly ctx: Context }) {
  const adapter = useMemo(() => new RemoteTimeAdapter(ctx.remote.secretaryTime, timeZoneOf()), [ctx])
  return (
    <div className="tb-host">
      <style>{hostTokens}</style>
      <TimeProduct adapter={adapter} />
    </div>
  )
}
