/**
 * Builds the published Node face of this plugin: ordinary ESM with a
 * bare-specifier externals list, because the running dsh process resolves
 * `@deepseek-ai/*` to its own bundled copies.
 */
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'

await mkdir('lib', { recursive: true })

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: ['@deepseek-ai/*', 'cordis', 'zod'],
})
