---
description: "基础通信插件：NKey 连接 Gateway、CloudEvents 1.0.2 信封（DSH profile）、nodeId 身份文件、一个 JetStream stream 与 durable consumer 的在线创建，以及按角色的 subject permissions。"
kind: "package-reference"
---

# dsh-secretary-dispatch-messaging

## 概述

业务插件只依赖本插件的公开能力就能发／收 CloudEvents 事件。连接由 NKey 鉴权，seed 在本插件进程内经 `ctx.credentials.resolve(ref)` 解析后直接交给官方 `nkeyAuthenticator`，对外只有「发布／订阅」。设计依据见 [foundation.md §2](../../../docs/agent-dispatch/foundation.md) 与 [overview.md §2](../../../docs/agent-dispatch/overview.md)（Gateway 协议）。

选型（#99）：NATS 客户端用官方 v3 拆分包 `@nats-io/nats-core`、`@nats-io/transport-node`、`@nats-io/jetstream`，均为 3.5.0（传递依赖 `@nats-io/nkeys` 2.1.0）；作为运行时依赖声明，不打进 bundle。CloudEvents 不引 `cloudevents` SDK（其 `engines.node <=24`，本仓库跑 Node 26），按规范文本自写最小构造与校验。

## 目录

- [使用本包](#使用本包)
- [信封与地址](#信封与地址)
- [文件与权限](#文件与权限)
- [理解实现](#理解实现)
- [已知限制与后续工作](#已知限制与后续工作)

-----

## 使用本包

| 出口 | 作用 |
|---|---|
| `.` | 插件入口（`name`、`inject`、`apply`、`Config`）、`NatsDispatchMessaging` 与全部纯函数 |
| `./contract` | Service Definition `DispatchMessaging`、`SERVICE_KEY` 与事件类型 |

### 装配

中心与节点各一行插件，放在各自的 `cordis:group` 里并用 `isolate` 隔离 service key（不是 DSH preset）：

```yaml
- id: dispatch-center
  name: cordis:group
  group: true
  isolate:
    dispatchMessaging: true
  config:
    - id: dispatch-center-messaging
      name: dsh-secretary-dispatch-messaging
      config:
        role: center
        publish: [task.assigned]
        subscribe: [aone.bug.created]
- id: dispatch-node
  name: cordis:group
  group: true
  isolate:
    dispatchMessaging: true
  config:
    - id: dispatch-node-messaging
      name: dsh-secretary-dispatch-messaging
      config:
        role: node
        initNodeId: true        # 只在首次显式初始化时写一次；之后可删
        publish: [aone.bug.created]
        subscribe: [task.assigned]
```

| Config | 说明 |
|---|---|
| `role` | `center` / `node`，必填；决定 NKey 用户、事件 `source` 与 permissions 模板 |
| `dshHome?` | 定位 `gateway/` 与 `dispatch/`；默认 `$DSH_HOME`，否则 `~/.dsh` |
| `initNodeId?` | `true` 时节点身份文件缺失则生成（从不覆盖）；默认只读 |
| `publish?` / `subscribe?` | 本角色声明的事件 type 列表，即事件目录；未声明的 type 在本地以 `messaging/not-declared` 拒绝 |

连接地址来自 [`dispatch/gateway`](../gateway/README.md) 的 `settings.json`：本机模式 `nats://127.0.0.1:<clientPort>` + 凭据引用 `keys.<role>.ref`；远程模式 `remote.url`（必须是 `tls://`）+ `remote.credentials.<role>`。

### Service（Cordis key `dispatchMessaging`）

业务插件 `inject: ['dispatchMessaging']` 后：

| 成员 | 说明 |
|---|---|
| `role` / `nodeId` | 角色；节点的持久身份（中心为 `undefined`） |
| `publish({ type, data, id?, time?, datacontenttype?, dataschema? })` | 以本角色 `source` 构造并校验信封，发布到 `dsh.events.<type>`，`Nats-Msg-Id = event.id`；返回 `{ event, stream, seq, duplicate }`。传 `id`/`time` 可用同一事件重试 |
| `subscribe({ type }, handler)` | 在线确保 stream 捕获与 durable consumer，收到合法事件调用 `handler(event, { subject, stream, seq })`；返回 `{ type, subject, durable, stop() }` |
| 事件 `dispatch/envelope-rejected` | 收到不合规信封时发出 `{ subject, stream, seq, reason }`，消息被 `term()`，不投递、不重投；同时写 logger |

## 信封与地址

- 线上形态：CloudEvents Core 1.0.2 + JSON Event Format 1.0.2 + NATS Protocol Binding 1.0.2（structured content mode，整个 JSON 即 NATS payload）。规范依据：[Core](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md)、[JSON Event Format](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/formats/json-format.md)、[NATS Protocol Binding](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/bindings/nats-protocol-binding.md)。
- 校验（`parseEvent`）：`specversion` 必须为 `"1.0"`；`id`、`source`、`type` 非空字符串；JSON 中 `null` 属性视为未设置并丢弃，其余属性必须是字符串；`data` 必填（JSON Format 中可选，此处为 DSH 约束）且不做内容校验；`time` 必填且为 RFC 3339；`dataschema` 与扩展属性原样透传，DSH 不定义扩展属性。
- DSH profile：`source` 只能是 `urn:dsh:center` 或 `urn:dsh:node:<UUID>`；`id` 由 `createEvent` 用 `randomUUID()` 生成（全局唯一），接收端不查重（长期幂等归 #100）。
- NATS subject 固定派生：`dsh.events.<type>`，`type` 只能是点分的小写 token（`[a-z0-9][a-z0-9_-]*`）。规范没有规定 `type → subject` 的映射，这是 DSH profile（依据 [cloudevents-subject-practices](../../../docs/agent-dispatch/evidence/cloudevents-subject-practices.md)）。接收时 `type` 与所在 subject 必须配对，否则按不合规拒绝。CloudEvents 可选属性 `subject` 不生成、不依赖，但带着它的事件不被拒绝。
- DSH 原生事件省略 CE `subject`：`createEvent` 不写；外部合法 CloudEvents 带该属性时照常接收。

## 文件与权限

| 文件 | 内容 |
|---|---|
| `$DSH_HOME/dispatch/node/identity.json` | `{ "nodeId": "<UUIDv4>" }`，0600；`initNodeId` 用 `link()` 原子创建，已存在即报 `messaging/identity-exists`；普通启动缺失 `messaging/identity-missing`、损坏 `messaging/identity-invalid`，都不换号 |
| `$DSH_HOME/gateway/permissions.<role>.json` | 本插件按 `publish`/`subscribe` 声明写出（`{ publish: [subject], subscribe: [subject] }`）；Gateway 启动时读取并渲染进 `nats-server.conf` 的 `authorization.users[].permission` |
| JetStream stream `dsh-events` | File + Limits，`store_dir` 由 Gateway 显式设置；`subjects` 随声明在线 `streams.update` 追加 |
| durable consumer | 每个角色每个订阅 subject 一个：`<role>-<type 以 - 连接>-<sha256(subject) 前 8 位>`，`filter_subject` = 该 subject，`ack_policy: explicit` |

两套 permissions 模板（由 `dispatch/gateway` 渲染，均附带 JetStream 所需的 `$JS.API.>`、`$JS.ACK.>` publish 与 `_INBOX.>` subscribe）：

| 角色 | publish allow | subscribe allow |
|---|---|---|
| 中心 | JetStream + `dsh.events.<center 声明 publish 的 type>` | JetStream + `dsh.events.<center 声明 subscribe 的 type>` |
| 节点 | JetStream + `dsh.events.<node 声明 publish 的 type>` | JetStream + `dsh.events.<node 声明 subscribe 的 type>` |

没有声明文件的角色只保留 JetStream 基础权限，事件地址空间对其关闭。越权发布在 Gateway 被丢弃，客户端表现为 JetStream 发布无响应。

## 理解实现

<details>
<summary>实现说明与源码定位</summary>

- `src/envelope.ts`：`subjectFor`、`createEvent`、`parseEvent`、`nodeSource`。
- `src/identity.ts`：`nodeIdPath`、`initNodeId`、`readNodeId`。
- `src/catalog.ts`：事件目录 → permissions 文件（`writePermissions`）、`planStream`、`streamConfig`、`durableName`、`assertDeclared`。
- `src/service.ts`：`NatsDispatchMessaging`。`open()` 读 settings → 解析 seed → 写 permissions → 读 nodeId → `connect()`；断线重连完全用官方客户端（`reconnect` 默认开启），`subscribe()` 的循环只是在 consume 迭代器结束时重新打开它。
- `src/contract.ts`：Service Definition 与 `dispatch/envelope-rejected` 的 Cordis Events 声明。

</details>

## 已知限制与后续工作

- **真实 Gateway 场景未在本机验证**（本机没有 nats-server）。`tests/scenario.mjs` 覆盖：同宿主中心↔节点互发、坏信封被拒并记录、越权发布被 Gateway 拒绝、Gateway 重启后自动恢复、新增 type 在线生效。设 `DSH_NATS_SERVER=<二进制>` 后跑 `pnpm test`，或 `pnpm --filter dsh-secretary test:tracer`（缺二进制时明确失败并提示 `brew install nats-server`）。
- **permissions 在 Gateway 启动时生效**：声明变化后需重启 Gateway（`restartGateway`）；plugin 加载时写文件，若 Gateway 先于 plugin 启动，要再重启一次 Gateway 才会带上该角色的 permissions。
- **订阅回调 ACK 语义是临时最简**：handler 正常返回即 `ack()`，抛错 `nak()` 重投；「本地去重与受理提交后才 ACK」由 #100 替换。Outbox、受理记录也不在本包。
- `jsm.streams.update` 并发追加 subject 没有重试；两个角色同时首次发布不同 type 时理论上可能冲突一次，重试即可。
- 远程 `tls://` 只做了地址校验并打开 TLS，未验证证书等选项；JetStream 权限所需 subject（`$JS.API.>`、`$JS.ACK.>`、`_INBOX.>`）来自 NATS 官方文档，待真实服务器验证。
