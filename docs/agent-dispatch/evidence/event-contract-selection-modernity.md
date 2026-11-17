# 事件契约选型的现代性复审：CloudEvents、NATS、AsyncAPI 与 Registry

> 状态：只读调研与选型建议，不代替最终决策。
>
> 截止日期与所有外部 URL 访问日期：**2026-11-14**。
>
> 范围：一期 NATS + JetStream、CloudEvents 1.0.2 structured JSON；复审 envelope、content mode、CE `subject`、CE `type` 与 NATS subject 的关系、AsyncAPI、contract-first 和 schema registry。不评价其他领域语义。
>
> 标注：**文档标准**指正式发布规范的规则；**行业惯例**只指可由实现方官方材料核验的实践，不自动代表多数或排名；**项目选择**是基于前两者的 DSH 适配判断。WIP、项目示例、厂商产品建议均不冒充正式标准或市场统计。

## 1. 结论摘要

1. **保留 CloudEvents Core + JSON Event Format + 正式 NATS binding 1.0.2 的 structured JSON。**理由不是“老标准更保险”，而是：它正好覆盖当前 NATS 正式 binding 的线上表示，JSON 是 Core 要求所有实现支持的格式，官方仍有 2025 年 SDK release，且有当前开源项目的 structured-over-NATS 实践。自定义 JSON 在一期不会省去多少字段，却会失去共同 envelope 语义。[CE0]–[CE5][P4]
2. **保留“DSH 原生事件不生成、不依赖 CE `subject`”。**它是 OPTIONAL，不是 NATS subject；当前官方实践同时使用与省略两种做法。省略适用于一期没有通用对象级过滤需求的情况，但不能把外部带 `subject` 的合法 CloudEvent 判为不合规。[CE1][P3][P4]
3. **改选为：在仓库内事件目录中逐项显式声明 CE `type` 与 NATS subject，二者语义独立。**允许某个条目二者恰好同值，也允许地址带统一命名空间，但不设置全局 `type == subject` 或 `subject = prefix + type` 推导规则。当前最直接的一手实例均把两者作为独立值；同值或统一前缀映射的“行业惯例”证据不足。[CE3][N1][P1][P2][P4]
4. **AsyncAPI 3.1 降为可选、可后补；NATS binding 0.1 不是一期采用理由。**AsyncAPI Core 和工具在 2026 年仍活跃，但 NATS binding 只有 operation `queue` 一个实质字段，server/channel/message binding 都为空。若只是为“现代最佳实践”增加一份手写 YAML，一期属于过度治理；若已有外部协作、文档/模型生成或 CI diff 的消费者，一份由目录生成的 AsyncAPI 文件可以很轻。[A1]–[A4]
5. **保留轻量 contract-first，不引入 registry 服务。**一期用版本化 JSON Schema、事件目录、示例和兼容性/收发契约测试即可。contract-first 不等于 AsyncAPI，schema 文件也不等于 Schema Registry 服务。官方案例同时存在 schema-first、code-first 和配置生成文档，不能宣称只有 contract-first 是现代路线。[A5]–[A8][R1][R2]
6. **xRegistry 继续暂缓，但撤回任何“项目不活跃”的潜在理由。**当前最新是 2026-08-19 发布的 `v1.0-rc4`，reference server 在访问日仍有提交，且 Message Registry 能直接表达 CloudEvents + NATS subject + data schema。暂缓是因为一期没有跨应用 registry/discovery 需求且版本仍为 RC，不是因为项目陈旧或没有工具。[X1]–[X3]
7. **现代事件驱动最佳实践不要求 AsyncAPI。**必要的是可识别的 envelope、明确的地址与 schema、兼容演进规则以及可执行验证；AsyncAPI 是这些契约的一种机器可读描述和工具入口，不是运行时或治理的前置条件。[A1][A5]–[A7]

## 2. 逐项 verdict

| 复审项 | verdict | 性质与理由 |
|---|---|---|
| CloudEvents Core 1.0.2 | **保留** | **文档标准 + 项目选择。**当前正式 latest release 仍是 1.0.2，线上 `specversion` 为 `1.0`；共同 `id/source/type/specversion` 对 DSH 有实际价值，非仅因 CNCF 身份保留。[CE0][CE1] |
| JSON Event Format 1.0.2 | **保留** | **文档标准 + 项目选择。**Core 要求所有实现支持 JSON；官方有可直接使用的 Draft-07 envelope JSON Schema，单机无需 registry 即可校验。[CE1][CE2] |
| CloudEvents NATS binding 1.0.2 | **保留** | **文档标准。**正式版明确规定 NATS payload 是 UTF-8 structured JSON，不约束 transfer/settlement，也不定义 CE `type` 到 NATS subject 的算法。[CE3] |
| DSH 原生事件省略 CE `subject` | **保留** | **项目选择。**Core 仅将其列为 OPTIONAL；限定为“原生不生成、不依赖”，不是“所有输入拒绝、所有转发剥离”。[CE1][P3] |
| structured JSON 作为一期 content mode | **保留** | **文档标准 + 项目选择。**正式 NATS binding 只有这一条无歧义路径；structured 自包含、便于原样跨 hop 转发。不是因为它比 binary “更新”。[CE3] |
| NATS binary content mode | **降为可选** | **证据充分但一期不采用。**NATS headers 和当前 Dapr 文档证明 binary 是现实做法；然而 CloudEvents NATS binary 规则仍位于 `1.0.3-wip`，2026-10 仍在修订，不能冒充 1.0.2 正式能力。[CE4][P3] |
| Avro / Protobuf / 其他 event format | **降为可选** | **文档标准存在，当前需求不足。**Avro、Protobuf Event Format 已有 1.0.2 release，但正式 NATS message mapping 要求 JSON Event Format；一期没有跨语言二进制 schema/toolchain 收益就不增设第二格式。[CE0][CE3] |
| AsyncAPI 3.1.0 | **降为可选** | **文档标准 + 项目选择。**2026-01-31 正式发布且核心工具已跟进，但其价值在 API 描述与工具化，不是线上互操作或“现代性”的强制门槛。[A1][A2][A5]–[A7] |
| AsyncAPI NATS binding 0.1.0 | **降为可选** | **文档标准覆盖有限。**只增加 operation `queue`；基本 NATS 地址应使用 Core `channel.address`。只有确需描述 queue 时才增加 binding，不为形式完整而填空对象。[A1][A3] |
| `type` 与 NATS subject 独立、逐项显式声明 | **改选** | **行业实例 + 项目选择。**正式 binding、Go SDK、Sveltos 都提供独立值实例；显式目录避免隐式算法，同时允许一对多、多对一和外部类型适配。[CE3][P1][P2][P4] |
| 全局 `NATS subject == CE type` | **降为可选** | **项目局部选择；行业普遍性证据不足。**技术上可行，但会收紧 `type` 字符、耦合类型与地址演进。允许个别目录条目同值，不再作为原生事件全局首选。[CE1][N1][P1][P2] |
| 全局 `NATS subject = 固定前缀 + CE type` | **改选** | **改为显式目录。**这是自定义映射而非 CloudEvents/NATS 标准；统一地址命名空间仍可保留，但每个发布地址直接写出，不再靠隐藏拼接规则获得一致性。[CE3][N1] |
| 三种寻址关系的流行度排名 | **证据不足** | 本次一手材料能证明独立值实例存在，不能给出统一分母或多数比例；也不能证明同值/前缀不存在。不得把“本次未找到”写成“行业没有”。 |
| xRegistry `v1.0-rc4` | **降为可选（一期暂缓）** | **文档标准仍处 RC + 项目需求不足。**能力匹配且项目活跃，但 registry 模型/API、跨应用目录和治理成本超出最小链路。[X1]–[X3] |
| contract-first | **保留为轻量纪律** | **行业实践之一 + 项目选择。**schema/catalog 先行、示例与兼容测试随实现合并即可；不强制 AsyncAPI 文档先行，也不排斥其他团队 code-first。[A5]–[A7] |
| 独立 Schema Registry 服务 | **降为可选** | **行业产品成熟，一期增量不足。**Kafka/Event Hubs 生态有明确产品与 SDK，但 DSH 一期同仓库、少量事件的 schema 用 Git + CI 更轻；需要在线发现、跨团队共享和集中兼容策略时再引入。[A6][A8][R1][R2] |
| “必须 AsyncAPI 才算现代 EDA” | **改选** | **否定必要论。**改为“必须有可验证、可演进契约；AsyncAPI 可后补”。官方生产案例本身就有 code-first、无 registry 的路线。[A5]–[A7] |

## 3. CloudEvents 当前状态：稳定、活跃与适配是三件事

### 3.1 版本旧不等于项目停滞，也不等于必须保留

**文档标准与发布事实：**

- 官方 README 当前仍把 Core、JSON、Avro、Protobuf 和 NATS binding 的 latest release 列为 **1.0.2**，工作树另列 WIP；GitHub latest release API 的 `published_at` 为 **2022-02-06**。[CE0]
- CloudEvents 于 **2024-01-25** 成为 CNCF Graduated；当前 CNCF 项目记录仍带 `graduated` 分类。这是治理/成熟度证据，不是采用量排名。[CE0]
- JavaScript SDK 最新正式 release 为 **v10.0.0（2025-06-10）**，增加 Node 24 支持；Go SDK 最新正式 release 为 **v2.16.2（2025-09-22）**。它们证明 SDK 仍有维护活动，不证明每个 binding 的成熟度相同。[CE5]
- NATS binding 工作树当前为 **1.0.3-wip**，2026-10 的提交仍在澄清 content-mode detection。[CE4]

**项目判断：**DSH 保留的是当前仍可实现、可校验、与 NATS 正式 binding 精确匹配的 envelope，不是保留一个仅因“有标准”而存在的层。反之，1.0.2 发布时间较早也不能成为改用私有 JSON 或 WIP binary 的理由。

### 3.2 CE `subject`：省略是合法且有现实实践的项目 profile

**文档标准：**Core 的 REQUIRED 属性只有 `id/source/specversion/type`；`subject` 是 OPTIONAL，表示 `source` 上下文中事件所涉及的对象，尤其适合通用中间件在不理解 `data` 时做对象过滤。它不是 NATS 路由地址，OPTIONAL 属性在中介中 SHOULD 被转发。[CE1]

**当前一手实践：**

- Dapr v1.19 自动生成的 CloudEvent 示例包含独立 `topic: orders`、固定 `type: com.dapr.event.sent`、`data.orderId`，但没有 CE `subject`；同一文档也展示用户自定义事件可使用 `subject`。[P3]
- Sveltos 当前 NATS/JetStream 文档明确把 NATS subject、CloudEvent source/type/subject 分成不同过滤条件，并用 CE `subject` 识别来源内资源。[P4]

**项目选择：**一期没有通用对象级过滤需求时，DSH 原生事件直接省略 JSON 成员 `subject`，对象标识由各事件 `data` schema 表达；消费者不依赖它。通用 CE receiver 不应拒绝带 `subject` 的外部事件，中介也不应默认剥离。未来出现“通用中间件必须按对象过滤”或明确外部契约时再按事件类型引入，不做全局必填。[CE1][P3][P4]

### 3.3 structured、binary 与其他格式：都是当前技术，按 binding 和需求选

| 方案 | 当前一手事实 | 对一期的判断 |
|---|---|---|
| **structured JSON** | 正式 NATS binding 1.0.2 要求 payload 为 JSON Event Format；属性和 `data` 在同一 JSON 中，规范说明其便于跨 hop/protocol 转发。[CE3] | **采用。**自包含、易检查和统一校验；一期没有测量出的传输瓶颈时，不为理论性能提前换格式。 |
| **binary** | Core 定义属性进入协议 metadata、`data` 独立成 body；Dapr v1.19 当前文档提供 binary 发布方式。CloudEvents NATS 的对应规则仍只在 1.0.3-wip，包含 `ce-` headers、转义和 mode detection。[CE1][CE4][P3] | **暂不采用。**binary 并不落后，但当前正式 NATS binding 状态与额外 header/profile 复杂度不占优。待正式 release、真实 payload/性能需求及收发双方支持齐备后重评。 |
| **Avro / Protobuf Event Format** | 两者均在官方 1.0.2 released 文档族；JSON 则是 Core 要求所有实现支持的格式。[CE0][CE1] | **不设第二 envelope 格式。**它们适合已有相应 schema/序列化生态的系统，不是天然更现代；正式 NATS binding 当前仍要求 JSON mapping。[CE3] |
| **JSON envelope + 非 JSON `data`** | JSON Format 可承载字符串或 Base64 binary，`datacontenttype` 描述 `data`，并不要求业务数据必须是 JSON。[CE2] | **一期固定 JSON `data` 即可。**保留标准扩展点，但不预先引入二进制 payload 和额外序列化器。 |

## 4. CE `type` 与 NATS subject：真实实践与三种方案

### 4.1 一手实例能证明什么

| 官方来源 | 实际值 | 证据边界 |
|---|---|---|
| CloudEvents NATS binding 1.0.2 示例 | NATS `Subject: mySubject`；CE `type: com.example.someevent`。[CE3] | 正式规范直接展示独立值，且没有推导函数。 |
| CloudEvents Go SDK NATS sender | 默认 NATS subject `sample`；CE `type: com.cloudevents.sample.sent`。[P1] | 官方 SDK 示例证明独立寻址可实施，不是生产采用统计。 |
| CloudEvents Go SDK JetStream sender | stream 捕获 `sample.>`，消息 subject 为 `sample.even.0` / `sample.odd.1` 等；CE `type` 仍固定为 `com.cloudevents.sample.sent`。[P2] | 证明一个 CE type 可对应多个更细粒度 NATS 地址；地址 hierarchy 不等于 `type` 前缀映射。 |
| Sveltos 当前 NATS/JetStream 文档 | 发布到 `user-operation`；CE `type` 为 `auth.example.com.login` 或 `.logout`，并分别提供 NATS subject 与 CE type 过滤。[P4] | 当前项目官方端到端实例证明多个类型可共享一个 NATS subject；不是行业比例证据。 |
| Dapr v1.19 | `topic: orders`，`type: com.dapr.event.sent`。[P3] | 证明独立 topic/type 的真实平台做法；不是 NATS 专属证据。 |

NATS 官方只把 subject 定义为应用设计的路由地址，点号形成层级、订阅可用通配符；它没有定义从 CloudEvents `type` 生成地址的规则。[N1]

### 4.2 方案复审

| 方案 | 优点 | 实际代价与证据结论 |
|---|---|---|
| **独立显式声明** | 两个概念各自演进；支持同 subject 多 type、同 type 多 subject；外部合法 CE type 不必满足 NATS 字符规则；与上述实例一致。 | 需要在目录中写两个值并校验实际消息匹配某一条目录记录。**这是一期推荐。** |
| **完全同值** | 少一个映射函数，目录中的两个值可以相同；无需转义。 | 仍是跨层项目约束，不是标准默认；CE 非空 Unicode String 与 NATS 地址字符/通配规则并不完全相同，且类型变更会联动地址、订阅与权限。**允许局部同值，不设全局恒等。**[CE1][N1] |
| **固定前缀 + type** | 可隔离应用地址空间，发布与订阅易计算。 | 与同值同样需要收紧字符并耦合演进，还增加自定义算法；本次未找到足够当前生产实例可称其为通用惯例。**命名空间可以保留，但地址应在目录中显式写出。** |

**项目选择：**不要用“少写一条映射”替代真实契约。两个字符串本身不贵，隐式全局耦合才是长期成本。目录可生成发布/订阅配置，因此显式声明不等于手工维护多份配置。

## 5. AsyncAPI：轻量契约还是过度治理

### 5.1 当前规范与工具事实

- **AsyncAPI 3.1.0** 于 **2026-01-31** 正式 release，官方说明相对 3.0 无 breaking change；JSON Schema、JavaScript Parser、Converter 和 Studio 已同步支持。CLI 提供 validate、convert、diff、generate、bundle 等实际能力。[A2][A4]
- Core 可描述 application 的 `servers`、`channels.address`、`operations.action=send/receive`、`message.contentType` 与 payload schema；文档以 application 为边界，不是天然的全系统注册中心。[A1]
- **NATS binding 0.1.0** 的 server/channel/message binding 均无属性，只有 operation `queue` 和 `bindingVersion`。官方路径历史显示其实质内容自 **2021-08-06** 初始提交后没有 3.1 时代的 JetStream 扩展。[A3]
- 因而，NATS subject 应写在 Core `channel.address`；binding 不提供 `type → subject`、JetStream stream/subjects/retention 或 CloudEvents mode 的标准描述。[A1][A3]

### 5.2 一期判断

**会偏过度治理的情形：**只有少量同仓库事件，已有 JSON Schema/示例/测试，却又手写一份 AsyncAPI YAML；没有文档、代码生成、外部协作或 CI diff 的实际消费者；还要同步维护 `type`、channel address 和 payload 三处重复文本。

**可以很轻的情形：**以 §7.2 的目录为唯一事实源生成 AsyncAPI；团队立即使用 parser validation、文档/模型生成或 diff；外部生产者需要标准 API 描述。此时 AsyncAPI 是导出视图，不是第二套事实。

**后补方式：**未来若采用，`message.contentType` 写 `application/cloudevents+json`，`channel.address` 写目录中的 NATS subject，payload 用 JSON Schema 描述完整 structured envelope（含该事件的 `data` schema）。只有需要 queue 描述时再加 NATS binding 0.1.0。不要把 `application/cloudevents+json` 误当成声明 schema language 的通用 `schemaFormat`，也不要等待空 binding 提供 JetStream 字段。[A1]–[A3][CE2]

## 6. contract-first 与 Schema Registry 的主流程度及 MVP 成本

### 6.1 三种事情必须分开

1. **契约纪律**：先明确事件名、地址、schema 和兼容规则，再实现/变更收发代码。
2. **契约格式/工具**：JSON Schema、AsyncAPI、Avro 等文件及校验、生成、diff 工具。
3. **在线 registry 服务**：集中存储、发现、版本与兼容策略，可能还带 serializer/deserializer 和治理权限。

它们可以组合，但任何一项都不自动要求另外两项。Git 中版本化 JSON Schema 已经能做轻量 contract-first；AsyncAPI 也可以从代码生成，并不等于 contract-first。[A5][A6]

### 6.2 当前官方案例显示路线共存，而非单一路线胜出

| 一手证据 | 当前做法 | 能支持的结论 |
|---|---|---|
| **Adeo / AsyncAPI 官方案例** | AsyncAPI 3.0 文件与源码同库；Avro schema 作为来源生成 Java models，再由 AsyncAPI 引用，CI 生成文档。[A5] | schema/contract 驱动在真实企业流程中可行，有工具价值。 |
| **TransferGo / AsyncAPI 官方案例** | 50+ services、300+ channels 背景下明确采用 **code-first**，从 DTO 生成 AsyncAPI；CLI/CI 校验、门户分发、契约测试；页面明确写 **Schema Registry: None**。[A6] | 大规模事件目录也不必然要求手写 contract-first 或 registry 服务；这是采用者自述，不是市场比例。 |
| **HDI / AsyncAPI 官方案例** | 从既有 GitOps topic 配置生成 AsyncAPI 和文档，CLI 校验；代码生成仍是 Outlook。[A7] | AsyncAPI 可作为既有事实源的导出视图，不必反客为主成为第二套配置。 |
| **Confluent 当前产品文档** | 提供集中 REST 服务、兼容检查和 Kafka client serdes，并建议“Always start with a Schema Registry”；自管配置包含 Kafka bootstrap、`_schemas` compacted topic 等。[R1] | schema registry 在 Kafka/data-streaming 生态是成熟方案；其“总是从 registry 开始”是特定厂商/生态建议，不能升级为 NATS 通用标准。 |
| **Azure Event Hubs，更新于 2026-08-26** | 提供 namespace 内 Schema Registry 和多语言 SDK；列出 Avro、JSON Schema、Protobuf，但兼容模式只支持 Avro。[R2] | 托管 registry 也是现实方案；不同格式能力并不齐平，不能只看“支持 JSON Schema”名称。 |
| **AsyncAPI 当前 registry 教程** | 本地教程用一个 `apicurio-registry-mem` Docker 容器启动内存 registry，再以 URL `$ref` 引用 schema。[A8] | 单机 PoC 可以只是一只容器，不能说 registry 必然很重；但仍新增服务、artifact/URL 生命周期和可用性边界，教程配置不是生产拓扑。 |

**限定结论：**可以称 contract/schema 管理与 registry 已进入近年事件和数据流系统的**主流工具与托管产品生态**，是成熟、活跃、可核验的治理手段之一；不能据此给出“多数项目都 contract-first”或“现代 EDA 必须 registry”的排名。上述官方案例反而证明 code-first、配置生成、Git/门户分发和集中 registry 并存。

### 6.3 单机 MVP 成本判断

- **Git + JSON Schema + CI**：无新增进程、网络依赖或 schema 查询 API；Git history/review 可承担版本与审查记录，validator 可直接打包进应用。适合当前同仓库、少量事件。
- **本地内存 registry**：启动成本低，适合验证 SDK/序列化集成；内存数据、服务生命周期和引用 URL 使其不是一期默认的事实源。[A8]
- **自管持久 registry**：可能引入额外服务及其存储、备份、权限和兼容策略；Confluent 例子还依赖 Kafka store。[R1]
- **托管 registry**：减少自管进程，但引入云产品、凭据、成本与格式能力矩阵；不是“无运维成本”的同义词。[R2]

**项目选择：**一期只采用第一行。出现跨仓库/跨团队独立发布、在线 discovery、集中兼容性策略、运行时按 schema ID 解析等真实需求后，再比较 registry；不要为解决 Git 已经解决的问题预建服务。

## 7. 建议的一期最小现代事件契约方案

### 7.1 线上 profile（文档标准 + DSH 收紧）

1. 使用 **CloudEvents Core/JSON/NATS binding 1.0.2 structured JSON**，`specversion: "1.0"`；完整事件是 UTF-8 JSON object，媒体类型为 `application/cloudevents+json`。[CE1]–[CE3]
2. Core 必填 `id/source/specversion/type`；DSH profile 额外要求 `time`、`datacontenttype: application/json` 和 `data`。`source` 使用项目既定 URI-reference 规则。
3. DSH 原生事件省略 CE `subject` 和 `data_base64`；通用接收路径不把外部 OPTIONAL 属性存在视为 CloudEvents 错误。[CE1][CE2]
4. CE `type` 只负责事件分类；NATS subject 只负责传输地址。**不要求二者相同，也不从一方计算另一方。**
5. `dataschema` 保持 OPTIONAL。一期可从目录的 `type` + NATS subject 配对记录找到 schema，避免运行时远程解析；若事件携带 `dataschema`，必须指向不可变 schema 版本并与目录一致。[CE1]

### 7.2 唯一事实源：仓库内事件目录 + 版本化 JSON Schema

以下是逻辑形状，不要求新增 AsyncAPI 或 registry：

```json
{
  "type": "com.example.document.updated",
  "natsSubject": "dsh.events.document.updated",
  "dataSchema": "./schemas/com.example.document.updated/v1.json",
  "example": "./examples/com.example.document.updated/v1.json"
}
```

- 每类事件一条记录；`type` 唯一，`natsSubject` 是 literal publish address。不同记录是否共享 subject 由显式设计决定，不默认强制一对一。
- `dataSchema` 是有稳定 `$id`、版本化路径和兼容规则的 JSON Schema；`example` 是完整 structured CloudEvent，不只包含 `data`。
- 上例两个名字不同是有意展示独立性；若某条目录记录二者同值也完全合法，但不触发全局规则。
- `structured`、media type、CE `subject: omit` 等全局 profile 只写一次，不在每条记录重复。

### 7.3 最小可执行验证

1. **发布侧**：从同一目录取 `natsSubject` 和 `type`，序列化后校验完整 envelope 与 `data` schema。
2. **接收侧**：用“实际 NATS subject + 解码后的 CE `type`”共同查找目录记录，再校验 schema；检查的是**目录配对存在**，不是 `subject == type`。
3. **CI**：检查 type 唯一、NATS subject 语法、schema 可解析、示例通过、每个目录配对有收发契约测试，并检查 JetStream 捕获配置只引用目录中的地址。
4. **演进**：同一 `type` 内只允许项目定义的兼容变化（一期可收窄为新增可选字段）；不兼容变化使用新 `type` 和新不可变 schema 版本。该规则是 DSH 项目选择，不由 `specversion` 自动提供。[CE1]
5. **运行时不依赖在线 registry**：schema 与 validator 随应用版本发布；兼容检查在 CI 和契约测试中执行。

这套方案已经具备现代契约的核心：**机器可读、显式寻址、可校验、可审查、可演进、收发双方共测**。AsyncAPI 后续可直接从同一目录生成，不需要改线上 envelope 或重新发明地址。

### 7.4 明确的后续触发条件

| 后续能力 | 何时再加入 |
|---|---|
| **CE `subject`** | 通用中间件需要在不理解 `data` 时按对象过滤，或外部契约明确使用该字段。[CE1] |
| **AsyncAPI 3.1** | 有外部协作、标准文档门户、模型/代码生成、CI diff 等实际消费者；由目录生成，避免第二事实源。[A1][A4] |
| **binary content mode / 其他 envelope format** | 有真实非 JSON payload、跨语言序列化或测量后的传输需求；若改变 NATS content mode/event format，先确认正式 binding 与双方工具支持，不是只因出现 WIP 新版本。[CE4] |
| **Schema Registry 服务** | 多团队独立发布、在线发现、集中兼容策略、schema ID 分发或托管治理的收益高于新增服务/云依赖成本。[R1][R2] |
| **xRegistry** | 需要跨应用 message/endpoint catalog、标准 registry API/discovery，且接受 RC/后续迁移成本；不是只为了保存几个 JSON Schema。[X1][X2] |

## 8. 需要撤回或修正的先前建议

1. **撤回“原生事件首选 `NATS subject = CloudEvents type`”的默认推荐。**[event-addressing-standards](event-addressing-standards.md) §3、§6、§10 的 A/A+B 路线把同值列为首选；本次改为“独立显式声明，允许局部同值”。技术可行性仍成立，但不能再以实践证据不足的全局恒等约束作为默认。
2. **撤回 `natsSubject = "dsh.events." + type` 的唯一映射函数建议。**[cloudevents-subject-practices](cloudevents-subject-practices.md) §7.2 及同文示例可保留命名空间设计参考，但应把完整 NATS subject 写入事件目录，不再宣称必须由该函数派生。该文关于 CE `subject` 可省略、外部事件不可误判的结论继续保留。
3. **撤回“一期推荐 A+B / 以 AsyncAPI 作为默认契约层”的强建议。**[event-addressing-standards](event-addressing-standards.md) §4、§6、§10 应改为“先目录 + JSON Schema + 测试；AsyncAPI 可生成、可后补”。AsyncAPI 3.1 本身并未过时，改变的是一期必要性和事实源位置。
4. **撤回把 NATS binding 0.1.0 当作采用 AsyncAPI 的实质理由。**其空 server/channel/message binding 和仅有 `queue` 的覆盖没有变化；基本地址来自 AsyncAPI Core，JetStream 配置也不由它标准化。[A3]
5. **不再把 binary NATS 简化为“NATS 不支持”或“binary 已正式可替换 structured”。**准确说法是：NATS headers 与其他协议的 binary 实践已存在，但 CloudEvents **NATS binding** binary 当前仍在 1.0.3-wip；一期 structured 结论不变。[CE3][CE4][P3]
6. **xRegistry 暂缓结论保留，但理由需更新。**不得写成项目停滞或缺少实现：`v1.0-rc4` 是 2026-08 新 release，官方 server 当前活跃。暂缓只因为 RC 稳定性边界和一期需求/成本，不是“新所以不用”或“旧所以不用”。[X1]–[X3]
7. **不得把“遵循 CloudEvents + NATS + AsyncAPI”写成现代行业强制组合。**[asyncapi-background](asyncapi-background.md) 关于三者互补、非强制捆绑的判断仍成立；本复审进一步把 AsyncAPI 从一期默认项降为可选。

## 9. 证据限制与不能推出的结论

- 本次没有统一分母的生产部署调查，**不提供 CloudEvents content mode、寻址策略、contract-first 或 registry 的流行度排名**。
- 官方 SDK sample 证明可实施，项目官方文档证明该项目实践，企业 case study 是采用者自述；三者均不等于全行业多数。[P1][P2][P4][A5]–[A7]
- “本次未找到同值/前缀映射的生产实例”仅限所核查的一手材料，不能证明不存在；因此 verdict 是**作为行业惯例证据不足**，同时按项目成本调整默认方案。
- GitHub commit/release 能证明维护活动，不能单独证明生产质量、安全或采用量；CNCF Graduated、LF Projects 治理和厂商 logo 也不能替代逐项工具验证。[CE0][CE5][X3]
- 本建议刻意保留后续导出 AsyncAPI、接 registry 的接口，但不承诺未实测的特定生成器/template 对 CloudEvents + NATS 组合开箱即用。采用前应做最小工具 PoC。

## 10. 官方一手来源 URL 与访问日期

> 以下来源均访问于 **2026-11-14**。规范规则优先使用 released tag；WIP 使用固定 commit。动态网页、`main/master` 和 GitHub API 表示访问当日状态。

### CloudEvents / CNCF / SDK

- **[CE0]** CloudEvents 官方 README（latest release 与 WIP、2024 Graduated、formats/SDK 列表）：https://raw.githubusercontent.com/cloudevents/spec/main/README.md ；latest release API（`ce@v1.0.2`、`published_at`）：https://api.github.com/repos/cloudevents/spec/releases/latest ；CNCF 当前项目记录：https://www.cncf.io/wp-json/wp/v2/lf_project/35953
- **[CE1]** CloudEvents Core 1.0.2（REQUIRED/OPTIONAL、`type`、CE `subject`、`dataschema`、structured/binary 定义）：https://raw.githubusercontent.com/cloudevents/spec/v1.0.2/cloudevents/spec.md
- **[CE2]** JSON Event Format 1.0.2（media type、unset、`data`/`data_base64`）：https://raw.githubusercontent.com/cloudevents/spec/v1.0.2/cloudevents/formats/json-format.md ；官方 Draft-07 JSON Schema：https://raw.githubusercontent.com/cloudevents/spec/v1.0.2/cloudevents/formats/cloudevents.json
- **[CE3]** NATS Protocol Binding 1.0.2（structured JSON only、独立 `mySubject` 示例、不定义 transfer 或 type 映射）：https://raw.githubusercontent.com/cloudevents/spec/v1.0.2/cloudevents/bindings/nats-protocol-binding.md
- **[CE4]** NATS Protocol Binding 1.0.3-wip 固定 commit（binary/structured、mode detection、`ce-` headers）：https://raw.githubusercontent.com/cloudevents/spec/49337f2c280fc6305844d5bcab37b127de5b8383/cloudevents/bindings/nats-protocol-binding.md ；该路径官方提交历史：https://api.github.com/repos/cloudevents/spec/commits?path=cloudevents/bindings/nats-protocol-binding.md&per_page=5
- **[CE5]** JavaScript SDK v10.0.0（2025-06-10、Node 24）：https://api.github.com/repos/cloudevents/sdk-javascript/releases/latest ；Go SDK v2.16.2（2025-09-22）：https://api.github.com/repos/cloudevents/sdk-go/releases/latest

### NATS 与实现方实践

- **[N1]** NATS 官方 *Subjects*（应用路由地址、点分 hierarchy、通配符、字符建议）：https://docs.nats.io/concepts/subjects
- **[P1]** CloudEvents Go SDK 官方 NATS sender（`sample` 与独立 CE type）：https://raw.githubusercontent.com/cloudevents/sdk-go/main/samples/nats/sender/main.go
- **[P2]** CloudEvents Go SDK 官方 JetStream v3 sender（`sample.>`、细分地址与固定 CE type）：https://raw.githubusercontent.com/cloudevents/sdk-go/main/samples/nats_jetstream/v3/sender/main.go
- **[P3]** Dapr v1.19 官方 *Publishing & subscribing messages with CloudEvents*（独立 topic/type、默认省略 CE `subject`、binary 当前实践）：https://raw.githubusercontent.com/dapr/docs/v1.19/daprdocs/content/en/developing-applications/building-blocks/pubsub/pubsub-cloudevents.md
- **[P4]** Project Sveltos 官方 *Respond to CloudEvents published over NATS and JetStream*（独立 NATS subject/CE type/CE `subject` 过滤与 2025 示例输出）：https://raw.githubusercontent.com/projectsveltos/sveltos/main/docs/events/nats.md

### AsyncAPI、contract 与工具案例

- **[A1]** AsyncAPI Specification 3.1.0（application、channel address、operation、message contentType、schema）：https://raw.githubusercontent.com/asyncapi/spec/v3.1.0/spec/asyncapi.md
- **[A2]** AsyncAPI 3.1.0 release API（2026-01-31、非 draft/prerelease）：https://api.github.com/repos/asyncapi/spec/releases/latest ；官方 release notes（无 breaking change、核心工具支持）：https://www.asyncapi.com/blog/release-notes-3.1.0
- **[A3]** AsyncAPI NATS binding 0.1.0 固定快照：https://raw.githubusercontent.com/asyncapi/bindings/f380502cc51d0cd629793d5ca4c25287ff714d8b/nats/README.md ；该路径官方提交历史（2021 初始内容）：https://api.github.com/repos/asyncapi/bindings/commits?path=nats/README.md&per_page=5
- **[A4]** AsyncAPI 官方 CLI 文档（validate/convert/diff/generate/bundle）：https://www.asyncapi.com/docs/tools/cli
- **[A5]** AsyncAPI 官方 Adeo case study（Avro 来源、模型生成、文档流水线）：https://www.asyncapi.com/casestudies/adeogroup
- **[A6]** AsyncAPI 官方 TransferGo case study（code-first、300+ channels、CI/契约测试、Schema Registry None）：https://www.asyncapi.com/casestudies/transfergo
- **[A7]** AsyncAPI 官方 HDI case study（由 GitOps 配置生成文档、CLI 校验）：https://www.asyncapi.com/casestudies/hdiglobal
- **[A8]** AsyncAPI 官方 *Managing schemas using Schema Registry*（单容器内存 Apicurio 教程与 schema URL 引用）：https://www.asyncapi.com/docs/tutorials/kafka/managing-schemas-using-schema-registry

### Schema Registry 产品事实

- **[R1]** Confluent 当前 Schema Registry 概述（REST、serdes、兼容治理、厂商建议）：https://docs.confluent.io/platform/current/schema-registry/index.html ；当前配置参考（Kafka store、`_schemas` topic、listeners）：https://docs.confluent.io/platform/current/schema-registry/installation/config.html
- **[R2]** Microsoft Azure Event Hubs Schema Registry（2026-08-26 更新；schema groups、SDK、格式与 Avro-only 兼容模式边界）：https://learn.microsoft.com/en-us/azure/event-hubs/schema-registry-concepts

### xRegistry

- **[X1]** xRegistry 官方 README（latest `v1.0-rc4`、WIP、server/codegen/viewer）：https://raw.githubusercontent.com/xregistry/spec/main/README.md ；latest release API（2026-08-19）：https://api.github.com/repos/xregistry/spec/releases/latest
- **[X2]** xRegistry Message Definitions Registry 1.0-rc4（CloudEvents envelope metadata、NATS `protocoloptions.subject`、data schema、共享 placeholder）：https://raw.githubusercontent.com/xregistry/spec/v1.0-rc4/message/spec.md
- **[X3]** xRegistry 官方 reference server 当前提交记录（访问日活动证据，不是生产成熟度证明）：https://api.github.com/repos/xregistry/server/commits?per_page=1
