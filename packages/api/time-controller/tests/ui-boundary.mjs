import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const PACKAGE = fileURLToPath(new URL('..', import.meta.url))
const UI = join(PACKAGE, 'src', 'ui')
const CLIENT = join(PACKAGE, 'src', 'client')

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await sourceFiles(path))
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(path)
  }
  return files
}

/** Every module specifier a file imports, including `import type` and dynamic import. */
function importsOf(source) {
  return [...source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map(match => match[1])
}

async function packageJson() {
  return JSON.parse(await readFile(join(PACKAGE, 'package.json'), 'utf8'))
}

test('src/ui imports no host, Remote, product package or client code', async () => {
  const files = await sourceFiles(UI)
  assert.ok(files.length >= 12, `expected the extracted UI sources, found ${files.length}`)
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    const label = file.slice(PACKAGE.length + 1)
    for (const specifier of importsOf(source)) {
      assert.doesNotMatch(specifier, /^@deepseek-ai\//, `${label} imports DSH: ${specifier}`)
      assert.doesNotMatch(specifier, /^dsh-secretary-/, `${label} imports a product package: ${specifier}`)
      assert.doesNotMatch(specifier, /(?:^|\/)client(?:\/|$)/, `${label} imports client code: ${specifier}`)
      assert.doesNotMatch(specifier, /productStyles/, `${label} imports the removed product styles: ${specifier}`)
    }
    assert.doesNotMatch(source, /ctx\.remote/, `${label} reaches into the Remote Context`)
    assert.doesNotMatch(source, /productStyles/, `${label} references the removed product styles`)
    assert.doesNotMatch(source, /from\s+['"]react-dom/, `${label} mounts itself instead of being host-rendered`)
  }
})

test('package.json exposes ./ui with declarations and the built bundle in files', async () => {
  const pkg = await packageJson()
  assert.deepEqual(pkg.exports['./ui'], {
    types: './lib/ui-types/index.d.ts',
    default: './lib/ui.js',
  })
  for (const entry of ['lib/ui.js', 'lib/ui.js.map', 'lib/ui-types/**/*.d.ts']) {
    assert.ok(pkg.files.includes(entry), `files must ship ${entry}`)
  }
})

test('the production shell is the Adapter + TimeProduct composition, not the old TimeShell', async () => {
  await assert.rejects(stat(join(CLIENT, 'TimeShell.tsx')), /ENOENT/, 'TimeShell must be deleted')
  const client = await readFile(join(CLIENT, 'TimeClient.tsx'), 'utf8')
  assert.match(client, /RemoteTimeAdapter/)
  assert.match(client, /<TimeProduct adapter=\{adapter\}/)
  assert.match(client, /hostTokens/)
  const index = await readFile(join(CLIENT, 'index.tsx'), 'utf8')
  assert.match(index, /import \{ TimeClient \} from '\.\/TimeClient\.tsx'/)
  assert.match(index, /<TimeClient ctx=\{ctx\}/)
  assert.doesNotMatch(index, /TimeShell/)
})

test('the public ui entry exports only the product root, timeMath and contract types', async () => {
  const entry = await readFile(join(UI, 'index.ts'), 'utf8')
  assert.match(entry, /export \{ TimeProduct \} from '\.\/TimeProduct\.tsx'/)
  assert.match(entry, /export \{ timeMath \} from '\.\/model\.ts'/)
  assert.match(entry, /export type \{/)
  for (const type of ['TimeAdapter', 'TimeView', 'TimeQuery', 'PaintCommand', 'PaintDeepCommand']) {
    assert.match(entry, new RegExp(`\\b${type}\\b`), `the public entry must export ${type}`)
  }
})
