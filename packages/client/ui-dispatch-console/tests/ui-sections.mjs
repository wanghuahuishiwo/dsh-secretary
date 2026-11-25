/** The 节点 and 事件 sections render what they are given, field by field: no filter, no label, no count of their own. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { EventDetail, EventList, NodesSection, eventColumns } from '../lib/ui.js'

const render = (component, props) => renderToStaticMarkup(createElement(component, props))
const rows = html => html.split('<tr').slice(1)

const service = {
  type: 'io.nats.micro.v1.info_response', name: 'worker', id: 'AbC_-12', version: '1.2.3', description: '测试 worker',
  metadata: { nodeId: 'n-1', region: 'sh' },
  endpoints: [{ name: 'run', subject: 'tasks.run', queue_group: 'q' }],
}

test('节点: one row per online instance with name, id, version, metadata and endpoints as returned; no row is filtered or sorted', () => {
  const other = { ...service, id: 'zz', name: 'alpha', metadata: undefined, endpoints: [] }
  const html = render(NodesSection, { services: [service, other], error: undefined })
  assert.equal((html.match(/data-dc-node=/g) ?? []).length, 2)
  const [first, second] = rows(html).slice(1)
  for (const text of ['worker', 'AbC_-12', '1.2.3', '{\n  &quot;nodeId&quot;: &quot;n-1&quot;,\n  &quot;region&quot;: &quot;sh&quot;\n}', '[\n  {\n    &quot;name&quot;: &quot;run&quot;,\n    &quot;subject&quot;: &quot;tasks.run&quot;,\n    &quot;queue_group&quot;: &quot;q&quot;\n  }\n]']) assert.ok(first.includes(text), text)
  assert.ok(second.includes('alpha') && second.includes('zz'), 'the discovery order is kept')
  assert.equal(render(NodesSection, { services: [], error: undefined }).includes('<table'), false, 'no instance, no table')
  assert.match(render(NodesSection, { services: [], error: 'x' }), /role="alert"/)
})

const events = [
  {
    seq: 7, subject: 'dsh.events.task.result',
    event: { specversion: '1.0', id: 'e-7', source: 'urn:dsh:center', type: 'task.result', time: '2026-11-26T01:00:02Z', datacontenttype: 'application/json', data: { big: 'x'.repeat(5000) } },
    history: [{ seq: 1, at: '2026-11-26T01:00:03Z', kind: 'instance.opened', instanceId: 'i-1', graphId: 'g', nodeId: null, eventId: 'e-7', payload: { a: 1 } }],
  },
  { seq: 6, subject: 'dsh.events.aone.bug.created', event: { specversion: '1.0', id: 'e-6', source: 'urn:dsh:node:n', type: 'aone.bug.created', time: '2026-11-26T01:00:01Z', datacontenttype: 'application/json', dataschema: 'https://x', data: 1 }, history: [] },
]

test('事件: one column per envelope attribute the events carry, plus data and the engine records as complete JSON', () => {
  assert.deepEqual(eventColumns(events), ['seq', 'specversion', 'id', 'source', 'type', 'time', 'datacontenttype', 'dataschema', 'data', 'history'])
  const html = render(EventList, { events, onOpen: () => {} })
  const [newest, older] = rows(html).slice(1)
  assert.ok(newest.includes('<td class="dc-mono dc-cell-json">7</td>'), 'newest first')
  assert.ok(newest.includes('x'.repeat(5000)), 'data is not truncated')
  assert.ok(newest.includes('&quot;instanceId&quot;: &quot;i-1&quot;'), 'the record is shown as it is')
  assert.match(older, /<pre class="dc-json"><\/pre><\/td><\/tr>/, 'no record is an empty cell, not a label')
  for (const absent of ['未消费', 'unmatched', '筛选', '<input', '<select']) assert.equal(html.includes(absent), false, `${absent} must not appear`)
  assert.equal(html.includes('dataschema'), true)
})

test('事件详情: the full page is the complete envelope JSON and the complete records JSON', () => {
  const html = render(EventDetail, { event: events[0], onBack: () => {} })
  const envelope = /data-dc-envelope="true">([\s\S]*?)<\/pre>/.exec(html)[1].replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
  assert.deepEqual(JSON.parse(envelope), events[0].event)
  const history = /data-dc-history="true">([\s\S]*?)<\/pre>/.exec(html)[1].replaceAll('&quot;', '"')
  assert.deepEqual(JSON.parse(history), events[0].history)
  assert.match(html, /返回事件列表/)
  assert.equal((html.match(/<a /g) ?? []).length, 0, 'no navigation out of the page')
})
