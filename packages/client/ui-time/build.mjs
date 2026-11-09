/** Builds the addressable Host entry, the browser plugin and the host-free UI entry. */
import { build, context } from 'esbuild'
import { mkdir } from 'node:fs/promises'

const ID = 'dsh-secretary-ui-time'
await mkdir('lib', { recursive: true })

const host = {
  entryPoints: ['src/index.ts'],
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

/**
 * The host-free UI entry, consumed by OpenDesign and other external surfaces.
 * It carries no DSH banner/footer; production still bundles `src/ui` directly.
 */
const ui = {
  entryPoints: { ui: 'src/ui/index.ts', 'ui-model': 'src/ui/model.ts', 'ui-change-reload': 'src/ui/changeReload.ts' },
  outdir: 'lib',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  sourcemap: true,
  external: ['react', 'react/jsx-runtime'],
}

if (process.argv.includes('--watch')) {
  const builders = await Promise.all([context(host), context(client), context(ui)])
  await Promise.all(builders.map(builder => builder.watch()))
} else {
  await Promise.all([build(host), build(client), build(ui)])
}
