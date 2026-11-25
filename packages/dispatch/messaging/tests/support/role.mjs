/**
 * Boots role realms of the messaging plugin on a DSH home whose Gateway is already running. Shared by the in-process
 * scenarios and by the child processes that play a crashing host (`seeds` is a JSON file `{ ref: seed }`, mode 0600).
 */
import { readFile } from 'node:fs/promises'
import { Context } from '@deepseek-ai/cordis'
import { SERVICE_KEY } from 'dsh-secretary-dispatch-messaging'
import * as MESSAGING from 'dsh-secretary-dispatch-messaging'

export async function bootRoles(dshHome, seeds, configs) {
  const stored = typeof seeds === 'string' ? JSON.parse(await readFile(seeds, 'utf8')) : seeds
  const root = new Context()
  root.provide('credentials', { async resolve(ref) { const value = stored[String(ref)]; return value === undefined ? undefined : { value, source: 'tracer' } } })
  const roles = {}
  for (const config of configs) {
    const realm = root.isolate(SERVICE_KEY)
    const plugin = realm.plugin(MESSAGING, { dshHome, ...config })
    await plugin
    roles[config.role] = { realm, plugin, messaging: realm.get(SERVICE_KEY) }
  }
  return { root, roles, dispose: () => root.fiber.dispose() }
}
