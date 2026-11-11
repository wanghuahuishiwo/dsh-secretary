# 官方 workflow 引擎只读取证（架构决策票 #70 · 候选 A）

- 仓库：`/Users/wanghuahui/workspace/deepseek-harness`（只读；未修改任何文件、未安装、未跑测试）。
- 取证对象：`ctx.workflowEngine`（`@deepseek-ai/dsh-workflow`）+ `dsh-workflow-ptc`（引擎实现）+ `dsh-tool-workflow`（消费者）+ `dsh-client-ui-workflow-run`（UI 折叠）+ `@deepseek-ai/dsh-ptc-runtime` / `ptc-runtime-node`（执行底座）。
- 下文路径均相对仓库根。**凡写「未找到证据」处，表示已在相关包、docs/subsystems、docs/tool-catalog.md 全文检索后仍无命中，不做推测。**

---

## 1 脚本语言

**结论一句话：workflow 脚本体（script body）不支持 TypeScript —— 它按纯 JavaScript 编译执行；`workflow-ptc/src/index.ts:118` 的 `language === 'typescript'` 只是「必须搭配 Node TS 版 PTC runtime」的能力开关，描述的是 PTC 执行器自身的程序语言，不是脚本体语言。**

**证据**

- 脚本体被**按 JS 语法编译两次**，任何 TS 语法（类型注解、`interface`、`enum`、`satisfies`）都是 `SCRIPT_PARSE`：
  - 宿主侧预检：`packages/workflow/workflow-ptc/src/index.ts:55-65` —— `new vm.Script(\`(async () => {\n${body}\n})()\`)`，包在 try/catch 中抛 `WorkflowError('workflow script does not parse: ...', 'SCRIPT_PARSE')`。
  - Guest 侧同款：`packages/workflow/workflow-ptc/src/runtime.ts:73-81`（`new vm.Script` + 同一 `SCRIPT_PARSE` 分支），`runtime.ts:107` 再 `runInContext`。
  - `vm.Script` 只接受 JavaScript；这两处没有任何 strip/transform 前置步骤。
- TypeScript 剥离只作用于 **PTC 程序**（即引擎自己下发的那段固定 guest 代码），不作用于 workflow 脚本体：
  - `packages/ptc-runtime/ptc-runtime-node/src/execution.ts:2` 引入 `node:module` 的 `stripTypeScriptTypes`；`:153-156` 用 `STRIP_PREFIX/STRIP_SUFFIX` 包裹后剥离；`:158-163`（persistent）、`:174-178`（vm-script）直接用同一函数。
  - 该剥离没有传 `mode`，即 Node 默认 `'strip'`（**纯擦除，不做特性转换**）：`node_modules/@types/node/module.d.ts:248-255`（`@default 'strip'`）、`:268-275`（默认模式下遇到 `enum` 等需要转换的特性直接抛错）。
  - 引擎 config 的 `executionMode` 三档说明均写「only erasable syntax is accepted, with no enum or namespaces. Type annotations are advisory」：`execution.ts:152`、`:161`、`:176`。
  - 因此即使把 TS 交给 PTC（如 `run_code`），也只有「类型注解 / interface（可擦除）」能跑，`enum`、`namespace`、参数属性等**不可擦除**语法会抛错；而 workflow 脚本体连类型注解都进不了这一步。
- 脚本体不走 PTC 程序的 `program` 字段，而是作为 **JSON 初始化数据**穿过通道：`packages/workflow/workflow-ptc/src/host.ts:27`（`PROGRAM` 是固定的 `await import(data:...)` 一行）与 `host.ts:288-294`（下发的 `program` 只能是那三行字符串），脚本体经 `host.ts:180` → `guest.ts:17` → `init.body` → `runtime.ts:75` 编译。这条链路里不存在任何 TS 处理。
- 契约层三处一致写「plain JavaScript」：`packages/workflow/workflow/src/runtime-types.ts:20`（"The plain-JS script body"）、`packages/workflow/workflow/README.md:35`（"a plain JavaScript body (not TypeScript)"）、`packages/workflow/tool-workflow/src/index.ts:338`（模型可见参数描述 "The plain JavaScript body, not TypeScript"）、同文 `docs/tool-catalog.md:2558-2560`。
- `language === 'typescript'` 的真实语义：`packages/ptc-runtime/ptc-runtime/src/index.ts:106-115` 明确写 `language` 是 "Informational, not gating"，已知值 `'typescript'`（已发布）与 `'python'`（实验、未发布）；Node 实现自报 `packages/ptc-runtime/ptc-runtime-node/src/index.ts:22`（`language = 'typescript'`）、`:23`（`isolation = 'process'`）。把它读成「脚本可以是 TS」是误读；它排除的是「用 Python PTC runtime 承载这段 ESM guest 代码」。
- 附：脚本体里出现 `export const meta` 会被显式拒绝（`workflow-ptc/src/index.ts:49`、`:56-58`，`SCRIPT_PARSE`），meta 只能作为 `meta` 字段的纯 JSON 数据传入（`meta.ts:67-81`，规范化拷贝，绝不执行）。

---

## 2 agent 节点结构化输出

**结论一句话：`agent(prompt, opts)` 支持带 schema 的结构化返回，schema 被限制在「对象根 + type/properties/required/additionalProperties/items/enum/const/oneOf」的强制子集内；无 schema 时返回子代理最终文本，子代理失败时返回 `null`，而 agent 选项/schema/上限误用会以 `WorkflowError.fatal` 直接炸掉整个脚本。**

**证据**

- 返回形态（`packages/workflow/workflow-ptc/src/runtime.ts:194-222`）：
  - 子代理 `stopReason === 'completed'` 且带 `schema`：返回 `result.structured`；若同时 `structured === undefined`（provider 声称支持却没给出值）按子代理失败处理 → `null`（`:207-217`）。
  - 无 `schema`：返回 `outputText(result.output)`，即把 content blocks 中 `type === 'text'` 的块直接 join（`:37-43`、`:218-219`）。
  - 子代理非 `completed`：`agentEnd(outcome:'failed')` 后返回 `null`（`:221-222`）。
  - 子代理结果 Promise **reject**（基础设施故障，或运行被取消时 host 侧 `childResult` 竞速 reject）→ 先发 `agent-end{outcome:'failed'}`，再抛 `WorkflowError('child agent run failed', 'AGENT_RESULT')`，即 fatal（`:198-206`）；启动失败 → `WorkflowError('agent() could not start a child', 'AGENT_START')`（`:189-191`）。
- schema 子集（强制校验，非注解）：
  - 校验入口 `assertObjectJsonSchema(record.schema)`，失败转 `UNSUPPORTED_SCHEMA`（`runtime.ts:264-274`）。
  - 子集定义：`packages/core/tools/src/json-schema.ts:1-13`（文档头：任意 JSON 根、annotation-only、单 `type`、object `properties/required/boolean additionalProperties`、array `items`、标量 `enum`/`const`、exact-one `oneOf`；不支持的组合**拒绝而不是放过**）、`:38-70`（`JsonSchemaNode` 字段表）、`:397-409`（`assertObjectJsonSchema` 追加「必须 `type:'object'`」的对象根约束）。
  - 子代理侧同一约束：`docs/subsystems/subagent.md:113-117`（`outputSchema` 为 "Object-rooted JSON Schema within `assertObjectJsonSchema`'s enforced subset"）、`:272-279`（`structured` 仅在该 schema 被成功满足时存在，且由 provider 校验）。
  - provider 能力门：`packages/subagent/subagent/src/index.ts:580-591`（请求带 `outputSchema` 而 provider 未声明 `capabilities.outputSchema` → `UNSUPPORTED_CAPABILITY`）；内置 `spawn` provider 声明支持（`packages/subagent/subagent-spawn-in-process/src/index.ts:39-44`）。
- 支持的 agent 选项是**闭集**：`runtime.ts:33-35`（`label/phase/schema/provider/model`；`effort/isolation/agentType` 是显式 deferred），`:252-263` 未知/deferred 选项抛 `UNSUPPORTED_OPTION`，非字符串的 label/phase/provider/model 抛 `INVALID_ARGUMENT`。
- 组合子语义（`runtime.ts:284-349`）：
  - `parallel(thunks)`：`Promise.all`，**是 barrier**；每个 thunk 的普通异常 → 该项 `null`，`isFatalWorkflowError` 则整体重抛（`:296-307`）。
  - `pipeline(items, ...stages)`：逐 item 串 stage，**stage 之间无 barrier**；某 stage 抛普通错 → 该 item `null` 且跳过其剩余 stage；fatal 则整体炸（`:311-339`）。
  - 每调用条目上限 `maxItemsPerCall`（默认 4096），超限抛 `ITEM_CAP`（`:342-349`；默认值 `workflow-ptc/src/index.ts:110`）。
  - fatal 纪律的全局说明：`docs/subsystems/workflow.md:116`、`packages/workflow/workflow/src/index.ts:108-119`（错误码全集）与 `:130-148`（`fatal` 标志 + `isFatalWorkflowError`）。
- 子代理句柄的最小面：`packages/workflow/workflow-ptc/src/types.ts:54-77`（`ChildResult{output,structured?,stopReason}`、`ChildHandle{id,result,dispose}`），host 侧裁剪与回传见 `host.ts:229-245`。

---

## 3 节点级留痕（关键）

**结论一句话：一次 run 只把「运行骨架」写进调用方父 Session 的日志——`run-start{runId,name}`、每个 agent 的 `agent-start{runId,seq,label,phase?,childId}` / `agent-end{runId,seq,outcome}`、`run-end{runId,stopReason}`；没有输入/输出正文、没有耗时字段、没有失败详情，代码步骤（非 agent 调用）完全没有持久化痕迹，`workflow/phase` 与 `workflow/log` 只是瞬时事件。**

**payload 逐字段（`packages/workflow/tool-workflow/src/types.ts`）**

| 事件 | 字段（types.ts 行） | 落地位置 |
|---|---|---|
| `tool-workflow/run-start` | `runId: WorkflowRunId`、`name: string`（`:14-17`） | 父 Session 日志 |
| `tool-workflow/agent-start` | `runId`、`seq: number`、`label: string`、`phase?: string`、`childId: SessionId`（`:20-26`） | 父 Session 日志 |
| `tool-workflow/agent-end` | `runId`、`seq`、`outcome: 'completed'\|'failed'\|'cancelled'`（`:29-33`） | 父 Session 日志 |
| `tool-workflow/run-end` | `runId`、`stopReason: 'completed'\|'cancelled'\|'error'`（`:36-39`） | 父 Session 日志 |

**证据**

- 事件声明（`SessionEventMap` 合并）与「log-only」定位：`packages/workflow/tool-workflow/src/types.ts:41-63`；这四个类型被登记为已知事件类型（读取方不会拒绝该日志）：`packages/core/session/src/known-event-types.ts:73-76`。
- 写入口径（`packages/workflow/tool-workflow/src/index.ts:93-151`）：`start()` 先 append `run-start`（`:139-143`）；`workflow/agent-start|agent-end` 监听器**按 `run.id` 过滤**后 append（`:115-136`），`phase` 只在存在时写入（`:122`）；`finish()` 只在结果已知且 `dispose()` 完成后 append `run-end`（`:144-148`，调用点 `:468-478`、后台路径 `:293-308`）。
- 只有**顶层** tool 调用才写记录：`const recordsRun = exec.parent === undefined`（`:443`）；后台路径同样由 `exec.parent === undefined` 决定（`:426`）。即嵌套 PTC dispatch / 直接调用 `ctx.workflowEngine.start` 的消费者**一条记录都没有**。README 同口径：`packages/workflow/tool-workflow/README.md:78`（"For a root transport execution (`exec.parent` absent)…Nested transport calls execute normally but write no record"）；`docs/subsystems/workflow.md:124`。
- 记录协议（允许中断尾部，不视为损坏）：`docs/subsystems/workflow.md:126`；首个 append 失败后**放弃该 run 的后续写入**（可能得到空记录或合法前缀），且不影响工具结果：`tool-workflow/src/index.ts:106-112`、`README.md:78`。
- 落在哪里：**Session 日志**，即 `session-persistence-jsonl` 的 append-only 文件。当前格式版本 `4`（`packages/session/session-format-catalog/src/generated.ts:17`），默认 zstd 帧、文件名形如 `session.vN.jsonl.zstd`（`packages/session/session-persistence-jsonl/README.md:62-72`）。每条事件由 `Session.append` 生成 `{type, seq, time: Date.now(), data}` 并 `deepFreeze`（`packages/core/session/src/index.ts:826-833`），因此**每条记录有 seq 与毫秒时间戳，但 `data` 内没有时间/耗时字段**。
- `workflow/phase` / `workflow/log` 是**瞬时**的：它们只由 job 镜像订阅写进后台 job 的环形输出（`packages/workflow/tool-workflow/src/record.ts:37-54`，`:44`/`:47` 为 `job.append(..., { channel: 'log' })`），不进 Session；README 明说："The engine's `workflow/phase` and `workflow/log` events have no per-line durable surface from this tool: the session log deliberately records run and member lifecycle only"（`packages/workflow/tool-workflow/README.md:80`）。全仓检索这两个事件的订阅者，只有该 job 镜像与测试（`record.ts:40,46`、`tests/*`），无任何落库实现。
- **代码步骤无痕迹**：脚本体的执行没有任何事件类型（`docs/subsystems/workflow.md:228-256` 的 phase/log 声明就是脚本能产生的全部事件；`workflow/src/index.ts:93-100` 的事件名闭集里没有「step/node」类事件），也没有 session 事件承载它；`session-query` 的已知事件表里同样没有（`known-event-types.ts:73-76` 仅四个 tool-workflow 事件）。因此「代码节点的 in/out/耗时/失败」在官方引擎中**不存在留痕位置**。
- **agent 节点的 in/out 也不在记录里**：记录只有 `label`/`phase`/`childId`（`types.ts:20-33`）。提示词与子代理最终输出不在其中；它们落在**子 Session 自己的日志**（子代理是真正的 Agent + Session：`packages/subagent/subagent/README.md:12`、`:61`；创建路径 `packages/subagent/subagent/src/manager.ts:845-857` 的 `ctx.agents.create({sessionId: childId, ...})`，并在 setup 里 `child.session.append('subagent/descriptor', ...)`）。记录里的 `childId` 是唯一关联键。注意 README 同时写明 caller delivery「can use an ephemeral local session」（`subagent/README.md:61`），所以**子会话内容的可查性取决于部署是否挂了持久化后端**，不是 workflow 记录保证的。
- 失败详情不在记录里：`agent-end` 只有三值 `outcome`（`types.ts:29-33`、`workflow/src/types.ts:109-116`），`run-end` 只有 `stopReason`（`types.ts:36-39`）；`WorkflowResult.error` 只进 tool 结果/返回值（`workflow/src/types.ts:72-87`），事件侧 `workflow/end` 也刻意不带 value（`workflow/src/index.ts:80-89`）。
- 旁证（本票实验产物，非源码，仅供参考字段形状）：`/tmp/wf70/official-run-records.jsonl` 中实际落盘的记录与上表逐字段一致，且只有 `run-start`/`agent-start`/`agent-end`/`run-end` 四类。
- 运行级 in/out 的**间接**痕迹（由通用 tool 层而非 workflow 记录提供）：`tool/call` 会持久化原始参数 JSON 字符串（`packages/core/session/src/types.ts:369`，即 `script`/`meta`/`args` 原文），`tool/result` 持久化模型可见结果（`:383-393`），而 workflow 工具把返回值渲染成受 `maxResultChars`（默认 50000）截断的文本（`tool-workflow/src/index.ts:239-246`、`:402-407`）——即**返回值只以截断后的展示文本形式留在日志里**，不是结构化节点产物。

---

## 4 重启后可查性

**结论一句话：能。运行骨架随父 Session 持久化，冷启动后 `dsh-client-ui-workflow-run` 把四条事件确定性地重放成一个 `workflow-run` Chat 节点；程序侧可用 `ctx.sessionQuery` 的事件类型过滤器精确取这些记录——但没有任何 workflow 专用查询面，也没有 run 级重放/续跑 API。**

**证据**

- 折叠定义：`packages/client/ui-workflow-run/src/client/workflow-definition.ts:153-198` —— `kind: 'workflow-run'`、`target: 'chat'`，`match` 只认四个 `tool-workflow/*` 事件并按 `runId` 归并（`:157-165`），`start` 用 `run-start.data.name`（`:166-171`），`update` 处理 member start/end 与 run stopReason（`:172-183`），`buildViewNode` 以 `anchorSeq: context.start.event.seq` 锚定（`:184-197`）。
- 纯 Session 事件重放（不依赖 live run）：`packages/client/ui-workflow-run/README.md:46`（"The node is a deterministic replay of durable session events… A history tail containing only updates remains pending until an older page supplies the unique start, after which prepend, complete replay, and live append produce the same state"）；`docs/subsystems/workflow.md:128`。
- 中断语义（缺终态时的呈现）：`workflow-definition.ts:83-93`（只有 `turn.end.reason.kind ∈ {interrupted, forked}` 才把无 `run-end` 的 run 判为中断）与 `:100-101`、`:127-129`；README 的边界说明见 `packages/client/ui-workflow-run/README.md:36`（"A run or member without terminal events stays running…"）与 `:89`（"A run lost without terminal events in a normally ended Turn stays running"）。
- 冷读能力：`packages/session-query/session-query/src/corpus.ts:98-127`（先取 live，再 `listPersisted`/`inspectPersisted` 从持久化后端读，无持久化后端则 `notFound`）；事件记录带 `time`：`docs/subsystems/session-query.md:94-104`。
- 查询入口：`ctx.sessionQuery.filterEvents(sessionId, filters)`（`packages/session-query/session-query/src/index.ts:280-302` → `buildSessionEventSearchDocuments(loaded.events)` + 过滤），过滤器支持按事件类型：`docs/subsystems/session-query.md:131-136`（`{ kind: 'type'; values: readonly SessionEventType[] }`）。模型侧另有 `session_event_search`/`session_event_read` 工具（`packages/experimental/tool-session-query/README.md:47-53`）。**workflow 专用查询 API/表：未找到证据**（`tool-session-query` 与 `session-query` 全文无 `workflow` 命中，仅 README 的普通英文 "workflows" 词）。
- 可见范围是**身份与状态**，不含内容：`packages/client/ui-workflow-run/README.md:12`（"The node shows identities and statuses only; scripts, outputs, errors, logs, usage, topology, and controls remain outside this surface"）、`:91`（"The node shows run, phase, member identity, and status only"）。
- 「续跑」不存在：`packages/workflow/workflow/README.md:127`（"**No journaling or resume** — scripts, child progress, and intermediate values are not checkpointed, so a process restart cannot continue a run"）。

---

## 5 程序化集成面

**结论一句话：类型上可以 `ctx.workflowEngine.start({script, meta, args, parent, signal})` 由插件直接调用（README 明确支持），但 `parent` 必须是注册在 `ctx.agents` 里、且 fiber 仍存活的真 Agent；「无会话进程」没有合法的 parent 来源——daemon 想跑 workflow，唯一合法路径是自己 `ctx.agents.create()` 出一个会话型 Agent 当 parent，或复用现存活 Agent。**

**证据**

- 请求面：`packages/workflow/workflow/src/runtime-types.ts:19-34` —— `script`、`meta`、`args?`、`subagentProvider?`、`maxTotalAgents?`、**`parent: Agent`（required）**、`signal?`；契约文案 "`parent` is required because every `agent()` spawned by the script is attributed to that live Agent"（`:15-18`）；`WorkflowEngine.start` 抽象方法 `packages/workflow/workflow/src/index.ts:162-168`；官方 README 的 programmatic 用法 `packages/workflow/workflow/README.md:49-53`（"Plugin consumers can start a run directly"）。
- `Agent` 不是瘦接口：公共面只有 `id`（`packages/core/agent/src/types.ts:16-19`），但 runtime 面被模块增强为**必须携带 `session: Session`、`ctx: Context`、`cancel()/whenIdle()`**（`packages/core/agent/src/runtime-types.ts:190-203`）。伪造一个 `{id}` 对象在类型上不成立。
- 运行期硬校验点（两处，任一都要求活 Agent）：
  1. `ctx.workingDirectory.ensure(parent, signal)`（`packages/workflow/workflow-ptc/src/host.ts:142`，在 `drive()` 里最先 await：`host.ts:283`），其实现含 `agent.ctx.fiber.assertActive()`（`packages/session/working-directory/src/index.ts:134-140`）。
  2. 每个 `agent()`：`subagents.startActivation({ parent: this.parent, ... })`（`host.ts:203-218`）→ `if (this.ctx.get('agents')?.get(spec.parent.id) !== spec.parent) throw new SubagentError('subagent creation requires the exact live parent agent', 'UNAUTHORIZED')`（`packages/subagent/subagent/src/index.ts:275-277`）。
- 注意边界细节：`PtcWorkflowEngine.start()` 自身**不做** registry 存活校验（`packages/workflow/workflow-ptc/src/index.ts:134-189` 只校验 meta、body parse、provider 路由、上限，然后 `new PtcWorkflowRun(...)`），存活判定被推迟到第一次 `cwd` 解析 / 第一个 `agent()`。所以「传错 parent」不会在 `start()` 立刻报错，而是在 run 内以 `stopReason:'error'`/fatal `AGENT_START` 收场。
- sandbox 也绑定 parent 的会话：`runCtx.sandboxPolicy.resolve({ session: request.parent.session })`（`workflow-ptc/src/index.ts:167`）。
- 合法 parent 来源只有 registry：`ctx.agents.get(id)`（活 Agent）、`ctx.agents.create({sessionId, agentOptions})`、`ctx.agents.resume({resumeSessionId})`（`packages/core/agent/README.md:32-45`；实现 `packages/core/agent/src/index.ts:410-428`），且 `create/resume` 需要注册了 agent factory（`dsh-agent-loop`）与 Session 存储（同 README `:28-30`）。**「无会话进程」的 parent 来源：未找到证据**；`WorkflowStartRequest` 也没有 `sessionId`/无 parent 的变体。
- 结论口径：daemon（中心插件）**可以**是 workflow 的「调用者」，但必须先拥有一个活 Agent（通常新建一个常驻「house session」）；它不能「以中心自身身份」无会话地启动 run。

---

## 6 事件可订阅性

**结论一句话：`workflow/start|phase|log|agent-start|agent-end|end` 是可被同进程内任意插件 `ctx.on` 订阅的 observe-only emit，中心插件可以订阅并自行落库；但 payload 只有身份/状态（无 in/out、无耗时、无时间戳），且 phase/log 不携带序号，落库需要订阅方自己补时间与因果。**

**证据**

- 事件声明与模式：`packages/workflow/workflow/src/index.ts:31-91`（`interface Events` 六条，均标 `@mode emit`）、`:93-100`（事件名闭集）；分发实现 `:175-186` —— 遍历 `this.ctx.events.dispatch('emit', [name, ...args])`，逐监听器 try/catch + 拒绝对 Promise 的 `catch`，只 `logger.warn`，不影响执行（"Every emit is per-listener contained"：`docs/subsystems/workflow.md:120`）。
- 订阅可行性有第一方先例：`packages/workflow/tool-workflow/src/record.ts:37-54`（一个插件 ctx 同时订阅 phase/log/agent-start/agent-end）与 `packages/workflow/tool-workflow/src/index.ts:115-136`（订阅 agent-start/agent-end 并写 Session）。
- 跨 ctx 可见性：分发时没有传 carrier（`workflow/src/index.ts:176`），cordis `_resolve` 对 `filter === undefined` 不过滤监听器（`vendor/cordis/src/events.ts:160-184`），因此挂在祖先/根 ctx 的中心插件同样能收到。**跨进程投递：未找到证据**（事件总线是进程内 Cordis Events；`dsh-client-ui-workflow-run` 也不订阅事件，而是回放 Session 事件，见 `packages/client/ui-workflow-run/README.md:46`）。
- payload 字段（`packages/workflow/workflow/src/types.ts`）：
  - `workflow/start` / `workflow/phase` / `workflow/log`：`WorkflowRunInfo{id, meta}`（`:89-95`）+ `title`/`message` 字符串（`index.ts:44-58`）。
  - `workflow/agent-start`：`WorkflowAgentInfo{seq, label, phase?, childId}`（`:97-107`）。
  - `workflow/agent-end`：上一结构 + `outcome: 'completed'|'failed'|'cancelled'`（`:109-116`）。
  - `workflow/end`：`WorkflowResultInfo{stopReason, error?, agentsStarted}`（`:124-131`）——**刻意不含 value**（`workflow/src/index.ts:80-89`、`types.ts:118-123`）。
  - → **无 in/out 正文、无耗时、无 timestamp、无 step 序号；`error` 只在 `workflow/end`（且仅非 completed 时）出现，`agent-end` 不带失败原因。**
- payload 别名风险（与文档不一致，决策相关）：`docs/subsystems/workflow.md:120` 声称 "every listener receives its own payload clone"，但 `emitWorkflowEvent` 直接把同一个对象传给所有监听器（`workflow/src/index.ts:175-186`），cordis `dispatch` 也不克隆（`vendor/cordis/src/events.ts:180-184`）；`WorkflowRunInfo` 是 `start()` 里创建的单例（`workflow-ptc/src/index.ts:140`）。**落库的订阅方必须自行深拷贝、不要原地改 payload**（agent 的 info 对象是每次新构造：`runtime.ts:192`、`:204`）。
- 观察面缺「代码节点」事件：六条事件里没有任何脚本步骤事件，故中心无法靠订阅补齐 §3 缺失的代码节点留痕（`workflow/src/index.ts:93-100`）。

---

## 7 约束

**结论一句话：一个 context 只允许一个 engine（第二个注册即抛错）；agent 并发默认 `min(16, cores-2)`、单 run 总 agent 上限默认 1000、单次组合子条目上限 4096，但真正先卡住的是 subagent 层的硬并发 8（超限抛错不排队）；取消是硬中止、没有任何整体超时（只有 5000ms 的同步切片 VM 超时）；文件策略强制复用调用方 Session 的 sandbox policy，PTC runtime 无法 enforce 时直接失败。**

**证据**

- 单引擎：`docs/subsystems/workflow.md:5`、`packages/workflow/workflow/README.md:71`（"one engine serves a context at a time — loading a second engine fails loudly"）；机制在 cordis `reflect.provide`：同名服务已注册即 `throw new Error('service "workflowEngine" has been registered at <...>')`（`vendor/cordis/src/reflect.ts:291-303`）。
- 并发上限：config `maxConcurrentAgents`（`0` = 自动）默认解析为 `min(16, max(1, availableParallelism() - 2))`（`packages/workflow/workflow-ptc/src/index.ts:36-37`、`:141-148`）；实现是 guest 内 FIFO 槽位（`packages/workflow/workflow-ptc/src/runtime.ts:142-160`，`agent()` 在 `:179` 取槽、`:227` 释放）。
- 总 agents 上限：默认 1000（`workflow-ptc/src/index.ts:38`、`:109`），每 run 可下调但**不可超过部署上限**（`index.ts:83-95`，`INVALID_ARGUMENT`）；触顶抛 `AGENT_CAP`（`runtime.ts:168-173`）。
- **第二道更硬的并发闸门（易被忽略）**：`ctx.subagents` 的 `maxActiveSubagents` 默认 8（`packages/subagent/subagent/src/index.ts:188`、`:197`），`ActivationPool.reserve` 在满额时**抛 `ACTIVATION_LIMIT_REACHED` 而不是排队**（`packages/subagent/subagent/src/activation.ts:23-30`），而 workflow 每个 agent() 都会先 reserve（`packages/subagent/subagent/src/manager.ts:711-712`）。该错误经 `runtime.ts:189-191` 变成 fatal `AGENT_START` → 整个脚本失败。因此「workflow 并发 16 + subagent 上限 8」的组合会在第 9 个同时存活子代理处炸掉，除非部署同时调高 `maxActiveSubagents`。
- 条目上限：`maxItemsPerCall` 默认 4096（`workflow-ptc/src/index.ts:40-41`、`:110`；`runtime.ts:342-349`）。
- 取消语义：`WorkflowRun.cancel(reason?)` / `dispose()`（`workflow/src/runtime-types.ts:40-48`）；PTC 实现在 `host.ts:139-141`（外部 signal 桥接）、`:151-156`（首个取消原因胜出、abort controller + 立即 dispose 已发布子代理）、`:162-166`（`dispose()` 幂等，等待脚本与子代理静默）；`drive()` 的 finally 统一 abort、等待 pending、给存活成员合成 `cancelled` 结束（`host.ts:309-319`）；取消结果 `stopReason:'cancelled'` 且带原因（`host.ts:276-278`、`:300-302`）。工具层另把调用方的 `exec.signal` 桥接到 `run.cancel('parent step aborted')`（`tool-workflow/src/index.ts:447-451`）。
- 超时语义：**无整体时限** —— `host.ts:297` 显式 `timeoutMs: null`（PTC 侧 null = 不设 deadline），文档同口径 "The PTC engine has no overall elapsed deadline"（`docs/subsystems/workflow.md:95`）；唯一的时限是脚本初始同步切片的 VM 超时 `syncTimeoutMs` 默认 5000ms（`workflow-ptc/src/index.ts:42-43`、`:147`；`runtime.ts:107`）。PTC provider 自带的 `timeout` 默认/上限机制因此被绕过（`ptc-runtime/src/index.ts:146-147`）。**没有 per-node 超时、没有 retry 配置**（`agent()` 选项闭集里也没有 timeout/retry：`runtime.ts:33-35`）。
- 进程与文件策略：workflow 明确「在以调用 Session 的 file policy 约束的共享 Node PTC 进程里执行」（`docs/subsystems/workflow.md:7`）；policy 由 `sandboxPolicy.resolve({session: parent.session})` 解析（`workflow-ptc/src/index.ts:167`），下发给 PTC（`host.ts:285-297`，其中 `:285-287` 要求 runtime 能 enforce，否则非 `danger-full-access` 直接报错）；Node runtime 的 `sandboxMode` 来自部署默认模式（`packages/ptc-runtime/ptc-runtime-node/src/index.ts:50`），执行前强制要求已解析 policy 与绝对 cwd（`packages/ptc-runtime/ptc-runtime-node/src/execution.ts:74-79`、`:86-88`）。
- 脚本体内**没有任何 Node/fs/network/timer 能力**：body 在一个只注入 6 个全局（`agent/parallel/pipeline/phase/log/args`）的 `vm.createContext({})` 里跑（`workflow-ptc/src/runtime.ts:83-98`），工具描述也这么承诺（`tool-workflow/src/index.ts:166`、`docs/tool-catalog.md:2552`）。注意这是**能力裁剪**而非独立沙箱：真正的隔离边界是外层 PTC 进程 + 文件策略。
- 其它已声明边界：调用方必须 `dispose()`，引擎卸载不会收回已接受的 run（`workflow/README.md:83-85`）；无 journaling/resume（`workflow/README.md:127`）；无嵌套/保存的 workflow（`workflow/README.md:128`）。

---

## 硬判据打分

### ① 自定义代码节点（TS）—— **不通过**

- 理由：脚本体按纯 JS 编译（`new vm.Script` 两处：`workflow-ptc/src/index.ts:55-65`、`runtime.ts:73-81`），TS 语法直接 `SCRIPT_PARSE`；TS 只可能出现在 PTC 程序里，且是「擦除」不是「编译」，`enum`/`namespace` 等必然抛错（`ptc-runtime-node/src/execution.ts:152-178`；`node_modules/@types/node/module.d.ts:248-275`）。因此「用 TS 写任意代码节点（含 enum、类型工具）」在该引擎上不成立；即便只用可擦除注解，workflow 脚本体也拿不到。
- 可接受替代：用纯 JS 写代码节点（能力上是 JS 而非 TS），或在代码节点里调用别的执行器（例如 `run_code` PTC 工具）——但那就不是 workflow 的节点留痕范围了。
- 证据：见 §1 全部条目。

### ② agent 节点（带 schema 返回）—— **通过**

- 理由：`agent(prompt, {schema})` 原生支持对象根 JSON Schema 子集并返回已校验对象（`runtime.ts:207-217`、`json-schema.ts:397-409`、`subagent.md:113-117`）；`label/phase/provider/model` 可控；子代理失败返回 `null`、基础设施故障 fatal（`runtime.ts:189-206`、`:221-222`），`parallel/pipeline` 语义清晰且有 fatal 纪律（`runtime.ts:284-349`，`workflow.md:116`）。边界是 schema 子集很窄（无 `$ref`/`pattern`/`minimum`/`anyOf` 等），且 provider 必须声明 `outputSchema` 能力。
- 证据：见 §2 全部条目。

### ③ 每次运行的节点级留痕（in/out/耗时/失败，持久化可查）—— **不通过**

- 理由（四缺三 + 代码节点全缺）：
  - 持久化**有**，但只有骨架：`run-start{runId,name}` / `agent-start{seq,label,phase,childId}` / `agent-end{seq,outcome}` / `run-end{stopReason}` 写进父 Session 日志（`tool-workflow/src/types.ts:14-39`、`index.ts:93-151`、jsonl v4 见 `session-format-catalog/src/generated.ts:17`）。
  - **in/out 不在记录里**：无 prompt、无子代理输出、无 structured value（字段表即 `types.ts`）；要拿 in/out 得按 `childId` 去翻**子 Session**（`subagent/README.md:12,61`；`manager.ts:845-857`），而子会话是否落盘取决于部署的持久化后端与 caller-delivery 语义。
  - **耗时不在记录里**：payload 无时间字段，只能靠事件信封的 `time`（`packages/core/session/src/index.ts:830`）做 run-start/agent-start→end 的粗粒度差值；agent 内部阶段、代码步骤耗时不可得。
  - **失败详情不在记录里**：`agent-end` 只有三值 `outcome`，无 error/diagnostic；`run-end` 只有 `stopReason`。
  - **代码步骤零留痕**：既无事件也无 session 记录；`phase/log` 是瞬时事件，只进后台 job 环形输出（`tool-workflow/src/record.ts:40-54`、`README.md:80`）。
  - 且记录只覆盖**顶层 tool 调用**（`exec.parent === undefined`，`index.ts:443`）：中心若直接调 `ctx.workflowEngine.start`，连这四类记录都不会产生。
- 证据：见 §3 全部条目（含字段表）。

---

## 对中心调度系统的可用性判断

**总体：作为「中心 daemon 的通用 workflow 引擎」，官方引擎在「编排 agent」这一层是合格且干净的（schema 返回、并发/总量上限、取消、文件策略、确定性重放都成立），但在「调度中心的运行账本」这一层不合格——它不产出节点级 in/out/耗时/失败，代码节点完全没有观测面，而且 `parent` 强绑定活 Agent，daemon 无法以自身身份启动 run。**

**缺什么**

1. **节点级运行账本**（致命）：无 in/out、无 per-node 耗时、无失败详情、无代码节点事件。官方记录只是「运行骨架」，不足以支撑中心的工作流实例视图、重试决策、审计与成本核算（§3、§7）。
2. **TS 代码节点**（硬判据不通过）：脚本体是 JS，TS 注解即 parse error；即便走 PTC 也只有可擦除语法（§1）。中心若要「一切流程编排皆 workflow」且节点用 TS 写，这一条直接卡死。
3. **无会话 parent**（关键边界）：`WorkflowStartRequest.parent: Agent` 必填，运行期由 `workingDirectory.ensure` 的 `fiber.assertActive()` 与 subagent 的 `ctx.agents.get(id) === parent` 双重强制（§5）。daemon 只能先 `ctx.agents.create()` 一个常驻 Agent 当 parent——多一个「house session」及其生命周期/权限/成本，且所有子代理都会挂在它名下，血统与 UI 归属都会指向它。
4. **无整体超时 / 无 per-node 超时 / 无 retry**：`timeoutMs: null`（§7），中心必须自己在外面套 `AbortSignal` + 计时器，并自行实现节点级重试（引擎的 `agent()` 选项闭集里没有 timeout/retry）。
5. **subagent 并发闸门 8**：workflow 允许 16 并发，但 subagent 池默认 8 且**超限抛错不排队**（§7），中心必须显式调高 `maxActiveSubagents`，否则第 9 个并发子代理会让整个脚本 fatal。
6. **事件面不足以单独当账本**：六条事件无 in/out、无耗时、无时间戳、无序号（phase/log）、`agent-end` 无失败原因；且只有同进程可见（§6）。文档声称的 per-listener payload clone 在实现里不存在（§6），订阅方必须自己拷贝。
7. **无 journaling/resume、无嵌套 workflow、无 token 预算**（`workflow/README.md:126-130`）。

**要补什么（按性价比排序）**

1. **中心自己订阅事件落库**（必须）：`ctx.on('workflow/start|agent-start|agent-end|end|phase|log')` 全部订阅，收到即写自己的库，并**自己打时间戳、自己维护 run→node 的因果与序号**（事件本身没有）。注意三点：payload 要深拷贝再存；`phase/log` 只当旁注文本；`agent-end` 的 `outcome` 之外没有失败原因，失败原因只能从 `workflow/end.error` 或子 Session 取。
2. **中心自建「run 包装器」**（必须）：不要直接调 `ctx.workflowEngine.start` 就完事——在中心侧包一层，负责 (a) 准备合法 parent（常驻 Agent，明确其 session/权限/cwd）；(b) 外部总超时与取消（`AbortSignal` + `run.cancel()`/`dispose()`）；(c) 记录 `script`/`args`/最终 `result.value`（引擎不落这些）；(d) 把 `agentsStarted`、`stopReason`、`error` 写进自己的实例表。
3. **节点 in/out 的取数方案**（必须选一条）：(a) 让 agent 节点把输入/输出**写进 prompt 约定或返回值**，由中心从 `result.value` 里取；(b) 用 `childId` 去读子 Session 日志（`sessionQuery.filterEvents` / `session_event_read`），前提是部署开启持久化；(c) 自建「代码节点」不走 workflow 脚本，而走中心自己的执行器——因为 workflow 对代码节点没有任何观测面。
4. **代码节点的 TS 诉求**：官方引擎无法满足，只能降级为 (a) JS 写节点；或 (b) 节点内调 `run_code`（PTC，支持可擦除 TS）并把结果回填；或 (c) 在中心层另设代码执行器，只把 agent 编排交给 workflow。
5. **并发与配额**：部署同时调高 `workflow-ptc.maxConcurrentAgents` / `maxTotalAgents` 与 `subagent.maxActiveSubagents`，并在中心侧做自己的准入（否则 subagent 池满会 fatal 而不是排队）。
6. **可查性**：中心库保留 `runId` 与父 Session 的 `(sessionId, anchorSeq=run-start.seq)` 映射，冷启动后既能用 `ctx.sessionQuery` 复核官方记录，也能和中心自己的账本对账；UI 侧可直接复用 `workflow-run` 节点（只显示身份/状态），不要期待它展示 in/out。

**「无会话 parent」结论**

- **无会话进程不能启动 workflow run**（以官方引擎当前语义）：`parent` 是必填的活 Agent，`start()` 之后会在 `workingDirectory.ensure`（`fiber.assertActive`）或第一个 `agent()`（`ctx.agents.get(id) === parent`）处失败；`WorkflowStartRequest` 不存在无 parent/仅 sessionId 的变体（§5）。
- 中心 daemon 的可行做法：**自己持有一个常驻 Agent（house session）**作为 parent。这样每个 run 都合法，但代价是：所有子代理血统挂在 house session 下、需要管理它的 cwd/sandbox/预算与生命周期，且 run 的官方留痕落在 house session 的日志里（中心若要按业务实例检索，必须自己维护映射）。
- 若中心确实要「无会话驱动」，这不是配置问题而是**引擎契约缺口**：需要（上游）新增无 Agent 的启动形态，或由中心自己实现一个 `WorkflowEngine` 替身（seam 本身允许替换引擎，见 `workflow/README.md:71`），否则只能在中心层面接受「一个常驻 Agent」这一事实。
