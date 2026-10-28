import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL_PATH = fileURLToPath(new URL('../skills/secretary/SKILL.md', import.meta.url))

interface SkillHost {
  skills: { register(skill: unknown): unknown }
  effect(register: () => unknown, label: string): void
}

export interface SecretarySkillConfig {
  defaultTimeZone?: string
  timePlanPath?: string
}

export async function registerSecretarySkill(ctx: SkillHost, config: SecretarySkillConfig): Promise<void> {
  const source = await readFile(SKILL_PATH, 'utf8')
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n*/.exec(source)
  if (match === null) throw new Error('secretary: SKILL.md needs YAML frontmatter')
  const description = /^description:\s*(.+?)\s*$/m.exec(match[1])?.[1]
  if (description === undefined) throw new Error('secretary: skill needs a description')
  const body = source.slice(match[0].length).trimStart()
  const timeZone = config.defaultTimeZone ?? 'Asia/Shanghai'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format()
  } catch {
    throw new Error(`secretary: invalid defaultTimeZone "${timeZone}"`)
  }
  if (config.timePlanPath !== undefined && !isAbsolute(config.timePlanPath)) {
    throw new Error('secretary: timePlanPath must be absolute')
  }
  const configuration = [
    '## Current configuration',
    `- Default time zone: ${timeZone}`,
    config.timePlanPath === undefined
      ? '- Existing time plan: not configured; ask the user for its path when the task needs it.'
      : `- Existing time plan (read-only): ${config.timePlanPath}`,
  ].join('\n')
  ctx.effect(() => ctx.skills.register({
    name: 'secretary',
    description,
    content: `${body}\n\n${configuration}\n`,
    path: SKILL_PATH,
    resourceBase: { kind: 'directory', path: dirname(SKILL_PATH) },
    source: 'runtime',
    invocation: { modelInvocable: true, userInvocable: true },
  }), 'secretary: skill')
}
