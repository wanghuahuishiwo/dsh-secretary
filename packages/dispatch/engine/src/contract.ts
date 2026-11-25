import type { Context } from '@deepseek-ai/cordis'

/** A graph node input port: a semantic type label plus the structural check every wired value must pass. */
export interface Port<T = unknown> {
  readonly type: string
  check(value: unknown): value is T
}

/** The event shape the engine routes; one CloudEvents `data` envelope step. */
export interface DispatchEvent {
  readonly id: string
  readonly type: string
  readonly data?: unknown
}

export interface EmitInput {
  readonly type: string
  readonly data?: unknown
}

/** Result of the host-provided `agent` activity: final message, structured output, native ids written. */
export interface AgentResult {
  readonly text: string
  readonly structured?: unknown
  readonly nativeIds?: string[]
}

/** `ctx.activities.<name>(args)` — the only side-effect exit a `run` may use. */
export interface Activities {
  /** Engine-provided: hands an event to the configured emit sink. */
  emit(input: EmitInput): Promise<null>
  /** Host-provided (#103): runs one agent turn. Throws until a host adapter is registered. */
  agent(input: { prompt: string }): Promise<AgentResult>
  [name: string]: (args: never) => Promise<unknown>
}

export interface RunContext {
  readonly activities: Activities
}

export interface NodeDefinition<I extends Record<string, unknown> = Record<string, unknown>, O = unknown> {
  readonly name: string
  readonly inputs: Record<string, Port>
  readonly outputs: Record<string, Port>
  run(ctx: RunContext, inputs: I): Promise<O>
}

/** Declares a graph node the ComfyUI way; the definition is registered with `ctx.graphNodes.register`. */
export function defineNode<I extends Record<string, unknown> = Record<string, unknown>, O = unknown>(definition: NodeDefinition<I, O>): NodeDefinition<I, O> {
  return definition
}

export interface GraphNodeRegistry {
  register(definition: NodeDefinition): () => void
  get(name: string): NodeDefinition | undefined
  list(): NodeDefinition[]
}

/** A sequential chain link: when `from` completes, its outputs become the inputs of `to`. */
export interface Edge {
  readonly from: string
  readonly to: string
}

/** An entry: which event type opens an instance of which graph, entering at which node with adapted inputs. */
export interface EntryDeclaration {
  readonly graph: string
  /** Triggering event `type`. */
  readonly on: string
  /** Registered node the instance enters. */
  readonly node: string
  /** Sequential chain behind the entry node; `to` runs with the outputs of `from` as its inputs. */
  readonly edges?: readonly Edge[]
  /** Output ports of the adapter; must match the entry node's input ports. */
  readonly output: Record<string, Port>
  adapt(event: DispatchEvent): Record<string, unknown> | Promise<Record<string, unknown>>
}

/** `(args) => result`; executed by the engine outside the isolated `run`. */
export type ActivityHandler = (args: unknown) => unknown | Promise<unknown>

export interface ActivityRegistry {
  register(name: string, handler: ActivityHandler): () => void
}

export interface EmitSink {
  (event: DispatchEvent): void | Promise<void>
}

export interface FeedOutcome {
  readonly matched: boolean
  /** One new instance per entry that claimed the event; empty when unmatched. */
  readonly instanceIds: string[]
}

export interface ResumeOutcome {
  readonly instanceId: string
  readonly status: 'completed' | 'failed'
  readonly outputs?: unknown
  readonly error?: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    readonly dispatchEngine: import('./index.ts').DispatchEngine
    readonly graphNodes: GraphNodeRegistry
  }
}

export type { Context }
