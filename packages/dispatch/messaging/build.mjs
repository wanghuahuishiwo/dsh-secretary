/** Builds the messaging plugin; host and workspace packages stay external, the official NATS clients are regular dependencies. */
import { build } from 'esbuild'
await build({
  entryPoints: { index: 'src/index.ts', contract: 'src/contract.ts' },
  outdir: 'lib',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: ['@deepseek-ai/*', 'dsh-secretary-*', '@nats-io/*'],
})
