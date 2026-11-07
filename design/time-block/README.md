# 时间块

小秘书-时间块的 390px 右栏设计稿，覆盖计划、实录、共享时间画布与标签上色。视觉与组件边界见 [DESIGN.md](../../DESIGN.md)，产品事实见 [time-block.md](../../docs/prd/time-block.md)。

## 入口

- 预览：`index.html`
- 场景：`scenarios.json`
- 视觉基线：`baselines/select-390-dark.png`

## 交互

- 计划与实录独立切换，日期导航保持当前日期。
- 10 分钟格画布：单击追加或取消，同日拖动形成连续选区。
- 层级标签架上色、橡皮擦除、Undo 与选区分钟统计。
- 390px 窄栏，暗色为默认主题，可切换浅色。

## 数据

UI 只依赖 [`shared/model/adapter.ts`](../shared/model/adapter.ts) 的 `load / paint / erase / undo`。当前组合根为 `src/FixtureTimeAdapter.ts`，数据保存在内存，固定演示日期为 `2026-11-06`，重载页面恢复 fixtures。生产接入实现同一接口。

## 验收

`scenarios.json` 定义 9 个可执行场景，覆盖默认计划、选择、上色、擦除、Undo、计划/实录切换、日期导航、主题切换与拖动选择。验收视口为 390 × 844，控制台错误与外部请求均为 0。

## 范围

本稿覆盖单日右栏。多日连续扩展、月历、完整记录编辑、深度时间、生产错误恢复和持久化由后续设计稿承接。
