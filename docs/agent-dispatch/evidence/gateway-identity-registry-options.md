# Gateway / 身份 / 注册中心选型证据

> 状态：只读调研证据，不是架构决策，不扩大一期范围。
>
> 访问日期：2026-11-13。事实仅采用官方文档、官方源码仓库、RFC / 正式规范；文中把 **事实** 与 **推断** 分开。产品文档会演进，实施时仍需固定并复测具体版本。
>
> 仓库边界：一期既定形态是单机双进程（独立 Gateway + 同宿主中心/节点 DSH 插件），见 [foundation.md](../foundation.md#2-部署角色角色宿主与进程)；Gateway 当前预定职责含连接、鉴权、注册/心跳、订阅、投递、序号/幂等，见 [foundation.md](../foundation.md#21-角色与宿主的组合契约)。本文不修改这些既定结论，只评估替代与拆分选项。

## 1. 结论摘要

1. **事实：现有 “Gateway” 不是单纯的 API Gateway。** 它同时包含 message broker（消息代理）、机器连接认证与授权、在线节点目录及项目协议控制面。API Gateway 主要做请求代理、路由和策略执行，不能单独替代事件投递与节点目录。[G1][G2]
2. **推断：NATS 是本轮最接近“一个进程覆盖传输 + 安全 + 在线发现”的候选。** 依据的事实是：开源 `nats-server` 提供 accounts/users、subject permissions、NKey、NATS 专用 JWT 信任链、TLS/mTLS；官方 Services framework 提供 `$SRV.PING/INFO/STATS` 在线发现；JetStream 之上另有 KV/watch/TTL。[N1][N2][N3][N4][N5][N6][N9]
3. **事实：NATS Services discovery 不是持久服务注册中心。** 它由在线服务广播应答，查询方在截止时间窗口内收集响应；服务框架本身不保存服务记录。KV 可以保存目录状态，但目录 schema、身份绑定、健康语义与路由规则仍由应用定义。[N5][N6][N9]
4. **事实：Consul 与 etcd 不是 Gateway 消息平面的替代品。** Consul CE 提供完整 catalog、服务注册、健康检查、DNS/HTTP discovery 和 ACL；etcd 是一致性 KV，提供 watch、lease keepalive、事务、RBAC 和 mTLS，但官方明确说它不具备 Consul 那样的端到端服务发现全套功能。二者都需要项目另留消息通道。[C1][C2][C3][C4][C8][E1][E2][E5]
5. **事实：NATS account 是独立的 subject namespace，默认不跨账号投递，跨账号需显式 export/import；Consul CE 只有 `default` namespace/partition，官方多租户 namespaces/admin partitions 属于 Enterprise。** 据此推断，多租户不能混同于认证或 ACL，应用消息里的 `tenant` 字段本身也不是安全边界。[N2][N17][C5][C6][C7]
6. **事实：OIDC Core 主要证明 End-User 身份；mTLS 证明证书私钥持有并保护通道，OAuth mTLS client authentication 与 certificate-bound access token 是两个可独立部署的机制。** 据此推断，机器角色连接应使用 OAuth 2.0 Client Credentials 等机器流程，且 mTLS 不自动给出业务权限或租户隔离。[R1][R2][R4][R5]
7. **推断：一期并不因“注册/心跳”四个字而必须再增加独立注册中心进程。** 单中心、少量节点时，目录可以属于现有 Gateway 或中心的权威状态，也可以由 NATS 在线发现 + 项目目录满足。真正需要独立注册中心的条件是独立的持久目录、健康检查/查询、多个控制面消费者或明确的一致性/故障域要求，而不是“未来可能多租户”。
8. **推断：NATS 可以替代自研传输进程，但不是零改动替换。** 若 `nats-server` 直接成为独立 Gateway，注册、能力目录、身份映射、幂等和 graph 路由仍需项目代码；若这些代码另跑一个控制 sidecar，进程数反而增加。若让现有 DSH 中心插件承担这些控制语义，有机会保持双进程，但这会改变当前 Gateway 的职责归属，需另行决策。
9. **推断：Consul CE / Enterprise、etcd、独立 IdP 都会增加一期实际部署边界。** 在保留现有 Gateway 的前提下引入 Consul 或 etcd，至少新增一个基础设施进程；独立 IdP 也一样。对单机桌面 MVP，应以“是否有不可替代的目录或组织身份需求”为引入门槛，而非产品功能清单。

## 2. 职责边界

### 2.1 四类基础设施各自负责什么

| 类别 | 核心职责（事实） | 不自动承担的职责 |
|---|---|---|
| **message broker / event bus** | 按 subject/topic 等地址发布订阅、request/reply、队列投递；持久化 broker 还可保存和重放消息。Core NATS 是 at-most-once、离线不保留；JetStream 才提供存储与 at-least-once consumer delivery。[N7][N12] | 不等于中心的权威事件历史、single writer、graph 状态机、业务幂等、任务完成判定或跨租户数据所有权。 |
| **API Gateway** | 将客户端请求按 Route 匹配到 upstream Service，并在代理路径上应用转换、限流、认证插件等策略。Kong 的官方模型就是 Gateway Service + Route + Plugins。[G1][G2] | 不等于 broker 的订阅/扇出/持久消费，也不天然是节点能力目录或权威注册表。agent-dispatch 的 “Gateway” 名字不能用来反推应选 API Gateway。 |
| **service registry / service discovery** | 注册服务实例及地址/元数据，维护或检查健康状态，并通过 DNS、HTTP、watch 或在线应答让调用方发现实例。Consul catalog 与 NATS `$SRV` 是两种不同实现。[C1][C3][C8][N6] | 不天然理解 DSH 的 worker 类型、槽位、网络域、任务认领、机器级逻辑身份；在线可达也不等于可安全执行某类任务。 |
| **IAM / OIDC / OAuth2 / mTLS** | IAM 管理身份与策略；OAuth2 颁发访问受限 HTTP 资源的 access token；OIDC 在其上增加 End-User 身份层；TLS 提供机密性/完整性与服务端认证，mTLS 另认证客户端证书。[R1][R2][R4][R5] | 不自动提供服务目录、消息路由、业务授权、租户隔离或物理机器证明。scope/role/tenant claim 仍需资源服务端解释和执行。 |

### 2.2 “注册”其实是四种状态，不能混为一个表

| 状态 | 含义 | 本轮证据所支持的实现 |
|---|---|---|
| **身份记录** | 哪个逻辑节点、对应哪份凭据、属于哪个业务/租户 | NATS user/account、Consul ACL service/node identity、etcd user/role、OAuth client 都只是可映射的基础设施身份；与“每台机器一个逻辑节点”的绑定仍需项目定义。 |
| **在线连接 / liveness** | 当前连接是否存活、是否应答 | NATS PING/PONG 和 `$SRV.PING` 可证明传输/在线应答；Consul TTL check 与 etcd lease 可让健康记录或 key 超时。[N6][N8][C3][E2] |
| **持久档案** | 重启后仍需保留的节点 ID、所属业务、版本、能力声明 | Consul catalog 可直接存服务 `tags/meta`；NATS KV 或 etcd KV 可存项目 JSON；schema 与权威写入者仍需项目决定。[C1][N9][E2] |
| **调度可用性 / readiness** | 当前是否允许接某类任务、是否有槽位、网络域和凭据是否满足 | 没有候选能直接理解这些 agent-dispatch 语义；它必须由项目策略计算，不能仅用 TCP 健康或心跳替代。 |

**推断：** 一期如果只要求“同机节点向中心声明自己、保持在线、让中心知道能力”，不必为了四种状态各建一个系统；但需要分别写清数据模型和判定规则。

## 3. 候选对比

### 3.1 总表：现成能力与剩余自研

“覆盖”指官方提供对应基础设施原语，不表示开箱即满足 agent-dispatch 业务语义。

| 候选 | 连接认证 / 身份防伪 | 注册、健康、能力元数据 | 多租户边界 | 消息平面 | 项目仍需自研 |
|---|---|---|---|---|---|
| **NATS server + Services + JetStream/KV** | users、accounts、subject allow/deny；NKey nonce 签名；operator→account→user 的 NATS JWT 链；TLS/mTLS 并可把证书身份映射到 user。[N1][N3][N4] | `$SRV` 在线 PING/INFO/STATS；KV/watch 可做持久目录；连接 PING/PONG。无 Consul 式完整健康检查/catalog 语义。[N5][N6][N8][N9] | account 隔离 subject space；export/import 显式跨账号；JetStream 按 account 启用和分存。[N2][N17] | Core pub/sub、request/reply、queue group；JetStream 持久化。[N7][N12] | 节点 ID 绑定、业务注册/能力 schema、readiness、graph 路由、全局序号/幂等、跨账号拓扑、中心历史与租户授权。 |
| **Consul CE** | ACL token + policies/roles/service/node identities 保护 Consul API/UI/CLI；这不是现有应用连接的自动认证。[C4] | 完整注册、catalog、tags/meta、HTTP/DNS discovery；HTTP/TCP/TTL/gRPC 等健康检查。[C1][C2][C3][C8] | 只有 `default` namespace/partition；官方明确 CE 不支持多租户。[C5] | **无** agent-dispatch 所需 broker。 | 保留 Gateway；节点身份与业务授权、能力模型、任务路由、租户模型；不能用 Consul ACL 替代应用授权。 |
| **Consul Enterprise** | 同 CE，另有企业能力。 | 同 CE。 | namespaces 隔离资源并委托管理；admin partitions 位于 namespaces 之上，容纳独立租户。[C5][C6][C7] | **无**。 | 同 CE；另需承担商业许可、版本与运维评估。 |
| **etcd** | user/password、role 对 key/range 的 read/write 权限；TLS client cert 可认证并把 CN 映射为 etcd user。[E2][E3][E4] | KV/watch/transaction/lease keepalive；官方 Go naming/resolver 是构建 discovery 的组件，不是完整注册中心。[E1][E2][E5] | 无本文所需的独立 tenant 控制面；可用 key prefix/range + RBAC 自建隔离策略。[E2][E3] | **无**。 | 目录 schema、健康检查与查询、DNS/路由、节点身份绑定、业务租户与消息平面，基本都要自建。 |
| **OIDC/OAuth2 Provider（以 Keycloak service account 为官方实现例）** | Client Credentials、signed JWT assertion 等；Keycloak service account 可获得 access token，默认不建 user session、默认不返 refresh token。[R2][R3][K1] | **无**节点目录/健康检查。 | token 的 realm/role/scope/claim 只是策略输入，不是应用数据隔离。 | **无**。 | 资源服务端 token 验证、audience/scope/tenant 映射、授权与全部目录/路由；IdP 的高可用和凭据生命周期。 |

**版本与商业边界：** 本文列出的 NATS accounts/NKey/JWT/TLS/Services/JetStream KV 能力均来自官方 `nats-server` 文档，服务端为 Apache-2.0；etcd 同为 Apache-2.0，没有把托管商业服务当作前提。[N1][N5][N9][N15][E10] Consul 则必须把 CE 与 Enterprise 分开：CE 的注册/健康/ACL 不等于官方多租户，namespaces/admin partitions 是 Enterprise 能力，且当前代码采用 BUSL-1.1。[C5][C6][C7][C12]

### 3.2 NATS：最接近组合候选，但三种“发现/持久化/心跳”要分开

#### 事实：安全与租户

- **Account ≠ user ≠ permission。** account 是有独立 subject space 的 tenant；user 属于一个 account；permissions 在 account 内限制 user 可 publish/subscribe 的 subjects。无 accounts 配置时，连接落入隐式全局 account `$G`。[N1][N2]
- **跨账号默认无消息。** 相同 subject 名在不同 account 也是不同地址；跨账号 stream/service 需要两侧 export/import。因而“所有租户都向一个中心上报”不是免费能力，需要设计中心 account、各业务 account 和精确共享面。[N2][N17]
- **NKey 与 NATS JWT 不是 OIDC access token。** NKey 使用 Ed25519，客户端用私有 seed 对服务器 nonce 签名；operator mode 验证 operator→account→user 的签名链，account JWT 由 resolver 获取。普通非 bearer user 只有 JWT 而没有 seed 不能通过 nonce 验证。[N3]
- **TLS 与 mTLS 也不同。** 只配 server TLS 是加密和服务端认证；`verify_and_map` 才要求客户端证书并把 SAN/DN 映射成 NATS user。NATS 官方特别提醒，TLS on 而没有 `verify`/`verify_and_map` 不是客户端认证。[N4]
- **接入已有 OIDC 的可选路径是 auth callout。** 外部 auth service 校验 token 并返回 NATS 用户身份/权限；这不是 `nats-server` 直接变成标准 OIDC provider。auth callout 服务落入新连接关键路径，且请求会携带客户端凭据，需独立 account 与可选 xkey 保护。[N16]

#### 事实：Services discovery、KV 与活性

- Services framework 是**客户端库中的 request/reply 框架**，不是另一个注册中心进程。它提供服务名称、实例 ID、版本、endpoints、queue groups、stats 和 `$SRV.PING/INFO/STATS`；普通 `nats-server` 即可运行，无需 JetStream。[N5][N6]
- discovery 是广播并在短 deadline 内收集“当前应答者”，不是持久、完整的历史名录；只取第一条会漏实例。适合在线发现，不应未经论证就当作中心权威注册表。[N6]
- KV bucket 是名为 `KV_<bucket>` 的 JetStream stream，支持 get/put/watch、revision/CAS 和 TTL；watch 可先给当前快照，再给后续变更。它需要启用 JetStream，并非独立数据库。[N9][N11]
- per-key TTL 需要 server **2.11+**，且只在 `create` 时设置。普通 `put`/`update` 不会续期，反而会让该 key 不再带 TTL。若用心跳续租，不能把它误写成 etcd `LeaseKeepAlive` 的等价物；需要专门的重建/续约设计。[N10]
- NATS PING/PONG 检测的是连接死亡，默认每两分钟 PING、两次未答判死；它是传输活性，不是“worker 可接任务”的业务健康。[N8]

#### 事实：投递、序号与幂等

- Core NATS at-most-once，离线订阅者收不到消息；JetStream consumer 是 at-least-once，未 ack 会 redeliver。[N7][N12]
- JetStream `PubAck` 只证明已存入 stream，不证明消费者已处理。`Nats-Msg-Id` 只在 stream 配置的 duplicate window 内去重，官方示例默认窗口为两分钟，超窗重试仍可能重复；业务去重不能终止于 broker。[N13]

#### Node/TypeScript 客户端与服务端边界

- **客户端：** 官方 `nats-io/nats.js` monorepo 提供 Node/Bun TCP、Deno、浏览器 WebSocket transport，以及 Core、JetStream、KV、Services 模块；npm 包要求 Node 22+。[N14]
- **服务端：** `nats-io/nats-server` 是独立 Go server，Apache-2.0；官方快速路径是运行 `nats-server` / `nats-server -js`，不是 Node 进程内 npm broker。[N7][N9][N15]
- **单机桌面边界：** 一个本地 `nats-server` 即可覆盖 Core + Services；KV/可靠投递需 JetStream 和持久目录。 centralized config 适合少量、变化慢的用户；operator/resolver、证书轮换和外部 auth service 都增加运维面。[N3][N4][N16]

#### 推断：适配判断

NATS 是减少自研 WebSocket、subject 权限和连接管理代码的直接候选。它不会自动实现当前事件信封、`node.*`/`task.*` 语义、中心 single writer、跨角色序号/幂等和 graph 路由。选择它应被理解为“复用 broker 和安全原语，保留薄项目控制面”，而不是“注册中心和 Gateway 都消失”。

### 3.3 Consul：目录/健康最完整，版本与作用域限制必须写清

#### 事实

- 服务定义可有 `name/id/port/tags/meta`，经 local agent 配置、CLI 或 `/agent/service/register` 注册；DNS 与 HTTP API 都可发现。`tags/meta` 能承载自定义能力字符串，但其含义仍由项目定义。[C1][C2][C8]
- 健康检查支持 HTTP、TCP、TTL、script、gRPC 等；TTL 未更新会进入 `critical`。健康检查是 application-level check，不能天然代表 agent-dispatch readiness。[C2][C3]
- ACL token 的 `SecretID` 用于识别用户/服务，policy/role 决定能否访问资源；service identity 可生成允许服务发现与被发现的策略。**这是 Consul 控制面的认证授权，不会自动认证自研 Gateway 的节点连接。**[C4]
- CE 的核心服务发现可用，但只有 `default` namespace/partition，官方明确“不支持多租户”。Enterprise namespaces 用于资源隔离和委托管理；admin partitions 在 namespace 之上定义行政与通信边界。[C1][C5][C6][C7]
- admin partitions 在 Consul **1.11** 引入；CE 升级后仍只有 `default`，Enterprise 才能在一个 datacenter 创建多个。WAN federation 只有 `default` admin partition 的 resources 会复制，跨 partition 还需 exported services 等配置。[C7]
- 当前官方库列表只把 Go `api` 标为 Official Go client；本次未在该官方列表找到官方 Node/TypeScript SDK。Node/TS 应把稳定的 Consul HTTP API 当集成面，第三方包需另验维护状态，不能写成“HashiCorp 官方 TS client”。[C10][C11]
- Consul server 是独立二进制/agent，不是 Node 内嵌库。开发测试可用一个 local server；server cluster 需要 Raft bootstrap。单机 server 没有因引入 Consul 而自动获得多节点高可用。[C9]

#### 开源/商业与许可边界

Consul 当前官方仓库标明 **BUSL-1.1**，不是 Apache-2.0。其 Additional Use Grant 允许不构成与 IBM 付费版本竞争的 hosted/embedded 第三方产品生产使用，内部使用不视为 competitive offering；各版本发布四年后转为 MPL-2.0。[C12][C13]

**推断：** 如果未来“通用 Gateway/注册中心”会以托管或嵌入方式提供给第三方，Consul 需要单独做许可审查，不能简单标成“免费开源注册中心”。本文不作法律结论。若只需要 catalog，引入它仍需保留消息 Gateway，因此一期实际至少多一个进程；Enterprise 才提供官方完整多租户控制面。

### 3.4 etcd：KV/lease 是建注册中心的原料，不是完整注册中心

#### 事实

- 官方定位是 distributed consistent KV；KV、Watch、Lease 是核心 gRPC services。lease 过期会删除所有关联 keys，keepalive 可续约；watch 能从 revision 监控变化，transaction 提供原子 If/Then/Else。[E2]
- 官方比较文档明确：Consul 是端到端 service discovery framework，具备内建 health checking、failure detection、DNS；若需要端到端 cluster service discovery，etcd 功能不够。[E1]
- 官方 Go naming/resolver 通过 watch 某服务前缀下的 endpoint keys 工作，endpoint 可附 lease 让失活主机被移除。这说明 etcd 能提供构建 discovery 的官方组件，但仍需应用定义 key/value、健康语义与客户端集成；该页还标注 gRPC resolver 依赖为 experimental。[E5]
- RBAC 给 role 授予单 key 或 `[start,end)` range 的 read/write，再把 role 授予 user。可以用 `/tenants/<id>/...` 前缀配合 range 权限做项目自建隔离，但“value 里写 tenant=A”并不是 RBAC 边界。[E2][E3]
- `--client-cert-auth` 要求可信客户端证书；启用 auth 后证书 CN 可作为 etcd user。gRPC proxy/gateway 会终止 TLS，CN 方式不能透明穿过这些代理。[E3][E4]
- 官方 integrations 页面把 Go `client/v3` 标为官方维护；Node 下的 `mixer/etcd3` 等属于第三方，且页面明确第三方库不由 etcd 团队测试或维护。Node/TS 也可自行使用 gRPC/protobuf 或 `/v3/*` JSON gateway，但 gateway 不支持 TLS CN 认证。[E6][E9]
- 单机可直接运行一个 member，适合本地开发；一成员 fault tolerance 为 0。生产 quorum 推荐奇数成员，三成员容忍一个故障、五成员容忍两个，不能把单机的“分布式 KV”名称误当作高可用。[E7][E8]

**推断：** etcd 适合已经明确需要一致性 KV/lease/watch，且愿意自建目录与健康语义的团队。为一期单机注册/心跳同时引入 etcd + 自研目录服务，会比问题本身多出显著代码和运维；它也不能替代消息 Gateway。

### 3.5 OIDC / OAuth2 / mTLS：机器身份的正确标准位置

#### 事实

- OIDC Core 让 client 验证 **End-User** 身份并获取 profile；其 ID Token 描述 authentication event。它不是节点 API 授权的通用替代品。[R1]
- OAuth 2.0 Client Credentials grant 允许 client 以自身名义取得 access token，规范要求仅用于 confidential client，且不应在该流程返回 refresh token；过期后应重新走 token 流程。[R2]
- RFC 7523 定义 JWT 用作 OAuth client authentication 和 authorization grant，要求校验 issuer、subject、audience、expiration 与签名；它不能省略资源服务端自己的 audience/权限策略。[R3]
- TLS 1.3 的服务端认证总是存在，客户端认证可选；它保护通道，不规定上层如何解释证书。[R4]
- RFC 8705 区分 **mTLS OAuth client authentication** 与 **certificate-bound access token**：前者认证 token endpoint 的 client，后者让 resource server 校验 token 对应的证书指纹。二者互补但可独立部署；普通 bearer token 不会因 token 获取时用了 mTLS 就自动变成证书绑定 token。[R5]
- Keycloak 官方 service account 实现了 `grant_type=client_credentials`，支持 client secret、signed JWT assertion 等；默认只返 access token、不创建 user session、不返 refresh token，过期后重新认证。[K1] Keycloak 本身是要另行管理的独立 server。[K2]

**推断：** 对当前“中心/节点都是机器角色”的连接，应谈 OAuth2 Client Credentials、私钥/JWT、NKey 或 X.509，而不是把人类 OIDC 登录流硬套到节点。若组织已有 IdP，可复用；若仅为单机 MVP 新起 IdP，则同时引入发行方、密钥/客户配置、token 更新和可用性运维，且仍没有 broker 或注册中心。

### 3.6 Node/TypeScript 客户端与服务端实现技术一览

| 候选 | Node/TypeScript 客户端 | 服务端实现与部署 |
|---|---|---|
| NATS | 官方 `nats.js`，Node TCP transport；Core/JetStream/KV/Services 可分别引入。[N14] | 官方 Go `nats-server` 独立进程；Core 与 JetStream/KV 的启动配置不同。[N7][N9][N15] |
| Consul | 直接封装官方 HTTP API；官方库页只将 Go `api` 标为 Official，未找到同等级官方 TS SDK。[C10][C11] | 独立 Consul agent/server binary，不是 TS 插件；单机可开发运行，集群另需 Raft bootstrap。[C9] |
| etcd | 官方列出 Node 第三方包但不负责测试/维护；也可自行使用 gRPC/protobuf 或 `/v3/*` JSON gateway，注意后者不能沿用 TLS CN 认证。[E6][E9] | 官方 Go server；本地可单 member，生产 HA 需奇数成员与 quorum。[E7][E8][E10] |
| Keycloak / OAuth2 | 以 HTTPS token endpoint、JWKS/issuer 校验和资源服务端验证为集成面；本文未选定或宣称 Keycloak 官方 TS SDK。[R2][R3][K1] | 独立 Keycloak/IdP server，不替代 Gateway 或 registry。[K2] |
| 保留自研 Gateway | 中心与节点 DSH 插件可继续使用 Node/TypeScript 客户端。 | 独立 Gateway 本身就是项目自研 Node/TypeScript 服务时，进程数不增加，但连接、鉴权、注册/心跳和可靠投递都要由项目实现并验证。 |

**推断：** “Node/TypeScript 技术栈”只约束项目客户端与插件，不应被写成“所有基础设施都应以 npm 内嵌”。上述成熟候选大多把独立服务端进程与官方/第三方客户端清楚分开。

## 4. 认证 / 授权 / 租户隔离分层

### 4.1 必须分别回答的六层问题

| 层 | 要回答的问题 | 可复用机制 | 仍需项目决定 |
|---|---|---|---|
| **1. 通道保护** | 是否防窃听/篡改，Gateway 是否真实？ | TLS；NATS、Consul、etcd 都支持相应 TLS 配置。[N4][C13][E4] | 监听地址、CA/证书签发与轮换、loopback 是否仍需凭据。 |
| **2. 连接认证** | 对端是哪个 user/client，是否持有私钥或有效凭据？ | NATS NKey/JWT/mTLS；Consul ACL token；etcd user/mTLS；OAuth2 client credentials。[N1][N3][C4][E3][R2] | 逻辑节点 ID 与凭据的一一绑定、重装/复制/重连规则、撤销。 |
| **3. 基础设施授权** | 能访问哪些 subject、catalog/key/API？ | NATS subject permissions；Consul ACL；etcd key-range RBAC；OAuth scope。[N1][C4][E3][R2] | 最小权限模板，系统 account、注册写权限、KV watch 权限、管理面隔离。 |
| **4. 业务授权** | 能否以该 node 身份注册、上报某事件、领取某任务、读取某历史？ | 基础设施只能提供已认证 principal 与部分粗粒度限制。 | 每个事件的 role/resource/action 校验、任务认领、source 归属、中心 single writer 与管理操作。 |
| **5. 租户隔离** | 哪些消息、目录、历史、任务和观测数据互相不可见？ | NATS account 是 broker 层硬边界；Consul Enterprise namespace/partition 是 Consul 资源边界；etcd prefix/RBAC 是自建 KV 边界。[N2][C5][E3] | tenant 定义、跨租户中心、中心数据库与事件历史、凭据/密钥、观测查询、导出/备份、跨租户共享审批。 |
| **6. 调度健康与能力** | 是否在线、健康、可接此类任务？ | PING/PONG、`$SRV`、Consul checks、etcd lease 可提供活性原语。[N6][C3][E2] | heartbeat 间隔/超时、readiness、worker 类型、slots、网络域、版本兼容、路由与 fencing。 |

### 4.2 “多租户”到底由什么实现

| 机制 | 能隔离什么 | 不能推出什么 |
|---|---|---|
| **broker accounts（NATS）** | subject namespace 与账号内 users/permissions；跨账号仅显式 export/import；JetStream 也按 account 配置。[N2][N17] | 不自动隔离中心自己的数据库、业务日志、任务系统或人类用户；也不自动生成跨租户中心路由。 |
| **ACL / namespace / partition** | ACL 限制已认证身份能做什么；Consul Enterprise namespace/partition 隔离 Consul 资源和管理域。[C4][C5][C6][C7] | CE 里只有 ACL 不能宣称获得官方多租户；任何 ACL 都不等于业务行级隔离。 |
| **KV prefix + range RBAC（etcd）** | 限制用户能读写哪些 key range。[E2][E3] | 不提供现成的 tenant 生命周期、业务路由、查询过滤或中心历史隔离。 |
| **应用层 `tenant` 字段** | 可作为索引、审计、路由和策略输入。 | 若由发布者自行填写，它毫无防伪作用；只有从已认证 principal 导出/校验，并在每次读写与订阅时由服务端强制执行，才成为授权模型的一部分。 |
| **OAuth/OIDC claims、mTLS certificate identity** | 提供 client/user 身份及可映射的属性。[R1][R3][R5] | scope、role、realm、CN、SAN 本身不是完整租户边界，也不证明物理机器唯一性。 |

### 4.3 身份“防伪”的实际剩余问题

**事实：** NATS NKey nonce、NATS JWT 链、mTLS 都能验证私钥持有与签发链；普通 bearer JWT/token 的持有者则可能被复制滥用，RFC 8705 的证书绑定才进一步限制 resource access 必须持对应私钥。[N3][N4][R5]

**推断：** 这些机制证明的是“某份凭据控制了当前连接”，不是“世界上只有这一台机器”。项目仍需定义：

- 每机逻辑 node ID 如何生成、是否与一份凭据唯一绑定，是否允许同 ID 双连接；
- 重连后的新连接是否 fencing 旧连接，旧连接的延迟消息如何拒绝；
- 能力清单是自声明还是中心审批，版本变更如何生效；
- 凭据撤销、轮换、重装、备份恢复和本机多用户读取风险；
- 消息 envelope 中的 `source/nodeId/tenant` 如何由服务端从认证上下文填充，而不是信任客户端自报。

## 5. 是否必须另加独立注册中心进程

### 5.1 结论边界

**事实：** 三类候选证明“注册中心”可以是不同形态：Consul 是完整独立 catalog 进程；NATS Services 是 broker 上由客户端库参与的在线发现；NATS KV / etcd 是可自建目录的 KV 原语。[C1][N5][N6][N9][E1] **推断：** 因此不能从“有注册/心跳”直接推出“必须再有一个独立注册中心进程”。

**推断：** 一期不必新增独立注册中心，但“不要新进程”与“不要注册语义”不是一回事。节点档案、在线状态、能力和路由仍必须有明确 owner 与权威状态。

### 5.2 可以不另加的条件

同时满足以下条件时，独立注册中心通常不是必需：

- 只有一个中心权威写入者，节点数量和业务数量都小，没有第二个控制面需要共享 catalog；
- 只需要配置 Gateway 地址、认证后注册、在线/离线判断和简单能力过滤，不需要 DNS、复杂健康查询或跨系统目录；
- 目录可保存在当前 Gateway/中心已有状态里，或 NATS 的在线 `$SRV` + 项目注册事件已满足；
- 接受单机和单故障域，未把高可用、跨中心一致性纳入一期；
- 注册协议、健康/readiness 和业务授权已有清晰实现与测试，而不是靠产品名代替。

### 5.3 值得引入独立注册中心的条件

至少出现一项真实需求，再评估 Consul/etcd，而不是预先堆叠：

- 节点档案必须独立于 broker/中心生命周期长期保存，并被多个系统或多个控制面共享；
- 需要 Consul 式 catalog、成熟健康检查、DNS/HTTP 查询、anti-entropy，而不愿自研；
- 需要强一致目录、lease/watch/事务来协调多个写者，且愿意在 etcd 上自建其余 registry 语义；
- 节点/服务来自不同平台，已有 Consul/etcd 作为组织级目录，可复用现有运维体系；
- 明确要把目录故障域、备份、访问策略与消息 broker 分离，并接受新增进程和运维；
- 多业务已落地后，目录的查询、授权、容量和跨租户共享复杂度超过现有 Gateway 的合理职责。

### 5.4 对一期双进程数量的实际影响

| 方案形态 | 实际进程/职责变化 | 是否仍符合当前“双进程”边界 |
|---|---|---|
| 保留自研 Gateway，目录在 Gateway/中心内 | 仍是一个独立 Gateway + 一个 DSH 宿主 | 可以；但需证明目录持久化与身份语义足够。 |
| `nats-server` 直接替代 Gateway，DSH 中心插件承担注册/能力/路由控制 | 一个 NATS + 一个 DSH 宿主 | 进程数可以保持；**但 Gateway 职责归属改变，且 NATS 本身不是 Node/TS 服务端。** |
| 自研 Gateway/适配器 + 独立 NATS | DSH 宿主 + Gateway 适配器 + NATS | 增加一个进程；除非确有隔离理由，不符合最小化目标。 |
| NATS + 独立注册控制 sidecar | DSH 宿主 + NATS + sidecar | 增加一个进程；sidecar 又成为待保护的通用控制面。 |
| 保留 Gateway + Consul 或 etcd | DSH 宿主 + Gateway + Consul/etcd | 至少增加一个进程；Consul 的本地 agent、HA 成员或代理还可能继续增加。 |
| 保留 Gateway + 独立 IdP | DSH 宿主 + Gateway + IdP | 至少增加一个进程；若组织已有 IdP，则新增的是外部依赖而非本机进程。 |

**推断：** “NATS 一个进程覆盖最多”只是部署可能性，不是最终架构答案；真正要比较的是 **现有双进程内需要保留多少项目协议代码**。

## 6. 一期与未来通用平台各自仍需决定的问题

### 6.1 一期：只做单机最小链路时必须收敛的决定

1. **Gateway 的实现归属：** 保留自研 WS/WSS，还是 `nats-server` 直接成为独立 Gateway；是否接受 broker 为 Go 独立进程而项目仅写 Node/TS 客户端与控制逻辑。
2. **进程与职责是否同时变化：** 若 NATS 化，注册/能力/幂等/路由由中心插件还是 Gateway 包承担；不能在不讨论的情况下从 Gateway 移到中心，也不能暗中多出 sidecar。
3. **最小身份模型：** node ID 如何配置和绑定凭据，中心与节点各用什么 principal，loopback 的最低认证要求是什么，secret 如何落盘且不进模型上下文。
4. **注册数据契约：** 持久档案与在线状态分别包含哪些字段，能力声明的版本、schema 与审批方式，节点重装/重复 ID/重连的处理。
5. **健康定义：** PING/PONG、业务 heartbeat、readiness、slots 是否分开，超时后任务如何处理；不把 broker 活性当作任务可执行性。
6. **投递契约：** 继续使用 Core 式在线投递还是 JetStream，哪些消息必须持久化；事件 ID 的全局业务去重如何跨重启/超出去重窗口保持；PubAck、consumer ack 与任务完成如何区分。
7. **单业务边界：** 一期 tenant 是否只是单一固定值，明确“不在一期实现多租户”，但消息与目录是否保留向前兼容的命名空间，避免二期重写。
8. **验收部署：** 监听 loopback、数据目录、升级/重启、Gateway 停止后重连，以及 UI 启停如何管理外部二进制；不得把开发模式无认证配置当作生产默认。

### 6.2 未来通用平台：应另立项决定，不在本轮扩大

1. tenant 到底对应业务、组织、人类用户还是机器池；节点与用户的身份是否分属不同 principal 类型。
2. 每租户独立 NATS account 还是共享 account + subject ACL；中心如何跨账号收派，export/import 由谁审批，系统 account 如何最小授权。
3. 中心事件历史、任务、凭据、观测、导出和备份如何隔离；不能只验收 broker 隔离便宣称平台多租户完成。
4. 是否接入组织 OIDC/OAuth2、使用 signed JWT/private key 还是 mTLS，token/certificate 的签发、轮换、撤销与离线行为。
5. 是否需要 Consul Enterprise namespaces/admin partitions，是否能接受其商业版本与 BUSL 许可；CE 不得被描述为官方多租户方案。
6. 注册目录是否要成为独立共享控制面，谁拥有权威写入、如何备份、跨中心一致性和故障域如何设计。
7. 多中心、多 Gateway、HA、跨地域、多活、租户配额与 noisy-neighbor 控制；这些均超出一期逻辑单中心/单 Gateway 范围。
8. 通用服务对外提供时的许可证、托管责任、管理面租户隔离和供应链审查；尤其不能把 Consul CE 的许可与功能当成 NATS/etcd 的 Apache-2.0 条件。[N15][E10]

## 7. 来源列表

以下来源均为官方文档、官方源码/许可证或正式规范；每条访问日期均为 **2026-11-13**。链接在正文中以 `[编号]` 引用。

### NATS 官方

- **[N1]** NATS, *Core Concepts → Security*（accounts/users、认证、subject 授权、TLS/mTLS）：https://docs.nats.io/concepts/security （访问日期：2026-11-13）
- **[N2]** NATS, *Accounts and multitenancy*（account 隔离、users、JetStream per account、limits）：https://docs.nats.io/learn/security/accounts-and-multitenancy （访问日期：2026-11-13）
- **[N3]** NATS, *Decentralized authentication*（operator/account/user、NKey、JWT、nonce、revocation、bearer 例外）：https://docs.nats.io/learn/security/decentralized-auth （访问日期：2026-11-13）
- **[N4]** NATS, *Encryption & TLS*（server TLS、`verify_and_map`、mTLS 身份映射、证书轮换）：https://docs.nats.io/learn/security/encryption （访问日期：2026-11-13）
- **[N5]** NATS, *Services*（客户端 Services framework、命名/版本/endpoints、无持久服务记录）：https://docs.nats.io/learn/services/ （访问日期：2026-11-13）
- **[N6]** NATS, *Services → Discovery*（`$SRV.PING/INFO/STATS`、广播与 deadline、实例级发现）：https://docs.nats.io/learn/services/discovery （访问日期：2026-11-13）
- **[N7]** NATS, *Core NATS Deep Dive*（pub/sub、at-most-once、Core 无存储）：https://docs.nats.io/learn/core-nats/ （访问日期：2026-11-13）
- **[N8]** NATS, *Connecting*（长连接、PING/PONG 与默认活性检测）：https://docs.nats.io/learn/core-nats/connecting （访问日期：2026-11-13）
- **[N9]** NATS, *Key-Value Store*（KV 是 JetStream stream、API 与启用条件）：https://docs.nats.io/learn/key-value/ （访问日期：2026-11-13）
- **[N10]** NATS, *KV → TTL and limits*（per-key TTL 2.11+、create-only、put/update 不续期）：https://docs.nats.io/learn/key-value/ttl-and-limits （访问日期：2026-11-13）
- **[N11]** NATS, *KV → Watching*（初始快照 + live changes）：https://docs.nats.io/learn/key-value/watching （访问日期：2026-11-13）
- **[N12]** NATS, *JetStream → Delivery and acknowledgment*（at-least-once、ack/redelivery）：https://docs.nats.io/learn/jetstream/delivery-and-acknowledgment （访问日期：2026-11-13）
- **[N13]** NATS, *JetStream → Publishing*（PubAck、存储≠交付、`Nats-Msg-Id` 与有限去重窗口）：https://docs.nats.io/learn/jetstream/publishing （访问日期：2026-11-13）
- **[N14]** nats-io/nats.js 官方 README（Node/Bun/Deno/browser transports，Core/JetStream/KV/Services，Node 22+）：https://github.com/nats-io/nats.js （访问日期：2026-11-13）
- **[N15]** nats-io/nats-server 官方源码与许可证说明（独立 server、Apache-2.0）：https://github.com/nats-io/nats-server （访问日期：2026-11-13）
- **[N16]** NATS, *Auth callout*（外部 OIDC/custom auth 接入、2.10+、隔离与可用性边界）：https://docs.nats.io/learn/security/auth-callout （访问日期：2026-11-13）
- **[N17]** NATS, *Cross-account*（stream/service export/import、显式跨账号共享）：https://docs.nats.io/learn/security/cross-account （访问日期：2026-11-13）

### Consul 官方

- **[C1]** HashiCorp, *Define services*（核心发现全版本可用、name/id/tags/meta、Enterprise namespace 条件）：https://developer.hashicorp.com/consul/docs/register/service/vm/define （访问日期：2026-11-13）
- **[C2]** HashiCorp, *Register services and health checks*（agent、CLI、HTTP 注册与持久化）：https://developer.hashicorp.com/consul/docs/register/service/vm （访问日期：2026-11-13）
- **[C3]** HashiCorp, *Define health checks*（HTTP/TCP/TTL/gRPC 等及 application-level 语义）：https://developer.hashicorp.com/consul/docs/register/health-check/vm （访问日期：2026-11-13）
- **[C4]** HashiCorp, *ACL overview*（tokens、policies、roles、service/node identities）：https://developer.hashicorp.com/consul/docs/secure/acl （访问日期：2026-11-13）
- **[C5]** HashiCorp, *Administrate multi-tenant Consul datacenters*（CE 仅 default、Enterprise 多租户）：https://developer.hashicorp.com/consul/docs/multi-tenant （访问日期：2026-11-13）
- **[C6]** HashiCorp, *Namespaces overview*（Enterprise 资源隔离与委托管理）：https://developer.hashicorp.com/consul/docs/multi-tenant/namespace （访问日期：2026-11-13）
- **[C7]** HashiCorp, *Admin partitions overview*（1.11 引入、层级、Enterprise、WAN/跨 partition 限制）：https://developer.hashicorp.com/consul/docs/multi-tenant/admin-partition （访问日期：2026-11-13）
- **[C8]** HashiCorp, *Consul DNS overview*（DNS/HTTP discovery 与查询）：https://developer.hashicorp.com/consul/docs/discover/dns （访问日期：2026-11-13）
- **[C9]** HashiCorp, *Bootstrap a Consul datacenter*（独立 agent、单 server 开发边界、Raft bootstrap）：https://developer.hashicorp.com/consul/docs/deploy/server/vm/bootstrap （访问日期：2026-11-13）
- **[C10]** HashiCorp, *Consul HTTP API Overview*（catalog/health/ACL 等 API）：https://developer.hashicorp.com/consul/api-docs （访问日期：2026-11-13）
- **[C11]** HashiCorp, *Client Libraries & SDKs*（Official Go client 与社区库列表）：https://developer.hashicorp.com/consul/api-docs/libraries-and-sdks （访问日期：2026-11-13）
- **[C12]** hashicorp/consul 官方 LICENSE（BUSL-1.1、Additional Use Grant、四年转 MPL-2.0）：https://github.com/hashicorp/consul/blob/main/LICENSE （访问日期：2026-11-13）
- **[C13]** hashicorp/consul 官方 README（service discovery/mesh、CE 与 Enterprise、BUSL 标识）：https://github.com/hashicorp/consul （访问日期：2026-11-13）

### etcd 官方

- **[E1]** etcd, *etcd versus other key-value stores*（KV 定位，以及与端到端 Consul discovery 的差别）：https://etcd.io/docs/v3.7/learning/why/ （访问日期：2026-11-13）
- **[E2]** etcd, *etcd API*（KV/Watch/Lease、flat keyspace、range、transaction、keepalive）：https://etcd.io/docs/v3.7/learning/api/ （访问日期：2026-11-13）
- **[E3]** etcd, *Role-based access control*（user/role、key/range 权限、TLS CN、proxy 限制）：https://etcd.io/docs/v3.7/op-guide/authentication/rbac/ （访问日期：2026-11-13）
- **[E4]** etcd, *Transport security model*（client cert、trusted CA、mTLS）：https://etcd.io/docs/v3.7/op-guide/security/ （访问日期：2026-11-13）
- **[E5]** etcd, *gRPC naming and discovery*（endpoint keys、watch、lease 注册及 experimental 说明）：https://etcd.io/docs/v3.7/dev-guide/grpc_naming/ （访问日期：2026-11-13）
- **[E6]** etcd, *Libraries and tools*（官方 Go client、Node 第三方库及维护声明）：https://etcd.io/docs/v3.7/integrations/ （访问日期：2026-11-13）
- **[E7]** etcd, *FAQ*（quorum、单成员零容错、三/五成员容错）：https://etcd.io/docs/v3.7/faq/ （访问日期：2026-11-13）
- **[E8]** etcd, *Set up a local cluster*（本地 standalone 与开发用途）：https://etcd.io/docs/v3.7/dev-guide/local_cluster/ （访问日期：2026-11-13）
- **[E9]** etcd, *Why gRPC gateway*（`/v3/*` JSON gateway、TLS CN 不支持）：https://etcd.io/docs/v3.7/dev-guide/api_grpc_gateway/ （访问日期：2026-11-13）
- **[E10]** etcd-io/etcd 官方源码与许可证说明（Go server、Apache-2.0）：https://github.com/etcd-io/etcd （访问日期：2026-11-13）

### OAuth / OIDC / TLS 正式规范与官方实现

- **[R1]** OpenID Foundation, *OpenID Connect Core 1.0 incorporating errata set 2*（End-User 身份层、ID Token）：https://openid.net/specs/openid-connect-core-1_0.html （访问日期：2026-11-13）
- **[R2]** IETF, *RFC 6749 — OAuth 2.0 Authorization Framework*，尤其 §4.4 Client Credentials：https://www.rfc-editor.org/rfc/rfc6749.html#section-4.4 （访问日期：2026-11-13）
- **[R3]** IETF, *RFC 7523 — JWT Profile for OAuth 2.0 Client Authentication and Authorization Grants*：https://www.rfc-editor.org/rfc/rfc7523.html （访问日期：2026-11-13）
- **[R4]** IETF, *RFC 8446 — TLS 1.3*（服务端必认证、客户端可选认证、通道属性）：https://www.rfc-editor.org/rfc/rfc8446.html （访问日期：2026-11-13）
- **[R5]** IETF, *RFC 8705 — OAuth 2.0 Mutual-TLS Client Authentication and Certificate-Bound Access Tokens*：https://www.rfc-editor.org/rfc/rfc8705.html （访问日期：2026-11-13）
- **[K1]** Keycloak, *Server Administration Guide → Using a service account*（client credentials、signed JWT、默认无 refresh token/user session）：https://www.keycloak.org/docs/latest/server_admin/#_service_accounts （访问日期：2026-11-13）
- **[K2]** Keycloak, *Server Administration Guide → Basic Keycloak operations*（独立身份服务器边界）：https://www.keycloak.org/docs/latest/server_admin/#basic-keycloak-operations （访问日期：2026-11-13）

### API Gateway 职责参照

- **[G1]** Kong, *Kong Gateway entities*（Gateway Services、Routes、Consumers、Upstreams、Plugins）：https://developer.konghq.com/gateway/entities/ （访问日期：2026-11-13）
- **[G2]** Kong, *Routes*（请求匹配、代理至 Gateway Service、按 Route 应用插件策略）：https://developer.konghq.com/gateway/entities/route/ （访问日期：2026-11-13）
