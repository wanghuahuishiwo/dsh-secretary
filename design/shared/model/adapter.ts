import type { TimeBlockSnapshot, TimeLayer, TimeRun } from './types.ts'

export interface PaintCommand {
  readonly layer: TimeLayer
  readonly runs: readonly TimeRun[]
  readonly tagId: string
}

export interface EraseCommand {
  readonly layer: TimeLayer
  readonly runs: readonly TimeRun[]
}

export interface UndoResult {
  readonly date: string
  readonly snapshot: TimeBlockSnapshot
}

/**
 * TimeBlock UI 的唯一数据边界。
 * 设计预览由内存 Fixture 实现；生产 Remote Adapter 将来实现同一接口。
 */
export interface TimeBlockAdapter {
  load(): Promise<TimeBlockSnapshot>
  paint(command: PaintCommand): Promise<TimeBlockSnapshot>
  erase(command: EraseCommand): Promise<TimeBlockSnapshot>
  undo(layer: TimeLayer): Promise<UndoResult | undefined>
}
