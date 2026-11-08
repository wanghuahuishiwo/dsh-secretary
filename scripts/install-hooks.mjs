#!/usr/bin/env node
/** Installs the lefthook git hooks when this checkout has a .git directory. */
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

if (!existsSync('.git')) process.exit(0)

const result = spawnSync('lefthook', ['install'], { stdio: 'inherit', shell: process.platform === 'win32' })
if (result.status !== 0) {
  console.error('secretary: failed to install lefthook hooks; run "pnpm run hooks:install" manually')
  process.exit(result.status ?? 1)
}
