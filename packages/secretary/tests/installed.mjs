import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { execFile } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { chromium } from 'playwright'
import { openTimeRemote } from './open-time-product.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const exec = promisify(execFile)

async function run(command, args, options = {}) {
  try {
    return await exec(command, args, { maxBuffer: 20 * 1024 * 1024, ...options })
  } catch (error) {
    throw new Error(`${command} ${args.join(' ')} failed\n${error.stdout ?? ''}${error.stderr ?? ''}`, { cause: error })
  }
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
    env: { ...process.env, DSH_HOME: home, DEEPSEEK_API_KEY: 'installed-test-no-model' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  const url = await new Promise((resolveUrl, reject) => {
    const timer = setTimeout(() => reject(new Error(`installed dsh did not print its token URL:\n${output}`)), 90_000)
    const collect = chunk => {
      output += String(chunk)
      const match = /(http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+)/.exec(output)
      if (match) { clearTimeout(timer); resolveUrl(match[1]) }
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`installed dsh exited early (${code}):\n${output}`)) })
  })
  return {
    url,
    output: () => output,
    async stop() {
      if (child.exitCode !== null) return
      const exited = new Promise(resolveExit => child.once('exit', resolveExit))
      child.kill('SIGTERM')
      await exited
    },
  }
}

async function remoteCall(page, method, input) {
  return page.evaluate(async ({ method, input }) => {
    const response = await fetch(`/api/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: `installed-${crypto.randomUUID()}`, method, payload: { args: { input } } }),
    })
    const envelope = await response.json()
    return envelope.result
  }, { method, input })
}

async function packWorkspace(destination) {
  await mkdir(destination, { recursive: true })
  const directories = (await readdir(join(ROOT, 'packages'), { withFileTypes: true }))
    .filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
  const packs = []
  for (const directory of directories) {
    const cwd = join(ROOT, 'packages', directory)
    const manifest = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'))
    await run('pnpm', ['pack', '--pack-destination', destination], { cwd })
    packs.push({ name: manifest.name, path: join(destination, `${manifest.name}-${manifest.version}.tgz`) })
    await access(packs.at(-1).path)
  }
  return packs
}

test('final tarballs install into a fresh profile and serve Time/GTD with persistent SQLite writes', { timeout: 600_000 }, async (t) => {
  const work = await mkdtemp(join(tmpdir(), 'dsh-secretary-installed-'))
  const home = join(work, 'home')
  const profile = join(home, 'profiles', 'web')
  const packs = await packWorkspace(join(work, 'packs'))
  await mkdir(profile, { recursive: true })
  await writeFile(join(profile, 'pnpm-workspace.yaml'), [
    'packages:', '  - .', '', 'nodeLinker: hoisted', 'autoInstallPeers: false', '', 'overrides:',
    ...packs.map(pack => `  ${pack.name}: file:${pack.path}`), '',
  ].join('\n'))
  const env = { ...process.env, DSH_HOME: home, DEEPSEEK_API_KEY: 'installed-test-no-model' }
  await run('dsh', ['plugin', '--profile', 'web', 'add', ...packs.map(pack => pack.path)], { env })
  const manifestPath = join(profile, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const bundles = manifest.dsh.profile.bundles
  assert.ok(bundles.includes('@deepseek-ai/dsh-base') && bundles.includes('@deepseek-ai/dsh-web-app'))
  if (!bundles.includes('dsh-secretary')) bundles.push('dsh-secretary')
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  const fixture = join(work, 'installed-fixture.mjs')
  await writeFile(fixture, `
    export const inject = ['connection', 'storage', 'secretaryStorageDomain', 'goals', 'tags', 'time', 'gtd']
    export function apply(ctx) {
      ctx.effect(() => ctx.connection.fetch.register({
        path: '/api/secretary-installed.fixture', methods: ['POST'], requestBody: 'buffered',
        async fetch() {
          const tag = await ctx.tags.createTag({ name: 'Installed 工作', kind: 'time', color: '#477bc7' })
          return Response.json({
            tag,
            goalProvider: ctx.goals.constructor.name,
            services: {
              storage: ctx.get('storage') !== undefined,
              domain: ctx.get('secretaryStorageDomain') !== undefined,
              goal: ctx.get('goals') !== undefined,
              tag: ctx.get('tags') !== undefined,
              time: ctx.get('time') !== undefined,
              gtd: ctx.get('gtd') !== undefined,
            },
          })
        },
      }), 'installed-profile test-only Tag fixture')
    }
  `)
  const overlay = join(work, 'acceptance.patch.yml')
  await writeFile(overlay, [
    '- id: ui-settings-general', '  config:', "    welcomeNoticeVersion: '2026-09-28.1'",
    '- id: ui-settings-account', '  config:', '    version: 1', '    step: done', '    usage: detailed',
    '    developerTools: true', '    purpose: null', '    process: standard', '    completion: api-key',
    '- insert:', '    - id: secretary-installed-fixture', `      name: 'file://${fixture}'`, '',
  ].join('\n'))
  await assert.rejects(access(join(home, 'storages', 'secretary.db')), 'the cold-start SQLite file must not exist')

  let server
  let browser
  const outputs = []
  t.after(async () => { await browser?.close(); await server?.stop() })
  try {
    server = await boot(home, overlay)
    browser = await chromium.launch()
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error))
    await openTimeRemote(page, server.url)
    const first = await remoteCall(page, 'secretaryTime/readWindow', { anchor: '2026-11-02', timeZone: 'Asia/Shanghai' })
    assert.equal(first.ok, true, `the first Remote readWindow must succeed without a retry: ${JSON.stringify(first)}`)
    assert.deepEqual(first.value.actual, [])
    assert.deepEqual(first.value.tags, [])

    const fixtureResult = await page.evaluate(async () => {
      const response = await fetch('/api/secretary-installed.fixture', { method: 'POST' })
      const body = await response.json()
      if (!response.ok) throw new Error(JSON.stringify(body))
      return body
    })
    assert.equal(fixtureResult.goalProvider, 'EmptyGoalService')
    assert.deepEqual(fixtureResult.services, { storage: true, domain: true, goal: true, tag: true, time: true, gtd: true })

    const painted = await remoteCall(page, 'secretaryTime/paint', {
      layer: 'actual', tagId: fixtureResult.tag.id, timeZone: 'Asia/Shanghai',
      runs: [{ date: '2026-11-02', start: 480, end: 540 }],
    })
    assert.equal(painted.ok, true, JSON.stringify(painted))
    const read = await remoteCall(page, 'secretaryTime/readWindow', { anchor: '2026-11-02', timeZone: 'Asia/Shanghai' })
    assert.equal(read.ok, true, JSON.stringify(read))
    assert.deepEqual(read.value.actual.map(block => [block.startAt, block.endAt, block.timeTagId]), [
      ['2026-11-02T00:00:00.000Z', '2026-11-02T01:00:00.000Z', fixtureResult.tag.id],
    ])

    const entry = page.getByRole('button', { name: '小秘书-事项', exact: true })
    await entry.waitFor({ timeout: 30_000 })
    await entry.click()
    const main = page.getByRole('main', { name: '小秘书-事项', exact: true })
    await main.waitFor({ state: 'attached' })
    assert.equal(await main.innerText(), '')
    assert.deepEqual(errors, [])
    outputs.push(['initial', server.output()])
    await server.stop()

    server = await boot(home, overlay)
    await openTimeRemote(page, server.url)
    const restored = await remoteCall(page, 'secretaryTime/readWindow', { anchor: '2026-11-02', timeZone: 'Asia/Shanghai' })
    assert.equal(restored.ok, true, JSON.stringify(restored))
    assert.deepEqual(restored.value.actual.map(block => [block.startAt, block.endAt, block.timeTagId]), [
      ['2026-11-02T00:00:00.000Z', '2026-11-02T01:00:00.000Z', fixtureResult.tag.id],
    ], 'the paint must survive a complete dsh web restart')
    outputs.push(['restart', server.output()])
    for (const [phase, output] of outputs) {
      await writeFile(join(work, `boot-${phase}.log`), output)
      assert.doesNotMatch(output, /service "goals" has been registered|ERR_MODULE_NOT_FOUND/)
    }
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ work, packed: packs.length, services: fixtureResult.services, goalProvider: fixtureResult.goalProvider, firstRead: true, paintPersisted: true }, null, 2))
  } catch (error) {
    if (server) await writeFile(join(work, 'boot-failure.log'), server.output())
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nInstalled artifacts: ${work}\nHost output:\n${server?.output() ?? 'not booted'}`, { cause: error })
  }
})
