/** Builds the GTD service and its contract; workspace siblings stay external. */
import { build, context } from 'esbuild'
import { mkdir } from 'node:fs/promises'

await mkdir('lib', { recursive: true })

const options = {
  entryPoints: ['src/index.ts', 'src/contract.ts'],
  outdir: 'lib',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: ['@deepseek-ai/*', 'cordis', 'zod', 'dsh-secretary*'],
}

if (process.argv.includes('--watch')) {
  const builder = await context(options)
  await builder.watch()
} else {
  await build(options)
}
