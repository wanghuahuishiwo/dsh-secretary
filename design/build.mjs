import { build, context } from 'esbuild'
import { access, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'

async function hasModuleEntry(module) {
  try {
    await access(join(module, 'src', 'index.tsx'))
    return true
  } catch {
    return false
  }
}

const modules = (await readdir('.', { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
  .map((entry) => entry.name)

const entries = []
for (const module of modules) {
  if (await hasModuleEntry(module)) entries.push(module)
}

if (entries.length === 0) {
  throw new Error('No design modules found. Expected <module>/src/index.tsx.')
}

function optionsFor(module) {
  return {
    entryPoints: [`${module}/src/index.tsx`],
    outdir: `${module}/assets`,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    sourcemap: true,
    minify: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    // OpenDesign 静态预览没有宿主：React 与 ReactDOM 必须进入 bundle。
    external: [],
  }
}

for (const module of entries) {
  await mkdir(`${module}/assets`, { recursive: true })
}

if (process.argv.includes('--watch')) {
  const contexts = await Promise.all(entries.map((module) => context(optionsFor(module))))
  await Promise.all(contexts.map((builder) => builder.watch()))
  console.log(`Watching ${entries.map((module) => `${module}/src/index.tsx`).join(', ')}`)
} else {
  await Promise.all(entries.map((module) => build(optionsFor(module))))
  console.log(`Built ${entries.map((module) => `${module}/assets`).join(', ')}`)
}
