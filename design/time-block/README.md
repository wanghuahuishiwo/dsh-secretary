# 时间块

小秘书-时间块的 DSH 右栏设计稿：与生产渲染同一套 `TimeProduct`，用 Fixture Adapter 提供可复现数据。模块视觉、组件与 token 契约见 [DESIGN.md](DESIGN.md)，项目级原则见根 [DESIGN.md](../../DESIGN.md)，产品事实见 [time-block.md](../../docs/prd/time-block.md)。

## 入口

- 预览：`index.html`
- 场景：`scenarios.json`
- 视觉基线：`baselines/select-390-dark.png` 仅作历史存档（单日设计时期产物，已不代表当前界面）；当前验收以 `scenarios.json` 与浏览器回归为准
- Fixture 标签调色板：[tokens.css](tokens.css)；产品色板唯一定义在 `packages/client/ui-time/src/ui/styles.ts`

## 交互

- 三个一级模块：实录 / 计划 / 深度时间，从头部模块切换区打开抽屉切换；切层保持日期。
- 多日 24h × 6 格画布：单击追加或取消，同日拖动形成连续选区；浮动徽章显示选区时长。
- 网格背景是固定在可视区的纵向渐变，内容滚动时渐变不动；时间块与深度时间共用同一个背景渐变层。画布可滚动但隐藏滚动条。
- 标签架上色；`Esc` 清空选区，`Delete` / `Backspace` 擦除；连续块只在首个可见格显示一次标签。
- 选区碰到已有记录时，浮动徽章出现 `覆盖｜并行`；默认覆盖，`Tab` 切换两种方式，切并行再点标签才保留旧记录并新增。
- 并行记录：重叠格只显示最早的一条，右上角数量角标提示还有记录；点角标弹出该格全部记录，默认收起、不轮换。不增加行高、不切分格子、不画多轨。
- 记录备注：右键已上色块，只改备注或删除；换标签走标签架，调时间靠重画。Undo 按层恢复。
- 自绘月历选天 / 选周；今天 / 本周。
- 深度时间：7 × 24 周网格，高/中/低上色；每行连续同级别只在最左格显示级别名。
- 明暗主题切换（仅设计壳，生产跟随 DSH）；右栏宽度可拖拽（320–720px）。

## 数据

设计侧只 import `dsh-secretary-ui-time/ui`。组合根 [`src/App.tsx`](src/App.tsx) 创建 [`FixtureTimeAdapter`](src/FixtureTimeAdapter.ts)，它实现 `TimeAdapter`：纯内存，固定演示今天 `2026-11-06`、当前时刻 `14:20`，覆盖多日块、Deep 周数据、编辑与 Undo；重载页面恢复 fixture，不访问网络、SQLite 或生产数据。

生产走 `RemoteTimeAdapter`，与 fixture 共享同一契约；设计稿不接线生产 Remote。

## 验收

浏览器打开 `index.html`：完整产品 UI 加载、主题切换可用、控制台无错误、无外部请求。`scenarios.json` 已按当前 `tb-*` DOM 更新，覆盖默认加载、一级模块切换、选择/上色/擦除/Undo、日期与日历、记录备注/删除、深度时间、主题以及无错误/无外部请求；场景在 390 × 844 视口逐条验证。生产验收仍需真实 DSH + Remote + SQLite。
