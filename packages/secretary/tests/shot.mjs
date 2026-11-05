import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const home = await mkdtemp(join(tmpdir(), 'shot-'))
const overlay = join(home, 'overlay.yml')
const packageDir = join(ROOT, 'packages/time-panel')
const profile = join(home, 'profiles', 'web')
await mkdir(join(profile, 'node_modules'), { recursive: true })
await symlink(packageDir, join(profile, 'node_modules/dsh-secretary-time-panel'), 'dir')
await writeFile(join(profile, 'package.json'), JSON.stringify({
  name: 'dsh-profile-web', private: true,
  dependencies: { 'dsh-secretary-time-panel': `link:${packageDir}` },
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
}, null, 2))
await writeFile(join(home, 'tag-fixture.mjs'), `
  export const inject = ['connection', 'tags']
  export function apply(ctx) {
    ctx.effect(() => ctx.connection.fetch.register({
      path: '/api/secretary-test.tags', methods: ['POST'], requestBody: 'buffered',
      async fetch() {
        const tags = []
        for (const [name, color] of [['工作', '#477bc7'], ['生活', '#317b68'], ['睡眠', '#5d6b8a'], ['吃饭', '#d08a3e']]) {
          tags.push(await ctx.tags.createTag({ name, kind: 'time', color }))
        }
        return Response.json({ tags })
      },
    }), 'test-only TagService screenshot fixture')
  }
`)
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
  "    - id: secretary-browser-time-panel", "      name: 'dsh-secretary-time-panel'",
  "    - id: secretary-browser-tag-fixture", `      name: 'file://${join(home, 'tag-fixture.mjs')}'`,
  "    - id: secretary-browser-gtd-panel", `      name: 'file://${join(ROOT, 'packages/gtd-panel/lib/index.js')}'`, '',
].join('\n'))
const port = await new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)) }) })
const child = spawn('dsh', ['web', '--patch', overlay, '--port', String(port), '--no-open'], { env: { ...process.env, DSH_HOME: home, DEEPSEEK_API_KEY: 'x' }, stdio: ['ignore', 'pipe', 'pipe'] })
let out = ''
const url = await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(out)), 90000); const c = d => { out += String(d); const m = /(http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+)/.exec(out); if (m) { clearTimeout(t); res(m[1]) } }; child.stdout.on('data', c); child.stderr.on('data', c) })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

async function openTimeProduct() {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  for (const label of ['Continue', 'Got it', '继续', '知道了']) {
    const button = page.getByRole('button', { name: label, exact: true })
    if (await button.count() && await button.isVisible()) await button.click()
  }
  const newSession = page.getByRole('button', { name: /^(新建会话|New session|New Session)$/ }).first()
  if (await newSession.count()) await newSession.click()
  await page.waitForFunction(() => document.querySelector('[data-time-remote]') !== null
    || [...document.querySelectorAll('button')].some(button => ['New tab', 'Open right sidebar', '打开右侧边栏'].includes(button.getAttribute('aria-label') ?? '')))
  if (await page.locator('[data-time-remote]').count() === 0) {
    const openSidebar = page.getByRole('button', { name: /^(Open right sidebar|打开右侧边栏)$/ })
    if (await openSidebar.count()) await openSidebar.click()
    const tab = page.getByRole('button', { name: /^小秘书-时间块/ }).first()
    const newTab = page.getByRole('button', { name: 'New tab', exact: true })
    if (await tab.count() === 0 && await newTab.count() > 0) await newTab.click()
    await tab.waitFor()
    await tab.click()
  }
  await page.locator('[data-time-remote][data-remote-state="ready"]').waitFor({ timeout: 30_000 })
}

try {
  await openTimeProduct()
  const seeded = await page.evaluate(async () => {
    const response = await fetch('/api/secretary-test.tags', { method: 'POST' })
    if (!response.ok) throw new Error(`Tag fixture failed (${response.status})`)
    return response.json()
  })
  console.log('seeded tags', seeded.tags.length)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openTimeProduct()
  const product = page.locator('[data-time-remote]')
  await product.locator('.sec-daylabel').click()
  await product.locator('.sec-picker').waitFor()
  await page.screenshot({ path: join(ROOT, 'docs/assets/verification/picker-day.png') })
  console.log('day picker', await product.locator('.sec-picker').count())
  await page.keyboard.press('Escape')
  await product.getByRole('button', { name: '一级模块' }).click()
  await product.getByRole('button', { name: '深度时间', exact: true }).click()
  await product.locator('.sec-hc').first().waitFor()
  await product.locator('.sec-daylabel').click()
  await product.locator('.sec-picker').waitFor()
  await page.screenshot({ path: join(ROOT, 'docs/assets/verification/picker-week.png') })
  console.log('week picker', await product.locator('.sec-picker').count())
} finally {
  await browser.close()
  child.kill('SIGTERM')
}
