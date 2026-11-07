# 时间块

小秘书-时间块的 DSH 右栏设计稿：与生产渲染同一套 `TimeProduct`，用 Fixture Adapter 提供可复现数据。模块视觉、组件与 token 契约见 [DESIGN.md](DESIGN.md)，项目级原则见根 [DESIGN.md](../../DESIGN.md)，产品事实见 [time-block.md](../../docs/prd/time-block.md)。

## 入口

- 预览：`index.html`
- 场景：`scenarios.json`
- 视觉基线：`baselines/select-390-dark.png` 仅作历史存档（单日设计时期产物，已不代表当前界面）；当前验收以 `scenarios.json` 与浏览器回归为准
- 模块 token：[tokens.css](tokens.css)

## 交互

- 多日 24h × 6 格画布：计划与实录独立切换，日期导航保持当前日期；滚动扩展日期窗口。
- 10 分钟格选择：单击追加或取消，同日拖动形成连续选区；标签上色、橡皮擦除、选区分钟统计。
- 记录编辑：调节时间、换标签、写备注、删除；Undo 按层恢复。
- 自绘月历选天 / 选周；今天 / 本周。
- 深度时间：7 × 24 周网格、级别上色与擦除。
- 一级模块抽屉；明暗主题切换（仅设计壳，生产跟随 DSH）。

## 数据

设计侧只 import `dsh-secretary-time-panel/ui`。组合根 [`src/App.tsx`](src/App.tsx) 创建 [`FixtureTimeAdapter`](src/FixtureTimeAdapter.ts)，它实现 `TimeAdapter`：纯内存，固定演示今天 `2026-11-06`、当前时刻 `14:20`，覆盖多日块、Deep 周数据、编辑与 Undo；重载页面恢复 fixture，不访问网络、SQLite 或生产数据。

生产走 `RemoteTimeAdapter`，与 fixture 共享同一契约；设计稿不接线生产 Remote。

## 验收

浏览器打开 `index.html`：完整产品 UI 加载、主题切换可用、控制台无错误、无外部请求。`scenarios.json` 已按当前 `tb-*` DOM 更新，覆盖默认加载、层切换、选择/上色/擦除/Undo、日期与日历、记录编辑/删除、深度时间、主题以及无错误/无外部请求；场景在 390 × 844 视口逐条验证。生产验收仍需真实 DSH + Remote + SQLite。
