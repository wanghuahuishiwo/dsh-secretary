import type { DeepCellLevel, TimeBlockView, TimeLayer, TimeTagView } from 'dsh-secretary-time-panel/ui'
import { timeMath } from 'dsh-secretary-time-panel/ui'

/**
 * The design fixture day. It is pinned so screenshots, scenarios and the
 * OpenDesign preview repeat even when the host clock moves on.
 */
export const FIXTURE_TODAY = '2026-11-06'
export const FIXTURE_NOW_MINUTE = 14 * 60 + 20
export const FIXTURE_YESTERDAY = timeMath.addDays(FIXTURE_TODAY, -1)
export const FIXTURE_TOMORROW = timeMath.addDays(FIXTURE_TODAY, 1)
export const FIXTURE_WEEK_START = timeMath.weekStartOf(FIXTURE_TODAY)
export const FIXTURE_FROM = timeMath.addDays(FIXTURE_TODAY, -3)
export const FIXTURE_TO = timeMath.addDays(FIXTURE_TODAY, 10)

const DEEP_CELLS = 7 * 24

/** Fixture tag palette; production tag colours still come from Tag data. */
export const fixtureTags: readonly TimeTagView[] = [
  { id: 'work', name: '工作', color: 'var(--tb-tag-work)' },
  { id: 'focus', name: '深度工作', parentId: 'work', color: 'var(--tb-tag-focus)' },
  { id: 'collaboration', name: '协作沟通', parentId: 'work', color: 'var(--tb-tag-collaboration)' },
  { id: 'life', name: '生活', color: 'var(--tb-tag-life)' },
  { id: 'meal', name: '用餐', parentId: 'life', color: 'var(--tb-tag-meal)' },
  { id: 'exercise', name: '运动', parentId: 'life', color: 'var(--tb-tag-exercise)' },
  { id: 'learning', name: '学习', color: 'var(--tb-tag-learning)' },
  { id: 'reading', name: '阅读', parentId: 'learning', color: 'var(--tb-tag-reading)' },
  { id: 'rest', name: '休息恢复', color: 'var(--tb-tag-rest)' },
  { id: 'errand', name: '日常事务', color: 'var(--tb-tag-errand)' },
]

const plan: readonly TimeBlockView[] = [
  block('p-01', FIXTURE_TODAY, 420, 450, 'exercise'),
  block('p-02', FIXTURE_TODAY, 480, 510, 'meal'),
  block('p-03', FIXTURE_TODAY, 540, 660, 'focus', '完成设计方案评审'),
  block('p-04', FIXTURE_TODAY, 660, 690, 'collaboration', '对齐本周安排'),
  block('p-05', FIXTURE_TODAY, 720, 780, 'meal'),
  block('p-06', FIXTURE_TODAY, 810, 900, 'focus', '整理交互细节'),
  block('p-07', FIXTURE_TODAY, 900, 930, 'rest'),
  block('p-08', FIXTURE_TODAY, 1080, 1140, 'exercise'),
  block('p-09', FIXTURE_TODAY, 1260, 1320, 'reading', '《设计中的设计》'),
  block('p-10', FIXTURE_YESTERDAY, 540, 630, 'focus', '梳理一周重点'),
  block('p-11', FIXTURE_YESTERDAY, 720, 780, 'meal'),
  block('p-12', FIXTURE_TOMORROW, 540, 600, 'collaboration', '项目例会'),
  block('p-13', FIXTURE_TOMORROW, 600, 720, 'focus', '准备演示'),
]

const actual: readonly TimeBlockView[] = [
  block('a-01', FIXTURE_TODAY, 440, 470, 'exercise'),
  block('a-02', FIXTURE_TODAY, 490, 520, 'meal'),
  block('a-03', FIXTURE_TODAY, 550, 640, 'focus', '整理 TimeBlock 交互'),
  block('a-04', FIXTURE_TODAY, 640, 680, 'collaboration', '设计走查'),
  block('a-05', FIXTURE_TODAY, 730, 770, 'meal'),
  block('a-06', FIXTURE_TODAY, 820, 860, 'focus'),
  block('a-07', FIXTURE_TODAY, 860, 900, 'collaboration', '临时讨论'),
  block('a-08', FIXTURE_TODAY, 920, 940, 'rest'),
  block('a-09', FIXTURE_TODAY, 1140, 1180, 'reading'),
  block('a-10', FIXTURE_YESTERDAY, 550, 650, 'focus'),
  block('a-11', FIXTURE_YESTERDAY, 650, 680, 'collaboration'),
  block('a-12', FIXTURE_TOMORROW, 540, 570, 'focus', '已有实录示例'),
]

/** Fresh plan/actual blocks so a preview reload always starts from the fixture. */
export function createFixtureBlocks(): Record<TimeLayer, TimeBlockView[]> {
  return {
    plan: plan.map(item => ({ ...item })),
    actual: actual.map(item => ({ ...item })),
  }
}

/** The current week's painted 深度时间 cells: some high, medium and low focus. */
export function createFixtureDeep(): DeepCellLevel[] {
  const cells: DeepCellLevel[] = Array.from({ length: DEEP_CELLS }, () => 'unset')

  const paint = (weekday: number, startHour: number, endHour: number, level: DeepCellLevel) => {
    for (let hour = startHour; hour <= endHour; hour += 1) {
      const index = (weekday - 1) * 24 + hour
      if (index >= 0 && index < DEEP_CELLS) cells[index] = level
    }
  }

  paint(1, 9, 11, 'high')
  paint(2, 9, 11, 'high')
  paint(2, 14, 15, 'medium')
  paint(3, 9, 10, 'medium')
  paint(3, 15, 16, 'low')
  paint(4, 9, 11, 'high')
  paint(5, 10, 11, 'medium')
  paint(6, 15, 16, 'low')
  paint(7, 10, 11, 'low')
  return cells
}

function block(
  id: string, date: string, start: number, end: number, tagId: string, note?: string,
): TimeBlockView {
  return note === undefined ? { id, date, start, end, tagId } : { id, date, start, end, tagId, note }
}
