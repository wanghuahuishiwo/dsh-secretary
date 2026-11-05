# dsh-secretary

可安装到 DeepSeek Harness 的私人 Secretary Agent bundle。当前集中验收覆盖 **Time + Tag 与空 Goal Provider**；#6 GTD Review／Repeat／OmniFocus UI 与全产品 #8 暂停，现有 GTD UI 不是终稿。包内仍保留已实现的 GTD 基础切片、独立 Tag、具体日期 PlanBlock／ActualBlock、PlanTemplateBlock、DeepTime 基础周模板和真实 Web 产品壳；各领域共用同一 SQLite，GTD Completed、计划、模板、实录与深度时间互不伪造或回写事实。Goal 只建立上游空 service，不实现目标模型、UI、统计、预算与对账。

## 构建与验证

```sh
pnpm install
pnpm build
pnpm test
```

`pnpm test` 包含：

- 真实 Cordis 公共 tools + 临时 SQLite：GTD 数字 ID、独立／项目澄清、CRUD、日期语义、Next／Forecast／Availability、跨层 effective Tags、Tag 树与 GTD／Time 引用保护及并发、Plan／Template／Actual／DeepTime、写失败回滚和完整重开。
- 真实 `dsh web` + Chromium：生产 client 的月历、标签架、并行画布、计划模板、DeepTime、完整 Undo ID 链、两种 Tag 的桌面 HTML5 层级拖拽、Time／GTD 进入 Tags 的 kind、宿主明暗主题及 390px 布局；独立“小秘书-事项”左栏入口、空白 main、Conversation 返回、官方 HMR 装卸与冷启动。设置 `SECRETARY_SCREENSHOT_DIR` 时额外输出 light／dark PNG；默认不写仓库。

浏览器测试需要 DSH `0.2.1-rc.5` 在 PATH 和 Playwright Chromium，不使用版本豁免。可用 `pnpm --filter dsh-secretary test:browser` 单独运行。测试使用临时 `DSH_HOME`，不会连接正在使用的 GUI、真实 desktop profile 或真实 Secretary 数据。

## 装配

- 根层：`storage-sqlite`、`secretary-storage`、`secretary-goal`、`secretary-gtd`、`secretary-tag`、`secretary-time-block`、旧聚合 `secretary-panel` 与独立事项 `secretary-gtd-panel`。行序仅用于阅读，启动与重载由 Cordis `inject` 驱动。
- Secretary preset：公共工具 `secretary_gtd`、`secretary_tag`、`secretary_time`，以及既有 GTD/Secretary skills。
- Goal 只有上游空 Provider；Goal 业务模型与统计不实现。旧 `secretary_time_block`、Action 关联 planned/actual 模型及独立 Statistics 包均已移除，不保留兼容层。

`secretary_gtd`、`secretary_tag`、`secretary_time` 经 `secretaryStorageDomain` 默认路由到：

```text
$DSH_HOME/storages/secretary.db
```

UI 的 Host routes 和 Agent 公共 tools 都调用 `ctx.gtd` / `ctx.tags` / `ctx.time`，没有浏览器私有事实源或直接 SQLite 写入。

## 开发体验

```sh
pnpm dev
```

desktop profile 通过 `link:` 使用 `packages/secretary` 的构建产物。改动 `cordis.patch.yml` 后用 `/dsh-reload`，再新开会话验证；改动任何包 `src/` 后先构建。bundle patch 按名字引用的包必须是运行 profile 的直接依赖，包括 `dsh-secretary-storage/goal/gtd/tag/time-block/panel/gtd-panel` 与 `@deepseek-ai/dsh-storage-sqlite`。

正式安装可先构建，再使用 `plugin_manager` 安装本包，或：

```sh
dsh plugin --profile <name> add /绝对路径/dsh-secretary/packages/secretary
```

运行 profile 必须组合 DSH base/web 与本 bundle。当前切片不包含深度时间日期例外、完整 Folder／Action Group／Review／Repeat、Goal 模型或统计。
