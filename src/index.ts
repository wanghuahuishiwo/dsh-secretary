import type { Context } from '@deepseek-ai/cordis'
import { isAbsolute } from 'node:path'
import { registerSecretarySkill } from './skills.ts'
import { openSecretaryStore } from './store.ts'
import { registerAgentTools } from './tools.ts'

export { runSecretaryCommand } from './commands.ts'
export { openSecretaryStore } from './store.ts'

export const name = 'dsh-secretary'
export const inject = ['storageDomain', 'tools', 'skills']

export interface Config {
  defaultTimeZone?: string
  timePlanPath?: string
}

export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-secretary',
    validate(raw: unknown) {
      const value = raw === undefined ? {} : raw
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return { issues: [{ message: 'secretary: config must be an object' }] }
      }
      const config = value as Record<string, unknown>
      for (const key of Object.keys(config)) {
        if (!['defaultTimeZone', 'timePlanPath'].includes(key)) {
          return { issues: [{ message: `secretary: unknown config field ${key}` }] }
        }
      }
      const defaultTimeZone = config.defaultTimeZone ?? 'Asia/Shanghai'
      if (typeof defaultTimeZone !== 'string') {
        return { issues: [{ message: 'secretary: defaultTimeZone must be a string' }] }
      }
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: defaultTimeZone }).format()
      } catch {
        return { issues: [{ message: `secretary: invalid defaultTimeZone "${defaultTimeZone}"` }] }
      }
      if (config.timePlanPath !== undefined
        && (typeof config.timePlanPath !== 'string' || !isAbsolute(config.timePlanPath))) {
        return { issues: [{ message: 'secretary: timePlanPath must be an absolute path' }] }
      }
      return {
        value: config.timePlanPath === undefined
          ? { defaultTimeZone }
          : { defaultTimeZone, timePlanPath: config.timePlanPath as string },
      }
    },
  },
}

export async function apply(ctx: Context, config: Config = {}): Promise<void> {
  const store = await openSecretaryStore(ctx as any)
  ctx.effect(() => () => store.close(), 'secretary: store')
  registerAgentTools(ctx as any, store)
  await registerSecretarySkill(ctx as any, config)
}
