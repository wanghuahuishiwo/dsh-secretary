# Gateway 候选的行业地位与流行度证据

> 状态：只读调研，不作最终选型。
> 截止日期与访问日期：**2026-11-13**。动态 API 数值只是当日快照。
> 范围：NATS、JetStream、Socket.IO 的成熟度、行业地位、实际采用与流行度；RabbitMQ、Kafka、Redis 仅作有限热度与产品范围参照。
> 标注：**事实**有一手来源；**推断**是研究者基于事实作出的限定判断。项目官网/CNCF 公告中的采用数字仍按“官方披露”记录，不冒充本研究独立审计。
> 方法限制：未使用营销榜单或二手博客。本次未找到覆盖这些产品、以统一生产部署/活跃企业为分母的官方同口径排名，因此不提供“第一”名次。

## 1. 简短结论

1. **NATS 可以称为云原生消息与流式基础设施中主流、成熟且有公开生产采用的方案之一（推断）。**截至本日，最强依据不是 star 数，而是 NATS 已于 **2026-11-10 成为 CNCF Graduated 项目**，并具有公开治理、第三方安全审计、企业采用披露和具体用户案例。[N1][N2][N3][N5][N6][N7]
2. **JetStream 不应被当成另一个独立流行产品。**它是同一 `nats-server` 通过配置启用的官方持久化子系统；NATS 的 CNCF 阶段、社区与热度可以说明其所属项目的行业地位，但不能拆出“JetStream 独立企业数/市场份额”，也不能把 NATS 全项目下载量都归给 JetStream。[N1][N4][N6]
3. **Socket.IO 可以称为 JavaScript 实时双向通信生态中常用且热度很高的库之一（推断）。**当日 GitHub 官方 API 返回 63,245 stars；npm 官方 API 返回 `socket.io` 与 `socket.io-client` 在 2026-11-06 至 2026-11-12 分别 24,990,698、20,903,325 次 downloads。[M5][M6]
4. **上述指标不能证明 Socket.IO 是可靠 broker，更不能证明“最流行/第一”。**Socket.IO 官方明确默认 at-most-once（至多一次），server 没有断线客户端发送缓冲；更强的 server→client 投递需要应用自行实现事件 ID、数据库持久化和 offset 补发。[S3]
5. **NATS、RabbitMQ、Kafka、Redis、Socket.IO 的 stars、npm downloads 不可直接混排。**产品类别、仓库年龄、包依赖结构、语言生态和部署分发渠道不同；本报告只做透明口径的热度参照，不据此产生市场排名。

## 2. 可核验的行业地位与实际采用

### 2.1 NATS：CNCF Graduated 是当前最直接的成熟度证据

**事实：**

- CNCF 于 **2026-11-10** 宣布 NATS 毕业；公告同时记载 NATS 于 **2018 年 3 月**以 Incubating 级别进入 CNCF。CNCF 项目页和 NATS 官网当前也标为 Graduated，因此旧的“NATS 仍是 CNCF 孵化项目”说法已过期。[N1]
- NATS 治理文件规定：日常决策公开在 GitHub 进行、默认共识；maintainer 增减及治理修改需要正式投票；正式投票采用 **organization voting（按组织投票）**，同一公司/组织无论有多少 maintainer 均只有一票，以避免单一组织主导。项目遵循 CNCF Code of Conduct。这些是治理规则，不等于对每次决策结果的背书。[N2]
- OSTIF 于 2025-04-18 发布由 Trail of Bits 执行的 NATS 安全审计结果：10 项有安全影响的发现（3 Medium、1 Low、6 Informational）；发布时 100% 已 resolved or accepted（已解决或已接受）。这支持毕业尽调事实，**不表示“零漏洞”或未来安全保证**。[N3]
- CNCF 毕业公告称 NATS 被超过 2,000 家公司使用，并列出 NVIDIA、Walmart、AT&T、Capital One、Mastercard、PayPal、HPE、Duke Energy、Palo Alto Networks 等示例。公告未给出企业去重、活跃期限或统计方法；该数字只作为 CNCF 官方披露，不能换算市场份额。[N1]
- NATS 官网的 “Powering Industry Leaders” 是生产 end user 可申请加入的 logo 列表；官网源码 README 要求申请者自称是 production end user 并发送申请。它是项目方维护的 adopter 信号，不是独立审计名单。[N5]

**一手案例（事实，案例结果不能外推为通用 benchmark）：**

- **Vitrifi（2025-01-24）**：其 Workflow Automation Platform 使用 NATS 作通用 transport，明确使用 JetStream 处理工作流状态事件、NATS KV 保存工作流定义，并跨公有云和私有数据中心部署。这是 JetStream 实际生产架构的一手用户署名案例，不只是 NATS Core 的 logo。[N6]
- **Sophotech（2025-08-26）**：约 50 个服务的单 Kubernetes 集群从 RabbitMQ 迁至 NATS；官方案例报告 p99 latency 约 150 ms 降至 40 ms、运维时间从每周数小时降至不足一小时。数字只代表该案例环境与测量口径，不能据此宣称 NATS 普遍比 RabbitMQ 快。[N7]

**推断：**CNCF Graduated、公开治理、第三方审计和可指名案例共同支持“NATS 是主流成熟的云原生消息/streaming 基础设施之一”。“行业标准”“最流行”则需要额外的统一市场口径，不能由这些证据直接推出。

### 2.2 JetStream：所属项目成熟，但没有独立流行度身份

**事实：**

- 官方生态文档写明：clustering、**JetStream persistence**、leaf nodes、MQTT、WebSocket 都在同一个 `nats-server` 上通过配置启用，没有单独组件需要安装。[N4]
- 官方概念文档把 JetStream 定义为在 Core NATS 上增加 persistence layer，使消息可跨重启保存并 replay，提供 at-least-once（至少一次）投递；它引入 stream、consumer 和 client ACK/进度。[N4]
- CNCF 毕业公告将 JetStream 称为 NATS 的 persistence capability，而非另一个 CNCF 项目；Vitrifi 案例能证明至少有明确的 JetStream 用户案例，但 NATS 官网的 “2K+ companies / 400M+ downloads” 没有拆分 JetStream 使用量。[N1][N5][N6]

**推断：**合理表述是“选择 NATS，并按需启用其 JetStream 子系统”，而不是“同时选择 NATS 与另一个独立流行产品 JetStream”。JetStream 的成熟度可随 NATS 项目证据评估，流行度排名则没有可靠独立分母。

### 2.3 Socket.IO：JS 实时通信库的高采用，不等于 broker 成熟度认证

**事实：**

- 官方定位是跨平台、双向、低延迟通信；WebSocket 不可用时回退 HTTP long-polling，断线后自动重连。首页的 “Reliable” 紧接着描述的就是 fallback 与 reconnect，并不是持久消息队列承诺。[S1]
- 2024 年官方将 server、client、Engine.IO、parser 等代码合并到一个 monorepo；`packages/socket.io` 与 `packages/socket.io-client` 是不同 npm package。因此 GitHub repo stars 与两个 npm package downloads 是不同口径，不能相加为“用户数”。[S2][M5][M6]
- 官方交付保证文档明确：默认 at-most-once；断线期间 server 没有为 client 保存 missed events 的 buffer。client→server 可用 retries + 应用 ACK，server→client 的 at-least-once 示例则要求应用持久化事件、分配 unique ID、保存 client offset 并重连补发。[S3]
- GitHub 官方 API 显示主 repo 创建于 2010-03-11、当日未 archived，且 `pushed_at` 为 2026-11-13。这只能说明长期历史和当日开发活动，不是类似 CNCF Graduated 的独立生产成熟度认证。[M5]

**推断：**npm 与 GitHub 数据足以支持“Socket.IO 在 JS 实时通信生态常用且有很高开发者热度”。它们既不能证明有多少独立生产应用，也不能证明其具备可靠 broker 的存储、重投和消费语义；官网 “Reliable” 一词不能脱离交付保证文档引用。

### 2.4 参照产品：官方定位不同，热度分母天然不同

以下只解释为什么不能把热度数字当作同类 broker 排名，不重复本项目能力适配结论。

| 项目 | 官方定位/场景依据（事实） | 对热度解释的限制（推断） |
|---|---|---|
| NATS | 面向 distributed systems、cloud to edge 的 messaging、streaming 与 state，统一在一个系统中。[N1][N5] | NATS 整体热度也不能全部归给 JetStream。 |
| RabbitMQ | 官方定位为 messaging and streaming broker，列出服务解耦、RPC、streaming、IoT 等场景；教程同时覆盖 work queues、pub/sub、routing、RPC 与 streams。[R1] | 与 NATS 有重叠，但协议、客户端和部署分发不同，stars 不是装机量。 |
| Apache Kafka | 官方定位为 event streaming platform，组合事件发布/订阅、durable storage 与实时/事后 processing；topic partition 支持分布式读写。[K1] | 更偏持久事件流与流处理平台，不能只按“消息队列”单一维度解释其热度。 |
| Redis | Redis Streams 只是 Redis 的一种 append-only log 数据结构，官方案例为 event sourcing、sensor monitoring、notifications；Redis 官网还同时列出 caching、session、search、AI 等用途。[D1] | `redis/redis` stars 反映整个 Redis 项目，不能当作 Redis Streams 或“作为 broker 的 Redis”的采用量。 |

## 3. 有限流行度指标及口径

### 3.1 GitHub 官方 API 同日快照

**采集日：2026-11-13。**数值直接取各 repo API 的 `stargazers_count`、`forks_count`；不做四舍五入，不排序。[M1][M2][M3][M4][M5]

| 项目 | 官方主 repo | Stars | Forks |
|---|---|---:|---:|
| NATS | `nats-io/nats-server` | 21,055 | 2,037 |
| RabbitMQ | `rabbitmq/rabbitmq-server` | 13,969 | 4,033 |
| Apache Kafka | `apache/kafka` | 34,213 | 15,690 |
| Redis | `redis/redis` | 77,485 | 25,056 |
| Socket.IO | `socketio/socket.io` | 63,245 | 10,232 |

**口径边界：**stars/forks 是 GitHub repo 层面的累计关注/分叉指标，不是下载、活跃安装、企业数或生产部署数。repo 创建时间、历史迁移、monorepo 合并、产品范围均不同；Socket.IO 的 repo 是 JS 通信库，另外四个是服务端基础设施主 repo，横向差值没有“市场占有率”含义。

### 3.2 Socket.IO 的 npm 官方 downloads API

**滚动窗口：2026-11-06 至 2026-11-12（含首尾，API 返回值），采集日 2026-11-13。**[M6]

| npm package | API 返回 downloads | 说明 |
|---|---:|---|
| `socket.io` | 24,990,698 | Node server package 的 registry downloads 次数 |
| `socket.io-client` | 20,903,325 | client package 的 registry downloads 次数 |

**口径边界：**downloads 不是独立用户、独立应用或生产部署；会受 CI、重复安装、缓存命中策略和依赖安装影响。server/client 可能共同出现在一个应用中，downloads 也可能来自间接依赖，**两数不能相加，也不能相减推算浏览器应用数**。该数据只覆盖 npm 分发，不覆盖其他语言实现或所有实时通信方案。

### 3.3 为什么没有给出统一“热度榜”

- **指标不可比：**GitHub stars 是累计社交/关注信号，npm downloads 是滚动 7 天包下载，CNCF “2,000+ companies” 是未披露统计方法的企业采用披露；三者分母与周期不同。
- **产品不可比：**Kafka 的流处理、Redis 的缓存/数据结构与 Socket.IO 的 JS 连接库都会扩大各自项目热度，无法归一到“可靠 broker 部署数”。
- **渠道不完整：**托管服务、其他镜像仓库、OS package、供应商分发和私有镜像均未计入。Docker Hub 官方 API 本次访问超时，故不抄录 pull 数；即便取得，也只是一特定镜像的累计拉取，不能补成统一排名。
- **检索结论：**本次未找到 NATS、RabbitMQ、Kafka、Redis 与 Socket.IO 之间可靠的官方同口径排名，也未找到 Socket.IO 在整个 JS 实时通信生态按活跃生产应用统计的官方第一名证明。缺少这种证据时，应明确写“没有可核验排名”，而不是用 stars/downloads 替代。

## 4. 能否称“标杆/最流行”：四种判断分开

| 判断 | 本报告能支持的表述（推断） | 不能由此推出 |
|---|---|---|
| **主流成熟** | NATS 有 CNCF Graduated、治理、审计和生产案例，可称云原生消息/streaming 的主流成熟方案之一；Socket.IO 有长期维护和高采用，可称成熟的 JS 实时通信库之一。 | 成熟不等于满足任意可靠性要求；Socket.IO 的高采用不是 broker 能力认证。 |
| **某一领域常用** | NATS 在云原生分布式消息/流式场景有公开企业采用；Socket.IO 在 JS 双向实时通信场景有很强 npm/GitHub 热度。 | 不能把一个领域或分发渠道的常用扩展成所有消息基础设施的统一常用度。 |
| **最流行/第一** | 没有足够同口径证据给 NATS、JetStream 或 Socket.IO 排第一。JetStream 甚至没有独立产品分母。 | 不写“业内最流行”“排名第一”“事实标准”，也不以 Redis/Kafka/Socket.IO stars 较高反推另一个总榜。 |
| **适合本项目** | 需要另以项目协议、故障语义、客户端、运维与 PoC 验收判断。行业地位只能降低生态和维护风险的某一方面。 | “成熟/流行”不自动等于“适合”；“适合”也不需要先证明“第一”。 |

若一定要使用“标杆”这一带评价色彩的词，建议限定为：**“NATS 是云原生消息基础设施中具有代表性的成熟方案之一”**，并链接 CNCF Graduated 证据；不要写成“NATS/JetStream 是业内第一标杆”。对 Socket.IO 建议写 **“JS 实时通信中常用、高热度的库”**，不要写成“最流行可靠 broker”。

## 5. 对本项目选型的含义（推断）

1. **名称和评估单元统一为 NATS / JetStream 子系统。**选型材料、依赖清单和 PoC 应记录 `nats-server` 版本及是否启用 JetStream，不为 JetStream 另造独立 popularity 指标或另算一个产品。
2. **把行业证据用于风险筛查，而非代替适配验收。**NATS 的毕业与案例可支持进入候选名单；Socket.IO 的 npm/GitHub 数据可支持其 JS 生态可维护性/人才可得性的进一步调查，但二者都不能替代本项目自己的语义与故障测试。
3. **不要把 Socket.IO 与 NATS JetStream 当同类“流行 broker”二选一。**若项目需要可靠 broker，应单独验证持久化、离线投递、重投、ACK 等要求；Socket.IO 的高下载量不能抵消官方所述 at-most-once 默认边界。[S3]
4. **Kafka/RabbitMQ/Redis 只按相同项目需求比较。**不以 Redis/Kafka 的整体 stars 压过 NATS，也不以 RabbitMQ stars 较低否定其成熟度；应先确认具体场景是否相同，再比较可复现的适配和运维证据。
5. **文档用语保持可核验。**推荐“主流成熟方案之一”“JS 实时通信常用库”“截至某日 GitHub/npm 指标”，同时给来源和口径；避免“最流行”“第一”“所有人都用”。

## 6. 一手来源 URL 与访问日期

> 以下来源均访问于 **2026-11-13**。`main/master` 及无版本 API 链接表示当日内容；后续引用动态数值应重新采集并注明新日期。

### NATS / CNCF / 案例

- **[N1]** CNCF，2026-11-10 毕业公告（阶段、2018 incubation、企业披露、治理/审计与 JetStream 定位）：https://www.cncf.io/announcements/2026/11/10/cncf-announces-nats-graduation-solidifying-a-production-ready-foundation-for-messaging-across-cloud-and-edge/ ；CNCF 项目页：https://www.cncf.io/projects/nats/
- **[N2]** NATS 官方治理文件（公开决策、组织一票、投票规则、CNCF CoC）：https://raw.githubusercontent.com/nats-io/nats-general/main/GOVERNANCE.md
- **[N3]** OSTIF，*NATS Audit Complete!*（Trail of Bits 审计范围、发现与处置状态）：https://ostif.org/nats-audit-complete/
- **[N4]** NATS 官方文档，*The NATS Ecosystem*（同一 `nats-server` 配置启用 JetStream）：https://docs.nats.io/concepts/ecosystem ；*JetStream Concepts*（持久化子系统与 stream/consumer）：https://docs.nats.io/concepts/jetstream
- **[N5]** NATS 官网（Graduated 标识、官方汇总指标、生产 adopter logos）：https://nats.io/ ；logo 申请规则的官方源码：https://raw.githubusercontent.com/nats-io/nats-site/main/README.md
- **[N6]** Vitrifi 官方案例，*NATS.io: The Secret Weapon Behind Vitrifi’s Workflow Automation Platform*：https://nats.io/blog/nats-vitrifi-secret-weapon/
- **[N7]** Sophotech 官方案例，*How Sophotech Cut Latency by 3x Migrating from RabbitMQ to NATS*：https://nats.io/blog/sophotech-rabbitmq-to-nats/

### Socket.IO

- **[S1]** Socket.IO 官网（双向低延迟、WebSocket fallback、自动重连及 “Reliable” 的上下文）：https://socket.io/
- **[S2]** Socket.IO 官方博客，*Socket.IO monorepo*（server/client 包与同 repo 结构）：https://socket.io/blog/monorepo/
- **[S3]** Socket.IO 官方文档，*Delivery guarantees*（默认 at-most-once、无 server offline buffer、应用层 at-least-once）：https://socket.io/docs/v4/delivery-guarantees/

### 官方指标 API

- **[M1]** GitHub API，`nats-io/nats-server`：https://api.github.com/repos/nats-io/nats-server
- **[M2]** GitHub API，`rabbitmq/rabbitmq-server`：https://api.github.com/repos/rabbitmq/rabbitmq-server
- **[M3]** GitHub API，`apache/kafka`：https://api.github.com/repos/apache/kafka
- **[M4]** GitHub API，`redis/redis`：https://api.github.com/repos/redis/redis
- **[M5]** GitHub API，`socketio/socket.io`：https://api.github.com/repos/socketio/socket.io
- **[M6]** npm 官方 downloads API，`socket.io`：https://api.npmjs.org/downloads/point/last-week/socket.io ；`socket.io-client`：https://api.npmjs.org/downloads/point/last-week/socket.io-client

### 场景范围参照

- **[R1]** RabbitMQ 官网（messaging/streaming broker 与场景）：https://www.rabbitmq.com/ ；官方教程（work queues、pub/sub、RPC、streams）：https://www.rabbitmq.com/tutorials
- **[K1]** Apache Kafka 官方，*Introduction*（event streaming、durable storage、processing、partition）：https://kafka.apache.org/intro
- **[D1]** Redis 官方文档源码，*Redis Streams*（append-only log 与案例）：https://raw.githubusercontent.com/redis/redis-doc/master/docs/data-types/streams.md ；Redis 官网（缓存、session、search、AI 等更广泛用途）：https://redis.io/
