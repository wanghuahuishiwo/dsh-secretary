import { useEffect, useRef, useState, type RefObject } from 'react'
import { nextMinuteDelay, nowAt, type LocalNow, type NowAnchor } from './model.ts'

/**
 * The local “now” between host answers. Time only moves display state: the
 * anchored minute advances once per whole minute on the minute edge, so the
 * indicator never waits for a read and never needs one. A fresh anchor (any
 * host answer) replaces the clock; a clock that jumps back does not.
 *
 * The surface sleeps while it is off screen (the right Sidebar collapsed) or
 * while the window is hidden, and catches up in one step when it comes back.
 */
export function useLocalNow(
  anchor: NowAnchor | undefined,
  root: RefObject<HTMLElement | null>,
): LocalNow | undefined {
  const [now, setNow] = useState<LocalNow | undefined>(
    () => anchor === undefined ? undefined : nowAt(anchor, Date.now()),
  )
  // A surface mounted while the window is already hidden starts asleep.
  const [awake, setAwake] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  )
  const onScreen = useRef(true)

  // One timer owner: a new anchor or waking up re-reads once, then ticks.
  useEffect(() => {
    if (anchor === undefined || !awake) return
    const snap = () => setNow(nowAt(anchor, Date.now()))
    snap()
    let timer = setTimeout(function tick() {
      snap()
      timer = setTimeout(tick, nextMinuteDelay(Date.now()))
    }, nextMinuteDelay(Date.now()))
    return () => { clearTimeout(timer) }
  }, [anchor, awake])

  // Sleep when the screenshot would not show the surface: hidden window or
  // the Sidebar translated off the frame.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const element = root.current
    const sync = () => {
      setAwake(document.visibilityState !== 'hidden' && onScreen.current)
    }
    // Without IntersectionObserver the surface only follows window visibility.
    let observer: IntersectionObserver | undefined
    if (element !== null && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver((entries) => {
        onScreen.current = entries.some(entry => entry.isIntersecting)
        sync()
      })
      observer.observe(element)
    }
    document.addEventListener('visibilitychange', sync)
    return () => {
      observer?.disconnect()
      document.removeEventListener('visibilitychange', sync)
    }
  }, [root])

  return now
}
