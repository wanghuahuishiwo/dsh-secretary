import { readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'

interface SkillHost {
  skills: { register(skill: unknown): unknown }
  effect(register: () => unknown, label: string): void
}

export interface SkillRegistration {
  name: string
  path: string
  modelInvocable: boolean
  userInvocable: boolean
  suffix?: string
}

export async function registerSkill(ctx: Context, registration: SkillRegistration): Promise<void> {
  const source = await readFile(registration.path, 'utf8')
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n*/.exec(source)
  if (match === null) throw new Error(`secretary: ${registration.name} needs YAML frontmatter`)
  const description = /^description:\s*(.+?)\s*$/m.exec(match[1])?.[1]
  if (description === undefined) throw new Error(`secretary: ${registration.name} needs a description`)
  const body = source.slice(match[0].length).trimStart()
  const host = ctx as Context & SkillHost
  host.effect(() => host.skills.register({
    name: registration.name,
    description,
    content: `${body}${registration.suffix ?? ''}`,
    path: registration.path,
    resourceBase: { kind: 'directory', path: dirname(registration.path) },
    source: 'runtime',
    invocation: {
      modelInvocable: registration.modelInvocable,
      userInvocable: registration.userInvocable,
    },
  }), `secretary: skill ${registration.name}`)
}
