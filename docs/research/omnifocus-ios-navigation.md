# OmniFocus iOS/iPadOS 导航与交互模型调研

- 调研日期：2026-11-04（Asia/Shanghai）
- 对象：**OmniFocus 4 for iPhone / iPad**（不含 Mac）
- 基线：App Store 版本 **4.10**（2026-10-22 发布，要求 iOS/iPadOS 18.2+）；官方手册 **4.10**（页面实际重定向到 4.10.1）。对照版本：OmniFocus 3 Reference Manual for iOS **3.11**。
- 用途：为「约 420px 宽的窄栏 GTD 界面」提炼可借鉴的导航/交互事实，不评价 OmniFocus 的功能取舍。
- 证据标记：
  - 【官方】Omni Group 手册 / 发布说明 / 官方公告原文
  - 【截图】App Store 4.10 官方截图（已本地存档，见文末索引），只用于确认画面结构
  - 【二手】第三方实机评测（仅作旁证，不单独支撑结论）
  - 【推断】本文基于事实的推论，不是 Omni 的原文
  - 【未找到】没有可靠来源，明确不下结论

> 说明：官方视频《What's New in OmniFocus 4》本环境无法访问 Vimeo 逐帧核对（网络被阻断），因此**不作为具体结论的证据**，只保留链接供人工核对。`inside.omnifocus.com` 已不再提供《Inside OmniFocus》正文，访问会回到 OmniFocus 产品页，故未使用。

---

## 0. 先给结论

1. **不是「透视 → 列表 → 详情」的逐层 push。** OmniFocus 4 把**任务大纲（Outline）本身当成主界面**：打开任意透视直接落到任务列表；项目/标签层级收进可召唤的 **Sidebar**，单条任务的属性收进可召唤的 **Inspector**。
2. **没有首页。** 底部是一条 **Perspectives Bar**（透视条，横向图标+标题），承担原来 Home 的「切透视」职责；它不是传统 tab bar 的固定页面容器，可展开/自动收起，展开时还带 Quick Open / Search / Smart Add / Quick Entry。
3. **详情页被行内编辑取代。** 点一行即在大纲里就地展开字段（项目、标签、日期、备注），不需要进入新页面；只有批量编辑和不常用字段才去 Inspector。
4. **完成靠点状态圆圈，不靠滑动；推迟靠字段或长按菜单，不靠手势。** 滑动只用于 Flag / Delete / Select 这类行操作。

---

## 1. 整体导航层级

### 结论

- **iOS 版（Compact View）不是 push 栈，而是「一个 Outline + 若干可召唤 pane」的卡片式结构。** 官方定义：Compact View 一次只显示一个 pane，像「一叠卡片」；可在 Outline / Sidebar / Inspector 之间切换。
- **打开透视直接进入任务列表**，不再先经过「透视列表」或「项目库」逐层下钻。可以用设置改成「先显示 Sidebar（项目/标签/日历）」。
- **没有全局的左上角返回箭头。** iPhone 大纲页左上角是 **Sidebar 按钮**；Inspector 左上角才有 **Back**（回到 Outline 或 Sidebar）以及 Previous/Next（上一条/下一条）；历史前进后退在 **More 菜单**里的 Go Back / Go Forward（iPad 工具栏常驻 Back/Forward）。
- **底部的「tab bar」就是 Perspectives Bar**：Compact View 下横跨屏幕底部，放收藏的透视；Regular View（iPad/Mac）是屏幕左侧的竖向 tab 列（4.9 起在 iPadOS 27 上改为以 sidebar 形式显示）。
- **官方没有记载「侧滑返回」手势。** 手册明确记载的滑动手势只有：从**右缘向左滑**唤出 Inspector、行/侧栏行的左右滑操作、大纲内**两指上下滑**进入多选模式。没有找到可靠来源证明存在 iOS 式 interactive pop（左缘右滑返回），不要假设。
- **侧栏不是「上一层」，而是过滤器**：在 Sidebar 选中项目/文件夹/标签，会过滤当前 Outline；再点一次取消选择。顶部会出现「1 project selected ×」过滤条（截图可见）。
- **另一种「回退」是点当前透视 tab**：官方写明，若在大纲里滚动过或选中过条目，第一次点当前 tab 会清除选择并回到顶部，第二次才显示/隐藏 Sidebar。这不是系统返回手势，而是 tab 的复用。

### 证据

- 【官方】Compact View 定义：「Compact View shows each pane of OmniFocus individually, and can be thought of as navigating a series of stacked cards. You can switch between the Outline, Sidebar, and Inspector panes.」——[Glossary: Compact View](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/glossary/#compact-view)
- 【官方】Regular View 才同时显示 Outline + Sidebar + Inspector；iPhone 竖屏、窄窗口属于 Compact——[Glossary: Regular View](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/glossary/#regular-view)
- 【官方】4.0 发布说明：「Opening any perspective in OmniFocus 4 for iPhone brings you directly to your list of tasks, avoiding unnecessary navigation through your database structure.」——[OmniFocus 4 for iOS Release Notes](https://www.omnigroup.com/releasenotes/omnifocus-ios/4.0)
- 【官方】Perspectives Bar：「a column of tabs down the left side of the screen in Regular View, and across the bottom of the screen in Compact View」；展开时两行：上行 Quick Open / Search / Smart Add / Quick Entry，下行透视按钮；收起时只剩左右两个小工具条；滚动时自动收起、滚回顶部自动展开——[Perspectives: Perspectives Bar](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/perspectives/#perspectives-bar)
- 【官方】点当前 tab 的行为：第一次清除选择/回到顶部，第二次显示或隐藏 Sidebar——同上 Perspectives Bar
- 【官方】iPhone 工具栏只有 Sidebar / View Options / More Menu / Inspector；Go Back、Go Forward 在 More 菜单里；iPad 工具栏才有常驻 Back 和 Forward——[Toolbar: iPhone Toolbar](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/toolbar/#iphone-toolbar)、[Toolbar: iPad Toolbar](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/toolbar/#ipad-toolbar)
- 【官方】Inspector 顶部工具栏：「Back — Returns you to the Outline or Sidebar」；另有 Previous / Next 逐条切换；打开方式包括「Swipe from the trailing edge of the screen」——[Inspector Toolbars](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/inspector/#inspector-toolbars)
- 【官方】Compact View 下切透视默认「先显示 Outline」；可改为 `Show Project List first` / `Show Tag List first` / `Show Calendar first`——[Settings: Show Sidebar First](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/settings/#show-sidebar-first)
- 【官方】Sidebar 过滤 Outline：「By selecting items in the Sidebar, you can quickly navigate to parts of the Outline, while filtering to see only the information that you want to see right now.」——[Perspectives: Sidebar](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/perspectives/#sidebar)
- 【截图】大纲页左上角是 Sidebar 图标、右上角是「…」和 Inspector「i」，没有返回箭头：`assets/omnifocus-ios/iphone-01-projects-outline.jpg`
- 【截图】Sidebar 是整屏滑入的项目/文件夹列表（顶部 Edit）：`assets/omnifocus-ios/iphone-03-sidebar.jpg`
- 【截图】Quick Open 是从底部升起的 sheet（左上角 X 关闭）：`assets/omnifocus-ios/iphone-08-quick-open.jpg`

### 不确定 / 边界

- 【未找到】左缘右滑返回、左缘右滑打开 Sidebar：官方手册只写了用 Sidebar 按钮唤出；没有可靠图文/视频证明存在该手势。
- 【未找到】Quick Entry / Quick Open 是否支持下拉关闭：这是 iOS sheet 的常见行为，但官方未写，不能当事实。
- 【未找到】启动时是否恢复上次透视：官方未说明。

---

## 2. 首页（透视列表）长什么样

### 结论

- **OmniFocus 4 没有「首页」这个层级。** 应用直接进入某个透视的 Outline；最近似首页的是底部的 **Perspectives Bar**。
- **Perspectives Bar 是横向、可滚动、图标+标题的 tab 条**，不是宫格，也不是纵向列表；默认放大多数标准透视（不含 Completed / Changed），收藏与排序在 **Perspectives Settings** 里配置——那才是一个**纵向列表**（每行一个透视，带收藏星标、拖拽手柄）。
- **iPad 的 Regular View 里，Perspectives Bar 是左侧竖向 tab 列**（4.9+ 在 iPadOS 27 上以 sidebar 形式呈现），旁边通常还有项目/标签 Sidebar。
- **OmniFocus 3 才是「Home + 透视磁贴」**：Home 是导航树顶端，透视以 tile 呈现（Forecast 是通栏 tile，带角标）；compact 下长按 Back 可回 Home。OF4 把这个 Home 整个去掉了。

### 证据

- 【官方】「By default, the Perspectives Bar includes most Standard Perspectives, except for Completed and Changed.」；超出屏宽可滚动；每个 tab 是按钮，长按出 Shortcut Menu——[Perspectives Bar](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/perspectives/#perspectives-bar)
- 【官方】Perspectives Settings：收藏星标 + 拖拽排序，列出所有透视——[Settings: Perspectives Settings](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/settings/#perspectives-settings-iphone-ipad-apple-vision-pro)
- 【官方】「Opening any perspective ... brings you directly to your list of tasks」——[Release Notes 4.0](https://www.omnigroup.com/releasenotes/omnifocus-ios/4.0)
- 【官方】Ken Case 在 OF4 TestFlight 公告里写：「your interaction should be centered on lists of tasks (really outlines)—not based around navigation (like the old iPhone home screen) or on inspector screens showing individual tasks.」——[Welcome to the OmniFocus 4 TestFlight!](https://www.omnigroup.com/omnifocus/omnifocus-4-testflight-welcome)
- 【官方·OF3】「Home is your headquarters in OmniFocus, the top level of navigation... In compact views, Home is at the top of the navigation tree... Tap and hold Back to return Home」；「perspective tiles」「full-width Forecast tile」——[OF3: Home and the Sidebar](https://support.omnigroup.com/documentation/omnifocus/ios/3.11/en/home-and-the-sidebar/)
- 【截图】底部 tab 条（图标+文字，含 Projects/Tags/Forecast/Flagged）：`assets/omnifocus-ios/iphone-04-forecast.jpg`；另一组收藏透视：`assets/omnifocus-ios/iphone-06-perspective-list.jpg`
- 【截图】iPad 左侧竖向透视列 + 项目 Sidebar + 大纲三栏：`assets/omnifocus-ios/ipad-01-regular-view.jpg`

---

## 3. Forecast（预测）页结构

### 结论

- **手机主视图 = 顶部横向日期条 + 下方按日期/分组的任务列表。** 官方把日期条叫 **「Piano Keys」**：`Past` + 中间若干天 + `Future`，每个日期 tile 显示条目数，下面用红/黄/灰圆点表示 Overdue / Due Soon / 其他。
- **不是周视图，也不是月视图网格。** 日期条显示多少天「取决于设备能放多少」（`as many days as fit on the device`）；iPhone 竖屏截图中是 7 个 tile（Past + Today + 5 天 + Future），仅作观察。
- **月历在 Forecast 的 Sidebar 里**：整月日期格 + 每天条目数（官方描述为 `a tile for each date in the next month`）。iPhone 上可通过 Sidebar 打开；设置 `Show Calendar first` 可让进入 Forecast 时先显示这个月历。
- **日历事件与任务的关系**：`Flexible` 结构下（OF4 新增；`Organized` 是 OF3 及更早的默认），日历事件与任务混排在同一个列表里；`Organized` 结构下按类型分节（Due / Planned / Deferred / Calendar Events / Flagged / Tagged 等）。`Preserve Hierarchy` 默认开启，项目和 action group 可以在 Forecast 里折叠/展开。
- **新建**：先点某个日期 tile，再 Smart Add / New Action；默认给 **Due Date**，可在 `Add or Drag to Assign` 里改成 Defer / Planned。拖任务到日期 tile 也能改期（接硬件键盘时可按住修饰键指定 Due/Defer/Planned；触屏则用当前 `Add or Drag to Assign` 设置的类型）。

### 证据

- 【官方】「The date tiles across the top of the Forecast Outline (we refer to this set of date tiles as the 'Piano Keys') display a range of dates, with a tile for Past, a tile for Future, and a tile for each day in between, with as many days as fit on the device that you are using.」——[Perspectives: Forecast](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/perspectives/#forecast)
- 【官方】「The Forecast Sidebar displays a calendar, with a tile for Past, a tile for Future, and a tile for each date in the next month.」——[Forecast Sidebar](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/perspectives/#forecast-sidebar)
- 【官方】`Show Calendar first (iPhone)` 是 Forecast 的 Layout 设置；`Keep Sidebar Hidden` 是 Mac/iPad 的对应项——同上「Forecast View Options」
- 【官方】Flexible / Organized、Preserve Hierarchy、Keep Sorted——[Forecast Outline](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/perspectives/#forecast-outline)
- 【截图】iPhone Forecast：Past/Today/Fri/Sat/Sun/Mon/Future 日期条 + Past/Today 分节 + 日历事件混排：`assets/omnifocus-ios/iphone-04-forecast.jpg`
- 【截图】iPad Forecast：左侧整月日历格（带每日计数），右侧同样的日期条 + 列表：`assets/omnifocus-ios/ipad-02-forecast-calendar.jpg`

### 边界

- 日期条在 iPhone 上的确切天数取决于机型/字号/横竖屏，官方只给了「能放多少放多少」，不要写死为「7 天」。
- 月历只显示计数与圆点，不显示日历事件块（事件在右侧列表里）；这是从截图与手册描述得到的结论。

---

## 4. 项目列表、项目详情与任务大纲

### 结论

- **项目列表就是 Projects Outline 的行**：项目是行，不是卡片；文件夹行可选显示。项目行带 disclosure 箭头，展开后子任务以**缩进层级**出现在同一列表里（截图可见；手册也说明 Projects Outline 同时包含项目与其 actions）。
- **没有「项目详情页」这种 push 页面。** 项目属性（状态、类型、日期、Review、备注等）在 Inspector；从 Sidebar 选中项目会把 Outline 过滤成该项目的内容，顶部出现过滤条（截图里的「1 project selected ×」）。
- **任务是纵向缩进大纲**：`项目 → action group → action` 用缩进表达；action group 用**粗体**区分；行尾有 disclosure 箭头。**子任务/项目可以折叠**：OF4 新增 action group 可展开/折叠；More 菜单有 Expand All / Collapse All；侧栏的文件夹、标签组也能折叠。
- **行不是纯文本**：默认一行显示 Status Circle + 标题 + Project/Tags/Due/Flag/Note 图标；选中行后就地展开编辑字段（Fluid Layout）。项目行**没有**状态圆圈（防止误完成）。
- **iPhone 与 iPad 的差异只在「pane 是否同屏」**：iPhone 一次看 Outline；iPad Regular View 同时看 Sidebar + Outline + Inspector。大纲本身的结构一致。

### 证据

- 【官方】「The Projects Outline displays a list of your projects, and the actions they contain... The relationships ... are represented in the Outline by levels of indentation.」——[Perspectives: Projects Outline](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/perspectives/#projects)
- 【官方】「Action groups can now be expanded or collapsed in the task outline」——[Release Notes 4.0](https://www.omnigroup.com/releasenotes/omnifocus-ios/4.0)
- 【官方】行默认字段、选中行后就地编辑、Note 行内展开、Action Group 粗体、项目无 Status Circle——[The Outline: Outline Rows](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/outline/#outline-rows)、[Row Layout](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/outline/#row-layout)、[Status Circle](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/outline/#status-circle)
- 【官方】iPhone 上选中行后出现 Flag、Attachment 按钮；4.8+ 用屏幕上方 checkmark 结束编辑——同上 Outline Rows
- 【官方】Sidebar 选中过滤 Outline；再次点选取消——[Perspectives: Sidebar](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/perspectives/#sidebar)
- 【截图】项目头 + 缩进任务 + 行内展开的 Defer/Planned/Due/Note + 顶部「1 project selected」：`assets/omnifocus-ios/iphone-01-projects-outline.jpg`
- 【截图】iPad 三栏：左侧项目树、中间「项目 → 任务」大纲、右侧 Inspector：`assets/omnifocus-ios/ipad-01-regular-view.jpg`

### 边界

- 「项目行展开后显示子任务」与「从 Sidebar 选中项目后大纲被过滤」是两条都成立的路径；截图中同时出现了过滤条和展开的项目行。不要把它理解成「项目详情页」。
- 官方没有把 iPhone 上的项目行称作「header」；唯一的页头是透视名 + 计数（`Projects / 8 actions, 1 project`）。

---

## 5. 快速录入（Quick Entry / 新建）

### 结论

- **iOS 上有两条快速录入路径**：
  1. **Quick Entry**：底部 Perspectives Bar 的 Quick Entry 按钮 → 覆盖式表单（sheet/卡片），顶部 **Cancel / Save**，右下角 **Smart Add「+」** 可连续添加下一条。**只在 OmniFocus 前台可用**（Mac 才能全局唤起）；系统级捕获走 Share Sheet / Widget / Siri / Shortcuts。
  2. **Smart Add**：底部栏的「+」，在扁平列表里**直接在 Outline 里插一行**；在嵌套视图里会改为打开 Quick Entry；长按「+」可拖到 Outline 任意位置。
- **不是「键盘上方快捷条」**：官方没有描述 input accessory bar，截图中也没有；就是一张可滚动的表单，键盘在下方。键盘弹出时 Perspectives Bar 会收起（即使 `Always` 模式也如此，官方写明 `unless the on-screen keyboard is displayed`）。
- **字段同屏、纵向列表式，不是逐项向导**：标题行（状态圈 + 标题 + Flag）→ Project → Tags → Defer → Planned → Due → Note（截图顺序）；iPad 截图还能看到 Repeat。字段可在 View Options 里增删/改顺序；每个字段点进去是独立选择器/日期控件（日期支持自然语言、`+1d/+1w/+1m`、日历图标）。
- **Inspector 不是 Quick Entry**：Inspector 是编辑「已选中条目」的独立 pane（Compact 下整屏，顶部 Back / Previous / Next），字段更多（Status、Project Type、Review、Time Zone、Completed/Dropped Date 等），用于批量编辑和不常用字段。

### 证据

- 【官方】Quick Entry 定义、Save/Cancel、Smart Add「+」、View Options、各平台入口（iPhone 从 Compact Perspectives Bar）——[Capture: Quick Entry and Smart Add](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/capture/#quick-entry-and-smart-add)
- 【官方】Smart Add 仅在扁平列表直接插入；否则打开 Quick Entry；长按拖动定位——同上
- 【官方】「Quick Entry is available on all devices while OmniFocus is the active app or window」——同上
- 【官方】Compact 下 Inspector 是独立 pane，顶部 Back / Previous / Next；字段清单与批量编辑——[Inspector: Properties](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/inspector/#properties)
- 【截图】Quick Entry 表单：Cancel / Save、标题+圈+Flag、Project/Tags/Defer/Planned/Due/Note、右下「+」、键盘：`assets/omnifocus-ios/iphone-02-quick-entry.jpg`
- 【截图】Inspector 整屏：Back + 上/下箭头、Defer/Planned/Due/Repeat/Note、日期行内 `+1d/+1w/+1m`：`assets/omnifocus-ios/iphone-05-inspector.jpg`
- 【截图】iPad 上的 Quick Entry 是居中 modal 卡片：`assets/omnifocus-ios/ipad-01-regular-view.jpg`（同页背景）

### 边界

- 官方没有把 Quick Entry 描述为「bottom sheet」；截图显示它是接近全屏的 sheet。用「覆盖式表单/sheet」描述，不要写死为「底部半屏面板」。
- 字段默认集合随 View Options 变化；截图是官方营销图，字段顺序以手册的 Properties 清单为准。

---

## 6. 完成 / 推迟的手势

### 结论

- **完成：点状态圆圈**（Active → Completed；再点回 Active）。这是主路径。辅助路径：硬件键盘 Space；长按行 → Complete / Skip / Drop；Widget 上直接完成。
- **推迟（Defer / Planned / Due）：没有滑动手势。** 三条路径：
  1. 点行，就地编辑 Defer / Planned / Due 字段；
  2. 长按行 → Shortcut Menu → **Schedule** 子菜单：`Due Today` / `Due Tomorrow` / `Defer until Tomorrow` / `Plan for Today` / `Plan for Tomorrow` / `Reschedule to Today/Tomorrow`；
  3. Inspector 的日期字段（自然语言、+1d/+1w/+1m）。
- **滑动用于行操作**：侧栏行**左滑**露出 Select / Delete，**右滑**露出 Flag / Forecast Tag；大纲行**右滑 Flag**（Flagged 一节明确）。OF3 手册明确「大纲行左滑删除」；OF4 手册没有逐条列出，按 OF3 行为推断仍保留（未实机验证）。
- **长按 = 快捷菜单 / 拖拽抬起**：长按行会先「lift off」；不移动直接松手就出 Shortcut Menu。**不是**长按完成。
- **其他手势**：大纲顶部**下拉 = Clean Up**；两指上下滑 = 进入多选模式（Select Mode）。

### 证据

- 【官方】Status Circle 点击完成/恢复；Space 完成；Option+Space Drop；Status Circle 的颜色/旗标/重复点——[Outline: Status Circle](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/outline/#status-circle)
- 【官方】长按 = Shortcut Menu（与拖拽同一个 lift 手势）；菜单含 Complete / Skip / Drop / Schedule（Defer until Tomorrow 等）——[Commands: Shortcut Menus](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/commands/#shortcut-menus)
- 【官方】侧栏行左滑 Select/Delete、右滑 Flag/Forecast Tag——[Perspectives: Sidebar](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/perspectives/#sidebar)
- 【官方】「swipe from left to right (on iPhone, iPad, or Apple Vision Pro)」来 Flag——[Perspectives: Flagged](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/perspectives/#flagged)
- 【官方】两指上下滑进入 Select Mode；下拉 Clean Up——[Outline Select Mode](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/outline/#outline-select-mode)、[Toolbar: Clean Up](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/toolbar/#clean-up)
- 【官方·OF3】「Swipe an action or Inbox item row from right to left to delete it. Swipe ... from left to right to flag ...」——[OF3: Useful Gestures](https://support.omnigroup.com/documentation/omnifocus/ios/3.11/en/gestures-and-keyboard-shortcuts/)

### 边界

- 【推断】「左滑删除大纲行」在 OF4 手册中没有单独条目，只有 OF3 手册明确；按 OF3 行为保留。
- 没有「滑动完成」「滑动推迟」的官方依据。

---

## 7. 标签（Tag）在 iOS 上怎么选

### 结论

- **入口**：行内 Tags 字段（Fluid Layout 默认显示）或 Inspector 的 Tags 字段。
- **交互**：点字段 / 「Add tag」→ 弹出**可搜索的标签列表**（输入即过滤）；可以**新建标签**（输入新名字 → Create “new tag”）并立即赋给当前条目；**一个条目可以有任意多个标签**，已选的以 chips 显示；长按已选标签 → Go To / Remove。
- **不要假设它是勾选式多选**：官方只描述了「列表 + 输入过滤 + 逐个添加 + 可新建」，没有描述 checkbox 多选控件。批量编辑时 Inspector 会显示所有选中项标签的并集（都有的显示更强），改一次应用到全部。
- **Tags 透视**：层级标签树在 Sidebar；Outline 按标签分组；Tag Group 可设置 Mutually Exclusive 等行为。

### 证据

- 【官方】Tags Inspector：「tapping the Add tag button will present the same list... Entering text ... filtered list... create a new tag... An item can have as many assigned tags as you like... touch and hold ... Go To / Remove」——[Inspector: Tags](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/inspector/#tags-and-tag-groups)
- 【官方】批量选择时标签并集与「更强外观」——同上
- 【官方】Tags 透视与 Tag Group / Mutually Exclusive——[Perspectives: Tags](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/perspectives/#tags)、[Glossary: Mutually Exclusive Tags](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/glossary/#mutually-exclusive-tags)
- 【截图】行内标签 chips（如 Computer / High）：`assets/omnifocus-ios/iphone-01-projects-outline.jpg`

### 边界

- 【未找到】标签选择器的具体控件形态（是否复选、是否分组折叠、是否 sheet）：官方未描述，截图也未展示打开状态。不要照搬「复选列表」的说法。

---

## 8. OmniFocus 4 相较 3 在手机端最大的交互变化

### 结论

**最大变化：从「以导航为中心」改成「以大纲为中心」。** Ken Case 的原话是：交互应围绕任务列表（本质是大纲），而不是围绕导航（像旧 iPhone 首页那样）或围绕单条任务的 Inspector 页面。具体落点：

| 维度 | OmniFocus 3（iOS） | OmniFocus 4（iOS） |
|---|---|---|
| 顶层 | Home + 透视磁贴（tile） | 无 Home；底部 Perspectives Bar |
| 进入透视 | 点 tile → 列表；Projects/Tags/Review 先在 Sidebar 库里逐层导航 | 直接进 Outline；Sidebar 默认隐藏，按需召唤 |
| 返回 | 左上角 Back；长按 Back 回 Home | 无全局 Back；Sidebar 按钮 + 过滤条 + More 里的 Go Back/Forward；Inspector 内有 Back |
| 编辑任务 | 点条目 → 详情/Inspector | 点行就地编辑（Fluid Layout），详情页被弱化 |
| 层级 | 项目/文件夹可折叠，但 Action Group 不可（4.0 才新增） | Action Group / 项目都可折叠；Forecast 保留层级 |
| 导航工具 | 无 Quick Open | Quick Open（底部栏入口，⌘O） |
| 底栏 | Home 底栏：Undo / New Inbox Item 等 | Perspectives Bar：Quick Open / Search / Smart Add / Quick Entry + 透视 tab |
| Inspector | 多标签页式 | 单页可自定义字段顺序，整屏 pane |

- **第二大的变化是「层级展示位置」**：项目/标签树从「导航路径」变成「Sidebar 过滤器」，你不再需要一层层进文件夹才能看到任务。
- **第三是 Forecast 的结构**：OF4 新增 Flexible（单一可手动排序列表）与 Preserve Hierarchy（项目/组可折叠），OF3 是固定分节的 Organized。

### 证据

- 【官方】Ken Case 原文（见第 2 节）——[TestFlight Welcome](https://www.omnigroup.com/omnifocus/omnifocus-4-testflight-welcome)
- 【官方】4.0 发布说明的 Navigation / Outline / Perspectives Bar / Sidebar / Quick Open / Back & Forward 条目——[Release Notes 4.0](https://www.omnigroup.com/releasenotes/omnifocus-ios/4.0)
- 【官方·OF3】Home、tile、compact 下「tap an item to open its detail view」「Tap and hold Back to return Home」「layered stack」——[OF3: Home and the Sidebar](https://support.omnigroup.com/documentation/omnifocus/ios/3.11/en/home-and-the-sidebar/)
- 【官方·OF3】手势与快捷键（滑动删除/Flag、长按菜单）——[OF3: Gestures](https://support.omnigroup.com/documentation/omnifocus/ios/3.11/en/gestures-and-keyboard-shortcuts/)
- 【二手】少数派 2023-12-21 实机评测：确认「无需点详情、行内编辑」「底部常驻 Perspective 列表」「Quick Open 下放」——[少数派：OmniFocus 4](https://sspai.com/post/68428)（注意该文有一处把 Mac 的列视图写成 iOS 也有，属错误，只作旁证）

---

## 9. 窄栏（420px 宽、无弹窗层级限制）适配结论

### 9.1 先明确 420px 的约束

- 420px 接近 iPhone 竖屏的 Compact 宽度（约 390–440pt），所以 **OF4 的 Compact 模式是最贴近的参照**：一次只显示一个 pane，Sidebar / Inspector 覆盖式出现。
- 但窄栏**没有 iOS 的弹层限制**：可以用 popover、右键菜单、hover、键盘、可拖拽抽屉、多选面板；不必把 Quick Entry 做成全屏 sheet，也不必把 Inspector 做成整屏。
- 420px 的稀缺资源是**横向空间**，不是纵向空间。因此任何「左右并排三栏」都不现实；**纵向滚动 + 覆盖层**是主舞台。

### 9.2 三个结构选项与代价

| | 选项 A：逐层 push | 选项 B：透视 tab + 滑动 pane | 选项 C：全宽展开的大纲 |
|---|---|---|---|
| 结构 | 透视列表页 → 任务列表页 → 任务详情页，单列堆栈，左上角返回 | 底部/顶部透视 tab 常驻；大纲为主；Sidebar 从左覆盖、Inspector 从右覆盖；行内编辑 | 单一大纲：项目/任务/子任务全部在同一滚动列表，就地展开；无详情页；Inspector 仅作浮层 |
| 首屏 | 透视列表 | 当前透视大纲（可配置默认透视） | 大纲 |
| 到「改某任务的标签」 | 3 次点击 + 2 次返回 | 0–1 次切透视 + 点行 + 点标签字段 | 点行 + 点标签字段 |
| 优点 | 心智模型最简单；返回栈清晰；实现/状态成本最低；适合新手和低频用户 | 最接近 OF4；切换快、捕获快；大纲始终是主角；适合高频 triage | 最省横向空间；信息密度最高；没有「跳走再回来」的上下文丢失；适合键盘/鼠标 |
| 代价 | 导航深度大；跨项目上下文丢失；capture/triage 慢；Omni 在 OF4 已明确转向的模型 | 底部 tab 占 56–72px；两个覆盖层状态 + 焦点管理；隐藏功能发现性差；手势与行操作可能冲突 | 长滚动、密度高；稀有字段（Review、Repeat、Time Zone）发现性差；批量编辑要另设选择模式；误触风险；项目级信息需要额外位置 |
| 适合 | 低频、流程固定、以「处理」为主的场景 | 高频、捕获+切换多、接近手机体验 | 高频、键盘用户、以「执行」为主 |

### 9.3 我的建议：B + C 的混合，不做 A

**大纲即主页（C 的主体）+ 透视 tab（B 的切换）+ 覆盖式 Sidebar / Inspector（B 的 pane）**。理由：

1. OF4 的核心教训是「列表即工作台」；420px 下 push 一层就少一层上下文，返回成本比宽屏更高。
2. 420px 放不下并排三栏，但**覆盖层不受限**：Sidebar 用 popover/抽屉（约 320–360px），Inspector 用右侧抽屉（约 360–420px），Open 时遮住大纲而不是挤压它。
3. 透视切换用**底部 5 个 tab + More**（Inbox / Projects / Forecast / Flagged / Review），或桌面场景用左侧 44–48px 图标 rail；两者都只占一个维度。
4. 行内编辑做成**展开卡片**：标题、状态圈、Project、Tags、Defer/Planned/Due、Note；点字段弹 popover（标签多选、日期快捷 +1d/+1w/+1m、项目搜索）。这直接对应 OF4 的 Fluid Layout，但比手机更适合指针。
5. 项目不设详情页：项目行可折叠，选中后 Inspector 抽屉显示项目属性；Sidebar 选中项目 = 过滤大纲（顶部过滤 chip 可清除）。
6. Forecast 用**粘性横向日期条 + 分节列表**；月历放 popover（点日期条左侧日历图标），不要在主栏里塞月网格。
7. 手势只做增强，不做唯一路径：点圆圈完成、右键/长按菜单、hover 显示操作；不依赖滑动。

**代价**：需要认真设计「当前透视 / 过滤 / 选中行 / 打开哪个抽屉」这四个状态，以及键盘焦点与 Esc 关闭顺序；覆盖层容易挡住上下文，需要半透明遮罩 + 明确关闭。相比 A，前期交互设计成本更高；相比纯 C，多一层 tab/抽屉的状态管理。

### 9.4 420px 下的具体尺寸建议（【推断】，非 Omni 事实）

- 顶栏 44px：透视名 + 计数 + 搜索 + More；不超过 4 个图标。
- 透视 tab 56px（图标 24 + 文字 10–11px）；5 个 tab 在 420px 下每个约 84px，够放「Inbox / Projects / Forecast / Flagged / More」。
- 行高 44–56px；状态圈点击区 ≥44px；元数据 chips 最多 2–3 个，超出收进「…」。
- Inspector 抽屉 360px（留 60px 大纲可见）或全宽 420px（专注编辑）；Sidebar 抽屉 320px。
- 标签 popover：搜索框 + 分组列表 + 新建；多选以 chips 回填，不占行高。
- 日期 popover：今天/明天/下周 + 日历 + 清除；`+1d/+1w/+1m` 作为快捷按钮。

---

## 10. 来源清单与未决问题

### 10.1 一手来源

- OmniFocus 4 Reference Manual（4.10）：[Contents](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/contents/)、[Welcome / New in OmniFocus 4](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/welcome/)、[Perspectives](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/perspectives/)、[The Outline](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/outline/)、[The Inspector](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/inspector/)、[Capture](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/capture/)、[Toolbar](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/toolbar/)、[Settings](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/settings/)、[Glossary](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/glossary/)
- [OmniFocus 4 for iOS Release Notes 4.0](https://www.omnigroup.com/releasenotes/omnifocus-ios/4.0)；[4.10](https://www.omnigroup.com/releasenotes/omnifocus-ios/)
- [Welcome to the OmniFocus 4 TestFlight!（Ken Case，2021-05）](https://www.omnigroup.com/omnifocus/omnifocus-4-testflight-welcome)
- [App Store: OmniFocus 4（4.10，2026-10-22）](https://apps.apple.com/us/app/omnifocus-4/id1542143627)
- [官方视频页：What's New in OmniFocus 4](https://www.omnigroup.com/video/set/omnifocus-4/whats-new-in-omnifocus-4/)（未逐帧核对）
- OmniFocus 3 Reference Manual for iOS 3.11：[Home and the Sidebar](https://support.omnigroup.com/documentation/omnifocus/ios/3.11/en/home-and-the-sidebar/)、[Gestures and Keyboard Shortcuts](https://support.omnigroup.com/documentation/omnifocus/ios/3.11/en/gestures-and-keyboard-shortcuts/)

### 10.2 二手（仅旁证）

- [少数派：设计优化、功能更强，时隔五年的大更新：OmniFocus 4（2023-12-21）](https://sspai.com/post/68428)（有一处列视图错误）
- [Learn OmniFocus：What's New in OmniFocus 4.0 for iPhone & iPad](https://learnomnifocus.com/tutorial/whats-new-in-omnifocus-4-for-iphone-and-ipad/)（视频教程，未逐帧核对）

### 10.3 未找到可靠来源（不要臆断）

1. 左缘右滑返回 / 左缘右滑打开 Sidebar 的手势。
2. Quick Entry / Quick Open 能否下拉关闭。
3. 标签选择器是否复选式、是否分组折叠。
4. 启动是否恢复上次透视。
5. Perspectives Bar 是否是原生 `UITabBar`（只能确认它叫 Perspectives Bar、外观与行为如上）。
6. 官方视频的具体旁白内容（本环境无法访问 Vimeo）。

### 10.4 截图索引（App Store 4.10 官方截图，已存档）

| 文件 | 内容 |
|---|---|
| `assets/omnifocus-ios/iphone-01-projects-outline.jpg` | iPhone Projects 大纲：项目行 + 缩进任务 + 行内 Defer/Planned/Due/Note + 底部 Perspectives Bar + 顶部过滤条 |
| `assets/omnifocus-ios/iphone-02-quick-entry.jpg` | iPhone Quick Entry：Cancel/Save、标题+圈+Flag、Project/Tags/Defer/Planned/Due/Note、Smart Add「+」、键盘 |
| `assets/omnifocus-ios/iphone-03-sidebar.jpg` | iPhone Sidebar：整屏滑入的项目/文件夹列表 + Edit |
| `assets/omnifocus-ios/iphone-04-forecast.jpg` | iPhone Forecast：Piano Keys 日期条 + 分节列表 + 日历事件混排 + 底部 tab |
| `assets/omnifocus-ios/iphone-05-inspector.jpg` | iPhone Inspector：Back + 上/下、日期行 +1d/+1w/+1m、Repeat、Note |
| `assets/omnifocus-ios/iphone-06-perspective-list.jpg` | iPhone 自定义透视大纲（High Priority）+ 另一组底部 tab |
| `assets/omnifocus-ios/iphone-07-review.jpg` | iPhone Review：项目标题 + 任务 + Mark Reviewed + 上/下个项目 |
| `assets/omnifocus-ios/iphone-08-quick-open.jpg` | iPhone Quick Open sheet：搜索框 + 透视/项目/标签列表 + 角标 |
| `assets/omnifocus-ios/ipad-01-regular-view.jpg` | iPad Regular View：左侧透视列 + 项目 Sidebar + 大纲 + Inspector；Quick Entry 居中 modal |
| `assets/omnifocus-ios/ipad-02-forecast-calendar.jpg` | iPad Forecast：整月日历格 + 日期条 + 列表 |
