/** Builds the Host product service; sibling workspace packages stay external. */
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
  external: ['@deepseek-ai/*', 'dsh-secretary-*'],
}

if (process.argv.includes('--watch')) {
  const builder = await context(options)
  await builder.watch()
} else {
  await build(options)
}
