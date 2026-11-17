# AsyncAPI 的历史、治理、规范边界与 CloudEvents + NATS 组合定位

> 状态：只读调研，不代替最终选型。
> 截止日期与所有外部 URL 访问日期：**2026-11-14**。
> 范围：仅讨论 AsyncAPI 历史与治理、API 契约、CloudEvents 事件格式、NATS 寻址及三者组合的标准化地位。
> 标注：**事实**来自官方规范、官方项目仓库、官方文档或项目官方案例；**官方案例**是项目方发布的采用者自述，未由本研究独立审计；**推断**是基于这些事实的限定判断。
> 方法限制：规范规则优先引用 released tag；`master` 与动态网页只用于访问当日的当前状态。未用营销标题、GitHub stars 或 logo 数推导市场份额。“未发现组合强制要求”的结论限于本文核查的规范、官方文档与官方文章，不扩张为对所有资料的绝对否定。

## 1. 简短结论

1. **事实：AsyncAPI 由 Fran Méndez 于 2017-11-18 发起；项目官网记载他当时任职 Hitch（又名 API Changelog），因需要以机器可读方式描述内部 message-driven microservices，并受 OpenAPI 启发而创建该规范。**规范正文还明确标注部分内容取自 OpenAPI Initiative 的工作。[H1][H2][S1]
2. **事实：当前官方正式 release 是 AsyncAPI Specification 3.1.0，发布于 2026-01-31，非 draft、非 prerelease。**项目是 **AsyncAPI Project, a Series of LF Projects, LLC**，采用开放治理；Linux Foundation/LF Projects 的托管与治理关系不能被改写为 ISO/IEC/W3C/OASIS 等标准组织的正式认定。[S2][S3][G1]
3. **事实：AsyncAPI 标准化的是 message-driven API 的机器可读文档/契约格式，不是天然替换线上消息 envelope 或 NATS wire protocol。**`servers` 描述连接，`channels` 描述通信通道与地址，`operations` 描述应用相对 channel 的 `send`/`receive`，`messages` 描述 payload、应用 headers、content type 等契约；bindings 只补充协议特定信息。[S1]
4. **事实：当前 AsyncAPI NATS binding 是 0.1.0，唯一实质 NATS 特定字段是 Operation Binding 的 `queue`；Server、Channel、Message Binding 均为空并保留给未来。**[B1] **推断：**它可以成为契约的一层，但不能被描述成完整覆盖 JetStream、NATS subject 映射或 CloudEvents 线格式的 binding。
5. **推断：官方案例与工具生态支持“成熟、活跃、已有企业生产采用的开放社区规范之一”“事件驱动 API 描述的重要候选之一”等措辞。**现有证据不足以无保留地称其为“唯一行业标准”“事实标准”或“最流行”；官网明确说使用者和项目总数无法得知，也未提供统一分母的采用量排名。[H1][A1]–[A4][T1]–[T3]
6. **事实：本次未发现任何官方规范或参考架构强制 CloudEvents、NATS、AsyncAPI 必须组合，也未发现把该 trio 定为行业统一架构的正式标准；官方资料反而说明 AsyncAPI 不预设架构、AsyncAPI 与 CloudEvents 并非必须一起使用。**[S1][C2]–[C5][N1] **推断：**准确说法是“在事件格式、传输和 API 契约三层分别采用官方规范/项目能力，再补充项目 profile 与配置”；“使用了标准化部件”不等于“组合本身已经成为行业统一标准架构”。

## 2. 官方历史、OpenAPI 关系与治理

### 2.1 时间线与灵感来源（事实）

| 时间 | 官方一手事实 | 来源 |
|---|---|---|
| **2017-11-18** | 官方三周年文章把这一天记为 Fran Méndez 创建 AsyncAPI 的日期。 | [H2] |
| 发起背景 | 项目始于 Hitch（a.k.a. API Changelog）。Hitch 需要机器可读格式描述内部 message-driven microservices，希望获得类似 OpenAPI 用于 HTTP APIs 的收益；当时在 Hitch 工作的 Fran Méndez 受 OpenAPI 启发创建规范。 | [H1] |
| 与 OpenAPI 的文本关系 | 3.1.0 规范的 Attribution 写明，部分内容取自 OpenAPI Initiative 的工作。 | [S1] |
| **2021-03-19** | 当前 Charter 记录的原始采纳日期；Charter 后续于 **2025-05-05** 修订。 | [G1] |
| **2021-03-30** | Fran Méndez 官方宣布 AsyncAPI 成为 Linux Foundation project，目标是中立、独立、community-driven 的开放治理。 | [H3] |
| **2026-01-31** | AsyncAPI Specification **3.1.0** release；官方 latest release API 标为 `draft:false`、`prerelease:false`，release notes 说明该 minor release 无 breaking changes，并列出已支持它的核心工具。 | [S2][S3] |

**推断：**AsyncAPI 与 OpenAPI/Swagger 的准确关系是“受其启发、结构相似且部分规范文本有来源关系，面向不同 API 交互风格的独立规范”，不是 OpenAPI 的一个新版本，也不是 Swagger 工具或线上消息协议。官网使用 “OpenAPI (aka Swagger)” 的通俗说法，不应据此把两个项目混成同一治理项目。[H1][S1][G1]

### 2.2 治理主体与“标准”地位（事实）

- Charter 将项目法律/治理主体写为 **AsyncAPI Project, a Series of LF Projects, LLC**；LF Projects, LLC 是 Delaware series limited liability company。[G1]
- 项目使命是提供 open-source、vendor-neutral specifications and tools。TSC（Technical Steering Committee，技术指导委员会）负责项目监督；Governance Board 负责战略与运营指导，不默认取代 TSC 的技术决策；Committers/Maintainers 处理 repository/project 级决策。[G1][G2]
- TSC 以共识为目标，需要投票时按 voting member 一人一票；Charter 还限制同一雇主在 TSC 中的占比，并要求开放参与和透明运行。[G1]
- 规范使用 RFC 2119 关键词，采用 Apache License 2.0；官方 spec README 把 **3.1.0** 标为 latest，同时把 `master` 上的文件称为 latest draft，二者不能混称。[S1][S4]
- 本次核查的官方材料没有给出 AsyncAPI 的 ISO/IEC/ITU/W3C/OASIS 标准编号或这些组织的正式标准认定，也没有给出 CNCF maturity 等级。LF Projects 托管是真实的治理与法律事实，但不是另一张“正式标准组织认证”。

**推断：**可以区分四种措辞：

| 措辞 | 本研究判断 | 边界 |
|---|---|---|
| **官方正式发布的规范** | **成立。** | 指 3.1.0 是项目正式 release，不等于某个外部 SDO（standards development organization，标准制定组织）的认定。[S1]–[S4] |
| **开放社区标准 / 开放规范** | **成立，建议保留“开放社区/开放”限定。** | 依据是 vendor-neutral 使命、LF Projects 开放治理、公开 release 与多实现工具生态。[G1][T1]–[T3] |
| **行业标准** | **仅在宽泛工程语境下可谨慎说成“行业开放规范之一”；不建议无保留写“the industry standard”。** | Linux Foundation 项目身份和官网宣传不能替代正式 SDO 认定，也不能证明排他性或普遍采用。 |
| **事实标准 / 最流行** | **本次证据不足，不建议。** | 需要同口径、跨方案的实际采用证据；当前官方案例和工具列表没有这种分母，见 §4。 |

## 3. 规范到底覆盖什么

### 3.1 文档/契约，而非默认线上 envelope（事实）

AsyncAPI 3.1.0 将自身定义为以机器可读格式描述 **message-driven APIs** 的 protocol-agnostic 项目。AsyncAPI 文档自身用 JSON 或 YAML 表示，但规范明确写道：**文档使用 JSON 并不强制 API 自身的 input/output 使用 JSON**。规范还明确不假定任何 software topology、architecture 或 pattern。[S1]

| 对象 | 3.1.0 的作用（事实） | 不应误读为（推断） |
|---|---|---|
| **`servers` / Server Object** | 提供应用可连接的 server 定义；Server Object 描述 broker、server 或其他可收发数据的程序，记录 `host`、必填 `protocol`、可选 `protocolVersion`、pathname、security 与 bindings 等。 | 不是创建或配置 NATS server 的完整声明式部署模型，也不证明某种 broker 拓扑是标准。 |
| **`channels` / Channel Object** | 描述共享通信通道；`address` 可表示 topic name、routing key、event type 或 path，且可缺省表示未知；channel 下 `messages` 列出该通道可能出现的消息，channel 还可引用可用 servers、parameters 与 bindings。 | `address` 本身不发明一套 NATS subject 算法，也不保证基础设施配置已完整表达。 |
| **`operations` / Operation Object** | 描述应用必须实现的 operation；`action` 是从**该应用**视角相对所引用 channel 的 `send` 或 `receive`，可进一步引用该 operation 支持的 channel messages 子集及 reply。 | 不能只交换 `send`/`receive` 就自动得到另一方的正确文档；规范明确不推荐这样机械推导 sender/receiver 文档。 |
| **`messages` / Message Object** | 描述 channel/operation 上的消息；可定义 payload schema、应用 headers schema、`contentType`、correlation ID、bindings、examples 等。应用 headers **MUST NOT** 定义 protocol headers。 | 不是一套强制所有运行时消息新增字段的 envelope；payload 可以是 JSON、XML、Avro、binary 等，具体线格式仍由所选协议、格式和应用契约决定。 |
| **bindings** | 只定义 protocol-specific information，可挂在 server、channel、operation、message 上。 | 拥有 binding 名称不等于该协议的所有产品能力均已被标准化描述。 |

**推断：**AsyncAPI 能严格描述线上消息“应该是什么形状”，并供校验、文档和代码生成工具使用，但这份描述文件本身不是线上消息。若线上采用 CloudEvents，CloudEvents Core/Event Format/Protocol Binding 才直接规定事件属性、序列化及协议映射；AsyncAPI 可把这套消息形状及其 channel/operation 关系写成可共享契约。[S1][C2][C3][C5]

### 3.2 NATS binding 0.1.0 的真实覆盖（事实）

| Binding 对象 | 0.1.0 的官方内容 |
|---|---|
| Server Binding | **无任何 properties**，名称保留给未来。 |
| Channel Binding | **无任何 properties**，名称保留给未来。 |
| Operation Binding | `queue`：queue 名称，不能超过 255 字符；另有 `bindingVersion`。 |
| Message Binding | **无任何 properties**，名称保留给未来。 |
| 版本缺省 | 当前文档版本为 **0.1.0**；省略 `bindingVersion` 时假定 `latest`。 |

来源：[B1]。AsyncAPI 3.1.0 的 Server/Channel/Operation/Message Bindings Object 均链接到这份 NATS binding。[S1]

**推断与限制：**

1. 核心规范的 `servers.host/protocol` 和 `channels.address` 仍可记录 NATS 连接与 subject 契约；把某个 NATS subject 写入 `channel.address` 是合理映射，但不是 NATS binding 0.1.0 额外提供的字段或推导算法。[S1][N1]
2. 0.1.0 没有 NATS 特定的 JetStream stream/consumer、retention、ACK/redelivery、headers、CloudEvents content mode 或 `type → subject` 映射规则。不能用“AsyncAPI 有 NATS binding”推导这些能力已经由 binding 标准化。
3. 为可复现契约，宜显式写 `bindingVersion: 0.1.0`，而不是依赖会随时间变化的 `latest`；这是一项文档治理建议，不是规范新增的强制要求。[B1]
4. 版本号和覆盖范围要一起说明：**AsyncAPI Specification 3.1.0** 不意味着 **NATS binding 也是 3.1.0**；后者当前仍是 **0.1.0**。

## 4. 采用证据、工具生态与措辞限制

### 4.1 官方案例能证明什么（官方案例，不是独立市场审计）

| 案例 | 官方页面披露的实际使用 | 证据边界 |
|---|---|---|
| **Adeo Group** | 生产用 AsyncAPI 3.0.0 文档描述 Kafka API；payload 使用 Avro，文档与源码同库，CI/CD 生成 HTML，页面提供 production-used document。 | 证明零售企业内部文档/生成流水线实际采用，不证明所有系统或外部合作方均采用。[A2] |
| **HDI Global SE** | 以 AsyncAPI 3.0.0 聚合 Azure Service Bus topics/messages，生成文档与 wiki，并用 AsyncAPI CLI 校验；页面提供 production-used document。 | 证明保险企业内部 discoverability/documentation 使用；代码生成和以其驱动配置在页面中仍标为 Outlook，不能写成全部已落地。[A3] |
| **TransferGo** | 披露 50+ services、300+ channels 背景，使用 AsyncAPI 2.6.0/3.0.0、code-first schema、CI 校验、developer portal、catalog 和 contract testing，协议包括 SNS、SQS、Kafka。 | 证明较大内部事件目录与工具链案例；数字来自采用者自述，不是与其他规范对照的市场统计。[A4] |
| **案例总表与 brands 列表** | 官网另有 Adeo、HDI、TransferGo 等 case studies/use cases；About 页列出 Slack、Adidas、Salesforce、IBM、SAP、IQVIA 等“据项目方所知正在使用”的品牌。 | About 页同时明确：使用 AsyncAPI 的公司和项目总数及身份**无法完整得知**。logo/名称不是统一口径的生产部署清单。[A1][H1] |

### 4.2 工具生态能证明什么（事实 + 推断）

- **事实：**官方 CLI 覆盖文档创建、Parser 校验、版本转换、diff、生成、优化、bundle 与启动 Studio；Generator 以 AsyncAPI Document + Template 生成文档、SDK、boilerplate、diagrams 等。3.1.0 release notes 还列出 JSON Schema、JavaScript Parser、Converter 与 Studio 的同日支持版本。[T2][T3][S3]
- **事实：**Tools Dashboard 同时收录官方与社区工具，并允许社区按流程提交新工具。[T1]
- **推断：**该目录证明生态发现和集成广度，不是每个工具统一生产成熟度的认证。
- **推断：**这些证据支持“不是纸面规范，已有真实企业流程和可工作的工具链”，也支持“核心工具持续维护”。它们不证明所有社区模板、所有 binding、尤其 NATS binding 0.1.0 都具有同样成熟度。
- **推断：**上述案例主要证明 AsyncAPI 整体采用，**不证明 CloudEvents + NATS + AsyncAPI 组合的采用量**；列出的案例协议包括 Kafka、AMQP/Azure Service Bus、SNS/SQS，不能替 NATS  trio 补一份行业份额证据。[A2]–[A4]

### 4.3 是否有统一采用量排名

**检索结论（事实，限于本次核查的一手来源）：**未找到按活跃生产组织、部署数、API 数或统一消息量比较 AsyncAPI 与其他 API 描述方案的官方排行榜。官网反而明确说无法知道完整使用总数；case studies 的场景、版本、协议和披露口径各不相同。[H1][A1]–[A4]

**推断：**可以写“有知名企业和生产案例、工具生态活跃、是重要开放规范之一”，不应写“最流行”“第一”“唯一事实标准”。赞助商、维护者雇主、工具数量、GitHub stars 和实际厂商采用是不同指标，不能互相替代。

## 5. CloudEvents + NATS + AsyncAPI 是否是标准组合

### 5.1 分层看哪些有正式规范，哪些仍是项目决定

| 层 | 官方一手事实 | 项目仍需决定的内容（推断） |
|---|---|---|
| **CloudEvents Core + JSON Event Format + NATS Protocol Binding** | 当前 latest release 为 **CloudEvents v1.0.2**；Core 定义事件属性格式，NATS binding 1.0.2 把事件以 **structured JSON** 映射为 NATS message payload，并明确不约束 NATS transfer 或 settlement。线上 `specversion` 仍是 `1.0`。[C1]–[C3] | 各事件 `type/source`、业务 `data` schema、扩展、必填性收紧、兼容策略和验证位置。 |
| **NATS** | NATS subject 是 publisher/subscriber 用来找到彼此的消息路由地址，点号形成层级，订阅可使用通配符。CloudEvents NATS binding 示例中的 `Subject: mySubject` 与 `type: com.example.someevent` 相互独立。[N1][C3] | 具体 subject namespace、`type` 与 subject 的映射、queue、权限及 JetStream 配置；这些不是 AsyncAPI 文档自动生成的一致行业规则。 |
| **AsyncAPI Specification** | 3.1.0 正式规定 API 文档/契约结构，protocol-agnostic，且不假定特定 topology、architecture 或 pattern。[S1][S2] | 是否引入文档层、文档归属、send/receive 视角、schema 引用、生成/校验流程与发布方式。 |
| **AsyncAPI NATS binding** | 当前为 0.1.0，实质只增加 operation `queue` 描述，其余三类 binding 对象为空。[B1] | NATS subject 放在核心 `channel.address` 的项目约定、显式 `bindingVersion`、以及未被 binding 覆盖的产品配置。 |
| **三者组合** | AsyncAPI 创始人的官方文章说明 AsyncAPI 关注应用及 channels，CloudEvents 关注 message，二者 compatible and complementary；同时明确“Do you have to use AsyncAPI and CloudEvents together?”取决于自己，并写“no one-size-fits-all”。[C5] | 组合 profile、版本、映射、校验、代码生成和运行配置。博客是概念说明而非 normative reference architecture，且示例使用旧版 CloudEvents 0.2/AsyncAPI 2.0 RC，不能拿来当当前语法或版本依据。 |

### 5.2 核查结论（事实 + 推断）

- **事实：**在本次核查的 AsyncAPI 3.1.0、AsyncAPI NATS binding 0.1.0、CloudEvents Core/NATS binding 1.0.2、NATS subjects 文档及 AsyncAPI 官方 CloudEvents 文章中，未见“必须同时使用 CloudEvents + NATS + AsyncAPI”的规范条款，也未见把三者命名为唯一参考架构的正式标准。CloudEvents NATS binding 只负责 CloudEvent 如何表达为 NATS client message，甚至不约束 transfer/settlement；AsyncAPI 则明确不预设架构。[S1][B1][C2][C3][N1][C5]
- **推断：**“标准化组合”只能作为“各层选用已发布规范/官方项目能力，并显式写出项目 profile”的简称，不能升级为“行业统一标准架构”。三者是互补层，不是互相证明采用必要性的捆绑包。
- **推断：**`type → NATS subject → channel.address` 可以是一套一致、可生成、可校验的项目契约，但其中映射函数是项目选择；CloudEvents 的 `type` 常用于 routing 不等于它已经规定 NATS 地址，CloudEvents Core 与 Primer 也明确事件不标识特定 routing destination。[C2][C3][C4][N1][S1]

## 6. 对用户的准确解释，以及为何此时才相关

### 事实

1. CloudEvents `type` 是 producer-defined 的事件分类，常用于 routing、observability、policy；NATS subject 是传输路由地址。二者相关但不是同一个概念，正式 CloudEvents NATS binding 没有给出通用转换函数。[C2][C3][N1]
2. AsyncAPI 提供 `channel.address`、message schema 和 application-centric `send`/`receive` operations，可以把事件分类、通道地址和消息形状放进同一份机器可读 API 契约；它不改变 CloudEvents 或 NATS 的运行时规则。[S1]
3. AsyncAPI 与 CloudEvents 可分别使用，也可组合；NATS binding 0.1.0 的覆盖又明显窄于 NATS 全功能。[B1][C5]

### 推断

1. **对“之前为什么没提”的严谨回答是：无法从外部规范反推具体作者当时的动机；若先前范围只是线上 envelope 和 NATS subject，那么不提 AsyncAPI 是合理的分层省略，而不是因为它不存在或必然不重要。**当时真正直接回答运行时问题的是 CloudEvents 与 NATS。
2. **当讨论从“线上字段和地址各自是什么”推进到“如何把 `type`、NATS subject、message schema、应用收发方向固化成可共享、可校验、可生成文档/代码的契约”时，AsyncAPI 才成为直接相关的一层。**它能保存并工具化这层约定，但仍不替项目决定映射函数。
3. **引入 AsyncAPI 不是宣称标准化的前置条件，也不是三者组合的强制义务。**若只需要运行时事件格式与传输，可以先使用 CloudEvents + NATS；若需要机器可读 API 目录、契约评审、文档/模型生成、CI 校验和跨团队 discoverability，再引入 AsyncAPI 的收益更直接。[T1]–[T3]
4. 因而建议对用户说：**“CloudEvents 管事件 envelope/格式，NATS 管传输与 subject，AsyncAPI 管 API/消息契约及工具化；三者可以搭配，但不是行业强制捆绑标准。`type` 到 NATS subject 的映射仍需项目自己定义，AsyncAPI 可以把这项定义写成契约。”**

## 7. 一手来源 URL 与访问日期

> 以下来源均访问于 **2026-11-14**。规范规则使用 released tag；动态官网和 `master` 表示当日内容。官方博客只用于历史或概念关系，不替代 normative specification。

### AsyncAPI 历史与治理

- **[H1]** AsyncAPI 官方 About（Hitch、Fran Méndez、OpenAPI 灵感、开放治理、品牌列表及“总数无法得知”）：https://www.asyncapi.com/about
- **[H2]** AsyncAPI 官方，*Happy Birthday AsyncAPI (week 47, 2020)*（2017-11-18 创建日期）：https://www.asyncapi.com/blog/status-update-47-20
- **[H3]** AsyncAPI 官方，*AsyncAPI joins Linux Foundation*（2021-03-30）：https://www.asyncapi.com/blog/asyncapi-joins-linux-foundation
- **[G1]** AsyncAPI Technical Charter（LF Projects 法律主体、使命、TSC/Governance Board、投票、开放参与；2021-03-19 采纳，2025-05-05 修订）：https://raw.githubusercontent.com/asyncapi/community/master/docs/020-governance-and-policies/CHARTER.md
- **[G2]** AsyncAPI 官方 TSC 页面（TSC 与 maintainers 职责）：https://www.asyncapi.com/community/tsc

### AsyncAPI 规范、release 与 NATS binding

- **[S1]** *AsyncAPI Specification 3.1.0* released tag（Attribution、文档范围、Format、Servers/Channels/Operations/Messages、Bindings）：https://github.com/asyncapi/spec/blob/v3.1.0/spec/asyncapi.md ；官网同版：https://www.asyncapi.com/docs/reference/specification/v3.1.0
- **[S2]** AsyncAPI 官方 GitHub latest release API（`v3.1.0`、非 draft/prerelease、2026-01-31）：https://api.github.com/repos/asyncapi/spec/releases/latest
- **[S3]** AsyncAPI 官方，*Spec 3.1.0 Release Notes*（release 日期、兼容性及工具支持）：https://www.asyncapi.com/blog/release-notes-3.1.0
- **[S4]** AsyncAPI spec 官方 README（3.1.0 latest 与 master latest draft 的区分）：https://raw.githubusercontent.com/asyncapi/spec/master/README.md
- **[B1]** AsyncAPI 官方 *NATS Bindings 0.1.0*：https://www.asyncapi.com/docs/reference/bindings/nats ；官方仓库源：https://raw.githubusercontent.com/asyncapi/bindings/master/nats/README.md

### 官方采用案例与工具

- **[A1]** AsyncAPI 官方 Case Studies 总表：https://www.asyncapi.com/casestudies
- **[A2]** AsyncAPI 官方 Adeo Group case study：https://www.asyncapi.com/casestudies/adeogroup
- **[A3]** AsyncAPI 官方 HDI Global SE case study：https://www.asyncapi.com/casestudies/hdiglobal
- **[A4]** AsyncAPI 官方 TransferGo case study：https://www.asyncapi.com/casestudies/transfergo
- **[T1]** AsyncAPI 官方 Tools Dashboard（官方/社区工具目录及提交性质）：https://www.asyncapi.com/tools
- **[T2]** AsyncAPI 官方 CLI 文档（validate/convert/diff/generate/optimize/bundle/Studio）：https://www.asyncapi.com/docs/tools/cli
- **[T3]** AsyncAPI 官方 Generator 文档（文档、SDK、boilerplate 等生成）：https://www.asyncapi.com/docs/tools/generator

### CloudEvents、NATS 与组合关系

- **[C1]** CloudEvents 官方 GitHub latest release API（`ce@v1.0.2`）：https://api.github.com/repos/cloudevents/spec/releases/latest
- **[C2]** *CloudEvents Core 1.0.2*（事件格式目标、`type`、路由目的地、Event Format 与 Protocol Binding）：https://raw.githubusercontent.com/cloudevents/spec/v1.0.2/cloudevents/spec.md
- **[C3]** *CloudEvents NATS Protocol Binding 1.0.2*（structured JSON、不管 transfer/settlement、独立的 subject/type 示例）：https://raw.githubusercontent.com/cloudevents/spec/v1.0.2/cloudevents/bindings/nats-protocol-binding.md
- **[C4]** *CloudEvents Primer 1.0.2*（non-normative；分层架构与 protocol-level routing non-goal）：https://raw.githubusercontent.com/cloudevents/spec/v1.0.2/cloudevents/primer.md
- **[C5]** AsyncAPI 官方，Fran Méndez，*AsyncAPI and CloudEvents*（2019-05-11；互补、非必须组合、无 one-size-fits-all；旧版示例仅作概念证据）：https://www.asyncapi.com/blog/asyncapi-cloud-events
- **[N1]** NATS 官方 *Subjects*（subject 是路由地址、层级和通配符）：https://docs.nats.io/concepts/subjects
