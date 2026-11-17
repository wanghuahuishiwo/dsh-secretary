# 插件事件 `dataschema` 的契约分发取证

> 状态：只读源码调研与一期建议，不表示现有中心已经实现动态 schema 获取。
>
> 本地源码与仓库访问日期：**2026-11-16**。外部官方 URL 的本轮检索日期同为 **2026-11-16**；正文重新抓取受本机代理不可用影响，详见 §8。
>
> 范围：只讨论 CloudEvents `dataschema` 的放置与静态 schema 分发，不引入新的线上术语，不展开其他执行语义。下文严格区分**事实**与**推断/建议**。

## 1. 直接结论

1. **【规范事实】放置位置**：`dataschema` 是 CloudEvents context attribute；在一期 structured JSON 中，它与 `type`、`data` 等位于同一个顶层 JSON object，值是指向 **`data` 所遵循 schema** 的 URI。它不是 `data` 内字段、NATS subject/header，也不是整个 CloudEvents envelope 的 schema。CloudEvents 不规定 schema 必须是 JSON Schema；选择 JSON Schema 是本项目约束。[CE1][CE2]
2. **【研究建议】一期选 A**：每个插件作者为自己的事件提供**版本化、不可变的绝对 HTTPS URL**；中心首次遇到 URL 时由 **Host/中心进程**发起普通 outbound HTTPS 读取，解析并校验后按完整 URL 持久缓存 schema 字节及内容摘要。后续事件和中心重启后均复用缓存。新插件不需要安装到中心，中心不导入/执行其代码，不因新事件类型重启，也不需要修改 DSH 或公共包。
3. **【事实】DSH 没有现成的端到端 `dataschema` 分发器**：本机 DSH manifest 没有事件 schema 声明入口；源码中没有 `dataschema` 实现；Plugin Marketplace 的公开读取面是索引、详情 Markdown 与图片，不是通用 JSON Schema API。现有要求见本仓库 [overview.md:66-70](/Users/wanghuahui/workspace/dsh-secretary/docs/agent-dispatch/overview.md#L66-L70)，但 `packages/` 中未找到对应实现，不能把设计要求当成已交付能力。
4. **【研究建议】B 不作为一期最小路径**：NATS request/reply 能承载在线读取，但 URN 到应答者的绑定、响应格式、超时/无应答和中心缓存都要补；冷缓存时插件离线就无法取 schema。
5. **【研究建议】C 是条件性复用，不是现成替代**：公共 npm 的版本化文件 URL 可以直接作为 A 的 URL，从而复用包发布；私有 registry、本地 Client 资源路由和 Marketplace 详情缓存均不能原样提供通用的闭源私有包 schema 分发。

## 2. 取证对象与版本边界

- 首选路径 `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/` 本轮不作为可读目录存在；因此按任务要求使用已确认真实存在的源码仓 `/Users/wanghuahui/workspace/deepseek-harness`。
- 该源码仓根版本为 `0.2.2-rc.1`，读取时 commit 为 `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`；证据见 [package.json:1-9](/Users/wanghuahui/workspace/deepseek-harness/package.json#L1-L9)。该快照不是对上述 app.asar 内部版本的断言。
- 本仓库插件证据来自 `dsh-secretary` 当前 worktree。只读检索和阅读之外，仅新增本证据文件；未安装插件、未启动宿主、未运行构建、未操作 Issue、未提交。

## 3. 现有机制事实

### 3.1 Manifest 与包内容：允许额外文件，但没有事件 schema 声明入口

- DSH installable bundle 是带 `dsh.bundle.patch` 的 npm 包；profile 是另一份带 `dsh.profile.bundles` 的 manifest。官方定义见 [publish.zh.md:9-16](/Users/wanghuahui/workspace/deepseek-harness/docs/user/develop/basic/publish.zh.md#L9-L16)，最小 manifest 与 `files` 示例见 [publish.zh.md:33-43](/Users/wanghuahui/workspace/deepseek-harness/docs/user/develop/basic/publish.zh.md#L33-L43)。
- `package.json.dsh` 的公开类型只列出 `manifestVersion`、`bundle`、`profile`、`client`；bundle 声明 patch，Client 声明浏览器模块加载信息，均没有 `dataschema`、event schemas 或通用静态 metadata 入口。见 [package-manifest/src/types.ts:31-41](/Users/wanghuahui/workspace/deepseek-harness/packages/util/package-manifest/src/types.ts#L31-L41)、[同文件:70-100](/Users/wanghuahui/workspace/deepseek-harness/packages/util/package-manifest/src/types.ts#L70-L100)。
- 插件导出的 `Config` 是 **插件配置** 的 Standard Schema/Schemastery schema，在插件加载时校验配置；它不是事件 `data` 的分发格式或远程获取入口。见 [config.zh.md:7-45](/Users/wanghuahui/workspace/deepseek-harness/docs/user/develop/basic/config.zh.md#L7-L45)。
- **额外文件可以随包发布，已有本仓库实例**：Secretary bundle 的 `files` 包含 `assets`，见 [bundle package.json:16-20](/Users/wanghuahui/workspace/dsh-secretary/packages/bundle/secretary/package.json#L16-L20)；Host 代码按 `import.meta.url` 读取包内 Markdown，见 [bundle src/index.ts:58-69](/Users/wanghuahui/workspace/dsh-secretary/packages/bundle/secretary/src/index.ts#L58-L69) 和 [同文件:105-110](/Users/wanghuahui/workspace/dsh-secretary/packages/bundle/secretary/src/index.ts#L105-L110)。因此 `schemas/`、`examples/` 作为 npm 包文件没有 DSH 白名单障碍；障碍在于**中心如何独立读取**，不在于能否打包。
- 官方支持以预构建 npm 包或 `pnpm pack` tarball 分发，见 [publish.zh.md:183-186](/Users/wanghuahui/workspace/deepseek-harness/docs/user/develop/basic/publish.zh.md#L183-L186)。这为 C 提供包载体，但不自动提供中心读取 API。

### 3.2 安装与 Host/浏览器边界：本地包可读不等于中心可远程读取

- `dsh plugin --profile <name> add ...` 把依赖安装到**指定 profile**，并把 bundle 加入该 profile 的有序 `dsh.profile.bundles`；证据见 [publish.zh.md:77-103](/Users/wanghuahui/workspace/deepseek-harness/docs/user/develop/basic/publish.zh.md#L77-L103)。因此节点 profile 中的包不会仅因同一台机器就自动成为中心 profile 的可解析依赖。
- Plugin Manager 可以在不执行包 JS 的情况下读取 manifest，例如 `bundleManifest()` 只解析包目录和 `package.json`，见 [plugin-manager/src/operations.ts:69-79](/Users/wanghuahui/workspace/deepseek-harness/packages/boot/plugin-manager/src/operations.ts#L69-L79)。这证明“读取元数据不必执行代码”，但读取对象仍是当前安装/profile 的包，不是任意远程插件包。
- Host 的 `clientModules` 只扫描**已启用 Loader 条目**，向浏览器提供 Client bundle；浏览器惰性加载。见 [client-modules README:10-12](/Users/wanghuahui/workspace/deepseek-harness/packages/client/modules/README.zh.md#L10-L12)。其 `resolveMeta()` 从 Loader row 定位并读取 manifest，且要求 `dsh.client.platform === 'web'` 与 `./client` 导出，见 [client-modules/src/index.ts:891-917](/Users/wanghuahui/workspace/deepseek-harness/packages/client/modules/src/index.ts#L891-L917)。
- 同一 `/plugins` 路由确有包静态资源机制，但只接受活动 row；不存在活动 record 即 404，且由 `packageAssetMediaType()` 拒绝不支持的扩展，见 [client-modules/src/index.ts:1214-1258](/Users/wanghuahui/workspace/deepseek-harness/packages/client/modules/src/index.ts#L1214-L1258)。支持类型只有 `.svg/.png/.webp/.jpg/.jpeg`，没有 `.json`，见 [client-modules/src/assets.ts:16-29](/Users/wanghuahui/workspace/deepseek-harness/packages/client/modules/src/assets.ts#L16-L29)。
- 所以该路由**不是**中心获取任意插件 JSON Schema 的现有通道：它面向浏览器 Client 包、要求活动 Loader row、仅提供图片。它也没有消除中心与节点/profile 的边界。
- Typert Remote 是业务方用 `@Remote` 显式开放的 **Client→Host 方法**；HTTP 对应 `POST /api/<namespace>/<method>`，不是中心向外抓取任意 URI 的通用代理。见 [api-gateway.zh.md:9-13](/Users/wanghuahui/workspace/deepseek-harness/docs/api-gateway.zh.md#L9-L13)、[同文件:126-132](/Users/wanghuahui/workspace/deepseek-harness/docs/api-gateway.zh.md#L126-L132)。Connection 同样明确定位为浏览器与 Host 之间的 RPC/Fetch 桥，见 [client-connection README:28-34](/Users/wanghuahui/workspace/deepseek-harness/packages/client/connection/README.zh.md#L28-L34)。一期 HTTPS 抓取应发生在中心 Host 进程，不能借浏览器 UI 或把 Remote 当成 NATS/公网资源代理。

### 3.3 Marketplace、registry 与缓存：有静态文件零件，没有完整 schema 分发面

- Plugin Marketplace 是可选组合，随附 profile 默认不启用，默认索引为空；见 [plugin-market README:24-42](/Users/wanghuahui/workspace/deepseek-harness/packages/boot/plugin-market/README.zh.md#L24-L42)。
- 它确实有 Host 侧运行时 HTTP 获取与缓存：索引 URL 可在线更新而不重挂服务；成功索引在内存 `Map` 中按 TTL 缓存；详情与 Git partial clone 也有缓存。见 [plugin-market/src/index.ts:126-153](/Users/wanghuahui/workspace/deepseek-harness/packages/boot/plugin-market/src/index.ts#L126-L153)、[同文件:192-215](/Users/wanghuahui/workspace/deepseek-harness/packages/boot/plugin-market/src/index.ts#L192-L215)、[同文件:363-421](/Users/wanghuahui/workspace/deepseek-harness/packages/boot/plugin-market/src/index.ts#L363-L421)，以及磁盘仓库缓存说明 [plugin-market README:91-101](/Users/wanghuahui/workspace/deepseek-harness/packages/boot/plugin-market/README.zh.md#L91-L101)。
- 但其 Remote 面只有 `listIndexes`、`setIndexes`、`search`、`readEntryDetail`，见 [plugin-market/src/index.ts:175-229](/Users/wanghuahui/workspace/deepseek-harness/packages/boot/plugin-market/src/index.ts#L175-L229) 和 [同文件:268-314](/Users/wanghuahui/workspace/deepseek-harness/packages/boot/plugin-market/src/index.ts#L268-L314)。详情选择只读取 locale 指定的 Markdown 或 README，图片路由仅支持图片，见 [plugin-detail/src/document.ts:87-117](/Users/wanghuahui/workspace/deepseek-harness/packages/util/plugin-detail/src/document.ts#L87-L117)。没有按 `dataschema` 读取 JSON 的 Remote 方法。
- Market index 也不能靠作者私加字段直接扩展：parser 明确“未定义成员被忽略并丢弃”，见 [plugin-market-index/src/index.ts:291-315](/Users/wanghuahui/workspace/deepseek-harness/packages/util/plugin-market-index/src/index.ts#L291-L315)。
- **有一个可复用的低层零件**：`npmFiles(name, version, ...)` 能按任意包内路径读取精确 npm 版本的文件，不需要安装或执行该包；当前 URL 为 jsDelivr、unpkg、npmmirror，见 [plugin-detail/src/files.ts:222-280](/Users/wanghuahui/workspace/deepseek-harness/packages/util/plugin-detail/src/files.ts#L222-L280)。这足以支撑“公共 npm 包中的版本化 schema 文件”路径，但它不是事件类型到 schema 的目录，也不是不可变 persistent schema cache。
- 私有 registry 是明确缺口：Marketplace 对非公共 registry 的 npm 版本“没有可读取的包文件”，只能读条目 repository，见 [plugin-market/src/index.ts:268-313](/Users/wanghuahui/workspace/deepseek-harness/packages/boot/plugin-market/src/index.ts#L268-L313) 和 [plugin-market README:126-135](/Users/wanghuahui/workspace/deepseek-harness/packages/boot/plugin-market/README.zh.md#L126-L135)。
- 因此，对问题“是否已有可不加载插件代码的静态分发机制”的准确回答是：**公共 npm 文件读取与 Market/Git 缓存零件存在；通用 schema 声明、解析、公开获取 API、私有 registry 包文件读取与持久 schema 缓存未找到。**

### 3.4 NATS request/reply 与离线事实

- 当前 DSH 源码仓的 `packages/**/*.ts` 未找到 NATS client import，`packages/**/package.json` 未找到 NATS 依赖；NATS 是本 agent-dispatch 设计选定的外部基础设施，不是 DSH 现成插件资源服务。项目选择与 `nats.js` 接入见 [overview.md:54-62](/Users/wanghuahui/workspace/dsh-secretary/docs/agent-dispatch/overview.md#L54-L62)。
- NATS 官方提供 request/reply；但 Core NATS 是在线、at-most-once 通信，离线消息不由 Core server 保存；JetStream 才增加持久化与重投。官方来源见 [N1][N2][N3]，本仓库前次一手来源摘录见 [gateway-messaging-options.md:56-70](/Users/wanghuahui/workspace/dsh-secretary/docs/agent-dispatch/evidence/gateway-messaging-options.md#L56-L70)。
- 所以 JetStream 中已持久的事件，与 Core request/reply 获取 schema 是两条不同可用性路径：**事件可重放不推出 schema 应答者仍在线。**

## 4. 对三个核查问题的直接回答（事实归纳）

1. **包结构与额外文件**：npm/bundle 包可携带 `schemas/`、`examples/`；本仓库 `assets` 是实际例子。公开 DSH manifest 没有事件 schema/metadata 声明入口，`Config` 只管插件配置。
2. **是否必须安装到中心**：若走“中心读本地插件包”路线，则至少要让包在中心可解析；现有 Client 资源路由还要求活动 row。**但这不是 CloudEvents 的要求，也不是 A/B 的要求。**现有 Typert Remote/浏览器 `/plugins` 均不是通用的中心远程包读取机制。
3. **是否已有可复用 registry/marketplace 静态分发**：有公共 npm 精确版本文件读取、Market 索引内存缓存和 Git 磁盘缓存零件；未找到现成的通用 JSON Schema 分发器、私有 registry 包文件 API 或中心 persistent schema cache。

## 5. A/B/C 对比（以下为基于上述事实的推断）

| 路径 | 新增插件时中心重启 | 插件进程必须在线 | 闭源兼容 | 离线/缓存行为 | 现有覆盖与缺口 |
|---|---|---|---|---|---|
| **A：作者维护不可变 HTTPS schema URL** | **不需要**；中心按新 URL 动态读取 | **不需要**；只需 schema host 可达 | **兼容**；只公开/授权暴露契约，不需公开实现或源码仓 | 首次冷缓存且网络不可达时失败；成功后可持久缓存，后续与重启后离线可用 | CE URI 与普通 HTTPS 足够；DSH 没有现成 resolver，中心需补限时/限长、URL 与重定向安全策略、解析校验、持久缓存 |
| **B：URN + 插件经 NATS request/reply 提供 schema** | **不需要**；可运行时请求 | **冷缓存时需要**；有中心缓存后可离线校验旧 schema | **兼容**；只应答 schema，不暴露代码 | 插件离线且未缓存即失败；事件已入 JetStream 也不会自动带回 schema reply；成功后同样可缓存 | NATS 有 request/reply；需项目补 URN 绑定、请求/响应表示、超时/无应答、多应答处理与缓存，且不能依赖 Core 离线保存 |
| **C：复用插件包/Marketplace 静态资源** | 若中心直接按精确包版本抓文件，**不需要**；若要求中心安装/启用包，则不符合目标，且激活是否需重启受 HMR 限制 | **不需要插件进程**；需包/CDN/registry 可达 | 公共 npm 无需公开源码仓，但构建产物会被公开下载；私有包需中心可认证的 registry/tarball 通道。依赖公开 Git repo 不适合强制闭源场景 | 公共 CDN/私有 registry 冷缓存离线均失败；下载后可缓存。现有 Market TTL/仓库缓存不是 persistent schema cache | 公共 `npmFiles` 可复用；Market Remote 只给详情/图片，Market index 丢未知字段，私有 registry 无包文件读取，`/plugins` 仅活动 Client 图片。需补契约定位、私有来源和缓存 |

补充判断：

- **不可变性不是 URI scheme 自动赋予的。**A 要求作者不复用 URL 改字节；B 要求同一 URN 的应答内容稳定；C 要求固定包版本与路径。中心应在首次读取时记录内容摘要；只有再次获取同 URL 并比较摘要，才能发现内容变化。这不能替代作者的不可变发布纪律。
- **中心缓存决定重放时的离线能力，而不是 NATS subject 或 `dataschema` 名称决定。**三条路径冷缓存都依赖各自资源来源可用。
- **C 的最简单形态实际上会回到 A**：作者把 `dataschema` 直接写成精确 `name@version` 的公共 npm CDN HTTPS URL，中心仍只做普通 HTTPS 获取，不必先理解 Marketplace。

## 6. 推荐的一期最小路径（建议，不是现状声明）

1. **线上只使用现有 CloudEvents 字段**：插件事件在 structured JSON 顶层携带 `dataschema`，值为描述该事件 `data` 的、带明确版本的绝对 HTTPS JSON Schema URL；不使用会移动的别名，不在 `data` 内复制第二份地址。
2. **中心实现一次通用读取逻辑**：遇到缓存未命中的规范化 URL，在中心 Host 进程发起 HTTPS GET；不调用插件、不读取浏览器 bundle、不执行包安装或 `prepare`，也不要求插件进入中心 profile。
3. **把不可变内容当长期缓存**：读取并确认是可用 JSON Schema 后，持久保存 URL、原始 schema 字节与内容摘要，再构建 validator；同 URL 后续不再依赖网络。若强制重新抓取后摘要不一致，应按契约异常处理，不能静默替换旧 schema。
4. **保持既有失败边界**：冷缓存获取失败、JSON Schema 无法解析或事件校验失败时，保留事件并报告错误；不因为 JetStream 已有事件就假称 schema 已获取或处理成功。该失败要求与 [overview.md:69-70](/Users/wanghuahui/workspace/dsh-secretary/docs/agent-dispatch/overview.md#L69-L70) 一致。
5. **一期不同时建设 B/C 两套通道**：若某插件已经发布公共 npm 包，可直接让其不可变包文件 URL 复用 A；只有明确出现“中心不能访问任何作者 HTTPS host”或“已有私有包分发系统必须统一承载契约”的约束时，再分别评估 B 或私有 C。

### 仍需用户决定的一点

**中心能否自动抓取其首次见到的、由插件自报的公网 HTTPS origin，还是必须只访问预配置 origin allowlist？**这是中心出网与信任政策选择；若存在私网 schema host，还需在同一决策中明确该例外及凭据归属。它不改变“A 为一期最小路径”的结论，但决定读取器的准入配置。

## 7. 明确未找到与本轮限制

- DSH `package.json.dsh` 中未找到事件 schema、CloudEvents `dataschema` 或通用静态契约声明字段。
- DSH Plugin Marketplace/Plugin Manager 的公开 Remote 面中未找到按 URI 或包路径返回 JSON Schema 的方法。
- 未找到私有 npm registry 的通用包文件读取机制；现有文档反而明确其 Marketplace 不读此类包文件。
- 未找到 `/plugins` 为未激活包或任意 JSON 文件提供资源的机制；现有实现只服务活动 Client row 的受支持图片和已发布浏览器 bundle。
- 未找到 DSH 内置 NATS schema request/reply 服务，也未找到中心 persistent schema cache；这些若选择 A/B/C 均需由项目实现或组装。
- 本轮只读检索外部官方材料时，`web_fetch` 失败，HTTPS `curl` 因配置代理 `127.0.0.1:7897` 不可连接而失败；未把失败请求写成成功访问。CloudEvents/NATS 规则采用已定位的官方 URL，并与本仓库此前记录的一手规范证据交叉核对；本轮没有对外部网页内容作新断言。

## 8. 官方/源码 URL 与访问日期

### 8.1 本轮本地源码（均访问于 2026-11-16）

- DSH 官方源码仓：`/Users/wanghuahui/workspace/deepseek-harness`，commit `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`；官方仓库：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)。精确文件与行号见 §2–§3 的链接。
- 本仓库：`/Users/wanghuahui/workspace/dsh-secretary`；插件包实例与现有设计要求见 [bundle package.json:16-29](/Users/wanghuahui/workspace/dsh-secretary/packages/bundle/secretary/package.json#L16-L29)、[overview.md:64-72](/Users/wanghuahui/workspace/dsh-secretary/docs/agent-dispatch/overview.md#L64-L72)。
- 前次官方规范证据底稿（访问于 2026-11-16，原外部资料访问日期以各文为准）：[gateway-standards-map.md:38-60](/Users/wanghuahui/workspace/dsh-secretary/docs/agent-dispatch/evidence/gateway-standards-map.md#L38-L60)、[gateway-messaging-options.md:238-259](/Users/wanghuahui/workspace/dsh-secretary/docs/agent-dispatch/evidence/gateway-messaging-options.md#L238-L259)。

### 8.2 官方规范与文档 URL（本轮检索定位日期 2026-11-16）

- **[CE1]** CloudEvents Core 1.0.2，`dataschema` URI、`data` 语义与兼容变化时更换 URI 的建议：[正式规范](https://raw.githubusercontent.com/cloudevents/spec/v1.0.2/cloudevents/spec.md)。
- **[CE2]** CloudEvents JSON Event Format 1.0.2，structured JSON 顶层属性表示：[正式规范](https://raw.githubusercontent.com/cloudevents/spec/v1.0.2/cloudevents/formats/json-format.md)。
- **[N1]** NATS 官方 Request-Reply：[文档](https://docs.nats.io/learn/core-nats/request-reply)。
- **[N2]** NATS 官方 Core NATS Deep Dive，Core 投递与无持久存储边界：[文档](https://docs.nats.io/learn/core-nats/)。
- **[N3]** NATS 官方 JetStream Concepts，持久化与 consumer delivery：[文档](https://docs.nats.io/concepts/jetstream)。
