import type { Context } from '@deepseek-ai/cordis'
import { FOCUS_LABELS, type TimeBlockService, type FocusLevel } from 'dsh-secretary-time-block/contract'
import { noConfig, OUTPUT, registerTool } from 'dsh-secretary-core/tooling'

export interface Config {}
export const Config = noConfig('dsh-secretary-statistics')
export const name = 'dsh-secretary-statistics'
export const inject = ['tools', 'timeBlocks']

const HOUR = 3_600_000
const MINUTE = 60_000
const FOCUS_KEYS = [...Object.keys(FOCUS_LABELS), 'unlabelled'] as const
type FocusKey = FocusLevel | 'unlabelled'

/** 某时刻在目标时区的 UTC 偏移（毫秒）。按分钟精度足够本统计使用。 */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant))
  const field = (type: string) => Number(parts.find(part => part.type === type)?.value)
  const asUtc = Date.UTC(field('year'), field('month') - 1, field('day'), field('hour'), field('minute'), field('second'))
  return asUtc - Math.floor(instant / 1000) * 1000
}

const emptyMinutes = (): Record<FocusKey, number> =>
  Object.fromEntries(FOCUS_KEYS.map(key => [key, 0])) as Record<FocusKey, number>

export function apply(ctx: Context): void {
  const timeBlocks = () => (ctx as Context & { timeBlocks: TimeBlockService }).timeBlocks
  registerTool(ctx, {
    name: 'secretary_statistics',
    description: 'Read derived time statistics without storing a parallel facts source. op=focus_by_hour splits actual minutes by hour of day and reported focus, which is how the daily focus curve gets calibrated from real records instead of guesses; intervals are clipped to the requested range.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        op: { type: 'string', enum: ['focus_by_hour'] },
        from: { type: 'string' },
        to: { type: 'string' },
        timeZone: { type: 'string' },
      },
      required: ['op', 'from', 'to'],
    },
    output: OUTPUT,
    async execute(raw: unknown) {
      const args = raw as { op: string; from: string; to: string; timeZone?: string }
      if (args.op !== 'focus_by_hour') throw new Error(`secretary: unknown statistics operation ${JSON.stringify(args.op)}`)
      const from = Date.parse(args.from)
      const to = Date.parse(args.to)
      if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new Error('secretary: invalid statistics range')
      const timeZone = args.timeZone ?? 'Asia/Shanghai'
      try {
        new Intl.DateTimeFormat('en-US', { timeZone }).format()
      } catch {
        throw new Error('secretary: invalid statistics time zone')
      }

      const totals = emptyMinutes()
      const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, minutes: emptyMinutes() }))
      for (const block of await timeBlocks().listBlocks()) {
        if (block.actual === undefined) continue
        const key: FocusKey = block.focus ?? 'unlabelled'
        let cursor = Math.max(from, Date.parse(block.actual.startAt))
        const end = Math.min(to, Date.parse(block.actual.endAt))
        while (cursor < end) {
          const offsetMs = zoneOffsetMs(cursor, timeZone)
          const sliceEnd = Math.min(end, Math.floor((cursor + offsetMs) / HOUR) * HOUR + HOUR - offsetMs)
          const minutes = Math.round((sliceEnd - cursor) / MINUTE * 1000) / 1000
          const hour = new Date(cursor + offsetMs).getUTCHours()
          hours[hour].minutes[key] += minutes
          totals[key] += minutes
          cursor = sliceEnd
        }
      }

      return {
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        timeZone,
        labels: { ...FOCUS_LABELS, unlabelled: '未标注' },
        totals,
        hours: hours.map(entry => ({
          hour: entry.hour,
          minutes: Object.fromEntries(FOCUS_KEYS.map(key => [key, Math.round(entry.minutes[key] * 1000) / 1000])),
        })),
      }
    },
  })
}
