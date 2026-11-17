# CloudEvents `subject` 的正式规则、真实实践与一期省略建议

> 状态：只读调研；不代替最终决策，也不修改现有决策文件。
> 截止日期与所有外部 URL 访问日期：**2026-11-14**。
> 范围：仅讨论 CloudEvents 属性、NATS 寻址、业务对象标识、`data` 与互操作。
> 标注：**事实**来自官方规范、官方项目仓库或厂商一手文档；**推断**是基于这些事实的限定判断。实现示例只证明相应路径存在，不证明行业统一最佳实践。
> 方法：正式规则固定引用 CloudEvents **v1.0.2 released tag**；实现文档记录访问当日内容。“没有通用映射规则”的结论限于所核查的 Core、Primer、NATS Protocol Binding 及官方实现证据，不否认具体项目可以另有私有约定。

## 1. 直接结论

1. **一期完全不使用 CloudEvents `subject`，仍然符合 CloudEvents Core 1.0.2。**Core 只要求 `id`、`source`、`specversion`、`type`；`subject` 是 OPTIONAL。省略它的事件仍是合法 CloudEvent。[CE1]
2. **`subject` 的准确含义是 `source` 上下文中事件所涉及的对象，不是 NATS subject，也不必然是全局对象 ID。**它的典型价值是让无法解释 `data` 的通用中间件进行对象级过滤；并不是“只要事件涉及业务对象就必须填写”。[CE1][CE2]
3. **CloudEvents / NATS 正式规范没有规定从 CE `subject` 或 CE `type` 派生 NATS subject 的通用算法。**NATS Protocol Binding 1.0.2 只规定 structured JSON 如何成为 NATS message payload，并明确不约束消息 transfer；其示例使用任意字面量 `Subject: mySubject`，同时 CE `type` 是 `com.example.someevent`，二者没有推导关系。[CE3][CE4]
4. **因此，`type → NATS subject` 是合理的 DSH profile 约定，不是标准规定。**必须把映射函数、`type` 字符约束、通配符用法及不一致处理写成项目契约，不能宣称外部系统仅凭 CloudEvents 规范就能推出该地址。[CE1][CE2][CE4][N1]
5. **业务对象标识放在各类事件的 `data` schema 中符合 Core 的用途划分。**`data` 本来就承载 domain-specific information；把同一标识提升到 `subject` 的明确规范收益，主要是让通用中间件无需解码 `data` 就能按对象过滤或分派。一期没有此需求时不必双写。[CE1][CE2]
6. **建议一期省略，但应把“原生事件不使用”与“通用接收方拒绝/剥离”分开。**DSH 原生生产者可以完全省略 `subject`，DSH 消费者不依赖它；不应把带 `subject` 的外部事件说成“不符合 CloudEvents”。Core 还说明不支持某个 OPTIONAL 属性的 consumer 可忽略它，并建议 intermediary 转发 OPTIONAL 属性。[CE1]
7. **省略不损害基本信封互操作，但会失去一种对象级通用过滤能力。**使用 `type/source/id` 等标准属性的解析和处理仍可互操作，按 `type/source` 的通用路由也不需要 `subject`；依赖 `subject` 的对象路径、前后缀过滤或外部订阅则需要适配，不能宣称互操作毫无代价。[CE1][AZ2][K2]

## 2. 正式规则

### 2.1 Core / Primer 对 `subject` 的规定（事实）

| 问题 | 正式内容 | 来源 |
|---|---|---|
| 是否必填 | 所有 CloudEvent 必须包含 REQUIRED 属性，可以包含 OPTIONAL 与扩展属性；REQUIRED 只有 `id/source/specversion/type`。`subject` 明确列为 OPTIONAL。 | [CE1] |
| OPTIONAL 对接收方意味着什么 | OPTIONAL 对 producer 与 consumer 都是可选支持。Producer 可包含；consumer 可不支持并静默忽略该部分，producer 必须接受被忽略的情况。Intermediary **SHOULD** 转发 OPTIONAL 属性。 | [CE1] |
| 准确语义 | `subject` 描述事件在 producer 所标识的 `source` 上下文中的对象。若 `source` 有内部子结构，仅有 `source` 可能不足以限定具体事件对象。它是 **String**，出现时必须非空。 | [CE1] |
| 主要使用场景 | 在 publish-subscribe 中，把对象标识放在 context metadata 而非只放在 `data`，特别有助于**无法理解 `data` 的通用订阅过滤中间件**。Core 示例以 storage container 为 `source`、以新 blob 名 `mynewfile.jpg` 为 `subject`，可做 `.jpg/.jpeg` 后缀过滤。 | [CE1] |
| Core 的对象示例 | Core 末尾示例把 pull request 上下文放在 `source`，把 `"123"` 放在 `subject`，说明它可以承载来源内的对象编号；该示例仍不是“所有事件都应如此”的规则。 | [CE1] |
| `data` 的定位 | `data` 是 occurrence 的 domain-specific information / payload；Core 不限制其业务信息类型。Core 中 `data` 自身也是 OPTIONAL，项目 profile 可以额外要求它存在。 | [CE1] |
| 何时把信息放 metadata 或 `data` | Primer 的设计目标是保留路由到正确组件及促进处理所需的最小 metadata；不为此目的服务的信息应放在事件 `data`。Primer 的 middleware/framework 场景进一步说明，对象 discriminator 可用于过滤和分派。 | [CE2] |
| JSON 中省略与 `null` | JSON Event Format 允许把 unset 属性编码为 `null`，解码时必须把 `null` 当作 unset/omitted；`subject` 的非 `null` 值必须是符合 Core 约束的非空字符串。完全省略 JSON 成员是最直接的无 `subject` 表示。 | [CE5] |
| `type` 的语义 | `type` 描述 originating occurrence 的事件类型，常用于 routing、observability、policy enforcement；格式由 producer 定义，SHOULD 使用 reverse-DNS 前缀。Primer 把它视为消费者识别事件类型的主要方式。 | [CE1][CE2] |
| 协议路由信息的位置 | Primer 把 protocol-level routing information 列为 non-goal；协议自身负责投递语义，事件不包含特定目的地。 | [CE2] |

**关于“何时使用 / 省略”的边界（事实）：**Core 给出了“通用中间件需要对象过滤”这一明确使用场景，但没有规定“存在业务对象就必须设置 `subject`”，也没有规定另一套强制省略算法。OPTIONAL 本身就允许省略。Primer 是 non-normative，不能把其中的场景说明升级为 MUST。[CE1][CE2]

**推断：**若对象标识只供业务消费者从 `data` 中处理，且通用基础设施只按 `type` 路由，则省略 `subject` 与 Core 的用途划分一致。若通用基础设施需要在不解析每种 `data` schema 的情况下按对象筛选，则 `subject` 的标准语义正好覆盖该需求。

### 2.2 NATS Protocol Binding 是否派生 NATS subject（事实）

NATS Protocol Binding 1.0.2 给出的规则是：[CE4]

- 不进一步定义任何 CloudEvents 属性。
- 只支持 **structured mode**；事件 metadata 与 `data` 一起按 JSON Event Format 序列化为 UTF-8 JSON，成为 NATS message payload。
- 不规定约束 NATS transfer 或 settlement 的规则，只定义 CloudEvents 如何表达为 NATS client messages。
- 示例把 NATS 寻址写成 `Subject: mySubject`，payload 中写 `type: com.example.someevent`；没有给出 CE `subject`，也没有从 `type` 到 `mySubject` 的函数。

因此，对两个候选问题，答案均为**否**：

| 候选推导 | 正式核查结果 |
|---|---|
| 从 CE `subject` 派生 NATS subject | **NATS binding 未规定。**CE `subject` 的 source-scoped 对象语义与 NATS 传输地址是不同层。 |
| 从 CE `type` 派生 NATS subject | **NATS binding 也未规定。**CE `type` 常用于路由，但“常用于路由”不等于存在标准 NATS 地址转换算法。 |

NATS 官方文档把 subject 定义为 publisher 与 subscriber 用来找到彼此的**消息路由地址**；点号形成 token hierarchy，`*` 与 `>` 用于订阅通配。名称由应用设计，文档还给出字符、大小写与保留前缀约束。[N1]

**推断：**DSH 可以规定唯一的 `deriveNatsSubject(type)`，这是把 CE 的事件分类映射为 NATS 地址空间的项目 profile。它合理的原因是双方共享同一个事件目录后可以确定地计算地址；它不是因为 CloudEvents 或 NATS 已经标准化了这一算法。官方 `mySubject` 示例展示的是一个任意 NATS 地址，而不是隐藏的命名规则。[CE4][N1]

## 3. 真实实践：使用与省略都存在

### 3.1 实现方官方示例与证据边界

| 实现与事件 | 官方示例中的做法（事实） | 证据边界与适配含义（推断） |
|---|---|---|
| **Azure Event Grid / Blob Storage** | BlobCreated 示例以 storage account resource path 为 `source`，以 `blobServices/default/containers/{storage-container}/blobs/{new-file}` 为 `subject`，`data` 还含 blob URL。Event Grid 支持按 subject begins/ends with 过滤，例如容器路径前缀和 `.jpg` 后缀。[AZ1][AZ2] | 直接证明 `subject` 可承担**来源内资源/对象路径**，并供通用过滤使用。不能据此推断所有 Azure 事件或所有 CloudEvents 实现都必须填它。 |
| **Google Eventarc / Cloud Storage 与 Pub/Sub** | 同一官方 JSON 文档中，Storage `google.cloud.storage.object.v1.finalized` 使用 `subject: objects/my-file.txt`；Pub/Sub `google.cloud.pubsub.topic.v1.messagePublished` 示例只有 `data/datacontenttype/id/source/specversion/type/time`，**没有 `subject`**。[G1] | 同一平台的两个事件类型就采用不同做法：对象存储事件把对象路径提升到 context，Pub/Sub 消息事件则省略。不能把某个字段的存在概括为所有实现的最佳实践。 |
| **Knative Eventing / PingSource 与 Trigger** | PingSource 官方验证输出标为 `Validation: valid`，包含 `specversion/type/source/id/time/datacontenttype/data`，没有 `subject`。Trigger 文档支持对 CE 属性和扩展过滤，示例可按 `subject` exact 匹配；同时明确新 filters 不支持按 `data` 过滤，且有 broker 适用范围。[K1][K2] | 省略可以产生合法事件；但如果将来需要 Knative 这类通用 Trigger 按对象属性过滤，`subject` 会有实际作用。PingSource 示例不证明所有 Knative source 都省略。 |
| **Dapr Pub/Sub** | Dapr 自动生成的 `orders` topic 示例没有 `subject`，业务标识是 `data.orderId: 1`；同一事件使用 `type: com.dapr.event.sent`，另有独立的 `topic: orders` 属性。文档也允许用户自己的 CloudEvent 带 `subject`，说明默认省略不是所有自定义事件的禁令。[D1] | 这是一个直接反例，证明**业务对象 ID 放 `data` 且省略 `subject`**是真实实现；也证明 topic 可以与 CE `type` 独立，而非由 `type` 通用派生。 |
| **Argo Events / event-source context** | GitHub event-source 文档把 `subject` 写为 event-source 内的 configuration 名称；Context Filter 文档进一步把它固定为 `eventName`，而原始 GitHub body 位于 `data`。[AR1][AR2] | `subject` 也可能用于区分 `source` 内部的配置/子结构，而非业务对象 ID。使用它前应读取具体实现的约定，不能望文生义，更不能当成 NATS subject。 |

### 3.2 CloudEvents 规范项目的非 normative adapter 示例（事实，证据级别不同）

- v1.0.2 AWS S3 adapter 建议把 `s3.object.key` 映射为 CE `subject`，同时保留完整 S3 event 在 `data`。[CE6]
- v1.0.2 GitHub adapter 对多种事件给出对象值，但对 `GitHubAppAuthorizationEvent`、`StarEvent`、`WatchEvent` 明确写 `subject: Omit`。[CE7]
- Primer 明确这些 adapters 是 non-normative，是规范作者对“若原 producer 原生生成 CloudEvents，属性可如何填充”的建议。[CE2]

**边界：**这些适配文档能说明规范作者设想的对象映射与省略方式，**不能**冒充 AWS 或 GitHub 当前原生 CloudEvents 行为的证明。上一小节的实现方文档才是实际实现证据。

### 3.3 实践归纳（推断）

1. **对象型资源事件**（blob/object、PR、check run）常能从 `subject` 获得通用过滤价值，但这不是强制条件。
2. **没有单一对象、对象标识已经只需由业务消费者处理，或实现选择其他上下文模型时**，省略是现实且合规的设计。
3. **`subject` 的值没有跨实现的统一格式。**它可以是路径、编号、名称或配置子项；DSH 若省略它，不会损失一个原本通用、可移植的 NATS 地址，因为本来就没有这种标准映射。

## 4. 一期“禁止 / 省略 `subject`，对象 ID 放 `data`”的评估

### 4.1 优点（推断）

| 优点 | 限定说明 |
|---|---|
| **概念边界最清楚** | DSH 文档中 `subject` 只指 NATS 传输地址；CE 原生事件不再出现同名但不同义的属性。这里的收益是降低设计与实现误读，不是规范要求。 |
| **避免对象标识双写漂移** | 每类事件只在 `data` 保存权威对象标识，不必维护 `subject == data.<id>` 的一致性；也不会出现两处值不同时谁优先的问题。 |
| **适配零个、一个或多个对象** | 各类 `data` schema 可自然表达无对象、单对象或多对象事件，无需强行把复合关系压进单个字符串。 |
| **按类型路由简单且无需读取 `data`** | NATS subject 由 `type` 派生后，broker 的通配订阅与权限仍可在不解释业务 payload 的情况下工作；省略 CE `subject` 不妨碍按类型分派。[N1] |
| **NATS subject 基数受事件类型数约束** | 地址只随事件类型增长，不因每个业务对象产生新 NATS subject；ACL 与订阅模式较容易枚举和审计。 |
| **减少 context 中的重复暴露** | Core 提醒 context attributes 可能被 introspect/log，敏感信息不应放在其中。对象 ID 只放 `data` 可减少一层元数据暴露，但这不等于加密或访问控制。[CE1] |

### 4.2 缺点与成本（推断）

| 缺点 | 实际边界 |
|---|---|
| **失去通用对象级过滤** | 不理解各类 `data` 的中间件不能再用标准 `subject` 做对象路径、前缀或后缀过滤；需要接收方解码 `data`，或由具体平台提供 data filter。Azure 与 Knative 示例说明这种能力确实存在。[AZ2][K2] |
| **一期映射只能按类型族订阅，不能按对象寻址** | 只由 `type` 派生地址时，同一类型的所有对象共享地址。若未来需要 broker 按对象分流的地址结构，那是另一个 NATS profile 变更，不能假装 CE `subject` 会自动提供它。 |
| **外部 subject-filter 互操作需要适配** | 若外部消费者按 `subject` 过滤，DSH 输出需由边界适配器从约定的 `data` 字段生成；若外部输入只把对象标识放在 `subject`，入口也需显式映射到 DSH 的 `data` schema。 |
| **自定义映射本身有学习成本** | 外部生产者不能仅凭 CloudEvents 规范推导 DSH NATS subject；必须获得 DSH profile、固定前缀和 `type` 字符合法规则。 |
| **任意合法 CE `type` 不一定能直接成为 NATS subject** | Core 允许 producer 自定义非空字符串；NATS 地址有 token、空白、通配符和保留前缀规则。DSH 必须收紧原生 `type`，或在外部边界做显式转换。[CE1][N1] |
| **`type` 变化会联动传输地址** | 若以后因不兼容的数据语义而更改 `type`，NATS subject、订阅与权限也要同步迁移。Primer 关于不兼容变化通常更改 `type` 的建议不会自动替 DSH 管理这些运维变更。[CE2] |

### 4.3 “原生省略”不应扩张成“所有路径拒绝或剥离”（事实 + 推断）

| 行为 | 评价 |
|---|---|
| DSH 原生 producer **不生成** `subject` | **建议。**产生的事件仍符合 Core；可同时满足 DSH profile 的更严格要求。 |
| DSH 原生 consumer **不依赖** `subject` | **建议。**Core 本来就允许 consumer 不支持 OPTIONAL 属性。[CE1] |
| DSH 原生事件 validator 要求 `subject` 成员缺席 | **可以，但属于 DSH profile。**带 `subject` 的事件可能是合法 CloudEvent，只是不合法 DSH 原生 profile 事件，两种判定不能混称。 |
| 通用 CloudEvents receiver 见到任何 `subject` 都拒绝 | **不建议。**Core 没有此要求，会降低对外部合法事件的接受能力。 |
| intermediary 默认剥离所有 `subject` | **不建议。**Core 对 OPTIONAL 属性给出 intermediary SHOULD forward；若无损转发是目标，应保留。只有语义明确的外部到 DSH 适配器才可按契约转换。[CE1] |

## 5. 是否建议一期省略

**建议：是，限于“DSH 原生事件不生成、不依赖 CE `subject`”；业务对象 ID 由每个事件类型的 `data` schema 定义；NATS subject 只由 `type` 按项目函数派生。**

建议同时满足以下边界：

1. **直接省略成员**，不写 `subject: ""`，也不写 `subject: null`。`null` 在 JSON Event Format 中虽等同 unset，但省略成员更符合“完全不使用该字段”的项目约定。[CE5]
2. **不发明第二个顶层对象标识字段。**对象 ID 的字段名、是否必需、单值或集合均由各类 `data` schema 决定，不增加一个伪装成通用标准的平行 context 属性。
3. **不依赖 CE `subject` 做路由、过滤或对象识别。**DSH 消费者按 `type` 与相应 `data` schema 处理。
4. **把 DSH profile 校验与通用 CE 校验分开。**前者可要求成员缺席；后者不能把 OPTIONAL 属性存在判为 CloudEvents 不合规。
5. **外部事件只在有明确适配契约时转换。**若需要无损转发，则不默认剥离；若转成 DSH 原生事件，则必须把必要的对象标识显式映射进 `data`，不能静默丢失。

一个符合建议的示例（`bugId` 只是该事件类型的示例字段，不是新的全局约定）：

```text
NATS Subject: dsh.events.aone.bug.created
```

```json
{
  "specversion": "1.0",
  "type": "aone.bug.created",
  "source": "urn:dsh:node:node-01",
  "id": "4f4b1b1f-3f2f-4ef4-a31b-e8f9265f50f0",
  "time": "2026-11-14T10:00:00Z",
  "datacontenttype": "application/json",
  "data": {
    "bugId": "T-1"
  }
}
```

这里的 `dsh.events.` 是**建议的 DSH 固定前缀**，不是 CloudEvents / NATS 标准值；其作用是隔离应用地址空间，并使 `dsh.events.>` 等权限与订阅模式不触碰 NATS 保留前缀。[N1]

## 6. 未来何时需要引入 CE `subject`

### 6.1 触发条件（推断）

满足以下至少一个真实需求时再评估，且优先按事件类型引入，不做无条件全局必填：

1. **通用中间件需要按对象过滤，但不应理解每类 `data`。**例如按某类资源路径前缀或文件后缀订阅，正是 Core 给出的主要使用场景。[CE1]
2. **外部互操作契约明确利用 `subject`。**例如目标订阅依赖对象路径过滤；可先评估在出口适配器生成，而不是立即改变所有 DSH 原生事件。[AZ2][K2]
3. **`source + type` 不足以表达稳定、统一的来源内对象上下文，并且该信息需要跨多个业务消费者以同一方式使用。**引入前应确认它不是只服务于某一个消费者的私有 payload 需求。
4. **对象标识适合暴露在 context metadata 中。**Core 允许 intermediary/consumer introspect 和 log context；若标识敏感，应重新评估可见性，而不是仅为“字段标准化”提升它。[CE1]

**不是充分条件：**仅仅因为 NATS 需要一个 subject，并不构成引入 CE `subject` 的理由。NATS 地址设计可以继续由独立的 DSH transport profile 决定。[CE2][CE4]

### 6.2 引入时的最小规则（推断）

- 按事件类型写清 `subject` 的 source-scoped 语义、格式、是否必需，以及与 `data` 中哪个字段对应。
- 要求非空，并规定两处值必须一致；保留 `data` 为业务 payload 的权威 schema，避免双方各自生成不同格式的对象标识。
- 规定缺失、冲突和未知格式时的校验行为，以及新旧 producer/consumer 的兼容窗口。
- 做隐私与日志可见性审查；不要把敏感标识仅因过滤方便就提升到 context。
- 在事件中新增这个 OPTIONAL 属性不改变 Core 层面的 `specversion: "1.0"`；但“DSH 从禁止到要求”仍是 **DSH profile 的契约变化**，需要独立的迁移与验收，不能靠 `specversion` 自动解决。
- 默认保持 `type → NATS subject` 映射不变。若未来还要按对象改变 NATS 地址，应另立映射版本，不把 CE `subject` 隐式当作传输地址。

## 7. 对现有 DSH profile 的具体修改建议（推断）

以下是供后续决策采纳的条款，**本次调研未修改这些文件**。现有通信 profile 位于 [overview](../overview.md)，已有标准分层证据见 [gateway-standards-map](gateway-standards-map.md)。

### 7.1 在 DSH CloudEvents profile 增加明确的 `subject` 条款

建议直接写为：

> **CE `subject`（一期）：DSH 原生事件 MUST 省略 JSON 成员 `subject`，不得写入空字符串或 `null`；DSH 消费者 MUST NOT 依赖该属性。业务对象标识由每个事件类型的 `data` schema 定义。该约束属于 DSH profile，不改变 CloudEvents Core 中 `subject` 为 OPTIONAL 的事实，也不把外部带 `subject` 的事件判为 CloudEvents 不合规。**

同时在 `data` 条款补充：

> 对涉及业务对象的事件，该事件的 `data` schema 必须明确对象标识的位置、格式与必要性；不设置跨所有事件复用的第二个顶层对象字段。

### 7.2 把“按 type 订阅”写成唯一的 NATS 映射函数

建议采用以下项目规则：

```text
natsSubject = "dsh.events." + type
```

并为原生 `type` 收紧字符集：

```text
type  = token ("." token)*
token = 一个小写 ASCII 非空 token，字符仅为 a-z、0-9、"_"、"-"，
        且首字符为 a-z 或 0-9
```

对应正则可写为：

```text
[a-z0-9][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)*
```

这些限制是**为了让直接映射无歧义而增加的 DSH 约束**，不是 Core 对 `type` 的通用限制。它避免空 token、空白、`*`、`>` 与保留 `$` 前缀进入发布地址。NATS 的 `*` / `>` 只出现在订阅 pattern，不出现在具体事件的 `type` 或发布 subject 中。[N1]

### 7.3 增加一致性与互操作校验

1. Producer 发布前校验 `type` grammar，并计算唯一 NATS subject。
2. Consumer 解码 structured JSON 后校验 `receivedNatsSubject == "dsh.events." + event.type`；不匹配属于 DSH profile 错误，防止信封类型与传输地址相互矛盾。
3. DSH 原生 profile 校验要求 `subject` 成员缺席；通用 CE parser 仍按 Core 处理 OPTIONAL 属性。
4. 为每类事件校验其 `data` schema，而不是只在 envelope 层要求 `data` 存在。
5. 验收至少覆盖：无 `subject` 的合法事件；带字符串、`null`、空字符串的 DSH profile 判定；非法 `type` token；NATS subject 与 `type` 不匹配；外部合法 CE 与 DSH 原生 profile 的不同判定。
6. 文档示例统一写全名 **“NATS subject”**；单独出现的 `subject` 若指 CloudEvents 属性，则写成 **“CE `subject`”**，避免再回到同词异义。

### 7.4 对现有标准映射文档的同步建议

[gateway-standards-map](gateway-standards-map.md) 已正确区分 CE `subject` 的 source-scoped 对象语义与 NATS subject 的传输寻址，也指出 `type`/NATS 映射属于项目 profile。后续若落实一期决策，只需把“候选项目约定”收敛为上述明确规则：**原生事件省略 CE `subject`、对象 ID 在各类型 `data`、NATS subject 由固定函数从 `type` 派生**。不要再加入第三个同义字段，也不要把 DSH 的映射回写成正式标准要求。

## 8. 一手来源 URL 与访问日期

> 以下来源均访问于 **2026-11-14**。规范规则使用 v1.0.2 released tag；`main/master` 与无版本网页表示访问当日内容，后续变化时需重新核查。

### CloudEvents 与 NATS 正式规范 / 官方文档

- **[CE1]** CloudEvents Core 1.0.2（REQUIRED/OPTIONAL、OPTIONAL 对 consumer/intermediary 的意义、`subject`、`data`、`type`、隐私）：https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md
- **[CE2]** CloudEvents Primer 1.0.2（non-normative、metadata 与 `data` 的设计分工、protocol routing non-goal、`type` 版本语义、middleware/framework 场景、adapters 地位）：https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/primer.md
- **[CE3]** CloudEvents JSON Event Format 1.0.2（structured envelope）：https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/formats/json-format.md
- **[CE4]** NATS Protocol Binding for CloudEvents 1.0.2（structured-only、payload、不管 transfer、任意 `mySubject` 示例）：https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/bindings/nats-protocol-binding.md
- **[CE5]** 同 [CE3] 的 §2.2（unset 属性可为 `null`，解码等同 omitted）及 §3：https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/formats/json-format.md#22-type-system-mapping
- **[CE6]** CloudEvents 官方仓库，AWS S3 Adapter 1.0.2（non-normative，`s3.object.key → subject`）：https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/adapters/aws-s3.md
- **[CE7]** CloudEvents 官方仓库，GitHub Adapter 1.0.2（non-normative，部分事件 `subject: Omit`）：https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/adapters/github.md
- **[N1]** NATS 官方，*Subjects*（路由地址、大小写、UTF-8/空白、点分 hierarchy、通配符）及 *Subjects & wildcards*（token 与保留前缀）：https://docs.nats.io/concepts/subjects ；https://docs.nats.io/learn/core-nats/subjects-and-wildcards.md

### 实现方官方示例

- **[AZ1]** Microsoft Learn，*CloudEvents v1.0 schema with Azure Event Grid*（BlobCreated 的 source/subject/data）：https://learn.microsoft.com/en-us/azure/event-grid/cloud-event-schema
- **[AZ2]** Microsoft Learn，*Understand event filtering for Event Grid subscriptions*（subject 前后缀、blob 路径过滤与 data/advanced filtering）：https://learn.microsoft.com/en-us/azure/event-grid/event-filtering
- **[G1]** Google Cloud Eventarc，*CloudEvents - JSON event format*（Cloud Storage 使用 `subject`，Pub/Sub 示例省略）：https://docs.cloud.google.com/eventarc/docs/cloudevents-json
- **[K1]** Knative 官方，*Creating a PingSource object*（合法事件输出无 `subject`）：https://knative.dev/docs/eventing/sources/ping-source/ ；官方文档源：https://raw.githubusercontent.com/knative/docs/main/docs/versioned/eventing/sources/ping-source/README.md
- **[K2]** Knative 官方，*Using Triggers*（CE 属性过滤、`subject` 示例、不支持按 `data` 过滤及 broker 范围）：https://knative.dev/docs/eventing/triggers/ ；官方文档源：https://raw.githubusercontent.com/knative/docs/main/docs/versioned/eventing/triggers/README.md
- **[D1]** Dapr v1.19 官方，*Publishing & subscribing messages with CloudEvents*（默认无 `subject`、`data.orderId`、独立 `topic` 与固定 `type`）：https://docs.dapr.io/developing-applications/building-blocks/pubsub/pubsub-cloudevents/ ；版本化源文件：https://raw.githubusercontent.com/dapr/docs/v1.19/daprdocs/content/en/developing-applications/building-blocks/pubsub/pubsub-cloudevents.md
- **[AR1]** Argo Events 官方，*GitHub event-source → Event Structure*（`subject` 为 event-source 内 configuration 名）：https://argoproj.github.io/argo-events/eventsources/setup/github/
- **[AR2]** Argo Events 官方，*Context Filter*（`subject` 固定为 `eventName`）：https://argoproj.github.io/argo-events/sensors/filters/ctx/
