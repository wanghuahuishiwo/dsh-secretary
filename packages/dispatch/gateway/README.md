---
description: "无状态 Gateway（nats-server）管理共享逻辑：settings.json、NKey、派生 nats-server.conf、状态探测、start/stop/restart 与 CLI 契约；供控制台、dsh-secretary gateway 命令与后续基础通信工单阅读。"
kind: "package-reference"
---

# dsh-secretary-dispatch-gateway

## 概述

本包是「Gateway 管理是一段无状态的共享逻辑」的落地：控制台按钮（经 [`api/dispatch-controller`](../../api/dispatch-controller/README.md)）与命令行 `dsh-secretary gateway start|stop|restart|status`（经 [`secretary/cli`](../../secretary/cli/README.md)）调用同一组函数。它不常驻、不持有进程句柄，零运行时依赖（NKey 用 `node:crypto` ed25519 生成，编码与官方 nkeys.js 一致）。设计依据见 [foundation.md §2.3](../../../docs/agent-dispatch/foundation.md)。

## 目录

- [使用本包](#使用本包)
- [文件与字段](#文件与字段)
- [理解实现](#理解实现)
- [已知限制与后续工作](#已知限制与后续工作)

-----

## 使用本包

| 出口 | 作用 |
|---|---|
| `.` | 全部函数与类型（单文件 ESM） |

| 函数 | 说明 |
|---|---|
| `readSettings(dshHome)` / `updateSettings(dshHome, patch)` / `saveSettings` | 读写 `settings.json`；patch 省略的字段保持原值 |
| `probeGateway(dshHome)` → `GatewayStatus` | 只凭文件、`launch.json` 的 pid 与 `/varz` 推导状态，不发信号 |
| `startGateway(dshHome, { by, secrets?, readyTimeoutMs?, env? })` | detached `child_process.spawn` + `unref`，10 秒内 `/healthz?js-enabled-only=true` 未就绪即 SIGTERM 并判 `start-failed` |
| `stopGateway(dshHome, { stopTimeoutMs? })` | SIGTERM，10 秒未退出报 `stop-timeout`，绝不 SIGKILL |
| `restartGateway` | 显式重启 = stop 再 start；stop 超时则不启动 |
| `renderServerConfig(settings, paths)` | 派生 `nats-server.conf` 文本（每次启动重写） |
| `createNKeyPair()` / `nkeyPublicKeyFromSeed(seed)` | 中心／节点 NKey 用户；seed `SU…`，公钥 `U…` |
| `locateNatsServer(configured)` | PATH 或手填路径探测，缺失时带 `brew install nats-server` 提示 |
| `gatewayCommand(args, io)` → exit code | CLI 契约：0 成功、1 `{"error":{code,message}}` 到 stderr、2 usage |

`secrets` 是 `{ resolve(ref), set(ref, value) }`：Host 侧由 `ctx.credentials` 实现，CLI 侧只从环境变量 `resolve`、不能 `set`。首次本机启动缺公钥时生成两个 NKey，seed 经 `set` 存入 `NATS_NKEY_SEED_CENTER` / `NATS_NKEY_SEED_NODE`，公钥写回 settings。

错误统一为 `GatewayError { code }`：`gateway/invalid-settings`、`gateway/keys-missing`、`gateway/keys-unavailable`、`gateway/not-installed`、`gateway/remote-mode`、`gateway/not-managed`、`gateway/start-failed`、`gateway/stop-timeout`。启动／停止失败时 `error.status` 带当时的状态。

## 文件与字段

全部在 `$DSH_HOME/gateway/`（`DSH_HOME` 未设时 `~/.dsh`）：

| 文件 | 内容 |
|---|---|
| `settings.json` | `mode`（`local`/`remote`）、`clientPort`（4222）、`monitorPort`（8222）、`binary`、`remote { url, credentials { center?, node? } }`、`keys { center { ref, publicKey }, node {…} } \| null`。不含 seed。 |
| `nats-server.conf` | 派生物：`listen: 127.0.0.1:<clientPort>`、`http: 127.0.0.1:<monitorPort>`、`jetstream.store_dir`、`authorization.users[].nkey`（仅公钥） |
| `launch.json` | `pid`、`startedAt`、`by`（`console`/`cli`）、`stopRequestedAt?`、`exit? { reason: stopped \| abnormal, at }` |
| `nats-server.log` | 子进程 stdout/stderr |
| `jetstream/` | 显式 `store_dir` |

`GatewayStatus.state`：`not-started` / `starting` / `running` / `stopping` / `stopped` / `start-failed` / `abnormal-exit` / `record-invalid` / `unknown` / `unmanaged` / `remote`（中文见 `STATE_LABELS`），另带 `version`（`/varz`）、`pid`、`startedAt`、`startedBy`、`endedAt`、`clientUrl`、`monitorUrl`、`binary { configured, found, hint? }`、`logTail?`、`detail?`。

## 理解实现

<details>
<summary>实现说明与源码定位</summary>

- `src/status.ts`：认进程 = `process.kill(pid, 0)` 存活 **且** `/varz` 的 `port` 等于 `clientPort`、`jetstream.config.store_dir` 等于本机 `jetstream/`；对不上即 `record-invalid`，不接管、不发信号。pid 已死时：有 `exit.stopped` 或 `stopRequestedAt` → `stopped`；启动后 10 秒内结束 → `start-failed`；其余 → `abnormal-exit`；客户端端口被别的进程占用 → `unmanaged`。
- `src/manage.ts`：启动前先探测，`running/starting/stopping` 直接返回（两边同时启动靠端口占用自然互斥，不加锁）。子进程只得到 `PATH/HOME/TMPDIR/LANG/LC_ALL/USER`，不继承宿主环境。
- `src/nkey.ts`：编码 = base32（RFC 4648 字母表）于 `[prefix, payload, CRC-16/X-MODEM 小端]`；公钥派生经 PKCS#8 → SPKI，参考向量由官方 nkeys.js 1.1.0 生成。

</details>

## 已知限制与后续工作

- 本机未安装 nats-server：真实进程链路由 bundle 测试 `tests/gateway.mjs` 覆盖（缺二进制时明确失败），尚未在真机跑通；其余逻辑用 `tests/fixtures/fake-nats-server.mjs` 验证。
- `nats-server.conf` 暂不写 subject permissions（allowlist 从事件目录派生，归基础通信工单）。
- CLI 不能首次生成 NKey（没有凭据存储）：本机模式首次启动请在控制台完成，或预先在环境变量／`$DSH_HOME/.env` 放好两个 seed。
