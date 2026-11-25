/** Builds the engine's Node face; workspace siblings and the host stay external. */
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'

await mkdir('lib', { recursive: true })
await build({
  entryPoints: ['src/index.ts', 'src/contract.ts', 'src/history.ts'],
  outdir: 'lib',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: ['@deepseek-ai/*', 'cordis', 'dsh-secretary*'],
})
