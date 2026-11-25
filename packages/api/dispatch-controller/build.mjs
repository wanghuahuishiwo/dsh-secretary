/** Builds the Host dispatch service; sibling workspace packages and the official NATS clients stay external. */
import { build, context } from 'esbuild'
import { mkdir } from 'node:fs/promises'

await mkdir('lib', { recursive: true })

const options = {
  entryPoints: { index: 'src/index.ts', types: 'src/types.ts' },
  outdir: 'lib',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: ['@deepseek-ai/*', 'dsh-secretary-*', '@nats-io/*'],
}

if (process.argv.includes('--watch')) {
  const builder = await context(options)
  await builder.watch()
} else {
  await build(options)
}
