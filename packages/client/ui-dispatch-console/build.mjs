/** Builds the addressable Host entry and the browser-only dispatch console entry. */
import { build, context } from 'esbuild'
import { mkdir } from 'node:fs/promises'

const ID = 'dsh-secretary-ui-dispatch-console'

await mkdir('lib', { recursive: true })

const host = {
  entryPoints: ['src/index.ts'],
  outdir: 'lib',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: ['@deepseek-ai/*', 'cordis', 'dsh-secretary-*'],
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
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client', '@deepseek-ai/*'],
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;`,
  },
  footer: { js: 'return module.exports; } });' },
}

const ui = { entryPoints: ['src/ui/index.ts'], outfile: 'lib/ui.js', bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', jsx: 'automatic', external: ['react', 'react/jsx-runtime'] }

if (process.argv.includes('--watch')) {
  const [hostBuilder, clientBuilder, uiBuilder] = await Promise.all([context(host), context(client), context(ui)])
  await Promise.all([hostBuilder.watch(), clientBuilder.watch(), uiBuilder.watch()])
} else {
  await Promise.all([build(host), build(client), build(ui)])
}
