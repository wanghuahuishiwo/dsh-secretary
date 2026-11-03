import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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
  const dshVersion = execFileSync('dsh', ['--version'], { encoding: 'utf8' }).trim()
  execFileSync('dsh', [
    'plugin', '--profile', 'web', 'allow-version', '@deepseek-ai/dsh-storage-sqlite@0.2.1-rc.3',
    '--dsh-version', dshVersion, '--accept-risk',
  ], { env: { ...process.env, DSH_HOME: home }, stdio: 'pipe' })
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
  page.on('pageerror', error => pageErrors.push(error))
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
  await page.getByRole('button', { name: '听播客', exact: true }).click()
  await first.click()
  await page.locator('[data-slot="09:00"] .actual-fragment').nth(1).waitFor()
  assert.equal(await page.locator('[data-slot="09:00"] .actual-fragment').count(), 2)

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
  page.on('pageerror', error => pageErrors.push(error))
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
  page.on('pageerror', error => pageErrors.push(error))
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
  const dshVersion = execFileSync('dsh', ['--version'], { encoding: 'utf8' }).trim()
  execFileSync('dsh', [
    'plugin', '--profile', 'web', 'allow-version', '@deepseek-ai/dsh-storage-sqlite@0.2.1-rc.3',
    '--dsh-version', dshVersion, '--accept-risk',
  ], { env: { ...process.env, DSH_HOME: home }, stdio: 'pipe' })
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
  page.on('pageerror', error => pageErrors.push(error))
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
  page.on('pageerror', error => pageErrors.push(error))
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
  const dshVersion = execFileSync('dsh', ['--version'], { encoding: 'utf8' }).trim()
  execFileSync('dsh', [
    'plugin', '--profile', 'web', 'allow-version', '@deepseek-ai/dsh-storage-sqlite@0.2.1-rc.3',
    '--dsh-version', dshVersion, '--accept-risk',
  ], { env: { ...process.env, DSH_HOME: home }, stdio: 'pipe' })
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
  page.on('pageerror', error => pageErrors.push(error))
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
  page.on('pageerror', error => pageErrors.push(error))
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
