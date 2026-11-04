# OmniFocus 4 for Mac：官方交互、UI 结构与视觉风格调研

- 调研日期：2026-11-04（Asia/Shanghai）
- 用途：为「小秘书-事项」原型提供 Mac 桌面端的第一手依据，不改变现行产品需求或设计文件。
- 来源边界：只使用 Omni Group 官方产品页、OmniFocus 4 官方手册和 Apple App Store 官方入口；没有使用第三方测评、Dribbble 或二手 redesign。
- 证据标记：
  - **【手册】**：官方手册直接说明的结构或行为。
  - **【截图】**：已从官方页面下载并逐张打开核验的画面证据。
  - **【分析】**：基于上述证据的原型设计提炼，不是 Omni Group 的原文或承诺。
  - **【未核实】**：当前资料或访问条件不足，不作事实断言。

## 1. 官方入口、版本与访问限制

### 1.1 三个目标入口

1. **官方产品页**：[OmniFocus — The Omni Group](https://www.omnigroup.com/omnifocus/)。已读取页面正文、图片地址与下载区。
2. **Apple App Store 官方页**：[OmniFocus 4](https://apps.apple.com/app/omnifocus-4/id1542143627)；Mac 视图可带 [`platform=mac`](https://apps.apple.com/app/omnifocus-4/id1542143627?platform=mac)。
   - 产品页 Mac 下载区的 App Store 按钮指向 `https://www.omnigroup.com/download/appstore/omnifocus-mac`，该官方链接实际 `302` 到上述 App Store 应用 ID（带 Omni 的跟踪参数）。
   - **访问限制**：当前网络出口请求 US / Mac 页面时先被 Apple `302` 到 `/cn`，跟随重定向后落在中国区 iPhone Today，未能读取 Mac App Store 正文。因此本文**没有引用 App Store 页面文案、版本或其截图**，也不把搜索结果摘要当成页面内容。
3. **官方 Mac 手册**：OmniFocus 4 使用统一的跨平台 Reference Manual，其中明确标注 Mac 行为并附 Mac 截图。
   - [Contents](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/contents/)
   - 本次请求 `/universal/4.10/en/contents/` 实际重定向到 `/universal/4.10.1/en/contents/`；页面资源目录为 `omnifocus-universal-v4.10.1.2`。
   - 核心章节：[Perspectives](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/)、[The Outline](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/outline/)、[The Inspector](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/inspector/)、[Capture Methods](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/capture/)、[The Toolbar](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/toolbar/)。

### 1.2 不要混同截图与手册版本

- **【手册／官网】**调研时产品页下载区列出的最新 **Mac 版为 4.9.3**，Mac 系统要求为 macOS 15.2；手册入口则为 4.10.1。[产品页下载区](https://www.omnigroup.com/omnifocus/#download)
- 产品页四张独立 Mac 窗口图位于 `assets/img/app/focus-4.9/` 路径；这是可追溯的资产路径，但**仅凭目录名不能证明每张图的精确 app build**。
- 手册中的多张图是 Mac + iPhone 合成示意图；本文只观察其中的 Mac 部分。[product-hero.png](assets/omnifocus-mac/product-hero.png) 也是多设备营销合成图，只用于整体风格参照，不用于认定细粒度控件行为。
- 产品页较新的窗口图与手册示意图的控件 chrome 不完全一致。下文不把某一张图的胶囊分组、间距或颜色说成所有系统版本下的固定外观。

## 2. 核心结论

1. **【手册】Mac 以 Outline（大纲）为主工作区，而不是以“首页 → 列表 → 详情页”的导航栈为中心。** Outline 居中，左侧 Sidebar 与右侧 Inspector 可显示或隐藏；最左另有 Perspectives Bar。[Outline 布局](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/outline/#the-outline)
2. **【手册】Perspective 是同一批 Action / Project 的不同查看方式。** 它不是另一套事项实体；Projects、Tags、Forecast、Review 的 Sidebar 和 Outline 可以有不同结构。[Perspectives 定义](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#perspectives)
3. **【手册】编辑采用“双层路径”**：常用字段直接在 Outline 行内编辑；多字段或多条目编辑更适合 Inspector。Inspector 不是每次编辑都必须进入的详情页。[Inspector 编辑分工](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/inspector/#the-inspector)
4. **【截图】视觉上是高密度、低装饰的桌面大纲**：白／近黑的中性底、细分隔线、系统风格无衬线字、透视专属强调色；任务状态、日期和标签主要通过小型图标、圆环与轻量色底传达，而不是卡片堆叠。
5. **【截图 + 手册】选中态与编辑态很醒目，但不改变整体布局模型**：选中行出现圆角色块；Fluid Layout 下可在当前行展开更多字段。Mac 另有适合横向扫描的 Columns Layout。[Row Layout](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/outline/#row-layout)
6. **【手册】Quick Entry 是“mini Inbox”**：Mac 前台和全局快捷入口都指向它；它复用行动字段与布局设置，不是另一套简化数据模型。[Quick Entry](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/capture/#quick-entry-and-smart-add)

## 3. Mac UI 结构与基础交互（手册事实）

### 3.1 Perspectives Bar、Sidebar、Outline、Inspector

| 区域 | 【手册】官方结构与交互 | 主要来源 |
|---|---|---|
| **Perspectives Bar** | Regular View 中是屏幕左侧的竖向 tab 列，每个 tab 有图标和标题；点击切换 Perspective。若已经滚动或选择内容，点击当前 tab 第一次会清除选择并回到 Outline 顶部，第二次显示／隐藏 Sidebar。Mac 可在 Perspectives List 收藏、排序并分配快捷键。 | [Perspectives Bar](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#perspectives-bar)、[Perspectives List](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#perspectives-list) |
| **Sidebar** | 位于 Perspectives Bar 与 Outline 之间；选择其中一个或多个条目会导航并过滤 Outline。它有 Projects、Tags、Forecast、Review 四种类型；Inbox 没有 Sidebar。 | [Sidebar](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#sidebar) |
| **Outline** | 是查看、新增、删除和编辑 Action / Project 的主视图；Mac 上居中，左侧 Sidebar 与右侧 Inspector 可显示或隐藏。顶部显示当前 Perspective 名称与可见条目计数，但 Forecast / Review 使用各自的信息。 | [The Outline](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/outline/#the-outline)、[Perspective Header](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/outline/#perspective-header) |
| **Inspector** | 编辑当前选中的 Action、Action Group、Project、Folder 或 Tag；选中 Outline / Sidebar 内容后由 View Menu 或 Toolbar 打开。Mac 底部提供 Edit Inspector Layout 与 Show All Inspector Fields。 | [The Inspector](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/inspector/#the-inspector)、[Inspector Toolbars](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/inspector/#inspector-toolbars) |

**【截图】对应画面：**

- [product-organize-mac-2.jpg](assets/omnifocus-mac/product-organize-mac-2.jpg)、[product-capture-mac-1.jpg](assets/omnifocus-mac/product-capture-mac-1.jpg) 可依次看到浅色与深色窗口中的“透视列 → 内容 Sidebar → 中央 Outline”。当前透视使用浅色圆角底；Sidebar 选中行也有独立的圆角色块。
- [manual-inspector-hero.png](assets/omnifocus-mac/manual-inspector-hero.png) 的 Mac 部分显示右侧 Inspector：标题、Status、Project、Tags、Defer 等按纵向分段排列，与中央 Outline 同屏。
- [manual-perspectives-sidebar.png](assets/omnifocus-mac/manual-perspectives-sidebar.png)、[manual-outline-hero.png](assets/omnifocus-mac/manual-outline-hero.png) 分别突出 Sidebar 和 Outline；它们是手册的位置示意，不应据模糊背景推断额外行为。

### 3.2 Mac Toolbar

- **【手册】**Toolbar 位于窗口顶部，承载常用命令。初始包括 **Sidebar、Back / Forward、View Options、New Action、Quick Entry、Focus / Unfocus（Pro）、Search、Inspector**。[Mac Toolbar](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/toolbar/#mac-toolbar)
- **【手册】**Mac 独有 Customize Toolbar，可移除默认按钮，或添加 Complete、Drop、Clean Up、Attach、Flag、Mark Reviewed、Quick Open、Sync、Share 等；手册明确说 Toolbar customization only available on Mac。[Mac Toolbar customization](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/toolbar/#mac-toolbar)
- **【截图】**[product-capture-mac-1.jpg](assets/omnifocus-mac/product-capture-mac-1.jpg) 等产品页图中，按钮按任务分组，并置于圆角胶囊状容器；Search 在右侧，Inspector 在最右。[manual-toolbar-hero.png](assets/omnifocus-mac/manual-toolbar-hero.png) 则采用较简化的图标排列。胶囊外观是截图证据，**不是手册要求的固定尺寸或样式**。

### 3.3 Quick Open

- **【手册】**Mac 用 `Command + O` 打开 Quick Open，可搜索并进入 Perspective、Folder、Project、Tag；支持方向键和 Return，并可勾选 Open in a new window。[Quick Open](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#quick-open)
- **【分析】**它承担“按名称快速跳转”，与 Sidebar 的结构化浏览、Perspectives Bar 的固定入口是互补关系。

## 4. 关键 Perspective 与捕获流程（手册事实）

### 4.1 Inbox

- **【手册】**Inbox 是捕获与暂存入口，也是 Outline 驱动的标准 Perspective；可通过 `Command + N`、Mac Toolbar 的 New Action 或 Quick Entry 新增。[Inbox](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#inbox)
- **【手册】**简单条目可直接完成；也可分组、添加 Tag、分配 Project 或 Convert to Project。分配 Project / Tag 后是否立即离开 Inbox 取决于 Clean Up 设置，不能简化成“有标签就必然消失”。[Inbox Outline](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#inbox-outline)
- **【手册】**Inbox 没有 Sidebar；官方解释是未整理条目通常还没有 Project / Tag 等导航与过滤信息。[Sidebar availability](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#sidebar)
- **【截图】**[manual-perspectives-inbox.png](assets/omnifocus-mac/manual-perspectives-inbox.png) 的 Mac 部分只有最左透视列和中央列表，没有第二层项目 Sidebar；标题下显示 `3 inbox items`，三行事项均为直接的大纲行。

### 4.2 Projects

- **【手册】**Projects Outline 同时列出 Project 及其 Action；Project、Action Group、Action、可选 Folder 都以行呈现，嵌套关系由缩进层级表达。[Projects Outline](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#projects-outline)
- **【手册】**Projects Sidebar 展示完整 Folder / Project 结构，可显示内容摘要 badges；行首图标区分 Folder、Parallel、Sequential、Single Actions List，非 Active 状态在行尾另给图标。Folder 可折叠／展开。[Projects Sidebar](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#projects-sidebar)
- **【手册】**点击 Project / Folder 会过滤 Outline；可多选并一起查看，再次点击或 `Command + click` 取消选择。Mac Sidebar 底部有 Add 与 Shortcut Menu。拖一个 Project 到另一个 Project 上会把前者转换为后者的 Action Group，而不是仅改变排序。[Projects Sidebar](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#projects-sidebar)
- **【截图】**[product-organize-mac-2.jpg](assets/omnifocus-mac/product-organize-mac-2.jpg) 显示 Folder 选中、顶部的 `Focus: Work` notice bar，以及 Outline 顶部的 `1 folder selected ×`；[product-capture-mac-1.jpg](assets/omnifocus-mac/product-capture-mac-1.jpg) 则显示 Project 过滤与 `1 project selected ×`。两者都说明“选中侧栏对象”和“当前大纲内容”同时可见，不需要跳去独立详情页。

### 4.3 Forecast

- **【手册】**Forecast 将带 Due 的事项作为核心，并可按 View Options 纳入 Planned、Defer、通知、Calendar Events、Flagged / Forecast Tag 等。它不是只有计划时间块的日历。[Forecast](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#forecast)、[Forecast View Options](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#forecast-view-options)
- **【手册】**Outline 顶部的日期条叫 **Piano Keys**：包含 Past、Future 和中间适应可用宽度的日期格。日期格显示唯一条目计数；Due 项另有红（Overdue）、黄（Due Soon）、灰（其他 Due）summary dots。[Forecast date tiles](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#forecast)
- **【手册】**选择日期后 New Action 默认写入该日 Due；可通过 Add or Drag to Assign 改为 Defer 或 Planned。[Forecast date tiles](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#forecast)
- **【手册】**结构有 **Flexible**（统一列表，可手动排序，可 Preserve Hierarchy）与 **Organized**（按 Calendar Events、Due、Planned、Deferred、Tagged、Flagged、Notifications 等分节）。Calendar Events 在 OmniFocus 中只读，点击日历按钮到外部日历 App 打开。[Forecast Outline](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#forecast-outline)、[Calendars](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#forecast-outline-calendars)
- **【手册】**Forecast Sidebar 是月历，含 Past、Future 与 next month 的逐日日期格及工作量计数。[Forecast Sidebar](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#forecast-sidebar)
- **【截图】**[manual-perspectives-forecast.png](assets/omnifocus-mac/manual-perspectives-forecast.png) 的 Mac 部分同时显示左侧月历、顶部横向日期格和右侧按 Past / Today / 后续日期分节的 Outline；日历事件与行动行同在一个纵向内容流中。

### 4.4 Review

- **【手册】**Review Sidebar 列出待 Review 的 Projects，Outline 一次专注一个 Project。Sidebar 是平坦列表，默认按 Next review date 从旧到新排列，不保留 Projects 的 Folder 层级。[Review](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#review)、[Review Sidebar](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#review-sidebar)
- **【手册】**Outline 提供 Previous、Next、Mark Reviewed。Mark Reviewed 将 Last reviewed 设为今天、按 Review every 计算 Next review，再进入下一个 Project。[Review Outline](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#review-outline)
- **【手册】**Review 顶部展示待审数量、Last reviewed 与 Review every；点击 Review every 可调整 Next review 或频率。Review 的内容是项目状态与行动是否仍完整、相关、组织得当，不是时间统计。[Reviewing a Project](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#reviewing-a-project)
- **【截图】**[product-review-mac-3.jpg](assets/omnifocus-mac/product-review-mac-3.jpg) 显示左侧平坦项目队列、当前项目行、右侧 `Project 8 of 9 · Review every week · Last reviewed…`，以及右上角 Previous / Next / Mark Reviewed；中央只展开当前项目的行动和笔记。

### 4.5 Quick Entry

- **【手册】**Quick Entry 是数据库的 mini Inbox。打开后即有一行新 Action 可编辑；填标题及所需字段，Save 保存，Cancel 丢弃。它支持 View Options，可使用默认或自定义 Layout。[Quick Entry and Smart Add](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/capture/#quick-entry-and-smart-add)
- **【手册】**Mac 可从 Toolbar 或 Show/Hide Quick Entry 命令打开；只要 OmniFocus 在后台运行，也可使用用户配置的 Quick Entry Shortcut 从 Mac 任意位置调用。[Quick Entry on Mac](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/capture/#quick-entry-on-mac)
- **【手册】**窗口内用 Tab / Shift+Tab 在字段间移动。Modern Mode 下 Esc 取消、Return 确认并关闭；Classic Mode 的按键不同，因此原型不应只写一套“OmniFocus 固定快捷键”。
- **【截图】**[manual-quick-entry-mac.png](assets/omnifocus-mac/manual-quick-entry-mac.png) 是一张独立浮动面板：行动行内有状态圆环、标题、Project、Tags、Due、Repeat、Add Note、Note / Flag；左下是 View Options，右下为 Cancel 与蓝色 Save。它复用大纲字段，而不是制作一张多页向导。

## 5. 行、字段与编辑方式

### 5.1 Fluid 与 Columns 两种密度

- **【手册】**默认是 **Fluid Layout**：始终显示一组重要字段，选中行后可编辑这些字段及 Note；其他字段可配置。默认可见属性包括 Project、Tags、Due、Flag。[Fluid Layout](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/outline/#fluid-layout)
- **【手册】** **Columns Layout 仅 Mac 提供**，把信息放在单行中以便扫描；也可配置 Project、Tags、Due、Flag、Defer、Planned、Estimated Duration、Repeat、Note 等列。[Columns Layout](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/outline/#columns-layout)
- **【截图】**[manual-outline-row-mac.png](assets/omnifocus-mac/manual-outline-row-mac.png) 是典型的两行 Fluid 行：上行标题，下行 Project / Tag / Due；Note 与 Flag 在右端。[product-do-mac-1.jpg](assets/omnifocus-mac/product-do-mac-1.jpg) 则呈现标题、Project、Due 等横向对齐的单行扫描形态。
- **【分析】**密度不是简单“行高更大／更小”，而是两种信息架构：Fluid 优先标题和就地编辑，Columns 优先跨行比较。原型若只能先实现一种，应先明确主要工作是逐条处理还是批量扫描。

### 5.2 选中、状态圆环与完成

- **【手册】**Action / Action Group 有 Status Circle；点击 Active 圆环会完成并显示 checkmark，再点回 Active。Mac `Option + click` 为 Dropped 并显示横线。Project 没有状态圆环，以避免误操作。[Status Circle](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/outline/#status-circle)
- **【手册】**圆环还表达 Due Soon（黄）、Overdue（红）、Flagged（橙色与小旗）、Repeat（中间三点），这些状态可组合。选中条目后也可用 Space 完成、`Option + Space` Drop。
- **【截图】**状态控件是细线圆环，不是方形 checkbox；普通事项为灰色，临期／逾期／旗标行使用对应颜色。[product-capture-mac-1.jpg](assets/omnifocus-mac/product-capture-mac-1.jpg) 中选中 Action 有整行蓝色圆角底，标题下展开 Tag、Defer、Planned、Due 与 Note；Sidebar 的选中色块和 Outline 的选中色块是不同层级的状态。

### 5.3 日期与 Tag 呈现、编辑

- **【截图】**日期和 Tag 不是同等视觉样式：Tag 多为灰色小胶囊，Due 等日期按状态带黄／红等轻量色底；Project 通常以灰色文字加项目图标出现。截图同时出现 `Today` / `Tomorrow` / `Yesterday` 与数字日期，但现有资料不足以总结其全部格式化规则。
- **【手册】**Defer、Planned、Due 字段支持自然语言和相对日期输入（如 `tomorrow`、`2d`），并提供 `+1d` / `+1w` / `+1m` 快捷按钮及 Calendar popover；快捷按钮改变日期时保留已分配时间。[Entering Dates and Times](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/inspector/#entering-dates-and-times)、[Shortcut Date Buttons](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/inspector/#shortcut-date-buttons)
- **【手册】**Mac 的 Project / Tags 字段可输入过滤、打开列表并直接创建新对象；Tag 可多个，已分配 Tag 可在 Mac 拖拽重排，Control+click 可 Go To / Remove。[Project Inspector](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/inspector/#project-inspector)、[Tags Inspector](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/inspector/#tags-inspector)

### 5.4 大纲组织与 Inspector 分工

- **【手册】**Outline 与 Sidebar 都支持组织内容；Mac 可拖一个或多个行到 Outline 新位置、Sidebar、Perspectives Bar 或其他 App。Action Group 用粗体与 Action 区分；拖放时 Mac 用插入线指示会成为同级还是子级。[Organizing the Outline](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/outline/#organizing-the-outline)
- **【手册】**官方建议 Quick edits 通常在 Outline 更快，多项目或多字段编辑在 Inspector 更快。Inspector 字段随对象类型变化，并可自定义显示字段；不能把截图中的一组字段当成所有对象的固定表单。[Inspector editing note](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/inspector/#the-inspector)、[Properties](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/inspector/#properties)

## 6. 视觉风格提炼（截图直接证据）

| 维度 | 【截图】可直接观察到的特征 | 不应过度推断 |
|---|---|---|
| **整体布局** | 最左窄透视列、可选第二 Sidebar、宽中央 Outline、可选右 Inspector；内容以纵向列表为主，不用卡片宫格。 | 不据此写死各栏像素宽度或最小窗口尺寸。 |
| **密度** | 行间距紧凑；项目／分组用粗体与分隔线建立节奏；Fluid 行通常标题 + 第二行元数据，另有单行横向排布形态。 | 不从缩放后的营销图反推行高、字号或点击区域。 |
| **字体** | 系统风格无衬线；Perspective 标题大号粗体并带强调色，计数与元数据较小、较灰；项目／组标题粗于普通行动标题。 | 官方截图本身不能证明字体族一定是某一命名字体，也不提供 point size；本研究不标“SF Pro 13px”等虚构 token。 |
| **颜色** | 浅色以白／浅灰为底，深色以近黑为底；Projects 蓝、Tags 紫、Forecast 红、Flagged 橙、Nearby 绿、Review 靛蓝等帮助识别 Perspective。状态色与 Perspective 强调色并存。 | 不把压缩后的 JPEG 色值当作设计规范，也不声称完整色板或对比度已经验收。 |
| **选中态** | 当前 Perspective、Sidebar 选择和 Outline 选择分别使用圆角色块；选中的 Outline 行呈展开编辑形态。 | 不把截图中的蓝色精确色值、圆角半径当作固定规范。 |
| **Toolbar** | 图标按钮按功能聚组；产品页较新图中出现圆角胶囊容器，Search 与 Inspector 靠右。 | 手册只保证命令与可定制性，不保证所有 macOS 版本都有同样 chrome。 |
| **Sidebar** | 树形缩进、disclosure arrow、类型图标、数量 badges；选择过滤状态直接可见，底部有轻量图标按钮。 | 不把 iPhone 合成图右半部分的整屏 Sidebar 行为套到 Mac。 |
| **列表行** | 状态圆环 + 标题 + 可选次级元数据，Note / Flag 常位于行尾；层级以缩进而非独立卡片呈现。 | 不假设所有字段默认都显示；布局可配置。 |
| **日期／Tags** | 小型图标和文字，Tag 灰底、日期带语义色；选中行中可见空字段提示，便于直接补充。 | 不把某个示例日期格式当成所有语言和区域的固定格式。 |
| **Quick Entry** | 浮动单面板、一个可编辑 Action 行、底部 Cancel / Save；主按钮蓝色，字段复用 Outline 视觉语言。 | 不从静态图推导动画、全局快捷键默认值或窗口层级细节。 |

主要截图依据：[product-hero.png](assets/omnifocus-mac/product-hero.png)、[product-capture-mac-1.jpg](assets/omnifocus-mac/product-capture-mac-1.jpg)、[product-organize-mac-2.jpg](assets/omnifocus-mac/product-organize-mac-2.jpg)、[product-do-mac-1.jpg](assets/omnifocus-mac/product-do-mac-1.jpg)、[product-review-mac-3.jpg](assets/omnifocus-mac/product-review-mac-3.jpg)、[manual-outline-row-mac.png](assets/omnifocus-mac/manual-outline-row-mac.png)、[manual-inspector-hero.png](assets/omnifocus-mac/manual-inspector-hero.png)、[manual-quick-entry-mac.png](assets/omnifocus-mac/manual-quick-entry-mac.png)。完整来源映射见第 8 节。

## 7. 对「小秘书-事项」原型的启示（分析，不是官方需求）

1. **先固定主工作台，再配置左右栏。** 以 Outline 为持续存在的中央工作区；Perspectives Bar 负责换视图，Sidebar 负责当前视图内的导航／过滤，Inspector 负责当前选择的完整属性。不要让每个 Perspective 都变成独立的数据页面。
2. **让不同 Perspective 有不同的结构，而不只是换标题。** Inbox 不需要项目 Sidebar；Projects 是层级树 + 大纲；Forecast 是日期格 + 月历／列表；Review 是平坦待审队列 + 单项目专注视图。
3. **把高频编辑留在行内，把完整编辑留给 Inspector。** 选中行直接暴露常用字段；Project、Tag、日期可使用搜索／快捷选择。不要为每次修改都强制打开独立详情页。
4. **把“完成”与“选中”拆成两个清晰目标。** 状态圆环承担完成／恢复，点击行主体承担选择／编辑；Project 是否应有同样的完成控件，需要按小秘书自己的状态模型另行决定。
5. **密度应可选或由任务驱动。** 逐条 clarify 时采用 Fluid 式多行；批量扫描时可借鉴 Columns 的单行比较。不要只通过缩小字号来制造“专业感”。
6. **使用语义色而不是装饰色。** Perspective 色用于定位，黄／红用于日期紧迫性，橙色用于 Flag；中性灰承载次要元数据。具体色值需由小秘书自己的可访问性验证确定。
7. **Quick Entry 只降低捕获阻力，不省略后续组织。** 首屏只要求标题并保留常用字段入口；保存后仍进入同一 Action / Inbox 事实源。是否实现全局快捷键属于独立产品能力，不因参考截图而自动纳入范围。
8. **小秘书自己的 Planned／Actual／TimeBlock 语义不能被截图反向改写。** 本文只借鉴交互和视觉组织；领域字段仍以现行 PRD、ADR 与 [OmniFocus 领域模型调研](omnifocus.md) 为准。

## 8. 已下载截图清单：原始 URL 与来源页

所有文件都保存在 `docs/research/assets/omnifocus-mac/`，下载后已用文件格式检查并逐张打开核验。下表的“原图”就是原始 URL，没有使用缩略图地址替代。

| 本地文件 | 尺寸 | 内容与证据用途 | 来源页 | 原图 URL |
|---|---:|---|---|---|
| [product-hero.png](assets/omnifocus-mac/product-hero.png) | 3161×1285 | 多设备营销合成；含 Mac 浅色／深色 Projects，仅作整体风格参照 | [Omni 产品页](https://www.omnigroup.com/omnifocus/) | [原图](https://www.omnigroup.com/assets/img/app/focus-4/of4-hero.png) |
| [product-capture-mac-1.jpg](assets/omnifocus-mac/product-capture-mac-1.jpg) | 2116×1352 | Mac 深色 Projects；Sidebar 过滤、选中行展开字段、Tags／日期／Note／Flag。虽位于 Capture 区块，画面本身不是 Quick Entry | [Omni 产品页](https://www.omnigroup.com/omnifocus/) | [原图](https://www.omnigroup.com/assets/img/app/focus-4.9/capture-mac-1.jpg) |
| [product-organize-mac-2.jpg](assets/omnifocus-mac/product-organize-mac-2.jpg) | 2116×1352 | Mac 浅色 Projects；Focus notice、Folder 过滤、层级 Sidebar 与 Fluid 大纲 | [Omni 产品页](https://www.omnigroup.com/omnifocus/) | [原图](https://www.omnigroup.com/assets/img/app/focus-4.9/organize-mac-2.jpg) |
| [product-do-mac-1.jpg](assets/omnifocus-mac/product-do-mac-1.jpg) | 2116×1352 | Mac 深色 Tags；层级 Tag Sidebar、分组大纲、横向元数据排列 | [Omni 产品页](https://www.omnigroup.com/omnifocus/) | [原图](https://www.omnigroup.com/assets/img/app/focus-4.9/do-mac-1.jpg) |
| [product-review-mac-3.jpg](assets/omnifocus-mac/product-review-mac-3.jpg) | 2116×1352 | Mac 深色 Review；平坦待审队列、单项目 Outline、Review 元信息与操作 | [Omni 产品页](https://www.omnigroup.com/omnifocus/) | [原图](https://www.omnigroup.com/assets/img/app/focus-4.9/review-mac-3.jpg) |
| [manual-outline-hero.png](assets/omnifocus-mac/manual-outline-hero.png) | 1028×648 | 手册 Mac + iPhone 合成；Mac 侧展示 Outline 主工作区 | [The Outline](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/outline/#the-outline) | [原图](https://support.omnigroup.com/doc-assets/omnifocus-universal-v4.10.1.2/en/art/chapters/outline.hero.png) |
| [manual-outline-row-mac.png](assets/omnifocus-mac/manual-outline-row-mac.png) | 1296×148 | Mac 单行细节；状态圆环、标题、Project、Tag、Due、Note、Flag | [Outline Rows](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/outline/#outline-rows) | [原图](https://support.omnigroup.com/doc-assets/omnifocus-universal-v4.10.1.2/en/art/chapters/outline.row.mac.png) |
| [manual-inspector-hero.png](assets/omnifocus-mac/manual-inspector-hero.png) | 1028×648 | 手册 Mac + iPhone 合成；Mac 侧展示右 Inspector 与行选中态 | [The Inspector](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/inspector/#the-inspector) | [原图](https://support.omnigroup.com/doc-assets/omnifocus-universal-v4.10.1.2/en/art/chapters/inspector.hero.png) |
| [manual-perspectives-bar.png](assets/omnifocus-mac/manual-perspectives-bar.png) | 1034×648 | 手册 Mac + iPhone 合成；Mac 侧突出最左 Perspectives Bar | [Perspectives Bar](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#perspectives-bar) | [原图](https://support.omnigroup.com/doc-assets/omnifocus-universal-v4.10.1.2/en/art/chapters/perspectives.bar.png) |
| [manual-perspectives-sidebar.png](assets/omnifocus-mac/manual-perspectives-sidebar.png) | 1028×648 | 手册 Mac + iPhone 合成；Mac 侧突出项目 Sidebar 的位置与层级 | [Sidebar](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#sidebar) | [原图](https://support.omnigroup.com/doc-assets/omnifocus-universal-v4.10.1.2/en/art/chapters/perspectives.sidebar.png) |
| [manual-perspectives-inbox.png](assets/omnifocus-mac/manual-perspectives-inbox.png) | 1028×648 | 手册 Mac + iPhone 合成；Mac Inbox 无第二 Sidebar、直接显示条目 Outline | [Inbox](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#inbox) | [原图](https://support.omnigroup.com/doc-assets/omnifocus-universal-v4.10.1.2/en/art/chapters/perspectives.inbox.png) |
| [manual-perspectives-projects.png](assets/omnifocus-mac/manual-perspectives-projects.png) | 1028×648 | 手册 Mac + iPhone 合成；Mac Projects Sidebar + 缩进 Outline | [Projects](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#projects) | [原图](https://support.omnigroup.com/doc-assets/omnifocus-universal-v4.10.1.2/en/art/chapters/perspectives.projects.png) |
| [manual-perspectives-forecast.png](assets/omnifocus-mac/manual-perspectives-forecast.png) | 1028×648 | 手册 Mac + iPhone 合成；Mac 月历 Sidebar、Piano Keys、分节 Outline、日历事件 | [Forecast](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#forecast) | [原图](https://support.omnigroup.com/doc-assets/omnifocus-universal-v4.10.1.2/en/art/chapters/perspectives.forecast.png) |
| [manual-perspectives-review.png](assets/omnifocus-mac/manual-perspectives-review.png) | 1028×648 | 手册 Mac + iPhone 合成；Mac Review Sidebar 与单项目 Outline | [Review](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/perspectives/#review) | [原图](https://support.omnigroup.com/doc-assets/omnifocus-universal-v4.10.1.2/en/art/chapters/perspectives.review.png) |
| [manual-quick-entry-mac.png](assets/omnifocus-mac/manual-quick-entry-mac.png) | 1076×422 | 纯 Mac Quick Entry；浮动面板、字段、View Options、Cancel／Save | [Quick Entry on Mac](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/capture/#quick-entry-on-mac) | [原图](https://support.omnigroup.com/doc-assets/omnifocus-universal-v4.10.1.2/en/art/chapters/capture.methods.quick.entry.mac.png) |
| [manual-toolbar-hero.png](assets/omnifocus-mac/manual-toolbar-hero.png) | 1012×196 | Mac / iPhone / iPad Toolbar 合成；用于核对顶部命令区域，不用于测量尺寸 | [The Toolbar](https://support.omnigroup.com/documentation/omnifocus/universal/4.10.1/en/toolbar/#the-toolbar) | [原图](https://support.omnigroup.com/doc-assets/omnifocus-universal-v4.10.1.2/en/art/chapters/toolbar.hero.png) |

## 9. 明确未确定的内容

- **【未核实】**Mac App Store 正文、Mac App Store 截图及页面内展示的版本信息：当前网络重定向阻碍了读取，本文不作补写。
- **【未核实】**精确字体族、字号、行高、栏宽、圆角、色值、动画时长、hover 行为和完整键盘／拖放矩阵：本次不是实机测试，静态官方图与所读章节不足以确定这些细节。
- **【未核实】**产品页每张营销图对应的精确 app build 与 macOS build；资产目录名和页面“Latest Versions”不能替代图内 About 信息。
- 本研究没有把 Omni 官网的网页 CSS 当作 OmniFocus Mac 的 UI 规范；网页字体、品牌色与桌面 App 的截图证据是不同对象。
