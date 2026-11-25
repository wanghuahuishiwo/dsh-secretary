import { createHash, randomUUID } from 'node:crypto'
import { Service, type Context } from '@deepseek-ai/cordis'
import { assertDeclared, CENTER_SOURCE, nodeSource } from 'dsh-secretary-dispatch-messaging'
import type { DispatchMessaging, EventHandler, OutboxTransaction, SubscriptionHandle } from 'dsh-secretary-dispatch-messaging'
import { openEventHistory, type EventHistory, type HistoryRecord } from './history.ts'
import type { ActivityRegistry, DispatchEvent, Edge, EmitSink, EmitInput, EntryDeclaration, FeedOutcome, GraphNodeRegistry, NodeDefinition, Port, ResumeOutcome, RunContext } from './contract.ts'

export type { EventHistory, HistoryKind, HistoryRecord } from './history.ts'
export { defineNode } from './contract.ts'
export const STARTED = 'graph.instance.started'
export const FINISHED = 'graph.instance.finished'
export type { ActivityHandler, Activities, AgentResult, DispatchEvent, Edge, EmitSink, EmitInput, EntryDeclaration, FeedOutcome, GraphNodeRegistry, NodeDefinition, Port, ResumeOutcome, RunContext } from './contract.ts'

export interface Config {
  /** Which role this engine serves; center and node each load their own engine with its own history. */
  readonly role: 'center' | 'node'
  /**
   * SQLite file for the event history, for an engine constructed directly where no `dispatchMessaging` is provided;
   * each engine must then own its own. The plugin entry always has `dispatchMessaging` and keeps its history there.
   */
  readonly historyPath?: string
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
      if (value.historyPath !== undefined && (typeof value.historyPath !== 'string' || value.historyPath === '')) {
        return { issues: [{ message: 'dispatch: engine config field "historyPath" must be a file path' }] }
      }
      return { value: value.historyPath === undefined ? { role: value.role } : { role: value.role, historyPath: value.historyPath } }
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

/** What the engine needs from the messaging plugin of its role to put events on the stream. */
type Gateway = Pick<DispatchMessaging, 'role' | 'nodeId' | 'catalog' | 'outbox' | 'subscribe'>

/** Records a completed call and returns its result; inside a `write` it joins that transaction. */
type Save = (result: unknown, tx?: OutboxTransaction) => unknown
type Executor = (args: unknown, save: Save) => unknown

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

/** First port whose set or type label differs between `a` and `b`, with both sides named; `undefined` when compatible. */
function portMismatch(a: Record<string, Port>, b: Record<string, Port>, aSide: string, bSide: string): string | undefined {
  for (const [name, port] of Object.entries(a)) {
    if (!(name in b)) return `port "${name}" of ${aSide} (type "${port.type}") has no counterpart on ${bSide}`
  }
  for (const [name, port] of Object.entries(b)) {
    if (!(name in a)) return `port "${name}" of ${bSide} (type "${port.type}") has no counterpart on ${aSide}`
  }
  for (const [name, port] of Object.entries(a)) {
    if (port.type !== b[name]!.type) return `port "${name}" of ${aSide} (type "${port.type}") is incompatible with port "${name}" of ${bSide} (type "${b[name]!.type}")`
  }
  return undefined
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
  private readonly gateway: Gateway | undefined
  private readonly entries = new Map<string, EntryDeclaration[]>()
  private readonly handlers = new Map<string, Executor>()
  private readonly subscriptions = new Set<SubscriptionHandle>()
  private emitSink: EmitSink | undefined
  private recovery: Promise<void> | undefined
  private recoverAgain = false

  constructor(ctx: Context, config: Config) {
    super(ctx, 'dispatchEngine')
    this.gateway = ctx.get('dispatchMessaging') as Gateway | undefined
    if (this.gateway === undefined && config.historyPath === undefined) throw new Error('dispatch: engine without dispatchMessaging needs config "historyPath"')
    this.history = this.gateway === undefined ? openEventHistory(config.historyPath!) : openEventHistory(this.gateway.outbox.db)
    const definitions = new Map<string, NodeDefinition>()
    this.nodes = {
      register: definition => {
        if (definitions.has(definition.name)) throw new Error(`dispatch: node "${definition.name}" is already registered`)
        definitions.set(definition.name, definition)
        if (this.gateway !== undefined) this.recoverUnfinished()
        return () => { definitions.delete(definition.name) }
      },
      get: name => definitions.get(name),
      list: () => [...definitions.values()],
    }
    this.handlers.set('emit', (args, save) => this.emit(args as EmitInput, save))
    ctx.provide('graphNodes', this.nodes)
    ctx.effect(() => () => this.close())
    if (this.gateway !== undefined) {
      for (const type of LIFECYCLE) assertDeclared(this.gateway.catalog, 'publish', type)
      void this.subscribeAll()
    }
  }

  /**
   * Resumes every instance of this role that an earlier run left unfinished: each goes through `resume`, which returns
   * what the history already holds and runs only what it does not. Runs once the nodes it stops at are registered, so it
   * is kicked when the engine loads and again on every node registration; one instance is never resumed twice at a time.
   * The first run is awaited before the subscriptions go up, so nothing is delivered while it holds the Outbox.
   */
  private recoverUnfinished(): Promise<void> {
    if (this.recovery !== undefined) {
      this.recoverAgain = true
      return this.recovery
    }
    this.recovery = (async () => {
      for (;;) {
        this.recoverAgain = false
        for (const instanceId of this.history.instanceIds()) {
          const records = this.history.listByInstance(instanceId)
          const stoppedAt = unfinishedNode(records)
          if (stoppedAt === undefined) continue
          if (this.nodes.get(stoppedAt) === undefined) {
            this.ctx.logger.warn(`dispatchEngine: instance ${instanceId} is unfinished and waits for node "${stoppedAt}" to be registered`)
            continue
          }
          try {
            const outcome = await this.resume(instanceId)
            this.ctx.logger.info(`dispatchEngine: resumed instance ${instanceId} (${outcome.status})`)
          } catch (error) {
            this.ctx.logger.error(`dispatchEngine: instance ${instanceId} could not be resumed: ${error instanceof Error ? error.message : String(error)}`)
          }
        }
        if (!this.recoverAgain) return
      }
    })().finally(() => {
      this.recovery = undefined
      if (this.recoverAgain) void this.recoverUnfinished()
    })
    return this.recovery
  }

  /** One durable consumer per declared type; sequential, because adding stream subjects concurrently can collide. */
  private async subscribeAll(): Promise<void> {
    await this.recoverUnfinished()
    for (const type of this.gateway!.catalog.subscribe) {
      try {
        this.subscriptions.add(await this.gateway!.subscribe({ type }, this.receive))
      } catch (error) {
        this.ctx.logger.error(`dispatchEngine: subscription for ${type} failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  /** `source` of everything this engine puts on the stream: the identity of the role it serves. */
  private get source(): string {
    return this.gateway!.role === 'center' ? CENTER_SOURCE : nodeSource(this.gateway!.nodeId as string)
  }

  /** Runs one unit in a transaction: alone, or inside the transaction of the event being accepted. */
  private write<T>(tx: OutboxTransaction | undefined, fn: (tx: OutboxTransaction | undefined) => T): T {
    return tx === undefined && this.gateway !== undefined ? this.gateway.outbox.transaction(active => fn(active)) : fn(tx)
  }

  private emit(input: EmitInput, save: Save): null {
    const event = { id: randomUUID(), type: input.type, data: input.data }
    if (this.gateway === undefined) {
      if (this.emitSink === undefined) throw new Error('dispatch: emit activity has no sink')
      this.emitSink(event)
      save(null)
      return null
    }
    assertDeclared(this.gateway.catalog, 'publish', input.type)
    // The node event and the record of the call are one commit: a crash leaves both or neither.
    this.write(undefined, tx => { tx!.publish(event, this.source); save(null, tx) })
    return null
  }

  /**
   * The handler of every subscription of the role. `deliver` of the messaging plugin has already recorded the acceptance
   * in `tx` when this runs: the acceptance, the record the event leads to and the events it announces are one commit.
   */
  private readonly receive: EventHandler = (event, _meta, tx) => {
    return this.route(event, tx).then(() => undefined, (error: unknown) => {
      this.ctx.logger.error(`dispatchEngine: event ${event.id} was not routed: ${error instanceof Error ? error.message : String(error)}`)
    })
  }

  /** Registers the activity handler the engine calls outside the isolated `run`; `emit` is built in. */
  readonly activities: ActivityRegistry = {
    register: (name, handler) => {
      if (name === 'emit') throw new Error('dispatch: activity "emit" is provided by the engine')
      this.handlers.set(name, async (args, save) => save(await handler(args)))
      return () => { this.handlers.delete(name) }
    },
  }

  /** Where `ctx.activities.emit` hands events to when no `dispatchMessaging` is wired; unused otherwise. */
  setEmitSink(sink: EmitSink | undefined): void {
    this.emitSink = sink
  }

  declareEntry(entry: EntryDeclaration): () => void {
    const node = this.nodes.get(entry.node)
    if (node === undefined) throw new Error(`dispatch: entry for "${entry.on}" names unregistered node "${entry.node}"`)
    if (!samePorts(entry.output, node.inputs)) {
      throw new Error(`dispatch: entry for "${entry.on}" output ports do not match the inputs of node "${entry.node}"`)
    }
    this.checkEdges(entry)
    if (this.gateway !== undefined) assertDeclared(this.gateway.catalog, 'subscribe', entry.on)
    const list = this.entries.get(entry.on) ?? []
    list.push(entry)
    this.entries.set(entry.on, list)
    return () => {
      const remaining = (this.entries.get(entry.on) ?? []).filter(candidate => candidate !== entry)
      if (remaining.length === 0) this.entries.delete(entry.on)
      else this.entries.set(entry.on, remaining)
    }
  }

  /** Rejects anything but a straight chain behind the entry node, and any edge whose ports do not line up. */
  private checkEdges(entry: EntryDeclaration): void {
    const edges = entry.edges ?? []
    const fail = (detail: string): never => { throw new Error(`dispatch: entry for "${entry.on}" ${detail}`) }
    for (const { from, to } of edges) {
      if (this.nodes.get(from) === undefined) fail(`edge "${from}" -> "${to}" names unregistered node "${from}"`)
      if (this.nodes.get(to) === undefined) fail(`edge "${from}" -> "${to}" names unregistered node "${to}"`)
    }
    for (const { from, to } of edges) {
      if (edges.filter(edge => edge.from === from).length > 1) fail(`has more than one edge from node "${from}"`)
      if (edges.filter(edge => edge.to === to).length > 1) fail(`has more than one edge into node "${to}"`)
      if (to === entry.node) fail(`has an edge into entry node "${entry.node}"`)
    }
    const next = (nodeId: string): string | undefined => edges.find(edge => edge.from === nodeId)?.to
    for (const start of new Set(edges.flatMap(edge => [edge.from, edge.to]))) {
      const seen = new Set<string>()
      for (let cursor: string | undefined = start; cursor !== undefined; cursor = next(cursor)) {
        if (seen.has(cursor)) fail(`has an edge cycle at node "${cursor}"`)
        seen.add(cursor)
      }
    }
    for (const { from, to } of edges) {
      const mismatch = portMismatch(this.nodes.get(from)!.outputs, this.nodes.get(to)!.inputs, `output of node "${from}"`, `input of node "${to}"`)
      if (mismatch !== undefined) fail(`edge "${from}" -> "${to}" output ports do not match the inputs of node "${to}": ${mismatch}`)
    }
  }

  /** Routes one event: an entry opens a new instance, otherwise the event is recorded as unmatched. */
  async feed(event: DispatchEvent): Promise<FeedOutcome> {
    return this.route(event)
  }

  /** `tx` is the transaction accepting the event on the stream; the instances then start once it has committed. */
  private async route(event: DispatchEvent, tx?: OutboxTransaction): Promise<FeedOutcome> {
    parseEvent(event)
    const entries = this.entries.get(event.type)
    if (entries === undefined || entries.length === 0) {
      this.write(tx, () => this.history.append({ kind: 'unmatched', instanceId: null, graphId: null, eventId: event.id, payload: { type: event.type } }))
      return { matched: false, instanceIds: [] }
    }
    const instanceIds: string[] = []
    for (const entry of entries) {
      const instanceId = randomUUID()
      const inputs = await entry.adapt(event)
      const edges = entry.edges ?? []
      this.write(tx, (active) => {
        this.history.append({ kind: 'instance.opened', instanceId, graphId: entry.graph, eventId: event.id, payload: { node: entry.node, edges, event, inputs } })
        active?.publish({ type: STARTED, data: { instanceId, graphId: entry.graph, entryEventId: event.id } }, this.source)
      })
      instanceIds.push(instanceId)
      const run = () => this.runChain(instanceId, entry.graph, entry.node, edges, this.history.listByInstance(instanceId))
      if (tx === undefined) await run()
      else tx.afterCommit(() => { void run().catch((error: unknown) => { this.ctx.logger.error(`dispatchEngine: instance ${instanceId} failed to run: ${error instanceof Error ? error.message : String(error)}`) }) })
    }
    return { matched: true, instanceIds }
  }

  /** Re-runs an instance from the top, injecting recorded activity results instead of executing them again. */
  async resume(instanceId: string): Promise<ResumeOutcome> {
    const records = this.history.listByInstance(instanceId)
    const opened = records[0]
    if (opened === undefined || opened.kind !== 'instance.opened') throw new Error(`dispatch: no opened instance "${instanceId}"`)
    const { node, edges } = opened.payload as { node: string; edges: Edge[] }
    return { instanceId, ...await this.runChain(instanceId, opened.graphId!, node, edges, records) }
  }

  /** Runs the entry node, then follows the chain until a node fails or a node has no outgoing edge. */
  private async runChain(instanceId: string, graphId: string, entry: string, edges: readonly Edge[], records: HistoryRecord[]): Promise<Omit<ResumeOutcome, 'instanceId'>> {
    const { inputs } = records[0].payload as { inputs: Record<string, unknown> }
    let nodeId = entry
    let values = inputs
    for (;;) {
      const edge = edges.find(candidate => candidate.from === nodeId)
      const outcome = await this.runNode(instanceId, graphId, nodeId, values, records, edge === undefined)
      if (outcome.status !== 'completed' || edge === undefined) return outcome
      nodeId = edge.to
      values = outcome.outputs as Record<string, unknown>
    }
  }

  /**
   * Runs one node of the chain with the given inputs; a node with a `node.completed` record is returned, not re-run.
   * `last` says no edge leaves the node: when it completes, or when it fails, the instance is finished.
   */
  private async runNode(instanceId: string, graphId: string, nodeId: string, inputs: Record<string, unknown>, records: HistoryRecord[], last: boolean): Promise<Omit<ResumeOutcome, 'instanceId'>> {
    const definition = this.nodes.get(nodeId)
    const completed = records.find(record => record.kind === 'node.completed' && record.nodeId === nodeId)
    if (completed !== undefined) return outcomeOf(completed.payload as NodeCompleted)
    this.history.append({ kind: 'node.started', instanceId, graphId, nodeId, payload: { inputs } })
    if (definition === undefined) throw new Error(`dispatch: no node "${nodeId}" registered`)
    let payload: NodeCompleted
    try {
      checkPorts(definition.inputs, inputs)
      const recorded = records.filter(record => record.kind === 'activity.completed' && record.nodeId === nodeId).map(record => record.payload as RecordedCall)
      const cursor = { index: 0 }
      const run = (name: string, args: unknown) => this.callActivity(instanceId, graphId, nodeId, recorded, cursor, name, args)
      payload = { outputs: await definition.run({ activities: runProxy(run) }, inputs) }
    } catch (error) {
      payload = { error: error instanceof Error ? error.message : String(error) }
    }
    const outcome = payload.error === undefined ? 'ok' : 'error'
    this.write(undefined, (tx) => {
      this.history.append({ kind: 'node.completed', instanceId, graphId, nodeId, payload })
      if (last || outcome === 'error') tx?.publish({ type: FINISHED, data: { instanceId, graphId, outcome } }, this.source)
    })
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
    return await handler(args, (value, tx) => {
      const stored: unknown = JSON.parse(canonical(value) ?? 'null')
      this.write(tx, () => this.history.append({ kind: 'activity.completed', instanceId, graphId, nodeId, payload: { name, fingerprint: actual, result: stored } }))
      return value
    })
  }

  close(): void {
    this.history.close()
    for (const subscription of this.subscriptions) void subscription.stop()
  }
}

const LIFECYCLE: readonly string[] = [STARTED, FINISHED]

/**
 * The node an instance stopped at: the first node of its recorded chain without a `node.completed`; `undefined` when the
 * instance has ended, i.e. a node failed or the last node of the chain completed.
 */
export function unfinishedNode(records: readonly HistoryRecord[]): string | undefined {
  const opened = records[0]
  if (opened === undefined || opened.kind !== 'instance.opened') return undefined
  const { node: entry, edges = [] } = opened.payload as { node: string; edges?: Edge[] }
  let nodeId = entry
  for (;;) {
    const completed = records.find(record => record.kind === 'node.completed' && record.nodeId === nodeId)
    if (completed === undefined) return nodeId
    if ((completed.payload as NodeCompleted).error !== undefined) return undefined
    const edge = edges.find(candidate => candidate.from === nodeId)
    if (edge === undefined) return undefined
    nodeId = edge.to
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
/** The plugin entry loads once the role's `dispatchMessaging` is up; events then go to the stream through it. */
export const inject = ['dispatchMessaging']

export function apply(ctx: Context, config: Config): void {
  ctx.plugin(DispatchEngine, config)
}
