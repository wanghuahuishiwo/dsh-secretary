#!/usr/bin/env node
/**
 * Workspace structure constraints.
 *
 * The package map in packages/README.md is the single authority; this script
 * verifies that promise against the filesystem and the repo's naming rules.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const PACKAGES = join(ROOT, 'packages')
const errors = []

function fail(message) {
  errors.push(message)
}

const groups = readdirSync(PACKAGES, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort()

const mapText = existsSync(join(PACKAGES, 'README.md'))
  ? readFileSync(join(PACKAGES, 'README.md'), 'utf8')
  : ''
if (mapText === '') fail('packages/README.md: missing package map')

const mappedGroups = new Set([...mapText.matchAll(/\]\(([a-z0-9-]+)\/README\.md\)/g)].map(match => match[1]))
const mappedPackages = new Set(
  [...mapText.matchAll(/\]\(([a-z0-9-]+)\/([a-z0-9-]+)\/README\.md\)/g)]
    .map(match => `${match[1]}/${match[2]}`),
)

const packageNames = new Set()

for (const group of groups) {
  if (!mappedGroups.has(group)) fail(`packages/README.md: missing group "${group}"`)
  if (!existsSync(join(PACKAGES, group, 'README.md'))) fail(`packages/${group}: missing README.md`)

  const children = readdirSync(join(PACKAGES, group), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()

  if (group === 'bundle' && (children.length !== 1 || children[0] !== 'secretary')) {
    fail('packages/bundle: expected exactly one package "secretary"')
  }

  for (const child of children) {
    if (child === group) fail(`packages/${group}/${child}: package directory must not repeat its group name`)
    if (!mappedPackages.has(`${group}/${child}`)) fail(`packages/README.md: missing package "${group}/${child}"`)

    for (const file of ['package.json', 'README.md', 'build.mjs']) {
      if (!existsSync(join(PACKAGES, group, child, file))) fail(`packages/${group}/${child}: missing ${file}`)
    }

    const manifestPath = join(PACKAGES, group, child, 'package.json')
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      if (typeof manifest.name !== 'string' || !manifest.name.startsWith('dsh-secretary')) {
        fail(`packages/${group}/${child}/package.json: package name must start with "dsh-secretary"`)
      }
      if (packageNames.has(manifest.name)) fail(`duplicate package name "${manifest.name}"`)
      packageNames.add(manifest.name)
      if (group === 'client' && !child.startsWith('ui-')) {
        fail(`packages/${group}/${child}: client packages must be named ui-*`)
      }
      if (group === 'api' && !child.endsWith('-controller')) {
        fail(`packages/${group}/${child}: api packages must be named *-controller`)
      }
      if (group === 'bundle' && manifest.name !== 'dsh-secretary') {
        fail('packages/bundle/secretary: bundle package must be named "dsh-secretary"')
      }
    }
  }
}

for (const mapped of mappedPackages) {
  const [group, child] = mapped.split('/')
  if (!existsSync(join(PACKAGES, group, child))) fail(`packages/README.md: stale package row "${mapped}"`)
}

const workspace = readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf8')
if (!workspace.includes("'packages/*/*'")) fail('pnpm-workspace.yaml: must include "packages/*/*"')

if (errors.length > 0) {
  for (const error of errors) console.error(`secretary constraints: ${error}`)
  console.error(`\n${errors.length} workspace constraint violation(s)`)
  process.exit(1)
}

console.log(`workspace constraints: ${groups.length} groups, ${packageNames.size} packages OK (${relative(ROOT, PACKAGES)})`)
