# DSH 社区工作流 / 画布 / 定时类插件逐个取证

> 状态：只读调研，不含实现；除本文外未修改任何文件，未向 DSH profile 安装任何东西（tarball 只解到 `/tmp/dshwf/pk/`）。
>
> 取证时间：**2026-11-24**。
>
> 与已有证据的关系：宿主自身能力（`ctx.workflowEngine`、`ctx.schedule`、`storageDomain` 等）与「社区现状」概览见 [dsh-plugin-ecosystem.md](dsh-plugin-ecosystem.md)，本文**不重复**，只做它 §3.2 / §5.6 留下的空白：逐包读源码、给判定。
>
> 取证件约定：【索引】= `dsh-plugin-catalog/index.json` 条目；【npm】= `registry.npmjs.org` / `api.npmjs.org` 元数据；【README 声明】= 包内 README；【源码证实】= 读过 tarball 内实现（路径写作 `包名@版本: 文件:行号`，tarball 解于 `/tmp/dshwf/pk/<name>/package/`）。写「未读」即本轮没有取到源码、不下断言。

---

## 0. 一页结论

| 问题 | 答案 |
|---|---|
| 社区里有没有 ComfyUI 式「可视化节点画布 + 可扩展节点注册」的成品？ | **有一个**：`@gm-hz/agent-dag-workflow`（`@xyflow/react` 画布 + `ctx.workflowNodes.register()` 节点注册表 + JSON Schema 类型校验 + Journal/Checkpoint/Replay + Cron/Webhook/钉钉 Trigger）。但它的节点是**模板驱动**（`WorkflowTemplate` JSON → `uses: type@version`），不是我们的 `defineNode({ run(ctx) })` 代码优先；DAG 严格无环；等待只有 `human.approval` 且走进程内 `approval` 服务；没有 durable 定时器、没有 NATS/CloudEvents 入口。 |
| 能不能直接用？ | **不能直接用**：节点模型（模板 vs 代码）、执行语义（节点级 checkpoint vs run 重放）、等待/定时器（无 durable waitFor）、事件入口（Webhook/钉钉 vs NATS）四项都与 foundation.md §1 不同向。 |
| fork 还是从零写？ | **不建议 fork**（源码仓是 monorepo，npm 包只发 `lib/` 编译产物 34 kLOC，且 MIT 仓库 10 星、单人维护、1.0.1 后无更新）。建议**从零写，以它为对照与抄作业对象**（§4 列了 8 个可直接借鉴的设计点）。 |
| 其他画布类？ | 其余 7 个「可执行工作流画布」都是**自绘 React/SVG 画布 + 固定节点种类 + 每节点一个子会话**的任务编排器，没有节点注册表，画布不能复用。 |
| 定时类？ | 全部是「到点开/唤醒一个 agent 会话」（croner/setInterval + `agents.create`/`followup`/`sessionController`），与我们 durable 定时器无关；`@soffits/dsh-cron-jobs` 的「shell 命令不碰模型」是唯一变体。 |
| 社区主流形态？ | 按 npm 月下载看，最主流的是**任务看板 + cron**（`@linxin666/dsh-client-ui-task-board` 127 k/月）和**多 agent 派发 preset**（`dsh-proactive` 13.6 k、`@nelsonlongxiang/dsh-open-a2a-net` 12.3 k、`@goodandready/dsh-cron` 13.2 k）；画布类最高 `dsh-thoughtdag` 4.9 k（思维导图，不是执行引擎）、`@ninkch/dsh-infinite-canvas` 12.2 k（视频创作，不是引擎）；真正「画布即工作流定义」的最高只有 `dsh-harness-one` 2.9 k / `dsh-workflow-canvas` 2.2 k。 |

---

## 1. 索引位置与格式

**事实**

- 配置来源：【命令输出】`~/.dsh/profiles/desktop/cordis.patch.yml:133-139`：`- id: plugin-market` → `name: '@deepseek-ai/dsh-plugin-market'` → `config.indexes: ['https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json']`，注释写明「awesome-dsh-plugin 社区插件目录（format 1，npx 上的 dsh-plugin-catalog）」。`~/.dsh/plugins`、`~/.dsh/profiles/*/node_modules`、`~/.dsh/cache` 下**没有**本机副本，只能从 CDN 取。
- 索引包：【npm】`dsh-plugin-catalog` latest `2026.1123.26272`（2026-11-23T06:23Z 发布，141 个版本），repository `github.com/awesome-dsh-plugin/awesome-dsh-plugin`，homepage `awesome-dsh-plugin.com`。
- 数据格式：【命令输出】`index.json`（5.48 MB）顶层 `format: 1`、`title`、`description`、`metadata.{categories,labels,sortKeys}`、`plugins[]`。每个条目：`name`（npm 名）、`title`、`description.{en,zh}`、`homepage`（`awesome-dsh-plugin.com/p/<owner>/<repo>/`）、`repository.url`、`metadata.{category,keywords,labels,sortKeys}`、`versions[]`（`version`、`publishTimestamp`（秒）、`source.type: 'npm'`、`engines`）。
- **索引只保留每个包的最新一个版本**：【命令输出】6717 个条目全部 `versions.length === 1`。索引滞后 npm：如 `dsh-workflow-canvas` 索引 `1.2.0`（11-22）而 npm latest `1.5.0`（11-24）；`dsh-thoughtdag` 索引 `0.5.28` / npm `0.5.29`。下文版本以 npm 为准并标注。
- 分类计数：【命令输出】`metadata.category === 'workflow'` **441** 个（与上一轮一致）。

**关键词命中（索引全文 = name + title + en/zh 描述 + keywords；不去重，附录 A–D 给全表）**

| 关键词 | 命中 | 其中真正与「graph 引擎」相关 |
|---|---|---|
| canvas / 画布 | 50 | 12（§2.2 / §2.3） |
| dag / graph / 拓扑 | 85 | 6 |
| pipeline | 41 | 3 |
| cron / schedul / timer | 122 | 8（§2.4） |
| orchestrat / dispatch / swarm / multi-agent | 112 | 6（§2.5） |
| 去重后四类并集 | **250** | **本节深读 31 个**（§2），其余见附录 |

`workflow` 分类的 441 个按描述关键词粗分（多标签）：任务看板/todo 143、子 agent 派发/swarm/team 119、preset/skill/命令 112、pipeline/graph 73、cron/定时 51、**画布/可视化 18**、其他 129。

---

## 2. 逐包取证

### 2.1 `@gm-hz/agent-dag-workflow` —— 唯一的「画布 + 节点注册表 + durable」成品

**定位**：Host-neutral 的持久化 DAG 工作流运行时，一个 npm 包同时提供 SDK/CLI/MCP/Skill/DSH bundle/Canvas。**版本** `1.0.1`（npm，2026-10-07；首发 2026-08-30，共 2 版）。**许可** MIT（npm `license` + GitHub `spdx_id`）。**仓库** [GM-HZ/agent-dag-workflow](https://github.com/GM-HZ/agent-dag-workflow)（10 ★ / 2 fork，最后 push 2026-10-07）。**下载** 1433/月。**维护者** `gm-hz`（1 人）。**peer**：`@deepseek-ai/cordis ~4.0.4`、`dsh-typert-protocol >=0.2.0-rc.2 <0.3.0`、`react ^18.2`。

**实际能力（全部【源码证实】，路径前缀 `@gm-hz/agent-dag-workflow@1.0.1:`）**

| 维度 | 事实 | 证据 |
|---|---|---|
| 画布 | **`@xyflow/react` 12.12.0**（打包进 `lib/canvas/client.js`，含 `Background/Controls/MiniMap`、`onConnect`、`snapToGrid`、`connectionLineStyle`）；Client 经 `dsh.client` 声明（`platform: web`，inject `api-remotes`/`ui-session`/`ui-renderer`/`ui-layout`），Host↔Client 走 Typert（`lib/typert.host.js`、`lib/typert.remote-client.js`） | `package.json` dependencies `"@xyflow/react": "^12.11.3"`；`lib/canvas/client.js:11110,14150`；`package.json#dsh.client`；`lib/canvas/client/index.js`（`slots.register`） |
| 画布编辑什么 | 同一份 `WorkflowTemplate` JSON（含 `layout.canvas.positions`，`layout` 不进 semantic hash）；不是第二套图格式 | `spec/workflow-template-v1.md:1-22, 236-246`；`README.md:291` |
| 节点定义 | `WorkflowNodeDefinition { type, version, title, configSchema, inputSchema, outputSchema, outputPorts, requiredOutputPorts, capabilities, effects: 'deterministic'\|'external', retry, execution?: 'activity'\|'human-wait', implementationDigest, validateConfig?, dependencies?(config), execute(ctx) }` | `lib/core/types.d.ts:244-276` |
| 节点注册（第三方可扩展） | **是**。DSH adapter 向 cordis `Context` 声明合并出 10 个服务：`workflowNodes`（`register(definition) → disposer`）、`workflowCapabilities`、`workflowScripts`、`workflowTemplates`、`workflowRuns`、`workflowTriggers`、`workflowBindings`、`workflowIngress`、`workflowDelivery`、`dagWorkflowEngine`；事件 `dag-workflow/event`。这正是我们 §2.c 想要的 `ctx.graphNodes.register` 形态 | `lib/adapters/dsh/services.d.ts:6-21, 118-124` |
| 内置节点 | `core.start@1 / core.end@1 / core.condition@1 / core.script@1 / core.foreach@1 / workflow.call@1 / tool.call@1 / agent.run@1 / human.approval@1` | `docs/architecture.md:74-84` |
| 两级扩展规则 | 普通能力 → Host Tool + `tool.call@1`；只有「暂停恢复、长任务 checkpoint、补偿、专属容器语义」才允许自定义 `WorkflowNodeDefinition`；**不存在第三层** | `spec/workflow-template-v1.md:66-71`；`docs/architecture.md:86-92` |
| 端口类型化 / 连线校验 | 边只有 `source/target/sourcePort`（多出口节点用 `sourcePort`，普通节点隐式 `success`），**没有 target port**；类型靠 JSON Schema：节点 `inputSchema/outputSchema`、边的 binding `path`、「可静态判定的 JSON Schema 类型兼容检查」在**发布时**由编译器做，运行时再验一次。Schema 只收有界子集（`pattern/$ref/组合递归` 等 fail closed） | `spec/workflow-template-v1.md:26-35, 112-118, 193-201, 258` |
| 执行模型 | **严格 DAG**：编译器拒绝「普通回边」、dangling edge、重复 edge id、未知 port；有 Condition（静态多出口）、Foreach（有界批处理 + 逐项 checkpoint）、`workflow.call`（同步 invoke）、`maxConcurrentNodes` 并行；**不支持 while / 动态图 / 动态 Tool 名** | `spec/workflow-template-v1.md:112-118, 258`；`docs/architecture.md:94` |
| 持久化 | SQLite（`dshHomePath('agent-dag-workflow/workflows.db')`）；`WorkflowRun / WorkflowEvent(seq) / WorkflowCheckpoint / Artifact / IngressRecord / DeliveryRecord`；Event batch 与 Checkpoint **同事务** + `expectedSeq` CAS + 16 MiB 上限 | `cordis.patch.yml:1-6`；`docs/architecture.md:56-67, 131-148` |
| 重放 | 三种：`inspect`（只读）、`recorded`（新 run：external 节点用已提交 Artifact，deterministic 节点重算）、`live`（新 run 重调外部）。**节点粒度**（按 `effects` 与 `implementationDigest` 恢复），不是我们「run 从头重跑 + 顺序游标指纹匹配」 | `README.md:206-221`；`lib/core/types.d.ts:258-270` |
| 恢复 | `resume({ runId, unknownNodeResolutions: {'retry'\|'fail'} })`；外部 Tool 在未知副作用边界恢复时进入 `paused`，需操作者显式选择 | `lib/adapters/dsh/types.d.ts:138-146`；`README.md:293` |
| 等待 | 只有 `human.approval@1`：提交 `waiting` checkpoint 后调用 Host `WorkflowApprovalGateway.request()`；DSH adapter 把它桥到 DSH 的 **`approval` 服务（进程内）**，要求 owning DSH Agent 存在。**没有** `waitFor(signal)`、没有通用事件唤醒 | `lib/core/nodes.js:285-330`；`lib/adapters/dsh/services.js:153,236-244`；`lib/adapters/dsh/bundle.js:8`（`inject = ['tools','subagents','approval','skills','agents']`） |
| 定时器 | **节点内无 durable 定时器**（`policy.timeoutMs` 是 `setTimeout`，`lib/core/engine.js:433`）。Cron 是 **Trigger 级**：`lib/triggers/cron/index.js`（自写 5 段 cron 解析，`sourceEventId = 'cron:<minute>'` 做幂等），只负责 launch 新 run，不能唤醒睡着的 run | `lib/triggers/cron/index.js:10-68`；`docs/architecture.md:163-171` |
| 事件入口 | Trigger 不进 DAG：`验签 → Envelope → Ingress accept/dedupe → Binding → 幂等 launch → Run → Result Delivery`；reference adapter 只有 **cron / webhook / dingtalk**；Trigger 类型可经 `ctx.workflowTriggers.register({ uses, configSchema })` 扩展。**无 NATS / CloudEvents** | `docs/architecture.md:153-171`；`lib/triggers/{cron,webhook,dingtalk}/`；`lib/adapters/dsh/services.d.ts:22-26` |
| 多 Worker | 「1.0 默认单进程单 Runner；不内置多线程 Worker、进程池或分布式调度」；SQLite Coordinator 有 queue/claim/lease/heartbeat/过期接管 | `docs/architecture.md:171` |
| 与官方 workflow 冲突 | 不占用 `ctx.workflowEngine`（bundle `inject` 列表里没有它），自占 `dagWorkflowEngine` | `lib/adapters/dsh/bundle.js:8`；`services.d.ts:20` |

**与我们需求的差距**

1. 节点模型：模板驱动（`uses: type@ver` + `with` 配置 + binding），`execute()` 是 NodeDefinition 的实现而非工作流本体；我们要的是 `defineNode({ ports, run(ctx) })` 代码优先、细逻辑写在 run 里。它的 `core.script@1` 是纯 JSON 表达式 DSL，**明确禁止**在模板里写代码。
2. 执行语义：节点级 checkpoint + Artifact 恢复；我们是 run 从头重放 + 顺序游标/指纹匹配 + non-determinism 错误。两者互不兼容。
3. 等待：只有人工审批且是进程内 Promise；无 `waitFor(signal)`、无「睡着不占资源」、无三叉路由。
4. 定时器：无 run 内 durable timer；Cron 只能开新 run。
5. 事件入口：Webhook/钉钉 reference adapter；无 NATS/JetStream、无 CloudEvents。
6. 图结构：严格 DAG，无循环（我们一期也不用，但「架构不封路」）；无 spawn（异步子图、事件回联）。
7. 工程面：npm 只发编译产物；源码仓 10 ★、单人、1.0.1 后 7 周无更新；`@xyflow/react` 与 DSH client bundle 打包在一起，不能单独抽出画布复用。

**判定：仅作对照（强烈建议精读，不 fork）**。理由：它是社区里唯一把「画布 ↔ 节点注册表 ↔ Journal/Checkpoint ↔ Trigger」四件事做齐的实现，其 fail-closed 设计、`requires` allowlist、`effects: deterministic|external`、Trigger 不进 DAG、Ingress 去重键、`unknownNodeResolutions` 等都与我们的决策同向，可作设计评审对照；但节点模型与恢复语义是另一条路线，fork 等于重写内核。

### 2.2 其他「可执行工作流画布」（7 个）——全部是固定节点的子会话编排器

| 包 | 版本 / 日期 | 许可 / ★ / 月下载 / 维护者 | 画布实现 | 节点种类（固定？） | 执行 | 持久化/恢复 | 定时/事件 | 证据 |
|---|---|---|---|---|---|---|---|---|
| `dsh-knj-workflow` | 2026.11.16（npm，首发 08-23，25 版） | MIT / 3 ★ / 2240 / `yangdongzhen590` | **自绘 React + SVG**（无 xyflow；`lib/client.js` 4847 行，箭头手工绘制） | 6 种固定：`start/end/task/gateway-xor/gateway-and/human`；**无注册表** | 跑在**官方 `ctx.workflowEngine`** 沙箱脚本 `lib/orchestrator.js` 上（README「从 parent agent 作用域取 workflowEngine」）；允许回环（驳回重跑），靠节点级 `maxRuns`（默认 3）防死循环；并行由 `gateway-and` 分叉 | 每阶段结果落 `tasks/<id>/stages/<stage>.json`；断点协议 = `initialResults + 跳过集合 + decided/decision`（节点级）；人工审批经 HTTP `/devtask/tasks/:id/decide` | 定时：为 `dsh-scheduler` 提供 `knjWorkflowScheduler` 进程内服务（开新任务）；无事件入口 | `dsh-knj-workflow@2026.11.16: lib/graph.js:16,394`；`lib/orchestrator.js:33-56,120,365-388`；`README.md:36-56,118-126` |
| `dsh-workflow-canvas` | 1.5.0（npm 11-24；索引 1.2.0；首发 11-20，18 版） | MIT / 20 ★ / 2166 / `wasabi2575` | **自绘**（React `h()` + 绝对定位节点 + `MouseDown` 拖拽 60 处 + 自算 `edgePath`；无 svg 库依赖；`client.js` 315 KB 单文件） | 固定：`lead / agent(子代理) / condition / entry / session-ref`；边有三种语义 `prompt / structured / session`；**无注册表** | Host 侧 `executePlan`：Kahn 拓扑（前向边无环）+ 受控回环边（`loop:true, maxIterations 1-10`，起点必须是 condition）+ 事件驱动并发池（`Promise.race`，默认 4，可 1-8）+ 条件剪枝（switch/multiMatch）；中间 `lead` 节点暂停返回 `need-lead`，主对话拍板后再调 | `.workflow-canvas-state.json` 原子落盘（按会话）；`retryFailed/fromNodes` 复用成功节点缓存；`childByNode` 冷恢复子会话 | 无定时器；无事件入口 | `dsh-workflow-canvas@1.5.0: docs/MECHANISM.zh.md:11-78`；`client.js:4734-4775` |
| `dsh-workflow-orchestrator` | 0.3.0（11-22；首发 11-19） | MIT / 1 ★ / 563 / `czyt1988` | **自绘 React + SVG**（`PointerDown`、`viewBox`；`lib/client.js` 172 KB） | 7 种固定：任务 / 定时 / 动作 / 等待任务 / 并行网关 / 判断 / 终止；**无注册表**；peer `dsh >=0.2.2-rc.3` | 严格 DAG（有环拒绝执行）；每任务节点 = `sessionController.create` 一个真实会话；并发 ≤8、单任务 6 h 超时；判断只能 CONTINUE/STOP | `workflows.json` + 最近 20 次运行；**无断点续跑**（「从此节点开始执行」只缩范围） | **定时节点**：起始位置由宿主调度器每 10 s 检查、周期触发开新 run，上次触发时间在内存（重启不补）；中置定时节点等下一次触发；无事件入口 | `dsh-workflow-orchestrator@0.3.0: README.md:230-249, 334-351` |
| `dsh-harness-one` | 0.13.0（11-20；首发 08-27，19 版） | MIT / 33 ★ / 2866 / `chumingjun` | 自绘（`dsh-ccpg-canvasui/lib/client.js` 2928 行，少量 `<svg viewBox>`；无图编辑库）；包是 7 个 `dsh-ccpg-*` 子包的合体，**client inject 含 `@deepseek-ai/dsh-client-runtime`**（DSH 0.2 已移除的模块） | 10 种固定：`input/agent/script/condition/http/systemone/output/notify/note/subworkflow`；脚本节点用 `quickjs-emscripten`；**无注册表** | 引擎 v2：就绪节点排队 + 并发上限 + 节点超时 + 条件分支（关键词 include/exclude）；`cron-parser` | SQLite 运行历史；**断点续跑**（图 fingerprint 一致才允许，搬运 success 节点产物）；进程异常终止的 run 标 `interrupted` 不自动续 | Cron（misfire `ignore/catchUp`）+ **Webhook**（HMAC 验签，`/wf1/api/hooks/*`） | `dsh-harness-one@0.13.0: dsh-ccpg-orchestrator/lib/engine.js:1-23`；`lib/assistant.js:11`；`lib/index.js:11,134,1043-1060`；`lib/schedule.js:1-15`；`package.json#dsh.client.inject` |
| `dsh-workbench-automation` | 0.4.12（11-22；首发 11-17） | MIT / 1 ★ / 2135 / `yangyuqi_261024` | 无画布（规则表单） | 规则 = trigger（定时/域事件/手动）+ 白名单 action；依赖 `dsh-workbench-host` | 插件内 30 s 定时器驱动 | — | 定时/「域事件」/手动 | `dsh-workbench-automation@0.4.12: README.md:1-15`；`lib/domain/actions.js:1-30` |
| `dsh-thoughtdag` | 0.5.29（npm 11-23；索引 0.5.28；首发 09-05，45 版） | MIT / **806 ★** / 4887 / `chatchan92` | ThoughtDAG SPA（**cytoscape + dagre** 布局）以 iframe 嵌入；`compatibility.dshReleases` 只声明 **0.1.2–0.1.5-rc.x** | 对话/思维图节点，可编辑、分支、合并、「local agent」；**不是执行引擎** | — | — | — | `dsh-thoughtdag@0.5.29: package.json#dsh`；`dist-app/assets/cytoscape.esm-*.js`、`dagre-*.js`；`README.md:1-25` |
| `dsh-plugin-inspiration-workbench` | 0.13.7（11-18；首发 11-11） | MIT / 1 ★ / 3480 / `wilshi` | 自绘自由画布（会话卡片拖拽，iframe） | 会话卡 + 文件卡 + pipeline（索引描述）；未深读 | — | — | — | 【索引】+ README 首段 |

**共同差距**：画布都是自绘、节点种类写死、每个「任务节点」= 一个 DSH 会话、没有 `ctx.<registry>.register()` 式扩展点；持久化是「每阶段结果落盘 + 跳过集合」，没有事件历史/重放；定时全部是「到点开新 run」。**判定：全部仅作对照**（`dsh-workflow-canvas` 的受控回环 + 条件剪枝 + `need-lead` 暂停语义、`dsh-harness-one` 的 webhook HMAC + 断点续跑 fingerprint 校验值得借鉴）。

### 2.3 素材/创作类画布（6 个）——不是工作流引擎

| 包 | 版本 / 日期 | 许可 / ★ / 月下载 | 画布技术 | 与本课题关系 | 证据 |
|---|---|---|---|---|---|
| `@ninkch/dsh-infinite-canvas` | 0.21.3（npm 11-23；索引 0.21.2；58 版） | Apache-2.0 / **127 ★** / 12153 | 自绘（`client.js` 单文件，`upstream` 依赖链驱动生成） | 短剧创作节点（脚本/分镜/图像/视频），节点 = 生成工作台；**无执行引擎抽象、无注册表** | `@ninkch/dsh-infinite-canvas@0.21.3: README.md:1-25`；`client.js` |
| `@haitang-hub/dsh-infinite-canvas` | 0.2.36（11-21；首发 11-09） | MIT / 0 ★ / 3571 | 外部 SPA 经 iframe 嵌入 + MCP 桥（`canvas_apply_ops` 等 7 个工具） | 同上；索引有「Node plugin」字样但未读源码证实其扩展协议 | `@haitang-hub/dsh-infinite-canvas@0.2.36: README.md:1-30` |
| `@miragari/dsh-client-canvas` | 0.1.5（10-29；5 版） | MIT / 3 ★ / 1627 | 自绘（`onPointerDown` 14 处，iframe 预览素材） | 多模态素材节点连线组织上下文；无执行 | `@miragari/dsh-client-canvas@0.1.5`（grep）；README 首段 |
| `dsh-comfyui-canvas` | 0.1.13（10-01；13 版） | MIT / ★ 取不到（GitHub 404）/ 1116 | **iframe 嵌入 ComfyUI 本体**（`litegraph` 字样来自 ComfyUI 页面） | 把 ComfyUI 当外部应用嵌进来，**不是**在 DSH 里实现节点画布 | `dsh-comfyui-canvas@0.1.13`（grep：`iframe` 27、`LiteGraph` 24） |
| `dsh-plugin-canvas` | 0.1.0（09-05） | MIT / 2 ★ / 649 | 自绘无限会话画布 | 会话/工作区卡片的空间摆放；无执行 | README 首段 |
| `dsh-agent-canvas` | 0.1.0（08-16） | MIT（npm）/ 3 ★ / 812 | 自绘 | **只读**展示 Agent/Subagent/Workflow/Phase 关系 | README 首段 |

**判定：不相关**（`dsh-comfyui-*` 另有 5 个同类嵌入/工具包，见附录 A/B，全部是「驱动外部 ComfyUI 服务器」）。

### 2.4 定时 / cron 类（8 个）——全部是「到点唤醒 agent 会话」

| 包 | 版本 / 日期 | 许可 / ★ / 月下载 | 实现（【源码证实】） | 持久化 | 与 durable timer 的差距 | 判定 |
|---|---|---|---|---|---|---|
| `@goodandready/dsh-cron` | 0.3.52（11-19；**131 版**） | MIT / 17 ★ / 13246 | `croner` + `setInterval`；到点 `agents.create` / `followup`；可写系统 `crontab`；声明兼容 DSH `0.2.1-rc.2 ~ 0.2.2-rc.5` | 未读 | 只投 prompt；无回调、无与等待竞速 | 不相关 |
| `dsh-proactive` | 0.3.2（10-26） | MIT（npm）/ 17 ★ / 13601 | 宿主级闹钟，`$DSH_HOME/proactive/` 落盘，到点 `resume` 冷会话 | 文件 | 同上 | 不相关 |
| `@soffits/dsh-cron-jobs` | 0.22.2（11-22） | MIT / 2 ★ / 5062 | `croner` + `storageDomain` + `sessionController`；三种 job：**shell 命令（不碰模型）** / gated（命令输出说有事才唤醒 agent）/ agent；结果可投递给其他插件 | `storageDomain` | 唯一「定时触发非模型动作」的变体，但仍是 host 内 croner，无 per-run timer | 仅作对照 |
| `@opendsh/dsh-plugin-scheduled-tasks` | 0.2.4（08-23） | MIT / 9 ★ / 1004 | `croner` + `setInterval` + `storageDomain` + `agents.create`；client inject 含 `dsh-client-runtime`（0.2 已移除） | `storageDomain` | 同上 | 不相关 |
| `dsh-plugin-cron-scheduler` | 0.2.10（09-28） | MIT / 0 ★ / 1253 | JSON store + 每任务一条 `ctx.timer` 链 + `agent.followup()` 注入 user 消息 | JSON | 同上 | 不相关 |
| `@weibaohui/dsh-tasks` | 0.5.11（10-31） | MIT / 11 ★ / 2665 | 【README 声明】cron → 新会话跑 prompt | 未读 | 同上 | 不相关 |
| `@linxin666/dsh-client-ui-task-board` | 0.4.21（11-22；**73 版**） | Apache-2.0 / **10617 ★**（仓库 `zhu1090093659/dsh-web` 是个多插件集合）/ 127322 | `setInterval` + `sessionController`；看板卡片跑真实会话，可挂 cron | 未读 | 同上 | 不相关（下载量最大，但形态是看板） |
| `dsh-workflow-orchestrator` 的定时节点 | 见 §2.2 | — | 宿主每 10 s 轮询，上次触发时间在内存 | 内存 | 重启不补周期触发 | 见 §2.2 |

### 2.5 多机派发 / 事件驱动入口类（6 个）

| 包 | 版本 / 日期 | 许可 / ★ / 月下载 / 维护者 | 实际能力 | 证据 | 判定 |
|---|---|---|---|---|---|
| `dsh-alpha` | 0.2.0（08-25；2 版） | **无 LICENSE**（npm `license` 为空、GitHub `lic: None`）/ 6 ★ / 759 / `songofhawk` | master + 反向 WebSocket gateway（`ws://:4310`）+ 多 worker；工具 `list_agents/dispatch_task/task_status/agent_approve/...`；审批双向传导；**任务存 `tasks.json`（JSON 文件，非 SQLite——修正上一轮 §3.2 的说法）**；client inject 含 `dsh-client-runtime`；最后 push 2026-11-08 | `dsh-alpha@0.2.0: README.md:9-20,101-135,153-160`；`src/lib/task-store.js:18-49` | 仅作对照（多机派发协议）；无许可证不可用 |
| `dsh-remote-agent` | 0.9.12（10-21；23 版） | MIT / 6 ★ / 1817 / `zbzbhs` | 副机自跑 DSH，主机经 relay 下发任务、取产物（SMB/文件服务）；19 个工具；是「远程执行节点」而非编排引擎 | `dsh-remote-agent@0.9.12: README.md` 目录；`lib/node/runner.js` | 不相关（与我们「节点 = 逻辑节点」概念有重叠，可参考其 transport/pairing） |
| `@nelsonlongxiang/dsh-open-a2a-net` | 0.7.0（11-07；53 版） | MIT / ★ 取不到（GitHub API SSL 中断）/ 12283 / `yuanguang` | A2A 网络：签名 agent card、种子发现、`a2a_route/a2a_tasks/a2a_probe`；owed-book + 死信 + 180 s 回复等待；**「Canvas teams」是路由分组名，不是可视化画布**（`nexus-stage/src/canvas-wire.ts`）；client inject 含 `dsh-client-runtime` | `@nelsonlongxiang/dsh-open-a2a-net@0.7.0: README.md:36-66,113-125` | 不相关（身份/路由层对照） |
| `@vfvrpq/dsh-superagent` | 0.3.0（11-15；8 版） | MIT / 0 ★ / 1740 / `vfvrpq` | 本仓库 superagent 原型上游；工单 + IM 桥（JSON-lines）+ `orchestrator_claim` 调度者；自述「研究原型」；peer `dsh ^0.2.1-alpha.2` | `@vfvrpq/dsh-superagent@0.3.0: README.md:1-15,59-80`；`lib/claim.js:7-36` | 不相关（已是上游） |
| `@xiangyixie/dsh-superagent` | 0.24.0（11-19；47 版） | MIT / 5 ★ / 9102 / `xiangyixie` | 一句目标 → 并行任务线（默认 4）→ 汇总；运行落盘重启可续、token 硬上限；**要求 node >=24.9** | `@xiangyixie/dsh-superagent@0.24.0: package.json#engines`；README 首段 | 不相关 |
| `dsh-workflow-zcode` | 0.2.3（11-21；5 版） | MIT / 0 ★ / 999 / `qiaozhao` | 跑 `.dwf.ts` 编排脚本：`node:vm` 子进程 + 命名持久子 agent + **SQLite journal（`~/.dsh/zcode-workflow/runs.db`），失败 run 可 resume、完成节点不重调模型**；注册 `zcodeWorkflow` 服务给其他插件；peer `dsh >=0.2.1-rc.2` | `dsh-workflow-zcode@0.2.3: README.md:1-40` | 仅作对照（代码优先 + journal 的最接近样例，但节点 = 子 agent ask，无画布、无端口） |

其他派发类（`@wjj865-code/dsh-orchestrator`、`dsh-task-dispatch`、`dsh-router-worker`、`dsh-punky-swarm` AGPL-3.0）本轮未取源码，维持上一轮【README 声明】结论。

### 2.6 只读观测类（3 个）——「把会话画成图」，不是编辑器

- `dsh-flowglass` 0.7.5（MIT / 24 ★ / 2319）：ReactFlow + mermaid + d3-selection 渲染会话执行流（`dsh-flowglass@0.7.5` grep 计数）。
- `dsh-task-graph` 0.1.0（MIT / 2 ★ / 831）：自绘「任务 → Agent/Tool → 子任务 → 改动 → 测试」图谱，无图库依赖。
- `dsh-agent-canvas` 0.1.0：见 §2.3。

**判定：不相关**，但 `dsh-flowglass` 证明 `@xyflow/react` 能在 DSH client bundle 内正常工作（第二个样本，第一个是 agent-dag-workflow）。

---

## 3. 单独回答

### 3.1 按 npm 月下载看，社区「工作流编排」的主流形态

| 形态 | 代表 | 月下载（2026-11-24 取） | 结论 |
|---|---|---|---|
| 任务看板 + cron + 子会话 | `@linxin666/dsh-client-ui-task-board` 127 322；`dsh-agent-board`、`dsh-taskboard` | 10²–10⁵ | **最主流**。本质：卡片 → 开一个 DSH 会话跑 prompt，cron 到点再开一个 |
| 宿主级 cron / 唤醒 | `dsh-proactive` 13 601；`@goodandready/dsh-cron` 13 246；`@soffits/dsh-cron-jobs` 5062 | 10³–10⁴ | 第二主流 |
| 多 agent 派发 preset / 网络 | `@nelsonlongxiang/dsh-open-a2a-net` 12 283；`@xiangyixie/dsh-superagent` 9102；`@wjj865-code/dsh-orchestrator` 9254 | 10³–10⁴ | 第三。形态是 **Markdown/prompt preset + 工具**（模型自己拆活），不是图 |
| 对话式 / 思维图画布 | `dsh-thoughtdag` 4887（806 ★）；`dsh-workflow-map` | 10³ | 可视化但不执行 |
| **画布即工作流定义（可执行）** | `dsh-harness-one` 2866；`dsh-knj-workflow` 2240；`dsh-workflow-canvas` 2166；`@gm-hz/agent-dag-workflow` 1433；`dsh-workflow-orchestrator` 563 | 10²–10³ | **小众**。5 个加起来的下载量不到看板类的 1% |

星标维度：除 `dsh-thoughtdag`（806 ★，非引擎）和 `@ninkch/dsh-infinite-canvas`（127 ★，视频创作）外，所有可执行工作流画布 ≤ 33 ★。**没有一个「代码脚本式工作流」插件进入下载前 20**——社区里「代码优先」只有官方 `ctx.workflowEngine` 与 `dsh-workflow-zcode`（999/月）。

### 3.2 有没有任何一个已具备 ComfyUI 式「可视化节点画布 + 可扩展节点」？

**有一个半**：

- **一个**：`@gm-hz/agent-dag-workflow`——`@xyflow/react` 画布 + `ctx.workflowNodes.register(WorkflowNodeDefinition)` + `outputPorts` + JSON Schema 类型校验 + 画布工具列表自动反映当前 Authority 可见的 Tool。差在：节点 = 模板里的 `uses` 引用（实现由 Host 注册，工作流作者只能在画布上**配置**节点、不能**写**节点逻辑）；无 target port / 无 handle 级类型检查（类型校验在发布时）；DAG 无环；无 waitFor / durable timer；事件入口只有 Webhook/钉钉。
- **半个**：`dsh-workflow-canvas`——画布语义最接近「事件驱动图」（条件多路、受控回环、事件驱动并发池、`need-lead` 暂停），但节点种类写死、自绘画布、持久化只是快照。

若以「ComfyUI = 画布上每个节点类型来自插件注册表、连线按端口类型校验、执行器按图跑」为标准，**社区没有一个完全达标**；最接近的是 agent-dag-workflow，差的是「代码优先节点 + 端口级类型 + 事件唤醒」三件事。

---

## 4. 结论：该直接用、fork 还是从零写

**结论：从零写；`@gm-hz/agent-dag-workflow` 作为设计对照，不 fork；其余全部仅作对照或不相关。**

理由（按重要度）：

1. **节点模型不同向**。我们要 `defineNode({ ports, run(ctx) })`，run 里写 `await ctx.waitFor(...)`；它是 `WorkflowTemplate` JSON + `uses: type@version` + Host 注册的实现。改它等于把编译器、引擎、画布数据模型全部换掉。
2. **恢复语义不同向**。它是节点级 checkpoint + Artifact 恢复 + `unknownNodeResolutions`；我们是 run 从头重放 + 顺序游标/指纹。两者决定 Journal schema、事件类型、错误模型，不可共存。
3. **等待与定时器缺失**。它没有 `waitFor`、没有 run 内 durable timer、没有三叉路由；这正是我们要自研的四件核心（上一轮 §4.2 的 1–3）。
4. **工程面**：npm 只发编译产物（34 kLOC `lib/`），源码仓 10 ★、单人、1.0.1 后无更新；`@xyflow/react` 与 DSH client 打包在一起无法单独复用。
5. **可复用的只有 DSH 宿主能力**（上一轮 §4.1 已列），社区插件没有提供额外可复用件。

**若一定要 fork，推荐 fork 哪个**：`@gm-hz/agent-dag-workflow`（MIT，四件套齐全，源码在 GitHub）。但要清楚：fork 后保留的只有「画布交互 + Typert 通路 + Trigger/Ingress 骨架 + DSH adapter 装配方式」，内核仍要重写；且它的 peer 锁 `>=0.2.0-rc.2 <0.3.0`，DSH 升到 0.3 时要跟着改。

**从零写时可直接借鉴的 8 点（全部来自 agent-dag-workflow，【源码证实】）**

| # | 借鉴点 | 出处 |
|---|---|---|
| 1 | 节点注册表 = cordis Service + `register() → disposer` + `Context` 声明合并（`ctx.graphNodes`），与 DSH 五种注册表同构 | `lib/adapters/dsh/services.d.ts:6-21,118-124` |
| 2 | 节点声明 `effects: 'deterministic' \| 'external'` 决定重放时重算还是从历史注入 | `lib/core/types.d.ts:258-264` |
| 3 | `implementationDigest` 进计划快照：节点实现变了旧 run 不可盲恢复 | `lib/core/types.d.ts:269-270` |
| 4 | 模板 `requires` allowlist + capability 裁剪：注册的节点只能看见它声明的 capability，fail closed | `spec/workflow-template-v1.md:37-64` |
| 5 | Trigger 不进 DAG；Ingress 去重键 = `binding revision + source + sourceEventId`（服务端生成，不信来源自报）；`received/deduplicated/launched` 状态机 | `docs/architecture.md:153-171`；`lib/triggers/core/types.d.ts:66-88` |
| 6 | Event batch 与 checkpoint 同事务 + `expectedSeq` CAS + 单次 16 MiB 上限 | `docs/architecture.md:131-148` |
| 7 | 未知副作用边界恢复 → `paused` + 操作者显式 `retry/fail`，而非自动重试 | `lib/adapters/dsh/types.d.ts:138-146` |
| 8 | 画布用 `@xyflow/react` 12 + DSH Typert 通路；`layout` 与语义 hash 分离 | `package.json`；`spec/workflow-template-v1.md:236-246` |

另从 `dsh-workflow-canvas` 借鉴「受控回环边（起点必须是条件节点 + `maxIterations`）」与「中间 Lead 节点暂停返回 `need-lead`」；从 `dsh-harness-one` 借鉴「断点续跑前先比对图 fingerprint」与「webhook HMAC 验签路由」。

---

## 5. 明确「未找到证据 / 未读」的点

1. `@nelsonlongxiang/dsh-open-a2a-net`、`@weibaohui/dsh-tasks` 的 GitHub 星标——GitHub API 一次 SSL 中断 / 一次超时，未重试。
2. `dsh-comfyui-canvas` 的 GitHub 仓库 `wbin0001/dsh-comfyui-canvas` 返回 404。
3. `@haitang-hub/dsh-infinite-canvas` 的「Node plugin / 节点插件」扩展协议——只在打包产物里看到字样，未读出注册接口。
4. `@gm-hz/agent-dag-workflow` 画布节点 handle 数量（单输入 handle 还是多输入）——未逐行核对；边模型只有 `sourcePort`，无 `targetPort`。
5. 各包在**本机 DSH 版本**上的实际可运行性——未安装；只核对了 `engines.dsh` / `compatibility.dshReleases` 声明。`dsh-harness-one`、`dsh-alpha`、`dsh-open-a2a-net`、`@opendsh/dsh-plugin-scheduled-tasks` 的 client `inject` 含 `@deepseek-ai/dsh-client-runtime`（agent-dag-workflow README:291 称 DSH 0.2 已删除），**可能**与 0.2.x 不兼容，未实测。
6. `dsh-alpha` 任务存储是 `tasks.json`（源码证实），上一轮文档写的「内置 SQLite」是误记，本文 §2.5 已修正；上一轮文档未改（本轮约束不改已有文件）。

---

## 6. 本轮用到的只读命令

```sh
sed -n 125,145p ~/.dsh/profiles/desktop/cordis.patch.yml
curl -sS https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json -o /tmp/dshwf/index.json
curl -sS https://registry.npmjs.org/dsh-plugin-catalog            # 索引包元数据
python3 - <<'E' ... E                                             # 索引关键词筛选（/tmp/dshwf/rel.json）
curl -sS https://registry.npmjs.org/<pkg>                         # 37 个包元数据
curl -sS https://api.npmjs.org/downloads/point/last-month/<pkg>   # 月下载
curl -sS https://api.github.com/repos/<owner>/<repo>              # 星标（未认证，60 次/小时）
curl -sS <tarball> | tar -xz -C /tmp/dshwf/pk/<name>              # 31 个 tarball 解包到 /tmp
```

未修改 DSH 仓库、未安装插件、未启动宿主、未操作 Issue；本仓库只新增本文件。

---

## 附录：关键词命中全表（去重并集 250 个，按下表分 4 组共 266 行，一个包可出现在多组；索引 2026-11-23 快照）

版本/日期为**索引**值（只保留最新版，可能滞后 npm 一天）。「其他标签」列给出该包同时命中的其他关键词组。


### A. canvas 关键词命中（50）

| npm 名 | 索引版本 | 索引日期 | 分类 | 其他标签 | 描述（索引 en/zh，截 120 字） |
|---|---|---|---|---|---|
| `@1agents/feature-blueprint` | 0.4.1 | 2026-10-03 | ui |  | Adds mind maps and an Excalidraw canvas to the DSH sidebar, with local blueprint-file editing, Excalidraw file previews  |
| `@beatapi/dsh-design` | 0.1.0 | 2026-11-02 | vision |  | Starts the published local BeatDesign 0.2.5 workspace and connects 30 MCP tools for projects, Canvas, Assets and Timelin |
| `@dotv/dsh-canvas` | 0.1.2 | 2026-11-10 | tools |  | Drive the DOTV infinite canvas from DeepSeek Harness: the agent lists your canvases and their nodes, adds text nodes, an |
| `@focus-daima/gis-workbench` | 0.9.11 | 2026-11-20 | ui |  | MapLibre GIS workbench for DSH: a shared map canvas with layer management (visibility, ordering, removal), raster and ve |
| `@gm-hz/agent-dag-workflow` | 1.0.1 | 2026-10-07 | workflow | dag/wf-orch | Host-neutral durable DAG workflows for Agents with CLI, MCP, on-demand Skills, triggers, replay, and a visual Canvas. |
| `@goodandready/dsh-live-canvas` | 0.2.37 | 2026-11-13 | tools |  | Renders HTML, React (JSX/TSX), Vue, SVG, Mermaid and Markdown written by the agent in an isolated iframe sandbox with SS |
| `@haitang-hub/dsh-infinite-canvas` | 0.2.36 | 2026-11-21 | tools |  | 无限画布 / Agent-driven infinite AI creation canvas — compose and generate text, image, video and audio on nodes; ships a ze |
| `@lucagiftzek/dsh-note-keeper` | 0.3.0 | 2026-11-01 | memory |  | Obsidian-compatible Markdown notes in the DSH sidebar with search, tags, backlinks, graph, audio notes with transcriptio |
| `@miragari/dsh-client-canvas` | 0.1.5 | 2026-10-29 | ui |  | An AI-native multimodal canvas for DSH: preview images, video, audio, 3D models, PDFs, documents, and code; connect idea |
| `@ninkch/dsh-infinite-canvas` | 0.21.2 | 2026-11-18 | tools |  | Node-based creation studio for DeepSeek Harness - script, storyboard, reference images and multi-shot video generation o |
| `@pakiknowledge/dsh-client-ui-skin-claude` | 0.2.1 | 2026-09-02 | theme |  | Claude-style skin with a warm-black canvas, clay accent, and serif UI that follows the native light and dark themes. |
| `@xiaopb/dsh-mobile-layout` | 0.4.12 | 2026-11-09 | ui |  | Phone-portrait layout shell for the DSH Web UI: the sidebar becomes an off-canvas drawer opened by swiping from the left |
| `@xiguazhiprince/dsh-session-map` | 0.9.0 | 2026-11-22 | session |  | Session map: a fork-tree canvas over DSH sessions, and a Settings page that clones a Git repository into a new workspace |
| `claude-style-skin` | 0.1.1 | 2026-08-22 | theme |  | Claude-style warm-editorial skin for the DSH web GUI — ivory/warm-black canvas, a clay ember accent, serif display + san |
| `dsh-agent-canvas` | 0.1.0 | 2026-08-16 | workflow |  | Interactive canvas for visualizing Agent, Subagent, Workflow, Phase, and tool relationships in DSH Web. |
| `dsh-agnes-media` | 1.1.1 | 2026-11-16 | vision |  | Sidebar panel for Agnes image and video generation that also ships a node canvas and a short-drama mode. Canvas nodes ar |
| `dsh-call-session` | 0.1.12 | 2026-11-06 | session |  | Run several DeepSeek Harness sessions side by side, hand work from one to another, and watch the whole collaboration on  |
| `dsh-canvas-preview` | 0.4.9 | 2026-08-19 | ui |  | Conversation Canvas tab: live-preview workspace HTML artifacts and export PNG/JPG/SVG locally (`npx dsh-canvas-preview`) |
| `dsh-canvas-tsx-sidebar` | 0.7.9 | 2026-11-14 | ui |  | A dsh-better-sidebar tab that statically parses Qoder Canvas `*.canvas.tsx` files into structured pages in the DSH right |
| `dsh-claude-slider` | 2.11.0 | 2026-10-05 | ui |  | Replaces the reasoning-effort dropdown with a draggable snapping slider, and draws 13 canvas effects across five style f |
| `dsh-claude-style` | 0.22.0 | 2026-11-22 | theme |  | Claude Code Desktop look-and-feel for the DSH Web GUI — ivory/warm-black dual canvas, clay accent, three-font typography |
| `dsh-comfyui-canvas` | 0.1.13 | 2026-10-01 | tools |  | From chat to canvas to artwork — drive ComfyUI as a visual workflow IDE inside DSH. Embed ComfyUI (local or cloud) as a  |
| `dsh-diagram` | 0.6.1 | 2026-09-28 | docs |  | Turns an article in the DSH conversation into an Excalidraw canvas in a session tab: the Agent drafts the structure with |
| `dsh-drawai` | 0.4.9 | 2026-11-20 | tools |  | An editable diagram canvas in the DSH sidebar plus two agent tools (diagram_read, diagram_apply) that read and edit the  |
| `dsh-figgenie-paper-diagram` | 1.8.7 | 2026-11-19 | ui |  | Draw paper figures as SVG the way top venues draw them, lint them against layout rules, edit them on a sidebar canvas, a |
| `dsh-fishpai` | 2.0.1 | 2026-11-22 | docs |  | FishPai: a WeChat Official Account typesetting and editing workbench with a professional canvas, interactive components, |
| `dsh-glass-weather` | 0.3.0 | 2026-10-06 | ui |  | Glass weather pill in the session header with 23 weather states, each with its own tint, SVG icon and canvas particle la |
| `dsh-happy` | 0.5.2 | 2026-10-26 | fun |  | Ten full-canvas animated backgrounds for the DSH conversation pane — starfield, code rain, circuit, sword-fight, cat, gi |
| `dsh-knowledge-canvas` | 0.4.6 | 2026-11-01 | memory |  | Knowledge base as a canvas in the right sidebar: notes are nodes, and nine tools let the model read, write, link and rem |
| `dsh-libtv` | 0.1.0 | 2026-11-04 | tools |  | LibTV canvas and media tools for DeepSeek Harness, with three director skills bundled and one-time WeChat QR authorizati |
| `dsh-noteboard` | 0.3.1 | 2026-11-09 | memory |  | Workspace-wide sticky notes on an infinite canvas: notes are plain Markdown files, created manually, captured from conve |
| `dsh-pancha` | 3.0.2 | 2026-10-30 | ui |  | Disk review canvas: agent-written semantics, human decisions, previewed cleanup with undo. |
| `dsh-plugin-canvas` | 0.1.0 | 2026-09-05 | session |  | Infinite canvas for sessions, with regions bound to workspaces and agent presets, pinned session cards, sticky notes and |
| `dsh-plugin-genui` | 0.15.4 | 2026-11-19 | ui |  | Code-first React and TypeScript task apps rendered inline, in Canvas, full screen, or on localhost, with interaction sta |
| `dsh-plugin-inspiration-workbench` | 0.13.7 | 2026-11-18 | workflow |  | Coordinate multiple live DSH sessions on a canvas with task planning, file cards, pipelines, and node-level progress. |
| `dsh-ppt-canvas` | 1.1.0 | 2026-11-13 | ui |  | PowerPoint workbench for DeepSeek Harness: drag in a PPTX, annotate objects or regions across slides, review AI changes  |
| `dsh-redline` | 1.7.0 | 2026-11-21 | browser |  | Visual review for the harness browser: pick any element to comment on it, adjust styles live with rollback, sketch on a  |
| `dsh-sketchpad` | 0.1.2 | 2026-11-16 | tools |  | Handwriting and diagram whiteboard: sketch on a floating or sidebar canvas and attach the cropped image to your message. |
| `dsh-task-console` | 0.24.0 | 2026-09-18 | ui |  | Flip the DSH page over to a glass task board showing live jobs, subagents and session state, with an infinite canvas tha |
| `dsh-theme-macintosh` | 0.1.2 | 2026-09-06 | theme |  | Classic Macintosh (System 7) pixel theme: desktop pattern canvas, Finder sidebar, monochrome buttons and dialogs, light/ |
| `dsh-theme-paper-warm` | 0.1.1 | 2026-11-16 | theme |  | Eye-care warm paper theme for the DSH Web GUI: overrides canvas, surface, text, border and scrollbar tokens to a warm pa |
| `dsh-theme-splat-ui` | 0.1.0 | 2026-11-22 | theme |  | Splatoon 2 inspired theme with tri-band ink canvas, 118 ThemeRuntime tokens, Special Gauge boot loader, and day/night pa |
| `dsh-thoughtdag` | 0.5.28 | 2026-11-08 | ui |  | Adds an editable conversation canvas to DeepSeek Harness, where graph connections select context for canvas requests, wi |
| `dsh-web-artifact-designer` | 1.0.0 | 2026-08-17 | skill |  | Design-artifact skill adapted from Anthropic canvas-design / web-artifacts-builder: turns a design brief into a self-con |
| `dsh-wechat-skin` | 1.0.0 | 2026-11-19 | theme |  | WeChat-style theme for the DSH Web GUI: green accents and send action, green user bubbles, a soft gray chat canvas, a gr |
| `dsh-workflow-canvas` | 1.2.0 | 2026-11-22 | workflow | wf-orch | Visual subagent-workflow canvas for DeepSeek Harness: wire prompt/JSON/session links, run in an event-driven parallel po |
| `dsh-workflow-orchestrator` | 0.3.0 | 2026-11-22 | workflow | dag/wf-orch | Visual workflow orchestrator: drag task nodes on a canvas, wire them into sequential, parallel or gateway-joined graphs, |
| `dsh-yingma-canvas` | 0.2.1 | 2026-11-20 | ui |  | Opens the Xiaoyingma AI video canvas in a DSH sidebar and dock tab; agents read and edit canvas nodes through the bundle |
| `justskill-design` | 3.4.0 | 2026-11-22 | skill |  | Registers the justSkill design skill in DSH, adds a workbench that lists design files across workspaces, and opens a fil |
| `weshop-dsh-plugin` | 1.0.2 | 2026-08-20 | ui |  | Infinite-canvas e-commerce visual workspace for product photography, virtual try-on, background edits, and video, synced |

### B. 派发/编排类（workflow 分类 ∨ dag 关键词命中，含多机）

| npm 名 | 索引版本 | 索引日期 | 分类 | 其他标签 | 描述（索引 en/zh，截 120 字） |
|---|---|---|---|---|---|
| `@creait/dsh-hookkit` | 0.1.0 | 2026-08-24 | workflow |  | Config-driven lifecycle hooks, including context injection: declare event, handler and outcome in YAML, where the handle |
| `@dsh-suite/plugin-team-board` | 0.2.1 | 2026-08-30 | workflow |  | Shared multi-agent task board (create/claim/transition/query) over a Cordis service key. |
| `@esroamer/codex-dsh-collab` | 0.2.0 | 2026-10-05 | workflow |  | Let Codex dispatch tasks to DeepSeek Harness workspaces, follow execution, read results, and continue collaboration thro |
| `@feng0531/dsh-execution-bus` | 1.8.3 | 2026-11-18 | workflow | dag | Declarative DAG runtime for DSH tool plans with bounded parallel execution, read-only retries, per-step checkpoints, can |
| `@gm-hz/agent-dag-workflow` | 1.0.1 | 2026-10-07 | workflow | canvas/dag | Host-neutral durable DAG workflows for Agents with CLI, MCP, on-demand Skills, triggers, replay, and a visual Canvas. |
| `@hanxuanliang/dsh-chaos` | 0.1.2 | 2026-08-24 | workflow |  | Durable multi-agent collaboration for DeepSeek Harness with channels, threads, tasks, and resumable agent sessions. |
| `@hawk2048/oh-my-dsh` | 0.5.0 | 2026-11-22 | workflow |  | OMC-style multi-agent orchestration for DeepSeek Harness: 29 omd-* skills and 12 /omd-* slash commands over the plan-exe |
| `@jhcai11/oh-my-dsh` | 0.1.4 | 2026-11-13 | workflow |  | Agent orchestration for DeepSeek Harness, aligned with oh-my-openagent 4.19.4: eleven agent roles, planning, delegation, |
| `@joekytc/dsh-swarm` | 0.5.1 | 2026-10-09 | workflow |  | A governed swarm of six specialist DSH agents — orchestrator, planner, knowledge-base bridge, developer and two reviewer |
| `@jossionliu/workbench` | 0.8.5 | 2026-11-05 | workflow |  | Requirement-to-delivery workbench: paste or upload a requirement, and a plan-dispatch-verify loop delivers it with child |
| `@kasenri/dsh-orbit` | 0.6.7 | 2026-09-24 | workflow |  | Deterministic engineering orchestration runtime for DeepSeek Harness: the orbit_controller tool and OrbitService run Com |
| `@kiritoko1029/dsh-multi-agent` | 0.13.0 | 2026-11-20 | workflow |  | Route independent tasks to DSH, Codex, Kimi Code, or Antigravity subagents using configurable natural-language rules, wi |
| `@limuyang2/dsh-agent-team` | 0.1.4 | 2026-08-26 | workflow |  | Multi-agent team collaboration for DeepSeek Harness with per-assistant models, skills, MCP servers, independent contexts |
| `@lucagiftzek/dsh-orchestrator` | 0.1.1 | 2026-11-01 | workflow |  | An Orchestrate tab in dsh-better-sidebar and 14 orch_* tools to spawn, prompt, fork and cancel agent chats, run command, |
| `@marsken/dsh-studio` | 0.9.87 | 2026-11-23 | workflow |  | Role-based multi-agent board for the software lifecycle - product, architect, dev and QA agents pick up cards, a design- |
| `@maximehu97/dsh-meeting` | 0.3.0 | 2026-10-22 | workflow |  | Multi-agent meeting negotiation over the LAN: each person runs their own assistant, and assistants find each other via m |
| `@nanmicoder/dsh-agent-teams` | 0.1.31 | 2026-11-18 | workflow |  | AgentTeams multi-agent teams. |
| `@neomei/dsh-client-ui-roundtable` | 0.1.0-rc.7 | 2026-10-03 | workflow |  | Multi-agent roundtable discussion: each member runs as a subagent on its own model and speaks in turn, a host summarizes |
| `@nilesh32236/dsh-squad` | 1.1.0 | 2026-10-01 | workflow |  | Cross-workspace worker fleets: one orchestrating session spawns named worker sessions in other project workspaces, queue |
| `@nyantused/folio-dsh-events` | 1.0.1 | 2026-08-16 | workflow |  | Folio (兰亭) @nyantused/folio-dsh-events: session-protocol events — auto session-start reminder + auto-save on session clo |
| `@sakura12/oh-my-deepseekharness` | 0.7.2 | 2026-11-02 | workflow |  | Multi-agent orchestration layer for DeepSeek Harness — autopilot/ralph/team execution modes, 19 role cards, 40 bilingual |
| `@sshirkit/dsh-orchestrator` | 0.9.2 | 2026-11-21 | workflow |  | Disables main-agent tools to enforce planning and review, with parallel delegate, multi-stage orchestrate pipelines, wri |
| `@stofone/dsh-agent-roster` | 1.35.0 | 2026-11-17 | workflow |  | Defines multi-agent team rosters as YAML or JSON files, validates them, bridges each member into dsh-agent-teams member  |
| `@tmmk/media-runninghub` | 0.2.0 | 2026-11-11 | workflow |  | RunningHub cloud ComfyUI workflows as a background task pool: submit a batch, and a watcher dispatches it within a concu |
| `@yangdcm/dsh-expert-team` | 1.7.1 | 2026-11-20 | workflow |  | Role-based multi-agent team for DeepSeek Harness — your digital workforce. One goal assembles a team of product, archite |
| `@zseven-w/dsh-crew` | 0.1.0-rc.15 | 2026-11-10 | workflow |  | Dispatch work to DSH agents from Claude Code or Codex: native subagent progress, in-host worker sessions with per-tier p |
| `codex-dsh-dispatch` | 0.3.2 | 2026-11-20 | workflow |  | Lets Codex dispatch tasks to DeepSeek Harness, wait for results, and follow up in the same DSH session. |
| `dsh-agent-board` | 1.9.10 | 2026-11-19 | workflow | cron | Kanban task board for DeepSeek Harness sessions: the main agent dispatches tasks to one-shot worker/verifier subagents,  |
| `dsh-agent-chat` | 0.2.26 | 2026-11-16 | workflow |  | Multi-agent group chat and structured discussion inside DSH: a sidebar panel reusing the local workbench UI, five zero-l |
| `dsh-agent-conductor` | 0.4.1 | 2026-11-17 | workflow |  | Dispatches tasks from DSH to 11 external agent CLIs and provides a sidebar panel for CLI availability and dispatch statu |
| `dsh-agent-foreman` | 0.5.1 | 2026-11-14 | workflow |  | Parent-agent dispatch with review: split a task into work orders, hand each to a contractor you picked (its own provider |
| `dsh-agent-relay` | 0.5.0 | 2026-08-22 | workflow |  | Loopback-first multi-agent message relay: HMAC-authenticated broker plus dsh plugin (relay_send/recv/peers/history), zer |
| `dsh-agent-team-auto-orchestrator` | 1.5.14 | 2026-11-17 | workflow |  | Host-side orchestrator for DSH agent teams. Every turn it injects an 11-section orchestration methodology into the syste |
| `dsh-aicc-zhunao` | 0.1.0 | 2026-08-16 | workflow |  | Main-brain orchestration preset: delegation-first persona, root-session execution gate, and portable AI-LAW rule skill. |
| `dsh-auto-workflow` | 1.1.0 | 2026-11-09 | workflow | dag | Persistent concurrent node-graph workflows for DeepSeek Harness with agent, command, HTTP, human, fan-out/join, gate, an |
| `dsh-awesome-preset` | 2.7.0 | 2026-11-18 | workflow |  | Ultra-lean coding preset for DSH that eliminates orchestration overhead and pre-action chatter for surgical edits and fa |
| `dsh-cliworker-now` | 0.9.3 | 2026-11-22 | workflow |  | Multi-CLI worker sidebar for DeepSeek Harness 0.2.0-rc.2 on macOS and Windows, with task dispatch, live conversation vie |
| `dsh-cohub` | 0.13.1 | 2026-11-17 | workflow |  | Agent-orchestration plugin for DeepSeek Harness: a dispatch-only orchestrator preset, 13 agent skills, delegation tools, |
| `dsh-company` | 0.6.0 | 2026-11-18 | workflow |  | Multi-agent agent team of employee AI subagents for DeepSeek Harness — dsh-company: employee management, CEO bidding, n8 |
| `dsh-cortex` | 0.3.0 | 2026-09-11 | workflow |  | DeepSeek-Harness plugin for multi-model orchestration with recursive task decomposition, dynamic routing, quality gates, |
| `dsh-custom-subagents` | 0.1.5 | 2026-08-25 | workflow |  | Reusable subagent definitions managed from a Settings page and dispatched through a single delegate_agent tool; ships wi |
| `dsh-deep-insight` | 0.2.0-alpha.35 | 2026-11-11 | workflow |  | Evidence-based research workspaces with archived sources, knowledge graphs, exact citations and exportable reports. Expe |
| `dsh-eteams` | 0.2.22 | 2026-09-22 | workflow |  | Captain-led multi-agent teams that split a goal into tasks and dispatch them along an execution chain to members running |
| `dsh-expert-orchestrator` | 2.14.2 | 2026-11-13 | workflow |  | Multi-agent orchestration agent preset for DeepSeek Harness: one chief orchestrator that never implements itself — it tr |
| `dsh-flock` | 0.1.0 | 2026-10-02 | workflow |  | Self-organizing multi-agent clusters with no orchestrator. Real DSH subagents coordinate through a shared append-only lo |
| `dsh-graph` | 1.0.0 | 2026-11-21 | workflow | dag | Goal lifecycle management for dsh with an interactive kanban board: goals, criteria, attempts and reviews live in the wo |
| `dsh-ha-orchestrator` | 0.12.4 | 2026-09-04 | workflow |  | Model high-availability failover (quarantine, circuit breaking, probe recovery) and subagent orchestration (fanout/pipel |
| `dsh-harness-kit` | 0.2.1 | 2026-11-22 | workflow |  | Multi-agent engineering workflow for individual developers and small teams on DeepSeek Harness: seven roles, four flow p |
| `dsh-harness-one` | 0.13.0 | 2026-11-20 | workflow | dag | Visual multi-agent DAG workflows for DeepSeek Harness with live execution, restart recovery, and Feishu integration. |
| `dsh-hub-reminders` | 0.1.10 | 2026-11-15 | workflow |  | Runs allowlisted Python hook scripts on session events and injects the text they return into the next turn, so standing  |
| `dsh-jev-subagent-dispatch` | 0.8.0 | 2026-10-01 | workflow |  | Cut LLM costs: a Jev (System One) classifier vets each turn against a declarative policy and recommends the subagent mod |
| `dsh-kimicode-swarm` | 0.2.3 | 2026-11-16 | workflow | cron | Kimi-Code-style swarm: batch-parallel subagent dispatch with adaptive scheduling, a /swarm command, and in-chat live pro |
| `dsh-knj-workflow` | 2026.11.16 | 2026-11-16 | workflow | dag | Config-driven development-task orchestration for DSH: graph workflows (task/gateway/human nodes) with per-stage persiste |
| `dsh-maestro-codex` | 1.0.0 | 2026-11-14 | workflow |  | Manage Claude Code, Codex and Grok CLIs inside dsh and dispatch tasks to them as headless subagents, with dsh models, sk |
| `dsh-notice-hooks` | 0.1.4 | 2026-11-16 | workflow |  | Configure automation Hooks for user and project scopes to run commands on session, tool, permission, and context-compact |
| `dsh-novel-workbench` | 3.4.2 | 2026-10-24 | workflow |  | A full-screen novel-writing workbench: chapter board, draft candidates reviewed and merged paragraph by paragraph, plot  |
| `dsh-paoding` | 0.4.10 | 2026-11-06 | workflow |  | Orchestration-mode preset generator for DSH: a lead agent delegates to four built-in role helpers that carry only their  |
| `dsh-plan-and-execute` | 0.6.0 | 2026-09-24 | workflow |  | Plan-and-execute orchestration over ReactLoopAgent — turns a goal into reviewable steps with a web UI plan card. |
| `dsh-plugin-orchd` | 0.2.1 | 2026-11-10 | workflow | dag | Read-only orchd panel for the DSH right sidebar: task board, ideas board, dependency graph, review timeline and an insta |
| `dsh-plugin-stardeck` | 0.20.8 | 2026-11-19 | workflow |  | An RTS-style orchestration dashboard where commands replace chats: a resident commander agent decomposes each order into |
| `dsh-plugin-task-runner` | 0.6.0 | 2026-09-04 | workflow |  | Task Runner mode for DeepSeek Harness: the main agent decomposes large tasks into independent subtasks, dispatches them  |
| `dsh-punky-swarm` | 0.5.2 | 2026-10-21 | workflow |  | Engine-enforced guardrails for DeepSeek Harness agent swarms: quality gates reject half-done work, crash-safe checkpoint |
| `dsh-subagent-profile` | 0.5.1 | 2026-09-03 | workflow |  | Dispatch subagents with named profiles (model, reasoning effort, and tool scope per task), safety checks, cost estimatio |
| `dsh-swarm-orchestrator` | 0.6.34 | 2026-11-06 | workflow |  | Role-based AI swarms for DeepSeek Harness: an architect plans, parallel builders execute, reviewers gate quality, and an |
| `dsh-task-dispatch-table` | 0.1.22 | 2026-11-14 | workflow | cron | Scheduled task dispatcher: a dsh host plugin that drives recurring agent tasks from a single task table, dispatching eac |
| `dsh-task-hub` | 0.7.5 | 2026-11-19 | workflow |  | TAPD + ZenTao task hub for DSH: list assigned work in the sidebar and dispatch an agent on a branch you name. |
| `dsh-task-suite` | 1.1.0 | 2026-11-15 | workflow |  | Turn one DSH agent into a small engineering team: Markdown task pool, lead agent dispatching to isolated background work |
| `dsh-team-control` | 0.3.0 | 2026-11-18 | workflow |  | Agent-team orchestration sidecar for DSH: teams with a configurable member cap, real sub-agent members with per-member m |
| `dsh-team-rooms` | 1.0.9 | 2026-11-03 | workflow |  | Persistent, cross-session multi-agent team rooms for DeepSeek Harness — members, a message bus, a shared task board, and |
| `dsh-todo-freshness` | 0.3.2 | 2026-11-20 | workflow |  | Tells you when the task card is a stale snapshot. A todoFreshness session projection folds, from events already in the s |
| `dsh-todo-guard` | 0.1.0 | 2026-09-28 | workflow |  | Task-list staleness guard for DeepSeek Harness: watches the session event stream and counts tool calls since the last to |
| `dsh-tool-orchestrate` | 0.1.0 | 2026-08-15 | workflow | dag | Declarative task-DAG orchestration for DSH: validates dependency graphs, runs topological task layers in parallel throug |
| `dsh-tradingagents` | 0.3.1 | 2026-11-22 | workflow |  | Multi-agent investment committee for DSH - analyst, bull, bear, risk and PM debate where every claim carries an evidence |
| `dsh-vibe-math` | 2.8.5 | 2026-10-05 | workflow |  | Installs four multi-agent math-research presets for DSH: v2 (probability-driven pipeline with multi-verifier debate), v3 |
| `dsh-workbench-automation` | 0.4.12 | 2026-11-22 | workflow | cron | Automation for DSH: run whitelisted actions on a schedule, on domain events or manually, with templates, conditions, rat |
| `dsh-workflow-canvas` | 1.2.0 | 2026-11-22 | workflow | canvas | Visual subagent-workflow canvas for DeepSeek Harness: wire prompt/JSON/session links, run in an event-driven parallel po |
| `dsh-workflow-orchestrator` | 0.3.0 | 2026-11-22 | workflow | canvas/dag | Visual workflow orchestrator: drag task nodes on a canvas, wire them into sequential, parallel or gateway-joined graphs, |
| `dsh-zentao-hub` | 0.2.1 | 2026-11-17 | workflow |  | ZenTao panel for DSH: reads the requirements, tasks and bugs assigned to you through REST v1/v2 or the official zentao-c |
| `dwguard-dsh-hmos` | 1.0.6 | 2026-11-22 | workflow |  | HarmonyOS delivery orchestration for DSH: freezes a four-dimension acceptance pack whose measurable criteria carry machi |
| `novel-writer` | 1.0.2 | 2026-09-15 | workflow |  | Installs a multi-agent novel-writing preset for DeepSeek Harness: one conductor agent dispatches five specialized subage |
| `taskboard-workbench` | 0.3.5 | 2026-11-17 | workflow |  | Agent-team task workbench for DeepSeek Harness: a sidebar board and requirement view track tasks across backlog, executi |

### C. cron / schedul / timer 关键词命中（122）

| npm 名 | 索引版本 | 索引日期 | 分类 | 其他标签 | 描述（索引 en/zh，截 120 字） |
|---|---|---|---|---|---|
| `@ahao430/dsh-workhub` | 0.1.0 | 2026-11-03 | tools |  | Work-data hub for DingTalk and Yunxiao: syncs todos, logs, meeting notes, attendance, schedules, projects, requirements, |
| `@alpacachen/dsh-automation` | 0.3.32 | 2026-09-26 | workflow |  | Runs one-time and RFC 5545 recurring Agent tasks in fresh DSH sessions, with visual schedule editing and session-linked  |
| `@chendaleiq/dsh-plugin-auto-update` | 0.2.2 | 2026-11-06 | market |  | Per-package automatic updates for the DeepSeek Harness plugins you choose. On a schedule it asks npm for the latest vers |
| `@chenkai114/dsh-daemon` | 0.1.33 | 2026-11-19 | dev |  | Registers the DeepSeek Harness web server (dsh web) as an auto-start, self-healing background service — LaunchAgent / sy |
| `@einfachllm/dsh-pomodoro-timer` | 1.4.1 | 2026-11-15 | ui |  | Pomodoro focus timer docked under the composer with long-break cycles, daily focus tracking, phase-change signals, and a |
| `@goodandready/dsh-cron` | 0.3.52 | 2026-11-19 | workflow |  | Scheduled cron tasks, background automation and agent execution for DeepSeek Harness. |
| `@hhuangpanda/dsh-automation` | 0.3.38 | 2026-11-14 | workflow |  | Runs one-time and recurring Agent tasks in fresh DSH sessions, with natural-language schedules, visual schedule editing  |
| `@kanadego/dsh-heartbeat` | 2.3.0 | 2026-11-18 | agi |  | An agent that wakes up on its own schedule: by default every 60 minutes, ±20% (48–72). It browses the interests you set, |
| `@khglobal/dsh-universe` | 0.3.1 | 2026-11-20 | usage |  | Real-time AI agent monitor that draws DSH sessions, agents and scheduled tasks across all workspaces as a live pixel cit |
| `@kpeace/dsh-cove-task` | 0.25.0 | 2026-11-20 | notify |  | Brings Feishu (Lark) tasks and documents into DSH: syncs tasks and listening documents into a local snapshot on a schedu |
| `@lemoncat7/dsh-partner` | 2.28.4 | 2026-11-22 | workflow |  | Long-lived AI companions with isolated memory, WeChat channels, Skills, schedules, heartbeat concerns, and a dependency- |
| `@linxin666/dsh-client-ui-task-board` | 0.4.21 | 2026-11-22 | ui |  | Task board for the dsh web GUI: a sidebar multi-column kanban whose cards run in real DSH agent sessions and can also be |
| `@lucagiftzek/dsh-mail` | 0.2.1 | 2026-11-01 | tools |  | Mail for DSH: IMAP, POP3, SMTP and OAuth2 accounts with a reading tab, API senders, scheduled and CSV bulk sends with un |
| `@michengai/dsh-automation` | 1.1.1 | 2026-11-21 | workflow |  | Runs scheduled coding tasks in isolated DeepSeek Harness sessions, managed from Settings or the agent. |
| `@morehao/dsh-github-trending` | 0.9.33 | 2026-11-20 | workflow |  | Schedules a daily, weekly or monthly GitHub Trending digest, has a local trendradar core write Chinese summaries and per |
| `@mzzsfy/dsh-cron-board` | 0.9.0 | 2026-11-17 | workflow |  | Cron job board: schedules local scripts or dsh session tasks (fresh or pinned sessions) by cron expression, with inline  |
| `@mzzsfy/dsh-usage-panel` | 0.10.0 | 2026-11-16 | usage |  | Multi-platform LLM balance and quota panel: configure DeepSeek, OpenRouter, Kimi, Zhipu GLM, MiniMax, NewApi or custom e |
| `@nzlov/dsh-bing-wallpaper` | 1.7.0 | 2026-11-20 | theme |  | Daily Bing wallpapers for DSH Web, with China/US sources, ten image-derived colour styles, and scheduled or system-follo |
| `@opendsh/dsh-plugin-scheduled-tasks` | 0.2.4 | 2026-08-23 | workflow |  | Per-project scheduled prompts run as fresh headless agent sessions, with one-time, interval, and cron schedules plus dur |
| `@ottttto/dsh-scheduled-send` | 0.3.9 | 2026-09-09 | workflow |  | Scheduled send: fire a drafted message into the bound conversation as a normal user bubble at a set time. Runs host-side |
| `@oxmumu3/dsh-family-assistant` | 0.2.9 | 2026-11-23 | workflow |  | Owner workbench for independently connected family WeChat assistants, per-member project and tool permissions, scheduled |
| `@rs-dsh/dsh-automations` | 0.1.1 | 2026-10-31 | workflow |  | Keep your automation tasks in files you can version and review: write each task's schedule, prompt, model, permission an |
| `@skylerfee/dsh-sidebar-rail` | 1.1.0 | 2026-11-13 | ui |  | Adds an auto-hiding icon rail to the collapsed macOS Desktop sidebar, with workspace pinning and flyouts for recent sess |
| `@soffits/dsh-cron-jobs` | 0.22.2 | 2026-11-22 | workflow |  | Host-side scheduled jobs on cron, RRULE or one-time schedules: shell commands that start no model, gated jobs that wake  |
| `@statedock/dsh-plugin` | 0.1.1 | 2026-10-17 | workflow |  | Provides shared plan, context pickup, and progress update Skills through StateDock Remote MCP without executing tasks or |
| `@weibaohui/dsh-fde-tools` | 0.3.7 | 2026-10-29 | dev |  | FDE toolbox bundle: installing this one plugin pulls in a curated set of common dsh plugins (git server, WebDAV mount, k |
| `@weibaohui/dsh-tasks` | 0.5.11 | 2026-10-31 | workflow |  | Scheduled tasks: run a prompt on cron schedules, each run opens a new agent session to do the work, with workspace bindi |
| `@xiaoyuyu6420/dsh-backup` | 0.14.4 | 2026-11-10 | dev |  | One-command backup, restore & migration for all DSH user data (~/.dsh) with a visual Settings panel: scheduled auto-back |
| `@yongfanbeta/dsh-pomodoro` | 0.2.0 | 2026-10-20 | ui |  | Classic 25/5/15 pomodoro timer for DSH that ties each run to the current session task or a manual project name, with a s |
| `albis-aipassport-homework` | 0.7.0 | 2026-11-17 | tools |  | Homework helper for the AI Passport device: turns homework screenshots into a checklist with per-task countdown timers a |
| `dsh-agent-board` | 1.9.10 | 2026-11-19 | workflow | wf-orch | Kanban task board for DeepSeek Harness sessions: the main agent dispatches tasks to one-shot worker/verifier subagents,  |
| `dsh-ark-wiki` | 0.10.2 | 2026-10-22 | tools |  | Queries PRTS Wiki for Arknights operators, items, stages, story pages and worldbook entries, and predicts unreleased cha |
| `dsh-atan-daily` | 1.2.2 | 2026-11-13 | workflow |  | Scheduled DSH tasks: each topic keeps its own folder and task-detail file, runs by cron or manually, and renders a times |
| `dsh-automation-center` | 0.1.0-alpha.8 | 2026-08-31 | workflow |  | Schedules workspace Agent runs in fresh Result Sessions with persistent audit history, using a stock DSH Conversation ta |
| `dsh-automation-monitor` | 0.6.0 | 2026-10-29 | workflow |  | Read-only Automations tab in the conversation view. It aggregates what other plugins are scheduled to run: last run time |
| `dsh-better` | 0.5.5 | 2026-09-07 | tools |  | Archived-session management, task-stop notifications, an update checker, model routing (keyword rules + allowlist-gated  |
| `dsh-better-stats` | 0.1.16 | 2026-08-25 | usage |  | Composer stats strip for the DSH Web UI: official CNY pricing with auto-synced peak/off-peak tiers, per-model accounting |
| `dsh-breather` | 0.3.3 | 2026-10-31 | session |  | Take a breath mid-task: the current step finishes, then it holds. Resume sends no new request and spends no tokens; the  |
| `dsh-calm-focus` | 1.0.0 | 2026-11-18 | notify |  | A rope-hung mascot at the top edge of the window speaks a short, original healing line on a timer, reminding you to stay |
| `dsh-chapter-whale` | 0.5.0 | 2026-11-15 | workflow |  | Windows x64 DSH workbench for scheduled, unattended novel writing and Fanqie publishing, with configurable tasks and opt |
| `dsh-connect-workbuddy-models` | 0.1.4 | 2026-11-05 | model |  | Aggregates every WorkBuddy account already signed in on this machine into one model pool, with manual and scheduled chec |
| `dsh-cron-panel` | 0.1.14 | 2026-11-21 | workflow |  | Scheduled tasks panel for managing DSH agent and system crontabs with natural language input and execution logs. |
| `dsh-cronops` | 0.1.3 | 2026-11-18 | tools |  | Console for self-hosted task panels (Qinglong and Daidai) in the sidebar: manage panel connections, environment variable |
| `dsh-cubox` | 0.2.2 | 2026-09-29 | tools |  | Cubox sync for DeepSeek Harness: scheduled sync of your bookmarks, an AI daily brief generated from your own prompt temp |
| `dsh-find-nyaa-anime-release` | 0.2.12 | 2026-11-14 | tools |  | Search Nyaa anime releases with quality and Chinese subtitle checks, manage scheduled tracking and qBittorrent delivery, |
| `dsh-firefly-pet` | 0.1.1 | 2026-11-09 | fun |  | A transparent always-on-top desktop pet of Firefly (流萤) that chats through the host model, plays animations on click, wh |
| `dsh-gacha-calendar` | 0.14.1 | 2026-11-18 | ui |  | Gacha banner and event schedule lookup for anime games: sidebar button with current banners, events and countdowns for 2 |
| `dsh-game-daily` | 0.3.12 | 2026-11-15 | tools |  | Daily game automation on Windows for Genshin Impact, Honkai Impact 3, Honkai: Star Rail and Zenless Zone Zero: a schedul |
| `dsh-group-status` | 0.5.5 | 2026-11-13 | ui |  | Aggregated status badges on collapsed sidebar groups in DSH: a folded folder row shows in-progress / awaiting-approval / |
| `dsh-helper` | 0.20.2 | 2026-11-11 | notify |  | Send local files to WeChat from any DSH session by reusing an installed IM plugin, plus cron-scheduled tasks that run in |
| `dsh-ihateposting` | 1.0.0 | 2026-11-20 | tools |  | Connects DeepSeek Harness to iHatePosting over MCP: lists connected social channels, reads the posting rules of each pla |
| `dsh-intel-pulse` | 0.9.3 | 2026-10-27 | notify |  | Windows only. Autonomous news briefing on user absence or continuous schedule, illustration & anime gallery with tagging |
| `dsh-intertidal` | 0.2.2 | 2026-11-16 | ui |  | Adds a full-screen sea overlay that appears on a schedule (3 minutes every 120 minutes by default) and fades out on its  |
| `dsh-island-overlay` | 0.3.4 | 2026-11-13 | notify |  | Always-on-top status pill for DSH on Windows: shows each session's turn state (thinking with a running timer, waiting fo |
| `dsh-juzpost` | 0.1.1 | 2026-11-03 | tools |  | Connects the agent to JuzPost, a social media scheduler, over MCP: lists connected accounts, checks per-platform limits, |
| `dsh-keep-running` | 0.1.3 | 2026-10-19 | usage |  | Watchdog for quota exhaustion: on a 429 or quota error it creates a recurring schedule that re-sends a continue-the-task |
| `dsh-kimicode-swarm` | 0.2.3 | 2026-11-16 | workflow | wf-orch | Kimi-Code-style swarm: batch-parallel subagent dispatch with adaptive scheduling, a /swarm command, and in-chat live pro |
| `dsh-laci-engine` | 0.3.1 | 2026-11-08 | model |  | Local model scheduler for DSH on Windows 10/11 with DSH Desktop 0.2.x: a bundled console for engine/model import, VRAM e |
| `dsh-later` | 1.15.0 | 2026-11-20 | workflow |  | Scheduled reminders and delayed send for DSH: /later delivers what you type as yourself at the time you pick, while the  |
| `dsh-liangwengu` | 0.3.12 | 2026-11-14 | usage |  | Off-peak scheduler for DeepSeek Harness: queue prompts to send automatically during DeepSeek off-peak hours, with peak/o |
| `dsh-life-pack` | 0.3.88 | 2026-11-03 | ui |  | ⚠️ Internal beta, do not download ⚠️ iLife: one DSH settings card for the iLife home-life suite — memo, calorie, chef, h |
| `dsh-live-compact-x` | 1.3.17 | 2026-11-22 | usage |  | A compaction scheduler for DeepSeek Harness: it cuts the tail of a conversation before the official compaction threshold |
| `dsh-mail-bridge` | 0.3.1 | 2026-11-16 | tools |  | SMTP/IMAP email bridge with ten tools: send, save a draft and get a review link, schedule later delivery, list, read, se |
| `dsh-market-gist-autosync` | 0.2.1 | 2026-11-06 | dev |  | Back up your DSH profile configuration to a private GitHub Gist on a schedule, with merged restore. |
| `dsh-memory-sync` | 0.6.0 | 2026-11-19 | memory |  | Sync a git-backed memory folder with a peer machine every time DeepSeek Harness starts — no daemon, no cron, no manual p |
| `dsh-msg-hub` | 0.1.11 | 2026-09-18 | notify |  | IM channel bridge: WeChat (ilinkai) / QQ / Feishu with proactive push — wake the channel bot from scheduled tasks and de |
| `dsh-multigameassistant` | 2.2.3 | 2026-11-22 | workflow |  | Manages game automation scripts from dsh on Windows. Installs and updates scripts such as MAA, runs them in scheduled pi |
| `dsh-nexus` | 0.2.62 | 2026-10-18 | workflow |  | Personal coding assistant that schedules, follows up on and verifies local Codex or Claude Code tasks from DSH, with WeC |
| `dsh-niuma-timer` | 1.4.0 | 2026-11-23 | ui |  | A handwritten-journal salary timer on the DSH composer dock: set your monthly salary and work hours, then it shows how m |
| `dsh-panel-order` | 0.1.0 | 2026-10-27 | ui |  | Drag-and-drop reordering for the global panel icons in the DSH sidebar (Plugins, Skill / MCP, Plugin Market, Scheduled T |
| `dsh-peakrate` | 0.3.1 | 2026-09-30 | model |  | Peak / off-peak rate badges for the model selector (every row) and the composer tool row, judged per provider by its own |
| `dsh-period-report` | 0.2.1 | 2026-08-16 | session |  | Free-interval session reports with AI-narrated daily/weekly digests over any date range, plus every-N-days scheduled rem |
| `dsh-plugin-agent-tree` | 0.1.6 | 2026-11-01 | ui |  | A tiny always-on floating tree of the DSH workspaces, conversations and subagents that are running, waiting on you or on |
| `dsh-plugin-bulkpublish` | 0.1.1 | 2026-11-04 | tools |  | Connects dsh to the BulkPublish MCP server (32 tools) to draft, schedule, publish and analyse social media posts, manage |
| `dsh-plugin-cron-scheduler` | 0.2.10 | 2026-09-28 | workflow |  | Cron scheduler for agent tasks: create jobs by natural language or a sidebar UI, inject a user message into a new or fix |
| `dsh-plugin-game-time` | 0.16.3 | 2026-11-21 | fun |  | Per-game playtime tracker for Windows: a game timer that follows each game's running process, charting daily, weekly, mo |
| `dsh-plugin-snapshot` | 0.3.7 | 2026-11-21 | tools |  | An upgrade assistant for DSH plugins. Checks which installed plugins have newer versions, then upgrades them in one clic |
| `dsh-plugin-tomato-todo` | 0.15.0 | 2026-11-12 | workflow |  | Pomodoro timer, tasks and study planning in DSH, with a chat assistant that can read and update the same local records a |
| `dsh-pomodoro` | 0.5.7 | 2026-11-18 | ui |  | Pomodoro focus-and-break timer for DSH Web with configurable cycles, a draggable mini panel, and in-app, sound, and brow |
| `dsh-pomodoro-box` | 1.2.4 | 2026-11-10 | ui |  | Adds a collectible blind-box layer to a composer-dock pomodoro timer: each finished focus session opens one of 15 items  |
| `dsh-pomodoro-pet` | 0.10.0 | 2026-10-25 | ui |  | Pomodoro timer with four-quadrant tasks: bind focus rounds to a task, grow a desktop pet with EXP and achievements, and  |
| `dsh-postiz` | 0.1.0 | 2026-09-11 | tools |  | Connects DeepSeek Harness to Postiz over MCP: list connected social media channels, fetch per-platform posting rules, an |
| `dsh-proactive` | 0.3.2 | 2026-10-26 | agi |  | Host-level proactive wake-ups for DeepSeek Harness: the model schedules its own alarms (once, recurring interval, or cro |
| `dsh-project-manager` | 0.80.0 | 2026-11-18 | workflow |  | Project board, task schedule (gantt) and project memory: sessions opened from a card auto-load the latest project STATE; |
| `dsh-project-report` | 0.1.8 | 2026-11-22 | workflow |  | Project reporting in the DSH sidebar: draft a per-project report from its git commits and session records with one click |
| `dsh-restart-planner` | 0.4.6 | 2026-10-22 | tools |  | Let the agent restart its own DSH host: schedule a self-restart, finish the turn first, then a detached helper stops and |
| `dsh-routines` | 0.3.1 | 2026-11-04 | workflow |  | Scheduled prompts that open a fresh conversation for every run, with cron, one-time and manual triggers, a per-task work |
| `dsh-rss-digest` | 0.1.0 | 2026-08-20 | tools |  | RSS/Atom digest bundle for dsh: subscribe to feeds, fetch on a schedule, dedupe exact and near-duplicate stories, and ge |
| `dsh-rss-monitor` | 0.2.10 | 2026-09-11 | notify |  | Native RSS monitor for DeepSeek Harness: multi-source subscription, keyword filtering, scheduled polling with smart dedu |
| `dsh-schedule-calendar` | 1.0.2 | 2026-11-13 | ui |  | Sidebar schedule assistant for dsh-better-sidebar (required: the tab registers through it; DSH 0.2.2+): a today view wit |
| `dsh-schedule-later` | 0.8.2 | 2026-11-13 | workflow |  | Schedule a message into a dsh chat for later: a Schedule button in the message box with a date and time picker, a sideba |
| `dsh-scheduled-message` | 0.5.1 | 2026-11-19 | workflow |  | Schedule a message you are writing in the DSH composer — text, images and files — to be sent later; the Host delivers it |
| `dsh-scheduler` | 2026.11.15 | 2026-11-16 | workflow |  | Cron task scheduler for DSH: on schedule, automatically creates a new session and injects your prompt as its first messa |
| `dsh-send-later` | 0.2.9 | 2026-11-19 | workflow |  | Delay-send for the DSH chat composer: a clock button beside the send button schedules a message into the current session |
| `dsh-sidebar-fold` | 0.1.13 | 2026-11-19 | ui |  | Folds the sidebar's add-on panel rows (schedules, agent teams, plugin market, context pages, …) under the shipped "More" |
| `dsh-sidebar-todo` | 0.4.0 | 2026-11-16 | workflow |  | A sidebar todo for [DSH]: jot tasks, recurring rules, month calendar and sticky notes, and turn important items into sch |
| `dsh-sidebar-trim` | 0.2.6 | 2026-11-12 | ui |  | Hides the sidebar's global panel navigation (Plugins / Market / Schedules / More) and gives the vertical space back to t |
| `dsh-sleep-send` | 1.2.3 | 2026-08-17 | ui |  | Schedule-send button and panel to the right of the composer, with smart time slots, a custom date/time picker, several q |
| `dsh-task-dispatch-table` | 0.1.22 | 2026-11-14 | workflow | wf-orch | Scheduled task dispatcher: a dsh host plugin that drives recurring agent tasks from a single task table, dispatching eac |
| `dsh-task-dispatcher` | 0.6.1 | 2026-09-29 | notify |  | TickTick (滴答清单) daily task dispatcher: an interval timer pulls due tasks from a chosen list into a Markdown task file an |
| `dsh-taskboard` | 0.10.0 | 2026-11-17 | workflow |  | Task board for DSH: create tasks with project and model assignment, run them manually or on cron schedules; new sessions |
| `dsh-tavily-pool` | 0.3.1 | 2026-09-25 | browser |  | Takes over the built-in web_search and web_fetch providers with Tavily, each behind its own toggle: a key pool with bala |
| `dsh-thanks-carl` | 0.3.0 | 2026-11-11 | fun |  | Local Carl companion with 12 pre-generated AI sprite actions, pat reactions, a 25/45-minute focus timer, quick menu, edg |
| `dsh-thinking-levels` | 4.6.0 | 2026-11-21 | model |  | Per-round thinking-level (reasoning_effort) control for DeepSeek Harness: pick Auto and it schedules low/high/max from t |
| `dsh-tick` | 1.1.0 | 2026-11-04 | workflow |  | Session-local scheduled tasks: inject a prompt into the current session after a delay, at a fixed time, or on a repeatin |
| `dsh-time-desk` | 0.13.0 | 2026-11-18 | workflow |  | A local-first DSH time desk for tasks, rest-aware habits, courses and credit ledgers, with focus timers and a general pe |
| `dsh-time-watchdog` | 1.0.0 | 2026-10-26 | notify |  | Turn timer for DSH: reports how long the current turn has been running, injects wrap-up prompts on a /set-time schedule  |
| `dsh-toolbox-web` | 0.1.29 | 2026-09-15 | tools |  | Toolbox plugin for the Web UI: session/trash/subdirectory/search/preset/config management, tag grouping, long-message co |
| `dsh-undohaven` | 0.1.10 | 2026-11-22 | dev |  | Takes AES-256-GCM encrypted snapshots of the dsh home on start, on a timer and on dispose, pins the last snapshot before |
| `dsh-updater-npm` | 1.13.4 | 2026-09-18 | dev |  | DSH updater + official docs sync in Settings: one-click npm update of @deepseek-ai/dsh with live progress (npm output st |
| `dsh-vps-ops` | 0.1.0 | 2026-10-31 | tools |  | Read-first VPS operations tools: systemd status and actions, disk usage, Docker status, log tails, configured backups, a |
| `dsh-watch-together` | 0.3.5 | 2026-11-21 | voice |  | Watch a video together with a text-only agent: with ffmpeg and the bundled browser extension reporting your real playbac |
| `dsh-whale-chat` | 0.1.4 | 2026-10-29 | fun |  | A talking whale desktop pet for the DSH web UI — persona-driven chat with persistent memory, plus scheduled autonomous w |
| `dsh-whale-waker` | 0.6.0 | 2026-10-27 | workflow |  | Per-target scheduled wake-ups for a DSH workspace: interval, quiet hours, daily cap and a prompt per target; each wake-u |
| `dsh-windows-toolbox` | 0.2.1 | 2026-11-18 | tools |  | Windows only. One panel for what runs at startup and what can be cleaned or tuned: 11 kinds of registration points (serv |
| `dsh-work-assistant` | 0.5.6 | 2026-10-24 | workflow |  | A work assistant for WeChat: it records what you tell it into a SQLite task ledger, ranks items by urgency, reminds you  |
| `dsh-workbench-automation` | 0.4.12 | 2026-11-22 | workflow | wf-orch | Automation for DSH: run whitelisted actions on a schedule, on domain events or manually, with templates, conditions, rat |
| `jacky-creator` | 0.1.0-beta.9 | 2026-10-09 | workflow |  | Local-first content production and operations workspace for DSH: manage ideas, scripts, media assets, schedules, goals,  |
| `memory-lattice` | 0.2.12 | 2026-11-05 | memory |  | A memory plugin that forgets on purpose: short-term memories expire after 48h, long-term ones are rescheduled by Ebbingh |
| `momolulu` | 1.2.2 | 2026-11-11 | ui |  | Floating photo companion for the DSH Web UI with a 15/25/45/60-minute focus timer, water and stretch reminders, Open-Met |
| `thu-tok-auto` | 0.3.24 | 2026-11-01 | model |  | Fetches Tsinghua MadModel API tokens and renews them from the saved SSO session on a 20-minute timer in a windowless bro |
| `toto-the-cat` | 1.0.1 | 2026-08-20 | fun |  | Desktop pet for the DSH web UI: a draggable pixel-art cat with a pomodoro timer, XP levels, and 30 unlockable facts. |

### D. dag / graph 关键词命中且未进 A–C

| npm 名 | 索引版本 | 索引日期 | 分类 | 其他标签 | 描述（索引 en/zh，截 120 字） |
|---|---|---|---|---|---|
| `@feng0531/dsh-execution-bus` | 1.8.3 | 2026-11-18 | workflow | wf-orch | Declarative DAG runtime for DSH tool plans with bounded parallel execution, read-only retries, per-step checkpoints, can |
| `@gm-hz/agent-dag-workflow` | 1.0.1 | 2026-10-07 | workflow | canvas/wf-orch | Host-neutral durable DAG workflows for Agents with CLI, MCP, on-demand Skills, triggers, replay, and a visual Canvas. |
| `@linyanzhi/dsh-mesh` | 0.3.50 | 2026-11-19 | remote |  | Multi-device DSH network: sidebar topology, peer health, delegation, file transfer and node management over TLS, LAN and |
| `dsh-atn` | 0.7.0 | 2026-11-13 | agi |  | Adaptive topology multi-agent preset for DeepSeek Harness with peer messaging, task handoff and live network visualizati |
| `dsh-auto-workflow` | 1.1.0 | 2026-11-09 | workflow | wf-orch | Persistent concurrent node-graph workflows for DeepSeek Harness with agent, command, HTTP, human, fan-out/join, gate, an |
| `dsh-code-review-graph` | 1.0.6 | 2026-10-26 | dev |  | Graph-based code context, impact analysis, review workflows, interactive graphs, and permission-controlled refactoring f |
| `dsh-graph` | 1.0.0 | 2026-11-21 | workflow | wf-orch | Goal lifecycle management for dsh with an interactive kanban board: goals, criteria, attempts and reviews live in the wo |
| `dsh-harness-one` | 0.13.0 | 2026-11-20 | workflow | wf-orch | Visual multi-agent DAG workflows for DeepSeek Harness with live execution, restart recovery, and Feishu integration. |
| `dsh-knj-workflow` | 2026.11.16 | 2026-11-16 | workflow | wf-orch | Config-driven development-task orchestration for DSH: graph workflows (task/gateway/human nodes) with per-stage persiste |
| `dsh-plugin-orchd` | 0.2.1 | 2026-11-10 | workflow | wf-orch | Read-only orchd panel for the DSH right sidebar: task board, ideas board, dependency graph, review timeline and an insta |
| `dsh-tool-orchestrate` | 0.1.0 | 2026-08-15 | workflow | wf-orch | Declarative task-DAG orchestration for DSH: validates dependency graphs, runs topological task layers in parallel throug |
| `dsh-topic-graph` | 0.6.57 | 2026-11-15 | session |  | Splits a session into turns and incrementally clusters them into named topics and stages, with per-topic token / tool /  |
| `dsh-workflow-orchestrator` | 0.3.0 | 2026-11-22 | workflow | canvas/wf-orch | Visual workflow orchestrator: drag task nodes on a canvas, wire them into sequential, parallel or gateway-joined graphs, |
