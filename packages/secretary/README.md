# dsh-secretary

可安装到 DeepSeek Harness 的私人 Secretary Agent bundle。组合 GTD 基础 Service 与 tools、独立 Tag、具体日期 PlanBlock／ActualBlock、PlanTemplateBlock、DeepTime 基础周模板、Time 右栏 Remote 产品和 GTD 左栏空白 main；各领域共用同一 SQLite，GTD Completed、计划、模板、实录与深度时间互不伪造或回写事实。Goal 只建立上游空 service，不实现目标模型、UI、统计、预算与对账。

## 构建与验证

```sh
pnpm install
pnpm build
pnpm test
```

`pnpm test` 包含：

- 真实 Cordis 公共 tools + 临时 SQLite：GTD 数字 ID、独立／项目澄清、CRUD、日期语义、Next／Forecast／Availability、跨层 effective Tags、Tag 树与 GTD／Time 引用保护及并发、Plan／Template／Actual／DeepTime、写失败回滚和完整重开。
- 真实 `dsh web` + Chromium：独立 Time 右栏的三模块读写、月历与日期导航、标签架、编辑／删除、完整 Undo、DeepTime、宿主明暗主题及窄栏布局；独立“小秘书-事项”左栏入口、空白 main、Conversation 返回、产品独立装卸与冷启动。测试经 test-only fixture 直接调用 Tag／GTD domain Services 准备或核对事实，不新增生产 Tag／GTD Remote；旧聚合 state／command routes 必须返回 404。

浏览器测试需要 DSH `0.2.1-rc.5` 在 PATH 和 Playwright Chromium，不使用版本豁免。可用 `pnpm --filter dsh-secretary test:browser` 单独运行。测试使用临时 `DSH_HOME`，不会连接正在使用的 GUI、真实 desktop profile 或真实 Secretary 数据。

最终 tarball 冷启动另行运行 `pnpm --filter dsh-secretary test:installed`：脚本打包每个 workspace 包，经官方 `dsh plugin add` 安装到带 file overrides 的全新临时 profile，再以真实 `dsh web` + Chromium 验证服务激活、两个产品、第一次 Remote 读取及 paint 重开持久化；不使用源码 overlay，也不读取真实 desktop profile。

## 装配

- 根层：`storage-sqlite`、`secretary-storage`、`secretary-goal`、`secretary-gtd`、`secretary-tag`、`secretary-time-block`、完整 Remote 时间产品 `secretary-time-panel` 与独立事项 `secretary-gtd-panel`。行序仅用于阅读，启动与重载由 Cordis `inject` 驱动。
- Secretary preset：公共工具 `secretary_gtd`、`secretary_tag`、`secretary_time`，以及既有 GTD/Secretary skills。
- Goal 只有上游空 Provider；patch 显式禁用宿主 `goal` Service entry，避免与项目 `goals` 重复注册。Goal 业务模型与统计不实现。

`secretary_gtd`、`secretary_tag`、`secretary_time` 经 `secretaryStorageDomain` 默认路由到：

```text
$DSH_HOME/storages/secretary.db
```

Time 浏览器经 `ctx.remote.secretaryTime` 调用 `TimeProductService`，后者与 Agent 公共 tools 一样调用 `ctx.tags` / `ctx.time`；GTD tools 调用 `ctx.gtd`。GTD 空页没有业务 API，没有浏览器私有事实源或直接 SQLite 写入。

## 开发体验

```sh
pnpm dev
```

desktop profile 通过 `link:` 使用 `packages/secretary` 的构建产物。改动 `cordis.patch.yml` 后用 `/dsh-reload`，再新开会话验证；改动任何包 `src/` 后先构建。bundle patch 按名字引用的包必须是运行 profile 的直接依赖，包括 `dsh-secretary-storage/goal/gtd/tag/time-block/time-panel/gtd-panel` 与 `@deepseek-ai/dsh-storage-sqlite`。

正式安装可先构建，再使用 `plugin_manager` 安装本包，或：

```sh
dsh plugin --profile <name> add /绝对路径/dsh-secretary/packages/secretary
```

运行 profile 必须组合 DSH base/web 与本 bundle。当前不包含深度时间日期例外、完整 Folder／Action Group／Review／Repeat、Goal 模型或统计。
