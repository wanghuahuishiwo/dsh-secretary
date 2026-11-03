# dsh-secretary

可安装到 DeepSeek Harness 的私人 Secretary Agent bundle。当前产品切片包含既有 GTD、独立 Tag、具体日期 PlanBlock／ActualBlock、独立 PlanTemplateBlock、DeepTime 基础周模板与真实 Web Time 面板；各领域共用同一 SQLite，计划、模板、实录与深度时间互不伪造或回写事实。

## 构建与验证

```sh
pnpm install
pnpm build
pnpm test
```

`pnpm test` 包含：

- 真实 Cordis 公共 tools + 临时 SQLite：Tag 树、Plan CRUD、Template CRUD/apply/undo、Actual CRUD/start/stop、DeepTime 整周与单格／区间设置和清除、封闭枚举、非法输入、日期／时区／跨日、各领域隔离、引用保护、写失败回滚、GTD 独立性和完整重开。
- 真实 `dsh web` + Chromium：生产 client 的产品壳、月历跨月/今天、标签架、并行实录、Shift 编辑、计划模板应用/撤销、深度时间三档画笔与固定操作拖刷、只用 high、粒度切换、页面重载、完整进程重开及 390px 布局。

浏览器测试需要 `dsh` 在 PATH 和 Playwright Chromium。可用 `pnpm --filter dsh-secretary test:browser` 单独运行。测试使用临时 `DSH_HOME`，不会连接正在使用的 GUI 或真实 Secretary 数据。

## 装配

- 根层：`storage-sqlite`、`secretary-storage`、`secretary-gtd`、`secretary-tag`、`secretary-time-block`、`secretary-panel`。
- Secretary preset：公共工具 `secretary_gtd`、`secretary_tag`、`secretary_time`，以及既有 GTD/Secretary skills。
- Statistics 不属于当前产品切片，未装配；旧 `secretary_time_block` 与 Action 关联 planned/actual 模型没有兼容层。

`secretary_gtd`、`secretary_tag`、`secretary_time` 经 `secretaryStorageDomain` 默认路由到：

```text
$DSH_HOME/storages/secretary.db
```

UI 的 Host routes 和 Agent 公共 tools 都调用 `ctx.tags` / `ctx.time`，没有浏览器私有事实源或直接 SQLite 写入。

## 开发体验

```sh
pnpm dev
```

desktop profile 通过 `link:` 使用 `packages/secretary` 的构建产物。改动 `cordis.patch.yml` 后用 `/dsh-reload`，再新开会话验证；改动任何包 `src/` 后先构建。bundle patch 按名字引用的包必须是运行 profile 的直接依赖，包括 `dsh-secretary-storage/gtd/tag/time-block/panel` 与 `@deepseek-ai/dsh-storage-sqlite`。

正式安装可先构建，再使用 `plugin_manager` 安装本包，或：

```sh
dsh plugin --profile <name> add /绝对路径/dsh-secretary/packages/secretary
```

运行 profile 必须组合 DSH base/web 与本 bundle。当前切片不包含深度时间日期例外、GTD 新标签继承或统计。
