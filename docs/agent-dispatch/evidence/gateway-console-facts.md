# 证据：Gateway 管理与底座控制台的宿主/官方能力核查

> 采集于 2026-11-24，为 [底座·Gateway 设置与本机控制器（本机/远程、启动/手动重启/停止/状态）](https://github.com/wanghuahuishiwo/dsh-secretary/issues/87) 解票服务。两组事实分别由独立子代理只读核查得到：A 组读本机 DSH 源码仓 `~/workspace/deepseek-harness`（HEAD fcc0ad4621，0.2.2-rc.1，与已安装 app.asar 同版），B 组读 nats-server `main` 分支源码与官方文档。本文只记事实与来源，决策见 #87 结单评论与 [foundation.md §2.3](../foundation.md)。

## A. DSH 宿主能力（源码路径相对 `~/workspace/deepseek-harness/packages/`）

### A1. 子进程与后台任务服务都会随宿主退出而终止子进程

- `ctx.subprocess`（`subprocess/subprocess/src/index.ts:117-131`）：`spawn(spec)`，`SubprocessSpawnSpec` 无 `detached` 字段（`types.ts:76-106`）；`subprocess-local` 在宿主退出时执行 `disposeManagedProcesses()`（`subprocess/subprocess-local/src/index.ts:62, 96-122`）。
- `ctx.jobs`（`jobs/jobs/src/index.ts:88-195`）：`JobSpec` 需自带 `run`，不是 spawn 封装；jobs-local 在 service dispose 时 `disposeAll()`（`jobs/jobs-local/src/index.ts:193`）。
- 未找到任何提供 detached / 宿主退出后存活的服务（搜索了 jobs/、shell/、subprocess/ 下 `detached|unref`）。

### A2. 数据目录与凭据

- `$DSH_HOME` 默认 `~/.dsh`，环境变量覆盖（`util/home-paths/src/index.ts:12, 18, 135-137`）；唯一的数据目录 API 是 `ctx.dshHomePath(...)`（`boot/app-boot/src/index.ts:46, 1223`），未找到 `ctx.paths.data` / `ctx.dataDir`。
- 本机 `~/.dsh` 实际结构：`.credentials.yaml`（0600）、`cordis.patch.yml`、`profiles/{desktop,…}`、`storages/`、`sessions/`、`logs/`、`skills/`、`cache/` 等。
- `ctx.credentials`（`credentials/credentials/src/index.ts:171-256`）：`resolve(ref)`、`set(ref, value)`、`unset(ref)`、`describe`、`readRecord`/`modifyRecord`/`deleteRecord`/`listRecords`——**插件可写**。Key 格式 `<scope>/<id>`（`types.ts:16-29`）。层级：`.credentials.yaml > 进程环境 > <cwd>/.env > $DSH_HOME/.env`（`credentials-local/src/index.ts:1-9`）；写入有跨进程文件锁 + 原子写 + chokidar（`:22-45`）。

### A3. 客户端 UI 槽位

- 设置页贡献点存在：`'settings.section'`（一页一入口）、`'settings.general.item'`、`'settings.plugins.tab'`、`'settings.onboarding'`、`'settings.action'`（`client/ui-settings/src/client/contract/slots.ts:39-100`）。
- 没有传统 statusbar；可用 `'shell.overlay'`（源码注释 "a badge, a toast stack or a status pill all belong here"，`client/ui-layout/src/client/index.ts:96-107`）、`'shell.bottom'`、`'sidebar.toggle.badge'`。
- 主区整页：`ctx.slots.register({ name:'main', key: PANEL_ID }, Component)` + 左栏面板列表 `ctx.slots.register({ name:'sidebar.panellist', id: PANEL_ID, order, label }, Icon)`——本仓 `packages/client/ui-gtd/src/client/index.tsx:26-36` 即此用法；右栏 tab 用法见 `packages/client/ui-time/src/client/index.tsx:14-26`。

### A4. 配置持久化惯例

- 本仓所有插件配置来自 Cordis loader 的 entry config（`cordis.patch.yml`），没有运行时写配置文件的先例；DSH 自己的「改配置」走 config-editor 改 profile patch 文件。
- `dsh-secretary` CLI（`packages/secretary/cli/bin/dsh-secretary.mjs`）必须依赖运行中的宿主（`DSH_SECRETARY_URL/TOKEN` 由 bundle 注入，缺失即退出，`:96-100`）；无子命令注册机制、无参数解析库。

## B. nats-server 官方能力（源码 2026-11-24 拉取）

### B1. 启动顺序——与直觉相反

`Start()`（`server/server.go` L2299-2612）：`logPid`(L2406) → `StartMonitoring`(L2426) → `EnableJetStream`(L2491，同步) → … → `AcceptLoop`(L2607，客户端端口在此 `net.Listen` L2867)。

- 「/varz 返回 200 ⇒ 客户端已可连接」**不成立**；反向成立。
- 就绪探针应用 `GET /healthz?js-enabled-only=true`（`monitor.go` `healthz()` L3649+）：listener 未就绪 500、JetStream 未启用 503。若配置根本未开 JetStream 会直接 200，需同时核对 `/varz` 的 `jetstream.config` 非空。

### B2. `/varz` 字段（`monitor.go` `Varz` L1244-1321）

有 `server_name`、`server_id`、`version`、`host`、`port`、`http_host`、`http_port`、`start`（非 `start_time`）、`uptime`、`jetstream{config{store_dir,…},stats,meta,limits}` 等；**不暴露操作系统 PID**；无顶层 `config` 字段。

### B3. 命令行参数

- `-n/--server_name`：不能含空格；单机无集群下仅是标签（JetStream 仅在日志打印 `Node: <hash(name)>`，L2328-2330）；改名对已有 store 的影响未核实。
- `-a/--addr` 同时决定监控口绑定地址（`opts.go` L6149-6152：`HTTPHost` 默认 = `Host`）。
- `-sd/--store_dir` 默认为 `os.TempDir()/nats/jetstream` 并 Warn 可能重启丢失（`jetstream.go` L2876-2883）；设 X 时实际目录为 `X/jetstream`（L242-243）。
- `-P/--pid`：在绑端口**之前**写入（L1745），退出**不删除**（全仓仅写与调用两处引用），端口被占退出也会残留。

### B4. 停止与失败行为

- SIGINT/SIGTERM → `Shutdown(); WaitForShutdown(); os.Exit(0)`（`signal.go`）；`grWG.Wait()` 无超时是唯一可能阻塞点。lame duck 模式默认不触发。
- 端口被占：`Fatalf("Error listening on port …")` → `os.Exit(1)`（L2870）；监控口被占同样 exit 1，发生在写 pidfile 之后。

### B5. 分发渠道

Homebrew core formula `nats-server`（2.15.3）、GitHub Releases、`curl -sf https://binaries.nats.dev/… | sh`、Docker 官方镜像 `nats`。**无官方 npm 包**（npm `nats-server` 为第三方 0.0.0 自述勿用于生产）。

### B6. nats CLI

全部命令依赖 NATS 客户端协议 + system account，无 HTTP 监控口模式，不能用于探测 `-m` 端口。

## 来源

- nats-server 源码：`server/{server,opts,monitor,signal,jetstream,const,main}.go` @ main（2026-11-24）
- https://docs.nats.io/reference_versioned_docs/version-2.15/config/server_name.md 、`.../store_dir.md`
- https://formulae.brew.sh/api/formula/nats-server.json ；https://registry.npmjs.org/nats-server
- https://github.com/nats-io/natscli（`cli/server_ping_command.go`、`cli/server_check_command.go`）
- 控制台布局参照调研：[console-ui-references.md](console-ui-references.md)
- 原型（可丢弃分支 `prototype/gateway-controller-87`）：`docs/agent-dispatch/prototypes/gateway-controller.html`（进程控制状态机）、`console-layout.html`（三变体布局）
