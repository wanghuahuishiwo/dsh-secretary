import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
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
  const child = spawn('dsh', ['web', '--patch', overlay, '--port', String(port), '--no-open'], {
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
  await page.waitForTimeout(1_200)
  const shell = page.locator('.sec-shell')
  if (await shell.count() === 0) {
    const openSidebar = page.getByRole('button', { name: /^(Open right sidebar|打开右侧边栏)$/ })
    if (await openSidebar.count() > 0 && await openSidebar.isVisible()) await openSidebar.click()
    await page.waitForTimeout(700)
    const capsule = page.getByRole('button', { name: /小秘书/ }).first()
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

async function writeOverlay(home) {
  const overlay = join(home, 'overlay.yml')
  await writeFile(overlay, [
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
    "    - id: secretary-browser-tag",
    `      name: 'file://${join(ROOT, 'packages/tag/lib/index.js')}'`,
    "    - id: secretary-browser-gtd",
    `      name: 'file://${join(ROOT, 'packages/gtd/lib/index.js')}'`,
    "    - id: secretary-browser-time",
    `      name: 'file://${join(ROOT, 'packages/time-block/lib/index.js')}'`,
    "    - id: secretary-browser-panel",
    `      name: 'file://${join(ROOT, 'packages/panel/lib/index.js')}'`,
    '',
  ].join('\n'))
  return overlay
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
