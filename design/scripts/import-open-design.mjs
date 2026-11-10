#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { access } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PROJECT_PREFIX = 'dsh-secretary 设计'
const DAEMON_MARKER = '/Contents/Resources/app/prebundled/daemon/daemon-sidecar.mjs'

function sh(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' })
}

/** 一个 worktree 对应一个 OD 项目：项目名带当前分支，临时路径直接拒绝。 */
function resolveProjectName() {
  if (/^\/(private\/)?tmp\/|^\/var\/folders\//.test(repoRoot)) {
    throw new Error(`OpenDesign 项目必须指向稳定目录，不要在临时路径注册：${repoRoot}\n把 worktree 放到 ~/workspace/ 下再执行。`)
  }
  let branch = 'detached'
  try {
    branch = sh('git', ['-C', repoRoot, 'rev-parse', '--abbrev-ref', 'HEAD']).trim()
  } catch {
    // 非 git 目录仍允许接入，只是项目名不带分支。
  }
  return branch === 'detached' ? `${PROJECT_PREFIX} · detached` : `${PROJECT_PREFIX} · ${branch}`
}

function findDaemon() {
  const line = sh('ps', ['-Ao', 'pid=,command='])
    .split('\n')
    .find((entry) => entry.includes(DAEMON_MARKER))

  if (!line) {
    throw new Error('OpenDesign 桌面端未运行。请先启动 OpenDesign。')
  }

  const pid = line.trim().split(/\s+/)[0]
  const before = line.slice(0, line.indexOf(DAEMON_MARKER))
  const appStart = before.lastIndexOf('/Open Design.app')
  const appRoot = Math.max(before.lastIndexOf('/Users/'), before.lastIndexOf('/Applications/'))
  if (appStart < 0 || appRoot < 0) {
    throw new Error('无法定位 OpenDesign 应用目录。')
  }

  const appPath = `${before.slice(appRoot, appStart)}/Open Design.app`
  const namespace = appPath.match(/^(.*\/namespaces\/[^/]+)\/versions\/([^/]+)\/payload\/Open Design\.app$/)
  if (!namespace) {
    throw new Error('无法定位 OpenDesign 数据目录。')
  }

  const files = sh('lsof', ['-nP', '-p', pid, '-Fn']).split('\n')
  const socket = files.find((entry) => entry.startsWith('n') && entry.endsWith('.sock'))?.slice(1)
  const portLine = sh('lsof', ['-nP', '-p', pid, '-a', '-iTCP', '-sTCP:LISTEN', '-Fn'])
    .split('\n')
    .find((entry) => /^n127\.0\.0\.1:\d+$/.test(entry))

  if (!socket || !portLine) {
    throw new Error('OpenDesign daemon 的本地端点不可用。')
  }

  return {
    appPath,
    dataDir: `${namespace[1]}/data`,
    version: namespace[2],
    socket,
    port: portLine.slice(1).split(':')[1],
  }
}

const AUDIT = process.argv.includes('--audit')
const PROJECT_NAME = resolveProjectName()
const daemon = findDaemon()
const cliPath = `${daemon.appPath}${DAEMON_MARKER.replace('daemon-sidecar.mjs', 'daemon-cli.mjs')}`

await access(cliPath).catch(() => {
  throw new Error(`OpenDesign CLI 不存在：${cliPath}`)
})

const env = {
  ...process.env,
  OD_SIDECAR_CLIENT_ENDPOINT: daemon.socket,
  OD_DATA_DIR: daemon.dataDir,
  OD_REQUIRE_DESKTOP_AUTH: '1',
  OD_APP_VERSION: daemon.version,
}

function cli(args) {
  return execFileSync(process.execPath, [cliPath, ...args], { env, encoding: 'utf8' })
}

const daemonUrl = `http://127.0.0.1:${daemon.port}`
const projects = JSON.parse(cli(['project', 'list', '--daemon-url', daemonUrl, '--json'])).projects

/** `--audit`：只做对账，不改任何项目；给「OD 项目管理员」在合并/删 worktree 后核对用。 */
if (AUDIT) {
  const branchOf = (dir) => {
    try { return sh('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD']).trim() } catch { return '—' }
  }
  const rows = projects
    .filter((project) => typeof project.metadata?.baseDir === 'string')
    .map((project) => {
      const base = project.metadata.baseDir
      const branch = branchOf(base)
      const exists = existsSync(base)
      const expected = branch === '—' || branch === 'detached' ? null : `${PROJECT_PREFIX} · ${branch}`
      const state = !exists ? '目录不存在（僵尸）' : expected !== null && project.name !== expected ? '名称不符（疑似手动创建）' : '正常'
      return { id: project.id, name: project.name, base, state }
    })
  const managed = new Set(rows.map((row) => row.base))
  const worktrees = sh('git', ['-C', repoRoot, 'worktree', 'list', '--porcelain'])
    .split('\n\n')
    .map((block) => block.match(/^worktree (.+)$/m)?.[1])
    .filter((dir) => typeof dir === 'string' && dir.startsWith('/'))
  console.log('id                                      name                                     baseDir                                     branch                  state')
  for (const row of rows) {
    console.log(`${row.id.padEnd(38)}  ${row.name.padEnd(38)}  ${row.base.padEnd(42)}  ${branchOf(row.base).padEnd(22)}  ${row.state}`)
  }
  const missing = worktrees.filter((dir) => !managed.has(dir))
  if (missing.length > 0) console.log(`\n未注册的工作树：\n${missing.map((dir) => `  ${dir}`).join('\n')}`)
  process.exit(0)
}
const existing = projects.find((project) => project.metadata?.baseDir === repoRoot)
const sameBranch = projects.filter((project) => project.name === PROJECT_NAME && project.metadata?.baseDir !== repoRoot)
const stale = projects.filter((project) => {
  const base = project.metadata?.baseDir
  return typeof base === 'string' && base.startsWith('/') && !existsSync(base)
})

if (sameBranch.length > 0) {
  console.warn(`注意：同名项目已指向其它目录：\n${sameBranch.map((project) => `  ${project.id}  ${project.metadata?.baseDir}`).join('\n')}\n` +
    '同一分支只应有一个 worktree；确认后可用 `od project delete <id>` 清理。')
}
if (stale.length > 0) {
  console.warn(`发现指向已不存在目录的僵尸项目：\n${stale.map((project) => `  ${project.id}  ${project.name}  ${project.metadata?.baseDir}`).join('\n')}\n` +
    '用 `od project delete <id>` 清理。')
}

if (existing) {
  console.log(`OpenDesign 已接入：${existing.name} (${existing.id})`)
  process.exit(0)
}

const result = JSON.parse(
  cli([
    'project',
    'import-folder',
    repoRoot,
    '--name',
    PROJECT_NAME,
    '--daemon-url',
    daemonUrl,
    '--json',
  ]),
)

console.log(`OpenDesign 已接入：${result.project.name} (${result.project.id})`)
