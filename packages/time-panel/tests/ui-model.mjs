import assert from 'node:assert/strict'
import { test } from 'node:test'
import { timeMath } from '../lib/ui-model.js'

const {
  addDays, clock, durationLabel, localDate, minutesOfRecord, recordsOfDay,
  runsOf, snapDown, snapUp, timeZoneOf, weekStartOf,
} = timeMath

test('date math moves whole local days and finds the Monday of a week', () => {
  assert.match(localDate(new Date(2026, 10, 7)), /^2026-11-07$/)
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(addDays('2026-02-28', 1), '2026-03-01')
  assert.equal(addDays('2028-02-28', 1), '2028-02-29')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(addDays('2026-01-01', -1), '2025-12-31')

  assert.equal(weekStartOf('2026-11-02'), '2026-11-02', 'Monday is its own week start')
  assert.equal(weekStartOf('2026-11-07'), '2026-11-02', 'Saturday belongs to the Monday week')
  assert.equal(weekStartOf('2026-11-08'), '2026-11-02', 'Sunday belongs to the Monday week')
})

test('minute helpers snap to the ten-minute grid, format clocks and count a record', () => {
  assert.equal(clock(0), '00:00')
  assert.equal(clock(9 * 60 + 5), '09:05')
  assert.equal(clock(-10), '23:50')
  assert.equal(clock(1440), '00:00')
  assert.equal(snapDown(487), 480)
  assert.equal(snapUp(481), 490)
  assert.equal(durationLabel(45), '45 分')
  assert.equal(durationLabel(60), '1 小时')
  assert.equal(durationLabel(90), '1 小时 30 分')
  assert.deepEqual(minutesOfRecord({ id: 1, start: 480, end: 510, timeTagId: 1 }), [480, 490, 500])
})

test('runsOf merges contiguous ten-minute cells and splits gaps', () => {
  assert.deepEqual(runsOf('2026-11-02', [620, 600, 610, 650, 640, 600]), [
    { date: '2026-11-02', start: 600, end: 630 },
    { date: '2026-11-02', start: 640, end: 660 },
  ])
  assert.deepEqual(runsOf('2026-11-02', []), [])
  assert.deepEqual(runsOf('2026-11-02', [10, 20, 25]), [
    { date: '2026-11-02', start: 10, end: 30 },
  ], 'minutes already covered by a run do not start another one')
})

test('recordsOfDay slices a block across midnight and clips it to each day', () => {
  const now = Date.parse('2026-11-04T12:00:00.000Z')
  const blocks = [
    { id: 7, startAt: '2026-11-02T23:30:00.000Z', endAt: '2026-11-03T00:30:00.000Z', timeTagId: 3 },
  ]
  assert.deepEqual(recordsOfDay(blocks, '2026-11-01', 'UTC', now), [])
  assert.deepEqual(recordsOfDay(blocks, '2026-11-02', 'UTC', now), [
    { id: 7, start: 1410, end: 1440, timeTagId: 3, note: undefined },
  ])
  assert.deepEqual(recordsOfDay(blocks, '2026-11-03', 'UTC', now), [
    { id: 7, start: 0, end: 30, timeTagId: 3, note: undefined },
  ])
  assert.deepEqual(recordsOfDay(blocks, '2026-11-04', 'UTC', now), [])
})

test('recordsOfDay ends a running block at now and drops zero-length slices', () => {
  const now = Date.parse('2026-11-02T11:00:00.000Z')
  const running = [{ id: 9, startAt: '2026-11-02T10:00:00.000Z', timeTagId: 2 }]
  assert.deepEqual(recordsOfDay(running, '2026-11-02', 'UTC', now), [
    { id: 9, start: 600, end: 660, timeTagId: 2, note: undefined },
  ])
  const empty = [{ id: 4, startAt: '2026-11-02T10:00:00.000Z', endAt: '2026-11-02T10:00:00.000Z', timeTagId: 1 }]
  assert.deepEqual(recordsOfDay(empty, '2026-11-02', 'UTC', now), [])
})

test('recordsOfDay sorts by start and keeps the note that a day carries', () => {
  const now = Date.parse('2026-11-03T12:00:00.000Z')
  const blocks = [
    { id: 2, startAt: '2026-11-02T12:00:00.000Z', endAt: '2026-11-02T13:00:00.000Z', timeTagId: 1, note: '午饭' },
    { id: 1, startAt: '2026-11-02T08:00:00.000Z', endAt: '2026-11-02T09:00:00.000Z', timeTagId: 2 },
  ]
  assert.deepEqual(recordsOfDay(blocks, '2026-11-02', 'UTC', now), [
    { id: 1, start: 480, end: 540, timeTagId: 2, note: undefined },
    { id: 2, start: 720, end: 780, timeTagId: 1, note: '午饭' },
  ])
})

test('the time zone of a local date can be read explicitly when a caller needs it', () => {
  assert.equal(typeof timeZoneOf(), 'string')
  assert.ok(timeZoneOf().length > 0)
})
