import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

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
    if (/ERR_INCOMPLETE_CHUNKED_ENCODING|ERR_CONNECTION_REFUSED/.test(message.text())) return
    if (/Failed to load resource: the server responded with a status of 500/.test(message.text())) return
    errors.push(new Error(`console.error: ${message.text()}`))
  })
}

async function clearDialogs(page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const dialog = page.getByRole('dialog').last()
    if (await dialog.count() === 0 || !await dialog.isVisible()) return
    let clicked = false
    for (const label of ['继续', '知道了', '关闭', '已完成', '稍后', 'Continue', 'Got it', 'Close', 'Done', 'Later']) {
      const button = dialog.getByRole('button', { name: label, exact: true })
      if (await button.count() > 0 && await button.isVisible()) { await button.click(); clicked = true; break }
    }
    if (!clicked) return
  }
}

/** Reach the product: a session on screen, the right Sidebar open, and its tab showing. */
async function openProduct(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2_000)
  await clearDialogs(page)
  const newSession = page.getByRole('button', { name: /^(新建会话|New session|New Session)$/ }).first()
  if (await newSession.count() > 0) await newSession.click()
  await page.locator('[data-composer-input][contenteditable="true"]').first().waitFor({ timeout: 30_000 })
  const shell = page.locator('.sec-shell')
  if (await shell.count() === 0) {
    const openSidebar = page.getByRole('button', { name: /^(Open right sidebar|打开右侧边栏)$/ })
    if (await openSidebar.count() > 0 && await openSidebar.isVisible()) await openSidebar.click()
    await page.waitForTimeout(700)
    const capsule = page.locator('[data-sidebar-right-guide-entry="secretary"]')
    if (await capsule.count() > 0) await capsule.click()
    await page.waitForTimeout(1_500)
  }
  await shell.waitFor({ timeout: 30_000 })
}

async function command(page, body) {
  return page.evaluate(async payload => {
    const response = await fetch('/api/secretary.command', {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload),
    })
    const parsed = await response.json()
    if (!response.ok) throw new Error(parsed.error ?? `command failed (${response.status})`)
    return parsed
  }, body)
}

/** The time tag tree every test paints with. */
async function seedTags(page) {
  const work = await command(page, { domain: 'tag', op: 'create', name: '工作', kind: 'time', color: '#477bc7' })
  const life = await command(page, { domain: 'tag', op: 'create', name: '生活', kind: 'time', color: '#317b68' })
  await command(page, { domain: 'tag', op: 'create', name: '睡眠', kind: 'time', color: '#5d6b8a', parentId: life.tag.id })
  const meal = await command(page, { domain: 'tag', op: 'create', name: '吃饭', kind: 'time', color: '#d08a3e', parentId: life.tag.id })
  return { work: work.tag, life: life.tag, meal: meal.tag }
}

async function dragCells(page, day, from, to) {
  const start = await page.locator(`.sec-cell[data-day="${day}"][data-min="${from}"]`).boundingBox()
  const end = await page.locator(`.sec-cell[data-day="${day}"][data-min="${to}"]`).boundingBox()
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 6 })
  await page.mouse.up()
}

/** Open the header calendar and pick one date, walking months when it is not on screen. */
async function pickDay(page, iso) {
  await page.locator('.sec-daylabel').click()
  const target = iso.slice(0, 7)
  for (let attempt = 0; attempt < 36; attempt += 1) {
    const title = await page.locator('.sec-picker-title').innerText()
    const digits = title.replace(/[^0-9]/g, '')
    const current = `${digits.slice(0, 4)}-${digits.slice(4, 6).padStart(2, '0')}`
    if (current === target) break
    await page.locator(`.sec-picker-nav[aria-label="${current < target ? '下一月' : '上一月'}"]`).click()
  }
  await page.locator(`.sec-picker-day[data-day="${iso}"]`).click()
}

async function openModule(page, name) {
  await page.getByRole('button', { name: '一级模块' }).click()
  await page.getByRole('button', { name, exact: true }).click()
  await page.waitForTimeout(600)
}

async function chooseTimeView(page, name) {
  await page.locator('.sec-title').click()
  await page.locator('.sec-smenu button').filter({ hasText: name }).click()
}

function overlaySource(home, extra = []) {
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
    `      name: 'file://${join(ROOT, 'packages/secretary/node_modules/@deepseek-ai/dsh-storage-sqlite/lib/index.js')}'`,
    '      config:',
    `        path: ${join(home, 'secretary.sqlite')}`,
    '      journalMode: delete',
    "    - id: secretary-browser-storage",
    `      name: 'file://${join(ROOT, 'packages/storage/lib/index.js')}'`,
    "    - id: secretary-browser-goal",
    `      name: 'file://${join(ROOT, 'packages/goal/lib/index.js')}'`,
    "    - id: secretary-browser-tag",
    `      name: 'file://${join(ROOT, 'packages/tag/lib/index.js')}'`,
    "    - id: secretary-browser-gtd",
    `      name: 'file://${join(ROOT, 'packages/gtd/lib/index.js')}'`,
    "    - id: secretary-browser-time",
    `      name: 'file://${join(ROOT, 'packages/time-block/lib/index.js')}'`,
    "    - id: secretary-browser-panel",
    `      name: 'file://${join(ROOT, 'packages/panel/lib/index.js')}'`,
    "    - id: secretary-browser-gtd-panel",
    `      name: 'file://${join(ROOT, 'packages/gtd-panel/lib/index.js')}'`,
    ...extra,
    '',
  ].join('\n')
}

async function writeOverlay(home, includeTimeRemote = false) {
  const overlay = join(home, 'overlay.yml')
  const extra = []
  if (includeTimeRemote) {
    const profile = join(home, 'profiles', 'web')
    await mkdir(join(profile, 'node_modules'), { recursive: true })
    const packageDir = join(ROOT, 'packages/time-panel')
    await symlink(packageDir, join(profile, 'node_modules/dsh-secretary-time-panel'), 'dir')
    await writeFile(join(profile, 'package.json'), JSON.stringify({
      name: 'dsh-profile-web', private: true,
      dependencies: { 'dsh-secretary-time-panel': `link:${packageDir}` },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
    }, null, 2))
    extra.push(
      "    - id: secretary-browser-time-panel",
      "      name: 'dsh-secretary-time-panel'",
      "    - id: secretary-browser-time-tools",
      `      name: 'file://${join(ROOT, 'packages/time-block/lib/tools.js')}'`,
      "    - id: secretary-browser-time-lifecycle-fixture",
      `      name: 'file://${join(home, 'time-product-lifecycle.mjs')}'`,
    )
    await writeFile(join(home, 'time-product-lifecycle.mjs'), `
      export const inject = ['connection', 'loader', 'time', 'tools', 'secretaryStorageDomain']
      export function apply(ctx) {
        ctx.effect(() => ctx.connection.fetch.register({
          path: '/api/secretary-test.time-product', methods: ['POST'], requestBody: 'buffered',
          async fetch(request) {
            try {
              const input = await request.json()
              const entry = [...ctx.loader.entries()].find(item => item.options.name === 'dsh-secretary-time-panel')
              if (input.op === 'remove') {
                const fiber = entry?.fiber
                if (entry) ctx.loader.remove(entry.id)
                await fiber?.dispose()
                await ctx.loader.await()
              } else if (input.op === 'mount') {
                if (!entry || entry.fiber?.state === 4) {
                  const id = await ctx.loader.create({ name: 'dsh-secretary-time-panel' })
                  await ctx.loader.resolve(id).fiber
                }
                await ctx.loader.await()
              }
              if (input.op === 'close-storage') {
                await ctx.secretaryStorageDomain.closeAll()
                return Response.json({ closed: true })
              }
              const tool = ctx.get('tools')?.get('secretary_time')
              const fromTool = tool ? await tool.execute({ op: 'actual.list', timeZone: 'Asia/Shanghai' }) : undefined
              return Response.json({
                product: ctx.get('timeProduct') !== undefined,
                time: ctx.get('time') !== undefined,
                tool: tool !== undefined,
                actual: fromTool?.blocks,
                entries: [...ctx.loader.entries()].filter(item => item.options.name === 'dsh-secretary-time-panel').map(item => ({ id: item.id, state: item.fiber?.state, error: item.fiber?.error?.message })),
              })
            } catch (error) {
              return Response.json({ error: String(error), stack: error?.stack }, { status: 500 })
            }
          },
        }), 'test-only Time product lifecycle fixture')
      }
    `)
  }
  await writeFile(overlay, overlaySource(home, extra))
  return overlay
}

/** Use the watched profile patch when a test exercises real configuration HMR. */
async function writeProfile(home) {
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
    await openProduct(page, server.url)
    await seedTags(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openProduct(page, server.url)

    assert.equal(await page.locator('.sec-shell').count(), 1, 'the product is one panel')
    assert.equal(await page.locator('.sec-day').count(), 14, 'the canvas opens with two weeks of days around today')
    assert.equal(await page.locator('.sec-cell').count(), 14 * 144, 'each day is 24 hours of ten-minute cells')
    const box = await page.locator('.sec-shell').boundingBox()
    assert.ok(box.width < 900, `the product stays in the narrow right column, got ${box.width}`)

    const today = localDate()
    assert.equal(await page.locator(`.sec-day[data-day="${today}"] .sec-datemark .today`).count(), 1, "today's column is marked")
    assert.equal(await page.locator('.sec-cat').count(), 4, 'the shelf lists every time tag, nested ones included')

    await openModule(page, '深度时间')
    assert.equal(await page.locator('.sec-hc').count(), 7 * 24, '深度时间 draws seven days by twenty-four hours')
    await openModule(page, '时间块')
    assert.equal(await page.locator('.sec-cell').count(), 14 * 144, 'the drawer returns to 时间块')

    await chooseTimeView(page, '计划')
    await page.locator('.sec-title .tsub', { hasText: '计划' }).waitFor()
    await chooseTimeView(page, '实录')
    await page.locator('.sec-title .tsub', { hasText: '实录' }).waitFor()

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
    await openProduct(page, server.url)
    const canvas = page.locator('.sec-scroll')
    const days = () => page.locator('.sec-day').count()
    const opening = await days()

    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -30_000)
    await page.waitForFunction(count => document.querySelectorAll('.sec-day').length > count, opening, { timeout: 20_000 })

    await page.mouse.wheel(0, 60_000)
    const grown = await days()
    await page.waitForFunction(count => document.querySelectorAll('.sec-day').length > count, grown, { timeout: 20_000 })

    await page.mouse.wheel(0, -30_000)
    await page.waitForTimeout(1_200)
    const anchored = await page.locator('.sec-daylabel').innerText()
    const topDay = await page.evaluate(() => {
      const scroll = document.querySelector('.sec-scroll')
      const columns = [...document.querySelectorAll('.sec-day')]
      let top = ''
      for (const column of columns) {
        if (column.offsetTop <= scroll.scrollTop + 1) top = column.dataset.day
        else break
      }
      return top
    })
    const [year, month, day] = topDay.split('-').map(Number)
    assert.ok(anchored.includes(`${month}月${day}日`), `the header names the day at the top edge, got ${anchored} for ${topDay}`)
    assert.ok(topDay !== localDate(), 'scrolling away from today moves that label')

    // Arrow keys step one day, PageUp / PageDown step a week, and 计划 opens on the same day.
    const before = await page.locator('.sec-daylabel').innerText()
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(600)
    assert.notEqual(await page.locator('.sec-daylabel').innerText(), before, '→ moves the canvas one day')
    await page.keyboard.press('PageDown')
    await page.waitForTimeout(600)
    await chooseTimeView(page, '计划')
    await page.waitForTimeout(600)
    const planTop = await page.locator('.sec-daylabel').innerText()
    await chooseTimeView(page, '实录')
    await page.waitForTimeout(600)
    assert.equal(await page.locator('.sec-daylabel').innerText(), planTop, '计划 opens on the day 实录 was reading')

    await pickDay(page, '2026-01-15')
    await page.locator('.sec-day[data-day="2026-01-15"]').waitFor({ timeout: 20_000 })
    const target = await page.locator('.sec-day[data-day="2026-01-15"]').boundingBox()
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
    await openProduct(page, server.url)
    await seedTags(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openProduct(page, server.url)

    await dragCells(page, today, 480, 530)
    assert.match(await page.locator('.sec-status').innerText(), /选择了\s*60\s*分钟/, 'dragging selects ten-minute cells')
    assert.equal(await page.locator('.sec-selbox').count(), 1, 'one hour of selection is one ring')

    await page.locator('.sec-cat').filter({ hasText: '工作' }).first().click()
    await page.waitForFunction(() => document.querySelectorAll('.sec-blk').length === 6)
    assert.equal(await page.locator('.sec-blk span').first().innerText(), '工作', 'every painted cell carries the label')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openProduct(page, server.url)
    await page.waitForFunction(() => document.querySelectorAll('.sec-blk').length === 6, undefined, { timeout: 30_000 })

    await dragCells(page, today, 480, 530)
    await page.locator('.sec-sb').filter({ hasText: '不选' }).click()
    assert.equal(await page.locator('.sec-selbox').count(), 0, '不选 clears the ring')

    await dragCells(page, today, 480, 530)
    await page.keyboard.press('Delete')
    await page.waitForFunction(() => document.querySelectorAll('.sec-blk').length === 0)

    await page.locator('.sec-head button[title="撤销"]').click()
    await page.waitForFunction(() => document.querySelectorAll('.sec-blk').length === 6)

    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
    await server.stop()
  }
})

test('the 备注 sheet changes a record, and 计划 paints its own layer without touching 实录', { timeout: 240_000 }, async (t) => {
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
    await openProduct(page, server.url)
    await seedTags(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openProduct(page, server.url)

    await dragCells(page, today, 480, 530)
    await page.locator('.sec-cat').filter({ hasText: '工作' }).first().click()
    await page.waitForFunction(() => document.querySelectorAll('.sec-blk').length === 6)

    await dragCells(page, today, 480, 530)
    assert.match(await page.locator('.sec-status').innerText(), /工作/, 'a whole record shows its category')
    await page.locator('.sec-sb').filter({ hasText: '备注' }).click()
    const sheet = page.locator('.sec-sheet')
    await sheet.waitFor()
    await sheet.locator('.sec-picks button').filter({ hasText: '吃饭' }).click()
    await sheet.locator('.sec-note').fill('午饭')
    await sheet.getByRole('button', { name: '完成' }).click()
    await page.waitForFunction(() => document.querySelectorAll('.sec-blk span')[0]?.textContent === '午饭')

    await chooseTimeView(page, '计划')
    await page.waitForTimeout(400)
    assert.equal(await page.locator('.sec-blk').count(), 0, '实录 blocks never leak into the plan layer')
    await dragCells(page, today, 600, 650)
    await page.locator('.sec-cat').filter({ hasText: '生活' }).first().click()
    await page.waitForFunction(() => document.querySelectorAll('.sec-blk').length === 6)

    await chooseTimeView(page, '实录')
    await page.waitForTimeout(400)
    assert.equal(await page.locator('.sec-blk span').first().innerText(), '午饭', 'plan painting leaves 实录 alone')

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
    await openProduct(page, server.url)
    await openModule(page, '深度时间')
    await page.locator('.sec-hc').first().waitFor()
    await page.waitForTimeout(500)

    const start = await page.locator('.sec-hc[data-k="1-9"]').boundingBox()
    const end = await page.locator('.sec-hc[data-k="2-10"]').boundingBox()
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
    await page.mouse.down()
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 6 })
    await page.mouse.up()
    assert.match(await page.locator('.sec-deep-status').innerText(), /选择了\s*4\s*格/, 'dragging makes a rectangle')
    await page.locator('.sec-cat').filter({ hasText: 'high' }).first().click()
    await page.waitForFunction(() => document.querySelectorAll('.sec-hc.H').length === 4)

    await page.getByRole('button', { name: '下一周' }).click()
    await page.waitForFunction(() => document.querySelectorAll('.sec-hc.H').length === 4, undefined, { timeout: 20_000 })

    const erase = await page.locator('.sec-hc[data-k="1-9"]').boundingBox()
    await page.mouse.move(erase.x + erase.width / 2, erase.y + erase.height / 2)
    await page.mouse.down()
    await page.mouse.up()
    await page.locator('.sec-sb.erase').click()
    await page.waitForFunction(() => document.querySelectorAll('.sec-hc.H').length === 3)

    await page.getByRole('button', { name: '上一周' }).click()
    await page.waitForFunction(() => document.querySelectorAll('.sec-hc.H').length === 4, undefined, { timeout: 20_000 })

    // The header week control jumps to any week, and an untouched week starts empty.
    await pickDay(page, '2026-10-14')
    await page.waitForFunction(() => document.querySelectorAll('.sec-hc.H').length === 0, undefined, { timeout: 20_000 })
    assert.match(await page.locator('.sec-daylabel').innerText(), /10月12日\s*–\s*10月18日/, 'the header names the week it shows')
    await page.screenshot({ path: join(tmpdir(), 'secretary-deep-week.png') })

    await server.stop()
    server = await boot(home, overlay)
    await openProduct(page, server.url)
    await openModule(page, '深度时间')
    await page.waitForFunction(() => document.querySelectorAll('.sec-hc.H').length === 4, undefined, { timeout: 30_000 })
    await page.getByRole('button', { name: '下一周' }).click()
    await page.waitForFunction(() => document.querySelectorAll('.sec-hc.H').length === 3, undefined, { timeout: 20_000 })

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
    await openProduct(page, server.url)
    const rightSession = page.locator('[data-sidebar-right-session]:has(.sec-shell)').first()
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
    assert.equal(await page.locator('.sec-shell:visible').count(), 0, 'a global main hides the right Sidebar')

    await page.locator(`[data-row-key="session:${sessionId}"]`).click()
    await page.locator('[data-composer-input]').waitFor()
    await page.locator('.sec-shell').waitFor()
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

test('事项 product HMR unload and remount preserve Conversation, legacy panels, and cold start', { timeout: 300_000 }, async (t) => {
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
    await openProduct(page, server.url)
    await entry.click()
    await main.waitFor({ state: 'attached' })
    let navigations = 0
    page.on('framenavigated', () => { navigations += 1 })

    await writeFile(profile, `${overlaySource(home)}\n- id: secretary-browser-gtd-panel\n  disabled: true\n`)
    await entry.waitFor({ state: 'detached', timeout: 30_000 })
    await main.waitFor({ state: 'detached' })
    await page.locator('.sec-shell').waitFor()
    assert.equal(await page.locator('[data-composer-input]').count(), 1,
      'unloading the active main returns to the retained Conversation')
    await openModule(page, '事项')
    await page.getByRole('region', { name: 'GTD 工作区' }).waitFor()
    await openModule(page, '时间块')
    const captured = await command(page, {
      domain: 'gtd', op: 'inbox.capture', title: 'GTD 产品卸载后仍捕获', raw: '领域能力独立', source: 'browser-test',
    })
    assert.equal(typeof captured.item.id, 'number', 'the existing GTD Host route still writes after product unload')

    await writeFile(profile, overlaySource(home))
    await entry.waitFor({ timeout: 30_000 })
    assert.equal(await entry.count(), 1, 'remount restores exactly one launcher')
    await entry.click()
    await main.waitFor({ state: 'attached' })
    assert.equal(navigations, 0, 'official client HMR does not reload the page')

    await server.stop()
    server = await boot(home)
    await openProduct(page, server.url)
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

test('事项 captures into the Inbox inside the same product shell', { timeout: 240_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-browser-'))
  const overlay = await writeOverlay(home)
  const server = await boot(home, overlay)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  collectPageErrors(page, errors)
  t.after(async () => { await browser.close(); await server.stop() })
  try {
    await openProduct(page, server.url)
    await openModule(page, '事项')
    const workspace = page.getByRole('region', { name: 'GTD 工作区' })
    await workspace.waitFor()
    const form = workspace.getByRole('region', { name: 'Inbox 视图' })
    await form.waitFor()
    await form.locator('input').first().fill('把时间块接进右栏')
    await form.locator('textarea').first().fill('右栏 tab 打开就是时间块')
    await form.getByRole('button', { name: '捕获到 Inbox' }).click()
    await workspace.getByRole('button', { name: '澄清 把时间块接进右栏' }).waitFor()
    assert.deepEqual(errors, [])
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
    await openProduct(page, server.url)
    const read = () => page.locator('.sec-shell').evaluate(element => getComputedStyle(element).backgroundColor)
    const light = await read()
    await page.getByRole('button', { name: /^(Account menu|账户菜单)$/ }).first().click()
    await page.getByRole('menuitem', { name: /^(Settings|设置)$/ }).first().click()
    await page.getByRole('button', { name: /^(深色|Dark)$/ }).last().click()
    await page.waitForFunction(() => document.body.hasAttribute('data-ds-dark-theme'))
    const closer = page.getByRole('button', { name: /^(关闭|Close)/ }).last()
    if (await closer.count() > 0) await closer.click()
    await page.locator('.sec-shell').waitFor()
    const dark = await read()
    assert.notEqual(light, dark, 'the shell follows the host theme instead of a fixed palette')
    assert.equal(await page.locator('.sec-cell').count(), 14 * 144)
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

/** Open only the new product; its first render must succeed without a retry or fixed sleep. */
async function openTimeRemote(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await clearDialogs(page)
  await page.getByText(/^(Default workspace|默认工作区)$/).first().waitFor({ timeout: 15_000 })
  const newSession = page.getByRole('button', { name: /^(新建会话|New session|New Session)$/ }).first()
  await newSession.waitFor({ timeout: 15_000 })
  await newSession.click()
  await page.waitForFunction(() => document.querySelector('[data-time-remote]') !== null
    || [...document.querySelectorAll('button')].some(button => ['New tab', 'Open right sidebar', '打开右侧边栏'].includes(button.getAttribute('aria-label') ?? '')),
    undefined, { timeout: 30_000 })
  if (await page.locator('[data-time-remote]').count() === 0) {
    const openSidebar = page.getByRole('button', { name: /^(Open right sidebar|打开右侧边栏)$/ })
    if (await openSidebar.count() > 0) await openSidebar.click()
    const tab = page.getByRole('button', { name: /^小秘书-时间块/ }).first()
    const newTab = page.getByRole('button', { name: 'New tab', exact: true })
    if (await tab.count() === 0 && await newTab.count() > 0) await newTab.click()
    await tab.waitFor({ timeout: 15_000 })
    await tab.click()
  }
  await page.locator('[data-time-remote][data-remote-state="ready"]').waitFor({ timeout: 30_000 })
}

test('Time Remote product covers cold-start real-canvas read/paint, strict errors, and Loader remount', { timeout: 180_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-time-remote-'))
  const overlay = await writeOverlay(home, true)
  const server = await boot(home, overlay)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  collectPageErrors(page, errors)
  t.after(async () => { await browser.close(); await server.stop() })
  try {
    await page.goto(server.url, { waitUntil: 'domcontentloaded' })
    await clearDialogs(page)
    const { tag } = await command(page, { domain: 'tag', op: 'create', name: 'Remote 工作', kind: 'time' })
    await openTimeRemote(page, server.url)
    const product = page.locator('.sec-shell[data-time-remote]')
    assert.equal(await product.locator('.sec-blk').count(), 0)
    assert.equal(await product.locator('.sec-day').count(), 14)
    await openModule(page, '深度时间')
    assert.equal(await product.locator('.sec-hc').count(), 168)
    await openModule(page, '时间块')
    assert.equal(await product.locator('.sec-cat').filter({ hasText: 'Remote 工作' }).count(), 1)
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
    await product.locator('.sec-cat').filter({ hasText: 'Remote 工作' }).click()
    await product.locator('.sec-blk').waitFor()
    assert.equal(await product.locator('.sec-blk').count(), 1)
    assert.equal(await product.locator('.sec-blk span').innerText(), 'Remote 工作')

    await openTimeRemote(page, server.url)
    assert.equal(await page.locator('[data-time-remote] .sec-blk').count(), 1)

    const removed = await lifecycle(page, 'remove')
    assert.equal(removed.product, false)
    assert.equal(removed.time, true)
    assert.equal(removed.tool, true)
    assert.equal(removed.actual.length, 1, 'the Agent tool still reads SQLite after the product unloads')
    await page.locator('[data-time-remote]').waitFor({ state: 'detached', timeout: 30_000 })
    const unavailable = await remoteCall(page, 'secretaryTime/readWindow', {
      input: { anchor: '2026-11-02', timeZone: 'Asia/Shanghai' },
    })
    assert.equal(unavailable.ok, false)
    assert.equal(unavailable.error.code, 'gateway/definition-unavailable', 'strict descriptors must not fall back to SRC')

    const mounted = await lifecycle(page, 'mount')
    assert.equal(mounted.product, true, JSON.stringify(mounted))
    assert.equal(mounted.time, true)
    assert.equal(mounted.tool, true)
    await page.locator('[data-time-remote][data-remote-state="ready"]').waitFor({ timeout: 30_000 })
    assert.equal(await page.locator('[data-time-remote] .sec-blk').count(), 1)

    assert.equal((await lifecycle(page, 'close-storage')).closed, true)
    await dragCells(page, today, 560, 560)
    await product.locator('.sec-cat').filter({ hasText: 'Remote 工作' }).click()
    await product.locator('.sec-toast').filter({ hasText: 'Time paint could not be persisted' }).first().waitFor()
    assert.equal(await product.locator('.sec-head button[title="撤销"]').isDisabled(), true, 'failed paint must not push Undo')
    assert.equal(await product.locator('.sec-toast').filter({ hasText: '已上色' }).count(), 0, 'failed paint must not show success')
    assert.equal(await product.locator('.sec-blk').count(), 1, 'failed paint leaves the last successful projection intact')

    await dragCells(page, today, 540, 540)
    await product.locator('.sec-sb').filter({ hasText: '备注' }).click()
    const failedSheet = product.locator('.sec-sheet')
    await failedSheet.locator('.sec-note').fill('失败时保留编辑')
    await failedSheet.getByRole('button', { name: '完成' }).click()
    await product.locator('.sec-toast').filter({ hasText: 'Time updateBlock could not be persisted' }).first().waitFor()
    assert.equal(await failedSheet.count(), 1, 'failed update keeps the sheet open')
    assert.equal(await failedSheet.locator('.sec-note').inputValue(), '失败时保留编辑')
    await failedSheet.getByRole('button', { name: '删除' }).click()
    await product.locator('.sec-toast').filter({ hasText: 'Time deleteBlock could not be persisted' }).first().waitFor()
    assert.equal(await failedSheet.count(), 1, 'failed delete also keeps the sheet open')
    assert.equal(await product.locator('.sec-toast').filter({ hasText: '已删除' }).count(), 0)
    await failedSheet.getByRole('button', { name: '删除' }).waitFor()

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
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-time-ui-'))
  const overlay = await writeOverlay(home, true)
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
    const product = page.locator('.sec-shell[data-time-remote]')

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
    await product.locator('.sec-cat').filter({ hasText: '工作' }).first().click()
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .sec-blk').length === 6)
    await dragCells(page, today, 480, 530)
    await product.locator('.sec-sb').filter({ hasText: '备注' }).click()
    const sheet = product.locator('.sec-sheet')
    await sheet.locator('.sec-step').nth(1).click()
    await sheet.locator('.sec-picks button').filter({ hasText: '吃饭' }).click()
    await sheet.locator('.sec-note').fill('Remote 午饭')
    await sheet.getByRole('button', { name: '完成' }).click()
    await sheet.waitFor({ state: 'detached' })
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .sec-blk').length === 7)
    assert.equal(await product.locator('.sec-blk span').first().innerText(), 'Remote 午饭')

    await chooseTimeView(page, '计划')
    await product.locator('.sec-title .tsub').filter({ hasText: '计划' }).waitFor()
    assert.equal(await product.locator('.sec-blk').count(), 0)
    await dragCells(page, today, 600, 650)
    await product.locator('.sec-cat').filter({ hasText: '生活' }).first().click()
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .sec-blk').length === 6)
    await dragCells(page, today, 600, 650)
    await product.locator('.sec-sb').filter({ hasText: '备注' }).click()
    await sheet.getByRole('button', { name: '删除' }).click()
    await sheet.waitFor({ state: 'detached' })
    assert.equal(await product.locator('.sec-blk').count(), 0)
    await chooseTimeView(page, '实录')
    assert.equal(await product.locator('.sec-blk').count(), 7, 'Plan edit/delete leaves Actual untouched')

    await product.locator(`.sec-cell[data-day="${today}"][data-min="620"]`).click()
    await product.locator(`.sec-cell[data-day="${tomorrow}"][data-min="620"]`).click()
    assert.match(await product.locator('.sec-status').innerText(), /选择了\s*20\s*分钟/)
    await product.locator('.sec-cat').filter({ hasText: '工作' }).first().click()
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .sec-blk').length === 9)
    await product.locator(`.sec-cell[data-day="${today}"][data-min="620"]`).click()
    await product.locator(`.sec-cell[data-day="${tomorrow}"][data-min="620"]`).click()
    await page.keyboard.press('Delete')
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .sec-blk').length === 7)
    await product.locator('.sec-head button[title="撤销"]').click()
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .sec-blk').length === 9)

    const before = await product.locator('.sec-daylabel').innerText()
    await page.keyboard.press('ArrowRight')
    await page.waitForFunction(label => document.querySelector('[data-time-remote] .sec-daylabel')?.textContent !== label, before)
    await page.keyboard.press('PageDown')
    await pickDay(page, '2026-01-15')
    await product.locator('.sec-day[data-day="2026-01-15"]').waitFor()

    assert.equal((await lifecycle(page, 'close-storage')).closed, true)
    await product.locator('.sec-head button[title="撤销"]').click()
    await product.locator('.sec-toast').filter({ hasText: 'Time replaceDay could not be persisted' }).first().waitFor()
    assert.equal(await product.locator('.sec-toast').filter({ hasText: '已撤销' }).count(), 0, 'failed multi-day Undo never reports success')
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
  const overlay = await writeOverlay(home, true)
  let server = await boot(home, overlay)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  collectPageErrors(page, errors)
  t.after(async () => { await browser.close(); await server.stop() })
  try {
    await openTimeRemote(page, server.url)
    const product = page.locator('.sec-shell[data-time-remote]')
    await openModule(page, '深度时间')
    await product.locator('.sec-hc').first().waitFor()
    const start = await product.locator('.sec-hc[data-k="1-9"]').boundingBox()
    const end = await product.locator('.sec-hc[data-k="2-10"]').boundingBox()
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
    await page.mouse.down()
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 6 })
    await page.mouse.up()
    assert.match(await product.locator('.sec-deep-status').innerText(), /选择了\s*4\s*格/)
    await product.locator('.sec-cat').filter({ hasText: 'high' }).click()
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .sec-hc.H').length === 4)
    await product.getByRole('button', { name: '下一周' }).click()
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .sec-hc.H').length === 4)
    await product.locator('.sec-shelf').filter({ hasText: '继承自更早一周' }).waitFor()
    assert.match(await product.locator('.sec-shelf').innerText(), /继承自更早一周/)
    await product.locator('.sec-hc[data-k="1-9"]').click()
    await product.locator('.sec-sb.erase').click()
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .sec-hc.H').length === 3)
    await product.getByRole('button', { name: '上一周' }).click()
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .sec-hc.H').length === 4)
    await pickDay(page, '2026-10-14')
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .sec-hc.H').length === 0)

    await server.stop()
    server = await boot(home, overlay)
    await openTimeRemote(page, server.url)
    await openModule(page, '深度时间')
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .sec-hc.H').length === 4)
    await page.getByRole('button', { name: '下一周' }).click()
    await page.waitForFunction(() => document.querySelectorAll('[data-time-remote] .sec-hc.H').length === 3)

    await openModule(page, '时间块')
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
    assert.equal(await product.locator('.sec-cell').count(), 14 * 144)
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
