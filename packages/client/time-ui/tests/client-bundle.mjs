import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('built plugin bundle inlines the generated Remote and keeps platform React external', async () => {
  const client = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.match(client, /createTypertRemoteInfo/, 'generated /remote and remote-info are inlined')
  assert.doesNotMatch(client, /require\(["']@deepseek-ai\/dsh-typert-protocol\/remote-info["']\)/)
  assert.doesNotMatch(client, /require\(["']dsh-secretary-time-controller\/remote["']\)/)
  assert.match(client, /require\(["']react["']\)/, 'platform React remains external')
})
