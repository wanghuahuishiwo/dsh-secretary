import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { TimeProductService } from '../lib/index.js'

const settle = () => new Promise(resolve => setImmediate(resolve))

test('watch pushes one mark per persisted Time mutation and stops cleanly', async t => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const service = new TimeProductService(ctx)
  const stream = service.watch()
  const items = []
  const reader = (async () => {
    for await (const item of stream) {
      items.push(item)
      if (items.length === 2) break
    }
  })()
  await settle()
  ctx.emit('secretary/time-changed')
  ctx.emit('secretary/time-changed')
  await reader
  assert.deepEqual(items, [{ changed: true }, { changed: true }])
})

test('marks emitted before iteration starts are not lost', async t => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const service = new TimeProductService(ctx)
  const stream = service.watch()
  const iterator = stream[Symbol.asyncIterator]()
  const first = iterator.next()
  const second = iterator.next()
  ctx.emit('secretary/time-changed')
  ctx.emit('secretary/time-changed')
  assert.deepEqual((await first).value, { changed: true })
  assert.deepEqual((await second).value, { changed: true })
  await iterator.return?.()
})
