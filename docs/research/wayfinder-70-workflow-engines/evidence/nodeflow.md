# dsh-node-flow v0.2.0 只读取证（workflow 引擎候选）

- 仓库：`/tmp/dsh-node-flow`，HEAD `2cd5158`，`package.json` version `0.2.0`，作者 yhz（CodermanYHZ）。
- 取证方式：只读。未改源码、未安装到任何 profile、未执行任何会写 `$DSH_HOME` 的命令。
- 路径均相对仓库根 `/tmp/dsh-node-flow`；一句话结论里凡与 README 冲突处，以 `src/` 与已提交的 `lib/` 为准（安装 DSH 后加载的是 `lib/`，与 `src/` 同代：`lib/index.js:7-9` 与 `src/index.ts:7-9` 逐字一致，`lib/index.d.ts` 只导出 `name`/`inject`/`apply`）。

---

## 1 Code 节点

**结论：只有 Python，没有 TypeScript。**执行形式是宿主 Node 侧起子进程 `python -u -c <code>`（不是 function-body，也不经过 `ctx.ptcRuntime`）；上游输入从环境变量 `DSH_INPUT` 读，返回值是 stdout 文本；`timeout` / `onError` / `retries` / `retryDelayMs` 四个字段齐备。

**证据**

- 唯一运行时是 Python，TS 路径已被删除：`src/index.ts:7-9`（"Python is the only code runtime: the former TypeScript/`ctx.ptcRuntime` path is gone"）；`src/index.ts:2262-2263`（health 里只报 `python`）；`src/index.ts:35`（插件只 `inject = ['webServer']`，全文无 `ptcRuntime` 调用，`lib/index.js` 中 `ptcRuntime` 仅出现在该注释里）。
- 执行方式与入参/返回值：`src/index.ts:461-507`。命令 `execFile(cmd, ['-u','-c',code], …)` 在 `481-493`；环境变量注入 `DSH_INPUT` 在 `475`（对象会被 `JSON.stringify`，见 `466-471`）；返回值取 `stdout.trim()`（`501-502`），stdout 每一非空行同时进 `logs`（`502`）。**节点值类型恒为 string**。
- 失败判定：只有进程非 0 退出才算失败，错误文案取 `stderr || error.message`（`495-499`）。也就是说 **stderr 有输出但退出码为 0 不算失败**——这一点与内置帮助里"stderr 非空会让节点报错"（`src/components/HelpDoc.tsx:178`）不一致，以代码为准。
- 超时：节点级 `timeout`（秒，字符串）→ `makeTimeoutSignal`（`src/index.ts:524-537`），在 code 节点里 `1821` 使用；另有全局硬上限 600s（`src/index.ts:49`），`execFile` 的 `timeout` 参数也设为它（`488`）。
- 失败策略字段：`timeout` / `onError`（`'stop'|'continue'`）/ `retries`（0-5）/ `retryDelayMs`（0-10000）定义在 `src/model.ts:90-99`；执行语义在 `src/index.ts:1787-1796`（解析）与 `1903-1926`（重试循环、`onError==='continue'` 时 `fanOut('')` 继续）。UI 对应项见 `src/components/Inspector.tsx:495-511`（timeout/onError）与 `548-569`（重试）。
- **文档声明与实现冲突（决策相关）**：`README.md:29`、`README.md:61`、`README.md:138` 与 `README.en.md:29,65,162,204` 都写"TypeScript 与 Python / `ctx.ptcRuntime` / function-body"，但 `src/model.ts:87-89` 注明 "Python only；`language` 字段仅为文档兼容保留"，`src/model.ts:154` 给新节点默认 `language: 'python'`，`src/model.ts:214` 的 `toStepList` 直接把 `language` 硬写成 `'python'`，`/run` 路由 "a legacy `language` field is accepted and ignored"（`src/index.ts:2315-2316`），客户端也固定发 `language: 'python'`（`src/components/Toolbar.tsx:287`）。内置帮助说得对：`src/components/HelpDoc.tsx:165`（标题"代码执行 code（Python）"）、`HelpDoc.tsx:178`（"TypeScript 运行时已经移除：`language` 字段即使存在也会按 Python 执行"）、`HelpDoc.tsx:304`。**配套 skill 仓（0.1.0）仍教 `language: "typescript"` + `dsh.input(null)`**（https://github.com/CodermanYHZ/dsh-node-flow-skill 的 `references/node-types.md`），照它生成的图会在 0.2.0 上静默按 Python 执行并报语法错。
- 客户端 → 宿主的节点级入口：`POST /dsh-node-flow/run`，body `{program, language, input, timeout}`（`src/components/Toolbar.tsx:284-288`），宿主侧 `src/index.ts:2297-2337`。

---

## 2 Agent 节点

**结论：用 `ctx.subagents.startActivation`（`delivery: 'caller'`）拉起真子代理，返回纯文本，没有 schema/JSON 输出能力；模型路由、超时、失败策略、重试都能配；没有任何"问人/HITL"能力。**

**证据**

- 调用缝：`src/index.ts:411-454` 的 `delegateToSubagent`，`startActivation({provider, label, request:{prompt, parent, agentOptions?, maxDepth?}, signal, delivery:'caller'})` 在 `435-446`；结果用 `outputText(result)` 拍平（`378-384`：只取 `type === 'text'` 的块并 `join('')`）。`stopReason` 映射成错误文案见 `360-376`。
- 入口：`POST /dsh-node-flow/run-agent`（`src/index.ts:2615-2690`），客户端调用在 `src/components/Toolbar.tsx:344-355`；`prompt` 由"上游输入 + 节点 prompt"拼成（`Toolbar.tsx:327` 与宿主侧 `src/index.ts:1838` 同构）。
- **无结构化输出**：`SubagentResultLike` 里虽然声明了 `structured?: unknown`（`src/index.ts:74`）、provider 能力里声明了 `outputSchema?: boolean`（`src/index.ts:92`），但这两者**从未被使用**：`435-446` 的 spec 没有 `outputSchema` 字段，返回值只走 `outputText` 的文本拼接（`379-384`），节点记录里 `output` 也只是这段文本（`1866`）。→ **schema/JSON 输出：未找到实现证据**。要在下游拿结构化数据，只能"prompt 里要求输出 JSON + 下一个 Code 节点自己 parse"，没有校验、没有校验失败重试。
- 模型路由：`data.model` 存 `"provider|modelId"`（`src/model.ts:61-63`），宿主侧 `parseAgentOptions` 解析（`src/index.ts:1727-1735`）后作为 `agentOptions` 传入（`1855`）；provider 若声明 `capabilities.agentOptions === false` 则直接失败并给出原因（`421-426`）。模型下拉来自 `ctx.llm.listProviders()/listModels()`（`src/index.ts:2737-2771`，UI `src/components/Inspector.tsx:262-272`）。
- 超时：`data.timeout` → `makeTimeoutSignal`（`src/index.ts:1843`）→ 作为 `signal` 传给 activation（`1856`），超时判定与文案在 `1859`、`2668`。
- 失败策略：`onError` stop/continue + `retries`/`retryDelayMs`，与 code 节点共用同一套重试循环（`src/index.ts:1867`、`1903-1926`；UI `src/components/Inspector.tsx:289-295`、`548-569`）。`maxDepth` 不由节点配置，取宿主策略 `subagents.resolveMaxDepth()`（`src/index.ts:429-442`）。
- 执行位置/沙箱：Agent 节点不是"随便找个活着的会话"，而是每个工作区一个"节点模式运行会话"，子代理挂在该会话下，因此继承该工作区的目录与沙箱边界（`src/index.ts:1569-1608`、`README.md:99-107`）。
- **HITL：未找到证据**。全仓 grep `HITL|人工|审批|确认`（源码 + README + docs）无命中；节点类型表无"人工/等待"类节点（`src/model.ts:14-25`）；`sessionController.prompt` 虽在缝里（`src/index.ts:160-168`），唯一调用点是新建运行会话时那条一次性引导消息（`src/index.ts:1664-1674`），与"运行中向人提问"无关。

---

## 3 运行留痕

**结论：每次运行一条不可变 JSON 文件 `$DSH_HOME/workflow-canvas/runs/<runId>.json`，含图快照 + 每节点 `status/ms/output/error/logs/attempts` + 最终 `output`；不含节点输入；保留 30 天 / 200 条；有"列表 + 详情"两个 HTTP 查询口和画布回放。**

**证据**

- 路径与文件名：`runsDir()` = `<DSH_HOME>/workflow-canvas/runs`（`src/index.ts:642-647`、`707-709`），写入 `${run.runId}.json`（`src/index.ts:1272-1279`）。`runId` 形如 `run-<base36 时间>-<随机>`（`721-725`）。
- 一条 run 的字段（类型定义就是落盘结构）：`src/index.ts:618-636` —— `runId`、`workflowName`、`workflowKey`（名字归一化，用于按工作流聚合）、可选 `workflowId`/`nodeId`（listener 触发时）、可选 `scheduleId`、`trigger: 'manual'|'cron'|'listen'`、`startedAt`、`durationMs`、`status: 'ok'|'error'`、`failed`（失败节点数）、**`doc`（整张图快照，可为 null）**、`nodes[]`、可选 `output`（最终输出）。
- 每节点字段：`src/index.ts:607-617` —— `id`、`kind`、可选 `label`、`status: 'ok'|'error'|'skipped'`、`ms`（节点耗时）、可选 `output`、可选 `error`、可选 `logs`（stdout 行）、可选 `attempts[]`（每次重试的 `{attempt,status,ms,error}`，`568-573`）。**没有 `input` 字段**：浏览器内存里的 `lastRun.input`（`src/model.ts:30-31`、`src/components/Inspector.tsx:576-581`）在 `reportRun` 上报时被丢掉（`src/components/Toolbar.tsx:149-162` 只带 id/kind/label/status/ms/output/error/logs/attempts），宿主 `record-run` 也只映射这些（`src/index.ts:3012-3037`）。→ **节点级 in/out 里的 "in" 没有持久化证据**。
- 节点顺序与失败语义：宿主图遍历器为每个执行过的节点建记录，未执行到的节点不会出现在 `nodes[]`（`src/index.ts:1753-1760` 先建 `skipped`，但只有被执行到的才 `setRec`）；`status` 依据 `node.error` 决定（`1438-1447`）。
- 落盘时机与镜像：`persistRun`（`src/index.ts:1272-1302`）先写独立文件，再同步一份到旧版 `runs.json`（`1280-1301`，该文件被 `saveRuns` 截到 50 条，`701-703`），最后 `pruneRuns()`。
- 保留策略：30 天 / 200 条（`src/index.ts:639-640`），清理逻辑按"文件名倒序 = 新版在前"，超出 200 或 mtime 早于 cutoff 即删（`1305-1331`）。
- 查询 API：`POST /dsh-node-flow/runs`（过滤器 `workflowKey|workflowId|nodeId|scheduleId|limit(≤500)|search`，返回**只有元数据** `RunMeta`，不含节点 payload，`src/index.ts:2935-2961` + `1334-1347`）；`POST /dsh-node-flow/run-detail`（传 `runId` 返回完整 `RunFile`，`2963-2982`）。
- 写入 API：`POST /dsh-node-flow/record-run`（浏览器手动运行把结果上报入库，`2984-3062`；`trigger` 固定 `'manual'` 见 `3044`）。
- 回放：「在画布回放」= `useCanvasStore.showRun`，用 run 的 `doc` 快照覆盖视图并把每节点 `lastRun` 填回去，同时暂存当前编辑缓冲（`src/store/canvas.ts:195-245`，退出 `246-262`）；README 的承诺见 `README.md:116-117`、`README.en.md:137`。

---

## 4 程序化执行能力（关键）

**结论：没有"跑一次工作流"的对外 API。**唯一真正的"整图运行"入口是 cron 定时器和 `listen` 常驻监听；UI 的「▶ 运行」其实是**浏览器里跑图**（逐节点回调宿主 `/run`、`/run-agent`）；能找到的唯一 headless 整图通路是"先 upsert 一条 schedule，再 `action:'run'`"这条曲线，且它不是为此设计的。

**证据**

- 全部对外路由清单：`src/index.ts:2149-2173`（共 22 条），其中**没有** `/dsh-node-flow/run-workflow` / `/workflow/run` 之类整图运行口；`lib/index.d.ts` 只导出 `name`/`inject`/`apply`，没有任何可 import 的"执行一次"函数。
- 宿主侧整图执行器 `runDocumentGraph`（`src/index.ts:1742-1928`）只有 3 个调用点：cron 到期（`2101`）、schedule 的 `action:'run'`（`2871`）、listener 收到一行事件（`1064`）。
- UI「▶ 运行」不在宿主：`src/components/Toolbar.tsx:185-484` 的 `onRun` 在浏览器里做图遍历（`executeNode` 在 `236`），节点级请求 `/run`（`284`）与 `/run-agent`（`344`），跑完再把结果 `POST /record-run` 上报（`168`）。
- **曲线 headless 通路（可用，但属于滥用 schedule 面）**：
  1. `POST /dsh-node-flow/schedule` body `{id, cron, doc, input, steps?}` → upsert 一条 schedule 记录，`doc` 就是整图快照（`src/index.ts:2878-2901`；`cron` 非空是硬校验，`2883-2885`；`id` 可固定，重复调用即替换，`2886-2899`）。
  2. `POST /dsh-node-flow/schedule` body `{action:'run', id}` → 同步执行整图并**直接返回** `{ok, runId, run}`（`src/index.ts:2865-2877`），同时落一条 `trigger:'manual'` 的 run 文件（`2874`）。
  - 代价：必须伪造一个合法 cron、会在「定时任务」面板留下记录（需再 `action:'delete'` 清理，`2841-2851`）；每次运行的输入只能是这条 schedule 的 `input`（`2891`），要换输入就得整条重写。
- **事件驱动通路**：`POST /dsh-node-flow/listener/start {workflowId, nodeId}`（`src/index.ts:2479-2496`）→ `startListener` 从**已保存的工作流文件**读图（`1099-1145`，未保存会报 "请先保存工作流"），把 `listen` 节点里的 Python 脚本常驻起来；脚本 stdout 每一行触发一次整图运行（`1019-1049`、`1052-1079`），结果写 run 文件但**不返回给触发者**，只能事后 `/runs` 反查。
- **访问控制会挡住外部 daemon**：所有路由先过 `routeRejection`（`src/index.ts:285-319`）；有 `ctx.connection` 时交给宿主的信任门（401/403，`298-304`），没有时退化为"Origin 与 Host 同源"校验（`305-308` + `215-230`）。普通 `curl` 不带 `Origin` 在退化路径下直接 403。→ 外部进程要走这些路由，必须模拟浏览器同源头。
- 没有取消/中断一次运行的路由（无 abort route）；只能靠节点 `timeout` 或杀宿主。
- 补充：`cron` 调度按**宿主本地时区**匹配，文档里的 `timezone` 字段只是预留（`src/components/HelpDoc.tsx:142`，`src/index.ts:2073-2117` 里没有时区换算）。

---

## 5 依赖与稳定性

**结论：`engines.dsh >= 0.2.0-rc.2`、peer 依赖 `@deepseek-ai/cordis ^4.0.1` + React 18；未发布 npm；无任何测试；单人维护、浅克隆里只有 1 个提交（2026-11-06）。**

**证据**

- 版本/引擎/peer：`package.json:3`（`0.2.0`）、`package.json:52-54`（`engines.dsh: ">=0.2.0-rc.2"`）、`package.json:55-59`（`@deepseek-ai/cordis ^4.0.1`、`react ^18`、`react-dom ^18`）。
- 未发布 npm：`README.md:70`（"已发布到 npm 之前，请从本地目录或 Git 仓库安装"）、`README.en.md:74`；我实际请求 `https://registry.npmjs.org/dsh-node-flow` 返回 **HTTP 404 / {"error":"Not found"}**。
- 用到的 DSH 0.2.x 服务（README 的对照表在 `README.md:57-64`，代码中的真实取用点）：`ctx.webServer`（`src/index.ts:35, 2284`）、`ctx.subagents.startActivation`（`435-446`）、`ctx.agents`（`1584, 2632`）、`ctx.llm.listProviders/listModels`（`2745-2767`）、`ctx.workspaceRegistry`（`1506, 2212`）、`ctx.sessionController`（`146-168, 1581`）、`ctx.agentLoop.resume`（`187-191`）、`ctx.connection.requestRejection`（`295-300`）、`ctx.slots`（客户端，`src/ui.ts:37`）。其中 `ctx.ptcRuntime` 只在 README 里出现（`README.md:61`），代码已不用（`src/index.ts:9`）。
- **无测试**：`package.json` 的 `scripts` 只有 `build / build:client / dev / typecheck / prepublishOnly`（`package.json:34-40`），没有 `test`；全仓无 `*.test.*` / `*.spec.*` 文件（`find` 结果为空），而 `README.md:194` 与 `README.en.md:219` 仍写着 `npm test`（不成立）。`tsconfig.json` 还把 `**/*.test.ts` 排除在编译外。
- 提交时间：`git log -1` → `2cd5158`，`2026-11-06 21:34:48 +0800`，作者 `yhz`，标题 "chore: sync lockfile with dev-dependency move"；该克隆是 **shallow（`.git/shallow` 只含该提交）**，仓库也没有任何 tag，因此"历史活跃度/发版节奏"无法从本地证据判断。
- 交付面风险：`package.json:26-33` 的 `files` 只带 `lib`（已提交的编译产物），`src` 不发；本次核对的 `lib/index.js` 与 `src/index.ts` 同代（头部注释一致），但**仓库里的 `lib/` 是手工/构建同步的产物，没有 CI 证据保证它与 `src/` 永远同步**（未找到 CI 配置：仓内无 `.github/`）。

---

## 6 最小工作流 JSON

**结论：文档结构以 `src/model.ts` 的类型为准（`{version:1, name, description?, executionWorkspaceId?, nodes[], edges[]}`，节点 `type` 恒为 `"workflow"`）；Agent 节点不支持 schema，所以 Assessment 只能在 prompt 里要 JSON、由下游 Code 节点 parse；文档持久化在 `$DSH_HOME/workflow-canvas/workflows/<id>.json`，`settings.json` 只存工作区绑定，不存图。**

**证据**

- 文档类型：`src/model.ts:115-130`（`version: 1` 字面量、`name`、可选 `description`、可选 `executionWorkspaceId`/`executionWorkspaceTitle`、`nodes`、`edges`）。运行时校验极宽：`/workflow` POST 只要求 `doc` 是对象且 `nodes[]`/`edges[]` 是数组（`src/index.ts:2433-2434`），**没有逐字段 schema 校验**。
- 节点类型与 `data` 字段：`src/model.ts:14-25`（11 种 kind）、`48-106`（`kind`/`label` 必填，其余按 kind）；节点外形 `src/model.ts:149-167`（`id`、`type:'workflow'`、`position`、`data`、`style.width/height`）与内置帮助 `src/components/HelpDoc.tsx:91-97` 一致。
- 端口名：`src/nodes/WorkflowNodeView.tsx:50-69` 是权威——`if` → `true`/`false`；`switch` → 每个 case + `default`；`loop`/`while` source → `iterate`/`done`，target → `in`/`back`；普通节点无 handle id。文字版在 `src/components/HelpDoc.tsx:269-285`，端口表也在配套 skill 的 `references/workflow-schema.md`（与代码一致）。运行时不检查 handle 合法性，写错端口 = 静默不走（`src/index.ts:1880, 1888-1889`）。
- 持久化路径：保存走 `POST /dsh-node-flow/workflow`（`src/index.ts:2409-2446`）→ `writeWorkflow` 原子写 `workflows/<id>.json`，并补 `id`/`updatedAt`（`src/index.ts:810-820`）；读回 `readWorkflow`（`778-788`）；首次激活把内置示例种进同目录（`822-833`）。`settings.json` 只有 `{bindings, lastWorkspaceId}`（`src/index.ts:1464-1489`），**不存图**；`schedules.json` 里嵌一份 `doc` 快照（`541-566`，`2871` 执行的就是它）；`runs/<runId>.json` 也嵌 `doc`（`633`）。
- 画布导入：`导入` 按钮读文件 → `importDocument`（`src/components/Toolbar.tsx:555-567`、`src/store/canvas.ts:278-287`），不设 `workflowId`，因此"导入后保存"会新建一个 workflow 文件。
- **没有自动保存**：只有显式 `保存`（`Toolbar.tsx:491-504`）才落盘，`workflowId === null` 时纯在浏览器内存里；`exportDocument` 只是组装对象（`src/store/canvas.ts:264-274`）。

### 6.1 最小 4 节点图（Trigger → Code(SourceScope+Gate) → Agent(Assessment) → Code(Decision)）

可直接存成 `.json` 用「导入」载入画布（`type` 恒为 `"workflow"`，`style` 按 `NODE_SIZE` 给）。注意三处 0.2.0 的硬约束：

1. 两个 Code 节点都是 **Python**（`language` 写 `typescript` 会被忽略并按 Python 跑，见 §1）；
2. Agent 节点**没有 schema 字段**，所以 Assessment 的 JSON 契约写在 prompt 里，由 Decision 节点做解析与**fail-closed** 兜底；
3. 4 节点线性图**不能短路**（只有 if/switch 能分叉），Gate 的结论只能随 JSON 一路传下去，真正的拦截发生在 Decision 节点。

```json
{
  "version": 1,
  "name": "wf70 · nodeflow 最小判断流",
  "description": "Trigger → Code(SourceScope+Gate) → Agent(Assessment) → Code(Decision)",
  "nodes": [
    {
      "id": "t1",
      "type": "workflow",
      "position": { "x": 40, "y": 240 },
      "data": {
        "kind": "trigger",
        "label": "输入",
        "text": "{\"taskId\":\"wf70-nodeflow-1\",\"kind\":\"assessment\",\"target\":\"dsh-node-flow\",\"depth\":0}"
      },
      "style": { "width": 124, "height": 124 }
    },
    {
      "id": "c-scope",
      "type": "workflow",
      "position": { "x": 240, "y": 240 },
      "data": {
        "kind": "code",
        "label": "SourceScope+Gate",
        "language": "python",
        "timeout": "30",
        "onError": "stop",
        "code": "import json, os\nraw = os.environ.get('DSH_INPUT', '')\ntry:\n    src = json.loads(raw) if raw.strip() else {}\nexcept Exception:\n    src = {'raw': raw}\nscope = {\n    'taskId': src.get('taskId') or 'wf70',\n    'kind': src.get('kind') or 'assessment',\n    'target': src.get('target') or '',\n    'depth': int(src.get('depth') or 0),\n}\nreasons = []\nif not scope['target']:\n    reasons.append('missing-target')\nif scope['kind'] not in ('assessment', 'review'):\n    reasons.append('kind-not-allowed')\nif scope['depth'] > 0:\n    reasons.append('depth-guard')\nout = {'scope': scope, 'gate': {'pass': len(reasons) == 0, 'reasons': reasons}, 'source': src}\nprint(json.dumps(out, ensure_ascii=False))"
      },
      "style": { "width": 124, "height": 124 }
    },
    {
      "id": "a-assess",
      "type": "workflow",
      "position": { "x": 460, "y": 240 },
      "data": {
        "kind": "agent",
        "label": "Assessment",
        "timeout": "180",
        "onError": "stop",
        "prompt": "你是工作流里的 Assessment 节点。上游输入是一个 JSON 对象，含 scope、gate、source 三个字段。只输出一个 JSON 对象，不要解释、不要代码围栏。字段契约：verdict 取 pass/review/deny 之一；severity 取 low/medium/high 之一；rationale 为一句中文理由；echo 必须原样嵌套上游那个 JSON 对象（即 echo.scope、echo.gate、echo.source，一个字段都不许改写或省略）。若判断信息不足，verdict 用 review。"
      },
      "style": { "width": 212, "height": 128 }
    },
    {
      "id": "c-decision",
      "type": "workflow",
      "position": { "x": 800, "y": 240 },
      "data": {
        "kind": "code",
        "label": "Decision",
        "language": "python",
        "timeout": "30",
        "onError": "stop",
        "code": "import json, os\nraw = os.environ.get('DSH_INPUT', '')\ntext = raw.strip()\nif text.startswith('```'):\n    lines = text.splitlines()[1:]\n    if lines and lines[-1].strip().startswith('```'):\n        lines = lines[:-1]\n    text = '\\n'.join(lines)\ntry:\n    a = json.loads(text)\nexcept Exception:\n    a = {'verdict': 'deny', 'parse_error': True, 'echo': {'gate': {'pass': False, 'reasons': ['unparseable-assessment']}}}\necho = a.get('echo') or {}\ngate = echo.get('gate') or {}\nverdict = a.get('verdict')\nok = gate.get('pass') is True and verdict in ('pass', 'review')\nout = {\n    'taskId': (echo.get('scope') or {}).get('taskId'),\n    'decision': 'proceed' if ok else 'hold',\n    'gatePass': gate.get('pass') is True,\n    'gateReasons': gate.get('reasons') or ([] if gate.get('pass') is True else ['missing-gate-echo']),\n    'verdict': verdict,\n    'severity': a.get('severity'),\n    'rationale': a.get('rationale'),\n}\nprint(json.dumps(out, ensure_ascii=False))"
      },
      "style": { "width": 124, "height": 124 }
    }
  ],
  "edges": [
    { "id": "e1", "source": "t1", "target": "c-scope" },
    { "id": "e2", "source": "c-scope", "target": "a-assess" },
    { "id": "e3", "source": "a-assess", "target": "c-decision" }
  ]
}
```

字段对照（都可回查类型定义）：`data.kind/label/text/code/prompt/timeout/onError` 见 `src/model.ts:48-106`；`style` 尺寸取自 `src/model.ts:133-145` 的 `NODE_SIZE`；`edges` 的 `data.label` 可选、路由只看 `sourceHandle`（`src/model.ts:111-112`、`src/index.ts:1880`）。

导入后如果要**定时/headless** 跑，还需要在画布上给某个 `schedule` 节点填 cron 并「保存定时」（`src/components/Inspector.tsx:127-153`）——注意那是另一张图（`schedule` 节点作入口），或在 §4 那条 `POST /schedule` 曲线里直接塞 `doc`。

---

## 硬判据打分

| # | 判据 | 判定 | 一句话理由 | 证据 |
| --- | --- | --- | --- | --- |
| ① | 自定义代码节点（TS） | **不通过** | 只有 Python：TS 运行时连同 `ctx.ptcRuntime` 一起被移除，`language` 字段被接受但忽略，旧 TS 图会按 Python 执行 | `src/index.ts:7-9`、`src/index.ts:2315-2316`、`src/model.ts:87-89`、`src/components/HelpDoc.tsx:178`（与 `README.md:61` 相反） |
| ② | agent 节点（带 schema 返回） | **部分** | agent 节点本身是真子代理（`startActivation` + `delivery:'caller'`），模型路由/超时/失败策略/重试齐全；但**没有任何 schema 能力**：`structured` 与 `outputSchema` 只声明不使用，结果一律拍平成文本 | 可用性：`src/index.ts:411-454`；无 schema：`src/index.ts:74`、`92`（声明）、`435-446`（spec 无 outputSchema）、`378-384`（文本拼接） |
| ③ | 每次运行节点级留痕（节点 in/out/耗时/失败，持久化可查） | **部分** | 持久化、可查、有图快照、有 `status/ms/output/error/logs/attempts`，还有 `/runs` + `/run-detail` + 画布回放；但**节点输入 `input` 完全没入库**，且保留仅 30 天/200 条、无导出/事件流，手动运行还依赖浏览器上报 | 字段：`src/index.ts:607-636`；缺 input：`src/components/Toolbar.tsx:149-162` + `src/index.ts:3012-3037`；保留：`src/index.ts:639-640, 1305-1331`；查询：`2935-2982` |

---

## 对中心调度系统的可用性判断

**能不能当中心 daemon 的引擎：不能直接当，只能当"降级候选 + 适配层包一层"。**

- **它本质是"人类画布工具"**：整图运行的三个宿主入口分别是 cron 到期（`src/index.ts:2101`）、`listen` 脚本的 stdout 行（`1064`）、以及定时任务面板的"立即运行"（`2871`）；UI 的「▶ 运行」根本不在宿主执行，而是浏览器遍历图后逐节点打 `/run`/`/run-agent`（`src/components/Toolbar.tsx:185-484`）。一个中心 daemon 想要的 "submit(doc, input) → runId" 契约**不存在**（无此路由：`src/index.ts:2149-2173`；无此导出：`lib/index.d.ts`）。
- **唯一能凑合的 headless 通路**是"upsert 一条 schedule 再 `action:'run'`"（`src/index.ts:2878-2901` + `2865-2877`），它能同步拿回 `{runId, run}`，也能按固定 `id` 反复覆盖。这意味着：**能跑，但每个请求都要写一次调度表、伪造 cron、并在失败时清理残留记录**；语义上"计划任务"和"一次调用"被混在同一张表里，多租户/幂等/并发控制全部要调用方自己补。
- **要用它当引擎，要付的代价（按严重度）**：
  1. **没有 TS 代码节点** → 所有适配逻辑、SourceScope/Gate/Decision 这类纯逻辑只能写 Python（`src/index.ts:7-9`），与 DSH 侧 TS 生态割裂，且代码节点以**宿主进程权限 + 宿主工作目录**起子进程（`src/index.ts:488` 只传 `env/timeout/maxBuffer/signal`，没传 `cwd`；listener 才有 workspace cwd，`926-935`），沙箱边界等于"无"。
  2. **没有结构化输出** → Assessment 的 JSON 契约只能靠 prompt，校验与重试得自己在下游 Code 节点里实现，失败即 fail-closed 或被当成文本吞掉（`src/index.ts:378-384`）。
  3. **节点输入不留痕** → 事后审计只能看到每个节点吐了什么，看不到它吃了什么；要补就得在 Decision 输出里冗余回显（我在 §6 的例子里正是这么做的），属于把审计责任推给图作者。
  4. **访问控制是浏览器同源** → 外部 daemon 必须模拟 `Origin`/`Host`，且受宿主 `ctx.connection` 信任门约束（`src/index.ts:285-319`）；没有任何 token/API key 形式的机器身份。
  5. **无取消、无并发治理** → 只有节点 `timeout`（`524-537`）与每 schedule 一个 `schedulesInFlight` 去重（`2093-2097`），没有全局队列/背压；listener 队列只有 5 条并会丢事件（`877`、`1039-1042`）。
  6. **可维护性** → 单人、未发 npm（registry 404）、无测试（`package.json:34-40`）、README 与代码在"TS 支持"上直接矛盾（`README.md:61` vs `src/index.ts:9`）、配套 skill 仍停在 0.1.0 的 TS 契约；一个中心调度器把它当底座，等于把编排语义绑在一份**没有回归测试的 3.1k 行单文件**（`src/index.ts` 3090 行）上。
- **适合的用法**：给人用的可视化编排器 + 轻量 cron（单机、低并发、可容忍丢一次运行）；若中心系统仍要选它，正确姿势是**只把它当"图编辑器 + 图模型"**（`src/model.ts` 的 `WorkflowDocument` 确实干净），执行层自己实现，或在上层加一个"schedule 适配器 + 审计回显 + 并发闸门"的薄壳，并接受上面的 1/2/3 三条硬约束。
