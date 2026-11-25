import { createHash, randomUUID } from 'node:crypto'
import { Service, type Context } from '@deepseek-ai/cordis'
import { openEventHistory, type EventHistory } from './history.ts'
import type { ActivityHandler, ActivityRegistry, DispatchEvent, EmitSink, EmitInput, EntryDeclaration, FeedOutcome, GraphNodeRegistry, NodeDefinition, Port, ResumeOutcome, RunContext } from './contract.ts'

export type { EventHistory, HistoryKind, HistoryRecord } from './history.ts'
export { defineNode } from './contract.ts'
export type { ActivityHandler, Activities, AgentResult, DispatchEvent, EmitSink, EmitInput, EntryDeclaration, FeedOutcome, GraphNodeRegistry, NodeDefinition, Port, ResumeOutcome, RunContext } from './contract.ts'

export interface Config {
  /** Which role this engine serves; center and node each load their own engine with its own history. */
  readonly role: 'center' | 'node'
  /** SQLite file for the event history; each engine must own its own. */
  readonly historyPath: string
}

export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-secretary-dispatch-engine',
    validate(raw: unknown): { value: Config } | { issues: [{ message: string }] } {
      const value = raw === undefined ? {} : raw as Record<string, unknown>
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return { issues: [{ message: 'dispatch: engine config must be an object' }] }
      }
      for (const key of Object.keys(value)) {
        if (key !== 'role' && key !== 'historyPath') return { issues: [{ message: `dispatch: unknown engine config field ${key}` }] }
      }
      if (value.role !== 'center' && value.role !== 'node') {
        return { issues: [{ message: 'dispatch: engine config field "role" must be "center" or "node"' }] }
      }
      if (typeof value.historyPath !== 'string' || value.historyPath === '') {
        return { issues: [{ message: 'dispatch: engine config field "historyPath" must be a file path' }] }
      }
      return { value: { role: value.role, historyPath: value.historyPath } }
    },
  },
}

/** Raised when a replayed node asks for a different activity call than the history recorded. */
export class NonDeterminismError extends Error {
  readonly nodeId: string
  constructor(nodeId: string, detail: string) {
    super(`dispatch: non-deterministic node "${nodeId}": ${detail}`)
    this.nodeId = nodeId
  }
}

interface RecordedCall { readonly name: string; readonly fingerprint: string; readonly result: unknown }

/** Canonical JSON (keys sorted) so equal arguments always hash the same. */
export function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, sortKeys(v)]))
}

/** `sha256(canonical([type, name, args]))` — type is always `activity` in phase 1. */
export function fingerprint(name: string, args: unknown): string {
  return createHash('sha256').update(canonical(['activity', name, args])).digest('hex')
}

function samePorts(a: Record<string, Port>, b: Record<string, Port>): boolean {
  const keys = Object.keys(a).sort()
  if (keys.join() !== Object.keys(b).sort().join()) return false
  return keys.every(key => a[key]!.type === b[key]!.type)
}

function checkPorts(ports: Record<string, Port>, values: Record<string, unknown>): void {
  for (const [name, port] of Object.entries(ports)) {
    if (!(name in values)) throw new Error(`dispatch: missing input port "${name}"`)
    if (!port.check(values[name])) throw new Error(`dispatch: input port "${name}" does not satisfy type "${port.type}"`)
  }
  for (const name of Object.keys(values)) {
    if (!(name in ports)) throw new Error(`dispatch: unexpected input port "${name}"`)
  }
}

/**
 * Graph execution engine kernel. Nodes and entries are declared in code; every step is
 * appended to the event history so an instance can be resumed by replaying that history.
 */
export class DispatchEngine extends Service {
  readonly history: EventHistory
  readonly nodes: GraphNodeRegistry
  private readonly entries = new Map<string, EntryDeclaration[]>()
  private readonly handlers = new Map<string, ActivityHandler>()
  private emitSink: EmitSink | undefined

  constructor(ctx: Context, config: Config) {
    super(ctx, 'dispatchEngine')
    this.history = openEventHistory(config.historyPath)
    const definitions = new Map<string, NodeDefinition>()
    this.nodes = {
      register: definition => {
        if (definitions.has(definition.name)) throw new Error(`dispatch: node "${definition.name}" is already registered`)
        definitions.set(definition.name, definition)
        return () => { definitions.delete(definition.name) }
      },
      get: name => definitions.get(name),
      list: () => [...definitions.values()],
    }
    this.handlers.set('emit', args => this.emit(args as EmitInput))
    ctx.provide('graphNodes', this.nodes)
    ctx.effect(() => () => this.close())
  }

  private emit(input: EmitInput): null {
    if (this.emitSink === undefined) throw new Error('dispatch: emit activity has no sink')
    this.emitSink({ id: randomUUID(), type: input.type, data: input.data })
    return null
  }

  /** Registers the activity handler the engine calls outside the isolated `run`; `emit` is built in. */
  readonly activities: ActivityRegistry = {
    register: (name, handler) => {
      if (name === 'emit') throw new Error('dispatch: activity "emit" is provided by the engine')
      this.handlers.set(name, handler)
      return () => { this.handlers.delete(name) }
    },
  }

  /** Where `ctx.activities.emit` hands events to; the Gateway plug-in (#102) installs this. */
  setEmitSink(sink: EmitSink | undefined): void {
    this.emitSink = sink
  }

  declareEntry(entry: EntryDeclaration): () => void {
    const node = this.nodes.get(entry.node)
    if (node === undefined) throw new Error(`dispatch: entry for "${entry.on}" names unregistered node "${entry.node}"`)
    if (!samePorts(entry.output, node.inputs)) {
      throw new Error(`dispatch: entry for "${entry.on}" output ports do not match the inputs of node "${entry.node}"`)
    }
    const list = this.entries.get(entry.on) ?? []
    list.push(entry)
    this.entries.set(entry.on, list)
    return () => {
      const remaining = (this.entries.get(entry.on) ?? []).filter(candidate => candidate !== entry)
      if (remaining.length === 0) this.entries.delete(entry.on)
      else this.entries.set(entry.on, remaining)
    }
  }

  /** Routes one event: an entry opens a new instance, otherwise the event is recorded as unmatched. */
  async feed(event: DispatchEvent): Promise<FeedOutcome> {
    parseEvent(event)
    const entries = this.entries.get(event.type)
    if (entries === undefined || entries.length === 0) {
      this.history.append({ kind: 'unmatched', instanceId: null, graphId: null, eventId: event.id, payload: { type: event.type } })
      return { matched: false, instanceIds: [] }
    }
    const instanceIds: string[] = []
    for (const entry of entries) {
      const instanceId = randomUUID()
      const inputs = await entry.adapt(event)
      this.history.append({ kind: 'instance.opened', instanceId, graphId: entry.graph, eventId: event.id, payload: { node: entry.node, event, inputs } })
      await this.runNode(instanceId, entry.graph, entry.node)
      instanceIds.push(instanceId)
    }
    return { matched: true, instanceIds }
  }

  /** Re-runs an instance from the top, injecting recorded activity results instead of executing them again. */
  async resume(instanceId: string): Promise<ResumeOutcome> {
    const records = this.history.listByInstance(instanceId)
    const opened = records[0]
    if (opened === undefined || opened.kind !== 'instance.opened') throw new Error(`dispatch: no opened instance "${instanceId}"`)
    const { node } = opened.payload as { node: string }
    return { instanceId, ...await this.runNode(instanceId, opened.graphId!, node, records) }
  }

  private async runNode(instanceId: string, graphId: string, nodeId: string, records = this.history.listByInstance(instanceId)): Promise<Omit<ResumeOutcome, 'instanceId'>> {
    const definition = this.nodes.get(nodeId)
    const completed = records.find(record => record.kind === 'node.completed')
    if (completed !== undefined) return outcomeOf(completed.payload as NodeCompleted)
    const opened = records[0].payload as { inputs: Record<string, unknown> }
    this.history.append({ kind: 'node.started', instanceId, graphId, nodeId, payload: { inputs: opened.inputs } })
    if (definition === undefined) throw new Error(`dispatch: no node "${nodeId}" registered`)
    let payload: NodeCompleted
    try {
      checkPorts(definition.inputs, opened.inputs)
      const recorded = records.filter(record => record.kind === 'activity.completed').map(record => record.payload as RecordedCall)
      const cursor = { index: 0 }
      const run = (name: string, args: unknown) => this.callActivity(instanceId, graphId, nodeId, recorded, cursor, name, args)
      payload = { outputs: await definition.run({ activities: runProxy(run) }, opened.inputs) }
    } catch (error) {
      payload = { error: error instanceof Error ? error.message : String(error) }
    }
    this.history.append({ kind: 'node.completed', instanceId, graphId, nodeId, payload })
    return outcomeOf(payload)
  }

  private async callActivity(instanceId: string, graphId: string, nodeId: string, recorded: RecordedCall[], cursor: { index: number }, name: string, args: unknown): Promise<unknown> {
    const expected = recorded[cursor.index]
    const actual = fingerprint(name, args)
    if (expected !== undefined) {
      cursor.index += 1
      if (expected.name !== name || expected.fingerprint !== actual) {
        throw new NonDeterminismError(nodeId, `activity call #${cursor.index} is ${name}(${actual}) but history recorded ${expected.name}(${expected.fingerprint})`)
      }
      return expected.result
    }
    const handler = this.handlers.get(name)
    if (handler === undefined) throw new Error(`dispatch: activity "${name}" is not registered`)
    const result = await handler(args)
    const stored: unknown = JSON.parse(canonical(result) ?? 'null')
    this.history.append({ kind: 'activity.completed', instanceId, graphId, nodeId, payload: { name, fingerprint: actual, result: stored } })
    return result
  }

  close(): void {
    this.history.close()
  }
}

/** `node.completed` payload: the node's outputs, or the error that failed it. */
type NodeCompleted = { outputs?: unknown; error?: string }

function outcomeOf(payload: NodeCompleted): Omit<ResumeOutcome, 'instanceId'> {
  return payload.error === undefined ? { status: 'completed', outputs: payload.outputs } : { status: 'failed', error: payload.error }
}

/** `ctx.activities` — every property access yields `(args) => engine.call(name, args)`. */
function runProxy(call: (name: string, args: unknown) => Promise<unknown>): RunContext['activities'] {
  return new Proxy({} as RunContext['activities'], { get: (_target, name) => (args: unknown) => call(String(name), args) })
}

function parseEvent(event: DispatchEvent): void {
  if (typeof event?.id !== 'string' || typeof event?.type !== 'string' || event.type === '') {
    throw new Error('dispatch: event needs a string "id" and a non-empty string "type"')
  }
}

export const name = 'dsh-secretary-dispatch-engine'
export function apply(ctx: Context, config: Config): void {
  ctx.plugin(DispatchEngine, config)
}
