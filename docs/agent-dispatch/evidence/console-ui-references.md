# 底座控制台整页布局：现代控制台参照研究

> 状态：只读调研证据，不作最终布局决策；三个方案供设计评审挑选。
> 访问日期：**2026-11-24**。文末来源列表中的 URL 均在该日访问；产品 UI 会持续迭代，引用的是当日官方文档的描述。
> 范围：Temporal Web UI、Trigger.dev、n8n executions、Grafana、Railway、Vercel、GitHub Actions、Windmill 共 8 个产品的控制台/仪表盘，聚焦「整页骨架、状态呈现、实时性、事件历史/日志展示、设置页位置」五个维度。
> 标注：**事实**有一手来源（官方文档或官方仓库源码）；**推断**是研究者基于事实对布局的还原或适配判断，不是产品承诺。官方文档未描述的视觉细节标为「未找到」，不靠截图或印象补齐。
> 方法限制：只读官方文档正文，未逐像素审看截图；Temporal 新版 UI「Nimbus」的独立文档本次未找到，只以官方 *Temporal Web UI* 文档页为准；Argo Workflows 因官方 UI 文档不足以支撑六个维度，被 Windmill 替换。
> 项目边界：沿用 [agent-dispatch 总览](../overview.md) 与 [底座细节](../foundation.md)——控制台是 DSH 桌面端（类 IDE 三栏）中栏里的整页，一期四分区 Gateway / 节点 / 事件 / Graph；Gateway 设置 UI 在本机模式与远程模式之间二选一，本机模式管理 Gateway 进程的启动/重启/停止与运行状态。

## 1. 简短结论

1. **「列表 → 详情」是 8 个产品的共同骨架，差别只在详情用什么承载（事实）。**Temporal、n8n、Windmill、GitHub Actions、Railway 都是点列表项后**跳页/覆盖层**进入详情；Vercel 与 Grafana 则把日志详情放在**右侧 sidebar**，保持列表不消失。[T1][N4][W2][H1][R3][V1][F4]
2. **事件历史的事实标准是「可切换粒度」而不是单一视图（事实）。**Temporal 的 History tab 提供 Timeline / All / Compact / JSON 四种视图切换，顶部固定一行执行 metadata（起止时间、Duration、Run Id、Type、Task Queue、State Transitions）。[T1] Grafana Logs panel 则用「可折叠行 + 侧栏/内联 details + Prettify JSON」实现同样的分层。[F4]
3. **异常突出靠「预置异常视图 + 阈值自动打标」，不只靠颜色（事实）。**Temporal 内置 Task Failures view，连续 5 次 task 失败/超时自动打 `TemporalReportedProblems` 标签、恢复即清除；[T1] GitHub Actions 进入 job 日志时失败步骤自动展开；[H2] Windmill 在聚合时间序列上用绿/红点区分成功/失败。[W2]
4. **实时流都有「跟随 vs 暂停」的显式语义（事实）。**Grafana Explore 的 Live 按钮走 WebSocket tail，Logs panel 有 Newest/Oldest first、infinite scrolling、跳到首/末行；[F2][F4] Vercel 非 Live 时底部出现「Show New Logs」按钮手动追加；[V1] Railway 日志过滤用 `/` 聚焦、Enter 应用。[R3]
5. **键盘友好普遍是「Cmd/Ctrl+K 命令面板 + 两段式导航键 + `/` 聚焦过滤 + Escape 逐层返回」（事实）。**Railway 的 `G then D/V/M/S` 跳 service 四个 tab、Escape 回 canvas；[R3] Grafana 的 `?` 显示快捷键、`d+e` 展开全部行、`d+k` kiosk、Ctrl+K 命令面板。[F5]
6. **设置页与监控视图的关系分两派（事实）。**Temporal、Vercel、Grafana、Windmill 把设置放在与监控并列的独立顶层入口；[T1][V2][F3][W2] 只有 Railway 把 Settings 作为 service view 的一个 tab 与 Metrics/Deployments 并列。[R1]
7. **对底座控制台的直接含义（推断）：**Graph 分区与 Temporal 的「Workflow 列表 → Execution 详情 → History 四视图」几乎同构，是最该照抄的部分；Gateway 分区更像 Railway 的 service view（状态 + 动作 + 日志在同一面板），而不是一个列表。

## 2. 调研对象与来源

| 产品 | 主要来源类型 | 本次读到的页面 |
|---|---|---|
| Temporal Web UI | 官方文档（Docusaurus） | *Web UI*、*Event History*、*Workflow Execution*（状态枚举） |
| Trigger.dev | 官方文档（Mintlify）+ OpenAPI | *Runs*、*Logging, tracing & metrics*、*Dashboards*、*List dashboards* API |
| n8n | 官方文档（GitBook） | *Understand executions* 及其三篇子页 |
| Grafana | 官方文档 | *Dashboards*、*About Grafana*、*Loki query editor*、*Logs* panel、*Use dashboards*（快捷键） |
| Railway | 官方文档 | *Keyboard shortcuts*、*Logs*、*The basics* |
| Vercel | 官方文档 | *Runtime Logs*、*Deployments overview* |
| GitHub Actions | 官方文档 | *Using the visualization graph*、*Using workflow run logs* |
| Windmill | 官方文档 | *Jobs*、*Jobs runs*（Runs 页） |

## 3. 逐产品分析

### 3.1 Temporal Web UI

**1. 整体骨架（事实）。** Namespaces 列在窗口**左侧**区域；也可在 Workflows 视图右上角的 Namespace switcher 切换。选中 Namespace 后进入 Recent Workflows 页：一张**表格**，可按 Status、Workflow ID、Type、Start/End time 及任意 Search Attribute 过滤。点一行进入 Workflow Execution **详情页**（跳页），详情页是 tab 式：History、Workers、Relationships、Pending Activities、Queries、Metadata、Call stack。另有 Schedules 页：列表 → 点开看频率与近期/未来运行。[T1]

**2. 状态呈现（事实）。** 状态枚举两组：Open（Running / Paused）与 Closed（Cancelled / Completed / Continued-As-New / Failed / Terminated / Timed Out）。[T2] 异常突出：Saved Views 里内置 **Task Failures view**，系统实时监测，连续 5 次 workflow task 失败或超时即自动打标，一次成功即清除——这是一个「异常专用预置视图」而非单纯彩色 badge。[T1] 空状态：Workers tab 若无 worker 在轮询，直接显示 error。[T1]

**3. 实时性。** 文档明确说 task failure 打标是 real-time 监测；Workflows 列表在切换 Saved View 时整页刷新。[T1] 列表是否推送自动滚动、有无暂停/跟随：**未找到**。

**4. 事件历史展示（事实）。** History tab 四种视图可切换：**Timeline**（按时间或倒序列出事件 + 摘要，点开单个事件看全部字段）、**All**（全部事件）、**Compact**（按 Activity / Signal / Timer 逻辑分组）、**JSON**（完整 JSON）。顶部固定执行 metadata（Start/Close Time、Duration、Run Id、Type、Task Queue、Parent、SDK、State Transitions）；Input and Results 区显示入参与返回值。整个 History 可下载 JSON、导入本地 UI 查看。Relationships tab 以**树形**显示 parent/child 全层级；Metadata tab 列出带 User Metadata 的事件，作为「human-readable log」。[T1] 事件历史本身是「Workflow Execution 生命周期内所有事的完整持久日志」，约 40 种事件类型。[T3]

**5. 设置页位置（事实）。** Temporal Cloud 的 **Settings** 是顶层入口，仅 Account Owner / Global Admin 可见，管理用户与 Observability、Audit logging 等集成；self-hosted 则**没有 UI 设置**，全部走 server configuration。[T1]

**6. 一句话。** 最值得抄：History 的 **Timeline / All / Compact / JSON 四视图切换 + 顶部固定 metadata 带**，以及 Task Failures 的「阈值打标、恢复自清」异常视图。最该避免：**列表 → 整页详情 → 返回**的跳页式导航——在 IDE 中栏的宽度与上下文里会丢失列表位置。

### 3.2 Trigger.dev

**1. 整体骨架（事实 + 未找到）。** Dashboard 有**左侧 sidebar**（文档：「In the sidebar click the + icon next to "Dashboards"」）；[G3] Runs 是核心对象，`runs.list()` 可按 status / task / version / tag / batch / schedule 过滤；[G1] Realtime 提供 `runs.subscribeToRun` 让单 run 视图持续更新。[G1] 列表与详情是两栏还是跳页：**未找到**。

**2. 状态呈现（事实）。** Run 状态明确分三组：**Initial**（Pending version / Delayed / Queued / Dequeued）、**Execution**（Executing / Waiting）、**Final**（Completed / Canceled / Failed / Timed out / Crashed / System failure / Expired）；SDK 据此提供 `isQueued` / `isExecuting` / `isWaiting` / `isCompleted` / `isFailed` / `isSuccess` 布尔助手——即状态在语义上先分「排队 / 执行 / 终态」三段，再细分。[G1] 一个 run 下有多个 **attempt**，各有 status、output 或 error。[G1] 空状态：Dashboard widget 显示「No data」被列为排障项。[G3]

**3. 实时性（事实）。** Realtime 订阅 run 更新；Dashboards 的 widget「automatically refresh to show the latest data」。[G1][G3] 日志流是否自动滚动/可暂停：**未找到**。

**4. 详情页展示（事实）。** **Run log** = logs + traces + spans 三合一，底层是 OpenTelemetry，自动 trace task trigger、attempt、HTTP 请求；推荐用结构化 `logger` 以便搜索；LLM 调用作为 span 带 token / cost / latency。[G2]

**5. 设置页位置（事实）。** API Keys 在 project dashboard 的独立 section；OIDC 连接（AWS / Azure / GCP 等）各有独立配置页；[G4] Dashboards 由 TRQL 查询驱动，widget 有 bignumber / chart / table 三类，可 `position: {x,y,w,h}` 放在 12 列网格上。[G3][G4]

**6. 一句话。** 最值得抄：**状态三段分组（排队 / 执行 / 终态）+ attempts 子层级 + run log 把日志与 span 合成一条流**。最该避免：Dashboards 的**可拖拽 12 列网格自定义 BI 面板**——对只有四个分区的运维控制台是过度设计。

### 3.3 n8n

**1. 整体骨架（事实）。** 一级导航 **Overview** 页下有 **Executions tab**（全实例）；若启用 projects，每个 project 内也有 Executions tab（项目内）。进入单个 workflow 后，编辑器**顶部菜单**也有 Executions tab。所以有两级执行列表：workflow-level 与 all。[N1][N2][N3] 详情的承载方式特别：选中一条执行后，失败的显示 **Debug in editor**、成功的显示 **Copy to editor**，n8n 把执行数据复制进当前 workflow 并 pin 在第一个节点——**详情不是独立面板，而是「回到画布回放」**。[N4]

**2. 状态呈现（事实）。** Status 筛选四值：Failed / Running / Success / Waiting。失败执行在三点菜单里有 **Retry execution**：「Retry with currently saved workflow」或「Retry with original workflow」。[N2] 执行数据可被 redaction 隐藏 input/output，但保留 status、timing、node names 等 metadata。[N1] 空状态：删除 workflow 会连带删除其 execution history，列表空是永久性的。[N2]

**3. 实时性。** 单 workflow 的 Executions 列表 retry 流程里有显式 **Refresh** 按钮——即手动刷新。[N3] 自动推送：**未找到**。

**4. 详情页展示（事实 + 推断）。** 执行详情包含 status、timing、node names、各节点 input/output 数据；[N1] 展示形式是**画布上的节点状态 + 节点数据面板**，不是时间线（推断，依据 [N4] 的「copies the execution data into your current workflow, and pins the data in the first node」）。

**5. 设置页位置（事实）。** Credentials 与 Workflow settings 都是独立顶层概念（*Create and edit credentials*、*Workflow settings* 页），与 Executions 监控分开。[N2][N4]

**6. 一句话。** 最值得抄：**两级执行列表（全局 Executions tab + 单 workflow Executions tab）**——正好对应我们「事件（全局流）」与「Graph 实例事件历史（局部）」的同构关系。最该避免：**详情不在独立面板、而是回灌画布回放**——对不想看图的用户不直观，且 Refresh 是手动的。

### 3.4 Grafana

**1. 整体骨架（事实）。** 两类页面并存：**Dashboards**（panels 组织进 rows 或 tabs 的网格，提供 at-a-glance 视图）与 **Explore**（ad-hoc 查询，支持 Split view 并排比较不同时间范围、查询、数据源）。[F1][F3] 有左侧 main menu 与顶部导航栏（kiosk mode 会把两者都隐藏）。[F5] Logs panel「通常与 graph 搭配，显示相关进程的日志输出」。[F4]

**2. 状态呈现（事实）。** 日志级别着色：从 `level` / `detected_level` / `lvl` / `loglevel` 标签取级别，否则按内容匹配表达式，识别不出则显示 **unknown** 级别。[F4] 异常突出：**Annotations** 在图上以 marker 显示，hover 看完整事件 metadata 与 tags，可手动 Ctrl+click 添加或从任意数据源拉取。[F3] 空状态：**未找到**。

**3. 实时性（事实）。** Explore 的 **Live** 按钮在右上角，live tailing 走两段 WebSocket（browser ↔ Grafana ↔ Loki）。[F2] Logs panel 的相关选项：Order（Newest first / Oldest first）、Enable infinite scrolling（滚到底自动加载）、Show controls（跳到最后一行/第一行、按 level 过滤、下载）、Deduplication（None / Exact / Numbers / Signature）。[F4]

**4. 详情页展示（事实）。** 日志行可**折叠展开**；展开后可 Explain in Assistant、Scroll to log line、显示/隐藏该行、Copy、Copy shortlink、切 condensed view、Anchor to the right。**Log Details panel mode** 可选 sidebar 或 inline。支持 Prettify JSON、按字段分列、syntax highlighting、每个字段有 stats 图标。Explore 里 **Show context** 可拉取同一条日志前后文，并可调时间窗口。[F4][F2]

**5. 设置页位置（事实）。** 数据源、Connections、Administration 属管理员与配置（「If you're a Grafana administrator, then you'll want to … Grafana configuration」），与 Dashboards / Explore 分开；dashboards 与 data sources 可 provisioning 脚本化。[F3]

**6. 一句话。** 最值得抄：Logs panel 的**跟随语义（Order + infinite scroll + 跳到末行）与「details 放侧栏还是内联」可选**。最该避免：**自由网格 + 查询编辑器**的 Dashboards/Explore 模式——对非观测工程师门槛高，也不满足「状态一眼可见」。

### 3.5 Railway

**1. 整体骨架（事实 + 推断）。** **Dashboard**（所有项目，按最近打开排序）→ **Project canvas**（服务以可视化方式布局）→ 点 service 打开 **service view**，内含四个 tab：Deployments / Variables / Metrics / Settings（由快捷键 `G then D/V/M/S` 证实）；Escape 关闭 service view 回到 canvas。[R1][R3] 推断：service view 是覆盖在 canvas 上的面板而非独立路由页。**顶栏**有 Observability → **Log Explorer**（环境级、跨服务）。[R2]

**2. 状态呈现。** 部署打开后有 Build Logs tab、Network tab（含 DNS view）；[R2] 状态用什么形式（badge / 彩条）：**未找到**。

**3. 实时性（事实）。** 日志过滤：`/` 聚焦 filter input、Enter 应用、Escape 关闭 popover；[R3] 自定义 filter 语法（`<keyword>`、`@attribute:value`、`AND/OR/-`、数值比较与范围）；Log Explorer 可选 date range、切换列可见性。[R2] 实时 tail / 暂停跟随：**未找到**。

**4. 详情页展示（事实）。** 日志按 deployment 或 build 分 tab 查看；Environment logs 聚合环境内所有服务；HTTP logs、DNS logs 各有专属属性集。[R2]

**5. 设置页位置（事实）。** **Service Settings 是 service view 的一个 tab**（Source / Networking / Custom Build Command / Custom Start Command），Variables 是另一个 tab——设置与 Deployments / Metrics 同级并排。[R1]

**6. 一句话。** 最值得抄：**两段式导航键 `G then X` + `/` 聚焦过滤 + Escape 逐层返回**，以及 canvas → service view → tabs 的三层钻取。最该避免：**设置与监控混在同一条 tab 栏**（Variables 与 Metrics 并列）——对我们「停止 Gateway」这类危险动作缺少隔离。

### 3.6 Vercel

**1. 整体骨架（事实）。** Project 有**左侧栏**导航（Logs、Deployments、Observability、Settings 等）。[V1][V2] Logs 页是**列表 + 右侧 sidebar 详情**：点一条日志，右侧 sidebar 出现该请求的详情。[V1] Deployments：Project → Deployments 页选一个 → **Deployment Details 页**（含 Resources tab、Deployment Summary）。[V2]

**2. 状态呈现（事实）。** 每行显示 method、domain、HTTP status、function type、RequestId；Level 过滤 Warning / Error / Fatal；Build logs 在 production deployment tile 上。[V1] 空状态：**未找到**。

**3. 实时性（事实）。** 「Logs are shown in realtime and grouped as per request」；Timeline 过滤器里可选 **Live mode** 跟随；非 Live 时结果窗口底部有 **Show New Logs** 按钮，点击按当前过滤追加新行——即「有新日志」是显式提示而非自动滚走。[V1]

**4. 详情页展示（事实）。** 右 sidebar 字段表：Request Method / Path / Time / Status Code / Host / Request Id / traceId / sessionId / invocationId；主搜索栏可按 `route`、`level`、`status`、`requestId` 等字段过滤。**Log sharing**：点一条日志后复制浏览器当前 URL 即可分享该条日志及其上下文——URL 即状态。[V1]

**5. 设置页位置（事实）。** Project Settings 在侧栏独立项；Observability 与 Logs 是分开的侧栏入口。[V2][V1]

**6. 一句话。** 最值得抄：**URL 即分享状态**、**「Show New Logs」非侵入式新日志提示**、**按 request 分组**的日志列表。最该避免（推断）：左侧栏放过滤器 + 中间列表 + 右侧详情的**三栏并列**在 IDE 中栏宽度下会很挤，过滤器需要折叠成工具栏。

### 3.7 GitHub Actions

**1. 整体骨架（事实）。** Repo 顶部 **Actions tab** → **左侧 sidebar** 列 workflows → 选中后是 workflow runs 列表 → 点 run 进入 run summary（**visualization graph**：每个 job 一个节点，连线表示依赖，job 名左侧图标表示状态）→ 在 Jobs 区或图上点 job 进入该 job 日志。四级钻取，全部是跳页。[H1][H2]

**2. 状态呈现（事实）。** 图上 job 名左侧图标表示状态；run 结果 success / failure / canceled / neutral；进入 job 日志时**失败步骤自动展开**。[H2] 空状态：**未找到**。

**3. 实时性（事实）。** 「Every workflow run generates a real-time graph that illustrates the run progress」——图随运行进度实时更新。[H1]

**4. 详情页展示（事实）。** job 日志按 **step 分组折叠**，每步显示耗时；点行号可复制该行 **permalink**；搜索只覆盖已展开的步骤；GitHub 额外注入「Set up job」「Complete job」两个步骤。[H2]

**5. 设置页位置。** 不适用：workflow 文件即配置，无 UI 设置页；文档**未找到**相关描述。

**6. 一句话。** 最值得抄：**失败步骤自动展开**、**图与日志联动（点图节点直达 job 日志）**、**行号 permalink**。最该避免：**Actions → workflow → run → job 四层跳页**，每层都要重新定位，在 IDE 中栏里成本更高。

### 3.8 Windmill

**1. 整体骨架（事实）。** 每个 workspace 有 **Runs 菜单**；runs page 按 job kind 分 tab：Script / Preview / Dependencies / Flow / Preview flow。[W1][W2] 页面是**聚合时间序列视图**，点某个 run 进入独立 **run page**（跳页）。[W2]

**2. 状态呈现（事实）。** 时间序列上**绿点 = 成功、红点 = 失败**，可按 Duration（默认）或 Concurrency 绘制；可切换显示过去的 CRON 与未来的 Planned later；Status 筛选 Success / Failure。[W2] 空状态：**未找到**。

**3. 实时性（事实）。** worker 执行时**stream the logs**；[W1] flow run 页「updating live while the flow is still running」。[W2] 暂停/跟随控制：**未找到**。

**4. 详情页展示（事实）。** run page 显示 state、inputs、success/failure reasons、**Trigger** 字段（schedule / webhook / HTTP route / Kafka / app）；flow run 显示 **flow graph，每步的 inputs / result / logs**。Share 按钮提供 member link 与 public link 两种只读链接。[W2]

**5. 设置页位置（事实）。** workspace 级菜单并列 Runs、Audit logs、Scheduling 等；Variables / secrets、Worker groups 是独立概念页。[W1][W2]

**6. 一句话。** 最值得抄：**聚合时间序列（绿/红点、按 Duration 或 Concurrency）作为 Runs 总览**，一眼看吞吐与失败分布；以及**按 kind 分 tab**。最该避免：**跳页式 run 页**；聚合图在高事件量下只是点云，缺少异常聚合。

## 4. 横向对比

| 维度 | Temporal | Trigger.dev | n8n | Grafana | Railway | Vercel | GitHub Actions | Windmill |
|---|---|---|---|---|---|---|---|---|
| 一级导航位置 | 左栏（Namespace）+ 顶栏 switcher | 左 sidebar | 顶栏 tab（Overview / project） | 左 menu + 顶栏 | 顶栏 + canvas | 左 sidebar | Repo tab + 左 sidebar | workspace 菜单 |
| 列表 → 详情 | 跳页，tab 式详情 | 未找到 | 回灌画布 | Logs panel 内折叠行 | 覆盖层 + tab | **右 sidebar** | 四级跳页 | 跳页 run page |
| 状态形式 | 表格 Status 列 + 异常打标视图 | 三段状态 + attempts | 四值 Status 筛选 | log level 着色 + annotations | 未找到 | 行内 status/level | 图节点图标 + 失败自动展开 | 绿/红点时间序列 |
| 实时方式 | 列表刷新；推送未找到 | Realtime 订阅 | 手动 Refresh | **Live tail（WebSocket）** | 未找到 | Live mode + Show New Logs | 实时图 | stream logs，live run 页 |
| 跟随/暂停控制 | 未找到 | 未找到 | — | Order / infinite scroll / 跳首末行 | — | Live 切换 | — | 未找到 |
| 事件历史/日志形式 | **Timeline / All / Compact / JSON** | logs + spans 合流 | 画布节点数据 | 折叠行 + 侧栏 details + Prettify JSON | 按 deployment/build 分 tab | 右 sidebar 字段表 | step 折叠组 + 行号 permalink | flow graph + 每步 inputs/result/logs |
| 键盘 | 未找到 | 未找到 | 未找到 | `?`、`d+e`、`d+k`、Ctrl+K | **Cmd+K、`G X`、`/`、Esc** | 未找到 | 未找到 | 未找到 |
| 设置位置 | 顶层 Settings（self-hosted 无 UI） | 项目级独立 section | 顶层独立概念 | 管理员/配置文件 | **service view 内一个 tab** | 侧栏独立项 | 无 UI | workspace 级独立菜单 |

## 5. 映射到我们的四个分区：三个结构不同的方案

先说前提（推断）：控制台整页位于 DSH **中栏**（主区），DSH 左栏是面板列表、右栏另有用途。因此下面草图里的「左」都是**中栏内部的左侧**，不是 DSH 左栏。四个分区里，Gateway 没有「列表」只有「一个进程的状态 + 动作 + 日志」；节点是「列表 + 单节点详情」；事件是「一条持续流 + unmatched 子列表 + 单事件 JSON」；Graph 是「定义列表 → 运行中/等待中实例 → 实例的事件历史」三层。三个方案分别以 **详情并排**、**总览优先**、**流优先**为核心。

### 方案 A：左侧二级导航 + 列表-详情两栏

**参照：** Temporal 的「表格 + 详情 tab + History 四视图」，[T1] Vercel 的「列表 + 右侧 sidebar 详情」，[V1] Windmill 的 run page 字段（state / inputs / trigger）。

```
┌──────────────────────────────────────────────────────────────────────┐
│ 底座控制台        ● Gateway 运行中 2d 3h   节点 3/4   ⚠ unmatched 12  │ ← 全局状态条
├────────────┬──────────────────────────┬───────────────────────────────┤
│ ● Gateway  │ [搜索/过滤 ............] │ Tab: 概览 │ 事件历史 │ 日志    │
│   节点     │ ┌──────────────────────┐ │ ───────────────────────────── │
│   事件     │ │ 实例 A   ● 运行中     │ │ Start 12:00:01  Duration 3m   │
│   Graph    │ │ 实例 B   ⏸ 等待 token │ │ Type  xxx       Queue  yyy    │
│            │ │ 实例 C   ✓ 完成       │ │ ───────────────────────────── │
│            │ │ ...                  │ │ ○ Timeline │ All │ Compact│JSON│
│ ────────── │ │                      │ │ ▸ 12:00:01  graph.started     │
│ ⚙ 设置     │ └──────────────────────┘ │ ▸ 12:00:05  task.dispatched   │
│            │                          │ ▸ 12:00:09  ✓ task.completed  │
│            │                          │ ▸ 12:00:10  ⏸ waitFor token   │
└────────────┴──────────────────────────┴───────────────────────────────┘
```

- **优点：** 列表不消失，点选即切换详情，键盘 ↑↓ 在列表移动、Enter 进详情、Esc 回列表（Grafana 的 `d+e`、Railway 的 Escape 逐层返回可直接借用）；[F5][R3] 事件历史的四种粒度切换有 Temporal 的成熟先例；分区切换在中栏内完成，不占用 DSH 左栏。
- **代价：** 中栏要同时容纳三块（二级导航 + 列表 + 详情），宽度紧张时详情区会被压窄；Gateway 分区没有列表，左侧「列表区」要退化成状态卡或留白，四个分区形态不完全统一；事件流的持续滚动与右侧详情并存时，需要明确的「选中即暂停跟随」规则。
- **适合：** **Graph**（定义 → 实例 → 事件历史，几乎一一对应 Temporal）、**节点**（列表 → 单节点在线状态/最近事件）、**事件**（流 → 单事件 CloudEvents 信封 JSON）。

### 方案 B：顶部标签页 + 卡片总览进入分区

**参照：** n8n 的 Overview 页 Executions tab，[N2] Railway 的顶栏 Observability 入口与 Dashboard 首页，[R2][R1] Trigger.dev Dashboards 的 bignumber widget。[G3]

```
┌──────────────────────────────────────────────────────────────────────┐
│  总览   │  Gateway  │  节点  │  事件  │  Graph  │  设置              │ ← 顶部标签
├──────────────────────────────────────────────────────────────────────┤
│ 总览页                                                               │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐          │
│ │ Gateway    │ │ 节点       │ │ 事件       │ │ Graph      │          │
│ │ ● 运行中   │ │ 3 / 4 在线 │ │ 120 / min  │ │ 5 运行中   │          │
│ │ 本机 2d 3h │ │ 1 离线 ⚠   │ │ 12 unmatched│ │ 2 等待     │          │
│ │ [打开]     │ │ [打开]     │ │ [打开]     │ │ [打开]     │          │
│ └────────────┘ └────────────┘ └────────────┘ └────────────┘          │
│ 最近异常（跨分区聚合：失败实例 / unmatched / 离线节点，参照 Task Failures）│
├──────────────────────────────────────────────────────────────────────┤
│ 进入某标签后 = 该分区整页：                                           │
│  Gateway：状态 + 启动/停止/重启 + 日志尾部（整页，无列表）            │
│  Graph  ：定义列表 → 点开跳页到实例详情 → History                     │
└──────────────────────────────────────────────────────────────────────┘
```

- **优点：** 总览页把四个分区的健康度压成四张卡片，满足「状态一眼可见」；异常可以跨分区聚合成一条「最近异常」列表（Temporal 的 Task Failures view 思路）；[T1] 每个分区独占整页宽度，Gateway 的日志尾部和 Graph 的 History 都能横向展开；顶部标签与 DSH 的面板式心智一致。
- **代价：** Graph 在整页模式下若沿用跳页（Temporal / Windmill / GitHub Actions 都如此），列表 → 实例 → 事件历史会丢上下文，需要在实例详情内提供「同定义的其他实例」侧列；总览页的卡片数字需要实时推送，否则会很快失真；「打开」动作多一次点击。
- **适合：** **Gateway**（状态 + 动作天然是「看一眼、点一下」）、总览层的异常聚合；**节点**（在线机器列表本身就是一张整页表格）。

### 方案 C：单页仪表盘 + 右侧抽屉详情

**参照：** Grafana Logs panel 的「Log Details panel mode = sidebar」与跟随控制，[F4][F2] Vercel 的「按 request 分组的实时日志 + 点行出右侧详情 + Show New Logs」，[V1] Windmill 的聚合时间序列总览。[W2]

```
┌──────────────────────────────────────────────────────────────────────┐
│ 底座控制台   [本机 ▾]  ● 运行中 2d 3h   ▶ 启动  ⏹ 停止  ↻ 重启    ⌘K  │
├───────────────┬────────────────────────────────────┬─────────────────┤
│ Gateway       │ 事件流  [全部 ▾][type ▾]  ⏸ 已暂停  │ 抽屉（选中项） │
│ ● 运行中      │ 12:00:01  task.claimed      node-2  │ ┌─────────────┐ │
│ 日志尾部      │ 12:00:02  aone.bug.created         │ │ 事件详情     │ │
│ ▸ 12:00:00 …  │ 12:00:02  ✖ unmatched       ⚠      │ │ id / source │ │
│ ▸ 12:00:00 …  │ 12:00:03  graph.step.done          │ │ type / time │ │
│               │ 12:00:03  …                        │ │ ▾ data(JSON)│ │
│ 节点 3/4 在线 │                                    │ │ 相关事件 ▸  │ │
│ ● node-1      │ (新事件自动追加到底；↑ 向上即暂停)  │ └─────────────┘ │
│ ● node-2      │                                    │                 │
│ ○ node-3 离线 │ unmatched (12) ▾                    │                 │
│ Graph 5 / 2   │  …                                 │                 │
└───────────────┴────────────────────────────────────┴─────────────────┘
```

- **优点：** 把「事件流」当作主舞台，底座的事件驱动本质直接可见；Gateway 状态与动作放在顶部工具条，一处可见、一处可操作；详情以抽屉承载，不选不占空间；跟随/暂停、unmatched 突出、「向上即暂停」都能在同一页完成；按 type / source 过滤流（Railway 的 `@attribute:value` 语法可借鉴）。[R2]
- **代价：** Graph 的「定义 → 实例 → 事件历史」三层数据不适合塞进抽屉，需要在抽屉内再开层级或退回跳页；左侧窄栏同时放 Gateway、节点、Graph 三组摘要，信息密度高、容易变成第二个总览；事件流持续滚动会抢占视觉焦点，与「看状态」任务冲突。
- **适合：** **事件**（流 + unmatched + 单事件 JSON，三件事一屏完成）、**Gateway**（状态 + 动作 + 日志尾部作为固定侧块）；**节点**（在线列表可以以紧凑摘要形式放左栏）。不适合作为 Graph 的主布局。

### 5.4 三方案对比（推断）

| | A 左侧二级导航 + 两栏 | B 顶部标签 + 卡片总览 | C 单页仪表盘 + 抽屉 |
|---|---|---|---|
| 最像 | Temporal + Vercel | n8n + Railway | Grafana Explore + Vercel Logs |
| 状态一眼可见 | 中（要点进分区） | **高**（总览卡片） | 高（顶条 + 左栏摘要） |
| 列表-详情联动 | **强** | 弱（需额外侧列弥补） | 中（抽屉只够一层） |
| 实时流体验 | 中 | 中 | **强** |
| Graph 三层导航 | **强** | 中 | 弱 |
| Gateway 启停场景 | 中 | **强** | 强 |
| 中栏宽度压力 | 高 | 低 | 中 |
| 键盘友好实现难度 | 低（列表焦点模型简单） | 中 | 高（流区域焦点与抽屉切换） |

**综合建议（推断）：** 若只能选一个，A 对四个分区的覆盖最均衡，并以 Temporal 为直接蓝本；若「状态一眼可见」优先级最高，B 的总览层值得单独做，但 Graph 分区内部应回到 A 的两栏；C 更适合作为**事件分区的内部形态**而非整页骨架——即 A 的壳 + 事件分区内部用 C 的流式布局。

## 6. 来源

### Temporal

- **[T1]** Temporal 官方文档，*Temporal Web UI*（Namespaces 左栏、Workflows 表格、Saved Views、Task Failures view、History 四视图、Relationships、Workers 空状态、Settings、Schedules）：https://docs.temporal.io/web-ui
- **[T2]** Temporal 官方文档，*Workflow Execution*（Open / Closed 状态枚举）：https://docs.temporal.io/workflow-execution
- **[T3]** Temporal 官方文档，*Event History*（事件历史定义、Command → Event、Replay）：https://docs.temporal.io/encyclopedia/event-history

### Trigger.dev

- **[G1]** Trigger.dev 官方文档，*Runs*（状态分组、attempts、布尔助手、`runs.list()` 过滤、`subscribeToRun`）：https://trigger.dev/docs/runs
- **[G2]** Trigger.dev 官方文档，*Logging, tracing & metrics*（run log = logs + traces + spans，OpenTelemetry 自动 trace，LLM span）：https://trigger.dev/docs/logging
- **[G3]** Trigger.dev 官方文档，*Dashboards*（sidebar 入口、widget 类型、自动刷新、12 列网格、No data 排障）：https://trigger.dev/docs/observability/dashboards
- **[G4]** Trigger.dev 官方 OpenAPI，*List dashboards*（bignumber / chart / table；API Keys section 描述）：https://trigger.dev/docs/management/query/dashboards

### n8n

- **[N1]** n8n 官方文档，*Understand executions*（两种执行列表、redaction 保留的 metadata）：https://docs.n8n.io/build/understand-workflows/understand-executions
- **[N2]** n8n 官方文档，*View all executions*（Overview → Executions tab、Status 四值、Retry 菜单、删除 workflow 连带删除历史）：https://docs.n8n.io/build/understand-workflows/understand-executions/view-all-executions
- **[N3]** n8n 官方文档，*View executions for a single workflow*（顶部 Executions tab、Refresh 按钮）：https://docs.n8n.io/build/understand-workflows/understand-executions/view-executions-for-a-single-workflow
- **[N4]** n8n 官方文档，*Debug executions*（Debug in editor / Copy to editor、pin 数据到首个节点）：https://docs.n8n.io/build/understand-workflows/understand-executions/debug-executions

### Grafana

- **[F1]** Grafana 官方文档，*Dashboards*（panels 组织进 rows / tabs、at-a-glance）：https://grafana.com/docs/grafana/latest/visualizations/dashboards/
- **[F2]** Grafana 官方文档，*Loki query editor*（Builder / Code 模式、Live tailing 与两段 WebSocket、Show context）：https://grafana.com/docs/grafana/latest/datasources/loki/query-editor/
- **[F3]** Grafana 官方文档，*About Grafana*（Explore 与 Split view、Annotations、管理员配置、Provisioning）：https://grafana.com/docs/grafana/latest/introduction/
- **[F4]** Grafana 官方文档，*Logs panel*（log level 着色、折叠行操作、Log Details panel mode、Order / infinite scrolling / Show controls / Deduplication、Prettify JSON）：https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/logs/
- **[F5]** Grafana 官方文档，*Use dashboards*（键盘快捷键 `?`、`d+k`、`d+e`、Ctrl+K；kiosk mode 隐藏 menu 与顶栏）：https://grafana.com/docs/grafana/latest/dashboards/use-dashboards/

### Railway

- **[R1]** Railway 官方文档，*The basics*（Dashboard → Project canvas → Service；Service Variables / Metrics / Settings 为 tab；Project settings）：https://docs.railway.com/platform/the-basics
- **[R2]** Railway 官方文档，*Logs*（三种查看方式：Build/Deploy Panel、顶栏 Observability → Log Explorer、CLI；filter 语法；Environment / HTTP / DNS logs）：https://docs.railway.com/guides/logs
- **[R3]** Railway 官方文档，*Keyboard shortcuts*（Cmd+K 命令面板、Escape、`G then D/V/M/S`、Logs `/` 与 Enter、Settings `/`）：https://docs.railway.com/overview/keyboard-shortcuts

### Vercel

- **[V1]** Vercel 官方文档，*Runtime Logs*（侧栏 Logs、按 request 分组实时显示、Live mode、Show New Logs、字段过滤表、右侧 sidebar 详情、Log sharing）：https://vercel.com/docs/observability/runtime-logs
- **[V2]** Vercel 官方文档，*Deployments overview*（Project → Deployments → Deployment Details、Resources tab、Deployment Summary、侧栏 Deployments 操作）：https://vercel.com/docs/deployments/overview

### GitHub Actions

- **[H1]** GitHub Docs，*Using the visualization graph*（Actions tab → 左 sidebar workflows → runs 列表 → run summary 图 → 点 job 看日志；图标与依赖连线；real-time graph）：https://docs.github.com/en/actions/how-tos/monitor-workflows/use-the-visualization-graph
- **[H2]** GitHub Docs，*Using workflow run logs*（结果四值、失败步骤自动展开、step 耗时、行号 permalink、搜索仅覆盖已展开步骤）：https://docs.github.com/en/actions/how-tos/monitor-workflows/use-workflow-run-logs

### Windmill

- **[W1]** Windmill 官方文档，*Jobs*（worker stream logs；job 五种 kind 各占 runs page 一个 tab；详情页可查 logs / output / metadata）：https://www.windmill.dev/docs/core_concepts/jobs
- **[W2]** Windmill 官方文档，*Jobs runs*（workspace Runs 菜单、聚合时间序列绿/红点、Duration / Concurrency、按 kind 分 tab、run page 字段与 Trigger、flow graph 每步 inputs/result/logs 且 live 更新、Share 两种链接、Filters）：https://www.windmill.dev/docs/core_concepts/monitor_past_and_future_runs
