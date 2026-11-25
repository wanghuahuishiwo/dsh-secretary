import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createContext, runInContext } from 'node:vm'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const bundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
const hostRequire = createRequire(import.meta.url)
const settle = () => new Promise(resolve => setImmediate(resolve))

/** The host UI primitives cannot load outside the browser (CSS modules, clsx); a plain-element stand-in keeps rendering honest. */
const primitivesStub = {
  Button: ({ variant: _variant, size: _size, ...props }) => createElement('button', props),
  StateDot: ({ state }) => createElement('span', { 'data-state-dot': state }),
  IconDatabaseOutlineRegular: () => createElement('i', { 'data-icon': 'database' }),
}
const require_ = name => name === '@deepseek-ai/dsh-client-ui-primitives' ? primitivesStub : hostRequire(name)

/** Load the browser bundle the way the Host ModuleLoader does; react and host UI stay external. */
function load() {
  let registration
  const window = { __ModuleLoader__: { load: value => { registration = value } } }
  const module = { exports: {} }
  runInContext(bundle, createContext({ window, module, exports: module.exports, require: require_, console, setInterval, clearInterval, setTimeout, MutationObserver: class { observe() {} disconnect() {} }, document: { body: { hasAttribute: () => false } } }), { filename: 'client.js' })
  return { registration: registration.factory(require_), exports: module.exports }
}

/** A fake browser Context: records slot registrations and answers the Remote from a mutable status. */
function fakeContext(t) {
  const slots = new Map()
  const effects = []
  const disposers = []
  t.after(() => { for (const dispose of disposers.reverse()) dispose?.() })
  const state = { status: { state: 'running', label: '运行中', mode: 'local', clientUrl: 'nats://127.0.0.1:4222', binary: { configured: 'nats-server', found: true } } }
  const remote = Object.fromEntries(['readStatus', 'start', 'stop', 'restart', 'readSettings', 'updateSettings'].map(method => [method, async () => state.status]))
  const ctx = {
    state,
    remote: { secretaryDispatch: remote, async $mount(contribution) { ctx.mounted = contribution; return async () => { ctx.unmounted = true } } },
    effect: (fn, label) => { effects.push({ fn, label }); const dispose = fn(); disposers.push(dispose); return () => {} },
    slots: { inject: (name, register) => { const entry = register(); slots.set(name, entry); return () => {} }, register: (options, component) => ({ options, component }) },
    layout: { selectPanel: id => { ctx.selected = id } },
    inject(_deps, callback) { const promise = Promise.resolve(callback(ctx)); return Object.assign(promise, { dispose: async () => {} }) },
  }
  return { ctx, slots, effects, disposers, state }
}

const render = (component, props) => renderToStaticMarkup(createElement(component, props))

test('the plugin mounts the secretaryDispatch Remote and registers main, Sidebar entry and the overlay notice', async t => {
  const { registration } = load()
  assert.equal(registration.inject.join(','), 'remote')
  const { ctx, slots, effects } = fakeContext(t)
  const dispose = await registration.apply(ctx)
  assert.ok(ctx.mounted.descriptors.some(d => `${d.namespace}/${d.method}` === 'secretaryDispatch/readStatus'))
  assert.equal(slots.get('main').options.key, 'dsh-secretary-dispatch-console')
  assert.equal(slots.get('sidebar.panellist').options.label, '底座控制台')
  assert.equal(slots.get('shell.overlay').options.id, 'secretary-dispatch.gateway-notice')
  assert.ok(effects.some(effect => effect.label.includes('status polling')), 'status polling is owned by a plugin effect')
  await dispose()
  assert.equal(ctx.unmounted, true)
})

/** The plugin's polling effect is already running from `apply`; swap it for one the test drives and stops. */
function polling(effects, disposers) {
  disposers[0]()
  const start = effects.find(effect => effect.label.includes('status polling')).fn
  // One probe per call, then the timer is stopped again: no interval outlives the assertion.
  return async () => { const stop = start(); await settle(); stop() }
}

test('the shell shows the Gateway state in the header with four page-local sections; three stay reserved', async t => {
  const { registration } = load()
  const { ctx, slots, effects, disposers } = fakeContext(t)
  await registration.apply(ctx)
  await polling(effects, disposers)()
  const html = render(slots.get('main').component, {})
  assert.match(html, /<strong>Gateway<\/strong>/)
  assert.match(html, /运行中/)
  assert.match(html, /节点在线/)
  for (const label of ['Gateway', '节点', '事件', 'Graph']) assert.ok(html.includes(`>${label}</button>`), label)
  assert.match(html, /aria-label="Gateway"/)
  assert.match(html, /<button>停止<\/button><button>重启<\/button>/, 'a running Gateway offers stop and restart')
  assert.match(html, /nats:\/\/127\.0\.0\.1:4222/)
})

test('the overlay notice is empty while the Gateway runs and becomes a clickable notice when it is not', async t => {
  const { registration } = load()
  const { ctx, slots, effects, disposers, state } = fakeContext(t)
  await registration.apply(ctx)
  const tick = polling(effects, disposers)
  await tick()
  const Notice = slots.get('shell.overlay').component
  assert.equal(render(Notice, {}), '')
  state.status = { ...state.status, state: 'start-failed', label: '启动失败', detail: '进程已退出' }
  await tick()
  const html = render(Notice, {})
  assert.match(html, /Gateway 启动失败/)
  assert.match(html, /进程已退出/)
  assert.match(html, /查看底座控制台/)
  state.status = { ...state.status, state: 'stopped', label: '已停止', detail: undefined }
  await tick()
  assert.equal(render(Notice, {}), '', 'a calm stopped Gateway raises no notice')
})

test('the bundled client inlines the generated Remote and keeps react and host UI external', () => {
  assert.ok(bundle.includes('secretaryDispatch'))
  assert.ok(!/require\("dsh-secretary-dispatch-controller\/remote"\)/.test(bundle))
  assert.ok(/require\("react"\)/.test(bundle))
})
