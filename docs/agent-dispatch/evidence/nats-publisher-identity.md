# NATS 发布者身份与 CloudEvents `source` 防伪证据

> 状态：只读调研证据，不是架构决策，不修改现有实现。
>
> 调研日期与所有外部 URL 访问日期：**2026-11-16**。
>
> 范围：一期 NATS Core/JetStream、NKey、subject permissions、远程 TLS，以及 CloudEvents `source` 为 `urn:dsh:center` 或 `urn:dsh:node:<nodeId>` 时的发布者身份绑定。业务插件可自定义 `type` 与 NATS subject；不讨论 Worker、graph 或任务语义。
>
> 方法：**官方事实**只采用 NATS 官方文档/固定 commit 源码、CloudEvents v1.0.2 正式规范和 IETF RFC；**项目推断**是基于这些事实的最小适配方案，不冒充 NATS 官方推荐。NATS 网页文档访问时为 2.15，源码固定到 `nats-server` commit `79bdf7c096f67081631850b21effcd86f9859d4e`。

## 1. 直接结论（项目推断）

1. **普通 Core NATS 与 JetStream 消息不会自动把已认证的 user、account、NKey 或其他 principal 传给消费者。**`PubAck` 只确认 stream 存储；普通 headers 是消息元数据；consumer `metadata` 是 consumer 配置。它们都不能证明 CloudEvents `source`。**“连接已认证”不等于“事件 `source` 已认证”。**[N1][N2][N3][N4][N5]
2. **不能阻止恶意插件把任意字符串写进 `source`，可以阻止伪造身份的事件被中心受理。**一期最小方案不是逐事件签名，而是：**每个发布 principal 独立凭据 + principal→允许 `source`/subject 的项目目录 + NATS publish allowlist + 中心按实际接收 subject 的唯一归属校验 `source`**。[N6][N8]
3. **subject namespace 必须能唯一决定允许的 `source`。**推荐按节点/插件划分不重叠前缀；若保留任意自定义地址，则每个精确 subject 或前缀也必须在目录中唯一归属一个 `source`。多个节点在同一 stream/account 中共同可写同一个 type-only subject 时，持久消息后无法再从该 subject 判断节点，单纯“连接登记 + principal 目录”补不上这个缺口。[N1][N3][N6]
4. **NKey、NATS JWT、auth callout、mTLS 都能帮助服务器在连接时确定身份并施加 subject 权限，但不会自动逐条签名应用消息。**连接 advisory 可用于在线登记/审计，却没有与普通持久消息自动关联的 client ID；不能据此给 replay 归因。[N8][N10][N11][N12][N13]
5. **一期在受信 NATS/account、权限配置正确、身份 subject 不被改写且接收方强制校验的边界内，不必自研事件签名。**需要跨不受信中继验证原发布者、独立验证持久证据，或无法保持 subject 唯一归属时，才增加端到端事件签名或可信入口附加的身份证据；签名本身仍不解决重放。[N3][N12][CE2][TLS1]

## 2. 官方事实

### 2.1 普通消息、PubAck、headers 与 consumer metadata

| 核查对象 | 官方事实 | 能否证明发布者 principal / CE `source` |
|---|---|---|
| Core `PUB` / `HPUB` | 发布帧包含 subject、可选 reply-to、payload；`HPUB` 另含 headers。认证信息位于先前的 `CONNECT`，如 `user`、`jwt`、`nkey`、`sig`。[N1] | **不能。**认证字段不属于每条发布帧。 |
| Core `MSG` / `HMSG` | 投递帧字段为实际 subject、订阅 ID `sid`、可选 reply-to、字节数、payload；`HMSG` 另含 headers。`sid` 是订阅标识，reply-to 是回复地址，均不是已认证发布者。[N1] | **不能。**没有 user、account、NKey、JWT 或 client ID 字段。 |
| 普通 headers | NATS headers 是随消息传递的 key/value；示例由发布者用 `Set/Add` 或 CLI `-H` 附加。`Nats-` 前缀保留给系统 headers。[N2] | **不能自动证明。**应用写入的“发送者”只是自报元数据；官方没有在这里定义自动认证的 publisher header。 |
| JetStream 投递 headers | 官方列表包括 stream、sequence、存储时间、原始 subject、consumer sequence 等。tracing 专用的 `Nats-Trace-Origin-Account` 不是 user/NKey，也不是普通业务消息的通用 principal 证明。[N5] | **不能。**stream/sequence/timestamp/subject 证明存储与寻址事实，不证明 CE `source`。 |
| `PubAck` | 官方定义为 stream 已存储消息的确认，不是消费者已接收/处理的确认。schema 字段为 stream、sequence、domain、duplicate，以及特定批处理/计数字段。[N3] | **不能。**没有发布者身份，也不检查 payload 中的 `source`。 |
| JetStream 存储消息 | 固定源码的 `StoredMsg` 只有 `subject`、`seq`、`hdrs`、`data`、`time`。[N3] | **不能。**持久化后没有原连接 principal 可供恢复。 |
| consumer info / metadata | `ConsumerInfo` 记录 consumer 的进度、配置和状态；`ConsumerConfig.Metadata` 注释为“additional metadata for the Consumer”。[N4] | **不能。**它描述 consumer，不是每条消息的 publisher metadata。 |
| 连接 advisory | 系统账户另有 `$SYS.ACCOUNT.{account}.CONNECT/DISCONNECT` 事件；`ClientInfo` 可含连接 ID、account、user、JWT issuer 等。[N13] | **只能支持在线登记/审计。**普通 `MSG/HMSG` 与 `StoredMsg` 不携带该连接 ID，不能自动关联到后续消息或 replay。 |

因此，在所核查的正式协议和 schema 中，**没有“普通应用消息自动附带已认证 principal”的隐藏通道**。连接 advisory、message tracing 是独立诊断/系统能力，不应被当作 JetStream 业务事件的身份字段。

### 2.2 CloudEvents `source` 的安全语义

- CloudEvents Core 将 `source` 定义为事件发生上下文，具体 URI 的语法和语义由 producer 定义；producer 必须保证不同事件的 `source + id` 唯一。该规范没有规定 `source` 必须由传输层认证。[CE1]
- CloudEvents NATS Protocol Binding v1.0.2 使用 structured JSON，把事件属性和数据一起放入 NATS payload；其 Security 节明确说该绑定**不引入新的 NATS 安全特性，也不强制特定既有安全特性**。[CE2]

**事实边界：**NATS 把该 structured payload 作为应用 bytes 传递；CloudEvents 规范没有赋予其中的 `source` 自动防伪能力。项目可以在 NATS 之上增加校验，但不能宣称这是 binding 已提供的保证。[N1][CE2]

### 2.3 官方认证与授权能绑定到什么

| 官方能力 | 官方事实 | 对身份绑定的实际边界 |
|---|---|---|
| subject publish permissions | NATS 授权以 publish/subscribe subject 集合表达；`allow` 之外全部拒绝，deny 优先。越权 publish 会被拒绝并丢弃。空权限块或无 allow/deny 不是最小权限，空 allow list 也不是全拒绝。[N6] | **可以直接限制某 principal 只能发布获准地址。**权限判断对象是 subject，不是 structured payload 内的 CE `source`。 |
| account | account 是隔离的 subject namespace；跨 account 流量需显式 export/import。user 属于一个 account，权限在该 account 内生效。[N7] | 可提供租户/节点间的结构隔离，但 account 名称仍不会自动成为普通消息中的可信 publisher 字段。 |
| 静态 NKey user | server 保存 public NKey；client 用私有 seed 对 server 每连接 nonce 签名，seed 不跨线。NKey user 可与其他 config user 一样配置 subject 权限。[N8][N6] | 可把 public NKey 对应的连接身份绑定到 publish allowlist；签名对象是连接 nonce，不是每条事件。 |
| NATS user JWT / operator mode | user JWT 经签名链识别 user、account 与权限；scoped signing key 可给所签用户固定权限。普通用户仍以 NKey seed 签连接 nonce。[N10] | 适合动态签发、轮换和按角色授权；JWT/auth 签名不覆盖后续每条 NATS payload。 |
| auth callout | server 把连接凭据与连接信息交给外部 auth service；后者返回签名的 user JWT，可把 client 放入指定 account。ADR-26 要求响应 user JWT 的 subject 对应请求中的 public user NKey。[N11] | 可把外部目录/OIDC/LDAP/custom auth 的判定映射为 NATS user/account/权限；仍只发生在连接认证路径，不验证事件字段。 |
| TLS / mTLS | 普通 server-side TLS 认证服务端并加密链路；`verify_and_map` 要求客户端证书并把证书身份映射为 NATS user，再应用该 user 的 subject 权限。[N12] | mTLS 可替代/补充连接身份来源；它不自动增加 CE `source` 校验或持久消息签名。 |

**归纳事实：**按节点或插件设置不重叠的 subject namespace，并给对应 NKey/JWT user 配置 publish allowlist，是 NATS 官方原语直接支持的最小权限做法。**归纳边界：**它证明“该连接被允许向此 subject 发布”，不单独证明“payload 里的 `source` 与该身份一致”。[N6][N8][N10]

### 2.4 mTLS/JWT/NKey 是否自动签名消息，以及多跳/replay 的边界

- NKey 文档只描述 client 对 server-issued nonce 的签名；NATS JWT 的签名验证发生在 user/account 信任链和连接认证中。[N8][N10]
- 以 TLS 1.3 为例，`CertificateVerify` 的数字签名覆盖握手 transcript，用来证明端点持有证书私钥；record protocol 对当前连接的记录提供保护。它不是对后续独立应用事件的持久签名。[TLS1]
- NATS 官方 TLS 文档明确指出：当前 TLS 连接终止于所连接的 server，后续 routed copies 位于该 TLS 连接之外，依赖各 onward link 自己的 TLS 配置。[N12]
- JetStream `StoredMsg` 不保存原连接 principal；因此持久重放只能重放 subject、headers、payload、存储时间等已存事实，不能重放“当时那条已认证连接”。[N3]

**事实导出的区别：**连接认证是临时且逐跳的；事件签名若存在，才可能成为随事件复制、独立验证的证据。本次核查的 NATS/CloudEvents 官方能力没有自动创建后一种证据。[N3][CE2][TLS1]

## 3. 一期必要的项目规则（项目推断）

### 3.1 安全目标与信任前提

目标应写成：**插件仍可构造任意 payload，但中心不得以伪造的 `source` 受理事件。**

最小方案依赖以下前提，而非依赖插件自觉：

1. NATS server/account 与中心目录受信，stream 只经这些受控边界写入。
2. 每个 principal 的凭据不与其他信任主体共享；不存在可绕过 allowlist 的宽泛用户。
3. 中心实际看到的 NATS subject 与权限校验时的身份归属一致；一期不允许 mapping、stream transform、republish 或跨 account 适配改写身份段而不重新校验。NATS 官方 subject mapping 确实能重写 subject，所以这是必须明示的边界。[N14]
4. 中心在首次投递与每次持久 replay 都执行同一 `subject ↔ source` 校验。

满足这些前提时，中心使用的是“**受信 NATS 已执行授权 + 地址唯一归属**”的授权证据，不宣称获得密码学不可否认性。

### 3.2 只维护一份绑定目录

最少逻辑记录为：

```text
认证 principal → 持久逻辑身份 → 允许的 CloudEvents source → 允许的 NATS publish subject/prefix
```

- 一期静态 NKey 可以 public user NKey 为 principal；未来使用 JWT/mTLS/callout 时，以相应 NATS user/account/公钥或证书映射结果替换认证标识，持久 `nodeId` 不变。
- `source` 使用项目已有的 canonical 形式：中心为 `urn:dsh:center`，节点为 `urn:dsh:node:<nodeId>`。NATS 不知道这些 URN，映射必须由项目定义。
- 同一份目录应生成或校验 NATS 权限配置，并供中心接收校验使用，避免“server allowlist 允许 A、中心目录却认定 B”的双份配置漂移。
- 凭据轮换只更新 principal 绑定，不改变持久 `nodeId` 或既有 `source`。

### 3.3 地址必须唯一归属一个 source

推荐的项目 subject 形状示例（**不是 NATS/CloudEvents 标准规定的格式**）：

```text
dsh.events.node.<nodeId>.plugin.<pluginId>.<插件获准的自定义后缀>
dsh.events.center.<中心获准的自定义后缀>
```

安全不变量是：

```text
一个可接收的精确 subject（或受控前缀）只能映射到一个允许的 source；
该 principal 的 publish allowlist 只能覆盖映射给它的地址；
事件 source 必须与该地址登记的 source 完全一致。
```

业务插件仍可在自己的前缀后自定义 `type`/subject 后缀；需要限制类型时，目录再保存相应精确地址或后缀 allowlist。若现有自定义地址不能增加身份段，也可以为每个精确 subject 登记唯一 `source`，但配置会更多。**若同一个 stream/account 中的同一个 subject 可由多个 `source` 的 principal 发布，则该地址不具备接收时归因所需的信息，不能靠 consumer metadata 或 PubAck 补救。**若按 account/stream 区分而不改 subject，中心必须把相应接收拓扑纳入唯一归属映射；合并到同一 stream + subject 后仍会失去该区分。

### 3.4 发布侧与凭据粒度

- 宿主发布入口根据持久 `nodeId` 和绑定目录生成 `source` 与身份前缀；插件只提交获准的 `type`、数据与自定义后缀，不把任意完整 `source` 当作可信输入。
- 配合第 3.5 节接收校验时，**每节点一个 NKey**足以防止跨节点/冒充中心的 `source` 被受理，前提是该节点内所有插件本来就共用 `urn:dsh:node:<nodeId>`。
- 若要求 NATS 直接隔离同节点不同插件的 subject，必须**每插件（或每插件信任组）独立凭据并缩窄 allowlist**。若多个插件共享一个 NKey，NATS 无法区分它们。
- 宿主 SDK 限制只是便利和防误用；插件若能取得 raw NATS connection/seed，就能绕过 SDK。真正的安全边界仍是 server 权限与中心接收校验。

### 3.5 中心接收侧必须执行的规则

每次消费或 replay：

1. 读取消息的实际 NATS subject，查目录得到唯一允许的 `source`；未知、重叠或无唯一归属的地址拒绝。
2. 解码 CloudEvent，要求 `event.source` 与该值精确相等；`urn:dsh:center` 只能出现在中心地址，节点地址只能出现对应节点的 URN。
3. 校验 `type`、自定义 subject 后缀及该事件类型的项目 schema；不匹配则不作为合法事件受理。
4. 不把自报 header、`Nats-Msg-Id`、stream sequence、consumer metadata 或既往 `PubAck` 当作身份替代物。
5. replay 时重复上述校验，而不是信任首次消费时的连接登记。撤销后旧持久事件是否仍可受理，是项目另需规定的生命周期策略，NATS 不会替项目决定。

**连接登记的位置：**可以记录 connect/disconnect advisory 做在线观测和审计，也可用 auth callout 在连接时查询目录并下发权限；但登记本身没有消息关联键，不能取代上述地址与接收校验。[N11][N13]

## 4. 具体允许与伪造场景（项目推断）

以下 `U_NODE_A`、`U_CENTER` 只是 public user NKey 的占位名，不是真实密钥。假设 stream 捕获 `dsh.events.>`，且目录同时用于 NATS 权限与中心校验。

| principal | 允许的 `source` | publish allowlist |
|---|---|---|
| `U_NODE_A`（node-a 上 weather 插件） | `urn:dsh:node:node-a` | `dsh.events.node.node-a.plugin.weather.>` |
| `U_CENTER` | `urn:dsh:center` | `dsh.events.center.>` |

实际发布 JetStream request/reply 时还需按客户端 inbox 前缀授予 subscribe 权限；这不扩大业务事件发布面。[N6]

### 4.1 允许：自定义 type/subject，但身份一致

```text
principal:     U_NODE_A
NATS subject:  dsh.events.node.node-a.plugin.weather.temperature
```

```json
{
  "specversion": "1.0",
  "id": "evt-20261116-001",
  "source": "urn:dsh:node:node-a",
  "type": "com.example.weather.temperature",
  "datacontenttype": "application/json",
  "data": { "value": 21 }
}
```

NATS allowlist 接受该 subject；中心由 subject 前缀得到唯一 `source=urn:dsh:node:node-a`，与 payload 精确一致，且自定义后缀获准，因此受理。`type` 不必由 NATS 认证。

### 4.2 伪造地址：NATS 在入口拒绝

同一 `U_NODE_A` 改为发布：

```text
NATS subject:  dsh.events.node.node-b.plugin.weather.temperature
source:        urn:dsh:node:node-b
```

该 subject 不在 `U_NODE_A` 的 publish allowlist 中，server 拒绝并丢弃；它不应进入中心事件流。[N6]

### 4.3 伪造 payload：NATS 可存储，中心必须拒绝

同一 `U_NODE_A` 仍使用自己获准的地址：

```text
NATS subject:  dsh.events.node.node-a.plugin.weather.temperature
source:        urn:dsh:node:node-b        # 或 urn:dsh:center
```

NATS subject 权限不解析 CloudEvents payload，所以这条消息可以被 stream 存储并返回 `PubAck`。**这不表示伪造成功：**中心发现实际 subject 只允许 `urn:dsh:node:node-a`，与自报 `source` 不符，必须拒绝受理。这个场景同时说明为什么“NKey 已认证 + 有 PubAck”仍不足以证明事件 `source`。[N3][N6][CE2]

## 5. 是否需要逐事件签名（项目推断）

| 边界 | 最小判断 |
|---|---|
| 一期单一受信 NATS/account；唯一地址归属；权限与目录一致；身份 subject 不改写；中心每次校验 | **不需要逐事件签名。**NKey + subject allowlist + 接收校验已覆盖跨节点/中心 source 伪造。 |
| 多跳但每一跳均受信，并且每跳保持或重新验证同一身份不变量 | 不强制签名；但不能声称消息携带了“原连接 principal”，保证来自整个受控路径及项目规则。 |
| 存在不受信中继/外部导入、无法保持地址唯一归属，或需要离线独立验证原发布者及持久审计证据 | 需要端到端事件签名，或由受信入口在持久化前附加并保护身份证据；普通 TLS/NKey/JWT 不会自动提供。 |
| 防止有效旧事件被再次投入 | 签名不足。仍需 `source + id`、中心持久去重/重放窗口与时间策略；CloudEvents 的重复语义不是恶意 replay 防护。[CE1] |

若未来采用事件签名，应另行选择正式签名格式并定义：被签字节与 canonicalization、覆盖的 `source/id/type/subject/data` 等字段、算法与 key ID、验证目录、轮换/撤销和重放策略。本文不发明新的签名协议或 header 名称。

## 6. 推荐落地顺序与未来多用户演进（项目推断）

### 一期最小集合

1. 保留现有 NKey + 远程 TLS；中心与节点不共享 seed。按节点划源，只有需要同节点插件间隔离时才细化为每插件凭据。[N8][N12]
2. 建立上述唯一绑定目录，以持久 `nodeId` 为逻辑身份，以 public NKey 为可轮换 principal。
3. 给每 principal 配置明确 publish allowlist；不要使用 `publish: allow: [">"]`，也不要把空 allow list 当成全拒绝。按实际客户端路径补齐 inbox 权限。[N6]
4. 让身份进入受控 subject namespace，或等价地保证每个自定义地址唯一归属一个 `source`；不要保留“多个节点可写同一地址、中心再猜 source”的设计。
5. 宿主生成 `source`，中心按实际 subject 反查并逐条校验；连接登记只作辅助。一期无需新增 auth callout、账户拆分或逐事件签名。

### 未来触发式演进

- **用户动态增长、团队自行签发：**采用 NATS operator mode、user JWT 与 scoped signing key，把同一目录中的 source/subject 权限签发下去；持久 `nodeId` 与事件规则不变。[N10]
- **已有外部身份系统/OIDC/LDAP：**用 auth callout 在连接时映射外部身份到 NATS user/account/权限。它替代的是连接登记与签发方式，不替代中心 `subject ↔ source` 校验。[N11]
- **真实多租户隔离：**按租户/用户边界评估独立 account，并显式设计 export/import、JetStream 拓扑与地址归属；account 隔离本身仍不会给消息附加可信 CE `source`。[N7]
- **不受信多跳或独立持久证明：**再引入逐事件端到端签名与密钥生命周期；不要为想象中的未来需求在一期预付这套成本。

## 7. 一手来源与访问日期

> 以下 URL 均访问于 **2026-11-16**。NATS 网页为访问时的 2.15 文档；`nats-server` 与 ADR 源码使用固定 commit，避免后续工作树变化改变证据。

### NATS 协议、消息与 JetStream

- **[N1]** NATS, *Client Protocol*（`CONNECT` 认证字段、`PUB/HPUB`、`MSG/HMSG` 完整字段）：https://docs.nats.io/reference/protocols/client.md （访问日期：2026-11-16）
- **[N2]** NATS, *Message headers*（发布者附加 headers、读取方式、`Nats-` 保留前缀）：https://docs.nats.io/learn/core-nats/headers.md （访问日期：2026-11-16）
- **[N3]** NATS, *Publishing* 与 *Publish Acknowledgement*（PubAck 仅证明 stream 存储）：https://docs.nats.io/learn/jetstream/publishing.md ；https://docs.nats.io/reference/jetstream/api/stream/pub-ack.md ；固定源码 `PubAck`：https://github.com/nats-io/nats-server/blob/79bdf7c096f67081631850b21effcd86f9859d4e/server/stream.go#L260-L267 ；固定源码 `StoredMsg`：https://github.com/nats-io/nats-server/blob/79bdf7c096f67081631850b21effcd86f9859d4e/server/stream.go#L8615-L8621 （访问日期：2026-11-16）
- **[N4]** NATS, *Consumer Info* 与固定源码 `ConsumerInfo` / `ConsumerConfig.Metadata`：https://docs.nats.io/reference/jetstream/api/consumer/info.md ；https://github.com/nats-io/nats-server/blob/79bdf7c096f67081631850b21effcd86f9859d4e/server/consumer.go#L56-L75 ；https://github.com/nats-io/nats-server/blob/79bdf7c096f67081631850b21effcd86f9859d4e/server/consumer.go#L89-L135 （访问日期：2026-11-16）
- **[N5]** NATS, *JetStream API Headers*（发布、投递、stream/consumer、tracing headers）：https://docs.nats.io/reference/jetstream/api/headers.md （访问日期：2026-11-16）

### NATS 认证、授权与连接边界

- **[N6]** NATS, *Authorization*（subject allow/deny、越权 publish 丢弃、空权限与 inbox 边界）：https://docs.nats.io/learn/security/authorization.md （访问日期：2026-11-16）
- **[N7]** NATS, *Accounts and multitenancy*（隔离 subject namespace、user/account、显式 export/import）：https://docs.nats.io/learn/security/accounts-and-multitenancy.md （访问日期：2026-11-16）
- **[N8]** NATS, *Authentication basics*（连接认证、public NKey、seed 签 server nonce）：https://docs.nats.io/learn/security/authentication-basics.md （访问日期：2026-11-16）
- **[N10]** NATS, *Decentralized authentication*（user/account JWT 签名链、scoped signing key、连接 nonce、权限与撤销）：https://docs.nats.io/learn/security/decentralized-auth.md （访问日期：2026-11-16）
- **[N11]** NATS, *Auth callout* 与固定 ADR-26（外部认证、签名 user JWT、account/user NKey 绑定）：https://docs.nats.io/learn/security/auth-callout.md ；https://github.com/nats-io/nats-architecture-and-design/blob/fac1b7e7ff96498afbb768b11d3d313f10c14ff3/adr/ADR-26.md#L33-L54 （访问日期：2026-11-16）
- **[N12]** NATS, *Encryption & TLS*（server TLS、`verify_and_map`、当前连接与 onward links、静态存储边界）：https://docs.nats.io/learn/security/encryption.md （访问日期：2026-11-16）
- **[N13]** NATS, *Client Connect / Disconnect* 与固定源码 `ClientInfo`（独立连接 advisory 及字段）：https://docs.nats.io/reference/system/advisory/client-connect.md ；https://docs.nats.io/reference/system/advisory/client-disconnect.md ；https://github.com/nats-io/nats-server/blob/79bdf7c096f67081631850b21effcd86f9859d4e/server/events.go#L309-L333 （访问日期：2026-11-16）
- **[N14]** NATS, *Subject mapping*（account 级 subject 重写、wildcard 来自发布 subject）：https://docs.nats.io/learn/core-nats/subject-mapping.md （访问日期：2026-11-16）

### 正式规范

- **[CE1]** CloudEvents, *Core Specification v1.0.2*（`source` 语义、producer 定义、`source + id` 唯一性）：https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md#source （访问日期：2026-11-16）
- **[CE2]** CloudEvents, *NATS Protocol Binding v1.0.2*（structured payload；§1.5 不新增或强制安全特性）：https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/bindings/nats-protocol-binding.md （访问日期：2026-11-16）
- **[TLS1]** IETF, *RFC 8446 — The Transport Layer Security (TLS) Protocol Version 1.3*，§4.4.3 `CertificateVerify` 与 §5 Record Protocol：https://www.rfc-editor.org/rfc/rfc8446.html#section-4.4.3 ；https://www.rfc-editor.org/rfc/rfc8446.html#section-5 （访问日期：2026-11-16）
