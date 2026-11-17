# Gateway 消息基础设施选型证据

> 状态：只读调研证据，不作最终选型。
> 访问日期：**2026-11-13**。除项目约束外，事实只采用官方文档、官方源码、正式协议/规范；文末来源列表中的 URL 均在该日访问。
> 范围：NATS Core/JetStream、RabbitMQ、Redis Streams、Centrifugo，以及 `ws`、Socket.IO、NestJS WebSocket 等传输/框架方案。Temporal 只核查是否能直接替代本消息层。
> 标注：**事实**有一手来源；**推断**是基于事实的适配分析，不是产品承诺。“未找到量化数据”处不补估值。
> 项目边界：沿用 [agent-dispatch 总览](../overview.md) 与 [底座细节](../foundation.md) 中的统一事件信封、同宿主真实 Gateway 协议、独立 Gateway 进程、中心权威历史 single writer，以及一期单机最小链路约束。

## 1. 结论摘要

### 1.1 直接结论（推断）

1. **可以进入 PoC 的成熟承托层是 NATS JetStream、RabbitMQ（quorum queue 与 stream 需分别评估）、Redis Streams。**三者都能由独立服务进程承担连接、路由、服务端存储、重投及相应 ACK 机制，DSH 中心/节点插件使用 Node/TypeScript 客户端；不必自己实现一套 socket 可靠传输。
2. **Core NATS 单独不满足可靠事件通道。**它明确是 at-most-once（至多一次）、无 broker queue/storage/ACK；离线订阅者收不到。要承担离线队列、replay（重放）与显式 ACK，必须使用 JetStream，而不是只换用 NATS 协议。[N1][N2]
3. **没有任何候选能自动给出端到端 exactly-once（恰好一次）业务处理。**发布去重只覆盖 broker 写入，消费者重投仍会发生；中心写 SQLite、调用外部 API、启动任务等副作用仍需项目自己的 inbox 去重、幂等副作用及 outbox（事务性发件箱）决策。RabbitMQ 官方甚至明确：effectively-once 只保护目标 stream，数据库或 HTTP 副作用仍可重复。[R12]
4. **RabbitMQ 不能作为一个模糊整体比较。**普通 queue 是破坏性消费，适合工作队列但 ACK 后不能重读；RabbitMQ Stream 是非破坏性日志、支持 offset replay 和发布去重。两条路径的 Node 客户端官方支持程度也不同。[R4][R7][R8]
5. **Redis Streams 在 Redis 8.6 起有真正的发布幂等 `IDMP`，但窗口很小且有双重上限。**默认只保留 100 秒、每 producer 100 个 iid；容量淘汰可先于时间到期，修改配置还会清空既有 IDMP map。它不能替代中心的长期去重记录。[D5][D6]
6. **`ws`、Socket.IO、NestJS WebSocket 都不能替代 broker。**Socket.IO 默认 at-most-once，server 没有离线发送缓冲；其 server→client at-least-once 官方示例仍要求应用自己分配 ID、持久化事件、记录并重传 offset。NestJS 只是适配 `socket.io` 或 `ws` 的框架。[W3][W4][W7]
7. **Centrifugo 对本层没有明确适配价值。**官方将 history 定位为短期、有限的恢复缓存，不是 durable message queue 或权威事件日志；可留作未来实时观测 UI 的补充，不宜承托中心—节点命令/事件可靠通道。[C1]
8. **Temporal 不是本层的 drop-in broker 替代。**它的持久 Task Queue 服务于 Workflow/Activity/Nexus task，而本层需要通用事件信封、按 type 的发布订阅、注册/心跳和中心权威历史。改成 Temporal 意味着改为 Workflow/Signal/Worker 架构，不是替换传输实现。[T1][T2]

### 1.2 可复用与仍需自研的边界（推断）

```text
DSH 中心/节点插件
  └─ 项目自有：事件 schema、type 路由约定、注册/心跳、身份世代、业务 ACK、
               权威序号、长期幂等、中心事件历史、outbox/inbox、观测与恢复
       └─ 薄适配层（可选但通常仍需）：Envelope ↔ broker 消息、游标、配置、健康检查
            └─ 成熟基础设施：NATS / RabbitMQ / Redis 独立服务进程
                 └─ 网络协议、broker 存储、发布确认、消费 ACK、重投/replay、权限
```

- **替代路径**：独立 `nats-server` / RabbitMQ / Redis 进程直接成为 Gateway 基础设施，两个角色即使同宿主也经 loopback 的真实 broker 协议通信。
- **承托路径**：保留独立薄 Gateway 适配进程，在其内部使用上述客户端，保留项目注册/心跳和协议外观。
- **仍需项目决定**：一期所说的“真实 Gateway 协议”究竟是“事件信封经真实 broker 网络协议”还是“项目自定义握手 + broker”。基础设施不能替产品回答这一验收口径。

## 2. 候选对比表

> 表中“适配判断”是**推断**；其余是压缩后的**事实**，限制以后文为准。

| 候选 | 投递与 ACK 所属层 | 持久化、离线与 replay | 去重真实边界 | subject/topic 与 competing consumer（竞争消费） | Node/TS 与许可证 | 服务成本与适配判断 |
|---|---|---|---|---|---|---|
| **Core NATS** | at-most-once；无 broker ACK、存储或离线投递。[N1] | 无；只给发布时在线且已订阅者。[N1] | 无 broker 去重窗口。 | 点分 subject，`*`/`>`；queue group 每组选一个在线成员，但成员断线不重投。[N3][N4] | Go server，官方 Tier-1 JS/TS 客户端；Node ≥22；Apache-2.0。[N14][N15][N16][N17][N18] | 单 binary。只能承托可丢的在线通知/心跳，**不能独立承托可靠事件流**。 |
| **NATS JetStream** | at-least-once；`PubAck` 是 stream 已存储，consumer `ack/nak/term/working` 是消费处理层；超时可重投。[N2][N5][N7] | File/Memory stream；consumer 可从开头、最新、序号或时间读取；durable consumer 保存进度。[N2][N6] | `Nats-Msg-Id` 在 stream 窗口内去重，默认 2 分钟；不是长期业务去重。[N5][N6] | 同 Core；持久工作负载用多个 worker 共享 pull consumer，而不是只靠 Core queue group。[N4][N9] | 同 Core；`@nats-io/jetstream` 官方 JS/TS，CJS/ESM。[N14][N15] | 同一 server 增加 `-js`、磁盘限额与监控；R=1 无容错，File 也不是每次写都立即 fsync。[N6][N10]**最贴合 subject/queue 语义，但仍需应用幂等与历史层。** |
| **RabbitMQ quorum/classic queue** | 自动 ACK 接近 fire-and-forget；手动 consumer ACK + publisher confirm 支撑 at-least-once，两者正交。[R1][R2] | durable queue + persistent message 才能跨重启；quorum 总是持久、复制；普通 queue ACK 后不能重读。[R3][R4] | 普通 queue 没有按事件 `messageId` 的通用去重承诺。 | topic exchange 用 `.`、`*`、`#`；同一 queue 多消费者竞争，Single Active Consumer 可选。[R2][R5] | Erlang server；RabbitMQ 团队支持的 AMQP 1.0 JS/TS 客户端，包声明 ISC；server MPL-2.0。[R6][R13][R14][R15] | broker + Erlang runtime、拓扑与磁盘/告警运维。适合工作队列；**不是现成历史 replay 或全局去重层**。 |
| **RabbitMQ Stream** | 持久复制 append-only log；publisher confirm 只确认 broker 接收；consumer credit 是流控、offset 是恢复游标，不等于业务处理成功 ACK。[R7][R8][R16] | 非破坏性读取，可按 first/last/offset/timestamp 附加；retention 到期删除。[R7] | producer name + 严格递增 publishingId；同名不可并发，最多 255 producer/stream；effectively-once 仅目标 stream，不保护外部副作用。[R7][R12] | 同一 stream 多读者可重复读；SAC 提供单活，stream filtering 不等同 NATS subject 通配。[R7][R16] | `rabbitmq-stream-js-client` 为 TS，ISC；官方文档列出但**没有** Core Team 支持勾号。[R8][R16][R17] | Stream plugin/端口、磁盘 I/O、offset/retention 管理。适合 replay；**TS 客户端支持级别与 AMQP 1.0 客户端不同，去重 ID 需另映射**。 |
| **Redis Streams** | consumer group 的 PEL + `XACK` 支撑 at-least-once 处理模式；`NOACK` 降低可靠性。[D2][D4] | stream 可按 ID/range 重读；PEL 可重读，`XAUTOCLAIM` 接管闲置 pending；实际重启保证取决于 RDB/AOF 配置。[D2][D3][D8] | Redis ≥8.6 `IDMP(pid,iid)` 支持 UUID：默认 100 秒、每 pid 100 iid；容量优先淘汰，改配置清 map。[D5][D6] | 以 stream key 读取，consumer group 分区消息；没有 NATS 式 subject wildcard，按 type 分 key 或自行过滤。[D1][D2] | Redis server 非 TS；官方 `node-redis` 有 TS 示例与类型；client MIT；Redis 8 server 为 RSALv2/SSPLv1/AGPLv3 三选一。[D10][D11][D12] | Redis 进程 + AOF/RDB、trim/PEL 运维。客户端自动重连和内存 offline queue 不等于持久 outbox。[D7]**可行，但 type 路由和长期去重适配更多。** |
| **Centrifugo** | PUB/SUB broker 为 at-most-once；发布成功不是业务处理 ACK。[C1] | `offset + epoch` 可恢复短时缺口；history 有 size/TTL，失败要求回源数据库。[C1] | 恢复时按位置去重，但仍要求应用容忍重复；无长期事件 ID 去重。[C1] | channel pub/sub + presence；不是 durable worker queue。 | Go server；`centrifuge-js` 支持 Node 并带 `.d.ts`，Node 下需 `ws` 构造器；server Apache-2.0/client MIT。[C2][C3][C4] | 独立实时服务；**只建议评估实时观测 UI，不进入可靠 Gateway 短名单**。 |
| **`ws`** | WebSocket framing + TCP；无 broker 消费 ACK/持久化语义。 | 无 broker 离线队列/replay；ping/pong 只能辅助判活。[W1][W2] | 项目自研。 | 项目自研订阅和 queue group。 | Node JS server/client，TS 类型来自 `@types/ws`；MIT。[W1][W8] | 独立 Node Gateway 仍需项目实现；**除 socket 外可靠性均自研**。 |
| **Socket.IO** | 默认 at-most-once；client→server 可用 retries + 应用 ACK；server→client 可靠投递需应用数据库。[W3] | client 有内存缓冲，server 无离线缓冲；短期 connection state recovery 不保证成功。[W3][W4] | 项目自研事件 ID 与去重。 | namespace/room 广播，不是持久 competing consumer queue。 | Node server/client，first-class TypeScript；MIT。[W5][W6] | 自研 Node 服务减少重连工作，**但不减少持久化、重放与长期幂等工作**。 |
| **NestJS WebSocket** | 继承所选 adapter 的语义，不新增可靠投递保证。 | 继承 `socket.io`/`ws`；无独立 broker 历史。 | 项目自研。 | decorator/gateway/adapter；不是 queue broker。 | TypeScript 框架，MIT。[W7][W10] | 只是应用框架；**不能与 NATS/RabbitMQ/Redis 同级比较**。 |
| **Temporal** | Workflow/Activity 的重试与幂等边界，不是通用 broker ACK；Activity 官方建议幂等。[T2] | Workflow/Activity task 可持久等待 Worker；Nexus/Query task 不持久。[T1] | 由 Workflow 语义与 Activity 幂等决定，不是事件 ID 去重窗口。 | Task Queue 由 Worker poll；不是按任意事件 type 的 pub/sub。[T1] | Go server；官方 TypeScript SDK，Node 20/22/24；MIT。[T3][T4] | **不是直接替代**；采用它会改写中心、节点和权威历史架构。 |

## 3. 逐候选证据

### 3.1 NATS Core 与 JetStream

#### 投递语义与 ACK 层（事实）

- Core NATS 官方定义为 **at-most-once**：发布时连接且有兴趣的订阅者至多收一次；离线、重启或尚未订阅即看不到，server 不为其保存。该页还明确“no broker queue, no storage, and no acknowledgment”。[N1]
- JetStream 在其上增加 persistence，官方定义为 **at-least-once**。stream 给消息分配递增 sequence；consumer 是带服务端进度的视图，未在时限内 ACK 会 redeliver。[N2]
- `PubAck` 只证明消息已存入 stream，包含 stream、sequence、duplicate，**不证明消费者收到或处理**。发布超时是“结果未知”，不是“未写入”，因此重试必须带稳定 `Nats-Msg-Id`。[N5]
- consumer 的 `ack`、`nak`、`term`、`working/in-progress` 在消费层。默认 `AckWait=30s`，超时会重投；`MaxDeliver=-1` 默认不限次数。达到次数上限后没有内建 DLQ，只有 advisory 可供项目接入自己的死信流程。[N7]
- 官方历史文档把“publication de-duplication + double-acknowledged consumption”列为 exactly-once QoS 模式；但现行文档的基本承诺仍是 at-least-once，且当前 worker 文档明确：若副作用已完成、进程在 ACK 前崩溃，消息会再次执行。因此本报告不把它写成端到端 exactly-once。[N8][N9]

#### 持久化、离线队列、重连与 replay（事实）

- stream 可选 File 或 Memory，retention 为 Limits/Interest/WorkQueue。Limits 在限额内保留消息，consumer ACK 不删除，适合日志；WorkQueue 在首次 ACK 后删除，适合工作队列。[N6]
- consumer 可从开头、最新、指定 sequence 或指定时间开始；多个独立 consumer 有各自游标。多个 worker 共享一个 pull consumer 可竞争处理持久消息，区别于 Core queue group 只分配在线消息。[N2][N9]
- JavaScript 客户端自动恢复订阅；断线期间的 reconnect buffer 是客户端内存中的 outbound queue，重连后 flush，**不会把 Core publish 变成持久确认写入**，也不负责恢复 JetStream consumer 游标。JS 默认重连次数为 10，长驻服务可配置 `MaxReconnect=-1`；初次连接等待另有 `waitOnFirstConnect`。[N12]
- R=1 是单点；R=3 才跨一台服务节点故障。官方还注明 File storage 不一定每次写入立即 fsync，OS crash 仍有窗口；一期单机验收不能据此推导高可用。[N10]

#### 去重窗口与限制（事实）

- `Nats-Msg-Id` 在 stream 的 duplicate window 内阻止重复写入，默认 **2 分钟**，重复 `PubAck` 返回原 sequence 和 `duplicate:true`。窗口后的相同 ID 可以再写一条。[N5][N6]
- 该去重不约束不同 `Nats-Msg-Id` 的相同业务内容，也不覆盖 consumer 外部副作用。`ackAck()` 可等待 server 确认 ACK，但不能让“中心数据库提交”和“broker ACK”自动成为同一事务。[N6][N9]

#### subject、queue group、header/auth（事实）

- subject 是点分 token；`*` 匹配一个 token，`>` 匹配末尾一个或多个 token，天然可容纳现有 `node.*`、`task.*` 类型名，但需先固定 type 与 subject 的完整映射。[N3]
- Core queue group 在同 subject 同组中随机选一个在线成员；不同组会各得一份，且不保证顺序或公平分配。持久任务应使用 JetStream 的共享 consumer。[N4][N9]
- header 是与 payload 分离的 key/value 元数据，大小写敏感，`Nats-` 前缀保留。认证支持 password/token/JWT、mTLS/NKey 等，授权可按 subject 限制 publish/subscribe，另有 auth callout。[N11][N13]

#### 进程、资源、许可证与 Node/TS（事实）

- 官方生态文档说明 `nats-server` 是单 binary，routing、JetStream、leaf node、MQTT、WebSocket 都由同一 binary 配置启用，无额外组件安装；JetStream 示例用 `nats-server -js`。官方监控面含 `:8222`、JetStream 状态及 Prometheus exporter。[N10][N14]
- server 是 Go 项目，不是 TS；官方 `nats.js` 是 Tier-1 JavaScript/TypeScript 客户端，Node transport 使用 TCP，npm 包要求 Node ≥22，提供 ESM/CJS。JetStream 模块同样提供 JS/TS API。[N14][N15][N16]
- server 与官方 JS client 都是 Apache-2.0。[N17][N18]

**适配推断**：JetStream 能接管本项目大部分“传输存储 + ACK + 重连后重投 + 有限发布去重”工作，且 subject/consumer 模型与 type 订阅接近；但注册/心跳语义、中心权威序号、超窗幂等、中心提交点与 poison-message 策略仍是项目协议。

### 3.2 RabbitMQ：普通 queue 与 Stream 分开看

#### 普通 queue（事实）

- 自动 ACK 在写入 socket 后即视为成功，连接失败可丢消息；手动 ACK 才允许在处理后确认。publisher confirm 只覆盖 publisher→broker，consumer ACK 只覆盖 broker→consumer，二者互不知晓。[R1][R2]
- 持久性必须同时选择 durable queue 和 persistent message；quorum queue 总是持久并复制，其 confirm 在 quorum 复制后发出。普通 queue 是破坏性消费，已处理消息被删除，不提供 stream 式重读。[R3][R4][R7]
- topic exchange 以 `.` 分段，`*` 匹配一段、`#` 匹配零或多段；同一 queue 多个活动消费者竞争消息，也可声明 Single Active Consumer。[R2][R5]
- AMQP 0-9-1 消息已有 `type`、`messageId`、`correlationId` 与任意 headers map，但这些 metadata **本身不形成通用去重承诺**。RabbitMQ 4.0 起 quorum delivery limit 默认 20，超限可 drop 或 dead-letter，需按所选版本配置。[R2][R4]

#### RabbitMQ Stream（事实）

- Stream 是始终持久、复制的 append-only log，采用非破坏性消费；可反复读取，并从 first/last/next/指定 offset/timestamp 附加，直到 retention 删除。full Stream Protocol 需要启用随发行版附带的 stream plugin。[R7][R8]
- publisher confirm 只覆盖发布到 broker；Stream Protocol 的 consumer credit 是按 chunk 的流控，offset tracking 是恢复游标，二者都不等于“业务处理已成功”的端到端 ACK。AMQP 0-9-1 访问 stream 时仍需 consumer ACK 作为 credit，但不能据此推出 exactly-once。[R7][R8][R16]
- 发布去重以 **producer name + publishingId** 为键。publishingId 必须严格递增（允许 gap），同名 producer 在同一 stream 不可并发，重启后名称要稳定。这是按 stream/producer 记录最高 ID 的**高水位机制，不是 NATS 式固定时间窗，也不是任意 UUID 查重表**：较小 ID 即使从未真正发布也可能因高水位而被过滤；不能据此推断任意事件 ID 的永久去重。[R7]
- effectively-once 模式把源 offset 当作结果 publishingId，使目标消息与恢复点一起写入；官方限制包括目标每步一次写、同名单活、结果按序且不跳过，且每 stream 最多 255 个 producer name。它只保证目标 stream 的效果，**不保证处理函数只执行一次，也不保护数据库或 HTTP 等外部副作用**。[R12]
- RabbitMQ 官方文档所链的 Node stream client README 同样提醒：offset 不能避免重复接收，客户端应用要去重，并建议发布侧考虑 outbox pattern。[R16]

#### 重连、header/auth、进程与客户端（事实）

- RabbitMQ 团队支持的 AMQP 1.0 客户端列表包含 JavaScript 客户端，统一客户端层声明 at-least-once、默认创建 durable entity 和 persistent message，并提供连接/拓扑恢复。JS 包有 `.d.ts`，面向 JS/TS，包声明 ISC。其 README 规定已建立连接可自动重连，但首次连接失败会直接 reject，应用需处理。RabbitMQ 同时提醒：连接中断时 publish 不会自动在客户端内部排队，未确认发布需按结果未知处理。[R6][R9][R10][R11][R13][R14]
- Stream 专用 Node 客户端也是 TypeScript、ISC，支持 offset、SAC、发布去重和连接重启；但官方 Stream plugin 客户端列表的 RabbitMQ Core Team 支持勾号没有给它，因此不能把“官方文档收录”写成“Core Team 官方支持”。[R8][R16][R17]
- server 需要 Erlang/OTP（generic binary 安装明确要求），server/core plugins 为 MPL-2.0。Stream 全量写入磁盘、I/O 较重；quorum 因一致性有额外延迟，不能忽略部署与磁盘告警运维。[R4][R7][R15][R18]
- 认证包括 username/password、JWT、X.509，授权覆盖 vhost、exchange、queue 等；所有协议支持 TLS。[R19][R20]

**适配推断**：quorum queue 能承托任务工作队列，但若需要重放必须另选 Stream 或自建历史。Stream 的单调 publishingId 与现有全局唯一 `event.id` 不是同一模型，且中心写历史库不属于 broker 的 effectively-once 保护范围。客户端支持级别应先纳入 PoC，而非只核查 broker 功能。

### 3.3 Redis Streams

#### 投递、ACK、持久化与恢复（事实）

- `XADD` 追加 field-value entry 并返回 `<ms>-<seq>` ID，stream 内 ID 全序。普通 `XREAD`/range 可重读；consumer group 用 `>` 只取未分配消息，组内成员分担消息。[D1][D2]
- `XREADGROUP` 把未确认投递放入 PEL（Pending Entries List，待处理条目表）；处理成功后 `XACK` 从 PEL 删除。崩溃后可从自己的 PEL 重读，`XAUTOCLAIM` 可把闲置超过阈值的 pending 转给另一 consumer，并增加 attempted-delivery 计数。[D2][D3][D4]
- `NOACK` 不入 PEL，适用于允许偶尔丢失的场景；因此可靠模式必须显式选择 ACK、恢复扫描和 claim 策略，而不是“用了 Streams 就自动可靠”。[D2]
- RDB 是定时快照，故障可丢最近数分钟；AOF 记录写操作，默认 `appendfsync everysec` 仍可能丢约 1 秒，`always` 更强但更慢。是否启用及如何组合是部署决策，不能把 `XADD` 返回 ID 等同于指定 fsync 级别的 durable commit。[D8]
- `node-redis` 自动重连，默认指数 backoff + jitter；断线时已发送命令会 reject，因为它们**可能已经执行**，未发送命令留在内存 offline queue。若需跨进程重启不丢未确认事件，仍需项目持久 outbox。[D7]

#### 去重窗口与限制（事实，Redis ≥8.6）

- `XADD ... IDMP producer-id idempotent-id *` 可用显式 UUID 做 producer 范围内的幂等 ID；重复时返回原 entry ID，不新增 entry。`IDMPAUTO` 则按 field-value 内容生成 iid。producer 重启后必须复用同一 pid，重试必须复用同一 `(pid,iid)`。[D5]
- 默认 `IDMP-DURATION=100s`、`IDMP-MAXSIZE=100`/producer；允许范围分别为 1–86400 秒和 1–10000。容量满时最旧 iid 无论剩余时长都会淘汰，因此短窗口与容量上限都要纳入恢复设计。[D5][D6]
- IDMP map 可随 RDB/AOF 跨重启恢复；但调用 `XCFGSET` 改 duration 或 maxsize 会清空该 key 的现有 map，配置变更不能当成无操作。[D5][D6]
- IDMP 是 **at-most-once production**，不消除 PEL 重投或业务副作用重复；仍需消费幂等。[D5]

#### topic、header/auth、客户端与许可证（事实）

- Redis Stream 的寻址单位是 key，consumer group 在 key 上工作；没有 NATS 式点分 subject/wildcard。可以按 type 分 key，或单 stream 后在应用按信封 `type` 过滤，但两种方案的全局顺序、消费者组与 backlog 代价需项目决定。[D1][D2]
- entry 只有 field-value pairs，没有独立 header 通道；可把完整事件 JSON 放在一个 field，或把传输 metadata 放独立 fields。Redis ACL 可限制 command 与 key pattern，Pub/Sub channel 权限是另一套；`node-redis` 支持 ACL username/password 和 TLS。[D1][D7][D9]
- `node-redis` 是官方 Node 客户端，文档提供 TypeScript 用法；server 是独立数据服务而不是 TS 进程。client 为 MIT。[D10][D11]
- Redis 8.0+ server 官方许可为 RSALv2、SSPLv1、AGPLv3 三选一；7.2 及以前是 BSD-3-Clause，7.4–7.8 是 RSALv2/SSPLv1。评估具体版本时不能笼统称“Redis 都是 BSD”。[D12]

**适配推断**：PEL、claim 与 IDMP 能显著减少自研工作，且 `event.id` 可直接作为 iid；但窗口短、按 key 的 ID/顺序、应用侧 type 过滤或多 key 拓扑，都需要比 NATS subject 更多的项目约定。中心长期去重仍必须独立保存。

### 3.4 Centrifugo：仅实时 UI 有补充价值

- 官方当前文档明确 PUB/SUB broker 是 at-most-once；history 是 size/TTL 有界的 ephemeral cache，**不是 durable message queue、不是权威 event log**，应用数据库必须始终是事实源。[C1]
- 自动恢复使用 `offset + epoch`，只有缺口完整且属于同一 stream 才返回 `recovered:true`，否则完整状态回源；恢复面向短时断线与 reconnect storm，不是长期离线 mailbox。即使恢复路径按位置去重，官方仍要求应用容忍偶发重复。[C1]
- `centrifuge-js` 支持 NodeJS、带 TypeScript declarations，Node 下要显式提供 `ws`；server 是 Go。server Apache-2.0，JS client MIT。[C2][C3][C4]
- 认证扩展包括 connection/subscription JWT；v6 客户端还支持 emulation headers（如 `Authorization`）和自定义连接数据，但这些是实时连接扩展点，不会增加持久消费 ACK。[C2]

**适配推断**：presence、短断线恢复和浏览器 SDK 对实时观测 UI 有明确价值；缺少本层所需的持久 worker queue 与处理 ACK，不进入 Gateway 主链候选。

### 3.5 `ws`、Socket.IO、NestJS WebSocket：传输/框架而非 broker

#### `ws`（事实与推断）

RFC 6455 定义的是 TCP 上的 opening handshake 与 message framing，ping/pong 是协议控制帧；没有定义 broker 的离线存储、消费 ACK、消息去重或订阅组。[W2] `ws` 官方 README 给出 Node client/server、升级时自定义认证、ping/pong 存活检测示例，但没有把这些扩展成可靠消息系统。[W1]

包是 Node JavaScript，MIT；当前 `package.json` 不随包提供 types，TypeScript 类型由 DefinitelyTyped 的 `@types/ws` 提供。[W1][W8]

**适配推断**：选它意味着注册、订阅、重连、离线发送/接收队列、序号、去重、持久化与恢复全部仍是项目自研，只替换不了任何可靠性工作。

#### Socket.IO（事实与推断）

- 默认 **at-most-once**：断线发送不保证到达且不会重试；client 可在重连前缓冲，server 不为断线 client 缓冲。[W3]
- client→server 可配置 `retries` + `ackTimeout` 直到收到应用 ACK，但刷新页面仍会丢 pending event。server→client 的 at-least-once 官方方案要求应用自己完成 unique ID、数据库持久化、client offset 与重连补发。[W3]
- connection state recovery 保存短期 session/rooms/data 与 packet offset，`recovered` 表明是否成功；官方强调不总会成功，仍需状态同步。内建 in-memory adapter 支持，普通 Redis PUB/SUB adapter 不支持 packet persistence。[W4]
- 认证/元数据可通过 handshake `auth`、query 或 Node.js `extraHeaders` 扩展；浏览器只走 WebSocket 时会忽略 `extraHeaders`，不能用同一套自定义 header 代码假设各端行为一致。[W3][W9]
- 有 first-class TypeScript 类型和 Node server/client，MIT；类型提示不替代运行时输入校验。[W5][W6]

**适配推断**：它能减少自动重连、房间和短期恢复代码，但服务端持久队列、长期事件历史、全局幂等与 competing worker 语义仍要自研。不能把“有 ACK callback/offset recovery”写成 broker 级可靠投递。

#### NestJS WebSocket（事实与推断）

Nest gateway 是 decorator/provider 抽象，内置支持 `socket.io` 与 `ws`，也可自定义 adapter；其 handler return/ACK 是应用 RPC 响应，不是持久消息确认。[W7]

**适配推断**：可靠性完全继承底层 adapter 与项目存储，NestJS 不是独立消息基础设施候选。

### 3.6 Temporal：不是本层消息 broker

- Temporal Task Queue 由 Worker 通过 RPC poll，承载 Workflow/Activity/Nexus task；Workflow/Activity task 可持久等待 Worker，Nexus/Query task 不持久。[T1]
- Activity 是由 Worker 执行的函数，可自动 retry，官方建议其实现幂等。Signal/Update/Query 是发往特定 Workflow 的消息，不是任意事件的 subject/topic 发布订阅。[T2]
- server 是 Go，官方 TypeScript SDK 支持 Node 20/22/24；server 与 SDK 均 MIT。[T3][T4]

**适配推断**：若把中心改成 Temporal Workflow、节点改成 Worker、事件改成 Signal，则是另一套执行与历史架构，会引入 Temporal 自己的 Event History，不是保留当前 Gateway 边界下的传输替换。因此本文不把 Temporal 与 broker 继续横向评分。

## 4. 与事件信封及中心 single writer 的适配边界

### 4.1 信封映射（事实 + 推断）

| 现有字段/语义 | 可复用的承载 | 必须项目自行保持的约定 |
|---|---|---|
| 完整 `{id,type,source,key,payload,ts}` | 各 broker 的 bytes/JSON body；NATS/Rabbit header 或 Redis field 只放传输 metadata | Envelope schema、版本、序列化、必填字段、未知 type 的 unmatched 行为；不能因 broker 有自己的 message 格式而分裂成第二种事件模型。 |
| `id` | NATS `Nats-Msg-Id=id`；Redis `IDMP(source,id)`；Rabbit 普通消息 `messageId=id` 仅 metadata；Rabbit Stream 需另映射为递增 publishingId | 全局还是 `(source,id)` 唯一、重试必须复用、同 ID 不同 payload 是拒绝还是告警、长期去重保存多久。broker 窗口不是权威去重记录。 |
| `type` | NATS subject、Rabbit routing key 可直接映射点分 type；Redis 选择 stream key 或 body 过滤 | 通配符差异（NATS `>` vs Rabbit `#`）、type 是否含角色/节点段、订阅拓扑、权限和未知类型。 |
| `source` | 认证身份之外的 envelope 字段；Redis IDMP 可作 pid | 认证账号与逻辑角色/机器身份如何绑定，伪造 source 是否允许，producer pid 如何稳定跨重启。 |
| `key` | Rabbit correlationId 或自定义 header 可辅助；body 仍是权威 | correlation key 的 graph 匹配语义完全由项目实现，broker 不理解。 |
| `ts` | broker 可另有到达时间/sequence/offset | `ts` 是生产者时间还是中心受理时间，时钟偏差如何处理；不能用 broker sequence 反推业务发生时间。 |
| 消息序号 | NATS stream sequence、Rabbit Stream offset、Redis entry ID 可作**各自范围内**游标 | 中心权威序号是否唯一全局、跨 stream/key 如何排序、序号在中心受理还是发布时分配、重试/重投是否允许乱序。普通 Rabbit delivery tag 仅 channel 范围，不能当全局事件序号。[R1] |

### 4.2 中心 single writer 不能被 broker 取代（推断）

1. **职责分离**：broker 的持久 stream/queue 是传输日志或离线缓冲；中心的权威事件历史是业务事实与 graph 重放依据。即使同一消息被 broker 保存，也不表示中心已受理。
2. **写入路径保持单向**：节点只发布事件；只有中心校验、去重并追加权威历史。不得让节点直接写 broker 的“权威历史副本”，也不得把 broker replay 当成 graph 的完整历史，除非另行证明 retention、语义与恢复边界完全一致。
3. **区分不同确认语义**：JetStream `PubAck` 只表示消息已存入 stream；consumer ACK 只表示某个消费者已确认一次投递。中心何时追加权威事件历史，以及节点何时产生 `task.result` 事件，是各自独立的产品行为，不能由前两者冒充。中心数据库提交与 consumer ACK 的先后顺序、结果通知方式仍由项目协议决定。
4. **中心受理顺序**：若先中心 DB commit 后 consumer ACK，崩溃会造成 broker 重投，中心 inbox 必须去重；若先 ACK 后 commit，崩溃可能永久丢失。这个原子性缺口没有候选能靠配置自动补齐。
5. **出站同样存在双写**：中心“写历史 + 发派工事件”若需要原子性，需要 outbox/重放恢复策略；RabbitMQ Stream effectively-once 明确不覆盖数据库副作用。[R12]
6. **retention 不是历史保留期**：JetStream Limits/WorkQueue、Rabbit queue/stream、Redis trim/PEL 都有各自删除条件。中心历史应独立设定备份与保留策略，broker 只承诺其配置范围内可 replay。

### 4.3 注册、心跳与同宿主真实协议（推断）

- NATS PING/PONG、RabbitMQ heartbeat、WebSocket ping/pong、Redis keepalive 只说明连接活性，不等于“某逻辑节点已注册且可接任务”。`node.register`、节点能力、机器身份、会话世代（session epoch）、心跳间隔、超时、下线与旧连接 fencing 仍是项目领域协议。
- 同宿主角色使用真实 NATS/AMQP/RESP/WebSocket 到独立进程，可满足“没有直接方法调用”的技术形态；但是否还需统一的项目握手、注册回执和协议版本协商，必须在一期验收协议中明确。
- 自动重连只恢复连接/订阅。恢复后使用哪个 durable consumer/queue、从哪个 cursor replay、如何补发未确认 outbound、如何避免旧节点身份重复注册，仍由适配层协调。

## 5. 明确不能由框架自动决定的问题

以下是**项目待决清单**，不是候选产品已有答案：

1. **投递目标**：允许丢失的通知、必须最终受理的领域事件、只需一个 worker 执行的任务，是否分流到不同 subject/queue/stream 与 retention。
2. **端到端保证**：RPO（可接受丢失多少）、最长离线与重试时间、允许重复的成本；不要只写“exactly-once”。
3. **ID 与去重**：唯一性作用域、稳定 producer ID、碰撞处理、消费去重存储位置与保留期；保留期必须覆盖最大重连/replay 间隔，而非照搬 NATS 2 分钟或 Redis 100 秒默认值。
4. **ACK 点**：何时算收到、持久受理、graph 副作用完成；consumer ACK 与中心 DB commit 的顺序、ACK 丢失后的处理。
5. **顺序**：全系统总序还是 per-key/per-graph 顺序；跨并发 publisher、跨 stream、redelivery 的排序规则；中心序号由谁分配。
6. **订阅模型**：每类消费者独立 fan-out，还是同组竞争；中心是否 Single Active Consumer；任务按能力/机器如何路由，queue group 不能替业务调度做能力选择。
7. **重连恢复**：durable consumer/queue 名称、last-acked 与 last-processed cursor 的持久化、首次订阅起点、长离线后的全量对齐方式。
8. **生产者离线**：是否接受客户端内存 reconnect buffer 的风险；若不接受，outbox 存在哪、如何崩溃恢复、如何标记“结果未知”。
9. **失败策略**：AckWait/heartbeat/timeout、backoff、最大投递次数、poison message、DLQ/人工介入与告警；JetStream 没有内建 DLQ 这一事实不能忽略。[N7]
10. **注册与在线语义**：机器 ID、连接 session ID、世代、重复连接、旧连接 fencing、能力与槽位；broker 的在线连接表不是节点注册表。
11. **安全**：每角色认证、publish/subscribe 权限、TLS、token 下发与轮换、header 中允许放什么；不能因 localhost 一期就默认永久无鉴权。
12. **权威历史**：中心 single writer 如何防双中心、broker 日志与中心历史如何区分、备份/迁移/重放和 unmatched 如何查询。
13. **兼容与演进**：Envelope/schema 版本、broker/client 版本 pinning、Redis ≥8.6 才可使用 IDMP、Rabbit 普通 queue 与 Stream client 支持差异。
14. **一期运维形态**：独立进程如何被现有 Gateway 控制 UI 启停和识别、数据目录、健康检查、磁盘上限、重启恢复；一期单机不自动获得 broker 集群容错。
15. **验收故障矩阵**：同宿主强制真实网络路径、发布 ACK 丢失、消费后 ACK 前崩溃、DB commit 后 ACK 前崩溃、长离线、超去重窗口、重复注册、磁盘写满与 broker 重启。

## 6. 来源列表

> 以下来源均为官方文档、官方源码或正式规范；**全部访问于 2026-11-13**。`main/master/unstable` 链接表示访问当日内容，落地实现时应固定版本重新核对。N8 是用于说明历史“exactly-once”措辞的官方历史提交，不冒充当前承诺。

### NATS

- **[N1]** NATS, *Core NATS Deep Dive*（at-most-once、无 queue/storage/ACK）：https://docs.nats.io/learn/core-nats/
- **[N2]** NATS, *JetStream Concepts*（at-least-once、stream/consumer、replay 起点）：https://docs.nats.io/concepts/jetstream
- **[N3]** NATS, *Subjects & wildcards*：https://docs.nats.io/learn/core-nats/subjects-and-wildcards.md
- **[N4]** NATS, *Queue groups*：https://docs.nats.io/learn/core-nats/queue-groups.md
- **[N5]** NATS, *JetStream Publishing*（PubAck、未知写入结果、Msg-Id）：https://docs.nats.io/learn/jetstream/publishing.md
- **[N6]** NATS, *Your first stream* 与 *Retention policies*（File/Memory、默认 2 分钟、Limits/WorkQueue、ackAck）：https://docs.nats.io/learn/jetstream/your-first-stream.md ；https://docs.nats.io/learn/jetstream/retention-policies.md
- **[N7]** NATS, *Ack responses and redelivery*（ACK 层、AckWait、MaxDeliver、无内建 DLQ）：https://docs.nats.io/learn/jetstream/acknowledgment.md
- **[N8]** NATS 官方历史文档提交，*Developing with JetStream*（历史 exactly-once 模式措辞）：https://raw.githubusercontent.com/nats-io/nats.docs/f115becf6563e3bbe16bb94cbf87bfceb84199c1/using-nats/jetstream/develop_jetstream.md
- **[N9]** NATS, *Scaling a consumer*（共享 pull consumer、崩溃重复副作用）：https://docs.nats.io/learn/jetstream/worker-pool.md
- **[N10]** NATS, *Surviving node loss*（R=1/R=3、File fsync 限制、约 3 倍副本成本）：https://docs.nats.io/learn/jetstream/surviving-node-loss.md
- **[N11]** NATS, *Message headers*：https://docs.nats.io/learn/core-nats/headers.md
- **[N12]** NATS, *Reconnection*（订阅恢复、内存 reconnect buffer、JS 重连默认值）：https://docs.nats.io/learn/resilient-clients/reconnection.md
- **[N13]** NATS, *Security Deep Dive*（authn/authz/TLS/subject 权限）：https://docs.nats.io/learn/security.md
- **[N14]** NATS, *Ecosystem*（单 binary、Tier-1 JS/TS）：https://docs.nats.io/concepts/ecosystem.md
- **[N15]** 官方 `nats.js` README 与 JetStream README（运行时、Node ≥22、JS/TS API）：https://raw.githubusercontent.com/nats-io/nats.js/main/README.md ；https://raw.githubusercontent.com/nats-io/nats.js/main/jetstream/README.md
- **[N16]** 官方 Node transport README 与 server `go.mod`（Node TCP、Go server）：https://raw.githubusercontent.com/nats-io/nats.js/main/transport-node/README.md ；https://raw.githubusercontent.com/nats-io/nats-server/main/go.mod
- **[N17]** NATS server Apache-2.0 LICENSE：https://raw.githubusercontent.com/nats-io/nats-server/main/LICENSE
- **[N18]** NATS.js Apache-2.0 LICENSE：https://raw.githubusercontent.com/nats-io/nats.js/main/LICENSE

### RabbitMQ

- **[R1]** RabbitMQ, *Consumer Acknowledgements and Publisher Confirms*（两层 ACK、自动 ACK 风险、delivery tag 范围）：https://www.rabbitmq.com/docs/confirms
- **[R2]** RabbitMQ, *Consumers*（手动/自动 ACK、竞争消费、SAC、metadata）：https://www.rabbitmq.com/docs/consumers
- **[R3]** RabbitMQ, *Queues*（durable + persistent、queue 生命周期）：https://www.rabbitmq.com/docs/queues
- **[R4]** RabbitMQ, *Quorum Queues*（复制、confirm、delivery limit、资源权衡）：https://www.rabbitmq.com/docs/quorum-queues
- **[R5]** RabbitMQ, *Exchanges*（direct/fanout/topic/headers、`*`/`#`）：https://www.rabbitmq.com/docs/exchanges
- **[R6]** RabbitMQ, *AMQP 1.0 Client Libraries*（统一 at-least-once、恢复、JS 客户端）：https://www.rabbitmq.com/client-libraries/amqp-client-libraries
- **[R7]** RabbitMQ, *Streams and Superstreams*（非破坏性 log、offset、retention、发布去重）：https://www.rabbitmq.com/docs/streams
- **[R8]** RabbitMQ, *Stream Plugin*（启用、客户端支持勾号、heartbeat/TLS）：https://www.rabbitmq.com/docs/stream
- **[R9]** RabbitMQ, *Publishers*（publisher confirm、连接中断无内部 enqueue）：https://www.rabbitmq.com/docs/publishers
- **[R10]** RabbitMQ, *Connections*（长连接、恢复依客户端、TLS）：https://www.rabbitmq.com/docs/connections
- **[R11]** RabbitMQ, *Clients Libraries and Developer Tools*（AMQP 1.0 推荐与 JS/Node 列表）：https://www.rabbitmq.com/client-libraries/devtools
- **[R12]** RabbitMQ, *Effectively-Once Stream Processing*（目标 stream 边界、外部副作用与 255 producer 限制）：https://www.rabbitmq.com/docs/stream-effectively-once-processing
- **[R13]** 官方 AMQP 1.0 JavaScript client README 与 `package.json`（重连、JS/TS、ISC）：https://raw.githubusercontent.com/coders51/rabbitmq-amqp-js-client/main/README.md ；https://raw.githubusercontent.com/coders51/rabbitmq-amqp-js-client/main/package.json
- **[R14]** RabbitMQ server LICENSE（MPL-2.0）：https://raw.githubusercontent.com/rabbitmq/rabbitmq-server/main/LICENSE
- **[R15]** RabbitMQ, *Generic Binary Build*（Erlang/OTP 与进程/文件描述符）：https://www.rabbitmq.com/docs/install-generic-unix
- **[R16]** 官方文档所链 `rabbitmq-stream-js-client` README 与 LICENSE（TS、重复接收、outbox、ISC）：https://raw.githubusercontent.com/coders51/rabbitmq-stream-js-client/main/README.md ；https://raw.githubusercontent.com/coders51/rabbitmq-stream-js-client/main/LICENSE
- **[R17]** `rabbitmq-stream-js-client/package.json`（JS/TS 与构建信息）：https://raw.githubusercontent.com/coders51/rabbitmq-stream-js-client/main/package.json
- **[R18]** RabbitMQ server MPL-2.0 正文：https://raw.githubusercontent.com/rabbitmq/rabbitmq-server/main/LICENSE-MPL-RabbitMQ
- **[R19]** RabbitMQ, *Authentication, Authorisation, Access Control*：https://www.rabbitmq.com/docs/access-control
- **[R20]** RabbitMQ, *Connections — TLS*：https://www.rabbitmq.com/docs/connections#tls

### Redis Streams 与 node-redis

- **[D1]** Redis, *Streams* 与 *XADD*（append-only、field-value、ID 全序）：https://redis.io/docs/latest/develop/data-types/streams/ ；https://redis.io/docs/latest/commands/xadd/
- **[D2]** Redis, *XREADGROUP*（组、PEL、ACK、恢复、NOACK）：https://redis.io/docs/latest/commands/xreadgroup/
- **[D3]** Redis, *XAUTOCLAIM*（闲置接管与 attempted deliveries）：https://redis.io/docs/latest/commands/xautoclaim/
- **[D4]** Redis, *XACK*（processed at least once、PEL 删除）：https://redis.io/docs/latest/commands/xack/
- **[D5]** Redis, *Idempotent message processing*（8.6 IDMP、默认窗口/容量、持久化与清 map 注意事项）：https://redis.io/docs/latest/develop/data-types/streams/idempotency/
- **[D6]** Redis, *XCFGSET*（窗口范围、容量淘汰与配置清空）：https://redis.io/docs/latest/commands/xcfgset/
- **[D7]** 官方 `node-redis` client configuration 与 FAQ（重连、offline queue、未知执行结果、TLS/ACL）：https://raw.githubusercontent.com/redis/node-redis/master/docs/client-configuration.md ；https://raw.githubusercontent.com/redis/node-redis/master/docs/FAQ.md
- **[D8]** Redis, *Persistence*（RDB/AOF、everysec/always）：https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/
- **[D9]** Redis, *ACL*（command/key/channel 权限）：https://redis.io/docs/latest/operate/oss_and_stack/management/security/acl/
- **[D10]** 官方 `node-redis` README（Node/TS 客户端）：https://raw.githubusercontent.com/redis/node-redis/master/README.md
- **[D11]** `node-redis` MIT LICENSE：https://raw.githubusercontent.com/redis/node-redis/master/LICENSE
- **[D12]** Redis server LICENSE 与官方 README（8.x 三许可及历史版本）：https://raw.githubusercontent.com/redis/redis/unstable/LICENSE.txt ；https://raw.githubusercontent.com/redis/redis/unstable/README.md

### Centrifugo

- **[C1]** Centrifugo 官方文档源码，*Stream history and recovery*（at-most-once、短期缓存、非 durable queue、重复容忍）：https://raw.githubusercontent.com/centrifugal/centrifugal.dev/main/docs/server/history_and_recovery.md
- **[C2]** 官方 `centrifuge-js` README 与 `package.json`（Node、TS declarations、`ws`）：https://raw.githubusercontent.com/centrifugal/centrifuge-js/master/README.md ；https://raw.githubusercontent.com/centrifugal/centrifuge-js/master/package.json
- **[C3]** Centrifugo server Apache-2.0 LICENSE 与 `go.mod`：https://raw.githubusercontent.com/centrifugal/centrifugo/master/LICENSE ；https://raw.githubusercontent.com/centrifugal/centrifugo/master/go.mod
- **[C4]** `centrifuge-js` MIT LICENSE：https://raw.githubusercontent.com/centrifugal/centrifuge-js/master/LICENSE

### WebSocket / Socket.IO / NestJS

- **[W1]** 官方 `ws` README 与 `package.json`（Node、认证、ping/pong、MIT、包内容）：https://raw.githubusercontent.com/websockets/ws/master/README.md ；https://raw.githubusercontent.com/websockets/ws/master/package.json
- **[W2]** IETF RFC 6455, *The WebSocket Protocol*（握手、framing、ping/pong）：https://www.rfc-editor.org/rfc/rfc6455
- **[W3]** Socket.IO, *Delivery guarantees*（默认 at-most-once、应用层 at-least-once）：https://socket.io/docs/v4/delivery-guarantees/
- **[W4]** Socket.IO, *Connection state recovery*（短期 offset 恢复及失败条件）：https://socket.io/docs/v4/connection-state-recovery
- **[W5]** Socket.IO, *TypeScript*：https://socket.io/docs/v4/typescript/
- **[W6]** Socket.IO MIT LICENSE：https://raw.githubusercontent.com/socketio/socket.io/main/LICENSE
- **[W7]** NestJS, *Gateways* 与 *Adapters*（`socket.io`/`ws`、应用 ACK、adapter 边界）：https://docs.nestjs.com/websockets/gateways.md ；https://docs.nestjs.com/websockets/adapter.md
- **[W8]** DefinitelyTyped 官方 `@types/ws` 包（TS 类型来源）：https://raw.githubusercontent.com/DefinitelyTyped/DefinitelyTyped/master/types/ws/package.json
- **[W9]** Socket.IO, *Client options*（`extraHeaders` 的 Node/浏览器差异、query、transport）：https://socket.io/docs/v4/client-options/
- **[W10]** NestJS MIT LICENSE：https://raw.githubusercontent.com/nestjs/nest/master/LICENSE

### Temporal

- **[T1]** Temporal, *Task Queues*（Worker poll、task 类型与持久性）：https://docs.temporal.io/task-queue
- **[T2]** Temporal, *Activities* 与 *Workflow Message Passing*（Activity 幂等、Signal/Update/Query）：https://docs.temporal.io/activities ；https://docs.temporal.io/encyclopedia/workflow-message-passing
- **[T3]** 官方 Temporal TypeScript SDK README 与 LICENSE（Node 20/22/24、MIT）：https://raw.githubusercontent.com/temporalio/sdk-typescript/main/README.md ；https://raw.githubusercontent.com/temporalio/sdk-typescript/main/LICENSE
- **[T4]** Temporal server `go.mod` 与 MIT LICENSE：https://raw.githubusercontent.com/temporalio/temporal/main/go.mod ；https://raw.githubusercontent.com/temporalio/temporal/main/LICENSE
