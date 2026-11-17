# 身份、可靠性与现代性复审

> 状态：只读调研证据，不是架构决策，不修改现有实现。
>
> 调研日期：**2026-11-14**。范围仅覆盖连接认证、逻辑节点标识、可靠事件与相关基础设施边界；不评估执行编排或业务分派语义。
>
> 方法：优先采用 2024–2026 当前官方文档、正式标准和活跃项目的一手资料；仍有效但较早发布的标准按当前状态引用。文中将 **官方事实** 与 **项目推断** 分开。“主流”在这里指仍受支持、当前官方继续指导且有独立活跃实现，**不表示已取得行业占有率统计**。
>
> 版本基线：访问时 NATS **2.15 为 latest、2.14 为 maintained**，2.12/2.11 已 EOL，2.13 未发布；RFC 9562 于 2024-05 发布；Node 文档为 v24.22.3；Debezium 最新稳定文档为 3.7（示例 3.7.1.Final）；SPIRE 当前文档链接到 v1.16.0；Consul 节点配置取 v1.22.x；etcd 取 v3.7 稳定文档（v3.8 仍标为 DRAFT）。实际实施应固定并复测具体 patch，而不是把“最新”当版本号。[V1][U1][U2][R5][R6][S1][C1][C3]

## 1. 逐项 verdict

“保留”包括保留一期不引入某组件的边界；“降为可选”表示不作为一期默认，但满足触发条件后仍是正式演进路径，不是“淘汰”。

| 评估项 | Verdict | 结论与适用边界（项目推断） |
|---|---|---|
| **NKey 作为一期机器连接认证** | **保留** | 当前 NATS 官方仍把 NKey 作为标准认证方式：Ed25519 私钥对 server nonce 签名，seed 不跨线；官方还针对明文密码提示 `use nkeys or bcrypt`。少量、慢变化、由同一团队管理配置的一期正符合 centralized auth 的官方适用场景。[N1][N3] 但不应写成“所有规模下唯一官方首选”：动态用户、团队自助签发、既有 PKI 或组织 SSO 有各自更合适的机制。 |
| **NKey＋subject permissions；远程强制 TLS** | **保留** | 认证与授权仍是不同层；publish/subscribe allow-list 是官方当前最小权限模型。远程 TLS 提供服务端认证和传输保护；普通 TLS 不等于客户端证书认证，NKey 已承担后者，一期不必为“更现代”重复叠加 mTLS。[N2][N5] 足够的前提是每主体独立 seed、最小 subject 权限、seed 安全保存/轮换，以及中心校验已认证 principal 与 `nodeId/source` 的绑定。 |
| **NATS JWT / operator mode** | **降为可选** | 这是多团队、多 account、用户动态签发与撤销的演进位置，不是一期前置条件。operator→account→user 签名链、scoped signing key、过期与 revocation 都仍受当前官方支持；其用户连接仍以 NKey seed 签 nonce，因此并不是“废弃 NKey”。[N3][N4] 代价是信任根保护、account resolver、account push、凭据续期与撤销运维。 |
| **mTLS** | **降为可选** | 已有组织 PKI、自动证书签发/轮换，或未来采用 SPIFFE/SPIRE 时是合理路径。NATS `verify_and_map` 可要求客户端证书并把 SAN/DN 映射到 NATS user，权限模型可继续沿用。[N5] 没有 PKI 的一期自建 CA 只会增加证书生命周期工作；mTLS 不自动提供业务授权、持久 `nodeId` 或物理机器唯一性。 |
| **OIDC 经 auth callout 接入** | **降为可选** | 未来真实多用户、组织 SSO/LDAP/自定义 token 需要统一认证来源时采用。auth callout 自 NATS 2.10 起可用，当前文档明确支持 OIDC 场景；但它是外部 NATS auth service 验证并映射身份，不是 `nats-server` 直接变成标准 OIDC provider。[N6] auth service 位于新连接关键路径，需独立 account、考虑 xkey、超时与可用性，不能当作零成本配置开关。 |
| **本地 UUIDv4 持久 `nodeId`，普通启动只读** | **保留** | RFC 9562 仍正式定义 UUIDv4；初始化生成、持久复用也有当前 Consul 官方实现参照。[U1][C1] 一次性生成的逻辑 ID 不面临高频随机索引插入，UUIDv7 的主要收益不构成换号理由。普通启动只读、缺失/损坏失败、显式新建/克隆/恢复、中心拒绝重复 ID，比选择哪个 UUID 版本更直接地保障身份生命周期。 |
| **改选 UUIDv7 / ULID / 平台身份** | **降为可选，不替换既有 ID** | UUIDv7 适合需要按生成时间聚集索引的新高写入标识；RFC 的“优先 v7”针对 v1/v6，并非要求替代 v4。[U1] ULID 也提供时间排序，但它是独立社区规范，当前问题没有新增排序或短编码需求。[U3] 平台身份适合作为 attestation（证明）或 principal 绑定，不应直接取代应用自有持久 `nodeId`。既有 UUIDv4 永不因新算法重编号。 |
| **JetStream at-least-once＋中心长期 Idempotent Consumer** | **保留** | 当前 NATS 2.15 文档仍明确以 ACK/redelivery 提供 at-least-once；AWS 当前 Outbox 指南和模式原始出处也继续要求消费幂等。[R1][R4][R7] `Nats-Msg-Id` 只在有限窗口内抑制重复写入，PubAck 只证明 stream 已存储，均不替代中心长期去重。[R2][R3] 这是成熟可靠事件模式，不应因“exactly-once”宣传而改判为过时。 |
| **Transactional Outbox 作为所有事件的统一一期组件** | **降为可选；特定路径上条件性必需** | 不是所有发布者都必须另建一张 Outbox 表；但若承诺“本地数据库提交后，事件最终必发布”，则客户端内存重试、JetStream 和消费幂等都不能覆盖“提交后、发布前崩溃”的双写缺口，必须有 Outbox 或等价的持久重放机制。[R4][R7] 轻量实现可复用现有数据库与权威事件记录，只增加发布状态/中继，不引入 Debezium、Kafka 或新常驻进程。 |
| **一期不引入 SPIRE / Consul / etcd / 独立 IdP** | **保留** | 当前一个逻辑中心、少量机器主体、NATS 在线发现＋中心持久目录的场景，没有必须新增这些控制面的需求。SPIRE 官方部署包含 Server、每个节点的 Agent、注册条目、attestor 和 datastore；auth callout 本身就是新的关键路径服务；Consul/etcd 也不会自动替代现有消息通道或应用目录语义。[S1][S2][N6][C2][C3] 不为想象中的未来规模预付运行时与运维成本是合理的。 |
| **未来接入上述能力是否被一期堵死** | **保留演进空间，但不宣称零迁移成本** | 持久 `nodeId` 与可轮换 principal 分离、事件 ID 与业务幂等独立、在线 instance ID 不充当永久身份，使 JWT/mTLS/OIDC/SPIRE 可按需增加。[N3][N5][N6][S3] 真正的迁移工作在 principal 映射、account/JetStream 拓扑、证书/token 生命周期、目录导出和故障切换，不在把 UUID 换成另一格式。 |

**证据边界：** 未找到可支持“NKey 在所有部署中都是官方最佳”或“UUIDv4 已被 UUIDv7 正式取代”的一手表述，也未取得跨行业采用率数据；这些量化或绝对化命题应判为 **证据不足**，不影响上述有边界的保留结论。

## 2. 证据表

| 编号 | 一手事实 | 对本项目的意义（推断） | 来源 |
|---|---|---|---|
| E01 | NATS 当前维护 latest 与前一 minor；2026-09 的 2.15 为 latest，2026-04 的 2.14 为 maintained，2.12/2.11 已 EOL。 | 新实施不要因 auth callout 的最低版本是 2.10 就停在老版本；固定 2.14/2.15 受支持线的具体最新 patch。 | [V1][N6] |
| E02 | centralized authentication 的官方适用描述是“一支团队拥有配置、用户列表小且慢变化”；NKey 是三种本地凭据形式之一。 | 一期少量机器用户正是该模式的轻量甜点位；未来多用户先变化的往往是签发/配置管理需求，而非 NKey 签名算法失效。 | [N1] |
| E03 | NKey 基于 Ed25519；客户端以私有 seed 签 server 每连接 nonce，server 只保存公钥/验证签名，seed 不跨线。NATS JWT 普通用户也仍需 seed 签 nonce。 | NKey 是当前官方支持的公钥机器认证，不是明文共享密码的别名；迁到 NATS JWT 后仍复用同一密码学基础。 | [N1][N3][N4] |
| E04 | NATS permissions 分别限制 publish/subscribe subjects；allow-list 之外默认拒绝，空权限块不等于最小权限。 | 每主体使用明确 allow-list，不能授予 `>` 图方便；权限校验还需覆盖 JetStream/API 与 reply subject 的实际路径。 | [N2] |
| E05 | server-side TLS 只加密并认证服务端；`verify_and_map` 才要求并映射客户端证书。证书文件更新后需 reload，既有连接不自动重握手。 | 一期 NKey＋远程 TLS 已分工完整；未来 mTLS 的主要新增工作是 CA、续期、reload 和身份映射，而非多一个“现代”勾选项。 | [N5] |
| E06 | operator mode 用签名链替代 server 内完整用户列表；full resolver 保存 account JWT；scoped signing key 是官方推荐授权方式；撤销在 account push 后生效，凭据可带过期时间。 | NATS JWT 适合自治签发与多 account，但必须运维信任根、resolver 和撤销传播，不等于接入外部 OIDC IdP。 | [N3][N4] |
| E07 | auth callout 把客户端提交的凭据送到 `$SYS.REQ.USER.AUTH`；请求可包含明文 token/password/NKey 材料，官方建议专用 account，并可使用 xkey。auth service 不可用会使新连接等待后失败。 | 这是未来 SSO 的标准接入点，同时引入高权限新服务和可用性依赖；不能把 OIDC 验证简化为在 NATS 配置里填 issuer URL。 | [N6] |
| E08 | OIDC Core 证明的是 End-User（人类）身份；OAuth Client Credentials 允许 client 以自身名义取得 token；2025 OAuth Security BCP 推荐非对称 client authentication、最小权限和 audience 限制。 | 人类 SSO 与机器连接不要混为一套流程；未来若接 IdP，机器 client 与 human user 的 grant、token audience/scope、续期策略应分别设计。 | [O1][O2][O3] |
| E09 | NATS account 是隔离 subject namespace；跨 account 需显式 export/import；JetStream 按 account 启用并分存，旧 `$G` stream 不会随用户迁入新 account。 | 未来多租户不被 NKey 堵死，但 account 迁移不是改一行配置；必须规划跨 account 路由和已有 stream 的迁移/重放。 | [N7] |
| E10 | RFC 9562（2024）同时标准化 UUIDv4 与 v7；v4 使用 122 个随机位，v7 使用 48-bit Unix 毫秒时间戳＋74 个随机/可选计数位。 | v4 并未因新标准发布而过时；选择应依据排序、索引、隐私和运行时需求，而非“新版编号”。 | [U1] |
| E11 | RFC 明确 v7 改善数据库索引局部性，建议以 v7 替代 v1/v6；Node v24.22.3 的 `randomUUIDv7` 于 v24.16.0 加入，使用非单调时钟且不保证严格递增。RFC 也禁止把 UUID 当 security capability。 | 一次性 `nodeId` 没有足够索引收益支撑换号；时间排序不等于全局单调、认证或防伪。若未来选用 Node 内建 v7，还要先核对运行时下限。 | [U1][U2] |
| E12 | ULID 规范为 48-bit 毫秒时间＋80-bit 随机、26 字符 Crockford Base32；同毫秒默认不保证排序，monotonic factory 才提供额外策略。 | ULID 是可用的独立格式，但当前不需要改变编码或排序；若只需要 UUID 生态中的时间局部性，标准 UUIDv7 比更换整个 ID 格式更直接。 | [U3][U1] |
| E13 | Consul v1.22.x 的 `node_id` 是 UUID；未显式提供时会生成并持久化到 data directory，以在重启后保持；随机与 host-deterministic 路径均有官方支持。 | “初始化生成、持久复用”仍是当前产品 provisioning 实践。身份稳定来自 durable state 和生命周期规则，不是 UUID 版本。 | [C1] |
| E14 | NATS Services 为每个 running copy 自动生成新的 service ID；实例无需另行注册，停止后退出在线 discovery。 | 持久 `nodeId` 与在线 instance ID 应继续分层；未来更换注册中心也不能从临时服务 ID 反推永久逻辑身份。 | [N8][N9][N10] |
| E15 | JetStream 当前文档以 durable stream＋ACK/redeliver 实现 at-least-once；未 ACK 的消息会再次投递，重投还可能影响到达顺序。 | at-least-once 仍是正式承诺，消费者必须容忍重复；顺序要求需独立约束，不能由“持久化”推导。 | [R1] |
| E16 | PubAck 只证明消息已存 stream；发布超时的写入结果未知。稳定 `Nats-Msg-Id` 只在 duplicate window 内去重，当前教程说明默认 2 分钟，超窗可再次写入。 | 重试复用同一 `event.id` 正确；长期幂等记录仍不可删除为与 broker 窗口相同的短 TTL。 | [R2][R3] |
| E17 | AWS 当前 Transactional Outbox 指南把业务表与 outbox 表放在同一事务，并明确 relay 可能重复发布、消费者应记录 processed messages 保持幂等。 | Outbox 与 Idempotent Consumer 解决不同故障段，必须组合而非二选一。 | [R4] |
| E18 | Debezium 2026-11 的最新稳定线为 3.7.1.Final，当前稳定文档仍提供 Outbox Event Router，事件 ID 可用于去重。 | Outbox 在 2026 仍是活跃实现，不是遗留模式；但这不意味着一期应引入 Debezium/Kafka 运行时。 | [R5][R6] |
| E19 | 模式原始出处对 Idempotent Consumer 的示例以 `(subscriberId, messageID)` 主键检测重复，并与业务处理放在数据库事务中。 | 中心可用唯一 inbox 键＋同事务业务写入实现长期幂等，然后 ACK；单纯在内存里保存最近 ID 不够。 | [R7] |
| E20 | SPIRE 由 Server 与各节点 Agent 组成，含注册条目、node/workload attestation、SVID、key manager 和 SQL datastore；单 Server 是单点，HA 需要共享 datastore 的多个 Server。 | SPIRE 解决的是规模化自动签发与证明，运行面显著大于静态 NKey；一期没有这些需求就不引入。 | [S1][S2] |
| E21 | SPIFFE ID 采用 `spiffe://trust-domain/path` URI，SVID 是带签名、可过期的验证文档；规范允许 opaque path，并把附加元数据交给注册系统解释。X.509-SVID 必须且只能携带一个 URI SAN。 | 未来可让 SPIFFE ID 成为认证 principal、与持久 `nodeId` 映射；格式与规范的稳定不代表任意重新 attestation 都必然复用同一 ID，SVID 轮换不应隐式迫使业务逻辑 ID 改号。 | [S3][S4] |
| E22 | Consul 需要独立 agent/server 部署；etcd 是一致性 KV，官方明确其自身不具备 Consul 式端到端服务发现全套功能。 | 未来只有出现独立共享目录、复杂健康查询或多个控制面消费者时才值得新增；二者都不是认证或可靠事件的自动升级包。 | [C2][C3] |

## 3. 轻量实施建议

### 3.1 一期直接保留并补齐的最小集合

1. **固定受支持版本。** 选择 NATS 2.14 或 2.15 维护线的具体最新 patch，并记录 server/client 兼容验证；不要新部署已 EOL 的 2.12/2.11。[V1]
2. **每个主体独立 NKey。** server 配置只放 public NKey；私有 seed 经 OS 权限保护的凭据文件或现有 secret reference 提供，不进 URL、日志、镜像、备份明文包或模型上下文。中心与节点不共享 seed。[N1][N4]
3. **最小 subject 权限。** 每类 principal 只给实际 publish/subscribe allow-list，明确 request/reply inbox 与 JetStream 所需面；不要把空 permissions 或 `>` 当安全默认。[N2]
4. **远程 TLS 保持服务端身份校验。** 使用正确 CA 与证书 SAN/主机名匹配；普通远程连接不额外要求客户端证书，只有迁移到 mTLS 时才启用 `verify_and_map`。[N5]
5. **持久身份与认证凭据分离生命周期。** 最小身份事实保存 `formatVersion`、`nodeId` 和独立 `createdAt`；登记关系保存 `principalType`、public key/证书/SPIFFE/OIDC subject 等外部 principal 标识、状态和轮换历史。`nodeId` 不是 secret，也不是 public key 的别名；存储上复用现有身份记录与登记关系即可，不预设必须新增表。
6. **中心强制绑定。** 在登记/连接控制路径中，将 NATS 已认证 principal 与获准的 `nodeId`、subject 权限绑定；事件受理时只接受与有效登记相符的 `source`，不把 payload 中自报的身份当作认证结果。不要假设普通 NATS 消息会自动把发布者 principal 传播给中心，必须明确登记与后续发布如何保持同一身份约束。凭据轮换只改绑定，不改 `nodeId/source`；重复逻辑 ID、克隆和恢复仍按显式流程拒绝或审批。
7. **身份文件 create-once、普通启动只读。** 首次显式初始化用 CSPRNG 生成 UUIDv4，原子且默认不覆盖地写入专用 durable identity state；普通启动对缺失、不可读、损坏或非法值失败，不静默换号。NATS service ID 继续只表示本次在线实例。[U1][C1][N10]
8. **可靠事件保持同一 ID。** 所有重试复用 `event.id`，并映射到 `Nats-Msg-Id`；中心以长期唯一 inbox 键记录消费结果，和业务写入同事务提交后再 ACK。幂等保留期至少覆盖最大重连、离线、备份恢复和重放区间，不能用 broker 默认两分钟代替。[R1][R2][R3][R7]
9. **只给真实双写路径加 Outbox。** 若路径承诺“DB commit ⇒ 最终发布”，在同一数据库事务内写权威事件记录及其 unpublished/outbox 状态；中继在现有进程内重试，收到 PubAck 后只标记“已存入 stream”，崩溃后以相同 ID 重发。若权威事件记录已包含完整事件，只补充发布状态，避免复制第二份事件事实。[R2][R4]
10. **不新增重型运行时。** 一期无需为 Outbox 引入 Debezium/Kafka，也无需为少数静态用户引入 IdP/SPIRE；新增进程数量、独立状态、可用性关键路径和轮换工作应作为每次引入的验收项。[R5][S1][N6]

### 3.2 最小故障验证清单

- seed 轮换与旧 seed 撤销后，持久 `nodeId` 不变，越权 subject 仍被拒绝；日志与错误输出不包含 seed。
- 身份文件缺失、损坏、被复制到第二个实例时，不发生静默换号或重复身份共存。
- PubAck 丢失、发布超时、consumer 处理完成但 ACK 前崩溃、超过 duplicate window 后重试，都不会产生第二次业务效果。
- Outbox 路径在 DB commit 后、发布前崩溃，重启后仍以同一 `event.id` 最终发布；PubAck 后不把它误记为“所有消费者均已处理”。
- 若未来启用新 account，验证原 stream 的留存、迁移或重放方案，而不是只验证新连接能认证。[N7]

## 4. 未来迁移边界

| 未来触发条件 | 推荐演进位置 | 一期应保留的稳定面 | 新增运维与迁移成本 / 不应误判 |
|---|---|---|---|
| 用户和 account 动态增长、不同团队自行签发 | **NATS operator mode＋NATS JWT＋scoped signing key** | NKey nonce 签名、subject 权限语义、`nodeId`、事件信封与长期幂等 | 信任根离线保护、resolver、account push、撤销传播、凭据续期；不是 OIDC，也不需要独立 IdP。[N3][N4] |
| 已有 PKI，要求证书化机器认证与短期凭据 | **mTLS＋`verify_and_map`** | 远程 TLS、NATS user/subject 权限、principal→`nodeId` 映射 | CA/证书签发、续期、reload、SAN/DN 映射和旧连接处理；不要把 server-only TLS 当成 mTLS。[N5] |
| 人类用户需要组织 SSO，或身份事实已在 OIDC/LDAP/custom auth | **外部 IdP＋NATS auth callout** | NATS account/user/权限、`nodeId`、事件协议 | 新 auth service 的 HA、专用 account/xkey、issuer/audience/expiry/scope 校验和重连续期；人类 OIDC 与机器 OAuth client 流程分别设计。[N6][O1][O2][O3] |
| 多平台大量实例，需要自动 node/workload attestation 和短寿命 SVID | **SPIRE；优先评估 X.509-SVID→NATS mTLS** | 持久 `nodeId`、可轮换 principal、中心长期身份目录 | SPIRE Server、每节点 Agent、注册条目、datastore、attestor 和可用性。NATS 可读取 URI SAN，X.509-SVID 恰好包含一个 URI SAN，具备对接原语；仍须 PoC 验证预期 user 映射、其他 SAN 的影响、续期与重连，不宣称开箱即用。[N5][S1][S3][S4] |
| 独立持久目录需被多个控制面共享，或需复杂健康查询/强一致协调 | **再评估 Consul / etcd** | 中心持久逻辑目录、NATS 在线 instance ID、事件协议 | 需要导出/迁移目录、明确权威写者、备份和访问策略；NATS Services 不成为永久注册表，Consul/etcd 也不自动获得应用身份语义。[N8][C2][C3] |
| 新高写入标识确实出现随机 B-tree 插入瓶颈 | **只对新标识评估 UUIDv7** | 所有既有 UUIDv4 与 `source` 不变；`createdAt` 仍是独立事实 | 先做实际索引基准与运行时检查；v7 不保证严格递增，也不提供认证。不要把持久 `nodeId` 批量重写为 v7。[U1][U2] |
| 需要更短、可排序的外部 ID 且接受另一套生态 | **才评估 ULID** | 内部稳定 ID 与既有引用不变 | 新解析/校验/互操作约定；同毫秒排序策略另计。当前 `nodeId` 没有此需求，不迁移。[U3] |
| DB 与消息发布必须最终一致 | **为对应路径启用轻量 Transactional Outbox** | 同一 `event.id`、长期消费幂等、权威事件事实单一 | relay 恢复、重复发布、清理/保留、顺序和观测；Outbox 仍不提供端到端 exactly-once，CDC 产品不是必选项。[R2][R4][R5] |

### 不应被“未来可能用到”反向绑架的一期工作

- 不必预先建设 operator/resolver、CA、OIDC provider、SPIRE、Consul 或 etcd；只需避免把 `nodeId` 写成某种凭据格式，避免把在线 instance ID 当永久 ID。
- 不必为了“以后可能多用户”预先拆分所有 account；但必须承认从共享 `$G` 到独立 account 会涉及 subject 跨域和 JetStream 数据拓扑，不把未来迁移宣传为零成本。[N7]
- 不必把所有 ID 改为时间可排序格式；把生成策略与持久引用分离，未来允许新 ID 采用 v7 即可。
- 不必给所有事件机械增加 Outbox 表；只给具有明确“本地提交后最终发布”承诺的路径补足生产侧持久性。
- 不把 NKey、at-least-once、Outbox 或 UUIDv4 的年龄当成反证；当前官方支持、实际故障边界与运行成本才是复审依据。

## 5. 来源

以下来源均为一手官方文档、官方规范/源码或模式原始出处；**全部访问于 2026-11-14**。模式原始出处用于说明模式定义，不冒充行业标准或采用率统计。

### NATS 官方

- **[V1]** NATS, *Find Release Information*（当前支持线、2.15/2.14、2.12/2.11 EOL、2.13 skipped）：https://docs.nats.io/release-notes/ （访问日期：2026-11-14）
- **[N1]** NATS, *Authentication basics*（centralized auth 适用范围、NKey nonce/seed、明文密码警告）：https://docs.nats.io/learn/security/authentication-basics （访问日期：2026-11-14）
- **[N2]** NATS, *Authorization*（subject publish/subscribe allow/deny、scoped signing key）：https://docs.nats.io/learn/security/authorization （访问日期：2026-11-14）
- **[N3]** NATS, *Decentralized authentication*（NKey/Ed25519、JWT 信任链、scoped key、过期与撤销）：https://docs.nats.io/learn/security/decentralized-auth （访问日期：2026-11-14）
- **[N4]** NATS, *Operator mode*（resolver、用户凭据、撤销与凭据生命周期运维）：https://docs.nats.io/learn/security/operator-mode （访问日期：2026-11-14）
- **[N5]** NATS, *Encryption & TLS*（server TLS、mTLS `verify_and_map`、SAN/DN 映射、证书 reload）：https://docs.nats.io/learn/security/encryption （访问日期：2026-11-14）
- **[N6]** NATS, *Auth callout*（2.10+、OIDC/LDAP/custom auth、专用 account/xkey、新连接关键路径）：https://docs.nats.io/learn/security/auth-callout （访问日期：2026-11-14）
- **[N7]** NATS, *Accounts and multitenancy*（subject namespace、跨 account、JetStream per-account 与迁移边界）：https://docs.nats.io/learn/security/accounts-and-multitenancy （访问日期：2026-11-14）
- **[N8]** NATS, *Services → Discovery*（在线广播应答与实例发现）：https://docs.nats.io/learn/services/discovery （访问日期：2026-11-14）
- **[N9]** NATS, *Services → Scaling*（fresh instance ID、实例无需注册、停止退出 discovery）：https://docs.nats.io/learn/services/scaling （访问日期：2026-11-14）
- **[N10]** NATS, *Your first service*（service ID 仅为一个 running copy 的自动生成 NUID）：https://docs.nats.io/learn/services/your-first-service （访问日期：2026-11-14）

### 可靠事件与 Outbox

- **[R1]** NATS, *Delivery and acknowledgment*（at-least-once、ACK/redelivery、重投与顺序）：https://docs.nats.io/learn/jetstream/delivery-and-acknowledgment （访问日期：2026-11-14）
- **[R2]** NATS, *Publishing*（PubAck 仅为存储确认、未知发布结果、稳定 `Nats-Msg-Id`、默认两分钟去重窗口）：https://docs.nats.io/learn/jetstream/publishing （访问日期：2026-11-14）
- **[R3]** NATS, *JetStream API Headers* 与 *duplicate_window*（窗口内去重及配置语义）：https://docs.nats.io/reference/jetstream/api/headers ；https://docs.nats.io/reference/config/jetstream/limits/duplicate_window （访问日期：2026-11-14）
- **[R4]** AWS Prescriptive Guidance, *Transactional outbox pattern*（同事务 outbox、relay 重复、消费幂等、CDC 可选实现）：https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html （访问日期：2026-11-14）
- **[R5]** Debezium, *Releases Overview*（2026-11 当前 3.7.1.Final 稳定线）：https://debezium.io/releases/ （访问日期：2026-11-14）
- **[R6]** Debezium 3.7, *Outbox Event Router*（当前活跃 Outbox 实现与事件 ID）：https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html （访问日期：2026-11-14）
- **[R7]** Chris Richardson / Microservices.io, *Idempotent Consumer* 与 *Transactional Outbox*（模式原始定义、`(subscriberId, messageID)` 唯一键、relay 重复与消费幂等）：https://microservices.io/patterns/communication-style/idempotent-consumer.html ；https://microservices.io/patterns/data/transactional-outbox.html （访问日期：2026-11-14）

### UUID 与 provisioning

- **[U1]** IETF, *RFC 9562 — Universally Unique IDentifiers (UUIDs)*，2024-05，尤其 §5.4、§5.7、§6.11、§6.13、§8：https://www.rfc-editor.org/rfc/rfc9562.html （访问日期：2026-11-14）
- **[U2]** Node.js v24.22.3, *Crypto → `crypto.randomUUID` / `crypto.randomUUIDv7`*（v4 CSPRNG；v7 于 v24.16.0 加入、非严格递增）：https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptorandomuuidoptions ；https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptorandomuuidv7options （访问日期：2026-11-14）
- **[U3]** ULID 官方 canonical spec（48-bit 时间＋80-bit 随机、26 字符、同毫秒及 monotonic 边界）：https://github.com/ulid/spec （访问日期：2026-11-14）
- **[C1]** HashiCorp, *Consul v1.22.x — Node parameters*（UUID `node_id`、生成并持久化、host-deterministic 与随机路径）：https://developer.hashicorp.com/consul/docs/v1.22.x/reference/agent/configuration-file/node#node_id （访问日期：2026-11-14）

### OIDC / OAuth 正式标准

- **[O1]** OpenID Foundation, *OpenID Connect Core 1.0 incorporating errata set 2*，2023-12-15（End-User 身份层）：https://openid.net/specs/openid-connect-core-1_0.html （访问日期：2026-11-14）
- **[O2]** IETF, *RFC 6749 — OAuth 2.0 Authorization Framework*，§4.4 Client Credentials（client 以自身名义取得 token；与 2025 安全 BCP 配套阅读）：https://www.rfc-editor.org/rfc/rfc6749.html#section-4.4 （访问日期：2026-11-14）
- **[O3]** IETF, *RFC 9700 — Best Current Practice for OAuth 2.0 Security*，2025-01（非对称 client auth、sender constraint、最小权限与 audience）：https://www.rfc-editor.org/rfc/rfc9700.html （访问日期：2026-11-14）

### SPIFFE / SPIRE 与独立目录

- **[S1]** SPIFFE, *SPIRE Concepts*（Server、每节点 Agent、注册条目、attestation、SVID、SQL datastore），当前页面链接到 SPIRE v1.16.0：https://spiffe.io/docs/latest/spire-about/spire-concepts/ （访问日期：2026-11-14）
- **[S2]** SPIFFE, *Scaling SPIRE*（单 Server 单点、HA 多 Server＋共享 datastore、部署拓扑）：https://spiffe.io/docs/latest/planning/scaling_spire/ （访问日期：2026-11-14）
- **[S3]** SPIFFE, *SPIFFE Identity and Verifiable Identity Document*（Stable；SPIFFE URI、SVID、opaque identity 与元数据解释边界）：https://spiffe.io/docs/latest/spiffe-specs/spiffe-id/ （访问日期：2026-11-14）
- **[S4]** SPIFFE, *X509-SVID*（Stable；leaf certificate 恰好一个 URI SAN、其他 SAN 类型与验证约束）：https://spiffe.io/docs/latest/spiffe-specs/x509-svid/ （访问日期：2026-11-14）
- **[C2]** HashiCorp, *Bootstrap a Consul datacenter*（独立 Consul server/agent 与 Raft bootstrap 运维）：https://developer.hashicorp.com/consul/docs/deploy/server/vm/bootstrap （访问日期：2026-11-14）
- **[C3]** etcd v3.7, *etcd versus other key-value stores*（一致性 KV 与端到端 Consul 服务发现的职责差异）：https://etcd.io/docs/v3.7/learning/why/ （访问日期：2026-11-14）
