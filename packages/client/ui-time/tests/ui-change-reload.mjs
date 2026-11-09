import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createChangeReload, viewSignature } from '../lib/ui-change-reload.js'

function view(blocks = [], overrides = {}) {
  return {
    today: '2026-11-09', nowMinute: 600, from: '2026-11-06', to: '2026-11-19',
    days: ['2026-11-09'], weekStart: '2026-11-09', tags: [],
    blocks: { actual: blocks, plan: [] },
    deep: { source: 'own', levels: [] },
    canUndo: { actual: false, plan: false },
    ...overrides,
  }
}

const block = id => ({ id, date: '2026-11-09', start: 60, end: 120, tagId: '1' })

/** Fire the debounced reload and let its async load/apply settle. */
async function fire(t, ms = 50) {
  t.mock.timers.tick(ms)
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

test('a change mark repaints with the new data after the debounce', async t => {
  t.mock.timers.enable()
  let shown = view()
  let loads = 0
  const reload = createChangeReload({
    load: async () => { loads += 1; return view([block(1)]) },
    current: () => shown,
    apply: next => { shown = next },
    isHeld: () => false,
  })
  t.after(() => reload.dispose())
  reload.notify()
  await fire(t)
  assert.equal(loads, 1)
  assert.equal(shown.blocks.actual.length, 1)
})

test('one write bursts marks into a single reload; equal data never repaints', async t => {
  t.mock.timers.enable()
  let shown = view()
  let loads = 0
  let applies = 0
  const reload = createChangeReload({
    load: async () => { loads += 1; return view([], { nowMinute: 999 }) },
    current: () => shown,
    apply: next => { applies += 1; shown = next },
    isHeld: () => false,
  })
  t.after(() => reload.dispose())
  reload.notify()
  reload.notify()
  reload.notify()
  await fire(t)
  assert.equal(loads, 1)
  assert.equal(applies, 0)
})

test('a held interaction defers the reload until release', async t => {
  t.mock.timers.enable()
  let shown = view()
  let loads = 0
  let held = true
  const reload = createChangeReload({
    load: async () => { loads += 1; return view([block(1)]) },
    current: () => shown,
    apply: next => { shown = next },
    isHeld: () => held,
  })
  t.after(() => reload.dispose())
  reload.notify()
  await fire(t)
  assert.equal(loads, 0)
  held = false
  reload.release()
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
  assert.equal(loads, 1)
  assert.equal(shown.blocks.actual.length, 1)
})

test('a failing reload is skipped and the next mark retries', async t => {
  t.mock.timers.enable()
  let shown = view()
  let loads = 0
  const reload = createChangeReload({
    load: async () => {
      loads += 1
      if (loads === 1) throw new Error('transient')
      return view([block(1)])
    },
    current: () => shown,
    apply: next => { shown = next },
    isHeld: () => false,
  })
  t.after(() => reload.dispose())
  reload.notify()
  await fire(t)
  reload.notify()
  await fire(t)
  assert.equal(loads, 2)
  assert.equal(shown.blocks.actual.length, 1)
})

test('dispose drops pending work and the signature ignores nowMinute and today', async t => {
  t.mock.timers.enable()
  const base = view([block(1)])
  const moved = view([block(1)], { nowMinute: 999, today: '2026-11-10' })
  assert.equal(viewSignature(base), viewSignature(moved))
  assert.notEqual(viewSignature(base), viewSignature(view([block(1), block(2)])))
  let loads = 0
  const reload = createChangeReload({
    load: async () => { loads += 1; return moved },
    current: () => base,
    apply: () => { throw new Error('applied after dispose') },
    isHeld: () => false,
  })
  reload.notify()
  reload.dispose()
  await fire(t, 500)
  assert.equal(loads, 0)
})
