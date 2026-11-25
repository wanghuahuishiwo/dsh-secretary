/** The four object sections of the console; #105 fills the reserved ones in place. */
export type SectionId = 'gateway' | 'nodes' | 'events' | 'graph'

export interface SectionDefinition {
  readonly id: SectionId
  readonly label: string
}

export const SECTIONS: readonly SectionDefinition[] = [
  { id: 'gateway', label: 'Gateway' },
  { id: 'nodes', label: '节点' },
  { id: 'events', label: '事件' },
  { id: 'graph', label: 'Graph' },
]
