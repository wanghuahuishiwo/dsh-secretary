/**
 * Source mirror of the `./ui` declaration export.
 *
 * The Typert analyzer maps a package export target back to a source module, so
 * `./lib/ui-types/index.d.ts` resolves to this file. The product entry itself
 * stays `src/ui/index.ts`; only the host-safe contract types are mirrored here
 * so the host face never pulls the browser components into its program.
 */
export type {
  TimeAdapter, TimeProductProps,
  TimeView, TimeQuery, TimeLayer, TimeTagView, TimeBlockView, TimeRunView,
  PaintCommand, PaintDeepCommand, UpdateBlockCommand, DeleteBlockCommand,
  DeepLevel, DeepCellLevel, DeepWeekData, DeepWeekSource, DeepRect,
} from '../ui/contract.ts'
