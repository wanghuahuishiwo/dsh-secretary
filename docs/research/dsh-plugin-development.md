# DSH 开发流程与插件体系调研

- 调研日期：2026-11-04（Asia/Shanghai）。
- 研究问题：插件注册与依赖启动、`cordis.patch.yml` 多插件装配、Host／Web Client 关系、build／watch／HMR／测试流程，以及这些机制对“先设计目标分层，再用一条 tracer bullet（纵切验证）落地”的约束。
- 资料边界：只使用本机 DSH 安装包、官方源码 checkout、官方类型声明、官方文档和本机插件模板；不使用第三方教程或二手解读。没有启动、重启或重载宿主，没有修改被研究仓库的代码。
- 证据标记：**【官方事实】**来自上述第一方资料；**【设计推断】**是本文对 dsh-secretary 落地方式的约束，不是 DSH 官方要求。

## 1. 结论先行

1. **插件注册有两层**：`ctx.plugin()` 是程序化挂载；installable bundle 则通过 `dsh.bundle.patch` 指向 patch 文件，再由 Loader 按 `name` import 模块并创建 Fiber。插件可以是函数、`{ apply }` 对象或类；`inject` 声明的是 **Cordis 服务名**，不是 npm 包名。
2. **启动顺序由服务可用性驱动，不由 YAML 行序驱动**。消费方在必需服务未 ACTIVE 时保持 PENDING；提供方激活后通知消费方，提供方消失或替换会触发消费方卸载／重载。把行写在后面不能代替 `inject`。
3. **bundle 的层顺序与插件启动顺序是两件事**。`dsh.profile.bundles` 的顺序决定 patch 覆盖优先级；patch 的 `insert` 决定有哪些 Loader 行。bundle 的 npm `dependencies`／`peerDependencies`／`optionalDependencies` 决定代码能否被解析，不会自动激活其中的插件。
4. **Host 与 Web Client 使用相同的 Cordis 生命周期机制，但运行在不同 Context、不同 Loader、不同进程中**。`dsh.client.inject` 不是 Host `inject`，也不代替浏览器入口自己的 Cordis `inject`；它写包名，属于 Client 启动图元数据。真正的 Client 服务等待仍由浏览器插件入口导出的 `inject: ['slots', ...]` 完成。
5. **开发命令必须按仓库范围区分**：官方插件模板提供 `build`／`test`，没有现成 watch 脚本；官方 Harness 仓提供 `pnpm run dev:web`，但其 watcher 发现范围是该仓自己的 `packages/*/*`。外部 linked 插件需要自己的构建 watcher，不能把官方仓的命令当成任意插件仓的现成命令。
6. **tracer bullet 必须纵切到真实运行入口**：至少覆盖“构建产物 → bundle patch → Host 服务依赖 → 显式 Host/Client 通信（如需要）→ Client manifest 与 `./client` → 浏览器服务／Slot 注册 → 真实组合测试”。只验证某个类、只跑 `ctx.plugin()` 或只看到 HMR 页面变化，都不足以证明 installable bundle 已贯通。

## 2. 快照与证据范围

| 快照 | 标识 | 状态与用途 |
|---|---|---|
| 当前 Desktop 运行包 | `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh`，DSH **0.2.1-rc.5**，Cordis **4.0.5** | 本机实际运行机制的优先证据；版本见 [runtime package.json:2-13](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/package.json#L2-L13>)。 |
| 官方 Harness 源码 checkout | `/Users/wanghuahui/workspace/deepseek-harness`，`master`，commit **fcc0ad4621**，包版本 **0.2.2-rc.1**（tag 后 811 个提交） | 用于阅读未打包的 TypeScript 源码、测试与开发文档；版本和命令见 [package.json:1-29](/Users/wanghuahui/workspace/deepseek-harness/package.json#L1-L29)。该 checkout 比当前运行包新，不能把仅在新快照出现的细节倒推给 rc.5，也不要求桌面端跟踪 master。 |
| 本机插件模板 checkout | `/Users/wanghuahui/workspace/dsh-plugin-template`，`master`，commit **e89f882b3ca18ca3bcba5d32d46d15f9b0e5080b** | 用于确认树外插件的实际脚手架命令与产物格式。该本地仓没有配置 Git remote；本文只陈述这个快照，不声称它等于线上最新模板。 |

官方将 DeepSeek Harness 定位为开源 **agent harness（智能体框架）**，采用“一切皆插件”的 Cordis 架构，并明确标注仍处于快速迭代的开发者预览阶段，见 [官方 README:5-15](/Users/wanghuahui/workspace/deepseek-harness/README.zh.md#L5-L15)。本轮主要研究 Agent Runtime 产品的宿主扩展机制，次要关注其开发基础设施；不展开模型路由或 Agent Loop。

调研时 Harness checkout 已有未跟踪的 `.notes/`、`.playwright-cli/`，模板 checkout 无 `git status --porcelain` 输出。`dsh --version` 实际输出 `0.2.1-rc.5`；`dsh --help` 显示 `--dump-config`、`--dump-config-schema` 和插件管理入口。本报告的行号以这些快照为准。

`app.asar` 不是普通目录。本次只用 Electron 的 `ELECTRON_RUN_AS_NODE=1` 读取归档，并把所选文件逐字镜像到 `/tmp/dsh-research-0.2.1-rc.5` 供只读检索；下文引用仍指向归档内的原始绝对路径与相同行号。临时镜像不是另一份权威源码。

## 3. 插件怎样注册、声明依赖并按依赖启动

### 3.1 模块入口与 Loader 行是不同对象

**【官方事实】**DSH 教程把插件定义为导出 `apply` 的模块，框架调用 `apply(ctx)`；函数、对象和类三种形态都受支持。官方示例和类型定义分别见 [第一个插件:15-29、105-138](/Users/wanghuahui/workspace/deepseek-harness/docs/user/develop/basic/index.zh.md#L15-L138) 与 [Cordis registry.ts:91-133](/Users/wanghuahui/workspace/deepseek-harness/vendor/cordis/src/registry.ts#L91-L133)。

程序化挂载使用 `ctx.plugin(plugin, config)`；配置驱动挂载则写一个 Loader 行：

```yaml
- insert:
    - id: hello
      name: dsh-hello-plugin
      # config: ...
```

这里：

- `name` 是供 Loader import 的模块说明符；
- `id` 是该配置行的身份，供后续 patch 定位；
- `id` 不是 Cordis 服务名，也不会自动成为 `ctx.<id>`；
- Loader import 后经由 `unwrapExports()` 归一化 ESM／CJS default export，再调用 `ctx.registry.plugin()` 创建 Fiber。实现见 [loader entry:437-465](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js#L437-L465>) 与 [loader export 归一化:666-672](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js#L666-L672>)。

### 3.2 `inject` 是服务就绪门槛

**【官方事实】**最常见的声明是具名导出数组：

```ts
export const inject = ['tools', 'myCap']

export function apply(ctx: Context) {
  // 此处 tools 与 myCap 已就绪。
}
```

类插件使用 `static inject`，对象插件把 `inject` 放在对象上；底层也支持 `@Inject` decorator 和对象形式的 intercept config。官方服务教程见 [service.zh.md:19-63](/Users/wanghuahui/workspace/deepseek-harness/docs/user/develop/framework/service.zh.md#L19-L63)，类型与 decorator 见 [registry.ts:12-110](/Users/wanghuahui/workspace/deepseek-harness/vendor/cordis/src/registry.ts#L12-L110)。

Loader 行也可写 `inject: [serviceName]`；Loader 在创建 Fiber 时把 entry 级依赖合并进插件自身声明，见 [loader internal/plugin hook:628-632](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js#L628-L632>)。这不改变依赖值仍是**服务名**这一事实。

要提供服务时，插件通过 `Service` 构造器的 `super(ctx, 'serviceName')` 注册，或使用 `ctx.provide()`。服务注册由拥有它的 Fiber 管理生命周期，见 [service.ts:29-58](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/cordis/src/service.ts#L29-L58>)。如果能力只是可选，官方建议省略 `inject`，在使用点用 `ctx.get()` 查询；这种方式没有“等待必需服务”的语义，见 [service.zh.md:87-109](/Users/wanghuahui/workspace/deepseek-harness/docs/user/develop/framework/service.zh.md#L87-L109)。

### 3.3 实际顺序是“等待—通知—激活”，不是按行排序执行

**【官方事实】**官方 base patch 直接注明：“Row order carries no load semantics”，行分组只供阅读，见 [base/cordis.patch.yml:12-15](/Users/wanghuahui/workspace/deepseek-harness/packages/bundle/base/cordis.patch.yml#L12-L15)。Loader 的 `EntryGroup.update()` 对各行执行 `Promise.all`，也不是逐行串行启动，见 [group.ts:48-65](/Users/wanghuahui/workspace/deepseek-harness/vendor/loader/src/config/group.ts#L48-L65)。

运行过程是：

1. Fiber 检查每个必需服务是否有处于 ACTIVE 状态的实现；缺任一项就保持非活动状态。[fiber.ts:597-638](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/cordis/src/fiber.ts#L597-L638>)
2. 依赖齐备后，Fiber 进入 LOADING，执行插件并等待其启动结果，然后才转为 ACTIVE。[fiber.ts:646-673](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/cordis/src/fiber.ts#L646-L673>)
3. 服务注册、移除或提供方 ACTIVE 状态变化时，`reflect.notify()` 重新检查所有声明了该服务的 Fiber。[reflect.ts:267-335](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/cordis/src/reflect.ts#L267-L335>)
4. 必需服务消失时，消费方卸载；服务恢复时重新加载。官方生命周期说明见 [framework/index.zh.md:26-63](/Users/wanghuahui/workspace/deepseek-harness/docs/user/develop/framework/index.zh.md#L26-L63)。

因此，“按依赖序启动”的准确含义是：**一个插件只在其服务依赖可用后激活**。它不是预先把 YAML 转成一张固定执行序列；运行期服务替换还会继续驱动后续重载。

## 4. 一个 installable bundle 怎样装配多个插件

### 4.1 `dsh.bundle.patch` 提供配置层，profile 决定层的先后

**【官方事实】**最小 manifest 是：

```json
{
  "name": "dsh-hello-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "files": ["lib/index.js", "cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`patch` 也可以是有序文件列表；同一 bundle 的多个文件按声明顺序应用，路径均相对包根。类型定义见 [package-manifest/types.ts:70-84](/Users/wanghuahui/workspace/deepseek-harness/packages/util/package-manifest/src/types.ts#L70-L84)，官方安装教程见 [publish.zh.md:18-66](/Users/wanghuahui/workspace/deepseek-harness/docs/user/develop/basic/publish.zh.md#L18-L66)。当前 Desktop 的 `dsh-web-app` 就使用一个主 patch 加多个 preset patch 的有序列表，见 [web-app/package.json:46-55](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-web-app/package.json#L46-L55>)。

profile 从空 entry list 开始，依次应用：

1. `dsh.profile.bundles` 中各 bundle 的 patch，按列表顺序；
2. profile 自己的 `cordis.patch.yml`；
3. home 级 `$DSH_HOME/cordis.patch.yml`；
4. 调用命令中的 `--patch`，按 argv 顺序。

官方来源：[publish.zh.md:120-136](/Users/wanghuahui/workspace/deepseek-harness/docs/user/develop/basic/publish.zh.md#L120-L136)。这里决定的是**配置覆盖顺序**。按 `id` 命中的 patch 会替换目标行的整个 `config`，不是深合并；`insert` 才增加行。实现见 [include applyEntryPatches:42-105](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/cordis-plugin-include/lib/index.js#L42-L105>)。

### 4.2 一个 patch 可以挂载任意多行，但每个包仍需可解析

当前运行包内的官方 `dsh-experimental-cot-translation-bundle` 是一个直接例子：

```yaml
- insert:
    - id: translator
      name: '@deepseek-ai/dsh-experimental-translator'
    - id: cot-translation
      name: '@deepseek-ai/dsh-experimental-client-ui-cot-translation'
      config:
        provider: bing
        targetLanguage: auto
```

证据：[cot-translation-bundle/cordis.patch.yml:1-8](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-experimental-cot-translation-bundle/cordis.patch.yml#L1-L8>)。其 bundle manifest 把这两个行对应的包放进 `dependencies`，同时声明 `dsh.bundle.patch`，见 [bundle package.json:27-50](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-experimental-cot-translation-bundle/package.json#L27-L50>)。

另一个官方例子用 `cordis:group` 把终端服务提供方与工具消费方放进同一组，并用 `isolate.terminals` 限定服务实例；见 [terminal-bundle/cordis.patch.yml:1-19](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-experimental-terminal-bundle/cordis.patch.yml#L1-L19>)。这说明 group 可以管理服务作用域，但组内行序仍不是启动依赖声明。

### 4.3 插件包之间有四种关系，不能合并成一张含糊的“依赖图”

| 关系 | 写在哪里、写什么 | 解决的问题 | 不解决什么 |
|---|---|---|---|
| npm 安装／解析关系 | `dependencies`、`peerDependencies`、`optionalDependencies` 中的包名与范围 | 构建时 import 和运行时模块能否解析、由哪个包副本提供 | 不自动挂载插件，不决定服务何时 ACTIVE |
| Host／Client Cordis 服务依赖 | 插件入口或 Loader 行的 `inject`，写服务名 | Fiber 等待服务，服务变化时级联卸载／重载 | 不安装 npm 包，不表达模块加载顺序 |
| Client 包级启动图关系 | `dsh.client.inject`，写包名 | Client 图元数据，以及对应 package factory 先于消费方到达 | 不注入 Cordis 服务，不决定 `apply` 顺序 |
| Client 模块请求关系 | `dsh.client.external`，写非 baseline 的精确模块说明符 | 让动态模块提供方先于消费方物化，并检查缺失、自引用与同步环 | 不表达可替换服务，不提供 DI |

**【官方事实】**启动器会从安装包和已选 bundle 的 manifest 出发，广度优先遍历 `dependencies`、`peerDependencies` 与 `optionalDependencies`，构造 runtime resolution；见 [profile.ts:306-368、487-539](/Users/wanghuahui/workspace/deepseek-harness/packages/boot/app-boot/src/profile.ts#L306-L539)。对应测试断言 app／bundle 的传递依赖被收集，而且不向 profile 写 fallback 包，见 [profile.spec.ts:505-525](/Users/wanghuahui/workspace/deepseek-harness/packages/boot/app-boot/tests/profile.spec.ts#L505-L525)。

没有 `dsh.bundle` 的包可以只作为普通依赖存在，不会因此贡献激活层；官方明确把这种形式用于供插件 import 的库，见 [publish.zh.md:56-66](/Users/wanghuahui/workspace/deepseek-harness/docs/user/develop/basic/publish.zh.md#L56-L66)。所以 **“A 依赖 B”不等于“安装 A 后 B 的插件自动运行”**；仍需某一层 patch 用 `name` 挂载 B 的插件入口。

对于必须与宿主共享实例的 DSH 包，官方安装教程要求同时声明 `peerDependencies` 和 `devDependencies`：前者让运行时使用安装中的副本，后者供类型检查与独立测试；普通第三方运行依赖放 `dependencies`。见 [publish.zh.md:79-109](/Users/wanghuahui/workspace/deepseek-harness/docs/user/develop/basic/publish.zh.md#L79-L109)。

## 5. Host 插件与 Web Client 半边是什么关系

### 5.1 一份 Host Loader 行可以成为 Client 包的发现入口

**【官方事实】**典型的 dual-face（双端）包具有：

- 包根 `.`：Host Loader 导入的 Node 入口；
- `./client`：已构建的浏览器 bundle；
- `dsh.client.platform: 'web'`：让 Host 的 `clientModules` 半侧识别它。

Host 的 `clientModules` 扫描已启用 Loader 条目，读取 manifest，要求 `./client` 导出存在，再生成 `window.__DSH_BOOT__` 图并通过 `/plugins` 或壳载体提供 bundle。官方说明见 [client-modules README:32-55](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-client-modules/README.zh.md#L32-L55>)，实现见 [client-modules resolveMeta:720-749](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-client-modules/lib/index.js#L720-L749>)。

浏览器随后创建自己的 `Context`，把自己的 Loader 接到 Client module system，再按图创建条目并等待激活。[web boot.ts:71-99](/Users/wanghuahui/workspace/deepseek-harness/packages/client/web/src/boot.ts#L71-L99)、[boot-client.ts:27-57](/Users/wanghuahui/workspace/deepseek-harness/packages/client/web/src/boot-client.ts#L27-L57)。因此两侧共享 Cordis 编程模型，但**不是共享同一个 `ctx` 或服务对象图**。

Host 与 Client 的业务通信必须显式设计。Remote 路径要求 Host 方法用 `@Remote`／`@RemoteScope` 选择暴露，Client 通过 `ctx.remote` 调用，并由 `dsh-api-remotes` 显式装配所选贡献；见 [api-gateway.zh.md:9-19、64-84](/Users/wanghuahui/workspace/deepseek-harness/docs/api-gateway.zh.md#L9-L84)。普通 HTTP route 也是一种独立路径，不能假设 Host 服务天然可从浏览器直接读取。

### 5.2 `dsh.client.inject` 与宿主 `inject` 不是同一套

最明确的官方类型注释直接写明：`DshClientManifest.inject` 是“Informational package-name dependencies, not Cordis service injection”，见 [package-manifest/types.ts:86-100](/Users/wanghuahui/workspace/deepseek-harness/packages/util/package-manifest/src/types.ts#L86-L100)。当前官方 Client 规范进一步限定：它不排列 entry activation 或 `apply` 顺序；真正的激活顺序只来自 Cordis 对**服务**的等待。[packages/client/AGENTS.md:90-103、143-151](/Users/wanghuahui/workspace/deepseek-harness/packages/client/AGENTS.md#L90-L151)。

但不能把 informational 误写成“完全没有运行效果”：Client module system 会用这些包边提前注册对应 factory；当前实现见 [client system.ts:253-280](/Users/wanghuahui/workspace/deepseek-harness/packages/client/modules/src/client/system.ts#L253-L280)，当前 rc.5 也有相同路径，见 [归档内 client.js:776-794](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-client-modules/lib/client.js#L776-L794>)。准确结论是：**它影响代码到达，不提供服务注入，不保证 `apply` 顺序。**

同一个官方 `ui-open-in-app` 包同时展示了两种写法：

- `package.json` 的 `dsh.client.inject` 列出一串 **包名**；[package.json:40-59](/Users/wanghuahui/workspace/deepseek-harness/packages/client/ui-open-in-app/package.json#L40-L59)
- `src/client/index.ts` 另行导出 `inject = ['contextMenus', 'slots', 'remote', ...]`，列出一串 **Client 服务名**，然后 `apply(ctx)` 才读取它们。[src/client/index.ts:49-61](/Users/wanghuahui/workspace/deepseek-harness/packages/client/ui-open-in-app/src/client/index.ts#L49-L61)

`dsh.client.external` 又是第三种东西：它声明 baseline 之外的精确模块 import。Host 按这些模块边做拓扑排序，动态提供方先于消费方；同步环会被拒绝。实现和测试见 [client-modules index.ts:551-580](/Users/wanghuahui/workspace/deepseek-harness/packages/client/modules/src/index.ts#L551-L580) 与 [node-half.client.spec.ts:1328-1390](/Users/wanghuahui/workspace/deepseek-harness/packages/client/modules/tests/node-half.client.spec.ts#L1328-L1390)。

如果业务贡献依赖的是一个 Slot 的**声明**，而不是服务，官方要求用 `ctx.slots.inject(name, ...)` 等声明级机制，不要借助 `dsh.client.inject` 赌注册顺序；见 [Client 新包清单:149-150](/Users/wanghuahui/workspace/deepseek-harness/packages/client/AGENTS.md#L149-L150) 和 [ui-workspace 的实际注释:95-105](/Users/wanghuahui/workspace/deepseek-harness/packages/client/ui-workspace/src/client/index.ts#L95-L105)。

### 5.3 左侧栏入口与独立主区页面

**【官方事实】**左栏产品入口与主区页面是两个 Slot 贡献，不是右栏 tab 的变体：

- `sidebar.panellist` 注册左栏入口，元数据包含稳定 `id`、`label`、`order` 和图标组件；宿主点击后调用 `layout.selectPanel(id)`。[SidebarRoot.tsx:54-93](/Users/wanghuahui/workspace/deepseek-harness/packages/client/ui-sidebar/src/client/SidebarRoot.tsx#L54-L93)
- `main` 以相同 panel id 作为 `key` 注册独立页面。官方 Schedule 同时展示这两个注册：[ui-schedule/client/index.ts:216-243](/Users/wanghuahui/workspace/deepseek-harness/packages/client/ui-schedule/src/client/index.ts#L216-L243)。
- 页面内部的二级导航由页面自己的 navigation store 管理；Plugin Manager 在 `main` 注册中提供 `store`，并在 panel 失活时重置视图，而不是另起一个 HTTP page route。[ui-plugin-manager/client/index.ts:129-163](/Users/wanghuahui/workspace/deepseek-harness/packages/client/ui-plugin-manager/src/client/index.ts#L129-L163)
- `ctx.layout.selectPanel(null)` 返回 Conversation；选择已注册 panel 不会更换当前 Session。[layout/service.ts:18-36、71-78](/Users/wanghuahui/workspace/deepseek-harness/packages/client/ui-layout/src/client/service.ts#L18-L78)。主区只切换 keyed `main` outlet，[AppFrame.tsx:45-50](/Users/wanghuahui/workspace/deepseek-harness/packages/client/ui-layout/src/client/AppFrame.tsx#L45-L50)；右栏仅在没有全局 panel 时可见，[RightbarRoot.tsx:29-37](/Users/wanghuahui/workspace/deepseek-harness/packages/client/ui-sidebar-right/src/client/shell/RightbarRoot.tsx#L29-L37)。因此事项的 `main` 页面不与时间块右栏同时挤压显示。

因此“小秘书-事项”的左栏入口应使用 `sidebar.panellist` + `main`，不存在需要套用的 `sidebarLeftTabs`。同一 Client bundle 可以同时贡献左、右入口，但是否为独立产品取决于根组件、Host adapter、数据读取和生命周期是否解耦，而不是 npm 包数量。后半句是【设计推断】，具体拆分见 [ADR 0007](../adr/0007-independent-product-entry-points.md)。

## 6. 官方推荐与实际可用的开发流程

### 6.1 Build：先明确自己位于模板、外部仓还是 Harness 源码仓

| 范围 | 官方事实与命令 | 关键限制 |
|---|---|---|
| 本机 `dsh-plugin-template` 的 host 变体 | `pnpm build` → `node build.mjs`；esbuild 产出 ESM `lib/index.js`，`@deepseek-ai/*` 等保持 external。[package.json:24-31](/Users/wanghuahui/workspace/dsh-plugin-template/templates/host/package.json#L24-L31)、[build.mjs:1-19](/Users/wanghuahui/workspace/dsh-plugin-template/templates/host/build.mjs#L1-L19) | 模板没有 `dev` 或 `watch` script。 |
| 模板的 host-client 变体 | 同一 build 分别产出 Host ESM `lib/index.js` 与浏览器 closure-factory `lib/client.js`，后者调用 `window.__ModuleLoader__.load`。[build.mjs:1-18、34-75](/Users/wanghuahui/workspace/dsh-plugin-template/templates/host-client/build.mjs#L1-L75) | manifest 必须同时声明 `dsh.bundle`、`dsh.client` 并导出 `./client`。[package.json:8-36](/Users/wanghuahui/workspace/dsh-plugin-template/templates/host-client/package.json#L8-L36) |
| 外部本地目录安装 | 模板约定先 `pnpm build` 再安装；`link:` 安装不执行包内 `prepare`。[plugin-conventions.md:36-40](/Users/wanghuahui/workspace/dsh-plugin-template/docs/plugin-conventions.md#L36-L40) | 改源码不等于改运行代码，必须重建实际入口。 |
| 官方 Harness 源码仓 | 全新 checkout 或需要更新产物时先 `pnpm run build`；`pnpm dsh ...` 只启动 TypeScript 入口，不代替构建。[CLI reference:145-148](/Users/wanghuahui/workspace/deepseek-harness/apps/cli/reference/README.zh.md#L145-L148) | Host、Client 和 Web 各有构建产物；陈旧产物不会被启动器自动判新。 |

对于 git 安装，官方教程要求作者提供自包含的 `prepare`，用户显式允许构建脚本；npm 发布包和 `pnpm pack` tarball 则应直接分发构建产物。[publish.zh.md:161-186](/Users/wanghuahui/workspace/deepseek-harness/docs/user/develop/basic/publish.zh.md#L161-L186)。这与本地 `link:` 的约定不能混为一谈。

### 6.2 Watch 与 HMR：三条链路分别核对

#### A. 官方 Harness 仓的完整 Web 内环

**【官方事实】**`pnpm run dev:web` 先做 `build:artifacts`，然后运行三个长期 watcher：Client `tsc -b --watch`、tsdown bundle watch、`vite build --watch`，最后启动源码 `dsh web`。任何一个 watcher 缺失都会让页面继续显示旧产物，因此脚本会让异常退出的 stage 停止整个内环。[scripts/dev-web.ts:1-30](/Users/wanghuahui/workspace/deepseek-harness/scripts/dev-web.ts#L1-L30)、[实际 stage 启动:394-433](/Users/wanghuahui/workspace/deepseek-harness/scripts/dev-web.ts#L394-L433)。

它的插件发现只 glob 当前 Harness 仓的 `packages/*/*/package.json` 并筛选 `dsh.client.platform === 'web'`；运行期间新增包还要重启该脚本。[dev-web.ts:126-143](/Users/wanghuahui/workspace/deepseek-harness/scripts/dev-web.ts#L126-L143)。**所以它不是外部插件仓的通用 watch 命令。**

`--no-serve` 可只保留 watchers，配合别处已经启动的 `dsh web`；共享 Client tsdown preset 的 watch 重写 `lib/client.js` 即可驱动重载。[client-hmr README:25-48](/Users/wanghuahui/workspace/deepseek-harness/packages/client/hmr/README.zh.md#L25-L48)。但 `apps/web` 的裸 Vite server 不是独立 DSH 应用：官方配置明确拒绝 standalone serve，因为只有 `dsh web` 注入 `window.__DSH_BOOT__`。[vite.config.ts:11-14、47-53](/Users/wanghuahui/workspace/deepseek-harness/apps/web/vite.config.ts#L11-L53)。

#### B. 外部 linked 插件的 Host 代码

当前 base 默认启用 `dsh-hmr`，但 `root: []`，即只保留显式配置监听，不默认扫描模块源码。[base/cordis.patch.yml:27-32](/Users/wanghuahui/workspace/deepseek-harness/packages/bundle/base/cordis.patch.yml#L27-L32)。

两条实际机制需要分开：

- 配置 HMR 会监听 profile manifest、profile patch 和 home patch，并重新组合；
- 重新组合还会比较 profile 及 linked 包目标中已经加载的模块文件，因此重建后的 linked Host 插件可在下一次 profile 重新组合时替换，不要求 `root` 已监听源码。[dsh-hmr README:27-50](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-hmr/README.zh.md#L27-L50>)

如果希望文件变化本身直接触发模块替换，才需要另行配置 HMR `root`／`base`；其 `root` 相对 `base`，实现见 [hmr index.ts:307-315、410-434](/Users/wanghuahui/workspace/deepseek-harness/packages/boot/hmr/src/index.ts#L307-L434)。HMR 有明确边界：宿主自身静态依赖、Worker、动态 import 和未被 Loader 管理的插件可能需要重启或不完整替换；不能把它当作无条件保证。[dsh-hmr 限制:104-123](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-hmr/README.zh.md#L104-L123>)

#### C. 外部 linked 插件的浏览器代码

Web 组合始终挂载 `client-hmr` 行；它默认每 500 ms stat-poll 当前图中的 `lib/client.js`，文件元数据变化后通过 `clientModules.rebuilt()` 和 `/plugins/events` 投递。[web-app/cordis.patch.yml:214-220](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-web-app/cordis.patch.yml#L214-L220>)、[client-hmr/lib/index.js:9-22、40-115](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-client-hmr/lib/index.js#L9-L115>)。

这使“外部插件自己的 watcher 重写构建产物”成为可用的底层链路，但仍有三个限制：

- 它只看见已构建的 bundle，不直接编译 TS／TSX；
- 重载会重新执行插件并重建组件状态，不是保留组件状态的 React Refresh；
- 下载失败可保留旧实例，但旧 Fiber 卸载后若 import／activation 失败，不会自动回滚旧 bundle。[client-hmr README:34-48、109-118](</Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-client-hmr/README.zh.md#L34-L118>)

Desktop 文档确认它复用完整 Web 应用，并转发应用 HTTP 请求；开发菜单的“刷新页面”和“重启应用与 Host”都不负责构建。[Desktop README:38-40、184-206](/Users/wanghuahui/workspace/deepseek-harness/apps/desktop/README.zh.md#L38-L206)。本轮按只读要求未实测当前 Desktop 对外部 link 包的无刷新替换，因此不把这条链路写成已经验收的本机事实。

### 6.3 测试：快速契约测试不能替代真实组合

**【官方事实】**模板的 `pnpm test` 用 plain Node 对已构建的 `lib/index.js` 跑 `node:test`；当前脚手架只含“模块可加载”的占位契约，需要随真实行为补充。[模板 package.json:24-28](/Users/wanghuahui/workspace/dsh-plugin-template/templates/host/package.json#L24-L28)、[contracts.mjs:1-11](/Users/wanghuahui/workspace/dsh-plugin-template/templates/host/tests/contracts.mjs#L1-L11)。

官方仓的完整测试层包括 Vitest 单元测试、构建产物／预期输出、真实 API e2e、Session 快照与 Web 浏览器快照；命令与边界见 [testing.zh.md:7-21](/Users/wanghuahui/workspace/deepseek-harness/docs/testing.zh.md#L7-L21)。与插件最相关的一条硬约束是：**产品可见插件必须有非单元的真实组合测试；只手工 `ctx.plugin(...)` 不够。**测试应经 Loader 和 app/process 启动测试专用组合，只 mock 外部或非确定性边界，并断言外部可观察结果。[testing.zh.md:33-45](/Users/wanghuahui/workspace/deepseek-harness/docs/testing.zh.md#L33-L45)。

配置检查可作为前置门禁而非运行验收：`dsh --profile <name> --dump-config` 不启动应用，可检查层组合、来源和未匹配 patch；表达式保持未求值。[CLI reference:48-55](/Users/wanghuahui/workspace/deepseek-harness/apps/cli/reference/README.zh.md#L48-L55)。schema dump 也不保证启动成功，且会 import 可信模块；不应用于不受信任的插件。[CLI reference:57-70](/Users/wanghuahui/workspace/deepseek-harness/apps/cli/reference/README.zh.md#L57-L70)。这些 dump 模式拒绝保留的 `desktop` profile，不能据此宣称已对当前 Desktop 做过离线组合检查。

本轮没有运行构建或测试：它们会改写产物或临时状态，而用户要求只读调研；上述测试结论均来自官方源码与文档，不是新增运行证据。

## 7. 对“目标分层 + 一条 tracer bullet 纵切”的约束

本节全部为**【设计推断】**，依据是前述已确认机制。

### 7.1 目标分层必须画清四种依赖，而不是只画目录层次

建议目标设计至少固定以下契约：

| 目标层 | 必须明确的契约 | 纵切时不能缺少的验证点 |
|---|---|---|
| 分发与安装 | 哪个包是 installable bundle；`dsh.bundle.patch`、`files`、`engines.dsh`、npm 依赖各是什么 | 从构建后的包目录安装，patch 中每个 `name` 都能解析到实际产物 |
| 配置组合 | 每行稳定 `id`、模块 `name`、完整 Config；bundle 层与用户覆盖层的先后 | dump 或真实 Loader 显示目标行存在，配置没有被后层意外整对象替换 |
| Host 能力 | Service Definition、Provider、Consumer 的归属；`ctx` 服务 key；每个 Consumer 的 `inject` | 缺 Provider 时 Consumer 不执行；Provider 就绪后执行；卸载后贡献被清理 |
| Host ↔ Client 边界 | 是 Remote、普通 route，还是无需通信；需要哪些显式装配 | 从浏览器真实调用到 Host 方法／route，而不是在测试中共享一个内存对象冒充跨端 |
| Client 代码到达 | `./client` 构建产物、`dsh.client.platform`、必要的 `external` 与包级元数据 | 浏览器能取得并物化目标 bundle；缺失 external 和同步环不被隐藏 |
| Client 行为与展示 | 浏览器入口自己的 Cordis `inject`；Slot 声明等待用 `slots.inject` | 真实浏览器组合中服务 ACTIVE、Slot 贡献出现，卸载后消失 |
| 生命周期与验证 | 所有注册可逆；测试覆盖构建产物、真实 Loader／浏览器组合和冷启动 | 不把 HMR 成功当作唯一验收；保留一次干净启动与外部状态检查 |

这张表的重点不是强制拆成多个 npm 包，而是防止把不同机制都压成“上层依赖下层”。官方同样建议：Service Definition／Provider／Consumer 只有在角色需要独立演进或替换时才分包，单用途插件保持一个包；Provider 与 Consumer 只共同依赖 Definition，互不依赖。[practice/index.zh.md:7-10、44-56、147-151](/Users/wanghuahui/workspace/deepseek-harness/docs/user/develop/practice/index.zh.md#L7-L151)。本机模板也把“默认单包、出现独立演化／第二消费者再拆”写成生长约束，见 [large-plugin-structure.md:1-5、42-81](/Users/wanghuahui/workspace/dsh-plugin-template/docs/large-plugin-structure.md#L1-L81)。

### 7.2 一条 tracer bullet 应选择一个小结果，但必须经过完整交付路径

推荐顺序是：

1. **先选一个可观察结果**：例如一个 Host 操作驱动一个最小 Client 控件，而不是先建完全部领域层。
2. **先写目标契约图**：列出包名、patch row id、Host 服务 key、Remote／route 名称、Client 包依赖和浏览器服务／Slot 名称。每个名字注明属于哪一种依赖，禁止只画箭头不写协议。
3. **用最少代码贯通全部注册面**：bundle manifest、patch、Host 入口、必要的跨端接口、Client manifest、`./client`、浏览器入口 `inject` 和实际 UI 注册一次完成；不要先在不同层各写一批不能共同运行的代码。
4. **从真实产物验证**：先 build，再跑 built-lib 契约；随后跑真实 Loader／profile 组合和浏览器路径。测试要断言用户或外部系统可见结果，不能只断言插件自报“ready”。
5. **专门验证依赖与清理**：至少覆盖一次 Provider 晚就绪、一次 Provider／Consumer dispose；有 Client 时再覆盖浏览器插件移除后的贡献清理。否则 `inject` 写错、行序假设和资源泄漏都可能被 happy path 掩盖。
6. **保留冷启动验收**：HMR 只缩短迭代，不证明全新安装可用。尤其在粗粒度 Client 重载、Host 替换边界和失败不回滚机制下，tracer 必须通过一次全新组合／启动，再进入连续 watch 开发。
7. **纵切通过后再横向扩展**：新增领域能力复用已验证的注册路径；只有当角色确实要独立演化时才增加包边界，避免 tracer 尚未跑通就先承担多包解析、watch 和传播重载的复杂度。

### 7.3 对 tracer 范围的硬约束

以下做法都不能算“纵切已完成”：

- 只有 `package.json` 和 patch，没有从安装后的包名完成 import；
- 只有 Host 单元测试，未证明 Consumer 的真实 `inject` 等待与清理；
- 只有 `dsh.client.inject`，没有浏览器插件自己的服务 `inject`；
- 只有 UI 组件渲染测试，未证明 Host Loader 行能发现并交付 `lib/client.js`；
- 用 shared `ctx` 或内存 stub 代替实际 Host ↔ Client 通信；
- 只改 `src` 看到 watcher 输出，却没有确认运行方消费的是新 `lib`；
- 只在已有页面上看过一次 HMR，未验证冷启动和失败路径；
- 只靠 `ctx.plugin()` 的手工树通过测试，未经过 installable bundle 的 Loader 组合。

这些限制并不要求第一条 tracer 做完整产品；它要求**缩小业务宽度，而不是省略交付机制**。

## 8. 无法确认或本轮刻意不验证的点

1. **当前 Desktop 的实机 HMR 验收未做**。源码和文档确认了 Web／Desktop 共用链路、外部包 watcher 与 Host／Client 两套重载机制，但本轮没有改写 `lib`、触发 profile 重组、刷新页面或观察 SSE，因此不对当前运行中的具体 bundle 作“已无刷新生效”的承诺。
2. **本机源码仓不是当前 Desktop 的同一版本**。运行事实优先引用 `app.asar` 的 0.2.1-rc.5；当前 master 只用于阅读较清晰的源码、类型和流程说明。源码 tag 或 master 不等于桌面端发布通道中的可用更新，升级与兼容判断仍需分别核对。
3. **模板线上新鲜度未核验**。本机模板没有配置 remote，本次网络获取也未成功；结论只绑定上述 commit。网络搜索结果没有用于支撑任何关键结论。
4. **未运行任何构建、测试、安装、dump 或宿主命令**。除 `dsh --version` 与 `dsh --help` 外，本轮只读；所以本文提供的是机制证据与验证方案，不是 dsh-secretary 当前实现的新验收结果。
