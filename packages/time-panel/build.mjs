import { build, context } from 'esbuild'
import { mkdir } from 'node:fs/promises'

const ID = 'dsh-secretary-time-panel'
await mkdir('lib', { recursive: true })

const host = {
  entryPoints: { index: 'src/index.ts', types: 'src/types.ts' },
  outdir: 'lib',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: ['@deepseek-ai/*', 'dsh-secretary-*'],
}

const client = {
  entryPoints: ['src/client/index.tsx'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  sourcemap: true,
  external: [
    'react', 'react-dom', 'react/jsx-runtime', 'react-dom/client',
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-api-gateway/client',
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-client-ui-renderer/client',
    '@deepseek-ai/dsh-client-ui-sidebar-right/client',
  ],
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;`,
  },
  footer: { js: 'return module.exports; } });' },
}

if (process.argv.includes('--watch')) {
  const builders = await Promise.all([context(host), context(client)])
  await Promise.all(builders.map(builder => builder.watch()))
} else {
  await Promise.all([build(host), build(client)])
}
