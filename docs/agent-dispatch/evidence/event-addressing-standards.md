# CloudEvents `type` 与 NATS subject 的正式标准寻址方案

> 状态：只读调研；不代替最终决策，不修改其他文件。
> 截止日期与所有外部 URL 访问日期：**2026-11-14**。
> 范围：一期已选 NATS + JetStream、CloudEvents 1.0.2 structured JSON；只讨论事件寻址、契约描述、JetStream 捕获与保留流量隔离。不推荐 `events.<type>` / `dsh.events.<type>` 等新增前缀映射，不讨论 Worker、graph 或任务语义。
> 标注：**事实**来自正式规范、官方文档、官方源码或项目自身一手材料；**推断**是基于这些事实的适配分析。规范示例、项目实践与生产采用证据分开表述。
> 版本边界：CloudEvents 使用 `v1.0.2` released tag；AsyncAPI 使用当前正式 `v3.1.0` 与 NATS binding `0.1.0`；xRegistry 使用当前最新发布 `v1.0-rc4`，其 release candidate 地位不省略。无版本 NATS 网页和项目 `main` 示例表示访问当日内容。

## 1. 直接结论

1. **同值方案可行，且可以准确称为“复用同一标识”，不必称为自定义前缀映射。**规则只是 `NATS subject = CloudEvents type`，不添加前缀、不改大小写、不转义、不查映射表。但它仍是一个跨层项目 profile（项目约束），不是 CloudEvents 或 NATS 已经规定的通用算法；“identity（恒等）约束”不等于“完全没有约定”。[CE1][CE4][N1]
2. **任意合法 CloudEvents `type` 不能都直接当 NATS subject。**CloudEvents 允许的非空 Unicode String 比 NATS 可安全寻址的字符串宽；必须收紧为点分、非空 token 的 NATS-safe 子集，并排除空白、空 token、`*`、`>`、`$` 起始空间和 `_INBOX` 保留空间。收紧后，CloudEvents 常见的 reverse-DNS 类型名可以原样成为 NATS subject。[CE1][N1][N2]
3. **推荐 A+B，而不是把二者当成互斥选项。**A 决定地址关系：`subject == type`；B 用一份 AsyncAPI 3.1.0 文档显式记录 NATS server、每个 channel 的地址、应用视角的 `send` / `receive`、完整 CloudEvents envelope 和每类 `data` schema。标准负责表达和机器可读化，项目只补事件名称、相等约束及部署配置，不发明新的线上协议。[A1][A2]
4. **AsyncAPI 的正式 NATS binding 很薄，但 Core 已足够描述基本地址契约。**NATS binding `0.1.0` 的 server/channel/message binding 都是空保留对象，只有 operation binding 定义 `queue`；NATS subject 应写在 Core `channels.<id>.address`，不是等待一个 NATS channel binding 字段。JetStream stream 捕获列表、retention、account 拓扑不由该 binding 表达。[A1][A2]
5. **CloudEvents structured JSON 的规范稳妥写法是 `contentType` 与 `schemaFormat` 分工。**`message.contentType: application/cloudevents+json` 描述整个线上 payload；`payload.schemaFormat: application/schema+json;version=draft-07` 描述用来校验完整 envelope 的 JSON Schema，envelope 内的 `datacontenttype` 仍描述 `data`。把 `application/cloudevents+json` 放进 `schemaFormat` 在 AsyncAPI 中属于 custom value，实现支持为 OPTIONAL；不能宣称当前工具都必须原生理解。[CE2][A1][A3]
6. **JetStream 一期优先使用显式 subject 正列表。**它与事件契约逐项对应，能从捕获边界排除 `$SRV`、`_INBOX` 和其他流量；代价是新增事件类型时必须先同步 stream 配置。保留 `type` 自身的统一 reverse-DNS 根并用 `<root>.>` 可减少同步，但会捕获根下所有当前和未来流量。独立 account 是安全/资源隔离手段，不是 CloudEvents 过滤器，不能单独排除同 account 的 `$SRV` 或 `_INBOX`。[N2][N3][N4][N5][N6]
7. **xRegistry 有直接适配价值，但不直接替项目分配地址。**其 Message/Endpoint Registry 能显式声明 CloudEvents `type`、NATS `subject` / `subjectfilter`、方向、structured mode 与 data schema；共享占位符还可表达 type 与 subject 同值。它仍需项目提供名称，也不自动创建 JetStream stream。由于当前是 `v1.0-rc4` 且引入注册表模型和工具成本，列为 C，不作为一期默认。[X1][X2][X3]
8. **行业规范能 cover“用标准字段表达并执行一个最少自定义方案”，不能 cover“标准替项目决定事件名和 NATS 地址”。**如果要求是取消新增前缀转换和新协议，答案是可以；如果要求是只声明遵循某标准、无需任何应用命名与 profile 就得到地址，答案是不可以。[CE1][CE4][N1][A1][X1]
9. **本次一手材料中，独立 topic/subject 有明确真实实践；同值恒等尚缺同强度生产实例。**CloudEvents 官方 Go SDK 的 NATS/JetStream 示例和 Dapr 都使用独立地址与 CE `type`。这不否定同值方案的技术可行性，但不能把它宣传成已被这些实现采用的统一行业惯例。[P1][P2][P3]

## 2. 标准能力矩阵（事实）

| 标准 / 官方机制 | 能正式表达或执行什么 | 不能替项目决定什么 | 对本问题的结论 |
|---|---|---|---|
| **CloudEvents Core 1.0.2 `type`** | 非空 String；描述 originating occurrence 的事件类型，常用于 routing、observability、policy；格式由 producer 定义，SHOULD 使用 reverse-DNS 前缀。[CE1] | 不定义 NATS subject，不分配事件类型名，不保证字符可直接用于 NATS。 | 可复用其值，但必须另有同值 profile 与字符收紧。 |
| **CloudEvents JSON Event Format 1.0.2** | 完整事件表示为 JSON object；媒体类型为 `application/cloudevents+json`；官方提供 Draft-07 JSON Schema。[CE2][CE3] | 不规定消息发往哪个 NATS subject。 | 可作为 AsyncAPI `contentType` 和完整 envelope schema 的依据。 |
| **CloudEvents NATS Protocol Binding 1.0.2** | structured JSON 成为 NATS message payload；明确不约束 NATS transfer / settlement。[CE4] | 不规定 `type → subject`，不规定 JetStream stream、subjects、account 或保留流量排除。 | 同值是合法项目选择，不是 binding 提供的算法。 |
| **NATS subject / authorization / accounts** | subject 是路由地址；点分 token、大小写敏感、订阅通配符；publish/subscribe permissions 按 subject 授权；account 提供隔离 subject space。[N1][N2][N5][N6] | 名称由应用选择；account 不理解 CloudEvents，也不自动识别哪些消息是事件。 | 同值、显式列表、统一根和 account 都是官方机制上的应用设计。 |
| **JetStream Stream `subjects`** | stream 配置是“要消费的 subjects 列表”，支持通配符；可用精确正列表或限定根捕获。[N3] | 不根据 CloudEvents `type` 自动建 stream 或更新列表，不验证 payload 是否 CloudEvent。 | 可直接捕获同值地址；新增类型与 stream 配置的同步仍需项目负责。 |
| **AsyncAPI 3.1.0 Core** | `servers.host/protocol`、`channels.address/messages`、`operations.action=send/receive`、message `contentType`、`payload` 的 Multi Format Schema。[A1] | 文档描述一个 application 的 API；不自动选择地址，不自动保证 `channel.address == envelope.type`，不代替基础设施配置。 | **一份文档可以显式声明基本 NATS + CloudEvents 契约。** |
| **AsyncAPI NATS binding 0.1.0** | operation `queue`（最长 255 字符）与 `bindingVersion`。[A2] | server/channel/message binding 均无属性；没有额外 subject、JetStream stream、retention、account 字段。 | 地址使用 Core `channel.address`；不要虚构 NATS binding 能力。 |
| **AsyncAPI `schemaFormat`** | Multi Format Schema Object 允许 custom values；自定义实现支持 OPTIONAL；必须/建议支持表不含 CloudEvents。[A1] | 不保证第三方工具理解 `application/cloudevents+json` 为 schema language 或自动包装 envelope。 | 标准稳妥路径是 JSON Schema 描述完整 envelope，`contentType` 表示 structured media type。 |
| **xRegistry Message / Endpoint 1.0-rc4** | message 可同时声明 `CloudEvents/1.0` envelope metadata、NATS `protocoloptions.subject` 与 data schema；endpoint 可声明 `usage`、NATS `subject` / `subjectfilter`、structured mode/format。[X1][X2] | 不自动分配 subject，不规定 type 必须等于 subject，不配置 JetStream。 | 能标准化记录同值或独立地址；适合确需 registry 的 C。 |

## 3. A：CloudEvents `type` 与 NATS subject 完全同值

### 3.1 字符规则是否兼容（事实）

| 维度 | CloudEvents `type` | NATS subject | 直接同值的后果 |
|---|---|---|---|
| 基本类型 | 非空 String；CloudEvents String 排除控制字符、Unicode noncharacters 和非法 surrogate，但本身不是 ASCII-only。[CE1] | 可含 UTF-8，但不能含 whitespace、tab、line break；subject 是路由地址。[N1][N2] | **不是全集兼容，只能取交集并进一步排除保留语义。** |
| 点号 | Core 未把点号定义为通用分隔符；示例与 reverse-DNS 建议常形成点分名。[CE1] | `.` 划分 token；`*` 匹配一个 token，`>` 匹配末尾一个或多个 token。[N2] | 点分 reverse-DNS 类型可自然成为 subject hierarchy；必须禁止空 token。 |
| 通配符 | Core 没把 `*` / `>` 定为 `type` 的禁用字符。[CE1] | 通配符是 subscriber-only 工具；publisher 应命名完整 literal subject。[N2] | 原生 `type` 必须排除 `*` / `>`，不能让事件类型兼作订阅 pattern。 |
| 保留空间 | Core 不保留 `$SRV` / `_INBOX` 类型名。[CE1] | 起始 `$` 的 subject 保留给 server/client 子系统；`_INBOX` 是客户端 reply subject 保留前缀。[N2][N6] | 原生 `type` 必须避开这些空间，不能只依赖“字符串能发出”。 |
| 大小写 | Core 不要求小写 `type`。[CE1] | subject 大小写敏感。[N2] | 可以允许大小写，但一期用小写 ASCII 能减少跨系统歧义；这是收紧而非转换。 |

**事实边界：**NATS 文档说 subject 可以包含广泛 UTF-8 字符，同时建议使用字母、数字、`-`、`_` 以避免意外。因此下面的窄字符集是项目为保证稳定互操作而选择的共同子集，不是声称 NATS 只允许这些字符。[N1][N2]

### 3.2 最小收紧与恒等约束（推断）

建议原生事件统一采用：

```text
type = token ("." token)*
token = 首字符为 a-z 或 0-9，后续仅 a-z、0-9、"_"、"-"

正则：
[a-z0-9][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)*
```

并同时规定：

```text
publishNatsSubject = event.type                 // 原样赋值，无转换
receivedNatsSubject == decodedEvent.type        // 接收侧契约校验
```

这条 profile 达到以下效果：

- 不含空白、控制字符、空 token、前导/尾随点、连续点、`*`、`>` 或 `$`；因此 `$SRV` 等 `$` 空间进不了原生事件地址。
- 小写规则已经排除大写 `_INBOX`；若未来放宽大小写或首字符，仍必须显式保留 `_INBOX` 及其子空间。
- 不做 lowercase、escape、替换或加前缀。非法外部 `type` 不能被静默“修正”；若要接纳它，应改用 B 的独立显式 NATS 地址，在边界记录二者关系。
- CE `type` 与 NATS subject 即使值相同，语义仍分别是“事件分类”和“传输地址”；相等是有意的复用，不是把两个规范概念合并。CE 可选属性 `subject` 继续是另一概念，本方案不使用它。[CE1][CE4]

### 3.3 代价（推断）

1. **类型演进会联动地址、订阅、stream 捕获和权限。**不兼容变更若更换 `type`，NATS 地址也随之变化，需要契约迁移。
2. **外部合法 CloudEvents 类型未必能原生进入。**同值便利来自收紧原生 profile，不是对所有 CloudEvents 生产者透明。
3. **相等关系仍需校验。**CloudEvents 与 NATS 都不会替应用检查 payload 中的 `type` 是否等于实际收到消息的 subject。
4. **统一 reverse-DNS 根不是新协议。**选择哪个组织/产品根、每类事件叫什么，是 CloudEvents 本来就留给 producer 的应用信息；A 消除了第二套传输命名，而没有消除事件命名本身。

## 4. B：用 AsyncAPI 标准契约管理显式 NATS 地址

### 4.1 当前正式 NATS binding 的准确边界（事实）

| 层级 | AsyncAPI NATS binding 0.1.0 | 可由 AsyncAPI Core 表达的内容 |
|---|---|---|
| Server | 空对象，名称保留，禁止属性。[A2] | `servers.<id>.host`、`protocol: nats`、可选 protocolVersion、security 等。[A1] |
| Channel | 空对象，名称保留，禁止属性。[A2] | `channels.<id>.address` 写实际 NATS subject；`messages` 列出该地址消息；`servers` 引用可用 server。[A1] |
| Operation | 仅 `queue` 与 `bindingVersion`。[A2] | `action: send` 或 `receive` 表示**本文档 application** 的方向；`channel` 引用地址。[A1] |
| Message | 空对象，名称保留，禁止属性。[A2] | `contentType`、完整 `payload` schema、examples 等。[A1] |

**事实：**AsyncAPI 3.1.0 是当前正式 release；官方 release API 返回非 draft、非 prerelease 的 `v3.1.0`。[A4]

**推断：**空 NATS channel/message binding 不妨碍 B，因为地址、方向和 payload 已在 Core；它妨碍的是把 JetStream stream/consumer/retention/account 也宣称成“已由 AsyncAPI NATS binding 标准化”。这些应保留在部署配置，不必为了补齐表象而发明 `x-dsh-*` 扩展。

### 4.2 `contentType`、`schemaFormat` 与 `datacontenttype` 分工（事实 + 推断）

| 字段 | 描述对象 | 本方案规范稳妥值 | 边界 |
|---|---|---|---|
| AsyncAPI `message.contentType` | 整个 NATS message payload 的编码/解码 media type | `application/cloudevents+json` | 是文档元数据；不表示必须给 NATS 新增一个自定义 header。[A1][CE2] |
| AsyncAPI `payload.schemaFormat` | `payload.schema` 所使用的 **schema format/language** | `application/schema+json;version=draft-07`，或使用默认 AsyncAPI Schema | CloudEvents 不在必须/建议支持表；custom value 的实现支持 OPTIONAL。[A1] |
| CloudEvents `datacontenttype` | envelope 内 `data` 的 media type | 一期 JSON data 可显式为 `application/json` | 不是整个 structured CloudEvent 的 media type。[CE1][CE2] |

**事实：**AsyncAPI 官方 2019 博客曾展示 `schemaFormat: application/cloudevents+json; version=0.2; ...`，示例让 payload 只写 data shape，再由设想中的 custom schema tooling 处理 CloudEvents。该文使用 CloudEvents 0.2 和 AsyncAPI 2.0.0-rc1，是官方历史指导而非当前 normative tooling 承诺。[A3]

**推断：**可以采用 custom `schemaFormat`，但那会保留一个项目/工具特定的 schema parser 语义，不符合本次“最少自定义”的目标。直接描述完整 envelope 的 JSON Schema 更明确，也不需要工具自动补出 CloudEvents 属性。CloudEvents 官方本身提供 Draft-07 JSON Schema，可作为组成或引用依据；跨 schema 引用时还需遵守 AsyncAPI 对引用双方 `schemaFormat` 一致的要求。[A1][CE3]

### 4.3 一份文档声明地址、方向、envelope 与 data schema（推断示例）

以下骨架只使用 AsyncAPI Core 和标准 JSON Schema Draft-07；事件名均为示例，不是标准分配值：

```yaml
asyncapi: 3.1.0
info:
  title: Example event application
  version: 1.0.0
servers:
  nats:
    host: localhost:4222
    protocol: nats
channels:
  bugCreated:
    address: com.example.bug.created
    servers:
      - $ref: "#/servers/nats"
    messages:
      bugCreated:
        $ref: "#/components/messages/bugCreated"
operations:
  sendBugCreated:
    action: send
    channel:
      $ref: "#/channels/bugCreated"
  receiveBugCreated:
    action: receive
    channel:
      $ref: "#/channels/bugCreated"
components:
  messages:
    bugCreated:
      contentType: application/cloudevents+json
      payload:
        schemaFormat: application/schema+json;version=draft-07
        schema:
          type: object
          required: [specversion, id, source, type, data]
          properties:
            specversion:
              const: "1.0"
            id:
              type: string
              minLength: 1
            source:
              type: string
              format: uri-reference
              minLength: 1
            type:
              const: com.example.bug.created
            datacontenttype:
              const: application/json
            data:
              type: object
              required: [bugId]
              properties:
                bugId:
                  type: string
```

**能直接读出的契约：**NATS server；NATS subject `com.example.bug.created`；application 可 send 与 receive 该 channel；整个 payload 是 CloudEvents structured JSON；`type` 固定为同值字符串；`data.bugId` 有 schema。

**仍需项目校验：**AsyncAPI 没有规定 `channels.bugCreated.address` 必须与 `payload.schema.properties.type.const` 相等。A+B 应在契约校验或生成流程中检查这个不变量，防止两处漂移；这不是新增线上协议。[A1]

**文档作用域边界：**`send` / `receive` 是本文档 application 的视角，root operations 是该 application 要实现的 operations。规范还明确不建议简单反转另一份 sender 文档来生成 receiver 文档，因为两个应用的地址与操作含义不必对称。因此“一份文档可以声明双向”不等于“一份文档天然是全系统、多应用注册中心”；若需要后者，C 更贴近。[A1]

### 4.4 “标准能描述地址”与“标准替项目决定地址”（事实 + 推断）

- **事实：**`channel.address` 是作者填写的字符串；缺失或为 `null` 表示 unknown。规范没有从 CE `type` 计算它的规则。[A1]
- **事实：**channel message map 要求发往该 channel 的每条消息能且只能匹配其中一个 Message Object；operation messages 可进一步限定。[A1]
- **推断：**B 可以把地址决策公开、审查、生成代码和同步 JetStream 配置，但不能消除地址决策。A+B 时 `address` 复用事件 `type`；B 独立使用时 `address` 与 `type` 可不同，尤其适合不能收紧的外部 CE 类型。

## 5. C：xRegistry 事件目录（有直接价值，但非自动分配）

### 5.1 正式能力（事实）

1. 当前官方最新 release 是 **`v1.0-rc4`**；README 将 Core、Endpoint、Message、Schema 的最新发布均列为该版本，工作树另列 WIP。[X3][X4]
2. Message Definitions Registry 可在同一 message 中声明：
   - `envelope: CloudEvents/1.0` 与 `envelopemetadata.type`；
   - `protocol: NATS` 与 `protocoloptions.subject`；
   - `dataschemaformat`、`dataschema` / `dataschemauri`、`datacontenttype`。[X1]
3. 同一 message definition 中重复出现的 URI-template placeholder MUST 表示相同值。因此把 CE `type` 和 NATS `subject` 都写成同一 `{eventType}` 占位符，可以正式表达“二者替换后同值”；写两个相同 literal 也能记录同值。[X1]
4. Endpoint Registry 可用 `usage: producer/consumer/subscriber` 描述方向；NATS endpoint 有具体 `subject`、订阅 `subjectfilter`、`queuegroup`，并规定 publish subject 不得含 `*` / `>` wildcard token。CloudEvents endpoint options 可指定 `mode: structured` 和与实际消息 content type 一致的 `format`。[X2]

### 5.2 适配边界（推断）

- **有直接用处的部分：**标准化事件目录、CE metadata 与 NATS 地址的关联、data schema 引用、方向，以及比 AsyncAPI 更直接的共享占位符同值表达。
- **没有解决的部分：**`eventType` 的实际名称、是否采用恒等策略、JetStream stream `subjects` 配置与保留流量隔离，仍由项目决定。
- **一期成本：**引入 xRegistry document/API、模型治理和工具链，比单个 AsyncAPI 文件更重；其版本仍为 RC。只有已经需要跨应用 registry/discovery 或共享模板时，C 的增量收益才明显。

## 6. A / B / C 对比（推断）

> A 是地址关系；B/C 是契约载体，所以 **A+B 或 A+C 可以且通常应该组合**。B 独立使用时则允许 type 与 NATS subject 不同。

| 候选 | 最少自定义内容 | 标准能覆盖的部分 | 仍需产品决定 | 主要代价 / 适用边界 |
|---|---|---|---|---|
| **A：`subject == type`** | 一条恒等 profile + NATS-safe `type` grammar | CE 提供类型语义；NATS 提供地址、订阅和权限；JetStream 捕获地址 | 事件类型名及其 reverse-DNS 根；字符收紧；不相容变更策略 | 最简单、无第二套地址；但外部任意 CE type 不一定可直接接纳，类型与地址演进耦合。**原生事件首选。** |
| **B：AsyncAPI 显式地址契约** | 每事件维护 channel/message/operation；A+B 时另校验 address==type | 标准描述 server、address、send/receive、contentType、完整 envelope 与 data schema | 文档 application 边界、operation 方向、server 部署值、每类事件与 data schema | 增加文档与同步工作；NATS binding 不覆盖 JetStream。B 独立时可容纳非法 NATS 字符的外部 type，但需理解两个标识。**推荐作为 A 的契约层。** |
| **C：xRegistry Message + Endpoint** | 采用 registry 文档/API 与目录治理；可共享 `{eventType}` | 标准描述 CE envelope metadata、NATS subject/filter、方向、structured format、schema；共享占位符可表达同值 | 所有实际名称、registry 部署/模型、JetStream 配置；是否接受 RC | 能力最完整但最重。**只有确有跨应用目录/discovery 需求时采用。** |

### 这些剩余决策是应用信息还是新协议？

| 决策 | 性质判断（推断） |
|---|---|
| 每类事件的 `type` 名称、组织根和 data schema | **不可避免的应用信息。**CloudEvents 明确由 producer 定义类型语义；不是新协议。 |
| 原生事件 `subject == type` 与字符子集 | **很小的项目 profile。**没有新字段、新线格式或前缀映射，但仍是必须公开的契约，不能冒充国际标准。 |
| AsyncAPI document/application ID、operationId、send/receive、server host | **应用与部署元数据。**AsyncAPI 标准字段直接承载，不是新协议。 |
| JetStream stream 名称、精确 subjects/统一根、retention、是否独立 account | **基础设施配置与隔离策略。**不是事件寻址协议；AsyncAPI 当前也不替它们标准化。 |
| B 独立使用时 type 与 address 的逐项关系 | **应用契约信息。**由 AsyncAPI 显式保存，不需要另造转换函数，但比 A 多维护一个标识。 |

## 7. JetStream 捕获与 `$SRV` / `_INBOX` 隔离

### 7.1 官方机制（事实）

- Stream Create API 的 `subjects` 是字符串列表，表示 stream 要消费的 subjects，支持 wildcards。[N3]
- `$` 起始 subject 保留；官方列出的子系统包括 `$SYS`、`$JS`、`$KV`、`$O`、`$SRV`。`_INBOX` 是自动 reply subject 前缀，业务消息不应使用。[N2]
- `$SRV.PING/INFO/STATS` 是 NATS Services 在 **account 内**提供的 discovery subjects。[N6]
- account 是隔离 tenant 的 subject space；不同 account 默认看不到彼此流量，跨 account 需要显式 export/import。每个启用 JetStream 的 account 有自己的 JetStream store。[N5]
- publish/subscribe `allow` 是 positive permission；一旦写 allow，未列出的其他 subject 都被拒绝。官方特别提醒过宽的 `>` 会包括 `$JS.API.>` 等控制面。[N4]

### 7.2 方案与代价（推断）

| 捕获 / 隔离方案 | 示例形态 | 排除非事件流量的实际机制 | 优点 | 代价与风险 |
|---|---|---|---|---|
| **1. 单 stream + 显式精确 subject 列表** | `subjects: [com.example.bug.created, com.example.bug.updated]` | 只有正列表中的 type/address 能进入；`$SRV`、`_INBOX`、其他 subject 均不匹配 | 边界最清楚；与 AsyncAPI channel 列表一一对应；无需统一根或 account | 新事件上线前必须同步 stream；契约与配置可能漂移，需要生成或 CI 校验。多事件共享 stream 时 retention 也共享。 |
| **2. 保留 `type` 自身的统一根 + 限定通配** | 所有原生类型在 `com.example.` 下，stream 用 `com.example.>` | 根以外的 `$SRV`、`_INBOX` 不匹配；根内靠命名治理和 publisher 权限保证只放事件 | 新类型自动被捕获；列表短；**没有给 type 添加传输前缀**，只是选择统一事件命名空间 | 会捕获根下所有当前/未来消息，包括误发的非 CloudEvents；需要严格保留根、ACL 和 payload 校验。多组织根会降低简洁性。 |
| **3. 独立 events account + 正列表或限定根** | events account 内再使用方案 1 或 2 | account 阻断其他 account；正列表/限定根再过滤本 account 地址 | 同时获得 tenant 安全、资源配额与地址隔离；适合已有明确信任边界 | account/user/JetStream 配置增加；跨 account 消费需 export/import。**仅建 account 不会自动排除本 account 的 `$SRV` / `_INBOX`，不要单独用裸 `>` 代替事件过滤。** |
| **4. 每类事件独立 stream** | 每 stream 仅一个精确 type | 每 stream 只接受一个地址 | 每类事件可独立 retention、容量和权限 | stream/consumer 对象与运维显著增加；一期没有差异化保留需求时不划算。 |

### 7.3 推荐捕获规则（推断）

一期采用方案 1：

```text
Stream: <由部署配置命名>
subjects:
  - com.example.bug.created
  - com.example.bug.updated
  # 每个已发布事件 type / AsyncAPI channel.address 一项，保持完全同值
```

配套最小规则：

1. **契约先行。**新事件先加入事件目录/AsyncAPI，再把其精确 address 加入 stream，最后开放 producer；用生成或 CI 比较两个列表。
2. **权限同为正列表。**producer 的 publish allow 只包含其被授权的事件地址；不要用 `publish: [">"]`。需要服务请求/reply 的 principal 与事件 principal 分开，避免 `_INBOX` 权限扩张到事件身份。[N4]
3. **不使用裸 `>` 捕获事件。**独立 account 也不能替代精确列表或限定根。
4. **捕获不等于验证。**JetStream 只按 subject 捕获 bytes；structured JSON 是否为合法 CloudEvent、实际 `type` 是否等于收到消息的 NATS subject、`data` 是否符合 schema，仍由 producer/consumer/适配层校验。[CE4][N3]
5. **有真实 tenant/安全隔离需求时再加 account。**它是方案 1 或 2 的外层边界，不是替代品。

## 8. 真实实践与证据边界（事实）

| 证据 | 实际做法 | 能证明什么 / 不能证明什么 |
|---|---|---|
| **CloudEvents Go SDK，NATS sender / receiver 官方源码** | sender 与 receiver 默认 NATS subject 都是 `sample`，事件 `type` 是 `com.cloudevents.sample.sent`。[P1] | 直接证明官方 SDK 示例把 NATS subject 与 CE type 作为独立值；不是同值反例的技术禁令，也不是生产部署统计。 |
| **CloudEvents Go SDK，JetStream v3 sender 官方源码** | stream 捕获 `sample.>`；示例消息 subject 包括 `sample.even.0`、`sample.odd.1`，CE `type` 仍为 `com.cloudevents.sample.sent`。[P2] | 直接证明 JetStream 下也可使用独立、更细粒度 subject；该示例不规定其他项目的地址策略。 |
| **Dapr v1.19 Pub/Sub 官方文档** | 自动生成的 CloudEvent 含 `topic: orders`、固定 `type: com.dapr.event.sent`，data 中有业务对象 ID。[P3] | 真实平台文档证明独立 topic 与 CE type 是实际做法；不是 NATS 专属证据，也不能外推所有 Dapr 自定义事件。 |
| **CloudGrid 自身公开 AsyncAPI 文件** | AsyncAPI 3.0.0 文件声明 `protocol: nats`、大量显式 `channels.address` 以及对应 send/receive operations；README 把该文件列为实现契约事实源。[P4] | 是一个公开项目以 AsyncAPI 管理 NATS 地址与方向的一手实例；**不含 CloudEvents，不是 AsyncAPI 官方示例，也不证明成熟生产采用或行业普及。** |
| **同值生产实践检索结果** | 在本次核查的 CloudEvents/NATS 正式规范、CloudEvents Go SDK、Dapr、AsyncAPI 与 xRegistry 一手材料中，未找到可核验的生产级 `NATS subject == CE type` 恒等实例 | 只能报告“本次范围内未找到”，不能证明行业不存在。xRegistry 能表达同值是标准能力证据，不是采用证据。 |

**实践归纳（推断）：**现有直接证据证明“独立 topic/subject”有明确的官方实现实践；A 的依据是两层规则兼容、恒等关系简单和标准契约可表达，而不是伪造一个已有行业统一惯例。B 的公开项目实例支持其可实施性，但两种做法的采用广度都不由本研究声称。

## 9. 是否回答“行业规范能否 cover”

| 用户要求的不同口径 | 答案 | 理由 |
|---|---|---|
| **不新增 `events.` / `dsh.events.` 前缀，不自定义转换函数，不发明新线上字段，能否由正式标准表达？** | **能。推荐 A+B。** | CE/NATS 允许同值字符串；AsyncAPI 标准字段能记录 server、address、方向、contentType 与完整 schema；JetStream 官方 `subjects` 能捕获。[CE1][N1][A1][N3] |
| **能否只写“遵循 CloudEvents/NATS/AsyncAPI”，无需项目文档，就让第三方知道地址？** | **不能。** | CE binding 不派生 subject；NATS 名称由应用设计；AsyncAPI 是描述文档而不是地址分配器。[CE4][N2][A1] |
| **能否不定义任何项目规则，保证所有合法 CE type 直接成为 NATS subject？** | **不能。** | 字符全集与保留空间不一致，必须收紧原生 profile 或使用独立地址。[CE1][N1][N2] |
| **能否用 AsyncAPI NATS binding 把 JetStream stream/account/retention 也标准化？** | **当前不能。** | 正式 NATS binding 0.1.0 仅有 operation `queue`；其余靠 JetStream/NATS 配置。[A2][N3][N5] |
| **是否有官方发布的目录规范能记录 type 与 subject 的同值关系？** | **有，xRegistry 当前发布的 v1.0-rc4 可以；但它仍是 RC，且不是地址分配器。** | 同一 message 可包含 CE type 与 NATS subject，共享 placeholder 必须替换为同值。[X1] |

## 10. 推荐路线与仍需用户决定的少量事项（推断）

### 推荐路线

1. **原生事件采用 A：**`NATS subject = CloudEvents type`，不加任何前后缀，不做转换；采用 §3.2 的 ASCII 点分 grammar，接收侧验证相等。
2. **用 B 发布标准契约：**使用 AsyncAPI 3.1.0；每个事件 channel 显式写同值 `address`；message `contentType: application/cloudevents+json`；用标准 JSON Schema 描述完整 envelope 和该事件 `data`；operations 按 application 视角写 send/receive。
3. **把同值校验放进契约验收：**至少检查 channel address==schema 中固定的 CE `type`、实际 NATS subject==解码后的 CE `type`、非法字符被拒绝。避免两处同值文本漂移。
4. **JetStream 使用显式精确 subject 列表：**从契约生成或与其比对；producer 使用 subject positive ACL；不使用裸 `>`。只有根治理或 tenant 隔离成为真实需求时，才分别评估限定根或独立 account。
5. **C 暂缓：**出现跨应用目录/discovery、共享模板或 registry API 的真实需求后，再评估 xRegistry；不以“更标准化”为由一期增加注册表。
6. **外部事件另走显式契约：**若外部 CE `type` 不满足原生 grammar，可使用 B 的独立 `channel.address`，在边界保存并校验 type/address 关系；不要暗中拼接、转义或改名后仍宣称“同值”。

### 仍需用户决定

1. **是否批准同值 profile 及其字符收紧。**这是唯一新增的跨层规则；不新增线上协议。
2. **原生事件目录：每类事件的正式 `type`、组织 reverse-DNS 根、data schema 与兼容策略。**这些本就是事件产品信息；A 不再需要第二套 NATS 名称。
3. **AsyncAPI 的 application 划分与各 operation 方向。**一份文档可双向，但不能把它误当成自动覆盖所有应用的全局目录。
4. **捕获边界是否接受一期显式列表及其同步成本。**本研究推荐接受；若选择统一根或独立 account，需要同时接受 §7.2 的治理/运维代价。

除上述事项外，不需要用户再决定一个 `events.` 前缀、分隔符替换、escape 算法或自定义 `type → subject` 映射表。

## 11. 一手来源 URL 与访问日期

> 以下来源均访问于 **2026-11-14**。规范结论优先使用固定 release/tag；`main/master` 与无版本网页只表示访问当日内容。官方博客与项目实例均已注明非 normative / 非普遍性边界。

### CloudEvents 正式规范

- **[CE1]** CloudEvents Core 1.0.2（`type` 语义、String 规则、reverse-DNS SHOULD、事件不携带特定路由目的地）：https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md
- **[CE2]** CloudEvents JSON Event Format 1.0.2（`application/cloudevents+json`、完整 JSON envelope、`datacontenttype`）：https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/formats/json-format.md
- **[CE3]** CloudEvents 官方 Draft-07 JSON Schema 1.0.2：https://raw.githubusercontent.com/cloudevents/spec/v1.0.2/cloudevents/formats/cloudevents.json
- **[CE4]** NATS Protocol Binding for CloudEvents 1.0.2（structured-only、payload、不管 transfer/settlement、独立 `mySubject` 示例）：https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/bindings/nats-protocol-binding.md

### NATS / JetStream 官方文档

- **[N1]** NATS，*Subjects*（路由地址、UTF-8、空白限制、大小写、点分 hierarchy）：https://docs.nats.io/concepts/subjects
- **[N2]** NATS，*Subjects & wildcards*（token、subscriber-only wildcard、`$` / `_INBOX` 保留空间、应用负责命名）：https://docs.nats.io/learn/core-nats/subjects-and-wildcards
- **[N3]** NATS，*Create Stream*（`subjects` 正列表及 wildcard 支持）：https://docs.nats.io/reference/jetstream/api/stream/create
- **[N4]** NATS，*Authorization*（subject allow/deny、过宽 `>` 包含控制面、权限边界）：https://docs.nats.io/learn/security/authorization
- **[N5]** NATS，*Accounts and multitenancy*（隔离 subject space、system account、per-account JetStream、跨 account 边界）：https://docs.nats.io/learn/security/accounts-and-multitenancy
- **[N6]** NATS，*Services Discovery*（account 内 `$SRV.PING/INFO/STATS`）：https://docs.nats.io/learn/services/discovery

### AsyncAPI 正式规范与官方指导

- **[A1]** AsyncAPI Specification 3.1.0（Server/Channel/Operation/Message、Multi Format Schema、`contentType`、custom `schemaFormat` 与 OPTIONAL 实现、application 视角）：https://github.com/asyncapi/spec/blob/v3.1.0/spec/asyncapi.md
- **[A2]** AsyncAPI NATS Bindings 0.1.0（固定仓库快照；server/channel/message 空对象，operation `queue`）：https://github.com/asyncapi/bindings/blob/6a5337a1eb7a6e1fd1fa4040dbff28a4d6194c94/nats/README.md ；访问当日网页：https://www.asyncapi.com/docs/reference/bindings/nats
- **[A3]** AsyncAPI 官方博客，*AsyncAPI and CloudEvents*（2019，CloudEvents 0.2 / AsyncAPI 2.0 RC 的 custom `schemaFormat` 历史示例，非当前 normative tooling 承诺）：https://www.asyncapi.com/blog/asyncapi-cloud-events
- **[A4]** AsyncAPI 官方 GitHub latest release API（当前 `v3.1.0`，非 draft / prerelease）：https://api.github.com/repos/asyncapi/spec/releases/latest

### xRegistry 官方发布规范

- **[X1]** xRegistry Message Definitions Registry 1.0-rc4（CloudEvents envelope metadata、NATS `protocoloptions.subject`、data schema、共享 placeholder 同值规则）：https://github.com/xregistry/spec/blob/v1.0-rc4/message/spec.md
- **[X2]** xRegistry Endpoint Registry 1.0-rc4（usage、NATS subject/filter、publish 不可含 wildcard、CloudEvents structured mode/format）：https://github.com/xregistry/spec/blob/v1.0-rc4/endpoint/spec.md
- **[X3]** xRegistry 官方 README（最新 release 与 WIP 分列、项目定位）：https://raw.githubusercontent.com/xregistry/spec/main/README.md
- **[X4]** xRegistry 官方 GitHub latest release API（`v1.0-rc4`）：https://api.github.com/repos/xregistry/spec/releases/latest

### 实现方 / 项目自身一手实践

- **[P1]** CloudEvents Go SDK 官方 NATS sender 与 receiver 示例（`sample` 与 `com.cloudevents.sample.sent`）：https://raw.githubusercontent.com/cloudevents/sdk-go/main/samples/nats/sender/main.go ；https://raw.githubusercontent.com/cloudevents/sdk-go/main/samples/nats/receiver/main.go
- **[P2]** CloudEvents Go SDK 官方 JetStream v3 sender 示例（`sample.>`、`sample.even.0` / `sample.odd.1` 与固定 CE `type`）：https://raw.githubusercontent.com/cloudevents/sdk-go/main/samples/nats_jetstream/v3/sender/main.go
- **[P3]** Dapr v1.19 官方，*Publishing & subscribing messages with CloudEvents*（`topic: orders` 与 `type: com.dapr.event.sent`）：https://raw.githubusercontent.com/dapr/docs/v1.19/daprdocs/content/en/developing-applications/building-blocks/pubsub/pubsub-cloudevents.md
- **[P4]** CloudGrid 自身 README 与 AsyncAPI 3.0.0 message bridge 契约（公开项目实例，非行业标准示例或采用广度证明）：https://raw.githubusercontent.com/cloudgrid/cloudgrid/main/README.md ；https://raw.githubusercontent.com/cloudgrid/cloudgrid/main/specs/03-contracts/messages/message-bridge.asyncapi.yaml
