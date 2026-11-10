import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { registerSkill } from 'dsh-secretary-skill-resources'

export interface Config {
  defaultTimeZone?: string
  timePlanPath?: string
  gtdPath?: string
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
        if (!['defaultTimeZone', 'timePlanPath', 'gtdPath'].includes(key)) {
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
      if (config.gtdPath !== undefined
        && (typeof config.gtdPath !== 'string' || !isAbsolute(config.gtdPath))) {
        return { issues: [{ message: 'secretary: gtdPath must be an absolute path' }] }
      }
      return {
        value: {
          defaultTimeZone,
          ...config.timePlanPath === undefined ? {} : { timePlanPath: config.timePlanPath as string },
          ...config.gtdPath === undefined ? {} : { gtdPath: config.gtdPath as string },
        },
      }
    },
  },
}

export const name = 'dsh-secretary-agent'
export const inject = ['skills']

const GTD_SEEDS = ['README.md', 'Inbox.md', 'GTD.md'] as const

/** Seed the self-describing Markdown data plane once; never touch existing files. */
async function ensureGtdFiles(gtdPath: string | undefined): Promise<void> {
  if (gtdPath === undefined) return
  await mkdir(gtdPath, { recursive: true })
  for (const file of GTD_SEEDS) {
    const source = await readFile(fileURLToPath(new URL(`../assets/gtd/${file}`, import.meta.url)), 'utf8')
    await writeFile(join(gtdPath, file), source, { flag: 'wx' }).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    })
  }
}

/** Origin the CLI should dial, advertised by the web runtime when present. */
function hostOrigin(ctx: Context): string | undefined {
  const webApp = ctx.get('webApp') as { getAdvertisedUrl(): string } | undefined
  if (webApp !== undefined) return webApp.getAdvertisedUrl()
  const webServer = ctx.get('webServer') as { getOrigin(): string } | undefined
  return webServer?.getOrigin()
}

interface ShellEnvHost {
  shellEnv: {
    register(contributor: {
      name: string
      variables: Record<string, { description: string }>
      resolve(execution: unknown): Record<string, string>
    }): () => void
  }
  connection: { authenticatedUrl(baseUrl: string): string }
}

export async function apply(ctx: Context, config: Config = {}): Promise<void> {
  await ensureGtdFiles(config.gtdPath)
  const configuration = [
    '',
    '## Current configuration',
    `- Default time zone: ${config.defaultTimeZone ?? 'Asia/Shanghai'}`,
    config.timePlanPath === undefined
      ? '- Existing time plan: not configured; use known GTD and TimeBlock context, and ask only for missing decisions.'
      : `- Existing time plan (read-only): ${config.timePlanPath}`,
    config.gtdPath === undefined
      ? '- GTD data directory: not configured; GTD Markdown features are unavailable.'
      : `- GTD data directory: ${config.gtdPath}`,
    '',
  ].join('\n')
  await registerSkill(ctx, {
    name: 'secretary',
    path: fileURLToPath(new URL('../assets/secretary/SKILL.md', import.meta.url)),
    modelInvocable: true,
    userInvocable: true,
    suffix: configuration,
  })
  // CLI channel: hand every agent shell this host's endpoint, launch token, and
  // CLI path via the official shell-env registry; the CLI exchanges the token
  // on /connect and never writes storage on its own.
  ctx.inject(['shellEnv', 'connection'], scoped => {
    const host = scoped as Context & ShellEnvHost
    const cliBin = createRequire(import.meta.url).resolve('dsh-secretary-cli/bin')
    host.shellEnv.register({
      name: 'secretary-cli',
      variables: {
        DSH_SECRETARY_URL: { description: 'Origin of the DSH host serving this session; target of the secretary CLI.' },
        DSH_SECRETARY_TOKEN: { description: 'Launch token the secretary CLI exchanges on /connect for an API cookie.' },
        DSH_SECRETARY_CLI: { description: 'Absolute path of the dsh-secretary CLI for agent shells.' },
      },
      resolve: () => {
        const origin = hostOrigin(ctx)
        const token = origin === undefined ? undefined
          : new URL(host.connection.authenticatedUrl(origin)).searchParams.get('token') ?? ''
        return {
          DSH_SECRETARY_URL: origin ?? '',
          DSH_SECRETARY_TOKEN: token ?? '',
          DSH_SECRETARY_CLI: cliBin,
        }
      },
    })
  })
}
