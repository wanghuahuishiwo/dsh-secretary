# 独立产品入口与 Typert Remote 重构

Status: active
Tracker: [GitHub Issue #9](https://github.com/wanghuahuishiwo/dsh-secretary/issues/9)

## 问题陈述

当前“小秘书”右栏把 Time、GTD、Tag、Goal 与设置放进同一个产品壳，并通过一对聚合 HTTP routes 和 `domain + op` 命令访问多个领域。即使只改变前端入口，保留这套结构仍会造成：

- Time 与 GTD 的 UI、Host 依赖和生命周期互相牵连。
- Time 的页面手势与 GTD 的领域操作混在一个宽泛命令 union 中。
- 浏览器 DTO 手写且缺少官方 Remote 的类型生成、校验与装配。
- GTD 新页面尚未完成评审，却必须继承旧表单工作区。
- 产品文档存在多个版本，实施者无法稳定判断当前权威。

用户需要两个真正独立的产品交付形态：TimeBlock 留在右栏且功能不变，GTD 从左栏进入独立页面；底层同时按 DSH 官方推荐方式重构，而不是保留旧聚合 API 作为终态。

## 解决方案

交付一个 installable Secretary bundle 中的两条独立产品链路：

1. **小秘书-时间块**拥有独立右栏产品插件，原样保留实录、计划、深度时间的功能与交互。
2. **小秘书-事项**拥有独立左栏入口和空白 `main` 页面，只用于确认入口与页面形式，不提前实现 OmniFocus 内容。
3. Time 产品新增 `TimeProductService`，以自己的 Typert Remote namespace 暴露真实页面能力，并调用现有 TimeService／TagService。
4. Secretary 只负责组合；每个产品在自己的浏览器插件生命周期中挂载和撤销生成的 Remote contribution，不增加中央业务代理或常驻产品 assembly。
5. 旧共享产品壳、聚合 HTTP JSON API 与跨领域命令总线退出。Agent tools 继续直接调用原领域 Services，数据表与事实不变。
6. 文档按单一权威规则维护，本规格是唯一 active 的重构规格。

## 用户故事

1. 作为用户，我希望从右侧“小秘书-时间块”进入实录、计划和深度时间，从而继续以熟悉的方式管理时间。
2. 作为用户，我希望三个 Time 模块的功能和页面交互在重构前后保持一致，从而不需要重新学习产品。
3. 作为用户，我希望从 DSH 左侧全局 panel 区打开“小秘书-事项”，从而明确区分事项与会话、时间块。
4. 作为用户，我希望事项页面当前保持空白，从而先确认左栏入口和独立 `main` 的形式，而不提前接受未评审的 OmniFocus 功能。
5. 作为用户，我希望从事项页面返回 Conversation 后恢复会话及 Time 右栏，从而在不同工作上下文之间自然切换。
6. 作为 Secretary Agent，我希望继续通过现有 GTD、Time、Tag tools 操作同一批事实，从而不因产品 UI 拆分而失去能力或创建另一份数据。
7. 作为用户，我希望 Time 的读取、上色、擦除、编辑、删除和 DeepTime 操作通过官方 Remote 完成，从而获得明确、可校验的调用契约。
8. 作为用户，我希望无效 Remote 输入被清楚拒绝且没有意外写入，从而相信重构后的错误边界。
9. 作为维护者，我希望 Time 与 GTD 产品可以独立装卸，从而一个产品的 UI 或 Remote 生命周期不会拖垮另一个产品。
10. 作为维护者，我希望卸载 Time 产品只移除其 UI 与 Remote 贡献，从而 Agent 仍能使用 TimeService 和 tools。
11. 作为维护者，我希望 Client 类型由 Remote 生成而不是手写两份，从而避免 Host 与浏览器契约漂移。
12. 作为维护者，我希望 Time 的 UI 与 Remote namespace 随同一产品 Fiber 挂载、失败回滚和卸载，从而不会出现产品 UI 已移除但 API 仍残留的半可用状态。
13. 作为维护者，我希望通过一条真实 Remote 调用完成构建、装配、浏览器、Service 与 SQLite 验收，从而证明第三方插件链路真正贯通。
14. 作为维护者，我希望产品文档只有一个当前版本，从而实施时不会误读历史轮次或旧规格。

## 实现决定

### 产品包与入口

- 将现有聚合 panel 重构为 **`dsh-secretary-time-panel`**，新增 **`dsh-secretary-gtd-panel`**；旧 `dsh-secretary-panel` 退出，不保留兼容壳，也不新增中央 `dsh-secretary-remotes`。
- `dsh-secretary-time-panel` 注册独立右栏 tab，标题为“小秘书-时间块”。只保留实录、计划、深度时间及其内部计划模板能力；GTD、Goal、设置等旧抽屉条目不作为 Time 产品功能迁移。
- `dsh-secretary-gtd-panel` 以稳定 panel id 注册 `sidebar.panellist` 和同 id/key 的 `main`，标签为“小秘书-事项”。页面保留 DSH AppFrame，中央内容为空，不放置伪造的 Mac window chrome、OmniFocus 控件、占位卡片或“即将推出”表单。
- 事项页面通过现有 DSH Conversation／workspace 导航返回，不新增 URL Router、iframe、独立 HTML 应用或页面服务器。
- 两个产品根组件不互相 import，也不 import 旧 `SecretaryProduct`。

### Time application service 与 Remote interface

- `dsh-secretary-time-panel` 的 Host 半提供 **`TimeProductService extends TypertRemoteService`**，绑定独立 service key 与 Remote namespace **`secretaryTime`**。
- `TimeProductService` 只依赖 TimeService、TagService 及 Remote 所需宿主能力，不注入 GtdService，不直接访问 SQLite。
- Remote 方法承载当前真实浏览器调用集合，不以旧 `domain + op` 形式暴露通用 CRUD：
  - **`readWindow`**：返回现有 Time 三模块 projection、当前日期窗口与 Tags，不包含 Inbox、Projects、Actions、Next、Forecast 或 GTD warnings。
  - **paint**：保留当前选区切割、覆盖、并行呈现、相邻同形合并及错误语义。
  - **replaceDay**：保留当前整日快照恢复与 Undo 语义。
  - **updateBlock / deleteBlock**：保留 Plan／Actual 的现有编辑和删除行为。
  - **paintDeep**：保留当前 DeepTime 批量矩形设置与清除行为。
- 不为当前浏览器没有调用的 Tag 写入、GTD 写入、开始／停止实录或计划模板操作额外发明 Remote 方法；已有领域能力与 Agent tools 不因未暴露 Remote 而被删除。
- Remote 方法自己执行产品 projection 或应用编排，不建立只转发旧 HTTP handler 的壳。方法参数、返回类型和失败词汇使用官方生成链，失败时不把异常静默吞掉。
- 输入或领域规则拒绝使用 `secretaryTime/invalid-input`；不存在的块使用 `secretaryTime/not-found` 并携带块 ID；持久化或补偿失败使用 `secretaryTime/write-failed`，跨端 details 只携带安全的 operation，原始 cause 与 stack 留在 Host 日志，不承诺 cause 跨 wire。wire 校验、取消和未预期故障沿用 Gateway 内置词汇，不另造同义码。
- 本规格只面向当前本机 owner Peer，不开放跨 Peer 共享或从 wire 参数选择调用方身份。
- `paint/replaceDay` 仍按现有语义执行多次领域调用；本次不宣称获得跨操作事务原子性，也不借重构修改补偿行为。

### Remote 生成与装配

- 仓库增加 `pnpm generate:typert`，通过固定脚本调用官方 `WorkspaceTypertGenerator.generateContributors(['host'])` 与 `writeWorkspaceArtifacts`。脚本从模块位置确定仓库根，不依赖调用时 cwd；官方仓内脚本不是第三方发布 CLI，不复制整套官方根构建。
- 根 Host aggregate TypeScript project 使用空 files 和显式 package references，只纳入当前 Remote 贡献包；共享 base config 使用 strict、composite、Bundler resolution 和指向本 workspace 源码的 paths。Time 的 Host project 排除浏览器代码，Client project 在生成后编译。
- 根构建先执行 `generate:typert`，再构建各包。生成使用默认 diagnostics 并 `rejectBuildOutputs: true`，不读取旧 build output；现有 watch 不会自动感知 Remote 签名变化，签名、namespace、错误词汇或 exports 改变后必须显式重新生成。
- 宿主兼容使用官方 SemVer 模式：Secretary bundle 的 `engines.dsh` 保持 `>=0.2.1-rc.5 <0.3.0`；需要与宿主共享的 protocol 在 peerDependencies 与 devDependencies 中声明兼容范围。Cordis 保持 4.0.5 兼容范围，zod 使用 4.4.3，TypeScript 使用生成器要求的 6.x。
- generator 仅是根开发依赖，兼容范围与受支持 DSH 线一致，由 pnpm lockfile 固定本次实际生成版本；frozen lockfile 保证 CI 可重复。生成产物随插件发布，插件用户不运行 generator。当前真实验收以桌面端 rc.5 为准，宿主在兼容范围内升级后另行执行对应版本验收；发现不兼容时更新插件或收窄 engines，不使用版本豁免。
- 生成器在拥有者包中写出 `typert.host.js/.d.ts` 与 `typert.remote-client.js/.d.ts/.d.ts.map`；前四个发布，map 只用于编辑器导航。`dsh-secretary-time-panel` 按官方约定导出 `./typert`、`./remote`、浏览器安全的 `./types` 和真正的 `./client`，files 清单逐项包含四个发布产物。
- Time 的 client bundle inline 自己生成的 `/remote` 与 `@deepseek-ai/dsh-typert-protocol/remote-info`；DSH 平台实际提供的 React、Cordis、UI 等模块继续 external。不得留下平台无法解析的 `remote-info` require，也不把 `dsh.client.inject` 当成该子模块的自动提供者。
- Host Typert Loader 从已挂载的 Time 产品包注册 `./typert`；Secretary 的 bundle patch 显式挂载 Time 与 GTD 产品，行序不承担启动语义。
- Time 浏览器入口只声明 `remote`，先 `$mount()` 自己生成的 `/remote` contribution，再在 child Context 中等待 `remote.secretaryTime` 并注册 UI。子 UI 激活失败时撤销 child 与 Remote；产品卸载时先清理 UI，再撤销 Remote，随后卸载空 namespace。
- 该 product-local assembly 只选择 Time 自己的贡献并管理生命周期，不包含业务方法、跨产品命令 union 或手写第二份 Client 方法类型。未来常驻共享 API 若确有多个产品消费者，再按其实际 Provider 生命周期单独评审装配归属。
- Time 浏览器业务调用显式经过 `ctx.remote.secretaryTime`。package.json 的 `dsh.client.inject` 只表达包依赖，浏览器入口及 child Context 的 Cordis `inject` 才表达服务等待。
- 常规业务调用不注册新的手写 HTTP JSON routes。exact Fetch 仅保留给未来确有需要的流式或浏览器原生传输，本规格没有此类新 route。

### GTD 空页与领域边界

- GTD 空页不创建 `GtdProductService`、Remote namespace、空 state/command API 或无消费者的 DTO。
- 现有 GtdService、SQLite 表、公共 tools 与 Skills 保持可用；只移除旧浏览器工作区及其聚合 routes。
- Time 与 GTD 仍共同依赖上游 Tag／Goal，彼此不直接依赖。Goal 仍为空 Provider，不新增方法、数据或 UI。
- 不修改现有数据库 schema、表所有权、ID、日期、Tags 继承或 Planned／Actual／Completed 语义，不增加数据迁移层。

### 文档与导航

- 产品行为只维护 `prd`，技术结构只维护 `architecture`，事实与不变式只维护 `data-model` 和 `glossary`，真实结果只维护 `verification`。
- 包 README 只记录包级入口、exports、Config、所有权与限制，不复制一套产品需求。
- 本规格原地更新；后续变化同步同一 Issue。完成后把持续规则合并回 living docs，不创建日期版或 v2 规格。

## 测试决定

### 唯一高层 seam

采用一个完整产品 seam：

**Remote 生成产物 → Host Typert 注册／Gateway → Client Remote assembly → 真实浏览器 → TimeProductService → TimeService／TagService → 真实临时 SQLite。**

优先扩展现有 Secretary tracer 与真实 `dsh web`＋Chromium 验收入口。UI 与 Agent tools 仍通过同一领域 Services 读写事实；测试不共享一个伪造的 Host／Client Context，不用静态原型、内存 stub 或 scripted adapter 代替 Remote 链路。

### 必须覆盖的验收场景

1. 从无生成物状态使用 frozen lockfile 中解析的 generator 运行 `pnpm generate:typert`，import 五个实际输出并完成类型消费检查；`pnpm pack` 验证四个发布文件。签名变化后重新生成，不继续使用陈旧产物；现有 esbuild 对标准 decorator 的转换由真实构建验证，client bundle 不留下无法解析的 `remote-info` require。
2. 最小 `readWindow` 与一次 `paint` 经完整 Remote 链写入真实 SQLite，并能重新读取；成功后才横向迁移其余现有操作。
3. 当前 Time 浏览器回归在独立右栏入口下保持通过：实录、计划、深度时间、日期导航、编辑、删除、Undo、主题与既有响应式行为不因重构改变。
4. `replaceDay`、DeepTime、错误补偿与既有 Undo 语义保持不变，不新增未经要求的事务保证。
5. GTD 左栏入口显示在全局 panel 区，点击打开空白 `main`；DSH 左栏保留，Time 右栏在主 panel 活跃时隐藏，返回 Conversation 后恢复。
6. 旧“小秘书”总入口、旧 GTD 工作区、聚合 state/command routes 和跨产品 `domain + op` 不再可调用。
7. Time 产品不依赖 GtdService；GTD 产品装卸不影响 Time UI、Remote namespace 或 Time 数据。
8. 卸载 Time 产品只清理其 UI 与 Remote 贡献，TimeService 和 Agent tools 继续读写；重新挂载后 UI 与 namespace 恢复。
9. Time 的 child UI 激活失败会同时撤销 Remote；产品卸载按“UI → Remote → 空 namespace”清理，进行中的调用被取消，stale method 被拒绝。重新挂载不出现重复 endpoint、残留 UI 或旧调用句柄。
10. 非法日期、区间、Tag、level 与请求形状分别落入 `secretaryTime/invalid-input` 或 Gateway wire 校验；不存在的块返回 `secretaryTime/not-found`，持久化／补偿失败返回 `secretaryTime/write-failed` 且 details 携带安全的 operation，cause 只留 Host 日志。错误不被静默吞掉，校验失败不产生 SQLite 写入，非 owner Peer 不获得业务数据。
11. Goal／Tag 上游依赖仍按真实 Cordis inject 等待与清理；不把 Goal 空 Provider 换成空 Remote API。
12. 使用新临时 DSH_HOME、构建后的 bundle、真实 Loader 与空 SQLite 完成冷启动；第一次 Remote 调用即成功，不用固定 sleep 或手工重试掩盖 readiness。以错误类型输入证明 strict generated descriptor 生效：返回 `gateway/input-invalid` 且业务方法未调用；Host descriptor 卸载后返回 `gateway/definition-unavailable`，不得降级到 SRC fallback。HMR 成功不能替代该证据。
13. `pnpm build`、`pnpm test`、`git diff --check` 和 `pnpm pack` 全部通过，pack 内容包含必需的 Remote 生成产物与产品 client bundles。
14. 文档链接与当前实现一致，`verification` 只写入本次真实运行结果，不把本规格的目标提前记为完成。

好测试验证用户可观察行为、Remote 公开输出、错误、生命周期和持久化，不依赖 React 私有状态、生成器内部函数或某个 DOM 实现细节。辅助单元测试可以覆盖日期窗口、paint/replace 和生成脚本，但不能替代上述高层 seam。

## 范围之外

- 完整 OmniFocus 工作区、Quick Entry、Folder、Action Group、Flagged、Review、Repeat 及新 GTD 产品功能。
- GTD Remote application service 或任何空 GTD API。
- Goal 实体、存储、tools、UI 与统计。
- 时间预算、统计、时间对账、按 Project 汇总实录和深度时间日期例外。
- Custom Perspectives、Nearby、日历集成、系统通知、云同步、Omni Automation 与 OmniFocus 数据兼容。
- 学习、成长、财务、记账等候选产品。
- 旧 JSON、Obsidian、旧 Action／TimeBlock 数据迁移或兼容层。
- 与本次常规业务 Remote 无关的文件上传、下载或流式 API。

## 补充说明

- 遵循 ADR 0006 的共享上游依赖、ADR 0007 的独立入口、ADR 0008 的产品 API 归属和 ADR 0009 的 Typert Remote 终点。
- 官方机制证据保存在 DSH 产品 API 与插件开发调研中；GTD 只保留当前 OmniFocus Mac 设计引用。
- 本规格发布后应用 `ready-for-agent` 分诊标签。发布失败时不以本地文件冒充远端工单，也不重复创建。
