import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

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

function collectPageErrors(page, errors, allowNavigationErrors = false, allowInjectedServerErrors = false) {
  page.on('pageerror', error => errors.push(error))
  page.on('console', message => {
    if (message.type() !== 'error') return
    const text = message.text()
    const navigationError = /ERR_INCOMPLETE_CHUNKED_ENCODING|ERR_CONNECTION_REFUSED/.test(text)
    if (allowNavigationErrors && navigationError) return
    const injectedServerError = /Failed to load resource: the server responded with a status of 500/.test(text)
    if (allowInjectedServerErrors && injectedServerError) return
    errors.push(new Error(`console.error: ${text}`))
  })
}

async function clearDialogs(page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const dialog = page.getByRole('dialog').last()
    if (await dialog.count() === 0 || !await dialog.isVisible()) return
    const labels = ['继续', '知道了', '关闭', '已完成', '稍后']
    let clicked = false
    for (const label of labels) {
      const button = dialog.getByRole('button', { name: label, exact: true })
      if (await button.count() > 0 && await button.isVisible()) { await button.click(); clicked = true; break }
    }
    if (!clicked) return
  }
}

async function openPanel(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await clearDialogs(page)
  const newSession = page.getByRole('button', { name: '新建会话', exact: true })
  if (await newSession.count() > 0 && await newSession.isVisible()) await newSession.click()
  const openSidebar = page.getByRole('button', { name: /^(Open right sidebar|打开右侧边栏)$/ })
  if (await openSidebar.count() > 0 && await openSidebar.isVisible()) await openSidebar.click()
  const entry = page.getByRole('button', { name: '时间', exact: true })
  try {
    await entry.waitFor({ timeout: 30_000 })
  } catch (error) {
    console.error('Browser navigation buttons:', await page.locator('button').evaluateAll(buttons => buttons.map(button => ({ text: button.textContent, label: button.getAttribute('aria-label') }))))
    console.error('Browser navigation text:', (await page.locator('body').innerText()).slice(0, 4000))
    throw error
  }
  await entry.click()
  await page.getByLabel('时间标签架').waitFor({ timeout: 30_000 })
}

async function setHostTheme(page, theme) {
  const account = page.getByRole('button', { name: /^(Account menu|账户菜单)$/ }).first()
  await account.waitFor({ timeout: 30_000 })
  await account.click()
  const settings = page.getByRole('menuitem', { name: /^(Settings|设置)$/ }).first()
  await settings.waitFor({ timeout: 30_000 })
  await settings.click()
  const option = page.getByRole('button', { name: theme === 'dark' ? /^(深色|Dark)$/ : /^(浅色|Light)$/ }).last()
  await option.waitFor({ timeout: 30_000 })
  await option.click()
  await page.waitForFunction(theme => document.body.hasAttribute('data-ds-dark-theme') === (theme === 'dark'), theme)
}

async function writeBrowserOverlay(home) {
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
    '        journalMode: delete',
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

async function createTag(page, name, parent) {
  await page.getByRole('button', { name: '管理标签', exact: true }).click()
  await page.getByLabel('标签名称').fill(name)
  if (parent) await page.getByLabel('父标签').selectOption({ label: parent })
  await page.getByRole('button', { name: '新建标签', exact: true }).click()
  await page.getByRole('button', { name: '返回实录', exact: true }).click()
  await page.getByRole('button', { name, exact: true }).waitFor()
}

async function chooseDate(page, target) {
  await page.getByRole('button', { name: '打开日历选择日期', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '选择日期', exact: true })
  await dialog.waitFor()
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const targetButton = dialog.getByRole('button', { name: target, exact: true })
    if (await targetButton.count() > 0) {
      await targetButton.click()
      return
    }
    const first = await dialog.locator('.calendar-day').first().getAttribute('aria-label')
    const direction = target.slice(0, 7) < first.slice(0, 7) ? '上一月' : '下一月'
    await dialog.getByRole('button', { name: direction, exact: true }).click()
  }
  throw new Error(`calendar did not reach ${target}`)
}

test('real Chromium client covers Plan/Template/date navigation and restores all Time facts after full dsh restarts', { timeout: 360_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-browser-'))
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
    '        journalMode: delete',
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

  const browser = await chromium.launch({ headless: true })
  let server
  const pageErrors = []
  t.after(async () => {
    if (server) await server.stop()
    await browser.close()
    await rm(home, { recursive: true, force: true })
  })

  server = await boot(home, overlay)
  let context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  let page = await context.newPage()
  collectPageErrors(page, pageErrors, true)
  await openPanel(page, server.url).catch(error => { console.error('DSH output:', server.output()); throw error })

  await createTag(page, '工作')
  await createTag(page, '专注工作', '工作')
  await createTag(page, '听播客', '工作')
  await chooseDate(page, '2026-11-02')
  await page.getByRole('button', { name: '专注工作', exact: true }).click()
  const slot = page.getByRole('button', { name: '2026-11-02 09:00 时间格', exact: true })
  await slot.click()
  const first = page.getByRole('button', { name: /实录 专注工作 09:00/ })
  await first.waitFor()
  await page.getByRole('button', { name: '撤销添加', exact: true }).click()
  await first.waitFor({ state: 'detached' })
  await slot.click()
  await first.waitFor()
  await page.getByRole('button', { name: '听播客', exact: true }).click()
  await first.click()
  await page.locator('[data-slot="09:00"] .actual-fragment').nth(1).waitFor()
  assert.equal(await page.locator('[data-slot="09:00"] .actual-fragment').count(), 2)
  await page.getByRole('button', { name: '专注工作', exact: true }).click()
  await first.click()
  await first.waitFor({ state: 'detached' })
  assert.equal(await page.locator('[data-slot="09:00"] .actual-fragment').count(), 1)
  assert.equal(await page.getByRole('dialog', { name: '编辑实录', exact: true }).count(), 0)
  await page.getByRole('button', { name: '撤销消除', exact: true }).click()
  await first.waitFor()
  assert.equal(await page.locator('[data-slot="09:00"] .actual-fragment').count(), 2)

  await first.click({ modifiers: ['Shift'] })
  await page.getByLabel('实录备注').fill('浏览器真实实录')
  await page.getByRole('button', { name: '保存实录', exact: true }).click()
  await page.getByText('浏览器真实实录', { exact: true }).waitFor()
  await page.getByRole('button', { name: '撤销编辑', exact: true }).click()
  await page.getByText('浏览器真实实录', { exact: true }).waitFor({ state: 'detached' })
  await first.click({ modifiers: ['Shift'] })
  await page.getByLabel('实录备注').fill('浏览器真实实录')
  await page.getByRole('button', { name: '保存实录', exact: true }).click()
  await page.getByText('浏览器真实实录', { exact: true }).waitFor()

  await openPanel(page, server.url).catch(error => { console.error('DSH output:', server.output()); throw error })
  await chooseDate(page, '2026-11-02')
  await page.getByText('浏览器真实实录', { exact: true }).waitFor()

  await server.stop()
  server = await boot(home, overlay)
  await context.close()
  context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  page = await context.newPage()
  collectPageErrors(page, pageErrors, true)
  await openPanel(page, server.url).catch(error => { console.error('DSH output:', server.output()); throw error })
  await chooseDate(page, '2026-11-02')
  await page.getByText('浏览器真实实录', { exact: true }).waitFor()
  assert.equal(await page.locator('[data-slot="09:00"] .actual-fragment').count(), 2)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '390px layout has horizontal overflow')

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByRole('tab', { name: '计划', exact: true }).click()
  await chooseDate(page, '2026-11-02')
  await page.getByRole('button', { name: '专注工作', exact: true }).click()
  await page.getByRole('button', { name: '2026-11-02 09:00 时间格', exact: true }).click()
  const originalPlan = page.getByRole('button', { name: /计划 专注工作 09:00/ })
  await originalPlan.waitFor()
  await page.getByRole('button', { name: '15 分钟', exact: true }).click()
  await originalPlan.waitFor()
  await page.getByRole('button', { name: '30 分钟', exact: true }).click()
  await originalPlan.waitFor()
  await page.getByRole('button', { name: '10 分钟', exact: true }).click()
  await originalPlan.waitFor()

  await page.getByRole('button', { name: '计划模板', exact: true }).click()
  await page.getByRole('button', { name: '周一', exact: true }).click()
  await page.getByLabel('模板开始时间').fill('10:00')
  await page.getByLabel('模板结束时间').fill('11:00')
  await page.getByLabel('模板备注').fill('浏览器模板计划')
  await page.getByRole('button', { name: '新增模板', exact: true }).click()
  await page.getByRole('button', { name: '应用到 2026-11-02', exact: true }).click()
  const appliedPlan = page.getByRole('button', { name: /计划 专注工作 10:00/ }).first()
  await appliedPlan.waitFor()
  assert.equal(await originalPlan.count(), 0)

  await page.getByRole('tab', { name: '实录', exact: true }).click()
  await page.getByText('浏览器真实实录', { exact: true }).waitFor()
  assert.equal(await page.locator('[data-slot="09:00"] .actual-fragment').count(), 2)

  await openPanel(page, server.url)
  await page.getByRole('tab', { name: '计划', exact: true }).click()
  await chooseDate(page, '2026-11-02')
  await appliedPlan.waitFor()
  await page.getByRole('button', { name: '撤销模板应用', exact: true }).click()
  await originalPlan.waitFor()
  assert.equal(await appliedPlan.count(), 0)

  await page.getByRole('button', { name: '计划模板', exact: true }).click()
  await page.getByRole('button', { name: '应用到 2026-11-02', exact: true }).click()
  await appliedPlan.waitFor()
  await server.stop()
  server = await boot(home, overlay)
  await context.close()
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  page = await context.newPage()
  collectPageErrors(page, pageErrors, true)
  await openPanel(page, server.url)
  await page.getByRole('tab', { name: '计划', exact: true }).click()
  await chooseDate(page, '2026-11-02')
  await page.getByRole('button', { name: /计划 专注工作 10:00/ }).first().waitFor()
  await page.getByRole('button', { name: '撤销模板应用', exact: true }).click()
  await page.getByRole('button', { name: /计划 专注工作 09:00/ }).waitFor()

  await chooseDate(page, '2026-10-31')
  await page.getByRole('button', { name: '后一天', exact: true }).click()
  await page.getByText(/2026 年 11 月 1 日/).waitFor()
  await page.getByRole('button', { name: '前一天', exact: true }).click()
  await page.getByText(/2026 年 10 月 31 日/).waitFor()
  await chooseDate(page, '2026-12-15')
  await page.getByText(/2026 年 12 月 15 日/).waitFor()
  const today = await page.evaluate(() => {
    const value = new Date()
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  })
  await page.getByRole('button', { name: '今天', exact: true }).click()
  await page.getByRole('button', { name: '打开日历选择日期', exact: true }).click()
  const calendar = page.getByRole('dialog', { name: '选择日期', exact: true })
  assert.equal(await calendar.locator('.calendar-day.is-today').getAttribute('aria-label'), today)
  await calendar.getByRole('button', { name: '回到今天', exact: true }).click()
  await page.getByRole('tab', { name: '实录', exact: true }).click()
  await chooseDate(page, '2026-11-02')
  await page.getByText('浏览器真实实录', { exact: true }).waitFor()
  assert.deepEqual(pageErrors, [])
})

test('real Chromium Plan and Actual erase gestures keep the starting Tag fixed and undo the whole drag', { timeout: 360_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-canvas-browser-'))
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
    '        journalMode: delete',
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

  const browser = await chromium.launch({ headless: true })
  let server
  const pageErrors = []
  t.after(async () => {
    if (server) await server.stop()
    await browser.close()
    await rm(home, { recursive: true, force: true })
  })

  server = await boot(home, overlay)
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Shanghai' })
  const page = await context.newPage()
  collectPageErrors(page, pageErrors)
  await openPanel(page, server.url)
  for (const name of ['甲', '乙', '丙', '丁']) await createTag(page, name)
  await chooseDate(page, '2026-11-02')

  for (const view of ['actual', 'plan']) {
    const kind = view === 'actual' ? '实录' : '计划'
    if (view === 'plan') await page.getByRole('tab', { name: '计划', exact: true }).click()
    const fragment = (slot, tag) => page.locator(`[data-slot="${slot}"] .time-fragment[aria-label="${kind} ${tag} ${slot}"]`)
    const add = async (slot, tag) => {
      await page.getByRole('button', { name: tag, exact: true }).click()
      const existing = page.locator(`[data-slot="${slot}"] .time-fragment`).first()
      if (await existing.count() > 0) await existing.click()
      else await page.getByRole('button', { name: `2026-11-02 ${slot} 时间格`, exact: true }).click()
      await fragment(slot, tag).waitFor()
    }

    for (const tag of ['甲', '乙', '丙', '丁']) await add('08:00', tag)
    await page.getByRole('button', { name: '丁', exact: true }).dblclick()
    await page.getByText('消除态：点击记录删除', { exact: true }).waitFor()
    const accidentalCommands = []
    const collectCommand = request => {
      if (request.url().includes('/api/secretary.command')) accidentalCommands.push(request)
    }
    page.on('request', collectCommand)
    await page.getByRole('button', { name: '2026-11-02 12:00 时间格', exact: true }).click({ position: { x: 1, y: 1 } })
    page.off('request', collectCommand)
    assert.equal(accidentalCommands.length, 0, 'erase-mode empty-cell click must not add a record')
    assert.equal(await page.locator('[data-slot="12:00"] .time-fragment').count(), 0)
    await fragment('08:00', '甲').click({ modifiers: ['Shift'] })
    await page.getByRole('dialog', { name: `编辑${kind}`, exact: true }).waitFor()
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await fragment('08:00', '甲').click()
    await fragment('08:00', '甲').waitFor({ state: 'detached' })
    assert.equal(await fragment('08:00', '乙').count(), 1)
    assert.equal(await fragment('08:00', '丙').count(), 1)
    assert.equal(await fragment('08:00', '丁').count(), 1)
    await page.getByRole('button', { name: '撤销消除', exact: true }).click()
    await fragment('08:00', '甲').waitFor()
    await page.getByRole('button', { name: '甲', exact: true }).click()
    assert.equal(await page.getByText('消除态：点击记录删除', { exact: true }).count(), 0)

    await add('08:10', '乙')
    await add('08:10', '甲')
    await add('08:20', '乙')
    await add('08:20', '甲')
    await page.getByRole('button', { name: '乙', exact: true }).dblclick()
    await page.getByText('消除态：点击记录删除', { exact: true }).waitFor()
    const boxes = []
    for (const slot of ['08:00', '08:10', '08:20']) {
      const box = await fragment(slot, '乙').boundingBox()
      assert.ok(box)
      boxes.push(box)
    }
    await page.mouse.move(boxes[0].x + boxes[0].width / 2, boxes[0].y + boxes[0].height / 2)
    await page.mouse.down()
    for (const box of boxes.slice(1)) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 })
    }
    await page.mouse.up()
    for (const slot of ['08:00', '08:10', '08:20']) await fragment(slot, '乙').waitFor({ state: 'detached' })
    assert.equal(await fragment('08:00', '甲').count(), 1)
    assert.equal(await fragment('08:00', '丙').count(), 1)
    assert.equal(await fragment('08:00', '丁').count(), 1)
    assert.equal(await fragment('08:10', '甲').count(), 1)
    assert.equal(await fragment('08:20', '甲').count(), 1)
    await page.getByRole('button', { name: '撤销消除', exact: true }).click()
    for (const slot of ['08:00', '08:10', '08:20']) await fragment(slot, '乙').waitFor()
    await page.getByRole('button', { name: '丙', exact: true }).click()
    assert.equal(await page.getByText('消除态：点击记录删除', { exact: true }).count(), 0)
  }
  assert.deepEqual(pageErrors, [])
})

test('real Chromium Plan and Actual keep parallel layout, cross-hour titles, editing undo, and facts across granularity changes', { timeout: 360_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-layout-browser-'))
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
    '        journalMode: delete',
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

  const browser = await chromium.launch({ headless: true })
  let server
  const pageErrors = []
  t.after(async () => {
    if (server) await server.stop()
    await browser.close()
    await rm(home, { recursive: true, force: true })
  })

  server = await boot(home, overlay)
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Shanghai' })
  const page = await context.newPage()
  collectPageErrors(page, pageErrors)
  await openPanel(page, server.url)
  for (const name of ['甲', '乙', '丙', '丁', '跨时']) await createTag(page, name)
  await chooseDate(page, '2026-11-02')

  for (const view of ['actual', 'plan']) {
    const kind = view === 'actual' ? '实录' : '计划'
    if (view === 'plan') await page.getByRole('tab', { name: '计划', exact: true }).click()
    const fragment = (slot, tag, labelTime = slot) => page.locator(`[data-slot="${slot}"] .time-fragment[aria-label="${kind} ${tag} ${labelTime}"]`)
    const add = async (slot, tag) => {
      await page.getByRole('button', { name: tag, exact: true }).click()
      const existing = page.locator(`[data-slot="${slot}"] .time-fragment`).first()
      if (await existing.count() > 0) await existing.click()
      else await page.getByRole('button', { name: `2026-11-02 ${slot} 时间格`, exact: true }).click()
      await fragment(slot, tag).waitFor()
    }
    const widths = async () => page.locator('[data-slot="09:00"] .time-fragment').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().width))
    const assertHourGeometry = async () => {
      assert.equal(await page.locator('.hour-row').count(), 24)
      assert.ok(await page.locator('.hour-row').evaluateAll(rows => rows.every(row => row.getBoundingClientRect().height === 48)))
    }

    await add('09:00', '甲')
    await page.getByRole('button', { name: '撤销添加', exact: true }).click()
    await fragment('09:00', '甲').waitFor({ state: 'detached' })
    await add('09:00', '甲')
    for (const tag of ['乙', '丙', '丁']) await add('09:00', tag)
    assert.equal(await page.locator('[data-slot="09:00"] .time-fragment').count(), 4)
    const quarters = await widths()
    assert.equal(quarters.length, 4)
    assert.ok(Math.max(...quarters) - Math.min(...quarters) <= 1, `four parallel widths differ: ${quarters}`)
    await assertHourGeometry()
    const visual = await page.locator('[data-slot="09:00"]').evaluate(slot => ({
      gap: getComputedStyle(slot.querySelector('.fragment-layer')).gap,
      fragments: [...slot.querySelectorAll('.time-fragment')].map(element => ({
        color: getComputedStyle(element).backgroundColor,
        radius: getComputedStyle(element).borderRadius,
      })),
    }))
    assert.equal(visual.gap, '1px')
    assert.ok(visual.fragments.every(item => item.color === 'rgb(71, 123, 199)' && item.radius === '4px'))

    await page.getByRole('button', { name: '甲', exact: true }).click()
    await page.getByRole('button', { name: '2026-11-02 09:00 时间格', exact: true }).click({ position: { x: 1, y: 1 } })
    await fragment('09:00', '甲').waitFor({ state: 'detached' })
    assert.equal(await page.locator('[data-slot="09:00"] .time-fragment').count(), 3)
    await page.getByRole('button', { name: '撤销消除', exact: true }).click()
    await fragment('09:00', '甲').waitFor()

    await page.getByRole('button', { name: '甲', exact: true }).click()
    await fragment('09:00', '乙').click()
    await fragment('09:00', '甲').waitFor({ state: 'detached' })
    assert.equal(await page.locator('[data-slot="09:00"] .time-fragment').count(), 3)
    assert.equal(await fragment('09:00', '乙').count(), 1)
    assert.equal(await fragment('09:00', '丙').count(), 1)
    assert.equal(await fragment('09:00', '丁').count(), 1)
    await page.getByRole('button', { name: '撤销消除', exact: true }).click()
    await fragment('09:00', '甲').waitFor()

    await page.getByRole('button', { name: '丁', exact: true }).click()
    await fragment('09:00', '丁').click()
    await fragment('09:00', '丁').waitFor({ state: 'detached' })
    assert.equal(await page.getByRole('dialog', { name: `编辑${kind}`, exact: true }).count(), 0)
    const thirds = await widths()
    assert.equal(thirds.length, 3)
    assert.ok(Math.max(...thirds) - Math.min(...thirds) <= 1, `three parallel widths differ: ${thirds}`)
    assert.equal(await fragment('09:00', '甲').count(), 1)
    assert.equal(await fragment('09:00', '乙').count(), 1)
    assert.equal(await fragment('09:00', '丙').count(), 1)
    await assertHourGeometry()
    await page.getByRole('button', { name: '撤销消除', exact: true }).click()
    await fragment('09:00', '丁').waitFor()
    assert.equal((await widths()).length, 4)

    await fragment('09:00', '甲').click({ modifiers: ['Shift'] })
    await page.getByRole('dialog', { name: `编辑${kind}`, exact: true }).waitFor()
    await page.getByLabel(`${kind}标签`).selectOption({ label: '丁' })
    await page.getByLabel(`${kind}备注`).fill(`${kind}修改`)
    await page.getByRole('button', { name: `保存${kind}`, exact: true }).click()
    await page.getByText(`${kind}修改`, { exact: true }).waitFor()
    await fragment('09:00', '甲').waitFor({ state: 'detached' })
    await page.getByRole('button', { name: '撤销编辑', exact: true }).click()
    await fragment('09:00', '甲').waitFor()
    await page.getByText(`${kind}修改`, { exact: true }).waitFor({ state: 'detached' })
    assert.equal(await fragment('09:00', '丁').count(), 1)

    await add('10:50', '跨时')
    await fragment('10:50', '跨时').click({ modifiers: ['Shift'] })
    await page.getByLabel('开始时刻').fill('2026-11-02T10:50:00+08:00')
    await page.getByLabel('结束时刻').fill('2026-11-02T11:20:00+08:00')
    await page.getByLabel(`${kind}备注`).fill(`${kind}跨小时标题`)
    await page.getByRole('button', { name: `保存${kind}`, exact: true }).click()
    await fragment('11:10', '跨时', '10:50').waitFor()
    const covered = await Promise.all(['10:50', '11:00', '11:10'].map(async slot => {
      const target = fragment(slot, '跨时', '10:50')
      return { id: await target.getAttribute('data-block-id'), text: await target.innerText() }
    }))
    assert.equal(new Set(covered.map(item => item.id)).size, 1)
    assert.deepEqual(covered.map(item => item.text), [`${kind}跨小时标题`, '', ''])
    await assertHourGeometry()

    const facts = async () => page.evaluate(async ({ view }) => {
      const response = await fetch('/api/secretary.state?date=2026-11-02&timeZone=Asia%2FShanghai')
      const state = await response.json()
      return view === 'plan' ? state.plans : state.blocks
    }, { view })
    const before = await facts()
    for (const [minutes, slots] of [[15, 4], [30, 2], [10, 6]]) {
      await page.getByRole('button', { name: `${minutes} 分钟`, exact: true }).click()
      assert.equal(await page.locator('.hour-row').nth(9).locator('.time-slot').count(), slots)
      await assertHourGeometry()
      assert.deepEqual(await facts(), before, `${kind} ${minutes}-minute display rewrote persisted facts`)
    }
  }
  assert.deepEqual(pageErrors, [])
})

test('real Chromium deep-time grid supports high-only use, fixed-operation pointer gestures, reload, and full restart', { timeout: 360_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-deep-browser-'))
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
    '        journalMode: delete',
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

  const browser = await chromium.launch({ headless: true })
  let server
  const pageErrors = []
  t.after(async () => {
    if (server) await server.stop()
    await browser.close()
    await rm(home, { recursive: true, force: true })
  })

  server = await boot(home, overlay)
  let context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  let page = await context.newPage()
  collectPageErrors(page, pageErrors, true)
  const openDeep = async () => {
    await openPanel(page, server.url)
    await page.getByRole('tab', { name: '深度时间', exact: true }).click()
    await page.getByRole('region', { name: '深度时间周模板', exact: true }).waitFor().catch(async error => {
      console.error('Deep panel text:', (await page.locator('body').innerText()).slice(0, 4000))
      console.error('Deep panel page errors:', pageErrors)
      console.error('Deep panel DSH output:', server.output())
      throw error
    })
  }
  const cell = (weekday, hour) => page.locator(`[data-deep-cell][data-weekday="${weekday}"][data-hour="${hour}"]`)
  const level = async (weekday, hour, expected) => {
    await page.waitForFunction(({ weekday, hour, expected }) => document.querySelector(`[data-deep-cell][data-weekday="${weekday}"][data-hour="${hour}"]`)?.getAttribute('data-level') === expected, { weekday, hour, expected })
  }
  const clickCell = async (weekday, hour) => {
    const saved = page.waitForResponse(response => response.url().includes('/api/secretary.state') && response.request().method() === 'GET')
    await cell(weekday, hour).click()
    await saved
  }
  const dragCells = async (weekday, startHour, endHour) => {
    const start = await cell(weekday, startHour).boundingBox()
    assert.ok(start)
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
    await page.mouse.down()
    for (let hour = startHour + 1; hour <= endHour; hour += 1) {
      const box = await cell(weekday, hour).boundingBox()
      assert.ok(box)
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 })
    }
    const saved = page.waitForResponse(response => response.url().includes('/api/secretary.state') && response.request().method() === 'GET')
    await page.mouse.up()
    await saved
  }

  await openDeep()
  assert.equal(await page.locator('[data-deep-cell]').count(), 168)
  assert.equal(await page.locator('[data-deep-cell][data-level="unset"]').count(), 168)
  await page.getByRole('button', { name: 'high', exact: true }).click()
  await clickCell(1, 9)
  await level(1, 9, 'high')
  assert.equal(await page.locator('[data-deep-cell][data-level="high"]').count(), 1)
  assert.equal(await page.locator('[data-deep-cell][data-level="medium"]').count(), 0)
  assert.equal(await page.locator('[data-deep-cell][data-level="low"]').count(), 0)

  await openDeep()
  await level(1, 9, 'high')
  assert.equal(await page.locator('[data-deep-cell][data-level="unset"]').count(), 167)
  await server.stop()
  server = await boot(home, overlay)
  await context.close()
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  page = await context.newPage()
  collectPageErrors(page, pageErrors, true)
  await openDeep()
  await level(1, 9, 'high')
  assert.equal(await page.locator('[data-deep-cell][data-level="high"]').count(), 1)

  await page.getByRole('button', { name: 'medium', exact: true }).click()
  await clickCell(2, 9)
  await page.getByRole('button', { name: 'low', exact: true }).click()
  await clickCell(2, 10)
  await clickCell(3, 10)
  await page.getByRole('button', { name: 'medium', exact: true }).click()
  await clickCell(3, 11)
  await page.getByRole('button', { name: 'high', exact: true }).click()
  await dragCells(3, 9, 11)
  for (const hour of [9, 10, 11]) await level(3, hour, 'high')

  await page.getByRole('button', { name: 'medium', exact: true }).click()
  await clickCell(3, 10)
  await page.getByRole('button', { name: 'low', exact: true }).click()
  await clickCell(3, 11)
  await page.getByRole('button', { name: 'high', exact: true }).click()
  await dragCells(3, 9, 11)
  for (const hour of [9, 10, 11]) await level(3, hour, 'unset')
  await level(1, 9, 'high')
  await level(2, 9, 'medium')
  await level(2, 10, 'low')

  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '390px deep-time page has horizontal overflow')
  const colors = await page.evaluate(() => ({
    unset: getComputedStyle(document.querySelector('[data-deep-cell][data-weekday="2"][data-hour="11"]')).backgroundColor,
    low: getComputedStyle(document.querySelector('[data-deep-cell][data-weekday="2"][data-hour="10"]')).backgroundColor,
  }))
  assert.notEqual(colors.unset, colors.low, 'unset must not reuse the low fill')

  await openDeep()
  await level(1, 9, 'high')
  await level(2, 9, 'medium')
  await level(2, 10, 'low')
  for (const hour of [9, 10, 11]) await level(3, hour, 'unset')
  assert.deepEqual(pageErrors, [])
})

test('real Chromium GTD flow uses the product shell and survives a full isolated dsh restart', { timeout: 360_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-gtd-browser-'))
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
    '        journalMode: delete',
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

  const browser = await chromium.launch({ headless: true })
  let server
  const pageErrors = []
  t.after(async () => {
    if (server) await server.stop()
    await browser.close()
    await rm(home, { recursive: true, force: true })
  })

  server = await boot(home, overlay)
  let context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  let page = await context.newPage()
  collectPageErrors(page, pageErrors, true)
  await openPanel(page, server.url)
  await createTag(page, '工作')
  await page.getByRole('button', { name: '管理标签', exact: true }).click()
  await page.getByRole('button', { name: '情境标签', exact: true }).click()
  await page.getByLabel('标签名称').fill('电脑')
  await page.getByRole('button', { name: '新建标签', exact: true }).click()
  await page.getByRole('button', { name: '返回实录', exact: true }).click()

  await page.getByRole('button', { name: 'GTD', exact: true }).click()
  await page.getByRole('region', { name: 'GTD 工作区' }).waitFor()
  await page.getByLabel('捕获标题').fill('浏览器 GTD')
  await page.getByLabel('捕获原文').fill('在真实产品中完成浏览器 GTD 闭环。')
  await page.getByRole('button', { name: '捕获到 Inbox', exact: true }).click()
  await page.getByRole('button', { name: '澄清 浏览器 GTD', exact: true }).click()
  await page.getByLabel('Project 标题').fill('浏览器 GTD 项目')
  await page.getByLabel('Project Outcome').fill('真实 UI 与 Service 同源')
  await page.getByLabel('Project 标签 工作').check()
  await page.getByLabel('Project 标签 电脑').check()
  await page.getByLabel('Action 标题').fill('浏览器下一步')
  await page.getByLabel('Action 标签 电脑').check()
  await page.getByLabel('Action Planned At').fill('2026-11-03T09:00:00+08:00')
  await page.getByRole('button', { name: '完成澄清', exact: true }).click()

  await page.getByRole('region', { name: 'Next Actions 视图' }).waitFor()
  await page.getByText('浏览器下一步', { exact: true }).waitFor()
  await page.getByText(/· available/).waitFor()
  await page.getByText(/有效 Tags.*工作.*电脑/).waitFor()
  await page.getByRole('tab', { name: 'Forecast', exact: true }).click()
  await page.getByLabel('Forecast 日期').fill('2026-11-03')
  await page.getByText('浏览器下一步', { exact: true }).waitFor()

  await page.getByRole('tab', { name: 'Projects', exact: true }).click()
  await page.getByRole('button', { name: '编辑 浏览器下一步', exact: true }).click()
  await page.getByLabel('Planned At').fill('2026-11-04T10:00:00+08:00')
  await page.getByLabel('Due At').fill('2026-11-05T18:00:00+08:00')
  await page.getByRole('button', { name: '保存 Action', exact: true }).click()
  await page.getByRole('tab', { name: 'Forecast', exact: true }).click()
  await page.getByLabel('Forecast 日期').fill('2026-11-04')
  await page.getByText('浏览器下一步', { exact: true }).waitFor()
  await page.getByRole('tab', { name: 'Next Actions', exact: true }).click()
  await page.getByRole('button', { name: '完成 浏览器下一步', exact: true }).click()
  await page.getByText('浏览器下一步', { exact: true }).waitFor({ state: 'detached' })

  await server.stop()
  server = await boot(home, overlay)
  await context.close()
  context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  page = await context.newPage()
  collectPageErrors(page, pageErrors, true)
  await openPanel(page, server.url)
  await page.getByRole('button', { name: 'GTD', exact: true }).click()
  await page.getByRole('tab', { name: 'Projects', exact: true }).click()
  await page.getByText('浏览器下一步', { exact: true }).waitFor()
  await page.getByText(/· completed ·/).waitFor()
  await page.getByText(/有效 Tags.*工作.*电脑/).waitFor()
  await page.getByRole('tab', { name: 'Next Actions', exact: true }).click()
  assert.equal(await page.getByText('浏览器下一步', { exact: true }).count(), 0)
  await page.getByRole('tab', { name: 'Forecast', exact: true }).click()
  await page.getByLabel('Forecast 日期').fill('2026-11-04')
  await page.getByText('浏览器下一步', { exact: true }).waitFor()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '390px GTD layout has horizontal overflow')
  assert.deepEqual(pageErrors, [])
})

test('real Chromium batch erase keeps an error and Undo for the deleted prefix when the second delete fails', { timeout: 360_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-partial-erase-browser-'))
  const overlay = await writeBrowserOverlay(home)
  const browser = await chromium.launch({ headless: true })
  let server
  t.after(async () => {
    if (server) await server.stop()
    await browser.close()
    await rm(home, { recursive: true, force: true })
  })
  server = await boot(home, overlay)
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Shanghai' })
  const page = await context.newPage()
  const pageErrors = []
  collectPageErrors(page, pageErrors, false, true)
  await openPanel(page, server.url)
  await createTag(page, '工作')
  await chooseDate(page, '2026-11-02')
  for (const slot of ['10:00', '10:10']) {
    await page.getByRole('button', { name: `2026-11-02 ${slot} 时间格`, exact: true }).click()
    await page.locator(`[data-slot="${slot}"] .actual-fragment`).waitFor()
  }

  let deleteCount = 0
  await page.route('**/api/secretary.command', async route => {
    const request = route.request()
    const command = request.postDataJSON()
    if (command.op !== 'actual.delete') return route.continue()
    deleteCount += 1
    if (deleteCount === 2) {
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'injected second delete failure' }) })
    }
    return route.continue()
  })
  await page.getByRole('button', { name: '工作', exact: true }).dblclick()
  const first = page.locator('[data-slot="10:00"] .actual-fragment')
  const second = page.locator('[data-slot="10:10"] .actual-fragment')
  const boxes = [await first.boundingBox(), await second.boundingBox()]
  assert.ok(boxes[0] && boxes[1])
  await page.mouse.move(boxes[0].x + boxes[0].width / 2, boxes[0].y + boxes[0].height / 2)
  await page.mouse.down()
  await page.mouse.move(boxes[1].x + boxes[1].width / 2, boxes[1].y + boxes[1].height / 2, { steps: 6 })
  await page.mouse.up()
  await page.getByRole('alert').filter({ hasText: 'injected second delete failure' }).waitFor()
  await first.waitFor({ state: 'detached' })
  await second.waitFor()
  assert.equal(deleteCount, 2)

  await page.getByRole('button', { name: '撤销消除', exact: true }).click()
  await first.waitFor()
  await second.waitFor()
  assert.equal(await page.locator('.actual-fragment').count(), 2)
  assert.equal(await page.getByRole('button', { name: '撤销消除', exact: true }).count(), 0)
  assert.deepEqual(pageErrors, [])
})

test('real Chromium Plan Undo derives the original date for overnight blocks and after date navigation', { timeout: 360_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-plan-restore-browser-'))
  const overlay = await writeBrowserOverlay(home)
  const browser = await chromium.launch({ headless: true })
  let server
  t.after(async () => {
    if (server) await server.stop()
    await browser.close()
    await rm(home, { recursive: true, force: true })
  })
  server = await boot(home, overlay)
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Shanghai' })
  const page = await context.newPage()
  const pageErrors = []
  collectPageErrors(page, pageErrors)
  await openPanel(page, server.url)
  await createTag(page, '夜间工作')
  const created = await page.evaluate(async () => {
    const response = await fetch('/api/secretary.command', {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        domain: 'time', op: 'plan.create', date: '2026-11-02', timeZone: 'Asia/Shanghai', timeTagId: 1,
        startAt: '2026-11-02T23:30:00+08:00', endAt: '2026-11-03T00:30:00+08:00', note: '跨午夜恢复',
      }),
    })
    if (response.status !== 200) throw new Error(`plan setup failed: ${response.status}`)
    return response.json()
  })
  const originalId = created.block.id
  await openPanel(page, server.url)
  await page.getByRole('tab', { name: '计划', exact: true }).click()
  await chooseDate(page, '2026-11-03')
  const overnight = page.locator('[data-slot="00:00"] .plan-fragment[aria-label="计划 夜间工作 23:30"]')
  await overnight.waitFor()
  await overnight.click()
  await overnight.waitFor({ state: 'detached' })
  await page.getByRole('button', { name: '撤销消除', exact: true }).click()
  await overnight.waitFor()
  const recreatedId = Number(await overnight.getAttribute('data-block-id'))
  assert.notEqual(recreatedId, originalId)
  await chooseDate(page, '2026-11-02')
  const originalDay = page.locator('[data-slot="23:30"] .plan-fragment')
  await originalDay.waitFor()
  assert.equal(Number(await originalDay.getAttribute('data-block-id')), recreatedId)

  await originalDay.click()
  await originalDay.waitFor({ state: 'detached' })
  await chooseDate(page, '2026-11-04')
  await page.getByRole('button', { name: '撤销消除', exact: true }).click()
  await chooseDate(page, '2026-11-02')
  await originalDay.waitFor()
  assert.notEqual(Number(await originalDay.getAttribute('data-block-id')), recreatedId)
  assert.equal(await page.getByRole('alert').count(), 0)
  assert.deepEqual(pageErrors, [])
})

test('real Chromium Undo failure preserves remaining commands and remaps older stacks across a retry', { timeout: 360_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-undo-retry-browser-'))
  const overlay = await writeBrowserOverlay(home)
  const browser = await chromium.launch({ headless: true })
  let server
  t.after(async () => {
    if (server) await server.stop()
    await browser.close()
    await rm(home, { recursive: true, force: true })
  })
  server = await boot(home, overlay)
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Shanghai' })
  const page = await context.newPage()
  const pageErrors = []
  collectPageErrors(page, pageErrors, false, true)
  await openPanel(page, server.url)
  await createTag(page, '工作')
  await chooseDate(page, '2026-11-02')
  const fragment = slot => page.locator(`[data-slot="${slot}"] .actual-fragment`)
  for (const slot of ['10:00', '10:10', '10:20']) {
    await page.getByRole('button', { name: `2026-11-02 ${slot} 时间格`, exact: true }).click()
    await fragment(slot).waitFor()
  }
  await fragment('10:00').click({ modifiers: ['Shift'] })
  await page.getByLabel('实录备注').fill('失败前编辑')
  await page.getByRole('button', { name: '保存实录', exact: true }).click()
  await page.getByText('失败前编辑', { exact: true }).waitFor()

  await page.getByRole('button', { name: '工作', exact: true }).dblclick()
  const boxes = []
  for (const slot of ['10:00', '10:10', '10:20']) {
    const box = await fragment(slot).boundingBox()
    assert.ok(box)
    boxes.push(box)
  }
  await page.mouse.move(boxes[0].x + boxes[0].width / 2, boxes[0].y + boxes[0].height / 2)
  await page.mouse.down()
  for (const box of boxes.slice(1)) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 })
  await page.mouse.up()
  for (const slot of ['10:00', '10:10', '10:20']) await fragment(slot).waitFor({ state: 'detached' })

  let restoreCount = 0
  await page.route('**/api/secretary.command', async route => {
    const command = route.request().postDataJSON()
    if (command.op !== 'actual.create') return route.continue()
    restoreCount += 1
    if (restoreCount === 2) {
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'injected undo retry failure' }) })
    }
    return route.continue()
  })
  await page.getByRole('button', { name: '撤销消除', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'injected undo retry failure' }).waitFor()
  await fragment('10:00').waitFor()
  assert.equal(await fragment('10:10').count(), 0)
  assert.equal(await fragment('10:20').count(), 0)
  assert.equal(await page.getByRole('button', { name: '撤销消除', exact: true }).count(), 1, 'failed Undo entry must remain on the stack')

  await page.getByRole('button', { name: '撤销消除', exact: true }).click()
  for (const slot of ['10:00', '10:10', '10:20']) await fragment(slot).waitFor()
  assert.equal(restoreCount, 4, 'retry must execute only the two remaining restore commands')
  await page.getByRole('button', { name: '工作', exact: true }).click()
  await page.getByRole('button', { name: '撤销编辑', exact: true }).click()
  await page.getByText('失败前编辑', { exact: true }).waitFor({ state: 'detached' })
  for (const slot of ['10:20', '10:10', '10:00']) {
    await page.getByRole('button', { name: '撤销添加', exact: true }).click()
    await fragment(slot).waitFor({ state: 'detached' })
  }
  assert.equal(await page.locator('.actual-fragment').count(), 0)
  assert.equal(await page.getByRole('alert').count(), 0)
  assert.deepEqual(pageErrors, [])
})

test('real Chromium undo remaps recreated IDs through edits and whole erase drags', { timeout: 360_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-undo-browser-'))
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
    '        journalMode: delete',
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

  const browser = await chromium.launch({ headless: true })
  let server
  const pageErrors = []
  t.after(async () => {
    if (server) await server.stop()
    await browser.close()
    await rm(home, { recursive: true, force: true })
  })

  server = await boot(home, overlay)
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Shanghai' })
  const page = await context.newPage()
  collectPageErrors(page, pageErrors)
  await openPanel(page, server.url)
  await createTag(page, '工作')
  await chooseDate(page, '2026-11-02')

  for (const view of ['actual', 'plan']) {
    const kind = view === 'actual' ? '实录' : '计划'
    if (view === 'plan') await page.getByRole('tab', { name: '计划', exact: true }).click()
    const fragment = slot => page.locator(`[data-slot="${slot}"] .time-fragment[aria-label="${kind} 工作 ${slot}"]`)
    await page.getByRole('button', { name: '工作', exact: true }).click()
    await page.getByRole('button', { name: '2026-11-02 09:00 时间格', exact: true }).click()
    await fragment('09:00').waitFor()
    const originalId = Number(await fragment('09:00').getAttribute('data-block-id'))
    await fragment('09:00').click({ modifiers: ['Shift'] })
    await page.getByLabel(`${kind}备注`).fill(`${kind}编辑后`)
    await page.getByRole('button', { name: `保存${kind}`, exact: true }).click()
    await page.getByText(`${kind}编辑后`, { exact: true }).waitFor()

    await page.getByRole('button', { name: '工作', exact: true }).dblclick()
    await fragment('09:00').click()
    await fragment('09:00').waitFor({ state: 'detached' })
    await page.getByRole('button', { name: '撤销消除', exact: true }).click()
    await fragment('09:00').waitFor()
    const recreatedId = Number(await fragment('09:00').getAttribute('data-block-id'))
    assert.notEqual(recreatedId, originalId, `${kind} restore should allocate a new ID`)
    await page.getByRole('button', { name: '工作', exact: true }).click()
    await page.getByRole('button', { name: '撤销编辑', exact: true }).click()
    await page.getByText(`${kind}编辑后`, { exact: true }).waitFor({ state: 'detached' })
    assert.equal(Number(await fragment('09:00').getAttribute('data-block-id')), recreatedId)
    await page.getByRole('button', { name: '撤销添加', exact: true }).click()
    await fragment('09:00').waitFor({ state: 'detached' })

    for (const slot of ['10:00', '10:10', '10:20']) {
      await page.getByRole('button', { name: `2026-11-02 ${slot} 时间格`, exact: true }).click()
      await fragment(slot).waitFor()
    }
    const beforeEraseIds = await Promise.all(['10:00', '10:10', '10:20'].map(async slot =>
      Number(await fragment(slot).getAttribute('data-block-id'))))
    await page.getByRole('button', { name: '工作', exact: true }).dblclick()
    const boxes = []
    for (const slot of ['10:00', '10:10', '10:20']) {
      const box = await fragment(slot).boundingBox()
      assert.ok(box)
      boxes.push(box)
    }
    await page.mouse.move(boxes[0].x + boxes[0].width / 2, boxes[0].y + boxes[0].height / 2)
    await page.mouse.down()
    for (const box of boxes.slice(1)) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 })
    await page.mouse.up()
    for (const slot of ['10:00', '10:10', '10:20']) await fragment(slot).waitFor({ state: 'detached' })
    await page.getByRole('button', { name: '撤销消除', exact: true }).click()
    for (const slot of ['10:00', '10:10', '10:20']) await fragment(slot).waitFor()
    const restoredIds = await Promise.all(['10:00', '10:10', '10:20'].map(async slot =>
      Number(await fragment(slot).getAttribute('data-block-id'))))
    assert.equal(new Set(restoredIds).size, 3)
    assert.ok(restoredIds.every(id => !beforeEraseIds.includes(id)), `${kind} drag restore must allocate new IDs`)
    await page.getByRole('button', { name: '工作', exact: true }).click()
    for (const slot of ['10:20', '10:10', '10:00']) {
      await page.getByRole('button', { name: '撤销添加', exact: true }).click()
      await fragment(slot).waitFor({ state: 'detached' })
    }
  }
  assert.deepEqual(pageErrors, [])
})

test('real Chromium Tag entry kinds and desktop HTML5 hierarchy drops persist for time and context', { timeout: 360_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-tags-browser-'))
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
    '        journalMode: delete',
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

  const browser = await chromium.launch({ headless: true })
  let server
  const pageErrors = []
  t.after(async () => {
    if (server) await server.stop()
    await browser.close()
    await rm(home, { recursive: true, force: true })
  })

  server = await boot(home, overlay)
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Shanghai' })
  const page = await context.newPage()
  collectPageErrors(page, pageErrors)
  await openPanel(page, server.url)

  const kind = page.getByLabel('标签类型', { exact: true })
  const addManagedTag = async name => {
    await page.getByLabel('标签名称').fill(name)
    await page.getByRole('button', { name: '新建标签', exact: true }).click()
    await page.locator('.managed-tag').filter({ hasText: name }).waitFor()
  }
  const row = name => page.locator('.managed-tag').filter({ hasText: name })
  const storedTags = async () => page.evaluate(async () => {
    const response = await fetch('/api/secretary.state?date=2026-11-02&timeZone=Asia%2FShanghai')
    return (await response.json()).tags
  })
  const drop = async (child, parent) => {
    const before = await storedTags()
    const childId = before.find(tag => tag.name === child).id
    const parentId = parent === null ? null : before.find(tag => tag.name === parent).id
    const response = page.waitForResponse(response => response.url().includes('/api/secretary.command')
      && response.request().method() === 'POST', { timeout: 5_000 })
    if (parent === null) await row(child).dragTo(page.getByLabel('根标签放置区', { exact: true }))
    else await row(child).dragTo(row(parent))
    assert.equal((await response).status(), 200)
    await page.waitForFunction(({ childId, parentId }) => {
      const target = document.querySelector(`.managed-tag[data-tag-id="${childId}"]`)
      return target?.getAttribute('data-parent-id') === (parentId === null ? '' : String(parentId))
    }, { childId, parentId })
    const after = await storedTags()
    assert.equal(after.find(tag => tag.id === childId).parentId, parentId ?? undefined)
  }

  await page.getByRole('button', { name: '管理标签', exact: true }).click()
  assert.equal(await kind.inputValue(), 'time')
  await page.getByRole('button', { name: '情境标签', exact: true }).click()
  await page.getByRole('button', { name: '返回实录', exact: true }).click()
  await page.getByRole('button', { name: 'GTD', exact: true }).click()
  await page.getByRole('button', { name: 'Tags', exact: true }).click()
  assert.equal(await kind.inputValue(), 'context')
  await page.getByRole('button', { name: '返回实录', exact: true }).click()
  await page.getByRole('button', { name: 'Tags', exact: true }).click()
  assert.equal(await kind.inputValue(), 'time', 'Time must not retain the previous context manager kind')

  await addManagedTag('工作')
  await addManagedTag('专注')
  await drop('专注', '工作')
  await page.getByRole('button', { name: '返回实录', exact: true }).click()
  assert.equal(await page.locator('.tag-shelf > button').filter({ hasText: '专注' }).evaluate(element => element.style.getPropertyValue('--depth')), '1')
  await page.getByRole('button', { name: '管理标签', exact: true }).click()
  await drop('专注', null)
  await page.getByRole('button', { name: '返回实录', exact: true }).click()
  assert.equal(await page.locator('.tag-shelf > button').filter({ hasText: '专注' }).evaluate(element => element.style.getPropertyValue('--depth')), '0')

  await page.getByRole('button', { name: 'GTD', exact: true }).click()
  await page.getByRole('button', { name: 'Tags', exact: true }).click()
  assert.equal(await kind.inputValue(), 'context')
  await addManagedTag('地点')
  await addManagedTag('电脑')
  await drop('电脑', '地点')
  await drop('电脑', null)
  assert.deepEqual(pageErrors, [])
})

test('real Chromium host light/dark themes drive readable tokens and 390px layouts without page errors', { timeout: 360_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-secretary-theme-browser-'))
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
    '        journalMode: delete',
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

  const browser = await chromium.launch({ headless: true })
  let server
  const pageErrors = []
  t.after(async () => {
    if (server) await server.stop()
    await browser.close()
    await rm(home, { recursive: true, force: true })
  })
  const screenshotDirectory = process.env.SECRETARY_SCREENSHOT_DIR
  if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true })

  server = await boot(home, overlay)
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Shanghai' })
  const page = await context.newPage()
  collectPageErrors(page, pageErrors)
  await openPanel(page, server.url)
  await createTag(page, '工作')
  await chooseDate(page, '2026-11-02')
  await page.getByRole('button', { name: '2026-11-02 09:00 时间格', exact: true }).click()
  await page.getByRole('button', { name: /实录 工作 09:00/ }).waitFor()

  const observed = {}
  for (const theme of ['light', 'dark']) {
    await setHostTheme(page, theme)
    await openPanel(page, server.url)
    await chooseDate(page, '2026-11-02')
    await page.getByRole('button', { name: /实录 工作 09:00/ }).waitFor()
    observed[theme] = await page.evaluate(() => {
      const panel = document.querySelector('.secretary-time-panel')
      const header = document.querySelector('.product-header')
      const probe = document.createElement('div')
      probe.style.cssText = 'position:fixed;visibility:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)'
      document.body.appendChild(probe)
      const panelStyle = getComputedStyle(panel)
      const tokenStyle = getComputedStyle(probe)
      const selectedStyle = getComputedStyle(document.querySelector('.tag-shelf > button.selected'))
      const backgroundChain = element => {
        const colors = []
        let current = element
        while (current) {
          colors.push(getComputedStyle(current).backgroundColor)
          if (current === panel) break
          current = current.parentElement
        }
        return colors
      }
      const values = {
        background: panelStyle.backgroundColor,
        color: panelStyle.color,
        tokenBackground: tokenStyle.backgroundColor,
        tokenColor: tokenStyle.color,
        headerBackground: getComputedStyle(header).backgroundColor,
        controlBackground: getComputedStyle(document.querySelector('.date-strip .date-label')).backgroundColor,
        controlColor: getComputedStyle(document.querySelector('.date-strip .date-label')).color,
        hourColor: getComputedStyle(document.querySelector('.hour-label')).color,
        selectedBackgroundChain: backgroundChain(document.querySelector('.tag-shelf > button.selected')),
        selectedColor: selectedStyle.color,
        selectedBorder: selectedStyle.borderColor,
        selectedBorderStyle: selectedStyle.borderStyle,
        selectedControls: [...document.querySelectorAll('.product-header button[aria-current="page"], .segmented button[aria-selected="true"], .segmented button[aria-pressed="true"]')].map(element => ({
          color: getComputedStyle(element).color,
          border: getComputedStyle(element).borderColor,
          backgrounds: backgroundChain(element),
        })),
        dark: document.body.hasAttribute('data-ds-dark-theme'),
      }
      probe.remove()
      return values
    })
    const current = observed[theme]
    assert.equal(current.dark, theme === 'dark')
    assert.equal(current.background, current.tokenBackground, `${theme} panel must use the host background token`)
    assert.equal(current.color, current.tokenColor, `${theme} panel must use the host text token`)
    const luminance = color => {
      const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
        const channel = value / 255
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      })
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
    }
    const composite = (foreground, background) => {
      const fg = foreground.match(/[\d.]+/g).map(Number)
      const bg = background.match(/[\d.]+/g).map(Number)
      const alpha = fg[3] ?? 1
      return `rgb(${fg.slice(0, 3).map((channel, index) => channel * alpha + bg[index] * (1 - alpha)).join(', ')})`
    }
    const compositeChain = colors => colors.slice(0, -1).reduceRight((background, foreground) => composite(foreground, background), colors[colors.length - 1])
    const selectedBackground = compositeChain(current.selectedBackgroundChain)
    const contrastRatio = (foreground, background) => {
      const contrast = (luminance(foreground) + 0.05) / (luminance(background) + 0.05)
      return contrast >= 1 ? contrast : 1 / contrast
    }
    const ratio = contrastRatio(current.color, current.background)
    assert.ok(ratio >= 4.5, `${theme} text/background contrast ${ratio} must be at least 4.5:1`)
    const selectedTextRatio = contrastRatio(current.selectedColor, selectedBackground)
    assert.ok(selectedTextRatio >= 4.5, `${theme} selected Tag text contrast ${selectedTextRatio} (${current.selectedColor} on ${selectedBackground}) must be at least 4.5:1`)
    assert.equal(current.selectedBorderStyle, 'solid')
    assert.ok(!/rgba\(0, 0, 0, 0\)|transparent/.test(current.selectedBorder), `${theme} selected Tag needs a visible border`)
    const selectedBorderRatio = contrastRatio(current.selectedBorder, selectedBackground)
    assert.ok(selectedBorderRatio >= 3, `${theme} selected Tag border contrast ${selectedBorderRatio} must be at least 3:1`)
    assert.equal(current.selectedControls.length, 3, 'Time, Actual, and granularity selected controls must all be sampled')
    for (const [index, control] of current.selectedControls.entries()) {
      const background = compositeChain(control.backgrounds)
      const controlRatio = contrastRatio(control.color, background)
      assert.ok(controlRatio >= 4.5, `${theme} selected secondary control ${index} contrast ${controlRatio} (${control.color} on ${background}) must be at least 4.5:1`)
    }
    assert.ok(contrastRatio(current.controlColor, current.controlBackground) >= 4.5, `${theme} secondary date control must be readable`)
    assert.ok(contrastRatio(current.hourColor, current.background) >= 4.5, `${theme} hour labels must be readable`)

    await page.getByRole('button', { name: '打开日历选择日期', exact: true }).click()
    const calendarStyles = await page.getByRole('dialog', { name: '选择日期', exact: true }).evaluate(dialog => {
      const style = selector => getComputedStyle(dialog.querySelector(selector))
      const probe = document.createElement('div')
      probe.style.cssText = 'position:fixed;visibility:hidden;background:var(--dsw-alias-bg-overlay)'
      document.body.appendChild(probe)
      const values = {
        background: getComputedStyle(dialog).backgroundColor,
        color: getComputedStyle(dialog).color,
        tokenBackground: getComputedStyle(probe).backgroundColor,
        selectedBackground: style('.calendar-day[aria-current="date"]').backgroundColor,
        selectedColor: style('.calendar-day[aria-current="date"]').color,
        controlColor: style('.calendar-head button').color,
        weekdayColor: style('.calendar-grid.weekdays span').color,
      }
      probe.remove()
      return values
    })
    assert.equal(calendarStyles.background, calendarStyles.tokenBackground, `${theme} calendar must use the host overlay token`)
    assert.ok(contrastRatio(calendarStyles.color, calendarStyles.background) >= 4.5, `${theme} calendar text must be readable`)
    assert.ok(contrastRatio(calendarStyles.controlColor, calendarStyles.background) >= 4.5, `${theme} calendar controls must be readable`)
    assert.ok(contrastRatio(calendarStyles.weekdayColor, calendarStyles.background) >= 4.5, `${theme} calendar weekdays must be readable`)
    assert.ok(contrastRatio(calendarStyles.selectedColor, calendarStyles.selectedBackground) >= 4.5, `${theme} selected calendar day must be readable`)
    await page.getByRole('dialog', { name: '选择日期', exact: true }).getByRole('button', { name: '2026-11-02', exact: true }).click()

    await page.getByRole('button', { name: /实录 工作 09:00/ }).click({ modifiers: ['Shift'] })
    const editorStyles = await page.getByRole('dialog', { name: '编辑实录', exact: true }).evaluate(dialog => {
      const probe = document.createElement('div')
      probe.style.cssText = 'position:fixed;visibility:hidden;background:var(--dsw-alias-bg-overlay)'
      document.body.appendChild(probe)
      const input = dialog.querySelector('input')
      const values = {
        background: getComputedStyle(dialog).backgroundColor,
        color: getComputedStyle(dialog).color,
        tokenBackground: getComputedStyle(probe).backgroundColor,
        labelColor: getComputedStyle(dialog.querySelector('label')).color,
        inputBackground: getComputedStyle(input).backgroundColor,
        inputColor: getComputedStyle(input).color,
        actionBackground: getComputedStyle(dialog.querySelector('.editor-actions button')).backgroundColor,
        actionColor: getComputedStyle(dialog.querySelector('.editor-actions button')).color,
      }
      probe.remove()
      return values
    })
    assert.equal(editorStyles.background, editorStyles.tokenBackground, `${theme} editor must use the host overlay token`)
    assert.ok(contrastRatio(editorStyles.color, editorStyles.background) >= 4.5, `${theme} editor text must be readable`)
    assert.ok(contrastRatio(editorStyles.labelColor, editorStyles.background) >= 4.5, `${theme} editor labels must be readable`)
    assert.ok(contrastRatio(editorStyles.inputColor, editorStyles.inputBackground) >= 4.5, `${theme} editor inputs must be readable`)
    assert.ok(contrastRatio(editorStyles.actionColor, editorStyles.actionBackground) >= 4.5, `${theme} editor actions must be readable`)
    await page.getByRole('button', { name: '取消', exact: true }).click()
    if (screenshotDirectory) await page.screenshot({ path: join(screenshotDirectory, `time-tag-${theme}.png`), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `390px ${theme} page has horizontal overflow`)
    await page.setViewportSize({ width: 1280, height: 900 })
  }
  assert.notEqual(observed.light.background, observed.dark.background)
  assert.notEqual(observed.light.color, observed.dark.color)
  assert.deepEqual(pageErrors, [])
})
