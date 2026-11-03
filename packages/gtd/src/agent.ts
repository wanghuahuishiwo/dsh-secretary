import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { registerSkill } from 'dsh-secretary-core/skill-resources'
import { noConfig } from 'dsh-secretary-core/tooling'

export interface Config {}
export const Config = noConfig('dsh-secretary-gtd-agent')
export const name = 'dsh-secretary-gtd-agent'
export const inject = ['skills']

export async function apply(ctx: Context): Promise<void> {
  for (const skill of ['gtd-inbox-capture', 'gtd-clarify'] as const) {
    await registerSkill(ctx, {
      name: skill,
      path: fileURLToPath(new URL(`../assets/${skill}/SKILL.md`, import.meta.url)),
      modelInvocable: false,
      userInvocable: true,
    })
  }
}
