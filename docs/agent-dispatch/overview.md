# agent-dispatch · 总览

> 状态：架构讨论进行中的临时文档，只收录**已确认**的结论。
> 本文只讲两件事：**宏观全貌**（有哪些角色、怎么协同）和**通信**（角色之间怎么说话）。执行内核与部署细节见 [foundation.md](foundation.md)。
> 宏观概念就四个：**中心、节点、Gateway、事件**。其余一切（graph 引擎、采集器、Worker 池……）都是角色内部的子模块，不在本文展开。

---

## 1. 系统全貌

```text
                  ┌─────────────┐
     ┌────────────│   Gateway   │────────────┐
     │            └─────────────┘            │
     │                唯一通道                │
     ▼                                       ▼
┌──────────┐    事件、结果 ──▶   ┌──────────┐
│  中心 ×1  │◀──▶ （一切经 Gateway │  节点 ×N  │
└──────────┘      中转，无直连）    └──────────┘

外部世界（外部系统与人）→ 由节点上的采集器变成事件 → 进入这条通道
```

四个宏观概念：

| 概念 | 一句话 |
|---|---|
| **中心** | 系统状态只由它记录（单一写入点），跑调度 graph |
| **节点** | 机器伞名，装采集器和 Worker 池 |
| **Gateway** | 唯一通道，星形枢纽 |
| **事件** | 唯一消息形态，type 承载语义 |

一句话：**事件经 Gateway 流向中心 → 中心驱动 graph 实例（判断/等待/派发）→ 实例产生任务派给节点 → 节点执行后回传结果（还是事件）→ 循环。这就是全自动调度。**

这个循环的具体分工（每句主谓宾齐全；各模块内部细节后续逐个展开，此处只定方向）：

1. **节点上的采集器**盯着外部系统（aone / 钉钉 / CI…），发现变化就发一条**事件**，经 Gateway 送到中心；
2. **中心**收到事件后做三件事之一：唤醒正在等待的 graph 实例、按入口声明开一个新实例、或没人认领就只记一笔（unmatched）；
3. **graph 实例**跑到要干活的地方（调接口、跑命令、跑 agent 会话），**中心**把任务派给某台节点执行；执行结束后，**结果作为事件回传**中心；
4. **系统的状态（事件历史）只在中心记录**：节点不能直接改，只能发事件，由中心落笔（行业叫法 single writer，单一写入点）；
5. **所有跨角色消息都走 Gateway 一条路**：中心与节点即使装在同一个 DSH 宿主进程内，也必须走真实 Gateway 事件协议，不能直调；单机就是 localhost，换机器只换地址，代码不变。

---

## 2. 通信：事件系统

```text
节点 ──事件──▶ ┌──────────┐ ──按 subject 订阅分派──▶ 各消费者
中心 ──事件──▶ │ Gateway  │──▶ 在线服务发现
人   ──事件──▶ │ 统一通道  │──▶ 任务队列（订 task.*）
               └──────────┘──▶ 图的事件路由（订领域事件/human.*）
```

**简述**：通道上只有一种东西——事件。Gateway 不理解事件内容，只管鉴权、投递和传输层短期去重；需要持久受理的消费者负责长期幂等。CloudEvents `type` 承载事件语义，NATS subject 承载传输地址，消费者按 subject 订阅，并以目录中的 `type + subject` 配对识别事件。

**实现总原则**：凡 CloudEvents、NATS、JetStream、NATS Services、`nats.js` 等官方能力已经覆盖的需求，一律优先使用官方实现，不另造平行协议、格式、序号、重连或恢复机制；只有官方确实无法覆盖且一期确有必要的需求才允许自定义，并明确必要性理由与边界。实施固定官方支持线的正式版本，不依赖 RC、WIP 或实验能力成立。

一期 Gateway 由独立 `nats-server` 承托并启用 **JetStream**，中心与节点使用官方 `nats.js` 接入。NATS Core 提供连接、发布订阅与内建鉴权；JetStream 提供持久化、消费 ACK、重投与恢复。一期默认共用一个 File/Limits stream，File 存储用于跨 NATS 重启恢复；将来仅当 account、保留、存储／副本、配额或恢复边界不同时才拆分，不按事件类型或语义拆分。必须最终受理的事件采用 at-least-once，重试复用同一个 `event.id`，消费端按持久受理路径保存长期幂等记录；JetStream 日志不替代中心权威事件历史。

通信层的消息序号与恢复直接使用 JetStream 官方实现：`stream sequence` 表示消息在 stream 中的存储位置并用于恢复和重放，`consumer sequence` 表示官方消费投递进度；不自定义消息序号或新增“全系统序号”字段。中心权威事件历史若需要自己的业务顺序，属于中心内部的后续决策，不是 Gateway 协议，也不能用 NATS 序号冒充。

断线重连直接使用 `nats.js` 官方自动重连；消费端重连后继续使用原 durable consumer，由 JetStream 恢复消费进度，不另建一套 offset 或补发协议。发布端未确认事件由持久 Outbox 以同一个 `event.id` 继续重试。

可靠发布采用 **Transactional Outbox（事务性发件箱）**：承诺“本地提交后最终发布”的路径，由中心和节点宿主提供共享 Outbox 能力，插件复用而不各自实现。业务结果与待发布事件在同一持久事务中保存；中继以同一个 `event.id` 发布并重试，收到 `PubAck` 后标记为已存入 stream，进程崩溃恢复后继续。存储复用宿主提供的持久能力，具体存储面由后续规格决定；一期不引入 Debezium、Kafka 或新的常驻中继进程。Outbox 仍可能重复发布，因此不能替代消费端长期幂等。

需要持久受理的消费者——无论中心还是节点——都在本地去重记录与受理状态提交成功后，才发送 consumer ACK。提交后、ACK 前崩溃时由 JetStream 重投，再按 `event.id` 去重，不重复产生业务效果。consumer ACK 只表示消息已持久受理，不表示整个任务已经执行完成；执行结果仍通过后续结果事件回传。

本机连接使用 `nats://`，远程默认使用 `tls://`；只有浏览器必须直连 NATS，或远程路径只能经过 HTTP/HTTPS 代理时，才启用 `ws/wss`。

中心与节点只配置同一个 NATS 地址，不配置彼此 IP。双方通过 **NATS Services** 上线并发现在线实例，消息仍只经 NATS subject 投递。注册与活性使用 NATS Services 和 NATS 官方 PING/PONG，能力路由直接复用 NATS Services 的服务名、版本、metadata 和 endpoints，不自建能力路由协议；metadata 的业务含义由发布者／消费者解释，Gateway 不理解 Worker、graph 或其他内部概念。NATS Services 不是持久注册中心；需要保留的离线历史目录由中心持久化保存，一期不新增独立注册中心进程。

中心与节点分别使用 NATS 内建 **NKey** 用户连接，并以 subject permissions 限制发布、订阅权限。本机 loopback 仍要求 NKey，远程连接额外强制 TLS。私有 seed 只通过凭据引用管理，不写入 URL，也不传入模型上下文。一期明确中心、节点和已安装插件属于同一受信边界，只使用官方认证与权限能力；CloudEvents `source` 仅作为业务元数据，不宣称已被认证，不增加自定义身份绑定目录、唯一地址归属或逐事件签名，待出现真实的不受信插件或多用户隔离需求时再评估。

发布或订阅事件的业务插件必须依赖基础通信插件的公开能力，不自行实现 CloudEvents 处理、NATS 连接与订阅、Outbox、在线发现或通用校验；不使用这些能力的插件不强制依赖。基础插件只提供通用能力，业务 `type + subject + data` 仍归业务插件所有。

概念（本模块全部概念，按出现顺序）：

- **事件（Event）**：唯一消息形态。线上遵循 **CloudEvents Core 1.0.2＋JSON Event Format 1.0.2＋NATS structured binding**，JSON 中 `specversion` 为 `1.0`，`id/source/type` 遵循规范必填规则。
- **DSH CloudEvents profile（项目额外约束）**：`id` 额外要求全局唯一；中心 `source` 为 `urn:dsh:center`，节点 `source` 为 `urn:dsh:node:<nodeId>`；原 `payload/ts` 分别映射为 `data/time`，并要求二者存在，`time` 使用 RFC 3339；`data` 承载业务内容。CloudEvents 中 `time/data` 本身是可选，此处必填属于 DSH 约束。DSH 原生事件省略 CloudEvents 可选属性 `subject`，事件目录中的 `subject` 只表示 NATS 地址；接收外部合法 CloudEvents 时不因其带有该可选属性而拒绝或剥离。
- **JetStream 发布去重映射**：`Nats-Msg-Id` 使用事件 `id`，它是独立的 JetStream metadata，不是 CloudEvents 属性，也不替代消费端长期幂等。
- **事件类型（type）**：点分命名空间，语义的唯一载体。家族示例：`node.*`（节点领域事件）、`task.*`（任务认领/结果）、领域事件（`aone.bug.created`、`mr.comment`、`ci.finished`）、`human.*`（人的审批/回填）。类型开放扩展；**新增插件事件绝不允许通过修改公共基础包实现**，`type + subject` 的命名权与业务语义归各自插件。
- **插件事件与校验边界**：新增 `type + subject` 所需的订阅、durable consumer 和 JetStream 捕获配置均在线创建或更新，不需要中心修改代码、审批或重启。一期只统一校验事件信封，**不强制获取 `dataschema`，也不做全事件 `data` 校验**；`dataschema` 作为 CloudEvents 可选属性透传，但中心不因存储／转发事件就访问外网。通用 `dataschema` 分发、缓存与全事件 `data` 校验延后出现真实需求再设计；graph 节点输入结构与校验留到 graph 执行引擎后续规格，不在 Gateway 协议中定案。完整事件目录从插件声明与运行时注册信息派生。
- **信封扩展（#85 修订 #83）**：DSH 不定义任何 CloudEvents 扩展属性，原 `key` 可选扩展取消；信封保持纯 CloudEvents。事件与 graph 实例的关联 token 由中心侧领域路由节点从 `data` 派生，引擎 `waitFor` 登记名即该 token；thread／时间线概念整体属领域层，底座文档只称"信号名"。
- **分派守则**：统一信封 ≠ 统一处理。消费者按 NATS subject 订阅，并以事件目录中的 `type + subject` 配对识别事件；没有任何声明认领的事件不产生执行（记 unmatched 可查）。
- **三处同构**：传输中的事件、引擎事件历史里的记录、可观测读取的数据，同一结构——领域只要发事件，时间线/因果链/审计/重放/指标自动覆盖，无需单独埋点。

## 3. 一期通信验收

以下场景是后续实现必须通过的验收，不代表当前已经完成生产实现或端到端测试：

1. **NATS 重启**：File stream 与 durable consumer 能恢复。
2. **发布前崩溃**：Outbox 在重启后用同一个 `event.id` 补发。
3. **ACK 前崩溃**：JetStream 重投，消费者按 `event.id` 去重，不重复产生业务效果。
4. **重复与超时**：`PubAck` 丢失、重试或超过短期去重窗口，仍不重复受理。
5. **节点发现**：节点上线、离线能通过 NATS Services 正确反映；重复 `nodeId` 被拒绝。
6. **插件扩展**：新增 `type + subject` 在线生效，中心不重启；越权发布被 NATS permissions 拒绝。
7. **单点边界**：R=1 磁盘或机器永久丢失不被宣称为高可用。
