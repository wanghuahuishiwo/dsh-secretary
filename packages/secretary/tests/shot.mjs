import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { openTimeRemote } from './open-time-product.mjs'

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

try {
  await openTimeRemote(page, url)
  const seeded = await page.evaluate(async () => {
    const response = await fetch('/api/secretary-test.tags', { method: 'POST' })
    if (!response.ok) throw new Error(`Tag fixture failed (${response.status})`)
    return response.json()
  })
  console.log('seeded tags', seeded.tags.length)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openTimeRemote(page, url)
  const product = page.locator('[data-time-remote]')
  await product.locator('.tb-daylabel').click()
  await product.locator('.tb-picker').waitFor()
  const dayScreenshot = join(home, 'picker-day.png')
  await page.screenshot({ path: dayScreenshot })
  console.log('day picker', await product.locator('.tb-picker').count(), dayScreenshot)
  await page.keyboard.press('Escape')
  await product.getByRole('button', { name: '一级模块' }).click()
  await product.getByRole('button', { name: '深度时间', exact: true }).click()
  await product.locator('.tb-hc').first().waitFor()
  await product.locator('.tb-daylabel').click()
  await product.locator('.tb-picker').waitFor()
  const weekScreenshot = join(home, 'picker-week.png')
  await page.screenshot({ path: weekScreenshot })
  console.log('week picker', await product.locator('.tb-picker').count(), weekScreenshot)
} finally {
  await browser.close()
  child.kill('SIGTERM')
}
