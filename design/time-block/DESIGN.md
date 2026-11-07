# 小秘书-时间块 · 设计契约

本文件是时间块模块的视觉、组件组合与 token 契约。项目级原则见根 [DESIGN.md](../../DESIGN.md)，产品行为见 [docs/prd/time-block.md](../../docs/prd/time-block.md)，可运行预览见 `index.html` 与 `scenarios.json`。

## 视觉契约

时间块藏在 DSH 窄右栏里，是一个安静、紧凑的时间工具，不是独立工作台。视觉目标是让“这一天的时间去了哪里”成为唯一主角：低对比中性表面建立秩序，低饱和类别色承载时间事实，装饰不能比记录更显眼。

- **画布**：多日 24 小时 × 每小时六格（每格 10 分钟）；日期列由左侧日期标记与小时刻度引导，网格连续拼接，不把每格做成卡片。连续块只在首个可见格显示一次标签，标签为备注或标签名，完整信息保留在 tooltip；跨小时行仍算同一块，不重复标签；被更早记录遮住的并行记录从它第一次可见的格子开始显示标签。同一格内有多条并行记录时，格阵仍只显示按开始时间最早的一条，右上角用克制的数量角标提示还有记录；点击角标才弹出该格全部记录列表。并行不增加行高、不横向切分格子，也不引入错层卡片、多轨、层叠摘要或行下清单。
- **层级**：页面 / 栏体 / 抬升面 / 悬停面四级中性色阶；分隔线低对比。已上色块使用类别色实底，选中态用实线内框和勾选符号表达，不能只靠颜色变化。
- **计划与实录**：同一日期、两种数据层；切层不改日期，也不把一层的写入复制到另一层。Undo 只恢复当前层。
- **深度时间**：7 × 24 周网格，按 高 / 中 / 低 三档上色；每行连续同级别只在最左一格显示级别名。未绘制的一周显示空白来源提示，不冒充“已继承”。
- **抽屉与浮层**：一级模块抽屉、日期/周选择、记录编辑浮层、Toast 是临时层级；只有这些浮层允许轻阴影。
- **主题**：暗色是默认评审主题，浅色是同一语义结构的另一种表达；主题切换只改 token，不改组件结构。生产主题跟随 DSH，OpenDesign 由设计壳切换。

## 组件组合

产品 UI 全部位于 `packages/time-panel/src/ui`，只有 `TimeProduct` 是对外组件；生产与 OpenDesign 渲染同一份实现。

```text
TimeProduct                      UI 根：模块/层/日期/范围/选择/浮层/busy/error
├── TimeHeader                   模块切换（图标+标题打开抽屉）、日期导航、今天、Undo、headerAction 插槽
├── TimeCanvas                  多日画布 + 选择/拖动/滚动扩展/回到今天；选区徽章、重叠角标与记录浮层
│   └── TagShelf                层级时间标签、收窄、上色
├── DeepWeekView                深度周网格、级别选择、区域上色/擦除；选区徽章
├── DatePicker                  自绘月历；day / week 两种模式
├── Drawer                      一级模块抽屉（实录 / 计划 / 深度时间）
├── RecordSheet                 记录备注：备注、删除
└── Toast                       操作反馈
```

- `TimeProduct` 只通过 `TimeAdapter` 契约读写；不 import 宿主、Remote 或产品包。
- 组件样式唯一来源是 `packages/time-panel/src/ui/styles.ts`，生产与 OpenDesign 共用；设计侧不复制组件 CSS。
- `headerAction` 是宿主插槽：生产可留空，OpenDesign 用它放主题切换与“设计预览”标识。宿主动作在窄栏放不下时换行到头部第二行，不挤压产品控件。
- 记录编辑与删除、Undo、错误反馈都以 Adapter 返回的新视图为准；失败时保留上一次成功的视图并显示错误。

## Token 契约

组件只消费 `--tb-*`。值统一定义在 [tokens.css](tokens.css)：颜色、字阶、间距和圆角 alias 到根 `--sec-*`；模块尺寸、深度级别色与 fixture 调色板使用字面值。生产由 `packages/time-panel/src/client/hostTokens.ts` 把 DSH 的宿主值绑到同一组 `--tb-*`。

| 分组 | Token | 来源 |
|---|---|---|
| 表面 | `--tb-surface-page` / `--tb-surface-rail` / `--tb-surface-raised` / `--tb-surface-hover` / `--tb-grid-cell` | alias 到根 token |
| 文字 | `--tb-text-primary` / `--tb-text-secondary` / `--tb-text-tertiary` | alias 到根 token |
| 边框 | `--tb-border-subtle` / `--tb-border-strong` | alias 到根 token |
| 强调与状态 | `--tb-accent` / `--tb-accent-soft` / `--tb-danger` / `--tb-selection` | alias 到根 token |
| 字阶 | `--tb-font-family` / `--tb-font-caption` / `--tb-font-label` / `--tb-font-body` / `--tb-font-title` | alias 到根 token |
| 间距 | `--tb-space-1` … `--tb-space-6` | alias 到根 token |
| 圆角 | `--tb-radius-sm` / `--tb-radius-md` / `--tb-radius-lg` | alias 到根 token |
| 模块尺寸 | `--tb-control-height: 30px` / `--tb-hour-height: 26px` / `--tb-rail-width: 390px` / `--tb-shelf-width: 116px` / `--tb-status-height: 42px` | 字面值 |
| 深度级别 | `--tb-deep-high` / `--tb-deep-medium` / `--tb-deep-low` | 字面值，明暗各一套 |
| Fixture 标签 | `--tb-tag-work` / `--tb-tag-focus` / `--tb-tag-collaboration` / `--tb-tag-life` / `--tb-tag-meal` / `--tb-tag-exercise` / `--tb-tag-learning` / `--tb-tag-reading` / `--tb-tag-rest` / `--tb-tag-errand` | 字面值，明暗各一套；仅服务设计 fixture |

`--tb-tag-*` 不是生产标签色来源：生产标签色仍来自 Tag 数据。新增组件颜色/间距时先扩模块 token，不在组件里写死色值或新增第二套变量。

## 数据边界与 Fixture

OpenDesign 组合根是 `design/time-block/src/App.tsx`：创建 `FixtureTimeAdapter`、持有主题状态、把主题切换与预览标识注入 `headerAction`，然后渲染 `TimeProduct`。设计侧只 import `dsh-secretary-time-panel/ui`，不 import 生产 client。

`FixtureTimeAdapter` 实现 `TimeAdapter`，纯内存、无网络/SQLite/生产 DSH 依赖：

- 固定演示今天 `2026-11-06`、当前时刻 `14:20`。
- 多日窗口 `from = today - 3`、`to = today + 10`；`TimeProduct` 打开时定位于 fixture 今天。
- 计划与实录各含今天、昨天、明天的块；当前周含 高 / 中 / 低 深度数据。
- `paint` / `erase`（`tagId: null`）/ `undo` / `paintDeep` / `updateBlock` / `deleteBlock` 全部在内存完成，每个写命令返回新的 `TimeView`；Undo 只影响当前层。
- 重载页面即恢复 fixture；不配置持久化，也不把预览写入当成生产事实。

生产走 `RemoteTimeAdapter`（`packages/time-panel/src/client`），映射真实 Remote 与 Undo；两套 Adapter 共享同一契约。

## 验收

- `design/time-block/index.html` 加载完整 `TimeProduct`：Time / Deep / 多日 / 日历 / 编辑 / 抽屉 / Undo。
- 主题切换可用，控制台错误与外部请求为 0。
- `design/time-block/scenarios.json` 的场景可在固定 fixture 上复现。
- 重叠记录默认收起为数量角标；点角标才显示该格全部记录，且不改变行高、不切分格子。
- `--tb-*` 之外不出现组件宿主 token；设计侧不复制产品组件。
- 生产验收仍需真实 DSH + Remote + SQLite，不以本预览替代。
