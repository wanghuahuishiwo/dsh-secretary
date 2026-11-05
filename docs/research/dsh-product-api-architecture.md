# DSH 产品插件 Host API 归属：第一方源码调研

- 调研日期：2026-11-05（Asia/Shanghai）。
- 问题：前端产品插件的 Host API 应由统一代理插件、多个产品交付插件，还是领域功能插件内部的 API 模块承担？
- 本项目边界：TimeBlock 是独立右栏产品，现有实录／计划／深度时间功能与交互不变；GTD 是左栏 `sidebar.panellist` + `main` 的独立页面，本期只建空白页，完整 OmniFocus UI 暂缓。本文只研究 API 归属，不改变这些产品决定，不修改生产代码，也不替 Lead 作最终选型。
- 证据标记：**【源码事实】**指当前官方 checkout 的源码或官方文档；**【rc.5 事实】**指本机运行包的归档产物；**【设计推断】**指面向 dsh-secretary 的分析，不是 DSH 官方规定。

## 1. 结论摘要

1. **【源码事实】官方存在统一的 Remote 装配层，但没有把多个领域业务方法合并成一个统一 API Proxy。** `dsh-api-remotes` 选择并挂载各领域包生成的 `/remote` contribution；Schedules、Plugin Manager 等业务方法仍由各自 Host service 持有。
2. **【源码事实】Schedules 的 Host API 在 `dsh-schedule`，不在 `ui-schedule`。** `ScheduleService` 继承 `TypertRemoteService`，以 `schedule` 为 namespace，并直接用 `@Remote` 标注能力方法；浏览器页经 `ctx.remote.schedule.*` 调用。
3. **【源码事实】Schedules 当前没有使用 `@RemoteScope`。** 它使用根 Host Context 上的直接服务调用；`RemoteScope` 是“先由 identity 解析 scoped Context，再从该 Context 取 service”的另一种调用形态，不是每个产品 API 都必须经过的层。
4. **【源码事实】main 页面与 right 页面是 Client 展示贡献，不要求各自拥有 Host API adapter。** 官方 `ui-schedule` 在同一个浏览器插件里构造一份共享 catalog/detail face，再分别注册 main 与 right slots。
5. **【源码事实】Plugin Manager 的核心管理 API 直接属于 `PluginManager` Host service，没有独立的 PluginManager API adapter 包。** 但同一产品页还消费独立拥有的 `pluginInventory` 与 `pluginRegistryProbe` namespaces；它们是各自能力的 service，不应统称为 PluginManager 的转发 adapter。
6. **【源码事实】普通 `connection.fetch.register` 路由由实际功能包拥有。** 当前源码中的 Session 导出、原始文件上传、Plugin Manager 详情图片都是真实例子；它适合 RPC 信封之外的流式或浏览器原生响应／请求，不是统一业务代理的替代品。
7. **【设计推断】三种项目形态不能简单按“页面是否独立”决定。** 需要区分：领域共享能力、产品专属 UI 编排、跨领域聚合，以及纯传输需求；中央装配与中央业务代理是两件事。

## 2. 快照、版本与引用规则

| 证据 | 精确范围 | 用途与限制 |
|---|---|---|
| 官方源码 checkout | `/Users/wanghuahui/workspace/deepseek-harness`，HEAD `fcc0ad4621`；`git describe` 为 `dsh-v0.2.2-rc.1-811-gfcc0ad4621` | 包清单版本是 `0.2.2-rc.1`，见 [根 package.json:1-9](/Users/wanghuahui/workspace/deepseek-harness/package.json#L1-L9)，但 HEAD 已是该 tag 后 811 个提交；本文称其为“当前源码／fcc0ad4621”，不把它等同于 tag 原样，也不要求桌面端跟踪 master。 |
| 当前 Desktop | `0.2.1-rc.5`，见 [Info.plist:19-35](</Applications/DeepSeek Harness.app/Contents/Info.plist#L19-L35>) 与归档内 [dsh/package.json:1-13](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/package.json#L1-L13>) | 用于验证已运行版本的分层连续性；不能据此声称当前源码新增的 endpoint 已存在于 rc.5。 |
| dsh-secretary 当前实现 | 本项目工作树，只读查看 | 仅用于说明待划分现状；不是 DSH 官方证据。 |

`app.asar` 是归档而非普通目录。本文以 `app.asar/<内部路径>` 表示归档内文件，行号按归档中 JS／JSON 原文计算；读取在内存中完成，没有解包或写入镜像。

**生成物边界。** 当前 checkout 的 Schedule 源文件已含 `create`、`edit`、`run` 等方法，见 [ScheduleService:348-363、486-543](/Users/wanghuahui/workspace/deepseek-harness/packages/schedule/schedule/src/index.ts#L348-L543)；但工作树现有 [typert.remote-client.d.ts:8-25](/Users/wanghuahui/workspace/deepseek-harness/packages/schedule/schedule/lib/typert.remote-client.d.ts#L8-L25) 仍列旧的 `delete/update`。因此本文的当前 API 名称以 TypeScript 源文件为准，rc.5 API 以 app.asar 为准，不把这份未同步的生成物当作当前源码契约。官方也明确说明 Client 读取的是“最近一次生成”的产物，签名变化后须重跑有序构建，见 [API Gateway:138-162](/Users/wanghuahui/workspace/deepseek-harness/docs/api-gateway.zh.md#L138-L162)。

## 3. Schedules：Host API、契约与 main/right 页面怎样分层

### 3.1 Host service 本身就是 Remote 能力拥有方

**【源码事实】** `ScheduleService` 位于领域包 `@deepseek-ai/dsh-schedule`，不是前端包或统一代理包：

- 类继承 `TypertRemoteService`，声明 Host 依赖 `agents`、`sessions`、`storageDomain`、`sessionPersistence`，构造器用 `super(ctx, 'schedule')` 绑定 service key／默认 namespace，见 [schedule/src/index.ts:216-249](/Users/wanghuahui/workspace/deepseek-harness/packages/schedule/schedule/src/index.ts#L216-L249)。
- `@Remote` 直接标在这个类的方法上。当前源码包括 `deliveryLimits`、`create`、`list`、`catalog`、`view`、`history`、`run`、`deleteInactive`、`edit`，代表位置见 [同文件:348-369](/Users/wanghuahui/workspace/deepseek-harness/packages/schedule/schedule/src/index.ts#L348-L369)、[同文件:422-484](/Users/wanghuahui/workspace/deepseek-harness/packages/schedule/schedule/src/index.ts#L422-L484) 与 [同文件:486-543](/Users/wanghuahui/workspace/deepseek-harness/packages/schedule/schedule/src/index.ts#L486-L543)。
- 部分 Remote 方法承担本类内部的签名／错误适配。例如 `remoteCreate()` 调用同类的 `create()`，`remoteEdit()` 调用同类的 `edit()`；没有另一个跨包 API Proxy 接管领域逻辑，见 [同文件:356-407](/Users/wanghuahui/workspace/deepseek-harness/packages/schedule/schedule/src/index.ts#L356-L407) 与 [同文件:530-558](/Users/wanghuahui/workspace/deepseek-harness/packages/schedule/schedule/src/index.ts#L530-L558)。官方 cookbook 的规则正是“签名已适合 wire 就直接标注；只有需要调整形态时才写 `remoteExport*` adapter”，见 [新增 Remote API:7-49](/Users/wanghuahui/workspace/deepseek-harness/docs/cookbook/adding-a-remote-api.zh.md#L7-L49)。

**【源码事实】** 当前 Schedule 包没有 `@RemoteScope`。官方语义区别是：

- `@Remote` 调根 Host Context 中注册的 service；复杂 Host 对象可作为 lookup 参数由 wire identity 解析。
- `@RemoteScope(key)` 先把 identity 解析为 scoped Context，再从该 Context 取 service；它只生成作用域调用接口。

定义与示例见 [API Gateway:9-19、49-64](/Users/wanghuahui/workspace/deepseek-harness/docs/api-gateway.zh.md#L9-L64)。Schedule 的 Host-wide 管理直接使用 `schedule/*`，不能因为其他产品可能有 Session scope 就把 `RemoteScope` 当成必备分层。

**【rc.5 事实】** 运行包也采用同一归属：构建后的 `ScheduleService` 在 [lib/index.js:1891-1906](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-schedule/lib/index.js#L1891-L1906>) 标出 `Remote("list"/"catalog"/"history"/"delete"/"update")`，并在 [同文件:1969-1995](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-schedule/lib/index.js#L1969-L1995>) 绑定 `schedule`。生成的 descriptors 把这些方法标为 `invocation: { kind: 'direct' }`，见 [typert.remote-client.js:452-473、503-570](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-schedule/lib/typert.remote-client.js#L452-L570>)。这证明旧版也是直接 Remote，而非统一业务代理；旧版具体 endpoint 集合与当前源码不同。

### 3.2 contract/types 分布在拥有方、生成入口和装配层

**【源码事实】** Schedule 没有一个必须命名为 `contract/` 的官方目录，实际分为三类：

| 层 | 位置与事实 | 作用 |
|---|---|---|
| 领域 Client-safe 词汇 | [schedule/src/types.ts:1-14](/Users/wanghuahui/workspace/deepseek-harness/packages/schedule/schedule/src/types.ts#L1-L14) 定义业务类型；[schedule/src/client.ts:1-2](/Users/wanghuahui/workspace/deepseek-harness/packages/schedule/schedule/src/client.ts#L1-L2) 仅以 browser-safe 入口转口它们 | UI 可引用 `ScheduleId`、`ScheduleCatalogEntry` 等，而不导入 Host 实现；`schedule/changed` 的 Cordis 事件签名也在 [types.ts:629-635](/Users/wanghuahui/workspace/deepseek-harness/packages/schedule/schedule/src/types.ts#L629-L635)。 |
| 生成的 Remote 契约 | 包清单把 `./typert` 与 `./remote` 分别指向生成的 Host 与 Host-for-Client 产物，见 [schedule/package.json:16-45](/Users/wanghuahui/workspace/deepseek-harness/packages/schedule/schedule/package.json#L16-L45) | 前者供 Host Loader／registry，后者携带 Client 方法声明、descriptor 与 codec；官方职责表见 [API Gateway:110-122](/Users/wanghuahui/workspace/deepseek-harness/docs/api-gateway.zh.md#L110-L122)。 |
| 应用选择／类型合并 | [api-remotes/src/client/index.ts:1-31](/Users/wanghuahui/workspace/deepseek-harness/packages/api/remotes/src/client/index.ts#L1-L31) 导入 Schedule 等包的 `/remote`，[同文件:173-201](/Users/wanghuahui/workspace/deepseek-harness/packages/api/remotes/src/client/index.ts#L173-L201) 增强 `Context.remote` 并逐个 `$mount()` | 让调用方得到类型化的 `ctx.remote.schedule`，但不重写 Schedule 方法签名或业务逻辑。 |

事件还有一道显式选择：`schedule/changed` 由领域包声明，再由 [api-remotes/src/remote-events.ts:1-26、49-57](/Users/wanghuahui/workspace/deepseek-harness/packages/api/remotes/src/remote-events.ts#L1-L57) 加入应用转发 allowlist。领域事件的存在不自动等于浏览器可订阅。

**【rc.5 事实】** 上述 exports 不是当前源码才出现：运行包的 [dsh-schedule/package.json:14-45](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-schedule/package.json#L14-L45>) 已发布 `./client`、`./typert`、`./remote` 及相应生成文件。

### 3.3 Client 只消费生成的 namespace；main/right 共享一份产品状态面

**【源码事实】** `ui-schedule` 是独立 Client 产品包：

- 浏览器插件声明 `remote` 和 `remote.schedule` 等 Cordis 服务依赖，见 [ui-schedule/src/client/index.ts:77-81](/Users/wanghuahui/workspace/deepseek-harness/packages/client/ui-schedule/src/client/index.ts#L77-L81)。
- 它创建一份 `manager` 与一份 `detail`，直接调用 `ctx.remote.schedule.catalog/edit/history/run/create/...`，并订阅 `schedule/changed`，见 [同文件:124-196](/Users/wanghuahui/workspace/deepseek-harness/packages/client/ui-schedule/src/client/index.ts#L124-L196) 与 [同文件:216-236](/Users/wanghuahui/workspace/deepseek-harness/packages/client/ui-schedule/src/client/index.ts#L216-L236)。
- 同一份 `detail` 被注入 right detail tab，right tab 的 body/title 注册见 [同文件:197-215](/Users/wanghuahui/workspace/deepseek-harness/packages/client/ui-schedule/src/client/index.ts#L197-L215)；main manager 与左栏入口注册见 [同文件:216-243](/Users/wanghuahui/workspace/deepseek-harness/packages/client/ui-schedule/src/client/index.ts#L216-L243)。right tab 的 kind、参数类型与 definition 由 [definition.ts:13-40](/Users/wanghuahui/workspace/deepseek-harness/packages/client/ui-schedule/src/client/definition.ts#L13-L40) 拥有。
- UI 包的 Host 根入口只有空 `apply()`，注释说明行为只在浏览器入口，见 [ui-schedule/src/index.ts:1-7](/Users/wanghuahui/workspace/deepseek-harness/packages/client/ui-schedule/src/index.ts#L1-L7)。所以“产品 UI 包独立”并未导致“Host API 也搬入 UI 包”。

**【rc.5 事实】** 运行包同样能从 [ui-schedule/lib/client.js:7362-7377](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-client-ui-schedule/lib/client.js#L7362-L7377>) 看到 `remote.schedule` 依赖，从 [同文件:7394-7441](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-client-ui-schedule/lib/client.js#L7394-L7441>) 看到 Remote 调用，并从 [同文件:7453-7490](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-client-ui-schedule/lib/client.js#L7453-L7490>) 看到同一包注册 right body/title、main 与 `sidebar.panellist`。这是跨版本稳定的“Host 能力／Client 页面”分离证据。

## 4. Plugin Manager：同类产品 API 在哪里，是否有独立 adapter

### 4.1 核心管理 API 直接在 Host service 上

**【源码事实】** `@deepseek-ai/dsh-plugin-manager` 的 `PluginManager`：

- 在 [plugin-manager/src/index.ts:304-358](/Users/wanghuahui/workspace/deepseek-harness/packages/boot/plugin-manager/src/index.ts#L304-L358) 继承 `TypertRemoteService`，声明 `loader`、`profileContext` 依赖，并绑定 `pluginManager` namespace。
- `readBundleDetail`、`listVersionExemptions`、`setVersionExemption`、`listPlugins`、`listBundles` 等直接以 `@Remote` 暴露，见 [同文件:392-405](/Users/wanghuahui/workspace/deepseek-harness/packages/boot/plugin-manager/src/index.ts#L392-L405)、[同文件:436-490](/Users/wanghuahui/workspace/deepseek-harness/packages/boot/plugin-manager/src/index.ts#L436-L490)。方法体直接执行 profile、Loader、安装等管理工作，没有另一个统一 API adapter 类。
- 公共记录和 Remote 错误词汇在同包 [src/types.ts:1-23、54-73](/Users/wanghuahui/workspace/deepseek-harness/packages/boot/plugin-manager/src/types.ts#L1-L73)，包清单公开 `./types`、`./typert` 与 `./remote`，见 [plugin-manager/package.json:16-52](/Users/wanghuahui/workspace/deepseek-harness/packages/boot/plugin-manager/package.json#L16-L52)。

浏览器产品页只消费这些 namespaces：`ui-plugin-manager` 的 [client/index.ts:82-86](/Users/wanghuahui/workspace/deepseek-harness/packages/client/ui-plugin-manager/src/client/index.ts#L82-L86) 声明 `remote.pluginManager`、`remote.pluginInventory`、`remote.pluginRegistryProbe`，在 [同文件:129-173](/Users/wanghuahui/workspace/deepseek-harness/packages/client/ui-plugin-manager/src/client/index.ts#L129-L173) 注册 main 与左栏入口；实际管理 controller 注释和调用见 [manager-store.ts:659-690](/Users/wanghuahui/workspace/deepseek-harness/packages/client/ui-plugin-manager/src/client/manager-store.ts#L659-L690)。

**【rc.5 事实】** 运行包的 `PluginManager` 仍在 [lib/index.js:1418、1605-1681](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-plugin-manager/lib/index.js#L1418-L1681>) 绑定自身 namespace 并实现 `listPlugins/listBundles`；其生成贡献在 [typert.remote-client.js:447-604](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-plugin-manager/lib/typert.remote-client.js#L447-L604>) 直接声明 `pluginManager/*`。对应包已导出 `./types`、`./typert`、`./remote`，见归档内 [package.json:16-36](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-plugin-manager/package.json#L16-L36>)。

### 4.2 有独立 service，不等于有“PluginManager 总 adapter”

**【源码事实】** 这个产品周围有三个不同归属：

1. `pluginManager`：上述管理 service。
2. `pluginInventory`：`PluginInventoryGateway` 是只读 Loader 投影的 Remote-only service，自己继承 `TypertRemoteService`、绑定 namespace 并暴露 `list`，见 [host/plugin-inventory/src/index.ts:50-76](/Users/wanghuahui/workspace/deepseek-harness/packages/host/plugin-inventory/src/index.ts#L50-L76)。
3. `pluginRegistryProbe`：安装对话框需要的 registry 测速能力，Host 实现位于 UI 交付包的根入口，并直接以 `@Remote` 暴露 `fastest()`，见 [ui-plugin-manager/src/index.ts:24-57](/Users/wanghuahui/workspace/deepseek-harness/packages/client/ui-plugin-manager/src/index.ts#L24-L57)。

因此准确结论不是“Plugin Manager 有一个独立 API adapter”，而是：**核心管理 API 无独立 adapter；相邻能力可以按自己的业务边界成为独立 service，其中一个恰好由产品交付包携带。**

**【源码事实】** 官方也确有显式称为 adapter 的 Remote service。例如 `SessionFileReferences` 是 `Session Controller adapter`，把 `fileReferences` provider 暴露成 Remote namespace，见 [session-controller/src/file-references.ts:1-39](/Users/wanghuahui/workspace/deepseek-harness/packages/api/session-controller/src/file-references.ts#L1-L39)。cookbook 还规定：当 owner 是抽象 seam 时，可把 controller 放进对应的 `packages/api/` 包，见 [新增 Remote API:90-105](/Users/wanghuahui/workspace/deepseek-harness/docs/cookbook/adding-a-remote-api.zh.md#L90-L105)。所以“所有 API 必须放进领域包”同样不是官方的绝对规则；关键是归属与职责，而不是目录名。

## 5. `connection.fetch.register` 的真实产品例子与适用边界

### 5.1 Connection 提供的不是任意公共 Web 路由，而是功能拥有的精确 `/api` 路由

**【源码事实】** `ConnectionFetchRoute` 只支持 `GET/HEAD/POST`，路径必须位于 `/api` 下，请求体可选 `buffered` 或 `streaming`；handler 在载体的信任与认证策略之后执行，exact route 只允许 owner Peer，见 [connection/src/rpc.ts:146-175](/Users/wanghuahui/workspace/deepseek-harness/packages/client/connection/src/rpc.ts#L146-L175)。`HostConnectionHandle.fetch` 的适用注释是“streaming or browser-native responses”，见 [同文件:205-210](/Users/wanghuahui/workspace/deepseek-harness/packages/client/connection/src/rpc.ts#L205-L210)。

官方总览进一步明确：Typert Gateway 认领生成的 Remote endpoints，功能包注册 Session 日志下载、原始文件上传等非 JSON／RPC 信封之外的响应，见 [connection/README.zh.md:32-34](/Users/wanghuahui/workspace/deepseek-harness/packages/client/connection/README.zh.md#L32-L34) 与 [API Gateway:126-130、166-170](/Users/wanghuahui/workspace/deepseek-harness/docs/api-gateway.zh.md#L126-L170)。

### 5.2 例一：Session 导出——功能包同时拥有 Host routes 与浏览器控件

**【源码事实】** `@deepseek-ai/dsh-session-log-export` 的 Host `apply()` 直接注册 `GET/HEAD /api/session.export` 与 `/api/session.markdown`，见 [session-log-export/src/index.ts:75-115](/Users/wanghuahui/workspace/deepseek-harness/packages/session-query/session-log-export/src/index.ts#L75-L115)；路径常量和浏览器相对形式由同包 [routes.ts:1-17](/Users/wanghuahui/workspace/deepseek-harness/packages/session-query/session-log-export/src/routes.ts#L1-L17) 拥有。官方 README 明说本包分 Host／浏览器两半，Connection 负责信任与流式 Response 桥接，本功能包负责查询校验、读取、ZIP 与 HTTP 状态语义，见 [README.zh.md:99-109](/Users/wanghuahui/workspace/deepseek-harness/packages/session-query/session-log-export/README.zh.md#L99-L109)。

这里没有独立 API adapter 包；route 是导出功能自己的 Host 接口。ZIP 下载需要浏览器下载管理和流式响应，属于精确 Fetch route 的典型适用场景。

### 5.3 例二：文件上传——同一领域 service 同时提供 Remote fallback 与 raw streaming route

**【源码事实】** `FileUploads` 是拥有上传存储与 receipt 的 Host service，直接注册 `POST /api/session/uploadFileBinary` 且 `requestBody: 'streaming'`，见 [file-upload/src/index.ts:57-87](/Users/wanghuahui/workspace/deepseek-harness/packages/client/file-upload/src/index.ts#L57-L87)。route handler 校验 raw content type、读取流并把业务结果编码为响应，见 [http-route.ts:16-71](/Users/wanghuahui/workspace/deepseek-harness/packages/client/file-upload/src/http-route.ts#L16-L71)。同一 service 还用 `@Remote('upload')` 接收编码后的字节，见 [index.ts:105-120](/Users/wanghuahui/workspace/deepseek-harness/packages/client/file-upload/src/index.ts#L105-L120)。

浏览器侧的选择很具体：Blob／stream 走 raw background carrier，精确 `Uint8Array` 走 Remote，见 [client/runtime.ts:183-211](/Users/wanghuahui/workspace/deepseek-harness/packages/client/file-upload/src/client/runtime.ts#L183-L211) 与 [client/contract.ts:15-33](/Users/wanghuahui/workspace/deepseek-harness/packages/client/file-upload/src/client/contract.ts#L15-L33)。这说明 Remote 与 Fetch route 可按数据形态共存，不需要为了统一而让所有调用经过同一种 adapter。

### 5.4 例三：Plugin Manager 详情图片——route 也在管理能力拥有方内部

**【源码事实】** 当前 `PluginManager` 构造器通过可选的 `connection` 注册 `/api/plugin-manager/detail-file`，handler 读取 bundle 文档旁的图片，见 [plugin-manager/src/index.ts:91-92、381-433](/Users/wanghuahui/workspace/deepseek-harness/packages/boot/plugin-manager/src/index.ts#L91-L433)。它与 `@Remote readBundleDetail()` 同属一个 service，并未委托统一代理。

**版本边界：** 上述三个 route 例子用于说明当前源码的真实归属。本文不把它们逐行倒推为 rc.5 的实现；尤其当前 Plugin Manager 的详情图片代码不能仅凭旧版已有 PluginManager 就视为旧版已有该 route。

## 6. 官方有没有跨产品统一 API 代理

### 6.1 有统一装配与传输，没有统一业务方法拥有者

**【源码事实】** `dsh-api-remotes` 的描述是应用所选 Host 能力的 Remote BFF assembly，见 [api-remotes/package.json:1-4](/Users/wanghuahui/workspace/deepseek-harness/packages/api/remotes/package.json#L1-L4)。其实际行为是：

1. 从 Schedule、Goal、Plugin Manager、Plugin Inventory 等包导入生成的 `/remote`，见 [api-remotes/src/client/index.ts:1-31](/Users/wanghuahui/workspace/deepseek-harness/packages/api/remotes/src/client/index.ts#L1-L31)。
2. 逐个 `ctx.remote.$mount(contribution)`，失败时反向卸载，见 [同文件:180-211](/Users/wanghuahui/workspace/deepseek-harness/packages/api/remotes/src/client/index.ts#L180-L211)。
3. Host 根入口注册所选事件的转发 source，见 [api-remotes/src/index.ts:33-45](/Users/wanghuahui/workspace/deepseek-harness/packages/api/remotes/src/index.ts#L33-L45)。
4. Gateway 负责校验、lookup／Context 解析与实时 service 调用，Connection 负责载体与 HTTP bridge，见 [API Gateway:86-100](/Users/wanghuahui/workspace/deepseek-harness/docs/api-gateway.zh.md#L86-L100)。

所以 `api-remotes` 是**组合根／类型装配面**，不是把所有领域方法写进一个 service 的统一业务代理。

### 6.2 官方规则直接反对跨领域 ApiProxy

**【源码事实】** 官方 defensive pattern 要求“新的远程业务能力就是一个新的 service——独立包或独立对象”，按业务边界而不是调用方数量划分，见 [远程与 API 规则:7-14](/Users/wanghuahui/workspace/deepseek-harness/docs/defensive-patterns/remote-and-api.zh.md#L7-L14)。其反例正是一个 `ApiProxy` 同时承载 `goalList` 与 `subagentPrompt`，并指出这会让两个领域的激活、分页和事件处理耦合，见 [同文件:34-43](/Users/wanghuahui/workspace/deepseek-harness/docs/defensive-patterns/remote-and-api.zh.md#L34-L43)。

同一文档还规定 `packages/api` 只承载传输、调用形态、Session 生命周期等通用编排，业务分支归独立包或模块；`remotes` 的选择属于基础设施，不是业务逻辑，见 [同文件:83-90](/Users/wanghuahui/workspace/deepseek-harness/docs/defensive-patterns/remote-and-api.zh.md#L83-L90)。

**边界结论：** 官方支持“统一选择、统一挂载、统一传输”，不支持把多个业务领域的方法与规则合并进“一个统一业务 Proxy”。同时，官方存在领域 service 直接暴露、抽象 seam 的 controller adapter、产品交付包携带专用 Host service 等多种形态；并不存在强制所有产品共用一种目录的要求。

## 7. manifest exports/inject 与 Host/Client 依赖怎样支撑分层

### 7.1 exports 把 Host 实现、Client 词汇与生成 Remote 产物分开

**【源码事实】** Schedule 的清单提供根 Host 入口、`./client` 类型入口、`./typert` Host 生成入口和 `./remote` Client 贡献入口，见 [schedule/package.json:13-45](/Users/wanghuahui/workspace/deepseek-harness/packages/schedule/schedule/package.json#L13-L45)。`ui-schedule` 则提供根 Loader 入口与真正的 `./client` 浏览器 bundle，见 [ui-schedule/package.json:5-20](/Users/wanghuahui/workspace/deepseek-harness/packages/client/ui-schedule/package.json#L5-L20)。

这套出口使 UI 能引用业务词汇与生成调用面，而不把 Host 的 Node 存储、Session 恢复等实现带进浏览器。官方明确要求业务包通过 `./typert` 与 `./remote` 暴露生成入口，且生成器校验 exports 与发布文件清单，见 [API Gateway:110-124](/Users/wanghuahui/workspace/deepseek-harness/docs/api-gateway.zh.md#L110-L124)。

### 7.2 两种 inject 不能混为一谈

**【源码事实】** `package.json.dsh.client.inject` 写的是**包名依赖，不是 Cordis service injection**，定义见 [package-manifest/src/types.ts:86-99](/Users/wanghuahui/workspace/deepseek-harness/packages/util/package-manifest/src/types.ts#L86-L99)。Client Modules 扫描 `dsh.client` 与 `exports["./client"]` 组成浏览器入口图，见 [client-modules.zh.md:88-100](/Users/wanghuahui/workspace/deepseek-harness/docs/subsystems/client-modules.zh.md#L88-L100)。

- `ui-schedule` 的 manifest 以包名声明依赖 `dsh-api-remotes`、layout、sidebar、right-sidebar 等，见 [ui-schedule/package.json:21-38](/Users/wanghuahui/workspace/deepseek-harness/packages/client/ui-schedule/package.json#L21-L38)。
- `dsh-api-remotes` 自身以包名依赖 `dsh-api-gateway`，并标为 `immediately`，见 [api-remotes/package.json:33-40](/Users/wanghuahui/workspace/deepseek-harness/packages/api/remotes/package.json#L33-L40)。
- 真正等待 `ctx.remote` 与 `remote.schedule` 服务的是浏览器入口的 `inject = ['remote', 'remote.schedule', ...]`，见 [ui-schedule/src/client/index.ts:77-81](/Users/wanghuahui/workspace/deepseek-harness/packages/client/ui-schedule/src/client/index.ts#L77-L81)。官方要求由实际调用方声明这个 namespace 依赖，而不是由 assembly 代替它声明，见 [API Gateway:60-64](/Users/wanghuahui/workspace/deepseek-harness/docs/api-gateway.zh.md#L60-L64)。

### 7.3 Host service、Remote assembly、UI 包是不同 Loader 行

**【源码事实】** Web app patch 分别挂载 `dsh-schedule`、`dsh-api-remotes` 与 `dsh-client-ui-schedule`，见 [web-app/cordis.patch.yml:131-136](/Users/wanghuahui/workspace/deepseek-harness/packages/bundle/web-app/cordis.patch.yml#L131-L136)、[同文件:239-245](/Users/wanghuahui/workspace/deepseek-harness/packages/bundle/web-app/cordis.patch.yml#L239-L245) 与 [同文件:401-404](/Users/wanghuahui/workspace/deepseek-harness/packages/bundle/web-app/cordis.patch.yml#L401-L404)。最后一段注释直接写“over the Host Schedule service mounted above”。

这意味着“领域能力拥有 API”与“应用统一挂载 Remote”可以共存；并不要求把 API 实现移动到 UI 包，也不要求引入一个业务总代理。

## 8. 三种归属形态比较（不代作最终选择）

为避免名词含混，本文把候选形态定义如下：

- **统一代理插件**：一个 Host 插件／service 对浏览器暴露多个领域的业务方法或命令，并调用 GTD、Tag、Time 等下游服务。
- **产品交付插件 API**：Time 产品交付插件与 GTD 产品交付插件各自拥有面向自身页面的 Host adapter／routes，再调用领域 service。
- **领域包内部 API**：GTD、Time、Tag 的领域包各自拥有 Remote service／方法；所谓 `api/` 只是包内可选文件布局，不是官方规定。

| 维度 | 统一代理插件 | 产品交付插件 API | 领域包内部 API |
|---|---|---|---|
| 官方对应证据 | 跨领域 `ApiProxy` 是官方明确反例；统一 `api-remotes` 只是装配，不是这种代理 | `SessionFileReferences` 证明 adapter 可以独立；`PluginRegistryProbe` 证明产品交付包可携带专用 Host 能力，但 Schedules 并非此形态 | Schedules、PluginManager、FileUploads 都是直接证据 |
| 领域规则归属【设计推断】 | 容易把编排、校验、过滤逐步吸进代理，离开事实拥有方 | 可让 UI 专属聚合贴近页面；若 Agent 也需同一能力，容易形成第二套业务入口 | 人类 UI 与 Agent tools 最易共享同一领域能力和契约 |
| 产品独立性【设计推断】 | 多产品共用 Host 生命周期、依赖集合与发布单元，独立入口仍被后端耦合 | 页面专属 adapter 随产品启停，适合不同 main/right 交付节奏 | UI 可独立，领域 API 的变更仍影响所有消费方；需要稳定契约 |
| 契约与类型【设计推断】 | 手写通用 `domain/op` 容易丢失具体类型；若做 typed Remote 又会形成大型 namespace | 每个产品可选 Remote 或精确 route，但要维护 adapter 与领域类型映射 | 最直接复用 Typert 从 Host 方法生成 Client 类型、codec 与 declaration map 的路径 |
| UI 聚合【设计推断】 | 跨领域 snapshot／一个命令入口最方便 | 产品内聚合方便，跨产品聚合需另找归属 | 纯领域方法最清晰；跨领域页面 snapshot 不宜硬塞进任一领域 |
| 传输选择【设计推断】 | 即使统一使用 HTTP，也不能因此证明业务应统一归属 | 产品特有的浏览器原生交互可就近使用 route | 原始字节、下载等可由功能包直接拥有 route；不必另建代理 |
| 主要代价【设计推断】 | 与官方按业务边界拆 service 的规则冲突最大；变更面和权限面容易扩张 | 包与 adapter 数量增加；要防止业务规则复制和 UI／Agent 语义漂移 | Remote 关注会进入领域 service；需用小的 Remote 方法或同包 adapter 保持业务方法清晰 |

### 8.1 对当前 dsh-secretary 的具体含义【设计推断】

重构前的 `dsh-secretary-panel` 是统一 Host routes 形态：一个插件注入 `connection/tags/gtd/time`，注册 `/api/secretary.state` 与 `/api/secretary.command`，历史实现见 [panel/src/index.ts:413-451](https://github.com/wanghuahuishiwo/dsh-secretary/blob/5e765ae6bd2d8f56b08af519cd56318f2b423dc9/packages/panel/src/index.ts#L413-L451)；命令再按 `gtd/tag/time/deep` 分派，代表分支见 [同文件:342-410](https://github.com/wanghuahuishiwo/dsh-secretary/blob/5e765ae6bd2d8f56b08af519cd56318f2b423dc9/packages/panel/src/index.ts#L342-L410)。Client 的 `PanelState` 同时混合多领域数据，`PanelCommand` 使用 `domain + op`，见 [panel/src/client/api.ts:1-57](https://github.com/wanghuahuishiwo/dsh-secretary/blob/5e765ae6bd2d8f56b08af519cd56318f2b423dc9/packages/panel/src/client/api.ts#L1-L57)。这是已退出架构的历史事实，不是 DSH 官方推荐证据。

在已确认的独立产品边界下，可按以下问题逐项判断，而不必先选一个总答案：

1. **能力是否是 GTD／Time／Tag 本身稳定、同时供 Agent 与 UI 使用的操作？** 若是，领域拥有的 API 与 Schedule 的官方事实最相近；把它只留在某个页面代理里会形成第二个业务入口。
2. **逻辑是否只是某产品的页面投影、交互事务或导航编排？** 若是，产品交付 adapter 是可比较的候选；官方独立 adapter 与产品专用 Host service 证明这种形态并非反模式。
3. **是否跨多个领域聚合成一个 snapshot？** 若是，需要单独认定这个组合的拥有者；不能借“统一方便”把各领域的全部方法也并入同一 service。
4. **是否只是 raw upload、ZIP、图片、浏览器下载等 RPC 信封之外的传输？** 若是，官方事实支持由实际功能拥有精确 Fetch route，与采用哪种业务 API 包结构可以分别决定。
5. **是否为了 main 与 right 各建一个 API 层？** Schedules 证明没有必要由页面位置推导 API 包数；同一 Client 插件可让 main/right 共享一个 Remote catalog source。
6. **采用 Remote 时是否备齐生成与装配链？** 需要领域包的 `./typert`／`./remote`、应用 Remote assembly 的选择、Client manifest 包依赖以及调用方 `remote.<namespace>` 服务依赖；只新建一个 `api/` 目录不会自动得到 `ctx.remote`。

这些是为 Lead 提供的判据，不是对 TimeBlock／GTD 包结构的最终决定，也不要求改变现有 Time 功能或交互。

## 9. 事实与推断总表

| 结论 | 性质 | 主要证据／限制 |
|---|---|---|
| Schedule API 归 `ScheduleService`，UI 经 `ctx.remote.schedule` | 【源码事实】＋【rc.5 事实】 | 两版本均有直接证据；具体 endpoint 已演进，不可混用 |
| Schedule 当前不用 `RemoteScope` | 【源码事实】 | 当前包只使用直接 `@Remote`；`RemoteScope` 的 scoped Context 语义由官方文档定义 |
| main/right 可共享同一 Client 产品面，不需各自 Host adapter | 【源码事实】＋【rc.5 事实】 | `ui-schedule` 的实际 slot 注册与共享 `detail/manager` |
| PluginManager 核心 API 无独立 adapter；相邻能力各有 service | 【源码事实】＋【rc.5 事实】 | `pluginInventory` 与 `pluginRegistryProbe` 不是统一 PluginManager proxy |
| `api-remotes` 统一挂载不是统一业务代理 | 【源码事实】 | imports、`$mount` 与官方业务所有权规则一致 |
| 官方反对把多个领域业务方法并入一个 `ApiProxy` | 【源码事实】 | defensive pattern 明文反例；不等于反对统一 Gateway／Connection／assembly |
| 官方只允许领域包内部 API | **不成立** | 官方也有抽象 seam controller adapter、产品专用 Host service、功能自有 HTTP routes |
| dsh-secretary 应把哪些具体方法放进哪个包 | 【设计推断／待 Lead 决策】 | 取决于领域共享语义、UI 专属编排、跨领域组合与生命周期；本文不代选 |
| 为对齐官方就应复制官方目录名或新建 `api/` 目录 | **不成立** | 官方约束的是 capability ownership、生成契约与装配关系，不要求名为 `api/` 的目录 |

## 10. Lead 可引用的简短结论

> DSH 官方采用“**能力拥有方定义自己的 Host Remote／Fetch 接口，应用层统一选择、挂载与传输**”，而不是“一个统一业务 API 代理”。Schedules 与 Plugin Manager 都把 API 方法留在各自 Host service，浏览器只经 `ctx.remote.<namespace>` 消费；main/right 是展示层差异，不要求各建 API adapter。官方也允许抽象 seam 的独立 controller adapter、产品交付包携带专用 Host 能力，以及功能自有的 HTTP routes，因此本项目真正需要划分的是“领域共享能力 vs 产品专属编排”，不是机械选择某个目录。把多个领域业务方法合并进单一 `ApiProxy` 与官方明文反例一致；至于 dsh-secretary 采用领域包 API、产品交付 API 或局部组合，本文保留给 Lead 决策。
