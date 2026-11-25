/** Builds the shared Gateway logic; it has no runtime dependencies, so nothing is external. */
import { build, context } from 'esbuild'
import { mkdir } from 'node:fs/promises'

await mkdir('lib', { recursive: true })
const options = {
  entryPoints: { index: 'src/index.ts' },
  outdir: 'lib',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
}
if (process.argv.includes('--watch')) {
  const builder = await context(options)
  await builder.watch()
} else {
  await build(options)
}
