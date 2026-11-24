# graph 执行引擎选型证据

> 状态：只读调研证据，不作最终选型。
> 访问日期：**2026-11-24**。除项目约束外，事实只采用官方文档、官方源码、npm registry 元数据；文末来源列表中的 URL 均在该日访问。
> 范围：LangGraph（JS）、Temporal（TS SDK）、Restate、Inngest、trigger.dev、XState（with actors）、n8n（embedding 可行性），以及调研中发现的 Hatchet、LittleHorse；ComfyUI 架构要点；JS 画布库（litegraph.js、@xyflow/react、rete.js）取舍。
> 标注：**事实**有一手来源；**推断**是基于事实的适配分析，不是产品承诺。"未找到"处不补估值。
> 项目边界：沿用 [agent-dispatch 总览](../overview.md) 与 [底座细节](../foundation.md)——引擎是 DSH 插件、中心/节点双端装载、NATS/JetStream + CloudEvents 已定、权威事件历史只在中心（single writer）、判断层 esbuild 打包进 node:vm、副作用走 `ctx.runTask` 纸条、等待走 `ctx.waitFor`（信号名 + timeout）。

## 1. 结论摘要

### 1.1 直接结论（推断）

1. **没有任何现成引擎能同时满足「DSH 插件形态（库嵌入双端装载）+ NATS 事件入口 + 中心权威事件历史」三个硬约束。**服务型引擎（Temporal、Inngest、trigger.dev、Restate、n8n）各自带来独立进程、自己的持久层与自己的 API 面，会把"中心单一写入点 + 三处同构（传输事件 = 历史记录 = 观测）"改成双事实源；库形态引擎（LangGraph JS、XState）的持久化模型是**状态快照**而不是我们要的事件历史重放，且缺 durable 定时器与事件入口。
2. **foundation.md 1.5 的开发模型（判断层隔离 + runTask 纸条 + waitFor 登记 + 调包全局）本质上是 Temporal 模型的小型化。**Temporal 官方文档对 Workflow 的描述——事件历史、从头重放、已记录调用从历史注入结果、非确定性即错、Time/random 必须走 SDK 调包版——与 foundation.md 1.3/1.5 的措辞逐条对应（事实见 3.2，推断对应关系）。这既是自研路线的语义参考，也说明该模型有成熟先例。
3. **Restate 是语义上最接近我们 durable 原语集的现成引擎**（journal 重放、durable sleep、signal 多次解析、awakeable 一次性回调，见 3.3），但它是"server 代理一切"的架构：入口是 HTTP/Kafka 而非 NATS 订阅，journal 存在 Restate server 里而不是中心的权威事件历史，且为 BSL 1.1 许可（内部使用被 Additional Use Grant 明确允许）。
4. **n8n 作为 embedding 基本不可行**：Sustainable Use License 明确禁止"让外部最终用户通过你的产品构建/配置自己的 workflow"这一形态，禁止 fork 出自己的自动化产品；我们的画布体验恰恰是用户画 workflow。它也是独立 Node 服务而非库。
5. **推荐路线 B：自研轻量引擎内核（事件历史重放）+ 现成画布库（@xyflow/react）**，论证见第 6 节。画布不选 litegraph.js：Canvas 2D 手绘方案与 DSH Web 的 React 技术栈脱节，且上游 Comfy-Org fork 已归档；@xyflow/react（MIT、React 原生、节点/边模型完整）是首选，rete.js 备选。

### 1.2 复用与自研的边界（推断）

```text
DSH 中心/节点插件
  └─ 项目自有（自研内核）：事件历史追加日志、重放游标 + 指纹匹配、
       waitFor 等待登记表、durable 定时器、runTask 任务执行器、
       defineNode 开发模型、graph/实例目录
       └─ 画布层（现成库）：@xyflow/react 节点/边/交互
            └─ 基础设施（已定）：NATS JetStream + CloudEvents + Outbox
```

## 2. 候选对比矩阵

> "适配判断"列是**推断**；其余为压缩后**事实**，限制以后文为准。

| 候选 | durable 执行模型 | 事件入口 | durable 定时器 | TS 支持 | 自托管难度 | 与 NATS 配合 | 库嵌入 vs 独立服务 | 许可证 |
|---|---|---|---|---|---|---|---|---|
| **LangGraph (JS)** | checkpoint 快照（每 super-step 存图状态）；Functional API 把 task 结果存 entrypoint checkpoint；恢复 = 从 checkpoint 恢复状态，**不是代码重放** [L3][L4][L5] | 无内建事件订阅入口；触发靠进程内 invoke / Agent Server [L3][L4] | **无库级 durable sleep/cron 原语**（文档未见；等待靠 interrupt + 外部恢复）[L4][L6] | 一等 TS（`@langchain/langgraph` 1.7.5，Node ≥18，MIT）[L1] | 库本身零部署；持久化要自配 checkpointer（SQLite/Postgres）[L3] | 无官方 NATS 集成 | **库**，进程内嵌入 | MIT [L1] |
| **Temporal (TS SDK)** | 事件历史 + 从头重放：命令/事件有序日志是唯一事实源，恢复时重跑代码、已记录结果注入、非确定性即错；状态缓存是优化不是持久化依据 [T1] | Signal/Update/Query 发往特定 Workflow；不是按 type 的发布订阅；Task Queue 由 Worker poll [T2] | 有：Timer 事件、`startDelay`、Schedules（cron）；重启不丢 [T1][T2] | 一等 TS SDK；Workflow 在确定性沙箱运行、Webpack 打包、不得引用 Node/DOM API [T3]；Node 20/22/24 [T4] | 自托管 = Temporal Server 集群 + 持久化数据库（Cassandra/Postgres/MySQL 等）+ Elasticsearch（可选）；dev server 仅本地开发 [T5] | 无官方 NATS 事件入口；需自建桥接 Worker | **独立服务**（server）+ 库（worker/client） | server 与 TS SDK 均 MIT [T4] |
| **Restate** | journal 重放：每步副作用与结果记账，崩溃后重放 journal、跳过已完成步骤；状态与执行一起 journal；Virtual Object 单写者 [R1] | HTTP / Kafka 入口；SDK 侧 `ctx.signal` / awakeable / workflow promise 接收外部事件 [R1][R3] | 有：`ctx.sleep` 无上限、delayed messages、超时、cron 模式；"睡 12 小时崩溃后只补睡剩余 4 小时" [R2] | 一流 TS SDK（`@restatedev/restate-sdk` 1.18.4，MIT）；另有 Java/Kotlin/Python/Go/Rust/Ruby [R1][R6] | 单 binary（Rust），单节点可从磁盘恢复，或 HA 集群 [R1] | 无官方 NATS 入口；事件进 Restate 要经 HTTP/Kafka 桥 | **独立服务**（server 代理一切）+ 库（SDK） | **BSL 1.1**：内部/自用生产部署被 Additional Use Grant 明确允许，4 年后转 Apache-2.0 [R7] |
| **Inngest** | 步骤级状态快照：step 输出/错误持久化到 State store，函数按步恢复；非事件溯源重放 [I1] | 事件入口是一等公民：Event API（HTTP）按 event name 触发函数；`waitForEvent` 恢复暂停函数 [I1] | 有：`step.sleep`（不占进程）、`sleepUntil`、cron schedules [I1][I2] | TS SDK 一等（inngest 4.27.0，Apache-2.0，Node ≥20）；Connect 模式 worker 经 WebSocket 网关接入 [I1] | 自托管 = 单 binary CLI（`inngest start`），默认内嵌内存 Redis + SQLite，可外接 Redis/Postgres；**单节点服务（Beta）**，官方不承诺支持 [I1] | 无 NATS 集成；事件模型是 Inngest 自己的信封 | **独立服务** | server 为 **SSPL v1**（附 "Apache 2.0 Future License" 条款）；SDK Apache-2.0 [I1][I3] |
| **trigger.dev** | 容器化 run + 快照/checkpoint（checkpoint 为 Cloud 独占功能）；任务代码经 CLI 构建成容器镜像部署 [G1][G2] | 触发（事件/webhook/schedule）为平台概念；waiter 等待事件 [G1] | 有：`wait.for` / `wait.until` / `wait.forToken`（durable，不占算力）[G5] | TS 一等（v4），runtimes: node-22/24/26、bun [G1] | 自托管 = 容器组（webapp + worker）+ Postgres + Redis；v3 已 EOL；warm starts / auto-scaling / checkpoints 为 Cloud 独占 [G1] | 无 NATS 集成 | **独立服务**（多容器平台） | Apache-2.0 [G3] |
| **XState (v5, actors)** | 状态快照：`getPersistedSnapshot()` 持久化、`createActor(behavior,{snapshot})` 恢复；actions 恢复后**不重放**；invocation 会重启；event sourcing 需用 inspection API 自己攒事件自己重放 [X1] | 无内建事件入口；`actor.send(event)` 进程内投递 [X1] | 无 durable 定时器（delayed transitions 是内存定时）[X1] | 一等 TS（xstate 5.33.4，MIT）[X2] | 库零部署；持久化存储完全自选 | 无官方集成 | **库** | MIT [X2] |
| **n8n (embedding)** | workflow 执行引擎 + 内部 SQLite 持久化；快照式，非事件溯源 [N1] | webhook / 轮询 trigger 节点；无 NATS trigger（需 HTTP 桥）[N1] | 有 schedule/wait 节点 [N1] | Node/TS 全栈；编辑器用 Vue Flow 画布 [N2] | 独立 Node 服务（或 n8n cloud） | 无官方 NATS 集成 | **独立服务** | **Sustainable Use License**（fair-code，非 OSI）；禁止外部最终用户经你的产品构建 workflow、禁止 fork 出自动化产品、`.ee.` 文件需企业许可 [N3][N4] |
| **Hatchet** | durable workflow 引擎（任务/agent 编排）[H1] | 事件/API 触发 | 有（sleep/timeout）[H1] | TS SDK 存在 | Postgres + 独立 server | 无官方 NATS 集成 | 独立服务 | MIT [H2] |
| **LittleHorse** | "Business-as-Code"工作流平台，事件历史模型 [LH1] | gRPC/API | 有 | 有 TS SDK | Java server + Kafka + DB | 非 NATS（用 Kafka） | 独立服务 | **AGPL-3.0** [LH2] |

## 3. 逐候选证据

### 3.1 LangGraph（JS）

#### 事实

- 包与许可：`@langchain/langgraph` 1.7.5，MIT，engines `node>=18`；仓库 langchain-ai/langgraphjs MIT（2024, LangChain）。[L1]
- 自我定位："low-level orchestration framework for building stateful agents"；宣传点是 durable execution、human-in-the-loop（interrupt）、memory。[L2]
- 持久化模型：**Checkpointers** 把 thread 的图状态作为 checkpoint 快照保存（SqliteSaver / PostgresSaver / MemorySaver）；**Stores** 保存跨 thread 数据。MemorySaver 重启即丢；checkpoint 会无限增长需自行清理。恢复语义是"从快照恢复"，不是重放代码。[L3]
- Functional API：`entrypoint` + `task` 包装普通函数获得持久化/HITL；task 结果存在 entrypoint checkpoint 上；用 `thread_id` 标识运行；interrupt 后用 `Command(resume=...)` 续跑；输入输出须 JSON 可序列化。[L4]
- 故障处理是节点级 retry/timeout/error handler（`@langchain/langgraph>=1.4.0`），不是执行历史重放。[L5]
- 官方完整托管形态（Agent Server / LangSmith deployments）是 LangChain 商业平台；库本身无事件订阅入口、无 durable 定时器原语（当前 JS 文档目录中无对应页面）。[L3][L4]

**适配推断**：作为库可嵌入 DSH 插件，MIT 友好；但其 durable 语义建立在"图状态快照"上——foundation.md 要求的"事件历史 + 重放 + non-determinism 检测 + 权威历史即观测流"需要在其 checkpoint 之上再自建一层；waitFor/定时器/事件路由也全部自建。借用它接近于借用一个状态容器而非执行内核，且引入 LangChain 生态依赖与概念噪音。

### 3.2 Temporal（TS SDK）

#### 事实

- 执行模型：每个 Workflow Execution 发出 Commands、处理 Events，全部记入 **Event History**——"complete, ordered log of everything that has already happened"，是事实源。恢复时不从内存快照恢复，而是**从头重跑 Workflow 代码、按 Event History 重放**，已记录的 Activity 结果直接注入不重算；重放要求同样历史下做出同样决策（`Date.now()`、随机数等不能直接用）；状态缓存只是优化。[T1]
- TS SDK：Workflow 在**确定性沙箱**中运行，代码在 Worker 创建时用 Webpack 打包，不得引用 Node.js/DOM API。[T3] 官方 TS SDK 支持 Node 20/22/24，MIT；server 为 Go，MIT。[T4]
- 事件入口：Signal/Update/Query 是发往特定 Workflow Execution 的消息；Task Queue 由 Worker 通过 RPC poll；不是按事件 type 的通用 pub/sub。[T2]（前一份 Gateway 调研 [gateway-messaging-options.md](gateway-messaging-options.md) 3.6 节得出同一结论。）
- 自托管：生产 = Temporal Server（可集群）+ 持久化数据库（支持列表见 persistence 文档）+ 可选 Elasticsearch；CLI dev server 仅用于本地开发。[T5]

**适配推断**：语义上是我们开发模型的"正牌原型"——事件历史、重放、纸条式 Activity（建议幂等）、确定性沙箱都验证过工程可行性。但架构代价比语义收益大：每台节点/中心宿主旁边都要摆一个 Temporal Server + 数据库，Gateway（nats-server）之外再多一个中枢进程；事件入口、权威历史、观测全部落在 Temporal 的私有 Event History 里，与"中心单一写入点、NATS 事件三处同构"正面冲突。合理用法是**当作语义与故障模式的参考实现**，而不是引入它。

### 3.3 Restate

#### 事实

- 架构：业务逻辑在普通应用里嵌 Restate SDK（services + handlers）；Restate Server 单 Rust binary，反向代理式坐在服务前面，管理服务发现与 durable execution；可单节点（磁盘恢复）或 HA 集群。[R1]
- durable 执行：每一步（调用、状态更新、定时器、副作用）与结果记入 **journal**；崩溃后重放 journal、跳过已完成步骤、从断点继续。内嵌 key-value store 提供 Virtual Object / Workflow 的一致状态，**单写者保证**（同一对象同时只有一个 handler 改状态）。[R1]
- durable 定时器：`ctx.sleep` 无硬性时长上限；server 保证"睡 12 小时、8 小时后崩溃、恢复后只补睡 4 小时"；delayed messages、`orTimeout`、cron 模式；FaaS 上可挂起不占资源。[R2]
- 外部事件：**Signal**（invocation ID + 信号名，可多次 resolve，每次 await 收下一个解析——适合 human approval / agent steering）、**Awakeable**（一次性回调 token）、**Workflow promise**（workflow key + 名字，一次 resolve 多次读取）；三者都跨重启存活。[R3]
- 入口：invocation 经 HTTP、Kafka 或编程式发起。[R1]
- 许可：**BSL 1.1**，Change Date 4 年后转 Apache-2.0；Additional Use Grant 明确允许"任何 invoking 自己写的 services/workflows 的生产部署"和"内部部署（含内部托管平台）"，并允许"暴露 GUI builder/DSL 抽象层、消费者不直接使用 Restate API 的公开 workflow 平台"；禁止的是向第三方开放 Restate API 注册其自己服务的托管平台。[R7]

**适配推断**：durable 原语集（sleep/signal/awakeable + journal 重放 + 单写者）与 foundation.md 的 waitFor/事件历史/中心 single writer 几乎一一对应，是所有候选里语义拟合度最高的。落不上的三点：入口是 HTTP/Kafka 而非 NATS subject 订阅（要写桥接层）；journal 与状态存于 Restate server，中心的权威事件历史会被架空成第二事实源（或需要双写）；引入又一个常驻 server 进程（虽然是单 binary，形态比 Temporal 轻）。对"个人自用 + 可能开源分发"的场景，BSL 的 Additional Use Grant 覆盖前者，但若未来把 DSH agent-dispatch 做成让第三方注册自己服务的平台则越界。**建议作为语义参考 + 关键行为（journal 重放、timer 恢复、signal 语义）的对照实现**。

### 3.4 Inngest

#### 事实

- 自托管 1.0：`inngest start` 单 binary，默认内嵌内存 Redis（队列 + 状态存储，定期快照到 SQLite）+ SQLite 持久化（`./.inngest/main.db`）；可外接 Redis/Postgres；官方明确自托管不提供直接支持；CLI 自述 "Run Inngest as a single-node service"（Beta）。[I1]
- 事件驱动是一等入口：Event API 收事件 → Runner 按事件类型调度函数运行、恢复 `waitForEvent` 暂停的函数、执行 `cancelOn` 取消；事件入库供历史与未来重放。[I1]
- durable 执行模型：函数由 step 组成，step 输出/错误写入 State store；`step.sleep` 暂停不占进程；函数经 SDK serve 端点同步注册，或 Connect（WebSocket 网关 8289 端口）接入。[I1][I2]
- 许可：server 源码 LICENSE.md 为 **SSPL v1**，标题附 "Apache 2.0 Future License"（自定义双条款）；TS SDK（inngest 4.27.0）Apache-2.0，Node ≥20。[I1][I3]

**适配推断**：事件触发 + waitForEvent + sleep 的产品形态与我们的"事件驱动入口 + waitFor"最神似，且自托管最轻（单 binary + SQLite）。但事件必须走 Inngest 的 Event API（HTTP），信封是 Inngest 自己的格式，CloudEvents/NATS/JetStream 的 Gateway 协议会沦为旁路；step 快照模型 ≠ 事件历史重放；SSPL 非 OSI 开源许可；单节点 Beta、无官方支持。作为"调度语义的产品化长什么样"的参考价值大于引入价值。

### 3.5 trigger.dev

#### 事实

- v4 自托管 = 容器组：webapp（dashboard + Redis + Postgres）+ worker（supervisor + runners），Docker compose / Helm；v3 已 EOL（4.5.0 为最后支持 v3 的版本）。[G1]
- 执行模型：任务代码经 CLI 构建成容器镜像（`triggerdotdev/node`/`bun` 基础镜像，runtime: node-22/24/26、bun）部署运行；warm starts、auto-scaling、checkpoints（非阻塞等待）为 **Cloud 独占**功能，自托管没有。[G1]
- 等待原语：`wait.for` / `wait.until`（>5s 不计算力、60s 后释放并发槽）、`wait.forToken`、input stream wait。[G5]
- 许可：仓库 Apache-2.0。[G3]

**适配推断**：面向"部署到平台的任务函数"产品，执行单位是容器镜像而不是 DSH 插件内的函数调用；双端装载意味着中心与每台节点都要摆 webapp+worker+Postgres+Redis，运维面远超一期单机双进程的验收形态。不进入短名单。

### 3.6 XState（with actors）

#### 事实

- 持久化：`actor.getPersistedSnapshot()` 得到可 JSON 序列化内部状态，`createActor(behavior,{snapshot})` 恢复；恢复后 **actions 不会重新执行**（假定已执行过），invocation 会重启、spawned actors 递归恢复；状态须 JSON 可序列化。[X1]
- 官方文档给出 event sourcing 替代路径：用 inspection API 自己收集事件、自己重放——是"自己动手"的方案而非内建能力；并注明机器逻辑变更后旧快照可能不兼容。[X1]
- 许可与包：xstate 5.33.4，MIT。[X2]

**适配推断**：XState 是状态机/actor 库，不是 durable 执行引擎：没有事件历史记账、没有 runTask 式副作用审计、没有 durable 定时器。若我们的 graph node 内部想用状态机组织局部逻辑可以借用，但承担不了引擎职责。

### 3.7 n8n（embedding 可行性）

#### 事实

- 许可：**Sustainable Use License**（fair-code，非 OSI）；`.ee.` 命名的企业源码需企业许可；非 main 分支内容不授权。[N3]
- License FAQ 明确：可以"在自己产品幕后使用 n8n，用户只能触发你构建的自动化"；**不可以**"允许外部最终用户通过你的产品（含自定义 UI、API、MCP 或代用户行事的 AI agent）构建或配置他们自己的 workflow"、"fork n8n 代码 launch 自己的自动化产品"、白牌化。[N4]
- 架构：独立 Node.js 服务（workflow 引擎 + 编辑器 UI + SQLite 持久化）；编辑器画布基于 **Vue Flow**（`@vue-flow/core` 等）。[N1][N2]

**适配推断**：我们的目标恰是"用户在画布上构建/编辑 workflow"，落在 SUL 明确禁止的形态上（即使只是个人自用属灰色允许，也无法作为可分发产品的基础）；且它是带 UI 的独立服务而非可嵌入库，事件入口与持久化都是自己的。**排除**。可借鉴的是它的节点目录、凭据管理等产品形态。

### 3.8 其他发现的候选（简要）

- **Hatchet**："orchestration engine for background tasks, AI agents, and durable workflows"，MIT；独立 server + Postgres 形态，TS SDK 存在。[H1][H2] 事件驱动语义与 Inngest 类似，同属"独立服务 + 自有 API 面"一族，同样不满足插件形态约束。
- **LittleHorse**："Business-as-Code" workflow 平台，Java server + Kafka；**AGPL-3.0**。[LH1][LH2] 许可与传输栈都不匹配，排除。

## 4. ComfyUI 架构要点（事实）

1. **总体形态**：client-server。Python server 做全部实际工作（数据处理、模型、扩散）；JavaScript client 负责 UI；也可 API 模式由非 Comfy 客户端提交 workflow。[C1]
2. **节点注册**：server 启动时扫描 `custom_nodes` 目录加载 Python 模块，模块导出 **`NODE_CLASS_MAPPINGS`**（dict：全局唯一节点名 → 节点类）即被识别为自定义节点；`NODE_DISPLAY_NAME_MAPPINGS` 提供显示名；`WEB_DIRECTORY` 声明随节点分发的客户端 JS 目录。加载失败不阻断其他节点。[C2]
3. **类型化端口**：节点类声明 **`INPUT_TYPES`**（classmethod，返回 `{required, optional, hidden}`，每个输入是 `(类型字符串, 参数dict)`）、**`RETURN_TYPES` / `RETURN_NAMES`**（tuple）；类型是字符串标签（如 `"IMAGE"`），连线按类型兼容校验，另有 `VALIDATE_INPUTS` 自定义校验与类型通配。现代 V3 schema 用 `io.ComfyNode` + `define_schema` + `comfy_entrypoint`，V1 仍受支持。[C3][C4]
4. **执行控制**：server 缓存节点输出，只执行"输出可能变化"的节点（向后追溯到输出节点）；节点可用 **`IS_CHANGED`**（返回值与上次比较，`NaN` 表示恒变）与 **`OUTPUT_NODE`** 参与控制。[C3]
5. **画布**：官方文档明言 Comfy UI 建立在 **LiteGraph**（jagenjo/litegraph.js）之上：`app.canvas` 是 LGraphCanvas（HTML5 Canvas2D）、`app.graph` 是 LGraph（节点+link 的逻辑图）、LLink 描述一条从 `origin_id/origin_slot` 到 `target_id/target_slot` 的连线并带 `type` 字符串；ComfyNode 是 LGraphNode 子类并大幅扩展了核心行为、未用尽 LiteGraph 全部功能。[C5] litegraph.js 自述为"A graph node engine and editor written in Javascript similar to PD or UDK Blueprints…HTML5 Canvas2D…run client side or server side using Node…export graphs as JSONs"。[C6] Comfy 维护过 fork `Comfy-Org/litegraph.js`（MIT），现已**归档**，npm 上 `@comfyorg/litegraph` 0.17.2（MIT）。[C7][C8]

**适配推断**：ComfyUI 验证了"字符串类型标签 + 声明式端口 + 注册表 + 画布连线 + 输出缓存"这套模型可支撑庞大的第三方生态；我们 foundation.md 1.2 的 graph node（插件形态、自带端口类型声明、类型兼容才能连）正是它的 TS/DSH 翻译。差异点：ComfyUI 是数据流图（一次提交全图求值），我们是控制流 graph（实例、waitFor、长时间睡眠），执行缓存与 IS_CHANGED 的语义不能照搬，但"类型标签 + 结构校验"的端口模型可以。

## 5. JS 画布库对比（事实 + 推断）

| 库 | 技术 | 许可 | 生态/维护 | 备注 |
|---|---|---|---|---|
| **@xyflow/react**（React Flow） | React 组件库，DOM 渲染节点 | MIT（13.0.3，Node ≥20）[X3] | xyflow 团队维护，React 生态事实标准，n8n 之外的广泛使用 | 节点/边模型、自定义节点渲染、小地图、校验钩子齐全；DSH Web 本就是 React，同一技术栈 |
| **rete.js** | 框架无关核心 + 渲染插件（React/Vue/Angular/Svelte） | MIT（2.0.6）[X4] | 社区较小 | 插件化彻底（含数据流处理、区域、历史等插件），概念多、学习面大 |
| **litegraph.js** | **HTML5 Canvas2D** 手绘（非 DOM） | MIT（`@comfyorg/litegraph` 0.17.2）[X8] | 原作者项目久未活跃；Comfy-Org fork 已归档（维护转入 Comfy 前端仓库体系）[C7] | ComfyUI 手感的来源：Canvas 全权绘制、性能好、内置 LGraph 执行引擎；但无 React 集成、自定义 UI 要画在 canvas 上、可访问性/富交互成本高 |
| Vue Flow | Vue3 版 React Flow | MIT | n8n 编辑器所用 [N2] | 与我们栈无关，列出仅为完整性 |

**适配推断**：选画布库的判据是"节点 UI 要承载类型化端口、校验反馈、 possibly 富表单，并与 DSH Web（React）共存"。@xyflow/react 用 React 组件渲染每个节点，端口/校验/表单都是普通 React 代码，ComfyUI 式体验（拖拽、连线、类型着色、节点目录搜索）都能覆盖；litegraph.js 的 Canvas 手绘在富表单与可访问性上是逆风，且上游维护风险高。rete.js 可行但生态小，无必要引入其插件体系。**首选 @xyflow/react**；若未来要"无限画布上数千节点"的极致性能再评估 canvas 方案。

## 6. 推荐路线（推断）

### 推荐：B——自研轻量引擎内核（事件历史重放）+ 现成画布库（@xyflow/react）

对照三条硬约束逐项论证：

1. **DSH 插件形态（双端装载）**。foundation.md 1.1/2.1 要求引擎作为插件同时装进中心与节点角色宿主进程，节点按机器计身份。所有服务型候选（Temporal/Inngest/trigger.dev/Restate/n8n/Hatchet）都意味着每台机器额外常驻一个 server 进程及其存储（Postgres/Redis/DB），一期"单机双进程（DSH 宿主 + nats-server）"的最小链路直接被破坏；trigger.dev 更是容器平台形态。库形态候选（LangGraph/XState）可嵌入，但它们的持久化是状态快照，重放、non-determinism 检测、调包全局这些 foundation.md 已定的语义还得自己写——等于引入依赖却自研核心。
2. **NATS 事件入口 + 中心权威事件历史**。已定协议是 JetStream + CloudEvents，三叉路由（waitFor 登记 → 入口声明 → unmatched）发生在中心消费侧。现成引擎没有一个以"订阅 NATS subject 收 CloudEvents"为入口：Temporal 是 Signal 定向投递、Restate 是 HTTP/Kafka、Inngest 是自有 Event API、trigger.dev 是平台触发器。接任何一个都要写桥接层，并把权威历史一分为二（引擎私有 journal/checkpoint vs 中心事件历史），single writer 与"三处同构"都被牺牲。
3. **判断层 node:vm + runTask 纸条**。这套模型本来就是 Temporal 式内核的小型化（3.2 节对应关系）。自研内核要做的四件事——追加式事件历史、重放游标 + 类型/名字/参数指纹匹配、waitFor 等待登记表（信号名即 #85 的 token）、durable 定时器——都有明确语义参考（Temporal 的 Event History/Timer 事件、Restate 的 journal/sleep/signal 行为），且规模上是"个人调度系统"而非通用平台，复杂度可控。**最大的自研风险块是 durable 定时器与 non-determinism 检测**（见第 7 节），应通过 PoC 验收先行。
4. **画布与开发模型解耦**。用户想要的 ComfyUI 式体验 = 节点注册表 + 类型化端口 + 画布交互，这三样都在"静态编排图"层，与引擎内核正交：`defineNode` 的端口类型声明同时驱动画布连线校验（@xyflow/react isValidConnection）与运行时入参校验（ComfyUI 的 INPUT_TYPES/VALIDATE_INPUTS 已验证该模式，4 节）。B 路线让画布完全复用现成库，自研集中在内核。

### 落选路线的核心理由

- **A（现成 durable 引擎 + 自定义节点模型与画布）**：若接受"引擎是独立服务"，语义最优是 Restate（BSL 允许内部使用，单 binary 最轻），其次是 Inngest（SSPL、单节点 Beta）。但二者都会架空中心权威事件历史与 NATS 协议，把系统改成"围绕第三方 server 的辐射结构"，与 overview.md 的四概念模型冲突；且每台节点机器多一个常驻进程与存储。除非将来放弃 single writer 设计，否则不取。
- **C（其他组合）**里值得保留的两个动作：(1) 把 Temporal 文档与 Restate 文档列为内核实现的**规范参照**（重放指纹匹配、timer 恢复语义、signal 多次解析语义都有现成定义可抄）；(2) 若自研定时器验证失败，退路不是全盘引入引擎，而是把"durable 定时器"单独外置（例如中心本地持久定时器表 + 到期扫描生成唤醒事件），保持引擎内核完整自研。

## 7. 关键风险与待决（推断）

1. **durable 定时器自研正确性**：重启不丢、时钟漂移、到期扫描的唤醒事件生成（JetStream 无原生延迟投递，需中心侧持久定时器存储）。建议进入引擎 MVP PoC 验收第一批。
2. **non-determinism 检测**：指纹匹配（顺序游标 + 类型/名字/参数指纹）的粒度与报错语义；判断层调包全局（Date/random/timer）的记账覆盖面。
3. **graph 版本化**：foundation.md 未定项——改图不破坏运行中/睡着的实例；重放模型下代码版本与历史的一致性约束比快照模型更严（Temporal 用 determinism 约束 + versioning API 解决，值得参照）。
4. **画布类型系统**：语义类型标签 + 结构校验的注册表设计（对应 ComfyUI INPUT_TYPES/VALIDATE_INPUTS），及其与 DSH 插件 Loader 的集成。
5. **工作量边界**：B 路线自研面 = 事件历史存储（可复用宿主 SQLite 持久能力）+ 重放内核 + 定时器 + 任务执行器子进程 + 画布层；应先出 MVP 边界拆分（foundation.md 未定项最后一条）。

## 8. 来源列表

> 以下来源均为官方文档、官方源码或 npm registry 元数据；**全部访问于 2026-11-24**。`main/master` 链接表示访问当日内容，落地实现时应固定版本重新核对。

### LangGraph (JS)

- **[L1]** npm `@langchain/langgraph`（1.7.5 / MIT / node≥18）与 langgraphjs 仓库 LICENSE（MIT）：https://registry.npmjs.org/@langchain/langgraph/latest ；https://raw.githubusercontent.com/langchain-ai/langgraphjs/main/LICENSE ；https://raw.githubusercontent.com/langchain-ai/langgraphjs/main/libs/langgraph-core/README.md
- **[L2]** langgraph-core README（定位、durable execution/HITL 宣传点）：https://raw.githubusercontent.com/langchain-ai/langgraphjs/main/libs/langgraph-core/README.md
- **[L3]** LangChain 官方文档，*Persistence*（checkpointer 快照 vs store、MemorySaver 不跨重启、checkpoint 增长清理、Agent Server 托管持久化）：https://docs.langchain.com/oss/javascript/langgraph/persistence.md
- **[L4]** LangChain 官方文档，*Functional API overview*（entrypoint/task、thread_id、interrupt+Command 恢复、JSON 序列化要求）：https://docs.langchain.com/oss/javascript/langgraph/functional-api.md
- **[L5]** LangChain 官方文档，*Fault tolerance*（节点级 retry/timeout/error handler、≥1.4.0）：https://docs.langchain.com/oss/javascript/langgraph/fault-tolerance.md
- **[L6]** LangChain 官方文档 JS LangGraph 页面目录（访问日无 durable timer/cron/sleep 页面）：https://docs.langchain.com/_llms/agent-runtime/build/type-script.txt

### Temporal

- **[T1]** Temporal 官方文档，*Workflows*（Event History 定义、replay 机制、确定性约束、Activity 结果重用、状态缓存仅为优化）：https://docs.temporal.io/workflows.md
- **[T2]** Temporal 官方文档，*Task Queues* 与 *Workflow message passing*：https://docs.temporal.io/task-queue ；https://docs.temporal.io/encyclopedia/workflow-message-passing
- **[T3]** Temporal 官方文档，*Develop > TypeScript > Workflows > Basics*（确定性沙箱、Webpack 打包、不得引用 Node/DOM API）：https://docs.temporal.io/develop/typescript/workflows/basics.md
- **[T4]** 官方 TypeScript SDK README 与 LICENSE（Node 20/22/24、MIT）及 server MIT LICENSE：https://raw.githubusercontent.com/temporalio/sdk-typescript/main/README.md ；https://raw.githubusercontent.com/temporalio/temporal/main/LICENSE
- **[T5]** Temporal 官方文档，*Production deployment* 与 *Persistence*（server + 数据库依赖）：https://docs.temporal.io/production-deployment.md ；https://docs.temporal.io/temporal-service/persistence.md

### Restate

- **[R1]** Restate 官方文档，*Key Concepts*（journal 重放、server 单 Rust binary、Virtual Object 单写者、invocation 入口、suspension）：https://docs.restate.dev/foundations/key-concepts.md
- **[R2]** Restate 官方文档（TS），*Scheduling & Timers*（durable sleep 无上限、剩余时长补偿、delayed messages、orTimeout、cron）：https://docs.restate.dev/develop/ts/durable-timers.md
- **[R3]** Restate 官方文档（TS），*Signals and external events*（signal 多次解析、awakeable、workflow promise）：https://docs.restate.dev/develop/ts/external-events.md
- **[R6]** npm `@restatedev/restate-sdk`（1.18.4 / MIT）：https://registry.npmjs.org/@restatedev/restate-sdk/latest
- **[R7]** Restate 仓库 LICENSE（BSL 1.1、Additional Use Grant、4 年转 Apache-2.0）：https://raw.githubusercontent.com/restatedev/restate/main/LICENSE

### Inngest

- **[I1]** Inngest 官方文档，*Self-hosting*（单 binary、内嵌 Redis + SQLite、Runner/Executor/State store 架构、waitForEvent、单节点 Beta、无官方支持）：https://www.inngest.com/docs/self-hosting.md （HTML 版 https://www.inngest.com/docs/self-hosting）
- **[I2]** Inngest 官方文档，*`step.sleep`*：https://www.inngest.com/docs/durable-execution/primitives/step-sleep.md
- **[I3]** Inngest 仓库 LICENSE.md（SSPL v1 + "Apache 2.0 Future License"）与 npm `inngest`（4.27.0 / Apache-2.0 / node≥20）：https://raw.githubusercontent.com/inngest/inngest/main/LICENSE.md ；https://registry.npmjs.org/inngest/latest

### trigger.dev

- **[G1]** trigger.dev 官方文档，*Self-hosting overview*（容器组架构、v3 EOL、Cloud 独占功能清单、runtime 镜像 node-22/24/26/bun）：https://trigger.dev/docs/self-hosting/overview.md
- **[G3]** trigger.dev 仓库 LICENSE（Apache-2.0）：https://raw.githubusercontent.com/triggerdotdev/trigger.dev/main/LICENSE
- **[G5]** trigger.dev 官方文档，*Wait: Overview*（wait.for/until/forToken、并发槽释放时点）：https://trigger.dev/docs/wait.md

### XState

- **[X1]** Stately 官方文档，*Persistence*（v5）（getPersistedSnapshot/createActor 恢复、actions 不重放、event sourcing 自建路径、序列化与兼容性 caveats）：https://stately.ai/docs/xstate/v5/persistence
- **[X2]** npm `xstate`（5.33.4 / MIT）与仓库 LICENSE：https://registry.npmjs.org/xstate/latest ；https://raw.githubusercontent.com/statelyai/xstate/main/LICENSE

### n8n

- **[N1]** n8n 官方文档与仓库 README（自托管服务形态、workflow 引擎）：https://docs.n8n.io/hosting ；https://github.com/n8n-io/n8n
- **[N2]** n8n editor-ui `package.json`（`@vue-flow/core` 等依赖）：https://raw.githubusercontent.com/n8n-io/n8n/master/packages/frontend/editor-ui/package.json
- **[N3]** n8n 仓库 LICENSE.md（Sustainable Use License、`.ee.` 企业源码）：https://raw.githubusercontent.com/n8n-io/n8n/master/LICENSE.md
- **[N4]** n8n 官方文档，*License FAQ*（允许幕后自用、禁止外部用户经产品构建 workflow、禁止 fork/白牌）：https://docs.n8n.io/n8n-community-license/community-license/license-faq.md

### 其他候选

- **[H1]** Hatchet 仓库（描述：orchestration engine for background tasks, AI agents, and durable workflows）：https://github.com/hatchet-dev/hatchet
- **[H2]** Hatchet LICENSE（MIT）：https://raw.githubusercontent.com/hatchet-dev/hatchet/main/LICENSE
- **[LH1]** LittleHorse 仓库（Business-as-Code 平台描述）：https://github.com/littlehorse-enterprises/littlehorse
- **[LH2]** LittleHorse 许可（AGPL-3.0，GitHub API license 字段）：https://api.github.com/repos/littlehorse-enterprises/littlehorse

### ComfyUI 与画布库

- **[C1]** ComfyUI 官方文档，*Custom Node Types and Architecture*（client-server 模型、四类自定义节点、API 模式）：https://docs.comfy.org/custom-nodes/overview.md
- **[C2]** ComfyUI 官方文档，*Custom Node Lifecycle*（custom_nodes 扫描、NODE_CLASS_MAPPINGS / NODE_DISPLAY_NAME_MAPPINGS / WEB_DIRECTORY）：https://docs.comfy.org/custom-nodes/backend/lifecycle.md
- **[C3]** ComfyUI 官方文档，*Custom Node Properties*（INPUT_TYPES / RETURN_TYPES / FUNCTION / IS_CHANGED / OUTPUT_NODE、执行缓存）：https://docs.comfy.org/custom-nodes/backend/server_overview.md
- **[C4]** ComfyUI 官方文档，*Custom Node Datatypes* 与 *V3 Migration*（类型标签、通配、io.ComfyNode）：https://docs.comfy.org/custom-nodes/backend/datatypes.md ；https://docs.comfy.org/custom-nodes/v3_migration.md
- **[C5]** ComfyUI 官方文档，*Frontend Objects: LiteGraph, ComfyApp, and ComfyNode*（UI built on LiteGraph、LGraphCanvas/LGraph/LLink、ComfyNode 扩展 LGraphNode）：https://docs.comfy.org/custom-nodes/js/javascript_objects_and_hijacking.md
- **[C6]** litegraph.js 原项目描述（GitHub API，jagenjo/litegraph.js）：https://github.com/jagenjo/litegraph.js
- **[C7]** `Comfy-Org/litegraph.js`（fork 已 ARCHIVED，MIT）：https://api.github.com/repos/Comfy-Org/litegraph.js
- **[C8]** npm `@comfyorg/litegraph`（0.17.2 / MIT）：https://registry.npmjs.org/@comfyorg/litegraph/latest
- **[X3]** npm `@xyflow/react`（13.0.3 / MIT / node≥20）：https://registry.npmjs.org/@xyflow/react/latest
- **[X4]** npm `rete`（2.0.6 / MIT）：https://registry.npmjs.org/rete/latest
