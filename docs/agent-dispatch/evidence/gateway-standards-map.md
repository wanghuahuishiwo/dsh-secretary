# Gateway 当前问题到正式标准与官方机制的映射

> **一句话结论（推断）：** 一期 Gateway 的连接、安全、离线投递、ACK、重投和短期发布去重可以直接复用独立 `nats-server` / JetStream / 官方客户端，事件外壳可评估采用 CloudEvents 1.0.2 structured JSON，而 graph correlation、worker readiness、中心权威顺序、长期幂等与任务完成仍是 DSH 产品语义和持久化设计，不需要也不应重新发明网络、安全或可靠传输协议。

> 状态：只读调研，不代替最终选型或修改既有决策。一期既定项按任务输入理解为：独立 `nats-server` + JetStream、NATS 内建鉴权、at-least-once + 中心长期幂等；其余保持开放。
>
> 方法：先读了 [overview](../overview.md)、[foundation](../foundation.md) 及既有 [消息基础设施证据](gateway-messaging-options.md)、[身份/注册证据](gateway-identity-registry-options.md)、[行业地位证据](gateway-industry-position.md)。本文不重复其候选对比、行业热度、默认可靠性数字和故障矩阵，只补齐“标准映射”、CloudEvents / Trace Context / OTel、序号精确边界、长期幂等模式及相邻任务协议。
>
> 标注：各处 **事实** 都有一手规范、官方文档或官方源码；**推断** 是适配分析，不是规范承诺。所有外部 URL 的访问日期均为 **2026-11-13**，集中列于文末。`main` 工作树与 released tag 严格分开。

## 1. 覆盖矩阵：当前问题 → 标准/机制 → 复用边界 → 产品剩余

| 当前问题 | 行业标准 / 官方机制 | 能直接复用什么（事实） | 真正剩余的产品语义（推断） | 来源 |
|---|---|---|---|---|
| **事件信封** `{id,type,source,key,payload,ts}` | CloudEvents Core 1.0.2、JSON Event Format 1.0.2、NATS Protocol Binding 1.0.2 | Core 固定 `id/source/specversion/type` 四个必填属性，定义 `time/data/datacontenttype/dataschema/subject` 等可选属性及扩展机制；JSON 格式规定线上表示；正式 NATS binding 规定 structured JSON 映射。 | 现有字段需迁移而非直接宣称兼容；项目 profile 要收紧 `time/data` 必填性、`source` URI 规则、扩展属性和事件目录。`key` 没有已发布 Core 的通用对应。 | [CE0]–[CE4]，详见 §2、§3 |
| **事件版本与序列化** | CloudEvents `specversion`、`type`、`dataschema`、Primer versioning；JSON Event Format | `specversion` 标识 CloudEvents 规范版本；`dataschema` 以 URI 指向 `data` schema；`type` 是消费者识别事件语义的主入口；JSON 属性为顶层成员，JSON `data` 不再二次字符串化。 | `specversion` 不是 payload 版本。需定义每类事件的 schema URI、兼容规则、breaking change 时 `type` 是否变化、未知字段/type 处理、schema 存放与运行时校验。CloudEvents 不强制一种数据版本策略。 | [CE1][CE2][CE4] |
| **连接与自动重连** | NATS 官方 resilient clients / `nats.js` | 自动重连、server pool、backoff/jitter、订阅恢复；首次连接可配置重试；断线期 outbound publish 可进入有界客户端 reconnect buffer。 | 长驻进程的重试上限、首次连接、日志/健康状态和 buffer 大小是配置；buffer 不是持久 outbox，重连不代替 durable consumer 恢复、节点重新注册或旧会话 fencing。 | [N1] |
| **注册** | NATS Services framework、项目注册事件/目录 | Services 提供服务名、实例 ID、版本、endpoint 等在线描述；JetStream/KV 可承托持久数据，但不自动生成 DSH 节点档案语义。 | 逻辑 node ID、与凭据绑定、持久档案、会话世代、重复连接、重装/撤销、能力审批和权威写入者必须由产品定义。 | [N6]；既有身份/注册证据 |
| **心跳 / liveness / readiness** | NATS PING/PONG、`$SRV.PING/STATS` | 可复用连接活性和在线服务应答，不必自研 socket ping 协议。 | 连接活着不等于 worker 可接任务。业务 heartbeat 周期/超时、readiness、slots、凭据/版本是否满足、离线后任务如何处理仍是产品策略。 | [N6]；既有身份/注册证据 |
| **服务发现** | NATS Services `$SRV.PING/INFO/STATS` | 按 account、服务名、实例做广播发现，INFO 返回 endpoints；调用方在 deadline 内收集当前在线响应。 | 它不是持久完整注册表，也不提供 DSH worker 类型/slots/readiness 模型；目录权威状态、历史记录与调度筛选仍需产品实现。 | [N6] |
| **认证 / 授权** | NATS NKey、NATS JWT 信任链、TLS/mTLS、users 与 subject permissions | NKey 用私钥签 nonce；NATS JWT 可形成 operator→account→user 信任链；TLS 保护通道，`verify_and_map` 可要求并映射客户端证书；publish/subscribe 权限按 subject 执行。 | 选择哪套内建组合、secret/证书签发轮换、逻辑 node 与 principal 绑定、事件级业务授权、`source` 是否从认证上下文校验仍待定义。NATS JWT 不是 OIDC access token。 | [N7][N8][N9][N10] |
| **按 User 隔离** | NATS accounts、users、permissions、跨 account export/import | account 是隔离的 subject namespace；user 属于 account；permissions 在 account 内收窄 subject；跨 account 必须显式共享。 | NATS `user` 不等于产品的人类/业务 User。每 User 一 account 还是共享 account + subject ACL、中心如何跨 account 收派、中心 DB/历史/任务/观测如何隔离，不能由 NATS 自动回答。 | [N7][N10] |
| **离线投递（消费者离线）** | JetStream stream、durable consumer、retention | stream 持久保存消息，consumer 在服务端保存进度，生产者和消费者不必同时在线；可从开头/序号/时间读取。 | stream/consumer 命名、首次起点、Limits/Interest/WorkQueue、磁盘/时长上限、最长离线和过期后的全量对齐是产品配置与恢复策略；broker retention 不是中心永久历史。 | [N3][N5][N11] |
| **离线发布（生产者进程崩溃）** | Transactional Outbox 模式；JetStream PubAck 只覆盖在线发布结果 | Outbox 把业务状态与待发布事件放在同一 DB 事务，再由 relay 发布；模式明确 relay 可能重复发布。 | 若要求进程崩溃也不丢未确认事件，需要产品持久 outbox、稳定事件 ID、relay 恢复与“结果未知”处理；客户端内存 reconnect buffer 不够。 | [N1][N2][P2] |
| **consumer ACK** | JetStream explicit `ack`，另有 `nak/term/in-progress` | ACK 让服务端结束该 consumer 的一次 pending 投递；in-progress 延长 AckWait；消费者处理与 broker settlement 已由官方实现。 | ACK 在 schema 校验、中心 DB commit、graph 副作用还是任务完成后发送，是产品提交点；ACK 不是中心受理回执，也不是 `task.result`。 | [N4] |
| **重投** | JetStream AckWait、redelivery、`nak` delay、consumer backoff、MaxDeliver | 未及时处理会重投；可延迟 nak、配置 backoff 和投递上限，共享 consumer 可把重投交给另一 worker。 | 最大尝试、退避、超时、poison message、DLQ/人工介入和告警仍是产品策略；at-least-once 下副作用必须幂等。 | [N4] |
| **消息序号 / 顺序** | JetStream stream sequence、consumer sequence；CloudEvents Sequence 扩展（非 Core） | stream sequence 是消息在特定 stream 中的固定存储位置；consumer sequence 按该 consumer 的每次 delivery 增加，**重投也计数**。CloudEvents `sequence/sequencetype` 描述唯一 source 内相对顺序，但 documented extensions 没有 Core 同等地位。 | stream seq 不是跨 stream 全局序号，consumer seq 不是 distinct-message ID 或中心权威序号；需由中心 single writer 定义受理顺序、作用域、per-key 并行业务规则。 | [N3][CE5][CE8] |
| **发布去重** | JetStream `Nats-Msg-Id` + `PubAck` | 发布重试可复用稳定 ID，在 stream duplicate window 内避免重复写入；`PubAck` 返回 stream/sequence/duplicate，证明已存储而非已消费。 | ID 唯一作用域、重试复用、窗口配置和超窗行为需定义；它不能替代中心长期去重，也不保护外部副作用。 | [N2] |
| **长期幂等 / inbox / outbox** | **没有统一线协议标准，但有成熟模式**：Idempotent Consumer、Transactional Outbox | Idempotent Consumer 用 DB 唯一记录识别已处理消息；Outbox 用同事务保存业务变更与待发布事件，再由 relay 发送。均有官方实现/架构文档可参照。 | 中心长期去重表、与权威历史/副作用的同事务、保留期、同 ID 异 payload、外部副作用幂等、outbox relay 和恢复是产品持久化设计；不是 NATS 配置能生成的能力。 | [P1][P2][P3]，详见 §5 |
| **graph correlation `key`** | CloudEvents 扩展点；OMG BPMN correlation 模型；A2A `contextId` 是相邻但不同的模型 | Core 允许项目扩展属性；BPMN 正式模型有 `correlationKey/correlationSubscription`；A2A 可用 `contextId` 聚合相关 Task/Message。它们证明“关联”有行业概念，但都不是现成 NATS graph-routing key。 | `approval:T-1` 如何命中 waitFor、作用域/生命周期、等待优先于 entry、迟到/unmatched、一个 key 是否对应多个实例，必须由 graph 引擎定义；不能硬塞到 `subject` 或 `traceparent`。 | [CE1][CE6][CE9][B1][B2][A1][A2]，详见 §4 |
| **worker 类型 / slots / readiness** | NATS Services 在线 INFO/STATS；A2A Agent Card / AgentSkill 是特定远程 agent 协议 | `$SRV` 可发现 endpoint 和在线统计；Agent Card 可描述 agent 身份、能力和 skills。 | 通用 worker pool 的 slots、资源占用、机器 readiness 和调度准入没有被这些机制统一；Agent Card 也不是 DSH 节点注册表。需产品数据模型和调度策略，不需自研发现传输协议。 | [N6][A1][A3] |
| **任务结果 / 完成** | CloudEvents 可承托项目 `task.result`；A2A Task lifecycle / Artifact 是特定 agent 互操作协议 | A2A 定义有唯一 ID 的 Task、终态（completed/canceled/rejected/failed）及 Artifact，可作为“接入远程 A2A agent”时的官方协议。 | 当前本地 worker 的 task ID/attempt、状态机、输出/错误、超时取消、结果幂等、哪个 HostAdapter 确定性信号算完成仍属产品；JetStream ACK、OTel span 结束和 agent 自报都不能自动替代该判定。采用 A2A 是另一应用边界，不是给现有事件改字段名。 | [N4][A1][A2][O2] |
| **分布式观测关联** | W3C Trace Context Level 1；OTel Context Propagators；CloudEvents Distributed Tracing 扩展（非 Core） | `traceparent/tracestate` 标准化 trace/span 上下文；OTel Stable propagator 可注入/提取；messaging semconv 可描述 create/send/receive/process/settle。 | 只用于诊断与遥测关联，不决定 graph 实例、任务完成或业务幂等。OTel messaging semconv 当前为 Development，且未规定本项目的消息创建上下文具体承载方式。 | [W1][O1][O2][CE7] |

## 2. CloudEvents 正式版本与字段逐项映射

### 2.1 版本事实

- **事实：** 官方最新 release/tag 为 **v1.0.2**；Core、JSON Event Format、NATS Protocol Binding 均取该 released tag。Core 线上 `specversion` 的值仍是 **`1.0`**，不是 `1.0.2`。[CE0][CE1]
- **事实：** Core 的必填属性只有 `id`、`source`、`specversion`、`type`；`datacontenttype`、`dataschema`、`subject`、`time` 和 `data` 均可选。扩展属性必须遵守小写字母/数字命名与 Core 类型系统；JSON 扩展是顶层成员。[CE1][CE2]
- **事实：** 正式 NATS binding 1.0.2 只支持 **structured mode**，事件属性和数据一起放进 UTF-8 JSON body；它明确不约束 NATS 的 transfer 或 settlement。官方 `main` 是 **1.0.3-wip**，其中 binary `ce-*` header 规则不能当成已发布规范。[CE3][CE9]
- **推断：** 若一期要声明“遵循正式 CloudEvents NATS binding”，structured JSON 是无歧义路径；不能把 NATS 现已支持 headers 推导成“正式 CloudEvents NATS binary binding 已发布”。`Nats-Msg-Id` 是 JetStream 自己的发布去重 metadata，把它与 structured CloudEvent 同发不等于采用了 wip binary CloudEvents 表示。

### 2.2 字段表

| CloudEvents / NATS 项 | 规则（事实） | 与现有字段的映射及剩余语义（推断） |
|---|---|---|
| `specversion` | 必填 String；遵循 1.0.x 规范时填 `1.0`。 | 新增。只说明信封规范版本，不能替代每类 `payload` 的 schema 版本。 |
| `id` | 必填非空 String；生产者保证 **`source + id`** 对不同事件唯一；重发可保持同 ID。 | `id → id`。当前“全局唯一”比规范更强，保留它可简化 `Nats-Msg-Id=id`；若以后只保证 `(source,id)` 唯一，需重新设计 broker 去重键，避免同 stream 跨 source 碰撞。 |
| `type` | 必填非空 String；常用于路由/观测/策略，格式由生产者定义，SHOULD reverse-DNS 前缀。 | `type → type`。现有点分命名可映射，但事件命名空间、版本和 NATS subject 映射仍是项目 profile；规范不自动注册类型。 |
| `source` | 必填非空 **URI-reference**，绝对 URI RECOMMENDED；描述 occurrence 的上下文，可不同于实际 producer。 | `source → source`。需定义 DSH URI/URN 规则；不能假定任意“发出者”字符串已合规，也不能把自报 source 当作已认证身份。 |
| `time` | 可选 **Timestamp**，JSON 为 RFC 3339 字符串；表示 occurrence 时间，不是 broker 受理时间。 | `ts → time`。当前若要求必填，可在项目 profile 收紧；还需定义生产者时钟、中心接收时间是否另存、时钟偏差处理。 |
| `data` | 可选；领域 payload。JSON 内容直接作为 JSON value，不能再把 JSON 文档双重编码成字符串；`data` 与 `data_base64` 互斥。 | `payload → data`。若现有所有事件都要求 payload，可由项目 profile 要求存在；每类 `data` 的 schema 仍由产品定义。 |
| `datacontenttype` | 可选 MIME type；JSON Event Format 中缺省通常按 `application/json` 处理。 | 新增/可显式固定 `application/json`。它不是整个 structured message 的 media type；后者是 `application/cloudevents+json`。 |
| `dataschema` | 可选、非空 **URI**；标识 `data` 遵循的 schema，不兼容变化 SHOULD 换 URI。 | 新增候选。可作为每类 payload 的版本化入口，但 URI 指向什么、是否强制、如何获取与校验仍需项目决定；CloudEvents 不强制 JSON Schema。 |
| `subject` | 可选非空 String；表示 **source 上下文中事件所涉对象**，便于通用过滤。 | 当前无独立对应。它既不是 NATS subject，也不天然是 graph correlation key；只有产品明确“事件对象 == graph key”的特定事件才可复用，不能全局硬映射。 |
| **`key`（现字段）** | 已发布 Core 无同义属性；Core 允许项目扩展，扩展在 JSON 顶层。 | 保留独立产品语义，可定义为项目扩展或放入 `data`，但需写清作用域、匹配和生命周期。`main` 的 `correlationid` 草案、`partitionkey`、`subject` 都不能未经证明直接替换，见 §4。 |
| `traceparent` / `tracestate` | 不是 Core 属性；CloudEvents Distributed Tracing documented extension 可承载 W3C trace 上下文。 | 新增也只能服务观测。不得承载 `approval:T-1` 等业务 graph key，也不得把 trace ID 当长期幂等键。 |
| NATS **subject** | NATS 协议寻址/订阅名；CloudEvents Core 明确不包含协议级路由目的地。正式 NATS binding 示例中的 `mySubject` 不是 `ce-subject` 映射规则。 | 需要项目定义从事件类别/租户到 NATS subject 的映射与权限；三个概念“CE subject、NATS subject、graph key”分别命名和测试。 |
| `Nats-Msg-Id` | JetStream stream 内有限窗口的发布去重 header；不是 CloudEvents 属性。 | 可复用稳定事件 `id`（若维持全局唯一），但它不进入中心长期幂等语义，也不把 structured event 变成 binary CloudEvent。 |

**版本与序列化推断：** “遵循 CloudEvents”应是“Core + JSON Format + NATS structured binding + DSH profile”四层同时成立；只把 `payload` 改名 `data`，或只加 `specversion`，都不足以覆盖 source 类型、时间格式、序列化和字段语义。

## 3. NATS 官方能力能覆盖到哪里

### 3.1 连接、离线和 ACK 是不同层（事实）

1. `nats.js` 自动重连与订阅恢复属于连接层；reconnect buffer 是断线期有界客户端 outbound queue，flush 不把 Core publish 变成持久确认写入。[N1]
2. JetStream stream 保存消息并分配 stream sequence；consumer 是服务端游标。durable consumer 的位置在服务端，客户端重连后继续使用。[N3][N11]
3. `PubAck` 是发布者到 stream 的“已存储”确认；consumer `ack/nak/term/in-progress` 是消费者到 broker 的 settlement；两者都不是 DSH graph 或 task 的业务完成。[N2][N4]
4. at-least-once 意味着重投可重复执行副作用；显式 ACK、AckWait、nak delay/backoff 可以配置重投行为，但不形成端到端 exactly-once。[N4][N11]

### 3.2 两种 sequence 不能混用（事实 + 推断）

- **事实：** stream sequence 是消息在某一 stream 的存储位置；consumer sequence 每次 delivery 都递增，redelivery 也算，因此它计的是投递次数而非不同消息。[N3]
- **推断：** stream sequence 可作为该 stream 内 replay/诊断游标；consumer sequence 可检测 consumer delivery gap，但二者都不能直接成为中心跨 subject/stream 的权威事件序号。中心序号应在中心受理路径分配，并明确是否 per graph/key、是否允许重投乱序。
- **事实：** CloudEvents `sequence/sequencetype` 只描述 unique event source 内相对顺序，且属于 documented extension；extensions 文档明确这些属性没有 Core 属性的 official standing。[CE5][CE8]
- **推断：** 不能用该扩展反推“行业已有 DSH 全局序号标准”，也不能让 broker 的存储顺序替代 graph 的确定性重放顺序。

### 3.3 Services 与安全边界（事实 + 推断）

- `$SRV.PING/INFO/STATS` 是在线广播发现；调用方需在时间窗收集全部响应，单一响应不是完整实例列表。它能减少在线发现协议代码，但不能成为持久节点目录或 readiness 判定。[N6]
- account 隔离 subject namespace，permissions 限制 account 内 publish/subscribe，NKey/JWT/mTLS 提供不同认证路径；这些覆盖连接与 broker 资源安全，不自动校验事件中的 `source`、业务 User 或 graph 权限。[N7][N8][N9][N10]
- **推断：** 一期不需要自研 token 格式、nonce 签名、TLS、subject ACL 或 socket discovery；仍需最小身份映射、密钥生命周期、跨 account 拓扑和业务授权。

## 4. `key`、Trace Context、BPMN 与 A2A：不能混为一谈

### 4.1 CloudEvents 候选逐项核查

| 候选 | 一手事实 | 适配结论（推断） |
|---|---|---|
| **Core `subject`** | 描述 source 内事件对象，用于订阅过滤。[CE1] | graph key 是等待登记/实例匹配 token，不一定是事件对象；不能全局替代。 |
| **`partitionkey`** | Partitioning documented extension 用于把事件分到 bucket，可表达 causal grouping；跨 hop 可变或被移除。documented extensions 没有 Core 同等 official standing。[CE5][CE6] | 它首先是分区/分组语义，不保证 waitFor 生命周期与匹配规则；不能把“也是 key”当成兼容证明。 |
| **工作树 `correlationid` / `causationid`** | 官方仓库 `main`（1.0.3-wip）的 `correlation.md` 将前者定义为同一 logical flow/business transaction 的事件组，后者指向直接原因事件。该文件不在 v1.0.2；同一 commit 的 Known Extensions 列表也未列它。[CE9] | 这是值得跟踪的草案，不是已发布 Core 标准。“同一 workflow”通常比“某个 waitFor key 命中某 graph 实例”更宽；即便将来采用，也需另证 1:1，不能直接替换 `key`。 |
| **`traceparent` / `tracestate`** | CloudEvents Distributed Tracing extension 面向故障诊断，保存 trace 上下文。[CE7] | trace 与 graph correlation 目的、生命周期和 mutation 规则不同；不能替换。 |
| **项目扩展属性** | Core 允许任意数量扩展，名称小写字母/数字、类型受 Core 约束，JSON 为顶层属性。[CE1][CE2] | 可承托 DSH 自有 graph key，但“符合 CloudEvents 扩展格式”不等于“graph key 已成为行业标准”；仍需公开项目 profile。 |

### 4.2 W3C Trace Context 与 OTel 的正式覆盖范围

- **事实：** 当前 W3C Recommendation 是 Trace Context Level 1（2021-11-23）。`traceparent` 包含 version、trace-id、parent-id、trace-flags，标识请求在 trace graph 的位置；`tracestate` 承载 vendor-specific trace 信息。规范只允许 trace correlation 用途，并定义 parent-id 更新、trace 重启等规则。Level 2 页面当前仍为 Candidate Recommendation Draft。[W1][W2]
- **事实：** OTel Stable Propagators API 负责从 carrier 注入/提取 SpanContext、Baggage 等 cross-cutting context，并维护 W3C Trace Context propagator。OTel messaging semantic conventions 描述消息 create/send/receive/process/settle 及 conversation ID，但该文档状态为 **Development**，并明确不指定消息创建上下文的具体附着/提取机制。[O1][O2]
- **推断：** W3C/OTel 可回答“怎样把一次分布式调用的遥测串起来”，不能回答“哪条外部事件应唤醒哪个长期 graph 实例”。一个 graph 实例可跨多天、产生多条 trace，一条 trace 也可跨多个业务 key；二者应独立存储、独立演化。OTel 的 `messaging.message.conversation_id` 是遥测属性，不是新的 Gateway 业务线协议。

### 4.3 相邻正式模型不是 drop-in wire 字段

- **事实：** OMG BPMN 2.0.2 是 formal specification，其官方 XSD 包含 `correlationKey`、`correlationProperty`、`correlationSubscription` 等流程模型元素。[B1][B2]
- **推断：** 这说明“消息与流程实例关联”有正式流程建模概念可借鉴，但 BPMN 没有因此给 CloudEvents/NATS 定义一个通用 `key` 字段。当前 graph 若未完整实现 BPMN 语义，不应仅凭相似名字声称 BPMN 兼容。
- **事实：** A2A 的 `contextId` 聚合相关 Task/Message；Task 有独立 `taskId`、生命周期和 Artifact。[A1][A2]
- **推断：** A2A context 是会话/多任务连续性，不等同 DSH waitFor key。只有在边界上真正接入 A2A remote agent 时才有理由遵循其完整协议；不能摘一个 ID 字段就宣称现有 Gateway 已采用 A2A。

## 5. 长期幂等：没有统一线协议标准，但有成熟模式

### 5.1 结论边界

**事实：** 本次核查未发现一种能由“NATS + 中心数据库”直接声明遵循、统一规定长期 inbox/outbox 记录、数据库与 broker 原子提交、保留期和外部副作用语义的跨系统线协议。**因此准确表述是：没有统一线协议标准，但有成熟模式。**[P1][P2][P3]

- **Idempotent Consumer（幂等消费者）**：模式原始目录建议在 DB 记录已处理消息 ID，并以 `(subscriberId,messageID)` 等唯一键拒绝重复处理。[P1]
- **Transactional Outbox（事务性发件箱）**：业务实体与待发送消息在同一 DB 事务中保存，再由 message relay 发布；原始模式明确 relay 可能在“已发布、未记录进度”时崩溃而重复发布，所以消费者仍需幂等。[P2]
- Microsoft 官方架构文档给出同一模式的实际基础设施组合与恢复/TTL 考虑，说明它是可复用持久化设计，而不是某个新造术语或 NATS 内建协议。[P3]

### 5.2 对一期既定“中心长期幂等”的映射（推断）

| 问题 | 可复用模式/官方能力 | 产品必须回答 |
|---|---|---|
| 中心重复受理 | Idempotent Consumer + 中心 DB 唯一约束 | 唯一键是 `id` 还是 `(consumer,source,id)`；同 ID 异 payload 是冲突还是告警；记录保留多久；重复时返回何结果。 |
| 中心历史与去重原子性 | 在同一中心 DB 事务写去重记录、权威历史和业务投影 | 哪个提交点之后可 ACK；commit 后 ACK 丢失如何重放；如何避免重复 graph 副作用。 |
| 中心历史与出站事件双写 | Transactional Outbox + 稳定事件 ID + relay | outbox schema、relay 崩溃恢复、发布顺序、未知 PubAck 结果、重复发布处理。 |
| broker 辅助 | `Nats-Msg-Id` 短窗去重、JetStream redelivery | duplicate window 只是优化，不能替代长期记录；broker ACK 与 SQLite commit 不自动成为同一事务。 |
| 外部副作用 | 模式要求消费者幂等；A2A/CloudEvents 不替任意副作用提供统一事务 | 每类 API/子进程/agent 的幂等键、重试安全、人工补偿与不可幂等操作边界。 |

“inbox”若用于命名中心的去重表/持久化实现，应被描述为 **Idempotent Consumer 的项目存储设计**；不要把它包装成存在统一 inbox wire protocol。

## 6. 哪些决策可以直接改成“遵循 X / 使用 Y”

以下是**可供决策票采纳的措辞，不是本研究代为定案**。

| 当前决策票 | 可直接改写的标准/官方能力表述 | 仍需配置或产品决定 |
|---|---|---|
| 自研事件格式 | **“线上事件遵循 CloudEvents Core 1.0.2 + JSON Event Format 1.0.2；NATS 使用其 1.0.2 structured binding，另以 DSH profile 约束扩展与每类 data schema。”** | 是否采纳；`source` URI、`time/data` 必填、`key` 扩展、类型目录、dataschema、兼容策略和 validator。 |
| 自研 socket / reconnect | **“使用官方 NATS 客户端的自动重连、订阅恢复、首次连接重试和 reconnect 配置。”** | `MaxReconnect`、`waitOnFirstConnect`、backoff、buffer、连接事件观测；不得把 buffer 当持久 outbox。 |
| 自研离线队列 / replay | **“使用 JetStream stream + durable consumer 保存消息和服务端消费进度。”** | File/Memory、Limits/Interest/WorkQueue、consumer 起点、容量/保留期、长离线恢复、中心历史与 broker retention 分离。 |
| 自研发布确认 | **“使用 JetStream `PubAck` 判断 stream 已存储，并对未知结果用稳定 `Nats-Msg-Id` 重试。”** | timeout 后的未知结果处理、去重窗口、稳定 ID；不能写“PubAck 等于中心受理”。 |
| 自研消费 ACK / 重投 | **“使用 JetStream explicit ACK、`nak/term/in-progress`、AckWait、backoff 和 redelivery。”** | ACK 与中心 commit 的先后、最大尝试、poison/DLQ、长任务 in-progress、幂等副作用。 |
| 自研短期发布去重 | **“使用 JetStream `Nats-Msg-Id` 在 stream duplicate window 内去重。”** | 保留当前全局 ID 或另定组合键；超窗仍由中心长期幂等负责。 |
| 自研连接认证/授权 | **“使用 NATS 内建 NKey 或 NATS JWT、TLS/mTLS、accounts/users 与 subject permissions。”** | 具体组合、最小权限、账户拓扑、secret/证书生命周期、node/User 映射；不要混称 OIDC。 |
| 自研在线发现协议 | **“在线服务发现使用 NATS Services `$SRV.PING/INFO/STATS`。”** | 持久注册表、业务心跳、能力/readiness/slots、历史名录与调度规则；不能称其为完整服务注册中心。 |
| 自研观测上下文格式 | **“分布式 trace 使用 W3C Trace Context；OTel 只负责规范的 context propagation 与遥测。”** | NATS carrier 的具体约定、采样/隐私/版本；`key` 独立保留，messaging semconv 的 Development 状态需记录。 |
| 长期幂等协议 | **“采用 Idempotent Consumer 与 Transactional Outbox 成熟持久化模式，中心保存长期去重记录。”** | 这不是“遵循某统一线协议”；DB 事务、唯一键、保留、outbox relay、外部副作用和恢复均需产品设计与故障验收。 |
| 远程 agent 互操作（若另立需求） | **“需要与外部 A2A agent 互操作时，遵循 A2A Agent Card、Task、Message、Artifact 的完整协议边界。”** | 不属于当前 NATS Gateway 的默认替换；slots/readiness/graph key/HostAdapter 完成判定仍独立。 |

## 7. 哪些只剩配置与产品语义

### 7.1 主要是官方能力配置，不应再写自研协议

- 客户端重连次数、首次连接等待、backoff/jitter、连接事件和 reconnect buffer 上限。
- JetStream stream 存储、subjects、retention、容量、durable/pull consumer、DeliverPolicy、AckWait、MaxDeliver、backoff 和 duplicate window。
- NATS account/user、subject allow/deny、NKey/JWT/mTLS、证书/凭据文件与 JetStream 存储目录。
- 是否启用 `$SRV` 客户端 Services framework，以及 discovery deadline/收集响应方式。

这些仍有运维和故障验收工作，但**不需要发明相应网络协议**。

### 7.2 产品必须定义的数据/策略，不应伪装成行业标准空白已填

- DSH CloudEvents profile：`source` URI 规则、事件类型/schema 目录、`key` 扩展、必填性与兼容策略。
- graph key 的命名、作用域、等待登记、匹配优先级、实例生命周期、迟到与 unmatched。
- 节点持久档案、机器身份世代、重复连接 fencing、worker 类型、slots、readiness 与心跳超时。
- 产品 User 与 NATS account/user 的映射、跨 account 中心路由、中心 DB/历史/任务/观测隔离。
- 中心权威序号的作用域、跨 stream 顺序、graph deterministic replay 顺序与中心 single writer。
- 长期去重记录、DB 事务边界、保留期、冲突策略、outbox relay、不可幂等副作用处理。
- `task.result` 的 task/attempt 关联、状态机、输出/错误、超时取消，以及 HostAdapter 哪个确定性信号是权威完成。

## 8. 现有设计的冲突点与值得调整处（推断）

1. **现有信封不能直接标成 CloudEvents。** 缺少 `specversion`，`payload/ts` 需变为 `data/time`，`source` 必须满足 URI-reference，`key` 需作为项目扩展或 data 另行定义。应先形成 DSH profile 和迁移/兼容规则，再写“遵循 CloudEvents”。
2. **`foundation` 把“序号/幂等”归 Gateway 领域，但独立 `nats-server` 不会拥有 DSH 中心权威序号和长期业务幂等。** 一期已选“中心长期幂等”后，应明确：NATS 负责 stream sequence 与短窗发布去重，中心负责权威序号/长期去重；不要让职责文字仍暗示 Gateway 进程内自研这些能力。
3. **保留当前全局唯一 `id` 有明显互操作价值。** CloudEvents 只要求 `(source,id)` 唯一；若直接降级到该最小规则，同时又以 `Nats-Msg-Id=id` 在同一 stream 去重，跨 source 同 ID 可能误去重。要么维持全局 ID，要么定义无碰撞、稳定且可逆的 broker 去重键。
4. **三类 subject/key 必须在词汇表分开。** CloudEvents `subject` 是事件对象，NATS subject 是传输地址，DSH `key` 是 graph 匹配 token；`traceparent` 是观测上下文。任何“直接复用 subject/traceparent 当 correlation”的文案都应删除。
5. **不要把 consumer sequence 当事件序号。** 它连 redelivery 也计数；stream sequence 又只限单 stream。中心历史需要自己的受理序号，否则跨 stream 和重投后无法得到统一权威时间线。
6. **“三处同构”应理解为同一逻辑 CloudEvent，而不是所有记录只有同一组字段。** PubAck、stream/consumer sequence、delivery 次数、认证 principal、中心受理时间/序号、ACK 状态都是不同层 metadata，不应强塞回业务信封或丢失。
7. **“Gateway 不理解事件内容”与“声明符合 CloudEvents”需明确校验位置。** `nats-server` 不会因收到 structured JSON 就验证 CloudEvents/DSH schema；生产者、客户端适配层或中心消费者必须负责验证，broker 只按 subject/存储/权限工作。
8. **consumer ACK、中心受理与任务完成必须保留三个名字。** 把 ACK 当 `task.result` 会在“中心已存结果但 ACK 丢失”及“worker 已执行但结果未回传”故障下产生错误结论。
9. **不要把 `main` 的 binary NATS binding 或 Correlation 文件当 released 标准。** 若决策票需要稳定规范，应引用 v1.0.2 structured binding；`correlationid` 只能标为工作树草案并另做版本跟踪。
10. **A2A/BPMN 只能按实际边界采用。** 当前 `task.result`、Agent Card 或 correlation key 与它们有相似概念，不等于现有实现已遵循完整协议；若只需 NATS 内部事件，不应为“标准化”再引入第二套任务/流程协议。

## 9. 标准不能回答的问题

1. 哪些事件允许丢失、哪些必须最终受理、哪些只应被一个 worker 执行，以及相应 stream/retention 拓扑。
2. 事件类型目录、payload schema、版本与未知事件处理；CloudEvents 不定义任何 `node.*` / `task.*` 业务语义。
3. graph key 的生成、唯一性、生命周期、多个等待者、等待优先于 entry、迟到/unmatched 与 graph 版本兼容。
4. 中心权威序号的范围、中心受理点、跨 stream/per-key 顺序，以及 deterministic replay 所要求的顺序。
5. ACK 与中心 DB commit 的先后、commit 后 ACK 丢失、发布结果未知、poison message 与人工恢复。
6. 长期去重唯一键、保留期、同 ID 异 payload、外部副作用幂等、outbox relay 和备份迁移。
7. 节点 ID 与凭据绑定、同 ID 双连接、会话世代/fencing、能力是否需审批、slots/readiness 和任务重新调度。
8. 产品 User 到底是人、组织还是机器池；每 User account 或共享 account 的选择，以及中心数据库和观测面的隔离。
9. 任务由谁认领、attempt 如何标识、结果状态/输出/错误模型、超时取消，以及 HostAdapter 的退出码/RPC 完成/回合结束/心跳超时中哪个信号才算完成。
10. 是否需要与外部 BPMN 引擎或 A2A remote agent 互操作；这是独立产品边界和选型，不是 NATS Gateway 的默认要求。

## 10. 一手来源

> 本节 URL 均访问于 **2026-11-13**。released tag 用于可复现引用；明确标为工作树的链接只用于说明草案状态，不作为已发布规范。

### CloudEvents / CNCF 官方规范与源码

- **[CE0]** 官方 GitHub Releases API（当前 latest release 为 `ce@v1.0.2`）与 tags：https://api.github.com/repos/cloudevents/spec/releases/latest ；https://api.github.com/repos/cloudevents/spec/tags?per_page=10
- **[CE1]** *CloudEvents Core — Version 1.0.2*（必填/可选、属性类型、扩展、事件数据）：https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md
- **[CE2]** *JSON Event Format — Version 1.0.2*（JSON 类型、media type、`data` / `data_base64`、顶层扩展）：https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/formats/json-format.md
- **[CE3]** *NATS Protocol Binding — Version 1.0.2*（structured-only、UTF-8 JSON、不管 transfer/settlement）：https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/bindings/nats-protocol-binding.md
- **[CE4]** *CloudEvents Primer 1.0.2*（non-normative；版本策略、范围、路由不在事件内）：https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/primer.md
- **[CE5]** *CloudEvents Extension Attributes 1.0.2*（extensions 无 Core 同等 official standing、Known Extensions）：https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/documented-extensions.md
- **[CE6]** *Partitioning extension 1.0.2*：https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/extensions/partitioning.md
- **[CE7]** *Distributed Tracing extension 1.0.2*：https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/extensions/distributed-tracing.md
- **[CE8]** *Sequence extension 1.0.2*：https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/extensions/sequence.md
- **[CE9]** 官方工作树固定 commit `56b5413`：*NATS binding 1.0.3-wip*、*Correlation*、extensions README（含 Known Extensions 与地位说明）：https://github.com/cloudevents/spec/blob/56b54136a6088c47058ed43c2df45e433b4868f0/cloudevents/bindings/nats-protocol-binding.md ；https://github.com/cloudevents/spec/blob/56b54136a6088c47058ed43c2df45e433b4868f0/cloudevents/extensions/correlation.md ；https://github.com/cloudevents/spec/blob/56b54136a6088c47058ed43c2df45e433b4868f0/cloudevents/extensions/README.md

### W3C / OpenTelemetry

- **[W1]** W3C, *Trace Context Level 1*, Recommendation 2021-11-23（traceparent/tracestate、用途、处理模型）：https://www.w3.org/TR/trace-context/
- **[W2]** W3C, *Trace Context Level 2*（当前 Candidate Recommendation Draft 状态）：https://www.w3.org/TR/trace-context-2/
- **[O1]** OpenTelemetry Specification 1.62.0, *Propagators API*（Stable；inject/extract、W3C propagator）：https://github.com/open-telemetry/opentelemetry-specification/blob/v1.62.0/specification/context/api-propagators.md
- **[O2]** OpenTelemetry Semantic Conventions 1.45.0, *Messaging spans*（Development；creation context、conversation ID、未规定具体附着机制）：https://github.com/open-telemetry/semantic-conventions/blob/v1.45.0/docs/messaging/messaging-spans.md

### NATS 官方文档

- **[N1]** *Reconnection*（自动重连、首次连接、订阅恢复、有界 reconnect buffer 及其非持久边界）：https://docs.nats.io/learn/resilient-clients/reconnection
- **[N2]** *JetStream Publishing*（PubAck、stream sequence、未知结果、`Nats-Msg-Id`）：https://docs.nats.io/learn/jetstream/publishing
- **[N3]** *Reading back the stream*（durable consumer、stream sequence、consumer sequence 含 redelivery）：https://docs.nats.io/learn/jetstream/reading-back
- **[N4]** *Ack responses and redelivery*（ack/nak/term/in-progress、AckWait、delay/backoff）：https://docs.nats.io/learn/jetstream/acknowledgment
- **[N5]** *Retention policies*（Limits/Interest/WorkQueue 与 limits）：https://docs.nats.io/learn/jetstream/retention-policies
- **[N6]** *Services Discovery*（`$SRV.PING/INFO/STATS`、广播、deadline、实例信息）：https://docs.nats.io/learn/services/discovery
- **[N7]** *Accounts and multitenancy*（account subject 隔离、users、JetStream per account）：https://docs.nats.io/learn/security/accounts-and-multitenancy
- **[N8]** *Decentralized authentication*（NKey、NATS JWT、nonce、operator/account/user）：https://docs.nats.io/learn/security/decentralized-auth
- **[N9]** *Encryption & TLS*（server TLS、mTLS、`verify_and_map`、client authentication 边界）：https://docs.nats.io/learn/security/encryption
- **[N10]** *Authorization*（publish/subscribe subject permissions）：https://docs.nats.io/learn/security/authorization
- **[N11]** *JetStream Concepts*（at-least-once、时间解耦、stream/consumer）：https://docs.nats.io/concepts/jetstream

### 幂等/outbox 模式的一手定义与官方实现文档

- **[P1]** Chris Richardson 的原始模式目录，*Idempotent Consumer*（processed message IDs、DB 唯一键）：https://microservices.io/patterns/communication-style/idempotent-consumer.html
- **[P2]** 同一原始模式目录，*Transactional Outbox*（同事务、relay、重复发布边界）：https://microservices.io/patterns/data/transactional-outbox.html
- **[P3]** Microsoft Azure Architecture Center, *Implement the Transactional Outbox pattern by using Azure Cosmos DB*（官方实现、恢复/TTL/重复考虑）：https://learn.microsoft.com/en-us/azure/architecture/databases/guide/transactional-out-box-cosmos

### 相邻流程/agent 协议

- **[A1]** A2A 官方，*Core Concepts*（Agent Card、Task、Message、Artifact、contextId）：https://a2a-protocol.org/latest/topics/key-concepts/
- **[A2]** A2A 官方，*Life of a Task*（终态、taskId/contextId、Artifact、task immutability）：https://a2a-protocol.org/latest/topics/life-of-a-task/
- **[A3]** A2A 官方，*Agent Discovery*（Agent Card/skills；curated registry API 尚未标准化）：https://a2a-protocol.org/latest/topics/agent-discovery/
- **[B1]** OMG, *BPMN 2.0.2* formal specification 入口：https://www.omg.org/spec/BPMN/2.0.2/
- **[B2]** OMG BPMN 官方 `Semantic.xsd`（`correlationKey`、`correlationProperty`、`correlationSubscription` 等模型元素）：https://www.omg.org/spec/BPMN/20100501/Semantic.xsd
