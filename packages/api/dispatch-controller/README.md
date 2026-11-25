---
description: "底座控制台的 Host 产品 API：Gateway 设置、状态与 start/stop/restart，以及节点 service discovery 与事件 stream 分页读的 Typert Remote `secretaryDispatch`；NKey seed 存 DSH 托管凭据。"
kind: "package-reference"
---

# dsh-secretary-dispatch-controller

## 概述

本包提供 `DispatchGatewayService`（Cordis key `dispatchGateway`，Remote namespace `secretaryDispatch`）：把 [`dispatch/gateway`](../../dispatch/gateway/README.md) 的无状态逻辑暴露给底座控制台（[`client/ui-dispatch-console`](../../client/ui-dispatch-console/README.md)），并用 `ctx.credentials` 充当 seed 存储。Gateway 方法来自 #98；#105 在同一 namespace 加了节点／事件两个分区的只读方法（`listServices`、`listEvents`、`watch`），读路径在 `src/reader.ts`。Graph 分区后续再加。

## 目录

- [使用本包](#使用本包)
- [理解实现](#理解实现)
- [模型体验](#模型体验)
- [已知限制与后续工作](#已知限制与后续工作)

-----

## 使用本包

### 组合与入口

bundle 的 `secretary-dispatch-controller` 行挂载它，`config.dshHome` 由 `!!js dshHomePath()` 提供（缺省回退 `$DSH_HOME`，再回退 `~/.dsh`）。只注入 `credentials`。`config.historyPath`（可选）是中心引擎事件历史 SQLite 文件，只读打开；缺省不显示消费记录（bundle 尚未装配引擎，装配时在该行加上）。

| 出口 | 作用 |
|---|---|
| `.` | `apply(ctx, config)`、`DispatchGatewayService`、`Config` |
| `./types` | `GatewayStatus`、`GatewaySettings`、`UpdateGatewaySettings`、`ServiceInstance`、`StreamEvent`、`EventPage`、`EventQuery` |
| `./typert` | 官方生成的 Host Remote 描述 |
| `./remote` | 生成的浏览器客户端（控制台 `$mount`） |

| Remote 方法 | 入参 | 结果 |
|---|---|---|
| `readStatus` | — | `GatewayStatus`（每次现探测） |
| `start` / `stop` / `restart` | — | `GatewayStatus`（`by: 'console'`） |
| `readSettings` | — | `GatewaySettings` |
| `updateSettings` | `UpdateGatewaySettings { mode?, clientPort?, monitorPort?, binary?, remoteUrl?, centerCredential?, nodeCredential? }` | `GatewaySettings` |
| `listServices` | — | JSON 文本 `ServiceInstance[]`：在线 NATS 服务实例，`@nats-io/services` 官方 discovery（`info()`）返回什么就是什么 |
| `listEvents` | `EventQuery { before?, limit? = 200 }` | JSON 文本 `EventPage { firstSeq, lastSeq, events[] }`：`before` 之前的至多 `limit` 条，最新在上；每条 `{ seq, subject, event, history[] }` |
| `watch`（stream） | — | 每个到达 Gateway 的事件推一个 `{ changed: true }` mark，不带数据 |

读路径不经 strict codec 逐字段映射：`listServices`／`listEvents` 返回 `JSON.stringify` 文本，浏览器 Adapter `JSON.parse` 后原样交给 UI（#94：不加工字段）。`event` 是 stream 里存的 payload：是 JSON 就是解析后的信封，不是 JSON 就是原文；`history` 是中心引擎事件历史里 `eventId` 等于该信封 `id` 的行，按引擎自己的记录形状，没有即空数组。

失败统一为 `RemoteError('secretaryDispatch/gateway-error', message, { code })`，`code` 即共享逻辑的 `GatewayError.code`。

## 理解实现

<details>
<summary>实现说明与源码定位</summary>

`src/reader.ts` 是读路径：用**中心凭据**建立自己的只读连接（本机模式取 `settings.keys.center.ref`，远程模式取 `settings.remote.credentials.center`），`listServices` 走 `Svcm.client().info()`，`listEvents` 每次建一个无 durable 名的 ephemeral pull consumer（`deliver_policy: by_start_sequence`、`ack_policy: none`）读完后即删；`watch` 的 mark 来自同一连接上对 `dsh.events.>` 的订阅。连接失败不缓存，下次读重连；随插件 `ctx.effect` 关闭。读路径不受事件目录裁剪依赖 `dispatch/gateway` 的权限模板（两角色都允许 subscribe `dsh.events.>`）。

`src/index.ts` 把 `SecretStore` 绑到 `ctx.credentials.resolve/set`：首次本机启动时共享逻辑经 `set(credentialRef('NATS_NKEY_SEED_CENTER' | '_NODE'), seed)` 落到 DSH 托管凭据（当前 `$DSH_HOME/.credentials.yaml`，0600）；业务插件与本包的返回值都不含 seed。进程控制一律 `child_process`（共享逻辑内），不经 `ctx.subprocess` / `ctx.jobs`。

</details>

## 模型体验

无。本包不注册工具、提示词或会话事件；seed 不进入模型上下文。

## 已知限制与后续工作

- `updateSettings` 不触发重启；改动在下次启动或手动重启时生效。
- 节点分区只做发现与展示：节点把自己的服务注册到 NATS Services 尚无代码；节点账号的 permission 模板允许 `$SRV.>` subscribe／`_INBOX.>` publish，但服务 endpoint 自己的 subject 命名空间未定，模板未放行。
- Graph 分区的数据源属后续工单。
