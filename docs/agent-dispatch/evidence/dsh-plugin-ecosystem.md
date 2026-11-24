# DSH 插件生态与引擎需求重叠能力取证

> 状态：只读源码调研，不含实现；取证件只陈述事实，「对引擎选型的影响」一节是推断。
>
> 取证时间：**2026-11-24**。
>
> 取证对象：任务指定的 `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/` **本轮不可读**——`app.asar` 是单个 213 MB 归档文件，不是目录（`ls` 报 `Not a directory`；`app.asar.unpacked/dsh` 存在但本轮未解包读取）。因此改用已确认存在的源码仓 `/Users/wanghuahui/workspace/deepseek-harness`：根 `package.json:3` 为 `0.2.2-rc.1`，`git describe` 为 `dsh-v0.2.2-rc.1-811-gfcc0ad4621`，commit `fcc0ad4621725`（2026-11-04）。该快照不是对 app.asar 内部版本的断言。
>
> 与已有证据的关系：headless / SDK / ACP / schedule 基础事实、isolate realm、webServer、桌面装配已由 [dsh-host-facts.md](dsh-host-facts.md) 覆盖，本文**不重复**，只在需要新角度时引用。Host/Client 双半包、`dsh.client.inject` 语义、三条 HMR 链路已由 [docs/research/dsh-plugin-development.md](../../research/dsh-plugin-development.md) §5–§6 覆盖，本文引用其结论。
>
> 取证件约定：`路径:行号` 指源码仓相对路径；标注【文档声明】= README/子系统文档；【源码证实】= 读过实现代码；【命令输出】= 本机只读命令结果。写「未找到证据」即确实没有。

---

## 0. 一页结论

| 引擎需求 | DSH 既有能力 | 判定 |
|---|---|---|
| 子代理派发 / worker | `ctx.subagents.startActivation` + 具名 provider；`subagent`/`subagent_fork`/`send_message`/`wait_agent` 工具 | **可作底座**（节点侧 Worker 池直接用它起会话），但它驻留仅限进程内、无跨进程邮箱 |
| 脚本编排 | `ctx.workflowEngine.start({script,...})`：`agent()`/`parallel()`/`pipeline()`/`phase()` | **仅语义相似不可用**：无日志、无恢复、前台持有、一 context 一引擎（会与自研引擎撞位） |
| durable 定时器 | `ctx.schedule.create({timing, target})`：七种时间类型、持久化、重启补投 | **仅语义相似不可用**：只能投递 prompt 给 Session，不能回调 host 函数，最小 60 s |
| goal 与自动续轮 | `ctx.goals` 事件溯源状态 + `dsh-goal-round-driver` | **仅语义相似**：同会话、需人 resume、只有 Round 预算，不是跨进程 durable 执行 |
| 起一个 agent 会话并拿结果 | `ctx.agents.create()/resume()` → `followup()` + `whenIdle()`；`ctx.subagents.startActivation().result`；`ctx.webhookRuntime` | **可直接用** |
| 持久化（Outbox 需事务） | `ctx.storageDomain`（KV 表 + zod；json / sqlite 后端） | **可作底座但缺事务**：无跨表事务、无二级索引；sqlite 同步驱动阻塞事件循环 |
| 事件总线 / hook / 服务发现 | cordis `ctx.on` 五种分发模式；Service 即 `ctx.<key>`；`inject` 依赖 | **可直接用**（进程内） |
| 插件装卸 / 隔离 | bundle + `cordis.patch.yml` 分层；`dsh-hmr` 在线重载；`cordis:group` + `isolate` | **可直接用** |
| graph node 注册表 | 无现成「节点类注册表」；但有同构模式：`ctx.tools.register`、`ctx.sidebarRightTabs.register`、`ctx.agentPresets.register`、`ctx.commands.register`、browser-use/computer-use 的 exclusive provider | **必须自研注册表，但照抄 DSH 模式**（effect 持有、重名抛错、scope 可见） |
| 画布 UI | Web Client 插件：`dsh.client` 声明 + `ctx.slots` + `ctx.sidebarRightTabs`；本仓库 `ui-time` 已是实例 | **可直接用**（UI 壳），画布库仍自选 |

---

## 1. DSH 宿主已有的、与引擎需求重叠的能力

### 1.a 子代理派发

**结论一句话**：subagent 是一个「服务 + 具名 provider + 面向模型的工具」三层结构，`ctx.subagents.startActivation()` 是编程入口，返回 `result` Promise；本地 spawn/fork 子级有持久 Session 可续聊，外部 provider（ACP/SDK/Codex/Claude Code）执行一次即止。**驻留仅限进程内**：Activation inbox 与所有权图不跨 harness 进程协调。用户提到的 `spawn_teammate` 在当前源码中**已被移除**。

**事实列表**

- 分层：【文档声明】`packages/subagent/subagent/README.zh.md:10`（服务 + 多个 provider + 委派工具，按配置名路由）；`:32-45`（最小 yaml：`dsh-subagent` + `dsh-subagent-spawn-in-process` + `dsh-tool-subagent`，"仅挂载服务本身不会启用委派"）。
- 编程入口：【文档声明】`README.zh.md:59`：`startActivation({ provider, label, name?, prompt, parent, signal, delivery })` 返回 `{ childId, name, messageId?, result, dispose }`；`delivery: 'parent'` 给模型完成通知，`'caller'` 只把结果返回给调用方（工作流用）。
- 请求类型：【文档声明】`docs/subsystems/subagent.zh.md:100-146`：`SubagentStartRequest { cwd?, agentPreset?, label?, prompt, parent: Agent, signal, agentOptions?, outputSchema?, maxDepth? }`——`parent` 必填，每个子级归属一个活 Agent；`outputSchema` 返回结构化值。
- 容量：【文档声明】`README.zh.md:51-57`：`maxActiveSubagents` 默认 8，按树计；耗尽即拒绝 `ACTIVATION_LIMIT_REACHED`，**不排队**。
- `wait_agent`：【源码证实】`packages/subagent/tool-subagent-control/src/wait-agent.ts:91`（`name: 'wait_agent'`）；【文档声明】同包 `README.zh.md:54-56`：等调用者**自己的**下一步收件箱，默认 30 s、范围 10 s–1 h，结果只含 `timedOut`，"任务变化不会结束等待"。
- `spawn_teammate` 已移除：【文档声明】`docs/upgrade-guide/v0.2.1-rc.2/agent-team-subagents/guide.zh.md:14`（移除 `spawn_teammate` 与 Team 作用域的 `send_message`/`list_agents`/`interrupt_agent`）、`:27`（用 `subagent`/`subagent_fork` 替代）、`:30`（`spawnTeammate` → `ctx.subagents.startActivation`）；【源码证实】`packages/team/tool-agent-team/tests/tool-team.spec.ts:272`（`not.toContain('spawn_teammate')`）。
- Agent Teams 现状：【源码证实】`packages/team/tool-agent-team/src/index.ts:113-197` 只注册 `team:policy` + `team_task_create/list/get/update`；`packages/team/agent-team/src/index.ts:94-159` 提供 `isEnabled/setEnabled/createTask/getTask/listTasks/updateTask`。任务板是 **Session 日志内的快照**（`docs/subsystems/agent-team.zh.md:5`、`:67-80`），`blockedBy` 维持 DAG、`revision` 为 CAS。
- 已知限制：【文档声明】`packages/subagent/subagent/README.zh.md:237`（消息限一棵树内）、`:240`（**驻留仅限进程内**，跨进程需要持久化邮箱与租约协议）、`:241`（崩溃可能丢失已接受未记录的消息，不回放）。

**判定：可作底座**（节点 Worker 池的「起会话 + 拿结果 + 可续聊」直接用它），不可作中心调度。

### 1.b workflow 脚本编排

**结论一句话**：`ctx.workflowEngine.start({ script, meta, args, parent })` 执行一段模型/插件编写的 JS 脚本，钩子有 `agent()`、`parallel()`、`pipeline()`、`phase()`、`log()`；运行由调用方前台持有，**没有日志化或恢复**，一个 context 只能有一个引擎实现。

**事实列表**

- seam 定位：【文档声明】`docs/subsystems/workflow.zh.md:5`（"每个上下文只允许一个引擎实现提供 `ctx.workflowEngine`；没有命名提供方注册表（第二个引擎通过插件配置替换第一个）"）；`packages/workflow/workflow/README.zh.md:71`（加载第二个引擎会明确报错）。
- 抽象方法：【源码证实】`packages/workflow/workflow/src/index.ts:168`：`abstract start(request: WorkflowStartRequest): WorkflowRun`。
- 请求与结果：【文档声明】`docs/subsystems/workflow.zh.md:17-95`：`WorkflowStartRequest { script, meta, args?, subagentProvider?, maxTotalAgents?, parent: Agent, signal? }`；`WorkflowRun { id, meta, result: Promise<WorkflowResult>, cancel(), dispose() }`；`result` 永不 reject，`stopReason: completed|cancelled|error`。
- 脚本语义：【文档声明】`packages/workflow/workflow/README.zh.md:34-47`：纯 JS、顶层 await、`return <json>`；`phase()` "仅用于进度展示，不暗示任何执行结构"（`docs/subsystems/workflow.zh.md:44-51`）。
- 持久 Chat 记录：【文档声明】`docs/subsystems/workflow.zh.md:122-128`：`tool-workflow/run-start`、`run-end` 写入父 Session 供 UI 折叠，但只是展示投影，不是检查点。
- 事件：【文档声明】`docs/subsystems/workflow.zh.md:100-112`：`workflow/start|phase|log|agent-start|agent-end|end`，只供观察，payload 不带活动运行。
- 已知限制（关键）：【文档声明】`README.zh.md:126`（仅支持前台收集）、`:127`（**没有日志化或恢复**，进程重启后无法继续）、`:128`（没有已保存或嵌套工作流）、`:130`（运行由持有方负责，不由服务跟踪）。
- 实现依赖：【源码证实】`packages/workflow/workflow-ptc/src/index.ts:104`：`static inject = ['subagents','ptcRuntime','sandboxPolicy','workingDirectory']`——PTC 引擎把脚本放进共享 Node PTC 进程，与 `tool-executor-ptc` 共用 `ctx.ptcRuntime`（dsh-host-facts.md「额外」节）。
- 一个现成的「隔离 workflowEngine」样例：【源码证实】`packages/experimental/ralph-bundle/cordis.patch.yml:2-6`（`cordis:group` + `isolate:`），`packages/experimental/tool-ralph/README.zh.md:10`（前台循环、每 Round 一个新子 agent、有界报告）。

**判定：仅语义相似不可用**。它的 `agent()` ≈ 我们的 `runTask`（但执行的是 LLM 子代理而不是任意任务），`phase()` ≠ graph node，且缺 durable 三要素（事件历史 / 重放 / 定时器）。

### 1.c 定时任务（schedule）

dsh-host-facts.md §4 已覆盖七种时间类型、持久化位置、60 s 下限、只投 Session。此处补三条与引擎直接相关的新角度。

- 编程入口签名：【源码证实】`packages/schedule/schedule/src/index.ts:381-413`：`create(request: ScheduleCreateRequest, actorSessionId?, signal?)`，内部 `domain.table('tasks').put(id, task)` 后 `this.runtime?.requestDrive()`。目标只有 `session | new_once | new`（`:356-391` 类型；`:633-668` 三个分支都走 `requireSessionCreation()`）。
- 创建新 Session 的真实路径：【源码证实】`packages/schedule/schedule/src/runtime.ts:471-473`：`const controller = this.ctx.get('sessionController'); await controller.create({...})`；`:104/143` 用 `this.ctx.agents.withoutInitiator(...)`；`index.ts:723` 投递 `agent.inject(createUserMessage({ ..., source: { kind: 'schedule' } }))`。
- 依赖：【源码证实】`index.ts:224`：`static inject = ['agents','sessions','storageDomain','sessionPersistence']`；`sessionController` 是可选依赖（`:249`、`:676-677`）。

**判定：仅语义相似不可用**（见 §4 冲突分析）。但它的**实现**是我们 durable 定时器的最佳参照：`storageDomain` 存任务 + Host 单定时器驱动 + 重启只补最新一次。

### 1.d goal 与自动续轮

**结论一句话**：goal 是**同会话**的事件溯源状态机（`active|paused|blocked|complete` + `maxGoalRounds`），续行由独立驱动器在 agent idle 时排入下一条 prompt；续行开关是进程本地且**任何会话开始边界之后都会停用**，必须有人显式 resume。

**事实列表**

- 状态与动词：【文档声明】`packages/goal/goal/README.zh.md:26-70`：`create/edit/pause/resume/complete/block/clear`；`block` 是唯一"因问题停止"的持久 phase，带 lower-kebab-case `code`。
- 持久化：【文档声明】`:72`：每次变更追加 `goal/change` Session 事件，是唯一存储；**任何会话开始边界之后 active goal 都会被停用续行**。
- 驱动器：【文档声明】`packages/goal/goal-round-driver/README.zh.md:10`、`:42-58`：agent idle 且 goal active、续行启用、额度有剩余时排一条 goal-round prompt；会话 resume/fork/卸载后绝不自行复活。
- 依赖：【源码证实】`packages/goal/goal/src/index.ts:237`：`static inject = ['agents','sessionProjections']`。
- 已知限制：【文档声明】`README.zh.md:157`（只负责状态，不负责任务调度）、`:160`（只有一个当前 goal，有意不支持并行目标或独立 goal 数据库）。

**判定：仅语义相似**。它是「让一个 agent 会话自己跑完一个目标」的机制，不是「让一个流程实例睡着等人/等事件」的机制。

### 1.e 会话的创建与驱动（编程方式）

headless / SDK / ACP 的跨进程事实见 dsh-host-facts.md §1–§3。本节只回答「**插件代码在同一进程内**如何起一个 agent 会话并拿结果」。

**结论一句话**：三条进程内路径——(1) `ctx.agents.create()/resume()` 返回 `AgentHandle`，用 `followup()` 投递、`whenIdle()` 等停稳；(2) `ctx.subagents.startActivation(...).result`（需一个 parent Agent）；(3) `ctx.webhookRuntime` 的 fire-and-forget（外部事件 → 新根 Session，无完成回执）。

**事实列表**

- (1) `ctx.agents`：【文档声明】`packages/core/agent/README.zh.md:28-62`：`create({ sessionId, agentOptions, setup? })` / `resume()`；`followup()` 排队并唤醒、`steer()` 下一步注入并唤醒、`inject()` 只注入不唤醒、`whenIdle()` 整个 agent 停稳；需 `dsh-session-projection` + 驱动器工厂（shipped `dsh-agent-loop`）。
- (2) `ctx.subagents.startActivation().result`：见 §1.a；`delivery: 'caller'` 即"只返回结果不发父级通知"。
- (3) `ctx.webhookRuntime`：【文档声明】`docs/subsystems/webhook.zh.md:5`（已验证的外部交付 → 可选普通根 Session）、`:11-17`（`WebhookRule.run(delivery, signal)` 返回 `WebhookSessionRequest { workspacePath, title, prompt, agent preset, permission preset }`）、`:25-27`（创建 cwd=Workspace 的 Agent，挂 preset，附加 `source.kind: "webhook"` 的持久 user 消息）、**`:23`：runtime 没有队列、重试、去重、执行状态、崩溃重放、Agent 状态监听器或完成结果；重复交付可能创建重复 Session**。
- 本仓库实际用法（命令输出）：`~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 含 `dsh-secretary`、`@deepseek-ai/dsh-experimental-agent-team-profile` 等；`~/.dsh/profiles/desktop/cordis.patch.yml` 通过 `- id: hmr` 的 `root:` 列表监听本仓库各包 `lib/`。

**判定：可直接用**。注意：三条路径都没有「完成回调」——拿结果只能 `whenIdle()` / `result` Promise / 读 Session 日志。

### 1.f 持久化能力

**结论一句话**：插件能拿到的存储面是 `ctx.storageDomain.open(spec)`：按领域声明的 KV 表（zod schema），json 或 sqlite 后端，读同步、写持久后发 `domain/changed`。**没有跨表事务、二级索引、多段键**；sqlite 用同步 `DatabaseSync` 阻塞事件循环、无忙等待。

**事实列表**

- 分层：【文档声明】`docs/subsystems/storage.zh.md:5`：枢纽 `ctx.storage`（不做 IO）、后端 `json`/`sqlite`、唯一 Consumer `dsh-storage-domain`（`ctx.storageDomain`）；`:47`：`kv` 是唯一已交付操作组，"整文档与行存储调用在介质上是原子的，而逐记录批次在完成前中断时可能只应用一部分"。
- 用法：【文档声明】`packages/storage/storage-domain/README.zh.md:34-58`：`defineDomain({ name, version, tables })` → `await ctx.storageDomain.open(spec)` → `table.put/get/update/delete`，读同步取内存，写在每领域一条写入链上串行。
- 事务语义：【文档声明】`:88-92`："内存具有最终决定权；介质是持久投影"、"`domain/changed` 是通知，不是事务参与者"；**已知限制 `:147`：没有跨表事务、二级索引或多段键**；`:146`：变更只在单进程内可见。
- sqlite 后端：【文档声明】`packages/storage/storage-sqlite/README.zh.md:55-62`（批量删除一个事务；首次版本升级与修改同事务；`unknown-state` 后拒绝一切直到关闭）；**限制 `:130`：同步驱动阻塞事件循环；`:131`：没有忙等待或重试策略，跨进程协调不在范围内**。
- Session 日志是另一个存储面：`docs/subsystems/session.md:3`（append-only log，唯一真源），插件可追加自定义事件类型（`docs/persistence-catalog.zh.md:15`："外部插件类型需要独立声明，不属于本目录"）。本仓库 goal provider 即走此路（见 `packages/goal/provider`）。
- 本仓库已实践：`~/.dsh/profiles/desktop/package.json` 的依赖含 `dsh-secretary-storage-domain`、`@deepseek-ai/dsh-storage-sqlite`。

**判定：可作底座但缺事务**。Outbox 若只用一张表，整文档写是原子的，够用；若要「事件历史 + 等待登记 + 定时器」三表同事务，必须自管 SQLite 或单表序列化。

### 1.g 事件总线 / hook / 服务发现

**结论一句话**：全部是 cordis 进程内机制——Service 占 `ctx.<key>`、`inject` 声明依赖并等待就绪、事件用 TS 声明合并注册名并按 `emit|waterfall|parallel|serial|bail` 五种模式之一分发；注册通过 `ctx.effect()`/`ctx.on()` 自动随插件卸载撤销。没有跨进程总线。

**事实列表**

- 五个核心概念：【文档声明】`docs/cordis-primer.zh.md:7-15`。
- 分发模式表：【文档声明】`:17-31`（`emit` 不 await 广播；`waterfall` 环绕中间件 `(...args, next)`；`bail` 短路到首个 bail 值）。
- 事件声明与生命周期：【文档声明】`docs/user/develop/framework/events.zh.md:83-115`（声明合并 `interface Events`，`ctx.on()` 在插件卸载时自动移除）。
- 服务提供与隔离：【文档声明】`docs/user/develop/framework/service.zh.md:7-143`（`Service` 基类、必需/可选依赖、"服务消失时的行为"、`cordis.yml` 的 `isolate`）。
- 工具流水线事件作为 hook 点：【文档声明】`packages/core/tools/README.zh.md:137`（`tools/pre-execute` 可重排门禁、`tools/post-execute` 可替换结果、`tools/result` 观测）。
- Webhook 事件图可按提供方种类合并扩展：【文档声明】`docs/subsystems/webhook.zh.md:9`（"让树外适配器无需修改 runtime 包"）。

**判定：可直接用**（进程内）。跨角色通信按 foundation.md §2.1 必须走 NATS，cordis 事件不是边界。

---

## 2. DSH 插件机制对「引擎做成插件」的支持度

### 2.a 声明、装载、在线装卸；`cordis.patch.yml` 的作用

**事实列表**

- 插件形态：【文档声明】`docs/user/develop/basic/index.zh.md:15-40`（导出 `apply(ctx)` 的模块，或 `Service` 子类）；`docs/cordis-primer.zh.md:9`。
- 两个 manifest：【文档声明】`docs/user/develop/basic/publish.zh.md:9-16`（bundle 声明 `dsh.bundle` = 一个 patch 文件或有序文件列表；profile 声明 `dsh.profile` = 有序 `bundles`）；`:33-62`（最小 bundle：`package.json` 的 `"dsh": {"bundle": {"patch": "./cordis.patch.yml"}}` + `- insert: [{ id, name }]`）；`:77-103`（`dsh plugin --profile <name> add` 把依赖装进 profile 并追加到 `bundles`）。
- 分层与 `cordis.patch.yml`：【文档声明】`packages/boot/app-boot/README.zh.md:48-60`：空根 → 各 bundle patch → profile `cordis.patch.yml` → home `~/.dsh/cordis.patch.yml` → `--patch`；"替换某个条目的整个配置（重述你要保留的字段）、插入新条目，或在启动时插值 `!!js`"；patch 指向不存在的条目只告警；空文件启动失败。
- 在线装卸：【文档声明】`packages/boot/hmr/README.zh.md:26-50`（base 以 `root: []` 启用 HMR；只监听显式配置；profile 重新组合会替换磁盘已变的已加载模块，含 `node_modules` 下已安装包与 `link:` 目标）；`:104-123` 限制（宿主自身静态依赖变化需 `restart-required`；`package.json` 变化不检测；Worker 不在支持范围）。
- 插件管理器：【文档声明】`packages/boot/plugin-manager/README.zh.md:12-45`（Web 侧栏「插件」页启停条目、装卸 bundle；开关只改 profile patch 的 `disabled`；`plugin_manager` 工具需 `danger-full-access`）。
- 版本门禁：【文档声明】`packages/boot/app-boot/README.zh.md:62-66`（`engines.dsh` 或 peer 范围不匹配即跳过，需精确版本豁免）。
- 本机实际（命令输出）：`~/.dsh/profiles/desktop/cordis.patch.yml` 是一份活的用户层——覆盖 `permission`、`llm-pi-ai` providers、`hmr.root`、`plugin-market.indexes`、`agent-default-model`；`~/.dsh/cordis.patch.yml` 由 `loongsuite-pilot` 托管插入一个 `file://` 插件。

**判定：可直接用**。中心/节点引擎各做一个 bundle（`dsh.bundle.patch` 插入 `cordis:group` 行），由 desktop profile 的 `bundles` 列表选择。

### 2.b 同宿主装载两份同类插件的隔离

isolate realm 的机制事实已在 dsh-host-facts.md §7.1（LocalRealm vs GlobalRealm、provider 与 consumers 必须同组、不是安全边界）。此处补充三处与本问题直接相关的细节：

- `cordis:group` + `isolate` 是 Loader 通用能力，非 preset 专属：【源码证实】`packages/experimental/ralph-bundle/cordis.patch.yml:2-6`（一个 bundle 为自己隔离 `workflowEngine`）；【文档声明】`packages/bundle/web-app/presets/standard.patch.yml:86-89`（`delegation` group）。
- 服务名与工具名：Service 占 `ctx.<key>`，同一 isolate key 第二个同名 provider 失败（dsh-host-facts.md §7.1 第 2 条）；工具在**同一 scope** 重名失败（`packages/core/tools/README.zh.md:71`，同名替换；`docs/subsystems/tools.zh.md:646-655`，同层重名 fail）——isolate realm 内的工具行注册在 realm 自己的 scope，不会与 root 冲突，但 **root 作用域下两个角色若都向 `ctx.tools` 注册同名工具（例如都想注册 `graph_instance_list`）会撞**。
- preset 机制提供另一种隔离：每个 preset 声明创建注册表拥有的 scope 和内存 Loader 树，有激活审计（导入失败、缺失服务、**向全局泄漏的服务**会拒绝挂载）——【文档声明】`packages/preset/agent-preset-registry/README.zh.md:58-60`；`ctx.agentPresets.register(definition)` 见【文档声明】`docs/subsystems/core.zh.md:604`。

**判定：可直接用**。推荐结构（推断）：中心引擎 bundle 与节点引擎 bundle 各自是一个 `cordis:group`，`isolate: { graphEngine: true, graphNodeRegistry: true, eventHistory: true }`，各自 id 不同；两者都不向 root 的 `ctx.tools` 注册工具，工具只给各自 realm 内的 Agent scope。

### 2.c 第三方插件如何注册一个「graph node」

**结论一句话**：**未找到证据**表明 DSH 有面向「流程节点」的注册表。但 DSH 有五种同构的注册表扩展点，可以直接照抄其模式：effect 持有的 `register() → disposer`、重名抛错、scope 可见性、声明合并。

**现成注册表模式清单**

| 扩展点 | 调用 | 证据 |
|---|---|---|
| 工具 | `ctx.tools.register(defineTool({...}))`；`ToolDefinition { name, description, inputSchema, output, execute(args, exec) }` | 【源码证实】`packages/core/tools/src/index.ts:128`；`contracts.ts:26-39`；`schema.ts:555`（`defineTool`） |
| 命令 | `ctx.commands.register(definition): () => void` | 【源码证实】`packages/*/commands/src/index.ts:61,285` |
| Agent preset | `ctx.agentPresets.register(PresetDefinition): Promise<disposer>` | 【文档声明】`docs/subsystems/core.zh.md:604` |
| 右栏 tab 类型 | `ctx.sidebarRightTabs.register({ id, kind, patterns?, priority, title, guide? })`；同 `id` 二次注册抛错 | 【文档声明】`docs/subsystems/sidebar-right.zh.md:34-36`；本仓库实例 `packages/client/ui-time/src/client/index.tsx:14` |
| UI slot | `ctx.slots.register({ name, id, order }, Component)`，须经 `ctx.slots.inject(name, cb)` | 【文档声明】`docs/subsystems/slots.zh.md:47-65`；本仓库实例 `ui-time/src/client/index.tsx:24` |
| exclusive provider（browser-use / computer-use） | "Owns one optional provider registration in the shared browser-use service" | 【文档声明】`docs/subsystems/browser-use.zh.md:53`、`computer-use.zh.md:55` |

**类比 ComfyUI `NODE_CLASS_MAPPINGS` 的映射（推断）**：我们的 `defineNode({ ports, run })` 应由引擎提供一个 `ctx.graphNodes.register(definition)` 服务（放在角色 realm 内），第三方 bundle 在其 `cordis.patch.yml` 里插入一行依赖该服务的插件，`apply(ctx)` 内 `ctx.effect(() => ctx.graphNodes.register(...))`。这正是 `tool-workflow`/`tool-subagent` 注册工具的方式，没有新机制要发明。

### 2.d Web GUI 客户端插件：画布类 UI

**事实列表**（Host/Client 双半包基础见 dsh-plugin-development.md §5，不重复）

- 声明：【文档声明】`packages/client/modules/README.zh.md:30-34`：`package.json` 以 `platform: 'web'` 声明 `dsh.client`、导出 `./client` bundle、`dsh.client.external` 列基座外模块；bundle 惰性执行。
- 构建要求：【文档声明】`:58-60`："启动前 `pnpm run build` 必须已产出每个 `lib/client.js`；缺失 bundle 会明确导致激活失败"。
- 热更新：【文档声明】`packages/client/hmr/README.zh.md:12`（已打开页面跟随 Host 插件图；普通插件启停无需刷新；代码重建会替换插件并重置组件状态）、`:32`（`pnpm run dev:web` 的 watcher 只覆盖 Harness 仓自身包，见 dsh-plugin-development.md §6.2-C）。
- 放置位置：右栏 tab（`sidebarRightTabs`，`docs/subsystems/sidebar-right.zh.md:34-58`，可 `keepMounted`、可 `guide` 上引导页）；左栏入口 + 独立 `main` 页（`sidebar.panellist` + `main` keyed slot，dsh-plugin-development.md §5.3）；底部 dock 不在官方 slot 层级内——未找到证据。
- 社区里已有多个「画布类」客户端插件证明可行（§3）：`dsh-comfyui-canvas`（嵌入 ComfyUI 画布分屏）、`@miragari/dsh-client-canvas`（节点连线素材）、`dsh-agent-canvas`（展示 Agent/Subagent/Workflow/Phase 关系）、`@gm-hz/agent-dag-workflow`（Canvas 编辑 `WorkflowTemplate`）。
- 本仓库实例：`packages/client/ui-time/package.json` 的 `dsh.client.inject` 列出 `dsh-api-gateway`/`ui-renderer`/`ui-sidebar-right`/`ui-slots`；`src/client/index.tsx:30-34` 先 `inject = ['remote']` 再 `ctx.inject(['remote.secretaryTime','slots','sidebarRightTabs'], registerUi)`。

**判定：UI 壳可直接用**；画布库按 graph-engine-options.md §5 自选（`@xyflow/react`）。注意画布需要的 Host↔Client 数据通路必须走 Remote（`@Remote` 方法 + `ctx.remote.*`）或自注册 HTTP 路由，Host 服务不能从浏览器直接读。

---

## 3. 社区 / 第三方现状

### 3.1 本机已安装（命令输出）

`~/.dsh/plugins` 为空；`~/.agents/plugins/marketplace.json` 只有 `superpowers-local`（技能包，非编排）；`~/.team-skills` 是技能库，无 DSH bundle。`~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles`：

| bundle | 做什么 | 与本课题关系 |
|---|---|---|
| `@deepseek-ai/dsh-experimental-agent-team-profile` | Agent Teams（任务板 + 控制工具） | 见 §1.a |
| `@agents-anywhere/dsh-bridge-next` 2.0.2 | "event-driven session runtime"（包描述） | 事件驱动会话；未读源码，不深断言 |
| `dsh-secretary` 及 7 个 `dsh-secretary-*` link 包 | 本仓库 | — |
| `dsh-skill-tree`（link） | skill 树 | 本会话可见的 `skill_tree` 工具来源 |
| `@deepseek-ai/dsh-experimental-forge-bundle` | 代码托管变更请求 | 无 |
| `@deepseek-ai/dsh-experimental-plugin-market-bundle` | 插件市场 | 无 |
| `dsh-sidenote` 0.8.5 | 划选旁注 | 无 |
| `dsh-mermaid` 0.4.5 | Mermaid 渲染 | 无（只读渲染，不是画布） |

`~/.dsh/profiles/web` 另装 `dsh-better-sidebar` 0.14.0（"service-oriented sidebar framework"，暴露 `ctx.betterSidebar.registerTab/registerFileViewer` 给其他插件——一个社区自建注册表的样例）。

`~/.dsh/profiles/desktop/cordis.patch.yml` 把 `plugin-market.indexes` 指向 `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json`（awesome-dsh-plugin.com 社区索引）。

### 3.2 社区索引扫描（命令输出 + URL）

索引 [dsh-plugin-catalog/index.json](https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json)（format 1）本轮读取：**6717 个插件**，`workflow` 分类 **441 个**。按「durable / 调度 / 画布 / 派发 / 多机」关键词筛出与本课题真正相关的：

**A. durable DAG / 工作流引擎类**

- [`@gm-hz/agent-dag-workflow`](https://github.com/GM-HZ/agent-dag-workflow) v1.0.1（2026-10-07）。README（raw 抓取）：「Host-neutral 持久化 DAG Workflow Runtime」，一份 `WorkflowTemplate` JSON 供 SDK/CLI/MCP/DSH/Canvas 共用；Journal + Checkpoint 原子提交（SQLite）；`runtime.replay({ runId, mode: 'recorded' })`；「两级扩展：普通外部能力注册为 Host Tool，由 `tool.call@1` 调用；只有暂停恢复、长任务 checkpoint、补偿等生命周期语义才实现自定义 Node」；`@gm-hz/agent-dag-workflow/dsh` 是一个 DSH bundle（`dsh plugin --profile web add`），注册 `workflow-builder` Skill、受保护工具与 Canvas；`1.0.1` 面向 DSH `>=0.2.0-rc.2 <0.3.0`；「外部 Tool 在未知副作用边界上恢复时仍会进入 `paused`，需要操作者显式选择 retry/fail」。**与本课题最接近的现成实现**；差异：它是 DAG + 节点 JSON 模板，不是 `defineNode + run(ctx) + waitFor` 的代码优先模型；无 `phase()` 之外的人工等待原语（README 未提）。
- [`dsh-knj-workflow`](https://github.com/yangdongzhen590/dsh-knj-workflow) v2026.11.16：「图式工作流（任务/网关/人工审批节点）+ 阶段级断点持久化」，内置 AI 在图编辑器里对话改图；README:51 `tasks/<taskId>/stages/<stageId>.json` 阶段断点产物；README:122-126 断点协议是 `initialResults + 跳过集合`——即**节点级重放**的简化版。
- [`@xiangyixie/dsh-superagent`](https://github.com/LittleChenLiya/dsh-superagent) v0.24.0：「运行状态落盘、宿主重启后可继续；每个 run 有调用数与 token 硬上限」。

**B. ComfyUI 式画布类（客户端 UI）**

- [`dsh-comfyui-canvas`](https://github.com/wbin0001/dsh-comfyui-canvas) v0.1.13：把 ComfyUI 以画布分屏嵌入 DSH Web。
- [`@miragari/dsh-client-canvas`](https://github.com/xindong/dsh-client-canvas) v0.1.5：节点连线组织多模态素材，与 Agent 共享上下文。
- [`dsh-agent-canvas`](https://github.com/Lhy723/dsh-agent-canvas) v0.1.0：展示 Agent/Subagent/Workflow/Phase/工具调用关系（只读观测）。
- [`@haitang-hub/dsh-infinite-canvas`](https://github.com/Haitang-Hub/dsh-infinite-canvas) v0.2.36：节点式创作画布，「节点插件市场」——社区已出现「节点可扩展」的产品形态。
- [`dsh-better-sidebar`](https://github.com/omdsh-dev/DSH-better-sidebar)（本机 web profile 已装）：右栏框架 + 对外 `ctx.betterSidebar` 注册表。

**C. 定时 / 派发 / 多机调度类**

- cron 类至少 5 个独立实现：`@goodandready/dsh-cron`、`@opendsh/dsh-plugin-scheduled-tasks`、`dsh-plugin-cron-scheduler`、`@weibaohui/dsh-tasks`、`@linxin666/dsh-client-ui-task-board`——全部是「到点开新会话注入 prompt」，与官方 schedule 同模型，印证 §1.c 的缺口。
- 派发类：`dsh-mini-superagent` v0.10.4（后台子会话 + 回流主会话）、`dsh-task-dispatch` v0.6.3（HTTP 7391 + 持久任务台账）、`@wjj865-code/dsh-orchestrator` v0.33.0（SQLite 台账、依赖/写域/优先级队列、子会话回报）、`dsh-router-worker` v0.2.1（工单落 SQLite、按宿主并发上限排队）。
- 多机：[`dsh-alpha`](https://github.com/songofhawk/dsh-alpha) v0.2.0（README raw 抓取）：DSH master + 反向 WebSocket gateway + 多 Worker，「Dispatch once, wait on events, and resume with the same durable task ID after interruption」，task events 用内置 SQLite；[`dsh-remote-agent`](https://github.com/zbzbhs/dsh-remote-agent) v0.9.12（副机自跑 DSH，主机只收 handoff 摘要）；[`@nelsonlongxiang/dsh-open-a2a-net`](https://github.com/NelsonLongXiang/dsh-open-a2a-net) v0.7.0（A2A 底座、签名节点发现、Superagent 团队工单分派）。
- [`@vfvrpq/dsh-superagent`](https://github.com/439436269-ctrl/dsh-superagent) v0.3.0：本仓库 superagent 原型（`docs/superagent-prototype/`）的上游；README 自述「研究原型」，已有 `docs/012-dispatcher.md` 指定判定与派活的会话。

**观察（推断）**：社区在「durable」「画布」「多机调度」三个方向都有人做，但**没有一个同时是插件化 graph node 注册表 + 代码优先 node + 事件唤醒等待**；最接近的 `agent-dag-workflow` 可作对照与借鉴对象（它的 `paused` 恢复策略、`NodeDefinition set hash`、Trigger 不进 DAG 都与本课题决策一致）。

---

## 4. 对引擎选型的影响（推断）

### 4.1 可以改为复用 DSH 既有能力

| 自研件 | 改为复用 | 证据 |
|---|---|---|
| 节点 Worker 池「起会话 / 拿结果 / 续聊」 | `ctx.subagents.startActivation({ provider:'spawn', delivery:'caller' }).result`；worker 即一个有名字的驻留子级 | §1.a |
| 中心/节点内部「起一个 agent 跑 graph 的决策节点」 | `ctx.agents.create()` + `followup()` + `whenIdle()` | §1.e |
| 外部系统 → 新实例的入口（GitHub webhook 等） | `ctx.webhookRuntime` 规则 → 返回 `WebhookSessionRequest`；注意它 fire-and-forget，完成结果要自己收 | §1.e |
| 引擎配置、事件历史、等待登记的持久化 | `ctx.storageDomain` 单表（整文档原子写）起步 | §1.f |
| 引擎插件装配与在线重载 | bundle + `cordis.patch.yml` + `dsh-hmr` | §2.a |
| 中心 / 节点双引擎隔离 | `cordis:group` + `isolate` | §2.b |
| 画布 UI 外壳 | `dsh.client` 插件 + `sidebarRightTabs` / `main` slot + Remote | §2.d |
| 进程内事件 / hook | cordis `ctx.on` + `ctx.effect` | §1.g |
| durable 定时器的**实现参照** | schedule 的 `storageDomain` + 单 Host 定时器 + 重启补最新 | §1.c |

### 4.2 必须自研

1. **事件历史 + 重放内核**（`run(ctx, inputs)` 从头重跑、顺序游标 + 指纹匹配、non-determinism 错误）。DSH 没有任何组件做这件事；workflow 明确「没有日志化或恢复」，goal 的 replay 只折叠自己的 `goal/change`。
2. **`ctx.waitFor` 等待登记与事件唤醒**。`wait_agent` 只等调用者自己的收件箱、30 s 量级、任务变化不唤醒；与「实例睡着不占资源、任意 CloudEvents 信号唤醒」是两个量级。
3. **durable 定时器**（`timeout: '24h'`、cron、与审批竞速）。
4. **graph node 注册表服务**（`ctx.graphNodes.register`）——照抄 §2.c 的模式，但服务本身是新件。
5. **任务执行器**（`ctx.runTask` 纸条的子进程执行侧）。DSH 的 `ctx.ptcRuntime` 是执行**工具程序与 workflow 脚本**的共享 Node 进程，不是面向任意任务的 worker；可借鉴其进程模型。
6. **NATS / JetStream 事件接入与三叉路由**。DSH 无 NATS 依赖（plugin-contract-distribution.md §3.4 已证）。
7. **Outbox 事务**（若要多表原子）。`storageDomain` 无跨表事务；要么单表序列化，要么引擎自管一个 SQLite 文件（注意 `storage-sqlite` 与 `session-query-sqlite` 各自独占文件所有权，`packages/storage/storage-sqlite/README.zh.md:135`）。

### 4.3 会与自研件冲突的 DSH 能力

| DSH 能力 | 冲突点 | 处置建议（推断） |
|---|---|---|
| **`dsh-schedule` vs 引擎 durable 定时器** | 功能重叠但不等价：schedule 只能投 prompt 给 Session，不能回调 host；60 s 下限；错过只补最新一次（对「审批 24 h 超时」语义不符）。两者并存会出现「两套定时器、两套错过补投策略」。 | 引擎**不**用 schedule 实现 waitFor 超时；若用户要在 DSH「自动化任务」页看到引擎定时器，可把引擎定时器**投影**成 schedule 任务（只读镜像），不反向依赖。 |
| **`dsh-workflow` / `workflow-ptc` vs 引擎** | `ctx.workflowEngine` 一 context 一实现（加载第二个报错）。若引擎想**实现** `WorkflowEngine` 接口借其 UI（`ui-workflow-run` 卡片），就会顶掉官方 workflow；若不想顶掉，就不能占这个 key。 | 引擎**不**占用 `workflowEngine` key；若要借 UI，参考 ralph-bundle 在自己的 `cordis:group` 内 `isolate: { workflowEngine: true }`，但这只隔离服务实例，`ui-workflow-run` 监听的是 root `workflow/*` 事件——未验证 realm 内 emit 是否到达 root 监听器，需实测。 |
| **`dsh-subagent` vs 我们的 worker** | 不冲突，但语义要分清：subagent 的「树」是进程内的，`maxActiveSubagents` 默认 8 且不排队；foundation.md 的「每台机器一个逻辑节点、Worker 池」若直接映射为「一个根 Agent 的子树」，跨进程重启后所有权图丢失（`README.zh.md:240`）。 | Worker 池用 subagent 做执行载体，但 worker 身份（`name`）、所属节点、在跑的 task 由引擎/Ticket 领域持久化，重启后 `resume()` 重建。 |
| **`dsh-goal` / goal-round-driver vs 实例续跑** | goal 续行是「同会话自己再跑一轮」，引擎唤醒是「睡着的实例从节点处继续」。若决策节点的 Agent 自己建了 goal，会出现两套续跑逻辑互相唤醒。 | 引擎起的 Agent 不挂 `goal-round-driver`（preset 层面排除）；引擎自己的 Round 概念不借用 goal。 |
| **`ctx.tools` 同名工具** | 两个角色 bundle 都向 root 注册 `graph_*` 工具会撞（`docs/subsystems/tools.zh.md:646-655`）。 | 工具只在各自 realm / Agent scope 注册（§2.b）。 |
| **`storage-sqlite` 单写者** | 无忙等待、同步阻塞；引擎事件历史写入频繁时会与 schedule、workspace 等同一 DB 争锁。 | 引擎事件历史用**独立** SQLite 文件（经独立 `storage-sqlite` 行 + `routes` 按领域路由），或自管文件；不与 `u_schedule_tasks` 共库。 |

---

## 5. 明确「未找到证据」的点

1. 任务指定的 `app.asar/dsh/` 内部版本与源码仓是否一致——归档未解包，未比对。
2. DSH 内置的「graph node / 流程节点」注册表——不存在；只有 §2.c 列出的同构注册表。
3. `ctx.workflowEngine` 在 isolate realm 内 emit 的 `workflow/*` 事件是否能被 root 的 `ui-workflow-run` 收到——未实测。
4. 官方 Web Client 的「底部 dock」slot——`docs/subsystems/slots.zh.md` 层级表未列；`dsh-better-sidebar` 自建了底部面板，说明可行但非官方 slot。
5. `@agents-anywhere/dsh-bridge-next` 的 "event-driven session runtime" 具体协议——只读了包描述，未读源码。
6. 社区索引中各插件的质量、许可与可维护性——未逐一核查；`dsh-superagent` 自述为研究原型，`agent-dag-workflow` 未读 LICENSE。

## 6. 本轮用到的只读命令

```sh
ls -la "/Applications/DeepSeek Harness.app/Contents/Resources/"        # app.asar 为单文件
cd ~/workspace/deepseek-harness && git describe --tags && git log -1
ls ~/.dsh/profiles/*/package.json ~/.dsh/profiles/*/cordis.patch.yml ~/.dsh/cordis.patch.yml
node -e "...require('./<pkg>/package.json')..."                        # 读取已装 bundle manifest
curl -sS https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json -o /tmp/dsh-eco/index.json
curl -sS https://raw.githubusercontent.com/<owner>/<repo>/main/README.md  # 4 个社区仓库
```

未修改 DSH 仓库、未安装插件、未启动宿主、未操作 Issue；本仓库只新增本文件。
