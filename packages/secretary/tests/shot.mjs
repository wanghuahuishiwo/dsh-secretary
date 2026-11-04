import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
const ROOT = '/Users/wanghuahui/workspace/dsh-secretary'
const home = await mkdtemp(join(tmpdir(), 'shot-'))
const overlay = join(home, 'overlay.yml')
await writeFile(overlay, [
  '- id: ui-settings-general', '  config:', "    welcomeNoticeVersion: '2026-09-28.1'",
  '- id: ui-settings-account', '  config:', '    version: 1', '    step: done', '    usage: detailed',
  '    developerTools: true', '    purpose: null', '    process: standard', '    completion: api-key',
  '- insert:',
  "    - id: secretary-browser-sqlite", `      name: 'file://${join(ROOT, 'packages/secretary/node_modules/@deepseek-ai/dsh-storage-sqlite/lib/index.js')}'`, '      config:', `        path: ${join(home, 's.sqlite')}`, '      journalMode: delete',
  "    - id: secretary-browser-storage", `      name: 'file://${join(ROOT, 'packages/storage/lib/index.js')}'`,
  "    - id: secretary-browser-goal", `      name: 'file://${join(ROOT, 'packages/goal/lib/index.js')}'`,
  "    - id: secretary-browser-tag", `      name: 'file://${join(ROOT, 'packages/tag/lib/index.js')}'`,
  "    - id: secretary-browser-gtd", `      name: 'file://${join(ROOT, 'packages/gtd/lib/index.js')}'`,
  "    - id: secretary-browser-time", `      name: 'file://${join(ROOT, 'packages/time-block/lib/index.js')}'`,
  "    - id: secretary-browser-panel", `      name: 'file://${join(ROOT, 'packages/panel/lib/index.js')}'`, '',
].join('\n'))
const port = await new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)) }) })
const child = spawn('dsh', ['web', '--patch', overlay, '--port', String(port), '--no-open'], { env: { ...process.env, DSH_HOME: home, DEEPSEEK_API_KEY: 'x' }, stdio: ['ignore', 'pipe', 'pipe'] })
let out = ''
const url = await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(out)), 90000); const c = d => { out += String(d); const m = /(http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+)/.exec(out); if (m) { clearTimeout(t); res(m[1]) } }; child.stdout.on('data', c); child.stderr.on('data', c) })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2200)
  for (const label of ['Continue', 'Got it', '继续', '知道了']) { const b = page.getByRole('button', { name: label, exact: true }); if (await b.count() && await b.isVisible()) await b.click() }
  const nw = page.getByRole('button', { name: /^(新建会话|New session|New Session)$/ }).first()
  if (await nw.count()) await nw.click()
  await page.waitForTimeout(1200)
  const sb = page.getByRole('button', { name: /^(Open right sidebar|打开右侧边栏)$/ })
  if (await sb.count()) await sb.click()
  await page.waitForTimeout(700)
  const cap = page.getByRole('button', { name: /小秘书/ }).first()
  if (await cap.count()) await cap.click()
  await page.waitForTimeout(1500)
  await page.evaluate(async () => {
    for (const [name, color] of [['工作', '#477bc7'], ['生活', '#317b68'], ['睡眠', '#5d6b8a'], ['吃饭', '#d08a3e']]) {
      await fetch('/api/secretary.command', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ domain: 'tag', op: 'create', name, kind: 'time', color }) })
    }
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const cap2 = page.getByRole('button', { name: /小秘书/ }).first()
  if (await cap2.count()) await cap2.click()
  await page.waitForTimeout(1500)
  await page.locator('.sec-daylabel').click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(ROOT, 'design/picker-day.png') })
  console.log('day picker', await page.locator('.sec-picker').count())
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: '一级模块' }).click()
  await page.getByRole('button', { name: '深度时间', exact: true }).click()
  await page.waitForTimeout(800)
  await page.locator('.sec-daylabel').click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(ROOT, 'design/picker-week.png') })
  console.log('week picker', await page.locator('.sec-picker').count())
} finally { await browser.close(); child.kill('SIGTERM') }
