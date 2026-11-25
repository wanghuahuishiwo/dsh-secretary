import type { GatewayState } from 'dsh-secretary-dispatch-controller/types'

/** Tone of a state for the header dot, the notice and the section row. */
export type StateTone = 'ok' | 'ongoing' | 'idle' | 'warning' | 'error'

export const STATE_TONES: Readonly<Record<GatewayState, StateTone>> = {
  running: 'ok',
  remote: 'ok',
  starting: 'ongoing',
  stopping: 'ongoing',
  'not-started': 'idle',
  stopped: 'idle',
  'start-failed': 'error',
  'abnormal-exit': 'error',
  'record-invalid': 'warning',
  unknown: 'warning',
  unmanaged: 'warning',
}

/** The overlay notice shows for every state that is neither a healthy Gateway nor a calm idle one. */
export function needsNotice(state: GatewayState): boolean {
  return STATE_TONES[state] === 'error' || STATE_TONES[state] === 'warning'
}

/** Which process actions make sense in a state (the shared logic stays the final judge). */
export function availableActions(state: GatewayState): ReadonlySet<'start' | 'stop' | 'restart'> {
  if (state === 'running') return new Set(['stop', 'restart'])
  if (state === 'not-started' || state === 'stopped' || state === 'start-failed' || state === 'abnormal-exit') return new Set(['start'])
  return new Set()
}
