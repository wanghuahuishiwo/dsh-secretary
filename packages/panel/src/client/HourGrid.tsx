/**
 * Weekly hour grid: 7 days × 24 hours, every cell either deep or not.
 * Marked hours are the capacity important work is scheduled into.
 * Static for now — the host API replaces this constant next.
 */
import { useState } from 'react'

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/** Initial deep hours: 09–12 + 16–18 on weekdays, 09–12 on Saturday. */
const INITIAL: readonly (readonly number[])[] = [
  [9, 10, 11, 16, 17],
  [9, 10, 11, 16, 17],
  [9, 10, 11, 16, 17],
  [9, 10, 11, 16, 17],
  [9, 10, 11, 16, 17],
  [9, 10, 11],
  [],
]

const ACCENT = 'oklch(58% 0.18 255)'
const BORDER = 'oklch(92% 0.005 250)'
const MUTED = 'oklch(54% 0.012 250)'
const SLEEP_BG = 'oklch(96.5% 0.003 250)'
const SURFACE = 'oklch(100% 0 0)'

/** Build the lookup of initially marked cells. */
function initialState(): boolean[][] {
  return DAYS.map((_, day) => Array.from({ length: 24 }, (_, hour) => INITIAL[day].includes(hour)))
}

/**
 * Render the grid with click-to-toggle and drag-to-paint.
 * @returns the panel body.
 */
export function HourGrid() {
  const [marked, setMarked] = useState<boolean[][]>(initialState)
  const [painting, setPainting] = useState<null | boolean>(null)

  const toggle = (day: number, hour: number, value?: boolean): void => {
    setMarked(current => {
      const next = current.map(row => [...row])
      next[day][hour] = value ?? !current[day][hour]
      return next
    })
  }

  const perDay = DAYS.map((_, day) => marked[day].filter(Boolean).length)
  const total = perDay.reduce((a, b) => a + b, 0)

  return (
    <div style={{ height: '100%', overflow: 'auto', background: 'oklch(99% 0.002 240)', color: 'oklch(18% 0.012 250)' }}>
      <div style={{
        padding: 'calc(var(--dsh-frame-top-clearance, 48px) + 8px) 28px 12px',
        borderBottom: `1px solid ${BORDER}`,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 24,
      }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' }}>深度时间</h1>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: MUTED, maxWidth: '36ch' }}>
            一周 168 小时里，能推需要连续专注的事的小时。重要任务只往这里排。
          </p>
        </div>
        <div style={{ display: 'flex', gap: 18, fontVariantNumeric: 'tabular-nums' }}>
          {[
            { num: total, cap: '小时/周' },
            { num: perDay.slice(0, 5).reduce((a, b) => a + b, 0), cap: '工作日' },
            { num: perDay[5], cap: '周六' },
            { num: perDay[6], cap: '周日' },
          ].map(({ num, cap }) => (
            <div key={cap} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1 }}>{num}</span>
              <span style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>{cap}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 28px 32px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '42px repeat(7, minmax(0, 1fr))',
            gap: 2,
            userSelect: 'none',
          }}
          onPointerUp={() => setPainting(null)}
          onPointerLeave={() => setPainting(null)}
        >
          <div />
          {DAYS.map(day => (
            <div key={day} style={{ fontSize: 11, fontWeight: 600, color: MUTED, textAlign: 'center', paddingBottom: 8 }}>{day}</div>
          ))}

          {Array.from({ length: 24 }, (_, hour) => (
            <Row
              key={hour}
              hour={hour}
              marked={marked}
              painting={painting}
              onStart={(day) => {
                const value = !marked[day][hour]
                setPainting(value)
                toggle(day, hour, value)
              }}
              onEnter={(day) => {
                if (painting !== null) toggle(day, hour, painting)
              }}
            />
          ))}

          <div />
          {perDay.map((n, day) => (
            <div
              key={day}
              style={{ textAlign: 'center', fontSize: 10.5, paddingTop: 8, color: n > 0 ? ACCENT : MUTED, fontWeight: n > 0 ? 600 : 500, fontVariantNumeric: 'tabular-nums' }}
            >
              {n > 0 ? `${n}h` : '—'}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', paddingTop: 16, marginTop: 8, borderTop: `1px solid ${BORDER}` }}>
          <Legend color={ACCENT} label="深度" />
          <Legend color={SURFACE} label="非深度" border={BORDER} />
          <Legend color={SLEEP_BG} label="睡眠" />
          <span style={{ fontSize: 11.5, color: MUTED }}>点一下切换 · 按住拖过一段连续刷</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Render one hour row: the hour label and its seven cells.
 * @param props - hour index plus the paint state and callbacks.
 * @returns the row's grid children.
 */
function Row({ hour, marked, painting, onStart, onEnter }: {
  hour: number
  marked: boolean[][]
  painting: null | boolean
  onStart: (day: number) => void
  onEnter: (day: number) => void
}) {
  const major = hour % 6 === 0
  return (
    <>
      <div style={{
        fontSize: 10.5,
        color: major ? 'oklch(18% 0.012 250)' : MUTED,
        fontWeight: major ? 600 : 400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingRight: 8,
        height: 22,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {String(hour).padStart(2, '0')}
      </div>
      {DAYS.map((_, day) => {
        const on = marked[day][hour]
        const sleep = hour < 6
        return (
          <div
            key={day}
            role="checkbox"
            aria-checked={on}
            aria-label={`${DAYS[day]} ${hour} 点`}
            onPointerDown={(event) => {
              event.preventDefault()
              onStart(day)
            }}
            onPointerEnter={() => onEnter(day)}
            style={{
              height: 22,
              borderRadius: 4,
              cursor: 'pointer',
              background: on ? ACCENT : sleep ? SLEEP_BG : SURFACE,
              boxShadow: on || sleep ? 'none' : `inset 0 0 0 1px ${BORDER}`,
              outline: painting !== null ? 'none' : undefined,
            }}
          />
        )
      })}
    </>
  )
}

/**
 * Render one legend swatch.
 * @param props - swatch color, label, and optional outline.
 * @returns the legend item.
 */
function Legend({ color, label, border }: { color: string; label: string; border?: string }) {
  return (
    <span style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 11.5, color: MUTED }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: color, boxShadow: border === undefined ? undefined : `inset 0 0 0 1px ${border}` }} />
      {label}
    </span>
  )
}
