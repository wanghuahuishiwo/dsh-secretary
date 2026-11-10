import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { clearDialogs, openTimeRemote } from './open-time-product.mjs'
import { seedWorkspace } from './workspace-fixture.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

/** The canvas anchors on the machine's local day, so tests compute it the same way. */
function localDate(date = new Date()) {
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

async function freePort() {
  const server = createServer()
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done) })
  const { port } = server.address()
  await new Promise(done => server.close(done))
  return port
}

async function boot(home, overlay) {
  const port = await freePort()
  const child = spawn('dsh', [
    'web', ...(overlay === undefined ? [] : ['--patch', overlay]), '--port', String(port), '--no-open',
  ], {
    env: { ...process.env, DSH_HOME: home, DEEPSEEK_API_KEY: 'browser-test-no-model' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  const url = await new Promise((resolveUrl, reject) => {
    const timer = setTimeout(() => reject(new Error(`dsh did not print its token URL:\n${output}`)), 90_000)
    const collect = chunk => {
      output += String(chunk)
      const match = /(http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+)/.exec(output)
      if (match) { clearTimeout(timer); resolveUrl(match[1]) }
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`dsh exited early (${code}):\n${output}`)) })
  })
  return {
    child, url,
    output: () => output,
    async stop() {
      if (child.exitCode !== null) return
      const exited = new Promise(resolveExit => child.once('exit', resolveExit))
      child.kill('SIGTERM')
      await exited
    },
  }
}

function collectPageErrors(page, errors) {
  page.on('pageerror', error => errors.push(error))
  page.on('console', message => {
    if (message.type() !== 'error') return
    // Restart races: transient carrier noise while the host reboots. The
    // 0.2.2-rc.1 runtime retries the Remote mux and page assets during the
    // stop/boot window; steady-state failures still surface as test failures.
    if (/ERR_INCOMPLETE_CHUNKED_ENCODING|ERR_CONNECTION_REFUSED/.test(message.text())) return
    // These tests stop and restart the host, or rewrite its profile for HMR.
    // While the old process is going away the page's live connections and the
    // plugin event stream reject; that is the restart, not a page defect.
    if (/WebSocket connection to 'ws:\/\/[^']*\/api\/remote\.mux' failed/.test(message.text())) return
    if (/Failed to load resource: the server responded with a status of (404|500)/.test(message.text())) return
    errors.push(new Error(`console.error: ${message.text()}`))
  })
}

/** Purpose-specific test fixture backed by the real domain Services, never a production Remote. */
async function domainFixture(page, action, input = {}) {
  return page.evaluate(async payload => {
    const response = await fetch('/api/secretary-test.domain', {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload),
    })
    const parsed = await response.json()
    if (!response.ok) throw new Error(parsed.error ?? `domain fixture failed (${response.status})`)
    return parsed
  }, { action, ...input })
}

/** Seed the time tag tree through the test-only TagService fixture. */
async function seedTags(page) {
  return domainFixture(page, 'seed-time-tags')
}

async function dragCells(page, day, from, to) {
  const start = await page.locator(`.tb-cell[data-day="${day}"][data-min="${from}"]`).boundingBox()
  const end = await page.locator(`.tb-cell[data-day="${day}"][data-min="${to}"]`).boundingBox()
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 6 })
  await page.mouse.up()
}

/** Open the header calendar and pick one date, walking months when it is not on screen. */
async function pickDay(page, iso) {
  await page.locator('.tb-daylabel').click()
  const target = iso.slice(0, 7)
  for (let attempt = 0; attempt < 36; attempt += 1) {
    const title = await page.locator('.tb-picker-title').innerText()
    const digits = title.replace(/[^0-9]/g, '')
    const current = `${digits.slice(0, 4)}-${digits.slice(4, 6).padStart(2, '0')}`
    if (current === target) break
    await page.locator(`.tb-picker-nav[aria-label="${current < target ? '下一月' : '上一月'}"]`).click()
  }
  await page.locator(`.tb-picker-day[data-day="${iso}"]`).click()
}

async function openModule(page, name) {
  await page.getByRole('button', { name: '一级模块' }).click()
  await page.getByRole('button', { name, exact: true }).click()
  await page.waitForTimeout(600)
}

async function chooseTimeView(page, name) {
  await openModule(page, name)
}

function overlaySource(home) {
  return [
    '- id: ui-settings-general',
    '  config:',
    "    welcomeNoticeVersion: '2026-09-28.1'",
    '- id: ui-settings-account',
    '  config:',
    '    version: 1',
    '    step: done',
    '    usage: detailed',
    '    developerTools: true',
    '    purpose: null',
    '    process: standard',
    '    completion: api-key',
    '- insert:',
    "    - id: secretary-browser-sqlite",
    `      name: 'file://${join(ROOT, 'packages/bundle/secretary/node_modules/@deepseek-ai/dsh-storage-sqlite/lib/index.js')}'`,
    '      config:',
    `        path: ${join(home, 'secretary.sqlite')}`,
    '      journalMode: delete',
    "    - id: secretary-browser-storage",
    `      name: 'file://${join(ROOT, 'packages/storage/domain/lib/index.js')}'`,
    "    - id: secretary-browser-goal",
    `      name: 'file://${join(ROOT, 'packages/goal/provider/lib/index.js')}'`,
    "    - id: secretary-browser-tag",
    `      name: 'file://${join(ROOT, 'packages/tag/service/lib/index.js')}'`,
    "    - id: secretary-browser-time",
    `      name: 'file://${join(ROOT, 'packages/time/time-block/lib/index.js')}'`,
    "    - id: secretary-browser-time-controller",
    "      name: 'dsh-secretary-time-controller'",
    "    - id: secretary-browser-time-ui",
    "      name: 'dsh-secretary-ui-time'",
    "    - id: secretary-browser-time-lifecycle-fixture",
    `      name: 'file://${join(home, 'time-product-lifecycle.mjs')}'`,
    "    - id: secretary-browser-domain-fixture",
    `      name: 'file://${join(home, 'domain-fixture.mjs')}'`,
    "    - id: secretary-browser-gtd-ui",
    `      name: 'file://${join(ROOT, 'packages/client/ui-gtd/lib/index.js')}'`,
    '',
  ].join('\n')
}

async function prepareFixtures(home) {
  await seedWorkspace(home, ROOT)
  const profile = join(home, 'profiles', 'web')
  await mkdir(join(profile, 'node_modules'), { recursive: true })
  const controllerDir = join(ROOT, 'packages/api/time-controller')
  const uiDir = join(ROOT, 'packages/client/ui-time')
  for (const [name, directory] of [['dsh-secretary-time-controller', controllerDir], ['dsh-secretary-ui-time', uiDir]]) {
    await symlink(directory, join(profile, 'node_modules', name), 'dir')
  }
  await writeFile(join(profile, 'package.json'), JSON.stringify({
    name: 'dsh-profile-web', private: true,
    dependencies: {
      'dsh-secretary-time-controller': `link:${controllerDir}`,
      'dsh-secretary-ui-time': `link:${uiDir}`,
    },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
  }, null, 2))
  await writeFile(join(home, 'time-product-lifecycle.mjs'), `
    export const inject = ['connection', 'loader', 'time', 'secretaryStorageDomain']
    export function apply(ctx) {
      ctx.effect(() => ctx.connection.fetch.register({
        path: '/api/secretary-test.time-product', methods: ['POST'], requestBody: 'buffered',
        async fetch(request) {
          try {
            const input = await request.json()
            const names = ['dsh-secretary-time-controller', 'dsh-secretary-ui-time']
            const bundleEntries = () => names.flatMap(name => [...ctx.loader.entries()].filter(item => item.options.name === name))
            if (input.op === 'remove') {
              const entries = bundleEntries()
              const fibers = entries.map(item => item.fiber)
              for (const item of entries) ctx.loader.remove(item.id)
              for (const fiber of fibers) await fiber?.dispose()
              await ctx.loader.await()
            } else if (input.op === 'mount') {
              for (const name of names) {
                const entry = [...ctx.loader.entries()].find(item => item.options.name === name)
                if (!entry || entry.fiber?.state === 4) {
                  const id = await ctx.loader.create({ name })
                  await ctx.loader.resolve(id).fiber
                }
              }
              await ctx.loader.await()
            }
            if (input.op === 'close-storage') {
              await ctx.secretaryStorageDomain.closeAll()
              return Response.json({ closed: true })
            }
            const actual = ctx.get('time') !== undefined
              ? await ctx.time.listActual({ timeZone: 'Asia/Shanghai' })
              : undefined
            return Response.json({
              product: ctx.get('timeProduct') !== undefined,
              time: ctx.get('time') !== undefined,
              actual,
              entries: bundleEntries().map(item => ({ id: item.id, state: item.fiber?.state, error: item.fiber?.error?.message })),
            })
          } catch (error) {
            return Response.json({ error: String(error), stack: error?.stack }, { status: 500 })
          }
        },
      }), 'test-only Time product lifecycle fixture')
    }
  `)
  await writeFile(join(home, 'domain-fixture.mjs'), `
    export const inject = ['connection', 'tags']
    export function apply(ctx) {
      ctx.effect(() => ctx.connection.fetch.register({
        path: '/api/secretary-test.domain', methods: ['POST'], requestBody: 'buffered',
        async fetch(request) {
          try {
            const input = await request.json()
            if (input.action === 'seed-time-tags') {
              const work = await ctx.tags.createTag({ name: '工作', kind: 'time', color: '#477bc7' })
              const life = await ctx.tags.createTag({ name: '生活', kind: 'time', color: '#317b68' })
              await ctx.tags.createTag({ name: '睡眠', kind: 'time', color: '#5d6b8a', parentId: life.id })
              const meal = await ctx.tags.createTag({ name: '吃饭', kind: 'time', color: '#d08a3e', parentId: life.id })
              return Response.json({ work, life, meal })
            }
            if (input.action === 'create-tag') {
              const tag = await ctx.tags.createTag({ name: input.name, kind: 'time' })
              return Response.json({ tag })
            }
            return Response.json({ error: 'unknown test fixture action' }, { status: 400 })
          } catch (error) {
            return Response.json({ error: String(error), stack: error?.stack }, { status: 500 })
          }
        },
      }), 'test-only domain Service fixture')
    }
  `)
}

async function writeOverlay(home) {
  await prepareFixtures(home)
  const overlay = join(home, 'overlay.yml')
  await writeFile(overlay, overlaySource(home))
  return overlay
}

/** Use the watched profile patch when a test exercises real configuration HMR. */
async function writeProfile(home) {
  await prepareFixtures(home)
  const profile = join(home, 'profiles', 'web', 'cordis.patch.yml')
  await mkdir(dirname(profile), { recursive: true })
  await writeFile(profile, overlaySource(home))
  return profile
}

test('the product is a right-Sidebar tab: one day per screen, the drawer as level one and the title as level two', { timeout: 240_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-browser-'))
  const overlay = await writeOverlay(home)
  const server = await boot(home, overlay)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  collectPageErrors(page, errors)
  t.after(async () => { await browser.close(); await server.stop() })
  try {
    await openTimeRemote(page, server.url)
    await seedTags(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openTimeRemote(page, server.url)

    assert.equal(await page.locator('.tb-app').count(), 1, 'the product is one panel')
    assert.equal(await page.locator('.tb-day').count(), 14, 'the canvas opens with two weeks of days around today')
    assert.equal(await page.locator('.tb-cell').count(), 14 * 144, 'each day is 24 hours of ten-minute cells')
    const box = await page.locator('.tb-app').boundingBox()
    assert.ok(box.width < 900, `the product stays in the narrow right column, got ${box.width}`)

    const today = localDate()
    assert.equal(await page.locator(`.tb-day[data-day="${today}"] .tb-datemark .today`).count(), 1, "today's column is marked")
    assert.equal(await page.locator('.tb-cat').count(), 4, 'the shelf lists every time tag, nested ones included')

    await openModule(page, '深度时间')
    assert.equal(await page.locator('.tb-hc').count(), 7 * 24, '深度时间 draws seven days by twenty-four hours')
    await openModule(page, '实录')
    assert.equal(await page.locator('.tb-cell').count(), 14 * 144, 'the drawer returns to 实录')

    await chooseTimeView(page, '计划')
    await chooseTimeView(page, '实录')

    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
    await server.stop()
  }
})


test('the day list keeps scrolling instead of stopping at a week, and the date field jumps anywhere', { timeout: 240_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-browser-'))
  const overlay = await writeOverlay(home)
  const server = await boot(home, overlay)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  collectPageErrors(page, errors)
  t.after(async () => { await browser.close(); await server.stop() })
  try {
    await openTimeRemote(page, server.url)
    const canvas = page.locator('.tb-scroll')
    const days = () => page.locator('.tb-day').count()
    const opening = await days()

    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -30_000)
    await page.waitForFunction(count => document.querySelectorAll('.tb-day').length > count, opening, { timeout: 20_000 })

    await page.mouse.wheel(0, 60_000)
    const grown = await days()
    await page.waitForFunction(count => document.querySelectorAll('.tb-day').length > count, grown, { timeout: 20_000 })

    await page.mouse.wheel(0, -30_000)
    await page.waitForTimeout(1_200)
    const anchored = await page.locator('.tb-daylabel').innerText()
    const topDay = await page.evaluate(() => {
      const scroll = document.querySelector('.tb-scroll')
      const columns = [...document.querySelectorAll('.tb-day')]
      let top = ''
      for (const column of columns) {
        if (column.offsetTop <= scroll.scrollTop + 1) top = column.dataset.day
        else break
      }
      return top
    })
    const [, month, day] = topDay.split('-').map(Number)
    assert.ok(anchored.includes(`${month}月${day}日`), `the header names the day at the top edge, got ${anchored} for ${topDay}`)
    assert.ok(topDay !== localDate(), 'scrolling away from today moves that label')

    // Arrow keys step one day, PageUp / PageDown step a week, and 计划 opens on the same day.
    const before = await page.locator('.tb-daylabel').innerText()
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(600)
    assert.notEqual(await page.locator('.tb-daylabel').innerText(), before, '→ moves the canvas one day')
    await page.keyboard.press('PageDown')
    await page.waitForTimeout(600)
    await chooseTimeView(page, '计划')
    await page.waitForTimeout(600)
    const planTop = await page.locator('.tb-daylabel').innerText()
    await chooseTimeView(page, '实录')
    await page.waitForTimeout(600)
    assert.equal(await page.locator('.tb-daylabel').innerText(), planTop, '计划 opens on the day 实录 was reading')

    await pickDay(page, '2026-01-15')
    await page.locator('.tb-day[data-day="2026-01-15"]').waitFor({ timeout: 20_000 })
    const target = await page.locator('.tb-day[data-day="2026-01-15"]').boundingBox()
    const frame = await canvas.boundingBox()
    assert.ok(target.y >= frame.y - 2 && target.y <= frame.y + frame.height, 'the jumped-to day lands on screen')

    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
    await server.stop()
  }
})

test('selecting cells then a category paints them; 不选, Delete and 撤销 behave and the blocks survive a reload', { timeout: 240_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-browser-'))
  const overlay = await writeOverlay(home)
  const server = await boot(home, overlay)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  collectPageErrors(page, errors)
  t.after(async () => { await browser.close(); await server.stop() })
  const today = localDate()
  try {
    await openTimeRemote(page, server.url)
    await seedTags(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openTimeRemote(page, server.url)

    await dragCells(page, today, 480, 530)
    assert.match(await page.locator('.tb-sel-badge').innerText(), /1 小时/, 'dragging selects ten-minute cells')
    assert.equal(await page.locator('.tb-selbox').count(), 1, 'one hour of selection is one ring')

    await page.locator('.tb-cat').filter({ hasText: '工作' }).first().click()
    await page.waitForFunction(() => document.querySelectorAll('.tb-blk').length === 6)
    assert.equal(await page.locator('.tb-blk span').first().innerText(), '工作', 'the first cell of a block carries the label')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openTimeRemote(page, server.url)
    await page.waitForFunction(() => document.querySelectorAll('.tb-blk').length === 6, undefined, { timeout: 30_000 })

    await dragCells(page, today, 480, 530)
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('.tb-selbox').count(), 0, '不选 clears the ring')

    await dragCells(page, today, 480, 530)
    await page.keyboard.press('Delete')
    await page.waitForFunction(() => document.querySelectorAll('.tb-blk').length === 0)

    await page.locator('.tb-head button[title="撤销"]').click()
    await page.waitForFunction(() => document.querySelectorAll('.tb-blk').length === 6)

    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
    await server.stop()
  }
})

test('the record detail sheet opens on right-click, autosaves the note and keeps it off the canvas, and 计划 paints its own layer', { timeout: 240_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-browser-'))
  const overlay = await writeOverlay(home)
  const server = await boot(home, overlay)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  collectPageErrors(page, errors)
  t.after(async () => { await browser.close(); await server.stop() })
  const today = localDate()
  try {
    await openTimeRemote(page, server.url)
    await seedTags(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openTimeRemote(page, server.url)

    await dragCells(page, today, 480, 530)
    await page.locator('.tb-cat').filter({ hasText: '工作' }).first().click()
    await page.waitForFunction(() => document.querySelectorAll('.tb-blk').length === 6)
    assert.equal(await page.locator('.tb-blk span').first().innerText(), '工作', '画布块内文字是标签名')

    // 单击记录块仍是选区手势：出现浮动徽章，但不打开详情。
    await page.locator('.tb-blk').first().click()
    assert.match(await page.locator('.tb-sel-badge').innerText(), /10 分/, '单击记录块仍产生选区')
    assert.equal(await page.locator('.tb-sheet').count(), 0, '单击记录块不打开详情')
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('.tb-sel-badge').count(), 0, 'Esc 只清空选区')

    // 右键单条记录直接进详情：没有完成/保存按钮，备注输入后自动写入。
    const block = page.locator('.tb-blk').first()
    await block.click({ button: 'right' })
    const sheet = page.locator('.tb-sheet')
    await sheet.waitFor()
    assert.equal(await sheet.locator('.tb-sheet-title').innerText(), '工作', '单条记录的块直接进入详情')
    assert.equal(await sheet.getByRole('button', { name: /完成|保存/ }).count(), 0, '详情没有完成/保存按钮')
    await sheet.locator('.tb-note').fill('午饭')
    await page.waitForFunction(() => document.querySelector('.tb-blk')?.getAttribute('title')?.includes('午饭'),
      undefined, { timeout: 20_000 })
    assert.equal(await page.locator('.tb-blk span').first().innerText(), '工作', '备注不进入画布，块内文字仍是标签名')

    // Esc 关闭整张 sheet；重开详情直接读到已自动写入的备注。
    await page.keyboard.press('Escape')
    await sheet.waitFor({ state: 'detached' })
    await block.click({ button: 'right' })
    await sheet.waitFor()
    assert.equal(await sheet.locator('.tb-note').inputValue(), '午饭', '无需保存，重开详情仍能读到备注')

    // 点遮罩关闭整张 sheet。
    await page.locator('.tb-sheet-scrim').click({ position: { x: 12, y: 12 } })
    await sheet.waitFor({ state: 'detached' })

    // 向下拖动把手关闭整张 sheet。
    await block.click({ button: 'right' })
    await sheet.waitFor()
    const grab = await sheet.locator('.grab').boundingBox()
    await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2)
    await page.mouse.down()
    await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2 + 90, { steps: 6 })
    await page.mouse.up()
    await sheet.waitFor({ state: 'detached' })

    // 同格多条：右键先进「N 条并行记录」列表，点行下钻，‹ N 条记录 返回列表。
    await dragCells(page, today, 480, 530)
    await page.locator('.tb-sel-mode').getByRole('button', { name: '并行' }).click()
    await page.locator('.tb-cat').filter({ hasText: '生活' }).first().click()
    await page.waitForFunction(() => document.querySelectorAll('.tb-more').length === 6, undefined, { timeout: 20_000 })
    assert.equal(await page.locator('.tb-blk span').first().innerText(), '工作', '重叠格只显示最早一条的标签')
    await block.click({ button: 'right' })
    await sheet.waitFor()
    assert.equal(await sheet.locator('.tb-sheet-title').innerText(), '2 条并行记录', '同格多条先进列表')
    assert.equal(await sheet.locator('.tb-sheet-row').count(), 2, '列表列出该格的全部记录')
    await sheet.locator('.tb-sheet-row').first().click()
    const back = sheet.locator('.tb-sheet-back')
    await back.waitFor()
    assert.match(await back.innerText(), /2 条记录/, '详情左上角是返回列表控件')
    assert.equal(await sheet.locator('.tb-sheet-row').count(), 0, '点行进入该条记录详情')
    await back.click()
    await page.waitForFunction(() => document.querySelectorAll('.tb-sheet-row').length === 2)
    await page.keyboard.press('Escape')
    await sheet.waitFor({ state: 'detached' })

    await chooseTimeView(page, '计划')
    await page.waitForTimeout(400)
    assert.equal(await page.locator('.tb-blk').count(), 0, '实录 blocks never leak into the plan layer')
    await dragCells(page, today, 600, 650)
    await page.locator('.tb-cat').filter({ hasText: '生活' }).first().click()
    await page.waitForFunction(() => document.querySelectorAll('.tb-blk').length === 6)

    await chooseTimeView(page, '实录')
    await page.waitForTimeout(400)
    assert.equal(await page.locator('.tb-blk span').first().innerText(), '工作', 'plan painting leaves 实录 alone')

    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
    await server.stop()
  }
})

test('深度时间 paints one week, the next week inherits it, and editing that week leaves the first alone across a restart', { timeout: 300_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-browser-'))
  const overlay = await writeOverlay(home)
  let server = await boot(home, overlay)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  collectPageErrors(page, errors)
  t.after(async () => { await browser.close(); await server.stop() })
  try {
    await openTimeRemote(page, server.url)
    await openModule(page, '深度时间')
    await page.locator('.tb-hc').first().waitFor()
    await page.waitForTimeout(500)

    const start = await page.locator('.tb-hc[data-k="1-9"]').boundingBox()
    const end = await page.locator('.tb-hc[data-k="2-10"]').boundingBox()
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
    await page.mouse.down()
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 6 })
    await page.mouse.up()
    assert.match(await page.locator('.tb-sel-badge').innerText(), /4 小时/, 'dragging makes a rectangle')
    await page.locator('.tb-cat').filter({ hasText: '高' }).first().click()
    await page.waitForFunction(() => document.querySelectorAll('.tb-hc.H').length === 4)

    await page.getByRole('button', { name: '下一周' }).click()
    await page.waitForFunction(() => document.querySelectorAll('.tb-hc.H').length === 4, undefined, { timeout: 20_000 })

    const erase = await page.locator('.tb-hc[data-k="1-9"]').boundingBox()
    await page.mouse.move(erase.x + erase.width / 2, erase.y + erase.height / 2)
    await page.mouse.down()
    await page.mouse.up()
    await page.keyboard.press('Delete')
    await page.waitForFunction(() => document.querySelectorAll('.tb-hc.H').length === 3)

    await page.getByRole('button', { name: '上一周' }).click()
    await page.waitForFunction(() => document.querySelectorAll('.tb-hc.H').length === 4, undefined, { timeout: 20_000 })

    // The header week control jumps to any week, and an untouched week starts empty.
    await pickDay(page, '2026-10-14')
    await page.waitForFunction(() => document.querySelectorAll('.tb-hc.H').length === 0, undefined, { timeout: 20_000 })
    assert.match(await page.locator('.tb-daylabel').innerText(), /10月12日\s*–\s*10月18日/, 'the header names the week it shows')
    await page.screenshot({ path: join(tmpdir(), 'secretary-deep-week.png') })

    await server.stop()
    server = await boot(home, overlay)
    await openTimeRemote(page, server.url)
    await openModule(page, '深度时间')
    await page.waitForFunction(() => document.querySelectorAll('.tb-hc.H').length === 4, undefined, { timeout: 30_000 })
    await page.getByRole('button', { name: '下一周' }).click()
    await page.waitForFunction(() => document.querySelectorAll('.tb-hc.H').length === 3, undefined, { timeout: 20_000 })

    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
    await server.stop()
  }
})

test('事项 opens a blank global main from the left Sidebar and returns to the same Conversation and right Sidebar', { timeout: 240_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-gtd-browser-'))
  const overlay = await writeOverlay(home)
  const server = await boot(home, overlay)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  collectPageErrors(page, errors)
  t.after(async () => { await browser.close(); await server.stop() })
  try {
    await openTimeRemote(page, server.url)
    const rightSession = page.locator('[data-sidebar-right-session]:has(.tb-app)').first()
    const sessionId = await rightSession.getAttribute('data-sidebar-right-session')
    assert.ok(sessionId, 'the Conversation has a retained right-Sidebar session')

    const entry = page.getByRole('button', { name: '小秘书-事项', exact: true })
    await entry.waitFor({ timeout: 30_000 })
    assert.equal(await entry.innerText(), '小秘书-事项', 'the expanded row shows its product label')
    assert.equal(await entry.locator('svg').count(), 1, 'the expanded row shows its icon')
    await entry.click()

    const main = page.getByRole('main', { name: '小秘书-事项', exact: true })
    await main.waitFor({ state: 'attached' })
    assert.equal(await entry.getAttribute('aria-current'), 'page')
    assert.equal(await entry.isVisible(), true, 'the DSH left Sidebar remains visible')
    assert.equal(await main.innerText(), '', 'the product main is deliberately blank')
    assert.equal(await main.locator('button, input, textarea, select, form, [role="region"]').count(), 0,
      'the blank main has no legacy GTD or OmniFocus controls')
    assert.equal(await page.locator('.tb-app:visible').count(), 0, 'a global main hides the right Sidebar')

    await page.locator(`[data-row-key="session:${sessionId}"]`).click()
    await page.locator('[data-composer-input]').waitFor()
    await page.locator('.tb-app').waitFor()
    assert.equal(await page.locator(`[data-row-key="session:${sessionId}"]`).getAttribute('aria-selected'), 'true',
      'workspace navigation restores the same Session')
    assert.equal(await page.getByRole('main', { name: '小秘书-事项', exact: true }).count(), 0)
    assert.equal(await rightSession.isVisible(), true, 'returning restores the same right Sidebar')

    await page.getByRole('button', { name: /^(收起侧边栏|Collapse sidebar)$/ }).click()
    await page.waitForFunction(() => [...document.querySelectorAll('button[aria-label="小秘书-事项"]')]
      .some(button => button.textContent === ''))
    assert.equal(await entry.innerText(), '', 'the collapsed row hides the label')
    assert.equal(await entry.locator('svg').count(), 1, 'the collapsed row retains the icon')
    await entry.click()
    await main.waitFor({ state: 'attached' })
    assert.equal(await main.innerText(), '')
    assert.deepEqual(errors, [])
  } catch (error) {
    t.diagnostic(server.output())
    t.diagnostic(errors.map(item => String(item)).join('\n'))
    t.diagnostic((await page.getByRole('button').allInnerTexts()).join(' | '))
    t.diagnostic(await page.locator('body').evaluate(() => [...document.querySelectorAll('*')]
      .flatMap(element => [...element.attributes]
        .filter(attribute => /main|panel/.test(attribute.name))
        .map(attribute => `${element.tagName} ${attribute.name}=${attribute.value}`)).slice(0, 100).join('\n')))
    await page.screenshot({ path: join(tmpdir(), 'secretary-gtd-entry-failure.png'), fullPage: true })
    throw error
  } finally {
    await browser.close()
    await server.stop()
  }
})

test('事项 product HMR unload and remount preserve Conversation, the Time product, domain Services, and cold start', { timeout: 300_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-gtd-hmr-'))
  const profile = await writeProfile(home)
  let server = await boot(home)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  collectPageErrors(page, errors)
  t.after(async () => { await browser.close(); await server.stop() })
  const entry = page.getByRole('button', { name: '小秘书-事项', exact: true })
  const main = page.getByRole('main', { name: '小秘书-事项', exact: true })
  try {
    await openTimeRemote(page, server.url)
    await entry.click()
    await main.waitFor({ state: 'attached' })
    let navigations = 0
    page.on('framenavigated', () => { navigations += 1 })

    await writeFile(profile, `${overlaySource(home)}\n- id: secretary-browser-gtd-ui\n  disabled: true\n`)
    await entry.waitFor({ state: 'detached', timeout: 30_000 })
    await main.waitFor({ state: 'detached' })
    assert.equal(await page.locator('[data-composer-input]').count(), 1,
      'unloading the active main returns to the retained Conversation')
    await page.locator('[data-time-remote][data-remote-state="ready"]').waitFor()
    const created = await domainFixture(page, 'create-tag', { name: '产品卸载后仍可写' })
    assert.equal(typeof created.tag.id, 'number', 'the Tag domain Service still writes after a product unloads')
    assert.equal(await page.locator('[data-time-remote]').count(), 1, 'the product unload leaves the independent Time product mounted')

    await writeFile(profile, overlaySource(home))
    await entry.waitFor({ timeout: 30_000 })
    assert.equal(await entry.count(), 1, 'remount restores exactly one launcher')
    await entry.click()
    await main.waitFor({ state: 'attached' })
    assert.equal(navigations, 0, 'official client HMR does not reload the page')

    await server.stop()
    server = await boot(home)
    await openTimeRemote(page, server.url)
    await entry.waitFor({ timeout: 30_000 })
    await entry.click()
    await main.waitFor({ state: 'attached' })
    assert.equal(await main.innerText(), '')
    assert.deepEqual(errors, [])
  } catch (error) {
    t.diagnostic(server.output())
    t.diagnostic(errors.map(item => String(item)).join('\n'))
    throw error
  } finally {
    await browser.close()
    await server.stop()
  }
})

test('both host themes drive the canvas tokens and produce no page errors', { timeout: 240_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-browser-'))
  const overlay = await writeOverlay(home)
  const server = await boot(home, overlay)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  collectPageErrors(page, errors)
  t.after(async () => { await browser.close(); await server.stop() })
  try {
    await openTimeRemote(page, server.url)
    const read = () => page.locator('.tb-app').evaluate(element => getComputedStyle(element).backgroundColor)
    const light = await read()
    await page.getByRole('button', { name: /^(Account menu|账户菜单)$/ }).first().click()
    await page.getByRole('menuitem', { name: /^(Settings|设置)$/ }).first().click()
    await page.getByRole('button', { name: /^(深色|Dark)$/ }).last().click()
    await page.waitForFunction(() => document.body.hasAttribute('data-ds-dark-theme'))
    const closer = page.getByRole('button', { name: /^(关闭|Close)/ }).last()
    if (await closer.count() > 0) await closer.click()
    await page.locator('.tb-app').waitFor()
    const dark = await read()
    assert.notEqual(light, dark, 'the shell follows the host theme instead of a fixed palette')
    assert.equal(await page.locator('.tb-cell').count(), 14 * 144)
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
    await server.stop()
  }
})

/** Call the real Connection/Gateway RPC envelope without using a Client stub. */
async function remoteCall(page, method, args) {
  return page.evaluate(async ({ method, args }) => {
    const response = await fetch(`/api/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: `test-${crypto.randomUUID()}`, method, payload: { args } }),
    })
    const envelope = await response.json()
    return envelope.result
  }, { method, args })
}

async function lifecycle(page, op) {
  return page.evaluate(async op => {
    const response = await fetch('/api/secretary-test.time-product', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op }),
    })
    const body = await response.text()
    if (!response.ok) throw new Error(`lifecycle ${op} failed (${response.status}): ${body}`)
    return JSON.parse(body)
  }, op)
}

test('Time Remote product covers cold-start real-canvas read/paint, strict errors, and Loader remount', { timeout: 180_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-time-remote-'))
  const overlay = await writeOverlay(home)
  const server = await boot(home, overlay)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  collectPageErrors(page, errors)
  t.after(async () => { await browser.close(); await server.stop() })
  try {
    await page.goto(server.url, { waitUntil: 'domcontentloaded' })
    await clearDialogs(page)
    const { work: tag } = await seedTags(page)
    await openTimeRemote(page, server.url)
    const legacyUrl = path => {
      const target = new URL(path, server.url)
      target.search = new URL(server.url).search
      return target.toString()
    }
    const legacyState = await page.context().request.get(legacyUrl('/api/secretary.state?anchor=2026-11-02&timeZone=Asia%2FShanghai'))
    const legacyCommand = await page.context().request.post(legacyUrl('/api/secretary.command'), { data: {} })
    assert.deepEqual([legacyState.status(), legacyCommand.status()], [404, 404],
      'the real Host no longer exposes aggregate state/command routes')
    assert.equal(await page.locator('[data-sidebar-right-guide-entry="secretary"]').count(), 0)
    assert.equal(await page.getByRole('region', { name: 'GTD 工作区' }).count(), 0)
    const product = page.locator('.tb-app[data-time-remote]')
    assert.equal(await product.locator('.tb-blk').count(), 0)
    assert.equal(await product.locator('.tb-day').count(), 14)
    await openModule(page, '深度时间')
    assert.equal(await product.locator('.tb-hc').count(), 168)
    await openModule(page, '实录')
    assert.equal(await product.locator('.tb-cat').filter({ hasText: '工作' }).count(), 1)
    const wrongWireType = await remoteCall(page, 'secretaryTime/paint', {
      input: {
        layer: 'actual', tagId: String(tag.id), timeZone: 'Asia/Shanghai',
        runs: [{ date: '2026-11-02', start: 480, end: 540 }],
      },
    })
    assert.equal(wrongWireType.ok, false)
    assert.equal(wrongWireType.error.code, 'gateway/input-invalid')
    const invalidDate = await remoteCall(page, 'secretaryTime/paint', {
      input: {
        layer: 'actual', tagId: tag.id, timeZone: 'Asia/Shanghai',
        runs: [{ date: '2026-02-31', start: 480, end: 540 }],
      },
    })
    assert.equal(invalidDate.ok, false)
    assert.equal(invalidDate.error.code, 'secretaryTime/invalid-input', JSON.stringify(invalidDate))
    const empty = await remoteCall(page, 'secretaryTime/readWindow', {
      input: { anchor: '2026-11-02', timeZone: 'Asia/Shanghai' },
    })
    assert.equal(empty.ok, true)
    assert.deepEqual(empty.value.actual, [], 'wire and domain refusals must not enter the business write path')
    const today = localDate()
    await dragCells(page, today, 540, 540)
    await product.locator('.tb-cat').filter({ hasText: '工作' }).click()
    await product.locator('.tb-blk').waitFor()
    assert.equal(await product.locator('.tb-blk').count(), 1)
    assert.equal(await product.locator('.tb-blk span').innerText(), '工作')

    await openTimeRemote(page, server.url)
    assert.equal(await page.locator('[data-time-remote] .tb-blk').count(), 1)

    const removed = await lifecycle(page, 'remove')
    assert.equal(removed.product, false)
    assert.equal(removed.time, true)
    assert.equal(removed.actual.length, 1, 'the domain TimeService still reads SQLite after the product unloads')
    await page.locator('[data-time-remote]').waitFor({ state: 'detached', timeout: 30_000 })
    const unavailable = await remoteCall(page, 'secretaryTime/readWindow', {
      input: { anchor: '2026-11-02', timeZone: 'Asia/Shanghai' },
    })
    assert.equal(unavailable.ok, false)
    assert.equal(unavailable.error.code, 'gateway/definition-unavailable', 'strict descriptors must not fall back to SRC')

    const mounted = await lifecycle(page, 'mount')
    assert.equal(mounted.product, true, JSON.stringify(mounted))
    assert.equal(mounted.time, true)
    await page.locator('[data-time-remote][data-remote-state="ready"]').waitFor({ timeout: 30_000 })
    assert.equal(await page.locator('[data-time-remote] .tb-blk').count(), 1)

    assert.equal((await lifecycle(page, 'close-storage')).closed, true)
    await dragCells(page, today, 560, 560)
    await product.locator('.tb-cat').filter({ hasText: '工作' }).click()
    await product.locator('.tb-toast').filter({ hasText: 'Time paint could not be persisted' }).first().waitFor()
    assert.equal(await product.locator('.tb-head button[title="撤销"]').isDisabled(), true, 'failed paint must not push Undo')
    assert.equal(await product.locator('.tb-toast').filter({ hasText: '已上色' }).count(), 0, 'failed paint must not show success')
    assert.equal(await product.locator('.tb-blk').count(), 1, 'failed paint leaves the last successful projection intact')

    await dragCells(page, today, 540, 540)
    await product.locator(`.tb-blk[data-day="${today}"][data-min="540"]`).click({ button: 'right' })
    const failedSheet = product.locator('.tb-sheet')
    await failedSheet.locator('.tb-note').waitFor()
    await failedSheet.locator('.tb-note').fill('失败时保留编辑')
    // 详情没有保存按钮：备注在 400ms 防抖后自动写入，失败走既有错误/Toast 并保留输入。
    await product.locator('.tb-toast').filter({ hasText: 'Time updateBlock could not be persisted' }).first().waitFor()
    assert.equal(await failedSheet.count(), 1, 'failed update keeps the sheet open')
    assert.equal(await failedSheet.locator('.tb-note').inputValue(), '失败时保留编辑')
    assert.equal(await failedSheet.getByRole('button', { name: /完成|保存/ }).count(), 0, '详情没有完成/保存按钮')
    await failedSheet.getByRole('button', { name: '删除记录' }).click()
    await product.locator('.tb-toast').filter({ hasText: 'Time deleteBlock could not be persisted' }).first().waitFor()
    assert.equal(await failedSheet.count(), 1, 'failed delete also keeps the sheet open')
    assert.equal(await product.locator('.tb-toast').filter({ hasText: '已删除' }).count(), 0)
    await failedSheet.getByRole('button', { name: '删除记录' }).waitFor()

    const writeFailed = await remoteCall(page, 'secretaryTime/paint', {
      input: {
        layer: 'actual', tagId: tag.id, timeZone: 'Asia/Shanghai',
        runs: [{ date: localDate(), start: 560, end: 570 }],
      },
    })
    assert.equal(writeFailed.ok, false)
    assert.equal(writeFailed.error.code, 'secretaryTime/write-failed')
    assert.deepEqual(writeFailed.error.details, { operation: 'paint' })
    assert.equal('cause' in writeFailed.error, false, 'the original persistence cause must not cross the wire')
    assert.deepEqual(errors, [])
  } catch (error) {
    const browserErrors = errors.map(item => item.message).join('\n')
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nBrowser errors:\n${browserErrors}\nHost output:\n${server.output()}`, { cause: error })
  } finally {
    await browser.close()
    await server.stop()
  }
})

test('Time Remote product preserves editing, multi-day Undo, date navigation, and Plan isolation', { timeout: 240_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-ui-time-'))
  const overlay = await writeOverlay(home)
  const server = await boot(home, overlay)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  collectPageErrors(page, errors)
  t.after(async () => { await browser.close(); await server.stop() })
  const today = localDate()
  const tomorrow = localDate(new Date(Date.now() + 86_400_000))
  try {
    await page.goto(server.url, { waitUntil: 'domcontentloaded' })
    await clearDialogs(page)
    await seedTags(page)
    await openTimeRemote(page, server.url)
    const product = page.locator('.tb-app[data-time-remote]')

    const wrongWireType = await remoteCall(page, 'secretaryTime/updateBlock', {
      input: { layer: 'actual', id: '1', note: 'wrong type' },
    })
    assert.equal(wrongWireType.ok, false)
    assert.equal(wrongWireType.error.code, 'gateway/input-invalid')
    const notFound = await remoteCall(page, 'secretaryTime/deleteBlock', { input: { layer: 'actual', id: 999999 } })
    assert.equal(notFound.ok, false)
    assert.equal(notFound.error.code, 'secretaryTime/not-found')
    assert.deepEqual(notFound.error.details, { blockId: 999999 })
    assert.equal('cause' in notFound.error, false)
    const invalidDeep = await remoteCall(page, 'secretaryTime/paintDeep', {
      input: { weekStart: '2026-11-02', level: 'high', rects: [{ startWeekday: 1, startHour: 10, endWeekday: 1, endHour: 9 }] },
    })
    assert.equal(invalidDeep.ok, false)
    assert.equal(invalidDeep.error.code, 'secretaryTime/invalid-input')
    assert.deepEqual(invalidDeep.error.details, { operation: 'paintDeep' })

    await dragCells(page, today, 480, 530)
    await product.locator('.tb-cat').filter({ hasText: '工作' }).first().click()
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .tb-blk').length === 6)
    await dragCells(page, today, 480, 530)
    await product.locator(`.tb-blk[data-day="${today}"][data-min="480"]`).click({ button: 'right' })
    const sheet = product.locator('.tb-sheet')
    await sheet.locator('.tb-note').waitFor()
    await sheet.locator('.tb-note').fill('Remote 午饭')
    // 没有保存按钮：备注自动写入；画布块内文字仍是标签名。
    await page.waitForFunction(() => document.querySelector('[data-time-remote] .tb-blk')?.getAttribute('title')?.includes('Remote 午饭'),
      undefined, { timeout: 20_000 })
    assert.equal(await product.locator('.tb-blk span').first().innerText(), '工作', '备注不上画布')
    await page.keyboard.press('Escape')
    await sheet.waitFor({ state: 'detached' })
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .tb-blk').length === 6)
    await product.locator(`.tb-blk[data-day="${today}"][data-min="480"]`).click({ button: 'right' })
    await sheet.locator('.tb-note').waitFor()
    assert.equal(await sheet.locator('.tb-note').inputValue(), 'Remote 午饭', '重开详情读到已自动写入的备注')
    await page.keyboard.press('Escape')
    await sheet.waitFor({ state: 'detached' })

    await chooseTimeView(page, '计划')
    assert.equal(await product.locator('.tb-blk').count(), 0)
    await dragCells(page, today, 600, 650)
    await product.locator('.tb-cat').filter({ hasText: '生活' }).first().click()
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .tb-blk').length === 6)
    await dragCells(page, today, 600, 650)
    await product.locator(`.tb-blk[data-day="${today}"][data-min="600"]`).click({ button: 'right' })
    await sheet.getByRole('button', { name: '删除记录' }).click()
    await sheet.waitFor({ state: 'detached' })
    assert.equal(await product.locator('.tb-blk').count(), 0)
    await chooseTimeView(page, '实录')
    assert.equal(await product.locator('.tb-blk').count(), 6, 'Plan edit/delete leaves Actual untouched')

    await product.locator(`.tb-cell[data-day="${today}"][data-min="620"]`).click()
    await product.locator(`.tb-cell[data-day="${tomorrow}"][data-min="620"]`).click()
    assert.match(await product.locator('.tb-sel-badge').innerText(), /20 分/)
    await product.locator('.tb-cat').filter({ hasText: '工作' }).first().click()
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .tb-blk').length === 8)
    await product.locator(`.tb-blk[data-day="${today}"][data-min="620"]`).click()
    await product.locator(`.tb-blk[data-day="${tomorrow}"][data-min="620"]`).click()
    await page.keyboard.press('Delete')
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .tb-blk').length === 6)
    await product.locator('.tb-head button[title="撤销"]').click()
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .tb-blk').length === 8)

    const before = await product.locator('.tb-daylabel').innerText()
    await page.keyboard.press('ArrowRight')
    await page.waitForFunction(label => document.querySelector('[data-time-remote] .tb-daylabel')?.textContent !== label, before)
    await page.keyboard.press('PageDown')
    await pickDay(page, '2026-01-15')
    await product.locator('.tb-day[data-day="2026-01-15"]').waitFor()

    assert.equal((await lifecycle(page, 'close-storage')).closed, true)
    await product.locator('.tb-head button[title="撤销"]').click()
    await product.locator('.tb-toast').filter({ hasText: 'Time replaceDay could not be persisted' }).first().waitFor()
    assert.equal(await product.locator('.tb-toast').filter({ hasText: '已撤销' }).count(), 0, 'failed multi-day Undo never reports success')
    assert.deepEqual(errors, [])
  } catch (error) {
    t.diagnostic(server.output())
    t.diagnostic(errors.map(item => String(item)).join('\n'))
    throw error
  } finally {
    await browser.close()
    await server.stop()
  }
})

test('Time Remote product preserves DeepTime inheritance, restart, host themes, and narrow layout', { timeout: 300_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-time-deep-'))
  const overlay = await writeOverlay(home)
  let server = await boot(home, overlay)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  collectPageErrors(page, errors)
  t.after(async () => { await browser.close(); await server.stop() })
  try {
    await openTimeRemote(page, server.url)
    const product = page.locator('.tb-app[data-time-remote]')
    await openModule(page, '深度时间')
    await product.locator('.tb-hc').first().waitFor()
    const start = await product.locator('.tb-hc[data-k="1-9"]').boundingBox()
    const end = await product.locator('.tb-hc[data-k="2-10"]').boundingBox()
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
    await page.mouse.down()
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 6 })
    await page.mouse.up()
    assert.match(await product.locator('.tb-sel-badge').innerText(), /4 小时/)
    await product.locator('.tb-cat').filter({ hasText: '高' }).click()
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .tb-hc.H').length === 4)
    await product.getByRole('button', { name: '下一周' }).click()
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .tb-hc.H').length === 4)
    await product.locator('.tb-shelf').filter({ hasText: '继承自更早一周' }).waitFor()
    assert.match(await product.locator('.tb-shelf').innerText(), /继承自更早一周/)
    await product.locator('.tb-hc[data-k="1-9"]').click()
    await page.keyboard.press('Delete')
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .tb-hc.H').length === 3)
    await product.getByRole('button', { name: '上一周' }).click()
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .tb-hc.H').length === 4)
    await pickDay(page, '2026-10-14')
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .tb-hc.H').length === 0)

    await server.stop()
    server = await boot(home, overlay)
    await openTimeRemote(page, server.url)
    await openModule(page, '深度时间')
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .tb-hc.H').length === 4)
    await page.getByRole('button', { name: '下一周' }).click()
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .tb-hc.H').length === 3)

    await openModule(page, '实录')
    const read = () => product.evaluate(element => getComputedStyle(element).backgroundColor)
    const light = await read()
    await page.getByRole('button', { name: /^(Account menu|账户菜单)$/ }).first().click()
    await page.getByRole('menuitem', { name: /^(Settings|设置)$/ }).first().click()
    await page.getByRole('button', { name: /^(深色|Dark)$/ }).last().click()
    await page.waitForFunction(() => document.body.hasAttribute('data-ds-dark-theme'))
    const closer = page.getByRole('button', { name: /^(关闭|Close)/ }).last()
    if (await closer.count() > 0) await closer.click()
    await product.waitFor()
    assert.notEqual(await read(), light)
    await page.setViewportSize({ width: 720, height: 700 })
    assert.ok((await product.boundingBox()).width < 720)
    assert.equal(await product.locator('.tb-cell').count(), 14 * 144)
    assert.deepEqual(errors, [])
  } catch (error) {
    t.diagnostic(server.output())
    t.diagnostic(errors.map(item => String(item)).join('\n'))
    throw error
  } finally {
    await browser.close()
    await server.stop()
  }
})


