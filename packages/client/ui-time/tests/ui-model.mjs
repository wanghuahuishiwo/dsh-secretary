import assert from 'node:assert/strict'
import { test } from 'node:test'
import { timeMath } from '../lib/ui-model.js'

const {
  addDays, cellRecords, clock, durationLabel, localDate, minutesOfRecord, recordsOfDay,
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

test('cellRecords keeps one displayed record per cell and counts the overlap', () => {
  const records = [
    { id: 2, start: 550, end: 640, timeTagId: 1 },
    { id: 9, start: 570, end: 610, timeTagId: 2 },
  ]
  assert.deepEqual(cellRecords(records), [
    { minute: 550, record: records[0], count: 1 },
    { minute: 560, record: records[0], count: 1 },
    { minute: 570, record: records[0], count: 2 },
    { minute: 580, record: records[0], count: 2 },
    { minute: 590, record: records[0], count: 2 },
    { minute: 600, record: records[0], count: 2 },
    { minute: 610, record: records[0], count: 1 },
    { minute: 620, record: records[0], count: 1 },
    { minute: 630, record: records[0], count: 1 },
  ])
  assert.deepEqual(cellRecords([]), [])
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

test('the local now stands still inside a minute and moves one minute at a time after it', () => {
  const at = Date.parse('2026-11-10T09:08:20+08:00')
  const anchor = timeMath.anchorNow(548, '2026-11-10', at)

  assert.deepEqual(timeMath.nowAt(anchor, at), { minute: 548, day: '2026-11-10' }, 'the host answer is the starting point')
  assert.deepEqual(timeMath.nowAt(anchor, at + 30_000), { minute: 548, day: '2026-11-10' }, 'inside the same minute nothing moves')
  assert.deepEqual(timeMath.nowAt(anchor, at + 61_000), { minute: 549, day: '2026-11-10' }, 'one minute later the indicator is one minute on')
  assert.deepEqual(timeMath.nowAt(anchor, at + 60 * 60_000), { minute: 608, day: '2026-11-10' }, 'an hour later it is one hour on')
})

test('the local now crosses an hour and a new year without a host read', () => {
  const beforeTen = timeMath.anchorNow(9 * 60 + 59, '2026-11-10', 0)
  assert.deepEqual(timeMath.nowAt(beforeTen, 2 * 60_000), { minute: 601, day: '2026-11-10' }, '9:59 + 2 min is 10:01 of the same day')

  const newYearsEve = timeMath.anchorNow(23 * 60 + 59, '2026-12-31', 0)
  assert.deepEqual(timeMath.nowAt(newYearsEve, 2 * 60_000), { minute: 1, day: '2027-01-01' }, 'past midnight both the minute and the day roll')
})

test('a client clock that jumps backwards never moves the local now backwards', () => {
  const anchor = timeMath.anchorNow(548, '2026-11-10', 10_000)
  assert.deepEqual(timeMath.nowAt(anchor, 5_000), { minute: 548, day: '2026-11-10' })
})

test('a long sleep moves the local now by the whole span at once', () => {
  const anchor = timeMath.anchorNow(9 * 60 + 8, '2026-11-10', 0)
  const slept = 3 * 60 * 60_000 + 17 * 60_000
  assert.deepEqual(timeMath.nowAt(anchor, slept), { minute: 745, day: '2026-11-10' }, '3h17m of sleep lands on 12:25')
})

test('a fresh host answer re-anchors the local now instead of accumulating drift', () => {
  const first = timeMath.anchorNow(548, '2026-11-10', 0)
  assert.equal(timeMath.nowAt(first, 42 * 60_000).minute, 590, '42 minutes of local ticking reach 09:50')
  const corrected = timeMath.anchorNow(591, '2026-11-10', 42 * 60_000)
  assert.deepEqual(timeMath.nowAt(corrected, 42 * 60_000), { minute: 591, day: '2026-11-10' }, 'the host wins after a re-read')
})

test('the tick waits for the next minute boundary', () => {
  assert.equal(timeMath.nextMinuteDelay(0), 60_000, 'exactly on a boundary waits a whole minute')
  assert.equal(timeMath.nextMinuteDelay(1), 59_999)
  assert.equal(timeMath.nextMinuteDelay(30_000), 30_000)
  assert.equal(timeMath.nextMinuteDelay(59_999), 1)
  assert.equal(timeMath.nextMinuteDelay(60_000), 60_000)
})

test('the local now crosses into the next minute exactly on a wall-clock minute boundary', () => {
  const received = Date.parse('2026-11-10T09:08:20+08:00')
  const anchor = timeMath.anchorNow(548, '2026-11-10', received)
  assert.deepEqual(timeMath.nowAt(anchor, Date.parse('2026-11-10T09:08:59.999+08:00')), { minute: 548, day: '2026-11-10' }, 'the answer arrives mid-minute; the rest of that minute still shows 09:08')
  assert.deepEqual(timeMath.nowAt(anchor, Date.parse('2026-11-10T09:09:00+08:00')), { minute: 549, day: '2026-11-10' }, 'the wall clock minute boundary is the moment the indicator moves')
})
