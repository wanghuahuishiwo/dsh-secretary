import { isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { registerSkill } from 'dsh-secretary-core/skill-resources'

export interface Config {
  defaultTimeZone?: string
  timePlanPath?: string
}

export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-secretary-agent',
    validate(raw: unknown) {
      const value = raw === undefined ? {} : raw
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return { issues: [{ message: 'secretary: agent config must be an object' }] }
      }
      const config = value as Record<string, unknown>
      for (const key of Object.keys(config)) {
        if (!['defaultTimeZone', 'timePlanPath'].includes(key)) {
          return { issues: [{ message: `secretary: unknown agent config field ${key}` }] }
        }
      }
      const defaultTimeZone = config.defaultTimeZone ?? 'Asia/Shanghai'
      if (typeof defaultTimeZone !== 'string') return { issues: [{ message: 'secretary: defaultTimeZone must be a string' }] }
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

export const name = 'dsh-secretary-agent'
export const inject = ['skills']

export async function apply(ctx: Context, config: Config = {}): Promise<void> {
  const configuration = [
    '',
    '## Current configuration',
    `- Default time zone: ${config.defaultTimeZone ?? 'Asia/Shanghai'}`,
    config.timePlanPath === undefined
      ? '- Existing time plan: not configured; use known GTD and TimeBlock context, and ask only for missing decisions.'
      : `- Existing time plan (read-only): ${config.timePlanPath}`,
    '',
  ].join('\n')
  await registerSkill(ctx, {
    name: 'secretary',
    path: fileURLToPath(new URL('../assets/secretary/SKILL.md', import.meta.url)),
    modelInvocable: true,
    userInvocable: true,
    suffix: configuration,
  })
}
