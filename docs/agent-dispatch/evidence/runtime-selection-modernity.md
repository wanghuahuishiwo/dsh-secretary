# agent-dispatch 运行时选择现代性复审

> 状态：只读调研证据与适配建议，不代替后续架构决策。
>
> 截止日期与所有外部 URL 访问日期：**2026-11-14**。
>
> 项目边界：一期是单机双进程——独立 Gateway 进程与同宿主的中心/节点 DSH 插件；未来再拆双机并评估多用户隔离。本文只复审运行时基础设施，不展开执行语义。
>
> 方法：只采用官方文档、官方 release/API、正式治理组织公告和署名案例。**事实**与**推断**分开；厂商案例只说明“存在这种实践”，不转换成市场排名或通用 benchmark。重点核查 2024–2026 演进，但不把年龄当淘汰理由，也不把新当优势。
>
> “重量”指进程、外部 runtime、持久状态、配置/升级面与项目自有代码量。官方没有同版本、同 OS、同负载的可比 idle RAM/CPU 数据，本文不编造 MB 排名；这部分定量结论标为**证据不足**，需本机 PoC 测量。

## 1. 结论摘要

1. **核心方向无需改选。**独立 `nats-server` + JetStream、NATS Services 在线发现、原生 `nats://` 本机 / `tls://` 远程、File/Limits、显式 subjects、durable consumers，以及一期不加 Consul/etcd，都有当前官方能力、持续 release 和适配依据。[N1][N3][N6][N7][N8][N9][N10][N11]
2. **唯一需要降级的是“永远单个 stream”这一硬约束，而不是 File/Limits 本身。**一期继续以一个 File/Limits stream 作为最小默认是合理的；但 stream 数量应是隔离、保留和扩展策略，不应成为永久不变量。未来出现真实 account、安全、retention、配额或独立扩展边界时，在同一个 NATS 内拆 stream，比换 broker 更直接。[N9][N10][N13][N14]
3. **`ws/wss` 保持按需可选，不因“现代 Web”而取代原生 TCP。**NATS 当前官方明确建议：没有浏览器或 HTTP-only 中间层时继续使用 `nats://`，因为少一个活动部件并避免 WebSocket framing 开销。中心/节点都是 Node 客户端，原生 TCP transport 正是官方 Tier 1 路径。[N2][N3][N7][N8]
4. **RabbitMQ、Redis Streams、Socket.IO、Centrifugo 都仍活跃，继续不选是职责/运维适配，不是淘汰。**RabbitMQ 有 2026 年 4.4，Redis 有 8.10.3，Socket.IO 有 4.8.4，Centrifugo 有 6.10.3；但前两者增加本项目不需要的适配/运维，后两者不提供本层所需的持久消费语义。[R1][D1][S1][C1][S2][C3]
5. **双机不等于高可用。**一期 R=1 File stream 可跨进程重启恢复，但仍是单点；把中心和节点拆到两台机器、仍只有一个 Gateway，并不会自动获得 JetStream 容错。若以后确有 HA 需求，R=3 是另一项需要三个 server 故障域的决策，不应在一期偷偷堆入。[N14]
6. **当前基线不依赖 RC 或实验功能。**NATS 2.15.3 是正式 release，2.14 仍维护；但一期不需要 fast ingest、message schedules、consumer reset 等新能力。Redis 8.6 IDMP 已 GA，却仍较新且有窗口/容量边界，不构成换型理由。[N1][N2][D1][D3]

## 2. 逐项 verdict

> “继续不选”表示保留此前的不选结论，不表示候选项目过时或低质量。

| 复审项 | Verdict | 近年活跃度与运行时重量 | 是否有更轻或更主流的现代替代 |
|---|---|---|---|
| 独立 `nats-server` + JetStream | **保留** | 2025–2026 连续 minor releases，2026-11-11 有 2.15.3 正式 patch；同一 Go binary 启用 Core/JetStream，增加磁盘、配置、备份与升级责任，无 Erlang/独立 JS server。[N1][N3][N9] | 没有同时更轻、保留同级持久语义、官方 Node TCP 客户端并覆盖在线发现的直接替代。自研 socket 只是把可靠性和恢复代码移回项目。 |
| NATS Services 在线发现 | **保留** | 当前 2.15 文档与 nats.js 3.4.0 模块仍一等支持；客户端库与 `$SRV` request/reply，无额外进程。[N2][N6] | 自研心跳/目录没有更轻；Consul/etcd 是更多持久目录能力，也带来更多进程与状态。仅限在线发现，不能冒充持久注册中心。 |
| 本机 `nats://` / 远程 `tls://` | **保留** | 官方 Tier 1 Node native TCP transport；远程 TLS 是正式配置，无额外代理。[N3][N7][N8] | `ws/wss` 只在浏览器或 HTTP-only LB/CDN/proxy 约束下更适配，不是普遍更现代或更安全的替代。[N7] |
| `ws/wss` | **降为可选** | 同一 `nats-server` 可增加 listener，功能仍活跃；但增加 framing、Origin、proxy 和证书/广告地址运维。[N3][N7] | 默认就是原生 TCP；出现明确网络/浏览器约束时再启用，不换 broker。 |
| 单个 File/Limits stream | **“单个”降为可选；File/Limits 保留** | File/Limits 是当前正式 API 与默认日志语义；单 stream 少元数据，但共享磁盘、retention 和故障域。每 stream 还有文件描述符与状态成本。[N9][N10][N15] | 更现代的替代不是另一产品，而是同一 NATS 内按真实隔离/保留/扩展边界拆 stream；一期无需按事件类型预拆。 |
| 显式精确 subjects 列表 | **保留** | 当前 Create Stream API 原生支持字符串列表；2.15.3 仍在优化单/多 subject filter 的 filestore 路径。只有配置和契约同步成本，无新增进程。[N1][N9][N12] | 受限命名空间 wildcard 是官方同等支持的备选，适合高 churn；它不是更先进的普遍替代。不要用裸 `>`，ACL 也不必机械照搬逐事件列表。[N12][N13] |
| durable consumers | **保留** | 当前官方仍把 named durable consumer 定义为服务端持久游标，客户端断连/重启后续接；增加 consumer 状态、磁盘和 lag 观测，无新增进程。[N11] | ephemeral/短期 reader 只适合不需要跨重启恢复的位置；Core queue group 不提供同样的持久游标，不能替代。 |
| 一期不加 Consul/etcd/独立注册中心 | **保留** | 两者 2026 仍活跃，但 Consul 是独立 catalog/health 控制面，etcd 是一致性 KV；接入后至少增加一个有状态进程，HA 还要更多成员，且消息平面仍须保留。[G1][E1][E2] | 当前“NATS 在线发现 + 中心持久目录”已覆盖需求且新增进程为零。出现跨系统共享 catalog、复杂健康检查或多写者一致性需求时再评估。 |
| 不选 RabbitMQ | **继续不选** | 2024–2026 从 4.0 演进到 4.4，queues/streams 都活跃；generic Unix 仍需 Erlang/OTP，拓扑、磁盘、FD 和升级面大于本项目最小需求。[R1][R2][R3] | 若组织已有 RabbitMQ 运维或必须兼容 AMQP，可重评；没有这些条件时，换入它不会减少代码或进程。 |
| 不选 Redis Streams | **继续不选** | 2026 有 8.6 GA 与 8.10.3，Streams IDMP 仍在演进；单服务进程不自动等于更轻，还要管理 AOF/RDB、trim/PEL 和 key 级寻址适配。[D1][D2][D4] | 已有 Redis 且接受 key/consumer-group 模型时可作备选；本项目没有既有 Redis，NATS subjects/Services 更贴合。 |
| 不选 Socket.IO | **继续不选** | 2024–2026 持续 4.8.x；库本身轻且 JS 生态常用，但可靠投递所需数据库、ID、offset、补发与恢复由项目自研。[S1][S2] | 在线 UI 双向通信很合适；作为本层替代只是少写连接代码、增加可靠性代码，不是更轻的完整方案。 |
| 不选 Centrifugo | **继续不选** | v6 自 2025 演进至 2026 的 6.10.3；独立 Go server，面向在线用户 PUB/SUB。history/recovery 是有界缓存，不是 durable queue 或权威 event log。[C1][C2][C3] | 未来实时观测 UI 可另评；不能替换当前持久 Gateway。 |

**本轮没有“改选”项。**“跨产品 idle RAM/CPU 谁更低”为**证据不足**，不影响上述基于部署形态与职责的证据充分判断。

## 3. 2024–2026 活跃度、官方定位与采用证据

| 项目 | 近年 release / 演进事实 | 官方定位与生产采用证据边界 | 部署与运维重量判断（推断） |
|---|---|---|---|
| **NATS / JetStream** | 2.11（2025-03-19）、2.12（2025-09-22）、2.14（2026-04-30）、2.15（2026-09-17）；2.15.3 于 2026-11-11 正式发布，2.14 仍维护，2.12/2.11 已 EOL。nats.js 3.4.0 于 2026-05-08 正式 release，npm 的 Node/JetStream/Services 模块同为 3.4.0。[N1][N2] | CNCF 于 2026-11-10 宣布 NATS Graduated。Vitrifi 2025 署名案例实际使用 JetStream、KV、跨云/私有数据中心，并以最小部署足迹为目标；Sophotech 2025 案例说明存在 RabbitMQ→NATS 迁移，但其性能数字不能外推。[N4][N5] | **小到中：**一个 Go binary 同时提供 Core/JetStream/WebSocket，官方 release 包为数 MB 级；JetStream 增加磁盘、限额、监控、备份和版本升级。R=1 无 HA，不附带集群成本。[N1][N3][N14][N15] |
| **RabbitMQ** | 4.0 于 2024-09，4.1 于 2025-04，4.2 于 2025-10，4.3 于 2026-04，4.4.0 于 2026-10；官方 release information 显示持续 patch 与支持周期。[R1] | 官方同时定位 messaging 与 streaming；Streams 是持久复制的 append-only log，与普通 queue 不是同一消费模型。本文不采用 logo 或 NATS 方迁移案例给双方排市场名次。[R1][R3] | **中到大：**generic Unix 包要求支持的 Erlang/OTP，另有 broker 配置、FD、磁盘、插件/协议与升级管理。Streams 还涉及 replication/retention；不是单机桌面最轻默认。[R2][R3] |
| **Redis Streams** | 8.6.0 于 2026-02-10 GA，新增 Streams `IDMP/IDMPAUTO`；8.10.3 于 2026-10-26 发布且含安全修复，说明项目仍活跃。[D1] | 官方把 Streams 定位为 append-only log 数据结构，不是独立 broker 产品。Redis 整体采用不能换算成 Streams 作为可靠事件通道的采用量。[D2] | **中：**一个 Redis 数据服务，但持久性取决于 RDB/AOF 策略，AOF rewrite 还可能 fork；还需 key/group、trim、PEL、ACL 和恢复设计。与 NATS 比 idle RAM 无同口径证据。[D4] |
| **Socket.IO** | 4.8.0/4.8.1（2024）、4.8.2/4.8.3（2025）、4.8.4（2026-09-25），当前仍维护。[S1] | 官方定位双向低延迟通信；changelog 的 version usage 是 npm downloads，不是独立生产应用数，更不能证明 broker 能力。[S1] | **初始小、完整方案自研重：**Node 库和应用服务即可起步；但 server 端离线缓冲、持久化、事件 ID、offset 与补发不属于库。[S2] |
| **Centrifugo** | v6.0.0 于 2025-01-16，v6.10.3 于 2026-11-08，配置、SDK、恢复与异步消费持续演进。[C1] | 官方明确是 **user-facing PUB/SUB server**，覆盖 WebSocket/SSE/WebTransport 等在线用户连接。这个定位有实际实时 UI 价值，但不是可靠后台消息通道的采用证明。[C1][C2] | **中：**独立 Go server；扩展时可接 Redis/NATS/PostgreSQL 等 broker。官方要求应用数据库始终是事实源，history 是有界短期缓存。[C3] |
| **Consul** | 当前 latest release API 为 2.1.0（2026-10-22），仍是活跃控制面项目。[G1] | 官方提供注册、catalog、health checks、DNS/HTTP discovery；当前多租户管理入口标为 Enterprise。它的成熟度不能替本项目证明“还需要再跑一个注册中心”。[G1] | **中到大：**至少新增 agent/server 与持久 catalog/ACL/健康检查；生产集群另有 Raft/bootstrap 与升级，消息 Gateway 仍保留。[G1] |
| **etcd** | 当前 latest release 为 3.7.3（2026-10-22）；官网另有 3.8-DRAFT，不能把 draft 当 released 能力。[E1] | 官方定位 consistent distributed KV，用于配置、服务发现和分布式协调，并列出 Kubernetes 等生产用途；同时明确 Consul 才是端到端 service discovery framework，etcd 不具备同样完整功能。[E2] | **中到大：**至少新增一致性 KV 与磁盘/quota/备份运维；一成员容错为 0，三成员才容忍一个成员故障。消息平面仍需另存。[E2] |

### 采用度结论的使用限制

- **可以说的：**NATS 有最新 CNCF Graduated、公开治理背景和可指名的 JetStream 生产案例；其余项目也有持续 release 与各自官方场景。[N4][N5]
- **不能说的：**“NATS/RabbitMQ/Redis/Socket.IO/Centrifugo 中谁是行业第一”。本次没有找到覆盖这些不同类别、以活跃生产部署为分母的统一官方排名。
- **不用于决策的替代指标：**stars、npm downloads、整项目企业数、厂商迁移案例中的性能数字。Redis 的总采用不能归给 Streams，Socket.IO 的下载不能归给可靠 broker，Centrifugo 的在线 UI 采用不能归给持久消费。
- **因此：**本轮以“当前活跃轨迹 + 官方职责 + 运维形态 + 项目适配”作判断，而不是用宣传材料证明保留或淘汰。

## 4. 核心选择逐项证据与适配分析

### 4.1 独立 `nats-server` + JetStream

**Verdict：保留。**

**事实：**

- 官方生态文档明确：clustering、JetStream、leaf nodes、MQTT、WebSocket 都由同一个 `nats-server` 通过配置启用，没有单独组件要安装；JetStream 示例以 `nats-server -js` 启动。[N3][N9]
- 当前 release 线仍高频维护，2.15.3 的非 prerelease patch 同时包含 filestore subject matching、consumer redelivery 与恢复修复，说明本项目依赖的核心路径仍在活跃维护，而非仅开发周边功能。[N1]
- JavaScript/TypeScript 是官方 Tier 1 客户端；`@nats-io/transport-node` 实现 Node native TCP，JetStream 与 Services 是独立官方模块。[N2][N3][N8]
- 单机 R=1 没有容错；File 表示重启后可读回磁盘副本，但官方也提醒 File 并非每次写入都立即 sync。R=3 需要真实三 server 集群。[N14]

**推断：**

- 独立进程不是“过重历史形态”，而是本项目的明确协议边界：同宿主也走真实 NATS，未来拆机只换地址；内嵌 Node broker 反而不是官方提供的主流路径。
- 对单机桌面，成本主要是**多一个进程 + 一个持久目录 + 配置/健康/升级**，不是引入一套 Kubernetes 集群。官方生产文档中的三节点/R=3 不应机械套成一期门槛。[N14][N15]
- 更轻的自研 WebSocket/IPC 只是在进程数上看似减少，持久化、ACK、重投、恢复、权限和客户端维护会回到项目内；没有证据表明其总拥有成本更低。
- 一期需明确接受 R=1 单点，并配置 `store_dir`、`max_file_store` 与 stream 限额。官方 sizing 文档指出 file storage 默认会按可用磁盘比例取上限，不能把它当作已经设好的桌面安全配额。[N15]

### 4.2 NATS Services 在线发现

**Verdict：保留，但只承担在线发现。**

**事实：**

- Services framework 自动提供 `$SRV.PING/INFO/STATS`。发现是 broadcast：调用方要在短 deadline 内收集所有当前 responders，取第一条会漏实例。[N6]
- 每个 running copy 获得新生成的 service ID；官方明确“不需要在任何地方注册实例”，停止时退订 discovery subjects。Services 本身是 at-most-once request/reply，持久状态应放到其他存储。[N6]
- 当前官方 nats.js Services 模块与 Core/JetStream 同属 3.4.0 正式包，不是第三方插件或独立注册中心进程。[N2][N6]

**推断：**

- 它正好覆盖“只配置 Gateway 地址、发现当前在线角色”的薄层需求，新增运行时成本主要是少量订阅和应答，不需要再发明一套 discovery wire protocol。
- **在线应答 ≠ 持久档案，service ID ≠ 长期逻辑身份，连接活着 ≠ 业务 readiness。**离线历史目录继续由中心持久化，长期 `nodeId` 继续与本次运行实例 ID 分离。
- 若未来需要跨系统共享 catalog、DNS、复杂健康检查和独立故障域，Consul 才有新增价值；若需要强一致 KV/lease/watch 协调多个写者，才评估 etcd。未来“多用户”本身并不是引入任一注册中心的充分条件。[G1][E2]

### 4.3 原生 `nats://` 本机 / `tls://` 远程，对比 `ws/wss`

**Verdict：原生 TCP 保留；WebSocket 降为条件可选。**

**事实：**

- NATS 当前 WebSocket 文档的原话级方向是：如果既不是浏览器，也没有只能理解 HTTP 的基础设施，**keep using `nats://`**，因为少一个 moving part 且避免 WebSocket framing overhead。[N7]
- WebSocket 只改变 transport 与 URL scheme，上层 subjects 和 JetStream API 不变；同一 server 的另一 listener 提供，六个 Tier 1 客户端支持，C 客户端不支持。[N7]
- Node transport 是原生 TCP；远程 TLS 有正式 `tls://` 示例。TLS 保护通道并验证服务端，客户端身份仍由 NKey、JWT 或 mTLS 等机制处理；只开 TLS 不等于客户端认证。[N8]
- WebSocket 部署还会引入 Origin 检查、HTTP proxy/LB 透传、TLS 终止位置和 advertise 地址等问题。[N7]

**推断：**

- 一期两端都是 DSH Node 插件，没有浏览器直连 NATS 的需求；本机 loopback 原生 TCP 是最少活动部件，远程强制 TLS 已满足通道保护，不需要为了“统一成 Web”而多包一层。
- `wss` 并不天然比 `tls` 更安全，也不替代 NKey/权限。启用条件应写成：**浏览器必须直连，或远程路径只允许 HTTP(S) LB/CDN/proxy**。条件不成立就不开 listener。
- Socket.IO 不是这里的替代：它会改变上层协议且仍没有 broker 的持久消费语义。[S2]

### 4.4 单个 File/Limits stream

**Verdict：File/Limits 保留；“必须永远单个”降为可选。一期默认仍可是一个。**

**事实：**

- Create Stream API 的 `storage: file` 表示磁盘保存，`memory` 不跨 server restart；`retention: limits` 在 MaxMsgs/MaxBytes/MaxAge 限额内保留，ACK 本身不删除，当前默认也是 File/Limits。[N9][N10]
- 一个 stream 可承载多个 subjects，并给多个独立 consumers 各自游标；官方当前示例也用 Limits 表示有界、可重读的日志。[N10][N11]
- 官方同时明确：不同保留目的可以使用不同 streams；需要扩展写入时可 split subjects across streams，而不是把所有扩展都理解为加 replicas。[N10][N14]
- account 是隔离 tenant 的 subject space；每个启用 JetStream 的 account 有自己的 JetStream store，并可设置 connections/storage/streams/consumers 等限额。[N13]

**推断：**

- 一期的最小部署没有理由按事件类型预先制造大量 stream/consumer 对象；一个 File/Limits stream 能减少配置与观测面，也符合 Limits 日志模型。
- 但“单个”不是安全或扩展特性。所有 subjects 共享 retention、容量、磁盘故障域和写入路径；未来若某类流量需要不同保留/配额，或不同用户需要 account 级隔离，继续强行单 stream 会把配置问题变成架构瓶颈。
- 正确拆分触发器是**真实信任边界、account、retention、容量/配额、独立备份恢复或扩展需求**，不是“每种事件一个 stream”，也不是追逐新功能。拆分后仍是同一 `nats-server` 与双进程，不必然增加进程。
- File/Limits 不是永久历史，也不替代中心权威历史；R=1 仍是单点，必须显式设置 MaxBytes/MaxAge/discard 与磁盘告警，不能依赖无限制默认。[N9][N14][N15]

### 4.5 显式精确 subjects 列表

**Verdict：保留用于 stream 捕获正列表；权限列表按真实命名空间另行收紧。**

**事实：**

- Create Stream API 的 `subjects` 是字符串列表并支持 wildcards；consumer filter 也可以是 literal subject 或 wildcard。[N9][N12]
- NATS subject 的通配符是 subscriber-only 工具：`*` 匹配一个 token，`>` 匹配末尾一个或多个 token；发布者应写完整 literal subject。[N12]
- authorization 的 allow-list 一旦存在，未列出的 subject 都会被拒绝；过宽 `>` 还会包括 `$JS.API.>` 等控制面。官方对 ACL 的建议是按真实 subject space 选择受限 wildcard，避免频繁漏加枚举项。[N13]
- 2.10 已加入多 subject consumer filters，2.15.3 仍持续优化 filestore 的单/多 subject filter 路径；该模式不是停止维护的旧用法。[N1][N16]

**推断：**

- 对一期事件目录较小且要求明确捕获边界的情况，精确列表可排除 `$SRV`、`_INBOX` 和未声明流量，并与契约逐项核对；新增事件时先更新契约与 stream，再开放 producer。
- 它没有新增进程或 runtime 依赖，代价是**契约—配置漂移**。应由同一份事件目录生成或 CI 比对，而不是手工维护两份无校验列表。
- 若列表 churn 已明显高于收益，使用受限根 wildcard 是当前官方同等支持的合理演进，不代表保守或落后；裸 `>` 仍不应使用。stream 捕获、publish/subscribe ACL 和 consumer filter 是三层配置，不必机械采用完全相同的枚举粒度。

### 4.6 durable consumers

**Verdict：保留。**

**事实：**

- 官方当前定义 consumer 为 stream 上的服务端游标；named durable consumer 以名字在磁盘保存位置，client disconnect/reconnect 或 server restart 后继续。[N11]
- 当前官方新 consumer 示例默认 pull，并配 explicit ACK；ACK 推进 durable cursor，未 ACK 在 AckWait 后 redeliver，形成 at-least-once。[N11]
- 一个 stream 可有多个 consumers，各自按自己的位置与 filter 读取；durable 的状态也可随 stream replicas 复制，但 R=1 没有这种容错。[N12][N14]

**推断：**

- 需要跨客户端重启、离线和 broker 重启恢复消费位置时，durable 是官方直接对应能力，不应为了少存游标而改回 ephemeral 或纯 Core subscription。
- 它不增加进程，但增加持久 consumer 状态、`MaxConsumers` 配额、pending/redelivery/lag 观测与命名生命周期管理。durable 名称、首次 DeliverPolicy 和离线后的恢复边界必须明确。
- durable 不等于端到端 exactly-once，也不替中心长期幂等。2.14 的 reset consumer 等新 API 不是成立条件，一期无需依赖。[N2]

### 4.7 一期不加 Consul/etcd/独立注册中心

**Verdict：保留。**

**事实：**

- Consul 当前提供完整注册/健康/catalog 控制面，但其独立部署与多租户能力有明确版本/商业边界；etcd 是一致性 KV，官方明确说它不是 Consul 式端到端 discovery 全套。[G1][E2]
- etcd 一成员容错为 0，三成员容错为 1；它还有 quota、磁盘延迟、备份和 quorum 运维。[E2]
- NATS Services 已提供在线应答，中心已有持久目录可保存离线历史；再加 Consul/etcd 不会替代 NATS 消息平面。[N6][G1][E2]

**推断：**

- 一期单中心、少节点、单故障域，新增独立注册中心会把“双进程”变成至少三进程，并新增一套状态备份、安全和升级责任，收益不足以抵消。
- 不引入独立注册中心不等于取消注册语义：持久档案由中心负责，在线状态由 Services 提供，业务健康与准入仍由项目计算。
- 重新评估的触发条件应是：多个控制面共享持久 catalog、需要 Consul 式 DNS/健康检查、需要强一致 lease/watch/事务协调多个写者，或组织已有可复用 Consul/etcd。不是“2026 了应该有注册中心”，也不是单纯“未来多用户”。

## 5. 曾比较方案：不选是否符合当前实践

### 5.1 RabbitMQ

**结论：继续不选符合当前实践；不是 RabbitMQ 过时。**

- 4.x 在 2024–2026 持续快速演进，Streams 也明确解决 replay、大 backlog 和非破坏性读取，不能再用“传统队列、缺少日志能力”笼统否定。[R1][R3]
- 但当前 generic Unix 仍要求 Erlang/OTP，Streams 还涉及复制、retention、磁盘 I/O 与专用协议/客户端；这些增量对本项目单机桌面和未来双机并非免费。[R2][R3]
- NATS 已在同一进程覆盖 subjects、在线发现、NKey/accounts 与 JetStream，换 RabbitMQ 不会自然保留这些形态，也不减少双进程数量。
- **重评条件：**组织已有 RabbitMQ 作为标准基础设施、必须互通 AMQP，或实际 PoC 证明其特定 queue/stream 语义与客户端支持明显优于 NATS。

### 5.2 Redis Streams

**结论：继续不选符合当前实践；“Redis 也是单进程”不足以证明更轻。**

- 8.6 的 IDMP 已是 GA，不是 RC；但它默认仅保留 100 秒、每 producer 100 个 iid，容量满还会提前淘汰，且修改配置可清空既有 map。它仍不是长期业务去重。[D1][D3]
- Streams 的寻址单位是 key，consumer group/PEL 与 NATS subject/Services 是不同模型；迁移会增加 key 拓扑和在线发现的项目约定。[D2]
- 可靠性还取决于 RDB/AOF 选择。官方指出 RDB 可能丢最近数分钟，AOF 默认 everysec 仍有约一秒窗口，always 更强但更慢，rewrite 也带来额外 I/O/fork。[D4]
- **重评条件：**已经运行并备份 Redis、团队熟悉其持久化与 consumer-group 运维，且 key 模型比 NATS subject/Services 更贴合。当前没有这些前提。

### 5.3 Socket.IO

**结论：继续不选符合当前实践；高 JS 采用不抵消职责错位。**

- 官方当前仍明确默认 at-most-once，server 没有断线 client 的发送缓冲。[S2]
- server→client 的 at-least-once 官方示例要求应用自行分配 unique ID、持久化事件、保存 client offset 并在重连时补发；client retries 在页面刷新时也会丢 pending event。[S2]
- 因而它适合在线交互，不会比 JetStream 更轻地完成本层可靠性。选它意味着项目重新拥有 broker 存储与恢复，而不是只换一个 npm 包。
- **重评条件：**目标改为实时 UI 连接层，且持久事件通道已由其他基础设施承担；不是替代当前 Gateway。

### 5.4 Centrifugo

**结论：继续不选符合当前实践；它仍是有活力的实时服务器。**

- 官方定位是 user-facing PUB/SUB，支持多种浏览器/在线用户 transport，和本层要解决的问题不同。[C2]
- 官方当前 history/recovery 文档明确：history 是 size/TTL 有界的 ephemeral cache，**不是 durable message queue，也不是权威 event log**；恢复失败要回源应用数据库，应用还需容忍偶发重复。[C3]
- 它可减少实时 UI 的 presence、短断线恢复与 SDK 工作，但不能替代 JetStream 的持久消费游标和处理 ACK。
- **重评条件：**未来另增实时观测 UI，需要面向浏览器的连接扩展；应作为补充而非替换当前 Gateway。

## 6. 核心稳定能力与“过新”能力的分层

| 层级 | 本次判断 | 对一期的含义 |
|---|---|---|
| **仍是当前主流的核心基础能力** | NATS Core subjects、原生 TCP/TLS、JetStream File/Limits、durable consumers、Services discovery、accounts/permissions 都在当前 2.15 正式文档与 Tier 1 JS 客户端中；RabbitMQ queues/streams、Redis Streams、Socket.IO 与 Centrifugo 也都持续维护。[N1][N2][N6][N7][N9][N11][R1][D1][S1][C1] | 年龄不扣分，按职责与运维适配选择。当前基线没有依赖已 EOL 的 NATS 2.11/2.12 专属承诺。 |
| **正式 GA、但较新且不应成为迁移理由** | Redis 8.6 IDMP 于 2026-02 GA；NATS 2.14/2.15 带来持续演进，2.15.3 本身也是正式 patch。[N1][D1] | 可跟踪，不因为“有 IDMP/新 minor”就改选。实施时 pin exact version 并读 upgrade guide。 |
| **实验/扩展或当前 draft** | nats.js 3.4.0 release notes 标出 fast ingest 的 Object Store 集成仍需 hidden `allowBatched` 且 experimental；etcd 官网有 3.8-DRAFT；Consul 页面有 Enterprise/BETA 能力。[N2][E1][G1] | 全部排除在一期正确性依赖之外；不引用 draft/beta 证明方案更现代。 |
| **官方明确不是持久可靠层** | Socket.IO 默认 at-most-once；Centrifugo history 是短期 cache；NATS Services 是在线 request/reply discovery。[S2][C3][N6] | 不能因新 release 或 UI 采用，把它们提升为持久事件通道或持久注册中心。 |

## 7. 最终建议

### 7.1 建议立即调整的架构措辞

1. 将“**单个 File/Limits stream**”改写为：

   > **一期默认使用一个 File/Limits stream 和显式 subjects 正列表，以最小化对象与运维；stream 数量不是永久不变量。出现真实 account/信任边界、差异化 retention/配额、独立备份恢复或扩展需求时，在同一 NATS 内拆分，不换 broker。**

2. 将“原生 vs WebSocket”改写为：

   > **本机默认 `nats://`，远程默认 `tls://`；只有浏览器直连或 HTTP-only 中间层成为真实约束时才启用 `ws/wss`。WebSocket 是 transport 选项，不是现代化升级，也不替代认证。**

3. 在部署边界明确写入：

   > **一期 R=1 是无容错单点；File/durable 解决重启恢复，不解决机器/磁盘永久丢失。双机中心—节点拓扑不等于 JetStream HA。**

4. 将 Services 的描述始终保持为：

   > **NATS Services 负责当前在线实例发现；中心负责持久目录；长期逻辑 ID 与单次运行 service ID 分离。**

### 7.2 一期实施与验收建议

- **版本：**从官方 supported lines 中 pin 正式 `nats-server` 与 nats.js exact versions；当前可验证 2.15.3，或按兼容性选择仍维护的 2.14 patch。不要跟随 `main`，不要依赖 Orbit experimental、fast ingest 或 2.14/2.15 新功能才能成立。[N1][N2]
- **进程：**保持一个独立 `nats-server` + 一个 DSH 宿主，不增加 Gateway adapter sidecar、Consul、etcd 或独立 IdP。独立进程的生命周期、数据目录与健康检查仍需项目 UI/CLI 管理。
- **存储：**显式 File/Limits、`store_dir`、`max_file_store`、stream MaxBytes/MaxAge/discard、durable 名称和容量告警；不要用无限保留或“磁盘还有很多”代替策略。[N9][N15]
- **subjects：**从同一契约生成或 CI 校验 stream 正列表与 producer 权限；不使用裸 `>`。高 churn 时优先评估受限根 wildcard，而非新增 registry。[N12][N13]
- **连接：**本机仅 loopback + NKey，远程 `tls://` + NKey；TLS 证书 SAN、轮换和 CA 信任纳入验收。没有 HTTP-only 约束时不启用 WebSocket listener。[N7][N8]
- **观测：**至少覆盖 stream 容量、consumer lag/pending/redelivery、连接与重启恢复；官方提供 monitoring port/JetStream 状态及 Prometheus 集成，但一期不必为此再跑完整监控栈。[N15]
- **重量实测：**在目标桌面环境测量 idle RSS、启动时间、持久写延迟、磁盘增长和重启恢复。官方 release 包大小不能代替运行时内存，项目之间也没有同口径公开 benchmark。

### 7.3 未来双机与多用户的分开触发

- **双机：**仍保留一个逻辑 Gateway，远程节点主动 `tls://` 外连；不要为“有两台机器”就声称 R=3，也不要自动引入 Consul/etcd。
- **多用户隔离：**优先评估 NATS accounts 作为 broker 信任边界；每个 account 有独立 subject space、JetStream store 和限额，跨 account 只经显式 export/import。共享单 stream + subject ACL 不能直接宣称完成多用户隔离。[N13]
- **stream 演进：**按 account/保留/配额/恢复边界拆分，而非按事件类型盲目拆分。此项变化不要求新增进程。
- **HA（若成为真实需求）：**另行评估至少三个 server 故障域、R=3、备份恢复和升级；它与“中心/节点分两台机器”是不同问题。[N14]
- **独立注册中心（若成为真实需求）：**只有共享 catalog、复杂健康、多个写者一致性或既有组织基础设施出现时再评估，届时也不能删除消息平面。[G1][E2]

## 8. 一手来源与访问日期

> 以下来源均访问于 **2026-11-14**。GitHub `latest`/无版本网页表示访问当日状态；具体 release API 用于固定版本事实。官方案例的性能与结果只归属其环境，不作为通用 benchmark。

### NATS / CNCF / nats.js

- **[N1]** NATS 官方 release notes（支持线、2025–2026 minor dates、EOL）：https://docs.nats.io/release-notes/ ；`nats-server` v2.15.3 正式 release API（2026-11-11、prerelease=false、核心 filestore/consumer 修复与 release assets）：https://api.github.com/repos/nats-io/nats-server/releases/tags/v2.15.3
- **[N2]** `nats.js` v3.4.0 正式 release（2026-05-08、2.14 features、experimental 边界）：https://api.github.com/repos/nats-io/nats.js/releases/tags/v3.4.0 ；npm 当前模块版本与包内容：`@nats-io/transport-node` https://registry.npmjs.org/@nats-io/transport-node/latest ；`@nats-io/jetstream` https://registry.npmjs.org/@nats-io/jetstream/latest ；`@nats-io/services` https://registry.npmjs.org/@nats-io/services/latest
- **[N3]** NATS 官方 *The NATS Ecosystem*（单 binary、Tier 1 JS/TS、同一 server 配置启用 JetStream/WebSocket）：https://docs.nats.io/concepts/ecosystem
- **[N4]** CNCF，2026-11-10 NATS Graduation 公告：https://www.cncf.io/announcements/2026/11/10/cncf-announces-nats-graduation-solidifying-a-production-ready-foundation-for-messaging-across-cloud-and-edge/ ；CNCF NATS 项目页：https://www.cncf.io/projects/nats/
- **[N5]** Vitrifi 署名案例（2025-01-24，JetStream/KV、最小部署足迹、跨云/私有数据中心）：https://nats.io/blog/nats-vitrifi-secret-weapon/ ；Sophotech 官方案例（2025-08-26，仅作具体迁移实例，不外推性能）：https://nats.io/blog/sophotech-rabbitmq-to-nats/
- **[N6]** NATS Services 官方 *Discovery*（`$SRV`、broadcast/deadline）：https://docs.nats.io/learn/services/discovery ；*Your first service*（running copy ID）：https://docs.nats.io/learn/services/your-first-service ；*Scaling*（fresh ID、无需注册实例、停止退订、at-most-once 边界）：https://docs.nats.io/learn/services/scaling ；官方 nats.js Services README：https://raw.githubusercontent.com/nats-io/nats.js/main/services/README.md
- **[N7]** NATS 官方 *Connect over WebSocket*（浏览器/HTTP-only 适用条件，其他情况保持 `nats://`，同 server/listener、framing 与 proxy 边界）：https://docs.nats.io/learn/websocket/
- **[N8]** 官方 Node native TCP transport README：https://raw.githubusercontent.com/nats-io/nats.js/main/transport-node/README.md ；NATS *Encryption & TLS*（`tls://`、CA/SAN、mTLS 与客户端认证区别、证书轮换）：https://docs.nats.io/learn/security/encryption
- **[N9]** NATS *Your first stream*（`nats-server -js`、stream/subjects）：https://docs.nats.io/learn/jetstream/your-first-stream ；*Create Stream*（subjects 列表、File/Memory、Limits、retention/limits 字段）：https://docs.nats.io/reference/jetstream/api/stream/create
- **[N10]** NATS *Retention policies*（Limits 日志语义、不同工作可使用不同 streams）：https://docs.nats.io/learn/jetstream/retention-policies
- **[N11]** NATS *Reading back the stream*（named durable、服务端磁盘游标、断连/重启恢复）：https://docs.nats.io/learn/jetstream/reading-back ；*Delivery and acknowledgment*（explicit ACK、at-least-once/redelivery）：https://docs.nats.io/learn/jetstream/delivery-and-acknowledgment
- **[N12]** NATS *Filtering what you consume*（literal/wildcard filter）：https://docs.nats.io/learn/jetstream/filtering ；*Subjects & wildcards*（token、`*`/`>`、literal publish）：https://docs.nats.io/learn/core-nats/subjects-and-wildcards
- **[N13]** NATS *Authorization*（allow/deny、过宽权限与受限 wildcard）：https://docs.nats.io/learn/security/authorization ；*Accounts and multitenancy*（独立 subject space、per-account JetStream store/limits）：https://docs.nats.io/learn/security/accounts-and-multitenancy
- **[N14]** NATS *Surviving node loss*（R=1 无容错、R=3 三 server、File 边界、拆 subjects 扩展写入）：https://docs.nats.io/learn/jetstream/surviving-node-loss
- **[N15]** NATS *Sizing & resources*（CPU/内存/磁盘/FD、`max_file_store`、account limits、监控相关配置）：https://docs.nats.io/learn/deployment/sizing-and-resources ；*Monitoring & Observability*：https://docs.nats.io/learn/monitoring/
- **[N16]** `nats-server` v2.10.0 release API（多 subject consumer filters 的引入与后续演进参照）：https://api.github.com/repos/nats-io/nats-server/releases/tags/v2.10.0

### RabbitMQ

- **[R1]** RabbitMQ 官方 *Release Information*（4.0–4.4、2024–2026 dates 与支持周期）：https://www.rabbitmq.com/release-information ；v4.4.0 正式 release API：https://api.github.com/repos/rabbitmq/rabbitmq-server/releases/latest
- **[R2]** RabbitMQ 4.4 *Generic Binary Build*（Erlang/OTP 要求、数据目录、FD/进程运维）：https://www.rabbitmq.com/docs/install-generic-unix
- **[R3]** RabbitMQ 4.4 *Streams and Superstreams*（持久复制 log、replay、retention、replication 与资源边界）：https://www.rabbitmq.com/docs/streams

### Redis

- **[D1]** Redis 8.6.0 GA release API（2026-02-10、Streams IDMP、非 prerelease）：https://api.github.com/repos/redis/redis/releases/tags/8.6.0 ；当前 8.10.3 正式 release API（2026-10-26、安全修复）：https://api.github.com/repos/redis/redis/releases/latest
- **[D2]** Redis 官方 *Streams*（append-only log、key/consumer-group 数据模型）：https://redis.io/docs/latest/develop/data-types/streams/
- **[D3]** Redis 官方 *Idempotent message processing*（8.6、默认 100 秒/100 iid、容量淘汰、持久化与配置清空边界）：https://redis.io/docs/latest/develop/data-types/streams/idempotency/
- **[D4]** Redis 官方 *Persistence*（RDB/AOF、everysec/always、rewrite/fork 与备份）：https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/

### Socket.IO

- **[S1]** Socket.IO 官方 *Changelog*（2024–2026 4.8.x 与 version-usage 口径）：https://socket.io/docs/v4/changelog/ ；`socket.io@4.8.4` 正式 release API：https://api.github.com/repos/socketio/socket.io/releases/latest
- **[S2]** Socket.IO 官方 *Delivery guarantees*（默认 at-most-once、无 server offline buffer、应用层 at-least-once 所需 ID/DB/offset）：https://socket.io/docs/v4/delivery-guarantees/

### Centrifugo

- **[C1]** Centrifugo v6.0.0 release API（2025-01-16）：https://api.github.com/repos/centrifugal/centrifugo/releases/tags/v6.0.0 ；当前 v6.10.3 正式 release API（2026-11-08）：https://api.github.com/repos/centrifugal/centrifugo/releases/latest
- **[C2]** Centrifugo 官方 *Introduction*（user-facing PUB/SUB、在线用户 transports、扩展 broker）：https://centrifugal.dev/docs/getting-started/introduction
- **[C3]** Centrifugo 官方文档源码 *Stream history and recovery*（有界 ephemeral cache、非 durable queue/event log、回源与重复边界）：https://raw.githubusercontent.com/centrifugal/centrifugal.dev/main/docs/server/history_and_recovery.md

### Consul / etcd

- **[G1]** Consul 当前 v2.1.0 正式 release API：https://api.github.com/repos/hashicorp/consul/releases/latest ；官方 *Register services and health checks*：https://developer.hashicorp.com/consul/docs/register/service/vm ；*Bootstrap a Consul datacenter*：https://developer.hashicorp.com/consul/docs/deploy/server/vm/bootstrap ；*Administrate multi-tenant Consul datacenters*（当前 Enterprise 入口）：https://developer.hashicorp.com/consul/docs/multi-tenant
- **[E1]** etcd 当前 v3.7.3 正式 release API：https://api.github.com/repos/etcd-io/etcd/releases/latest ；官方版本文档入口（3.7 released 与 3.8-DRAFT 分列）：https://etcd.io/docs/v3.7/
- **[E2]** etcd 官方文档源码 *etcd versus other key-value stores*（KV 定位、Kubernetes 生产用途、与端到端 Consul discovery 的区别）：https://raw.githubusercontent.com/etcd-io/website/main/content/en/docs/v3.7/learning/why.md ；*FAQ*（quorum、单成员零容错、磁盘/quota/备份运维）：https://raw.githubusercontent.com/etcd-io/website/main/content/en/docs/v3.7/faq.md
