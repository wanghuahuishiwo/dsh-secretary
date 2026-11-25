---
description: "底座控制台的 Host 产品 API：Gateway 设置、状态与 start/stop/restart 的 Typert Remote `secretaryDispatch`；NKey seed 存 DSH 托管凭据。"
kind: "package-reference"
---

# dsh-secretary-dispatch-controller

## 概述

本包提供 `DispatchGatewayService`（Cordis key `dispatchGateway`，Remote namespace `secretaryDispatch`）：把 [`dispatch/gateway`](../../dispatch/gateway/README.md) 的无状态逻辑暴露给底座控制台（[`client/ui-dispatch-console`](../../client/ui-dispatch-console/README.md)），并用 `ctx.credentials` 充当 seed 存储。本票只有 Gateway 一个分区；节点／事件／Graph 分区的 Remote 方法后续加在同一个 namespace。

## 目录

- [使用本包](#使用本包)
- [理解实现](#理解实现)
- [模型体验](#模型体验)
- [已知限制与后续工作](#已知限制与后续工作)

-----

## 使用本包

### 组合与入口

bundle 的 `secretary-dispatch-controller` 行挂载它，`config.dshHome` 由 `!!js dshHomePath()` 提供（缺省回退 `$DSH_HOME`，再回退 `~/.dsh`）。只注入 `credentials`。

| 出口 | 作用 |
|---|---|
| `.` | `apply(ctx, config)`、`DispatchGatewayService`、`Config` |
| `./types` | `GatewayStatus`、`GatewaySettings`、`UpdateGatewaySettings` 等契约类型 |
| `./typert` | 官方生成的 Host Remote 描述 |
| `./remote` | 生成的浏览器客户端（控制台 `$mount`） |

| Remote 方法 | 入参 | 结果 |
|---|---|---|
| `readStatus` | — | `GatewayStatus`（每次现探测） |
| `start` / `stop` / `restart` | — | `GatewayStatus`（`by: 'console'`） |
| `readSettings` | — | `GatewaySettings` |
| `updateSettings` | `UpdateGatewaySettings { mode?, clientPort?, monitorPort?, binary?, remoteUrl?, centerCredential?, nodeCredential? }` | `GatewaySettings` |

失败统一为 `RemoteError('secretaryDispatch/gateway-error', message, { code })`，`code` 即共享逻辑的 `GatewayError.code`。

## 理解实现

<details>
<summary>实现说明与源码定位</summary>

`src/index.ts` 把 `SecretStore` 绑到 `ctx.credentials.resolve/set`：首次本机启动时共享逻辑经 `set(credentialRef('NATS_NKEY_SEED_CENTER' | '_NODE'), seed)` 落到 DSH 托管凭据（当前 `$DSH_HOME/.credentials.yaml`，0600）；业务插件与本包的返回值都不含 seed。进程控制一律 `child_process`（共享逻辑内），不经 `ctx.subprocess` / `ctx.jobs`。

</details>

## 模型体验

无。本包不注册工具、提示词或会话事件；seed 不进入模型上下文。

## 已知限制与后续工作

- `updateSettings` 不触发重启；改动在下次启动或手动重启时生效。
- 节点／事件／Graph 分区的数据源（NATS service discovery、JetStream 消费、事件历史）属后续工单。
