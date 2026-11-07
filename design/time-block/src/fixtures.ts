import type { TimeBlock, TimeBlockSnapshot, TimeTag } from '../../shared/model/types.ts'
import { addDays } from '../../shared/model/time.ts'

/** 固定“今天”让截图与 Playwright 场景可复现，不读取真实 DSH 数据。 */
export const FIXTURE_TODAY = '2026-11-06'
const YESTERDAY = addDays(FIXTURE_TODAY, -1)
const TOMORROW = addDays(FIXTURE_TODAY, 1)

export const fixtureTags: readonly TimeTag[] = [
  { id: 'work', name: '工作', color: 'var(--tb-tag-work)' },
  { id: 'focus', name: '深度工作', color: 'var(--tb-tag-focus)', parentId: 'work' },
  { id: 'collaboration', name: '协作沟通', color: 'var(--tb-tag-collaboration)', parentId: 'work' },
  { id: 'life', name: '生活', color: 'var(--tb-tag-life)' },
  { id: 'meal', name: '用餐', color: 'var(--tb-tag-meal)', parentId: 'life' },
  { id: 'exercise', name: '运动', color: 'var(--tb-tag-exercise)', parentId: 'life' },
  { id: 'learning', name: '学习', color: 'var(--tb-tag-learning)' },
  { id: 'reading', name: '阅读', color: 'var(--tb-tag-reading)', parentId: 'learning' },
  { id: 'rest', name: '休息恢复', color: 'var(--tb-tag-rest)' },
  { id: 'errand', name: '日常事务', color: 'var(--tb-tag-errand)' },
]

const plan: readonly TimeBlock[] = [
  block('p-01', FIXTURE_TODAY, 420, 450, 'exercise'),
  block('p-02', FIXTURE_TODAY, 480, 510, 'meal'),
  block('p-03', FIXTURE_TODAY, 540, 660, 'focus', '完成设计方案评审'),
  block('p-04', FIXTURE_TODAY, 660, 690, 'collaboration', '对齐本周安排'),
  block('p-05', FIXTURE_TODAY, 720, 780, 'meal'),
  block('p-06', FIXTURE_TODAY, 810, 900, 'focus', '整理交互细节'),
  block('p-07', FIXTURE_TODAY, 900, 930, 'rest'),
  block('p-08', FIXTURE_TODAY, 1080, 1140, 'exercise'),
  block('p-09', FIXTURE_TODAY, 1260, 1320, 'reading', '《设计中的设计》'),
  block('p-10', YESTERDAY, 540, 630, 'focus', '梳理一周重点'),
  block('p-11', YESTERDAY, 720, 780, 'meal'),
  block('p-12', TOMORROW, 540, 600, 'collaboration', '项目例会'),
  block('p-13', TOMORROW, 600, 720, 'focus', '准备演示'),
]

const actual: readonly TimeBlock[] = [
  block('a-01', FIXTURE_TODAY, 440, 470, 'exercise'),
  block('a-02', FIXTURE_TODAY, 490, 520, 'meal'),
  block('a-03', FIXTURE_TODAY, 550, 640, 'focus', '整理 TimeBlock 交互'),
  block('a-04', FIXTURE_TODAY, 640, 680, 'collaboration', '设计走查'),
  block('a-05', FIXTURE_TODAY, 730, 770, 'meal'),
  block('a-06', FIXTURE_TODAY, 820, 860, 'focus'),
  block('a-07', FIXTURE_TODAY, 860, 900, 'collaboration', '临时讨论'),
  block('a-08', FIXTURE_TODAY, 920, 940, 'rest'),
  block('a-09', FIXTURE_TODAY, 1140, 1180, 'reading'),
  block('a-10', YESTERDAY, 550, 650, 'focus'),
  block('a-11', YESTERDAY, 650, 680, 'collaboration'),
  block('a-12', TOMORROW, 540, 570, 'focus', '已有实录示例'),
]

export function createFixtureSnapshot(): TimeBlockSnapshot {
  return {
    today: FIXTURE_TODAY,
    nowMinute: 14 * 60 + 20,
    tags: fixtureTags,
    blocks: { plan, actual },
    canUndo: { plan: false, actual: false },
  }
}

function block(
  id: string, date: string, start: number, end: number, tagId: string, note?: string,
): TimeBlock {
  return note === undefined ? { id, date, start, end, tagId } : { id, date, start, end, tagId, note }
}
