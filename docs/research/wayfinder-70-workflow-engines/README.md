# Wayfinder #70 原型：workflow 引擎双候选验证（官方 `ctx.workflowEngine` vs `dsh-node-flow`）

> 一次性原型，服务于决策票 [#70](https://github.com/wanghuahuishiwo/dsh-secretary/issues/70)；结论已回写该票。
> 目的：用同一张最小判断流实测两个引擎的硬能力，给决策规则（「都过关→官方；谁缺硬能力→淘汰或降级候补」）提供事实依据。
> 验证时间：2026-11-11；环境：DSH desktop 0.2.x；源码基线：`~/workspace/deepseek-harness`（`fcc0ad46`）、`dsh-node-flow` v0.2.0（HEAD `2cd5158`）。

## 0. 结论

**按既定规则裁决：一期 workflow 引擎用官方 `ctx.workflowEngine`；`dsh-node-flow` 降级候补（只作二期画布/图模型参考）。**

- 官方引擎：② agent 节点带 schema 通过（实跑）；① 代码节点是 JS（TS 在构建期转译）；③ 引擎自带运行持久化（会话内 run/成员记录 + UI `workflow-run` 回放），代码步骤的 in/out/耗时不进引擎账本，由中心侧约定补记。
- `dsh-node-flow`：② 无 schema（返回纯文本）、① 代码节点只有 Python（0.2.0 已删 TS，README 过期）、无 headless 契约、无测试 —— 缺硬能力，不进入一轮引擎选型。

下面的实测边界是**规格输入**（例如「代码步骤没有引擎级 in/out」要在中心账本设计里消化），不是选型阻塞。

## 1. 要回答的问题

中心判断流的三个硬判据：

| # | 硬判据 | 为什么硬 |
|---|---|---|
| ① | 自定义代码节点（TS） | Gate/Decision 是确定性逻辑，要能写代码、能单测 |
| ② | agent 节点（带 schema 返回） | Assessment 是模型判断，下游拿结构化字段，不能解析自由文本 |
| ③ | 每次运行的节点级留痕（in/out/耗时/失败，持久化可查） | 可观测是一等公民：节点要能回放、下钻，不能只闪高亮 |

## 2. 方法

- 同一张流，两个引擎各实现一次；
- 官方引擎：在真实 DSH 会话里用 `workflow` 工具**实跑**，再读会话日志（`~/.dsh/sessions/**/session.v4.jsonl.zstd`）核对留痕，并核对引擎源码；
- `dsh-node-flow`：**源码级取证**（未实跑；未发布 npm，读已提交 `lib/` 与 `src/`）。

判断流（与 `docs/research/agent-dispatch-architecture.md` §1/§6 对齐）：

```text
SourceScope（代码）: 归一化事件、判定源是否在范围内（aone bug）
Gate（代码）       : 确定性规则过滤（source 匹配、status=afk），不通过直接 drop
Assessment（agent）: 模型判断 priority / route / reason
Decision（代码）   : 由 assessment 字段机械得出 Assignment
```

输入事件（模拟 aone bug）：

```json
{"source":"aone","kind":"bug","id":"AONE-12345","title":"登录接口 5xx 无法登录","status":"afk",
 "body":"线上登录接口返回 502，影响部分用户，疑似刚合入的 session 过期逻辑；工单已交给 agent 处理。",
 "actor":"user:zhangsan"}
```

## 3. 候选 A：官方 `ctx.workflowEngine`（`workflow-ptc` / `tool-workflow`）

脚本：`official-spike.js`。实跑成功（`runId 8eb06e40-…`，4 个 phase + 1 个 agent），返回：

```json
{"scope":{"source":"aone","kind":"bug","inScope":true},
 "gate":{"pass":true,"reasons":[]},
 "assessment":{"priority":"P1","route":"worker","reason":"线上登录接口 5xx/502…"},
 "decision":{"assignment":"coding-worker","basis":"…"}}
```

### ① 自定义代码节点 → 引擎写 JS，TS 在构建期转译

- 脚本体按**纯 JS** 编译两次：宿主预检 `new vm.Script('(async () => {\n'+body+'\n})()')`（`packages/workflow/workflow-ptc/src/index.ts:55-65`）与 guest 内同款（`runtime.ts:73-81`）；任何 TS 注解都是 `SCRIPT_PARSE`。实测：
  `Error: workflow script does not parse: SyntaxError: Missing initializer in const declaration`
- `ptcRuntime.language === 'typescript'`（`workflow-ptc/src/index.ts:118`）只是「必须搭配 Node TS 版 PTC runtime」的能力开关，与脚本体语言无关（`ptc-runtime/src/index.ts:106-115`：language 是 "Informational, not gating"）。
- 结论：中心写 TS，构建期 transpile 成脚本片段再注入；代码节点能力不受影响。

### ② agent 节点（带 schema 返回）→ 通过

`agent(prompt, { schema })` 返回 provider 校验后的结构化对象（`runtime.ts:207-217`）；schema 是强制子集（对象根 + `type/properties/required/additionalProperties/items/enum/const/oneOf`，`packages/core/tools/src/json-schema.ts`）。失败语义：子代理非 completed 或 structured 缺失 → `agent()` 返回 `null`、`outcome: failed`；基础设施故障 / hook 误用 → fatal `WorkflowError` 炸掉整次 run（实测 `enum` 缺 `type` 即 fatal）。

### ③ 运行留痕 → 引擎持久化 run 与成员骨架；代码步骤 in/out 由中心补记

会话日志里 4 类持久记录（实测 seq 322–326，见 `official-run-records.jsonl`；字段表 `packages/workflow/tool-workflow/src/types.ts:14-39`）：

| 记录 | payload |
|---|---|
| `tool-workflow/run-start` | `{runId, name}` |
| `tool-workflow/agent-start` | `{runId, seq, label, phase?, childId}` |
| `tool-workflow/agent-end` | `{runId, seq, outcome}` |
| `tool-workflow/run-end` | `{runId, stopReason}` |

- 冷启动后可查：`dsh-client-ui-workflow-run` 把四事件确定性地重放成 `workflow-run` Chat 节点（`packages/client/ui-workflow-run/src/client/workflow-definition.ts:153-198`）；程序侧 `ctx.sessionQuery.filterEvents` 可按事件类型取记录。agent 节点的 in/out 在 `childId` 指向的子 Session 里（实测子 session 位于 `~/.dsh/sessions/<cwd>/<childId>/`）。
- 边界（规格输入，不是选型阻塞）：代码步骤（SourceScope/Gate/Decision）没有引擎级事件或记录，`phase()`/`log()` 只进后台 job 环形输出不落盘（`tool-workflow/README.md:80`）；记录只有身份/状态，没有 in/out、没有 per-node 耗时、没有失败详情；直接调 `ctx.workflowEngine.start()` 不产生这四类记录（只由顶层 tool 调用写，`tool-workflow/src/index.ts:443`）。→ 中心要把每个节点的 in/out/ms/status/error 记进自己的账本：脚本把节点结果放进返回值 + 订阅 `workflow/*` 事件 + 中心库落盘。
- **时序**：引擎无 journaling/resume（`workflow/README.md:145`）；中心必须自己补外部超时与取消（`host.ts:297` `timeoutMs:null`；`agent()` 选项闭集无 timeout/retry）。

### 其它边界（影响中心集成）

- `parent: Agent` 必填且必须是**活 Agent**（`runtime-types.ts:19-34`；运行期 `workingDirectory.ensure` 的 `fiber.assertActive()` 与 subagent 的 `ctx.agents.get(id) === parent` 双重强制）→ 中心必须先拥有一个常驻 Agent（headless 会话），不能以「无会话进程」身份启动 run。
- 事件 `workflow/*` 可被同进程插件订阅（先例 `tool-workflow` 的 job 镜像），但 payload 无 in/out/耗时/时间戳；文档称每监听器收独立 clone，实现并不克隆（订阅方须自行深拷贝）。
- subagent 池默认硬并发 8，超限**抛错不排队**（`ACTIVATION_LIMIT_REACHED` → fatal），workflow 侧允许 16 → 部署须同时调高 `maxActiveSubagents`。
- 一个 context 只能装一个引擎；脚本体内无 Node/fs/network/timer（只注入 `agent/parallel/pipeline/phase/log/args`）。

## 4. 候选 B：`dsh-node-flow` 0.2.0（社区插件）

artifact：`nodeflow-minimal-flow.json`（可直接「导入」画布的最小流）。

### ① 自定义代码节点 → 不通过（只有 Python）

- 宿主起子进程 `python -u -c <code>`，输入走 env `DSH_INPUT`，返回值 = stdout（`src/index.ts:461-507`）；
- 源码头部明写 **"Python is the only code runtime: the former TypeScript/`ctx.ptcRuntime` path is gone"**（`src/index.ts:7-9`）；`language` 字段被接受但忽略（`src/index.ts:2315-2316`、`src/model.ts:87-89`）；
- README 的「TypeScript / ctx.ptcRuntime」声明是过期文案（`README.md:29,61,138`），内置帮助才属实（`src/components/HelpDoc.tsx:178`）。

### ② agent 节点（带 schema 返回）→ 不通过

- 真子代理（`ctx.subagents.startActivation` + `delivery:'caller'`，`src/index.ts:435-446`），模型路由/超时/失败策略/重试齐全；
- 结果一律拍平成文本（`src/index.ts:378-384`）；`structured`（:74）与 `outputSchema`（:92）只声明、从未使用；
- 下游拿结构化数据只能「prompt 里要 JSON + 下个 Code 节点 parse」，无校验、无失败重试。

### ③ 节点级留痕 → 部分

- 每次运行一条不可变 JSON：`$DSH_HOME/workflow-canvas/runs/<runId>.json`，含图快照 + 每节点 `status/ms/output/error/logs/attempts` + 最终 output（`src/index.ts:607-636`）；
- **没有节点 `input` 字段**（`Toolbar.tsx:149-162` → `src/index.ts:3012-3037`）；保留 30 天 / 200 条；
- 手动运行是**浏览器跑图**后上报，宿主只负责单节点执行。

### 为什么只能降级候补

- **没有 `submit(doc,input) → runId` 契约**：22 条路由无整图运行口，`lib/index.d.ts` 只导出 `name/inject/apply`；唯一 headless 曲线是先 upsert schedule（伪造 cron）再 `action:'run'`；
- 路由过浏览器同源信任门、无 token/机器身份、无取消、无并发治理；
- 稳定性：单人维护、未发 npm、零测试、README 与代码在「TS 支持」上矛盾。

## 5. 打分

| 判据 | 官方引擎 | node-flow |
|---|---|---|
| ① TS 代码 | 引擎跑 JS，TS 构建期转译 | 不通过（Python only） |
| ② agent schema | 通过 | 不通过（纯文本） |
| ③ 运行留痕 | run 持久化 + UI 回放；代码步骤由中心补记 | 部分（缺 input、保留有限、无机器 API） |

## 6. 残余风险

- `dsh-node-flow` 未实跑（需第二 DSH 实例 + profile 安装）；其结论来自源码与已提交 `lib/`，不是运行结果。
- 官方引擎的「代码步骤无引擎级 in/out」需要在中心账本设计里消化；本票不把它当阻塞项，但它是规格输入。
