# 小秘书-时间块 · 设计契约

本文件是时间块模块的视觉、组件组合与 token 契约。项目级原则见根 [DESIGN.md](../../DESIGN.md)，产品行为见 [docs/prd/time-block.md](../../docs/prd/time-block.md)，可运行预览见 `index.html` 与 `scenarios.json`。

## 视觉契约

时间块藏在 DSH 窄右栏里，是一个安静、紧凑的时间工具，不是独立工作台。视觉目标是让“这一天的时间去了哪里”成为唯一主角：**近黑底、中灰满格、低饱和暖色大色块**；不使用阴影、卡片、装饰渐变或第二种强调色；唯一的渐变是固定的网格背景层。参考提取与取值证据见 [docs/research/timeblocks-visual.md](../../docs/research/timeblocks-visual.md)。

- **画布**：多日 24 小时 × 每小时六格（每格 10 分钟）；网格区域是一层**固定**的纵向渐变（暗色约 `#202020` → `#505050` → `#303030`），不随日期滚动移动；格子透明，单元格之间只留页面底色的 1–1.5px 细缝（记录块也被同一层细缝切开），形成有深度的连续矩阵而不是平灰描边表格。日期列由大日号、月份、星期和“今天”引导；小时刻度写 `H:00`，等宽数字右对齐。连续块只在首个可见格显示一次标签，标签恒为时间标签名，备注不进入画布任何位置；完整信息保留在 tooltip（`标签名 · 备注`），跨小时行仍算同一块，不重复标签；被更早记录遮住的并行记录从它第一次可见的格子开始显示标签。
- **日期块**：月份 / 大日号 / 星期 / “今天”四行居中，当天在下方加一条白色短线；不使用卡片、边框或彩色高亮。
- **类别架**：没有容器背景，类别按钮直接浮在页面黑底上；纯色、无描边、无阴影、6–7px 圆角，按钮文字 13px。类别色只表达类别，不表达优先级。
- **层级与焦点**：画布底 / 顶栏 / 空格 / 记录构成明度层级；选中、当前时刻、当天标记统一使用白色，不引入第二种强调色。已上色块使用类别色实底，选中态用实线内框和勾选符号表达，不能只靠颜色变化。
- **计划与实录**：同一日期、两种数据层；切层不改日期，也不把一层的写入复制到另一层。Undo 只恢复当前层。
- **选区写入**：默认覆盖选区内容；只有选区碰到已有记录时，浮动选区徽章才出现 `覆盖｜并行`，并行写入保留旧记录并在整个选区新增一条，写入后回到覆盖。
- **深度时间**：7 × 24 周网格，按 高 / 中 / 低 三档上色；每行连续同级别只在最左一格显示级别名。深度周网格复用同一个固定背景渐变层，未设置格透明，日期列与级别架保持黑底。未绘制的一周显示空白来源提示，不冒充“已继承”。
- **抽屉与浮层**：一级模块抽屉、日期/周选择、记录详情 sheet、Toast 是临时层级；只有这些浮层允许轻阴影。记录详情只从底部 sheet 出现，不再有锚定在数量角标旁的浮层。
- **主题**：暗色是默认评审主题，浅色是同一语义结构的另一种表达；主题切换只改 token，不改组件结构。生产主题跟随 DSH，OpenDesign 由设计壳切换。DSH 深色主题固定使用参考材质（近黑页面、中灰空格），浅色主题继续继承宿主。
- **宽侧栏**：内容随宿主侧栏宽度自适应，不设固定最大宽度；头部高度由产品 token `--tb-head-height` 统一为 60px，生产与 OD 一致，不按壳层区分。画布可纵向滚动，但不显示滚动条。

## 组件组合

产品 UI 全部位于 `packages/client/ui-time/src/ui`，只有 `TimeProduct` 是对外组件；生产与 OpenDesign 渲染同一份实现。

```text
TimeProduct                      UI 根：模块/层/日期/范围/选择/浮层/busy/error
├── TimeHeader                   模块切换（图标+标题打开抽屉）、日期导航、今天、Undo
├── CanvasGradient              固定网格背景渐变，TimeCanvas / DeepWeekView 共用
├── TimeCanvas                  多日画布 + 选择/拖动/滚动扩展/回到今天；选区徽章、覆盖/并行切换、重叠角标
│   └── TagShelf                层级时间标签、收窄、上色
├── DeepWeekView                深度周网格、级别选择、区域上色/擦除；选区徽章
├── DatePicker                  自绘月历；day / week 两种模式
├── Drawer                      一级模块抽屉（实录 / 计划 / 深度时间）
├── RecordsSheet                记录详情 sheet：并行记录列表 → 单条详情、备注即存、返回、删除
└── Toast                       操作反馈
```

- `TimeProduct` 只通过 `TimeAdapter` 契约读写；不 import 宿主、Remote 或产品包。
- 组件样式唯一来源是 `packages/client/ui-time/src/ui/styles.ts`，生产与 OpenDesign 共用；设计侧不复制组件 CSS。
- 产品头部只承载产品控件（模块切换、日期导航、今天、撤销），不提供宿主控件插槽；`TimeProduct` 不接受 headerAction。OpenDesign 的主题切换与「设计预览」标识是产品框外的页面级浮层，不进入产品布局。
- 记录编辑与删除、Undo、错误反馈都以 Adapter 返回的新视图为准；失败时保留上一次成功的视图并显示错误。

## 底部记录详情交互契约

记录详情只有一个容器：从右栏底部拉起的 `.tb-sheet`，列表与详情共用同一张 sheet。

- **打开**：点时间块本身（短按、无移动）。单条记录的块直接进详情；同格多条先进「N 条并行记录」列表。数量角标「²」只是视觉指示（`pointer-events: none`），不可点。
- **列表**：每行 色点 + 标签名 + 起止时间 + 时长 + `›`；有备注时追加一行次级小字备注预览。列表顶部是「N 条并行记录」与星期/时间。
- **详情**：左上角固定返回控件 `‹ {N} 条记录`，点击回列表并保留列表状态；单条记录没有上一级，不显示返回。内容为标签名标题、`星期 起 – 止 · 时长`、备注输入与右下角危险色文字「删除记录」。
- **关闭**：点遮罩、`Esc`、向下拖动把手，在任何层级都直接关闭整张 sheet，不逐级返回。
- **没有保存按钮**：备注输入即生效，输入后 400ms 防抖调用现有 `updateBlock`；失败由产品既有的错误/Toast 呈现，写错靠既有 Undo。删除是次级文字操作。
- **点击与选区**：从块上开始拖动仍进入选区（可覆盖上色、`Delete` 擦除）；只有块上的短按才打开详情。单击已占用格因此不再切换选区，这是 #38 的待确认取舍。

## Token 契约

组件只消费 `--tb-*`。**唯一来源**是 `packages/client/ui-time/src/ui/styles.ts` 的 `.tb-app` token 块：默认暗色，`.tb-app[data-tb-theme='light']` 覆盖浅色，两边都是产品自身色板。生产与 OpenDesign 由 `TimeProduct` 的 `theme` prop 选择主题，不再各自绑定一套颜色；`design/time-block/tokens.css` 只保留 fixture 标签调色板，`hostTokens.ts` 只负责宿主布局。

| 分组 | Token | 来源 |
|---|---|---|
| 表面 / 文字 / 边框 / 强调与状态 | `--tb-surface-*` / `--tb-text-*` / `--tb-border-*` / `--tb-accent*` / `--tb-danger` / `--tb-selection` | `styles.ts` token 块，明暗各一套 |
| 字阶 / 间距 / 圆角 | `--tb-font-*` / `--tb-space-*` / `--tb-radius-*` | `styles.ts` token 块，明暗共用 |
| 模块尺寸 | `--tb-head-height: 60px` / `--tb-control-height: 30px` / `--tb-hour-height: 26px` / `--tb-rail-width: 390px` / `--tb-shelf-width: 116px` / `--tb-status-height: 42px` / `--tb-gutter-width: 46px` / `--tb-hour-width: 26px` / `--tb-font-date: 34px` / `--tb-font-cat: 13px` | `styles.ts` token 块 |
| 网格背景渐变 | `--tb-grid-top` / `--tb-grid-mid` / `--tb-grid-bottom` | `styles.ts` token 块，明暗各一套 |
| 深度级别 | `--tb-deep-high` / `--tb-deep-medium` / `--tb-deep-low` | `styles.ts` token 块，明暗各一套 |
| Fixture 标签 | `--tb-tag-work` … `--tb-tag-errand` | `design/time-block/tokens.css`，仅服务设计 fixture |

`--tb-tag-*` 不是生产标签色来源：生产标签色仍来自 Tag 数据。暗色 fixture 采用参考界面的暖色系（深红 / 正红 / 珊瑚 / 暖黄 / 中灰），仅用于设计评审；浅色主题使用同色相加深值。新增组件颜色/间距时先扩 `styles.ts` 的 token 块，不在组件里写死色值，也不在壳层另建第二套变量。宿主只提供明暗信号，不提供色值。

## 数据边界与 Fixture

OpenDesign 组合根是 `design/time-block/src/App.tsx`：创建 `FixtureTimeAdapter`、持有主题状态、在页面级浮层渲染主题切换与「设计预览」标识，产品框内只渲染 `TimeProduct` 并传入 `theme`。设计侧只 import `dsh-secretary-ui-time/ui`，不 import 生产 client。生产 `TimeClient` 只把 DSH 的明暗状态转成同一个 `theme`，不绑定第二套颜色。

`FixtureTimeAdapter` 实现 `TimeAdapter`，纯内存、无网络/SQLite/生产 DSH 依赖：

- 固定演示今天 `2026-11-06`；当前时刻以 `14:20` 为锚点，随后按预览页本机时钟每分钟推进（与生产同一套「现在」通道，见 `docs/prd/time-block.md`）。
- 多日窗口 `from = today - 3`、`to = today + 10`；`TimeProduct` 打开时定位于 fixture 今天。
- 计划与实录各含今天、昨天、明天的块；当前周含 高 / 中 / 低 深度数据。
- `paint` / `erase`（`tagId: null`）/ `undo` / `paintDeep` / `updateBlock` / `deleteBlock` 全部在内存完成，每个写命令返回新的 `TimeView`；Undo 只影响当前层。
- 重载页面即恢复 fixture；不配置持久化，也不把预览写入当成生产事实。

生产走 `RemoteTimeAdapter`（`packages/client/ui-time/src/client`），映射真实 Remote 与 Undo；两套 Adapter 共享同一契约。

## 验收

- `design/time-block/index.html` 加载完整 `TimeProduct`：Time / Deep / 多日 / 日历 / 编辑 / 抽屉 / Undo。
- 主题切换可用，控制台错误与外部请求为 0；明暗只切 `data-tb-theme`，色值来自同一份 token 块。
- OD 与生产同结构：`TimeProduct` 头部控件相同、无预览专有元素；「设计预览」与主题切换位于产品框外的浮层。
- `design/time-block/scenarios.json` 的场景可在固定 fixture 上复现。
- 重叠记录默认收起为数量角标，角标仅作视觉指示、不可点；点块才打开记录详情（同格多条先进列表），且不改变行高、不切分格子。
- 记录详情只从底部 sheet 出现：单条直进详情、多条先进列表、返回保留列表、遮罩/`Esc`/拖拽把手直接关闭整张 sheet；详情无保存按钮，备注输入 400ms 后自动写入，删除为次级文字操作。
- 画布块内文字只有标签名，备注不进入画布；tooltip 为「标签名 · 备注」。
- DSH 深色材质、固定背景渐变、隐藏滚动条和 60px 头部通过真实宿主截图/探针校验，不只依赖 OD fixture；OD 预览与生产头部结构一致。
- 选区碰到已有记录才出现 `覆盖｜并行`，`Tab` 切换；并行写入保留旧记录并在整个选区新增一条，写入后回到覆盖。
- `--tb-*` 之外不出现组件宿主 token；设计侧不复制产品组件。
- 生产验收仍需真实 DSH + Remote + SQLite，不以本预览替代。
