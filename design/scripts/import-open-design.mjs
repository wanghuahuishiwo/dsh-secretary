#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PROJECT_NAME = 'dsh-secretary 设计'
const DAEMON_MARKER = '/Contents/Resources/app/prebundled/daemon/daemon-sidecar.mjs'

function sh(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' })
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
const existing = projects.find((project) => project.metadata?.baseDir === repoRoot)

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
