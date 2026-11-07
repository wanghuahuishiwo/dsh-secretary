# 事项

小秘书-事项的独立主区设计稿，覆盖 DSH 左侧栏进入后的完整工作区。产品范围见 [gtd.md](../../docs/prd/gtd.md)。

## 入口

- 完整工作区：`gtd/omnifocus-mac.html?variant=mac`
- 右栏适配：`gtd/omnifocus-mac.html?variant=rail`
- 预览图：`omnifocus-mac-dark.png`、`omnifocus-forecast-dark.png`、`omnifocus-quick-entry.png`

## 布局

保留 DSH AppFrame 与左栏，在中央 `main` 展示独立页面。Perspectives Bar、Sidebar、Outline 与 Inspector 按当前 Perspective 组合；Inbox 使用单层列表，Projects 使用层级树，Forecast 使用月历与 Piano Keys，Review 使用项目队列与单项目焦点。

## 交互

- 切换收件箱、项目、下一步、标签、预测、旗标和检查。
- 项目与标签筛选、行动选中、Inspector、完成或恢复、搜索和明暗主题。
- Forecast 日期筛选与 Review 项目推进。
- Quick Entry 复用单条 Action 行，捕获到内存 Inbox。

## 数据

设计稿使用内存 fixtures，不读取真实 GTD 数据。Planned Date 是单个柔性时刻，不是时间块区间；事项与时间块共享上游 Tag／Goal 能力，各自维护事实表。

## 依据

交互和视觉依据见 [OmniFocus Mac 调研](../../docs/research/omnifocus-mac.md)。生产侧当前提供左栏入口和空白 `main`，Perspectives、Folder、Action Group、Flagged、Review、Repeat、字段集合、快捷键、拖放、权限和数据迁移由后续设计评审承接。
