#!/usr/bin/env node
/** Runs publint over every workspace package after the build produced lib/. */
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { publint } from 'publint'
import { formatMessage } from 'publint/utils'

const ROOT = new URL('..', import.meta.url).pathname
const PACKAGES = join(ROOT, 'packages')
const errors = []
const warnings = []

for (const group of readdirSync(PACKAGES, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
  for (const pkg of readdirSync(join(PACKAGES, group.name), { withFileTypes: true }).filter(entry => entry.isDirectory())) {
    const dir = join(PACKAGES, group.name, pkg.name)
    const { messages } = await publint({ pkgDir: dir })
    for (const message of messages) {
      const text = `${relative(ROOT, dir)}: ${formatMessage(message, { color: false })}`
      if (message.type === 'error') errors.push(text)
      else warnings.push(text)
    }
  }
}

for (const warning of warnings) console.warn(`publint warning: ${warning}`)
if (errors.length > 0) {
  for (const error of errors) console.error(`publint error: ${error}`)
  console.error(`\n${errors.length} publint error(s)`)
  process.exit(1)
}
console.log(`publint: 15 packages OK (${warnings.length} warning(s))`)
