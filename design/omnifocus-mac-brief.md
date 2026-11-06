# 小秘书-事项 · OmniFocus Mac 原型

这是当前唯一保留的事项产品评审原型。它用于继续体验未来的独立主区工作区，不是生产代码，不连接真实 GTD 数据，也不代表原型中的功能已获实施授权。

## 打开与引用

- **Open Design**：项目 `secretary-prototype` → `omnifocus-mac.html`。
- **本机评审原件**：`~/Library/Application Support/Open Design/namespaces/release-stable/data/projects/secretary-prototype/omnifocus-mac.html`。
- **仓库副本**：[omnifocus-mac.html](omnifocus-mac.html)。使用 `?variant=mac` 查看完整工作区。
- **官方依据**：[OmniFocus Mac 调研](../docs/research/omnifocus-mac.md) 及其中保存的 16 张官方图像与原始 URL。

预览：[完整工作区](omnifocus-mac-dark.png) · [Forecast](omnifocus-forecast-dark.png) · [Quick Entry](omnifocus-quick-entry.png)。

## 当前设计方向

事项从 DSH 左侧栏全局 panel 区进入，保留 DSH AppFrame 与左栏，在中央 `main` 展示独立页面。后续内容参照 Mac 完整工作区：

- Perspectives Bar、按 Perspective 变化的 Sidebar、中央 Outline 与按需 Inspector。
- Inbox 没有第二 Sidebar；Projects 使用层级树；Forecast 使用月历与 Piano Keys；Review 使用平坦项目队列和单项目焦点。
- Fluid 多行 Outline、状态圆环、语义日期色、行内元数据与备注／旗标；不使用卡片网格或旧桌面表单工作区。
- Quick Entry 复用单条 Action 行，不采用多页向导。

## 原型可体验内容

- 切换收件箱、项目、下一步、标签、预测、旗标和检查。
- 项目／标签筛选、行动选中、Inspector、完成／恢复、搜索与明暗主题。
- Forecast 日期筛选、Review 上一／下一项目与标记已检查。
- Quick Entry 捕获到内存 Inbox，Esc／外部点击关闭。

## 实施边界

当前生产环境只提供“小秘书-事项”左栏入口和**空白 `main` 页面**。以下内容仍需后续评审，不因原型存在而进入生产：

- Perspectives、Quick Entry、Folder、Action Group、Flagged、Review、Repeat 及其他完整 OmniFocus 功能。
- 具体字段集合、快捷键、拖放、键盘矩阵、权限和数据迁移。
- Goal 字段或 Goal 管理 UI。

Planned Date 是单个柔性时刻，不是时间块区间；项目检视不是时间对账。事项与时间块共享上游 Tag／Goal 能力，但不共享产品壳或彼此的事实表。
