#!/usr/bin/env node
/** Verifies repo-local Markdown links; external URLs, anchors and history are out of scope. */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(new URL('..', import.meta.url).pathname)
const SKIP = new Set(['node_modules', 'lib', '.git', '.archify', 'research'])
const ROOTS = ['AGENTS.md', 'README.md', 'DESIGN.md', 'docs', 'packages', 'design', 'CONTRIBUTING.md']
const files = []

function walk(entry) {
  const full = join(ROOT, entry)
  if (!existsSync(full)) return
  const stat = statSync(full)
  if (stat.isFile()) {
    if (entry.endsWith('.md')) files.push(full)
    return
  }
  for (const child of readdirSync(full, { withFileTypes: true })) {
    if (SKIP.has(child.name)) continue
    walk(join(entry, child.name))
  }
}

for (const entry of ROOTS) walk(entry)

const linkPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const errors = []
for (const file of files) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(linkPattern)) {
    const target = match[1]
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) continue
    const path = decodeURI(target.split('#')[0])
    if (path === '') continue
    if (!existsSync(resolve(dirname(file), path))) {
      errors.push(`${file.slice(ROOT.length + 1)}: broken link "${target}"`)
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`secretary docs: ${error}`)
  console.error(`\n${errors.length} broken Markdown link(s)`)
  process.exit(1)
}
console.log(`docs links: ${files.length} files OK`)
