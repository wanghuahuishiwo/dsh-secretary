/**
 * The public TimeBlock UI entry: the product root, the pure model helpers and
 * the adapter contract. Internal components stay private to this package.
 */
export { TimeProduct } from './TimeProduct.tsx'
export { timeMath } from './model.ts'
export type {
  TimeAdapter, TimeProductProps,
  TimeView, TimeQuery, TimeLayer, TimeTagView, TimeBlockView, TimeRunView,
  PaintCommand, PaintDeepCommand, UpdateBlockCommand, DeleteBlockCommand,
  DeepLevel, DeepCellLevel, DeepWeekData, DeepWeekSource, DeepRect,
} from './contract.ts'
