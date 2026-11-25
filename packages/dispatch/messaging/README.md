---
description: "基础通信插件：NKey 连接 Gateway、CloudEvents 1.0.2 信封（DSH profile）、nodeId 身份文件、一个 JetStream stream 与 durable consumer 的在线创建、按角色的 subject permissions，以及 Transactional Outbox 可靠发布与持久受理后才 ACK。"
kind: "package-reference"
---

# dsh-secretary-dispatch-messaging

## 概述

业务插件只依赖本插件的公开能力就能发／收 CloudEvents 事件。连接由 NKey 鉴权，seed 在本插件进程内经 `ctx.credentials.resolve(ref)` 解析后直接交给官方 `nkeyAuthenticator`，对外只有「发布／订阅」。发布走 Transactional Outbox（#100），消费端先落 Inbox 再 ACK。设计依据见 [foundation.md §2](../../../docs/agent-dispatch/foundation.md) 与 [overview.md §2](../../../docs/agent-dispatch/overview.md)（Gateway 协议）。

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
| `.` | 插件入口（`name`、`inject`、`apply`、`Config`）、`NatsDispatchMessaging`、`openOutbox`／`outboxPath` 与全部纯函数 |
| `./contract` | Service Definition `DispatchMessaging`、`SERVICE_KEY` 与事件类型；`EventHandler`、`Outbox`／`OutboxTransaction` 等类型 |

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
| `publish({ type, data, id?, time?, datacontenttype?, dataschema? })` | 把事件写进 Outbox（一个只含该事件的 `transaction`），中继以 `Nats-Msg-Id = event.id` 发布并重试到收到 PubAck 为止；那时才返回 `{ event, stream, seq, duplicate }`。Gateway 不在线时一直 pending，不丢、不拒绝 |
| `outbox.transaction(tx => { … })` | **业务结果与待发事件同一事务**：回调里用 `tx.db`（`node:sqlite` 的 `DatabaseSync`，与 Outbox 同一文件同一连接）写业务表、用 `tx.publish({ type, data, id?, time? }, source)` 排队事件；抛错全部回滚。回调返回 Promise 时事务保持到它 settle。同步，不可嵌套（嵌套抛 `messaging/outbox-busy`） |
| `outbox.pending()` / `outbox.entries()` / `outbox.accepted()` | 读接口：待发事件、全部 Outbox 记录（旧→新）、Inbox 受理记录（旧→新），均为普通对象，控制台原样展示 |
| `kickRelay()` | 立即唤醒中继（提交后已自动唤醒；轮询兜底） |
| `subscribe({ type }, handler)` | 在线确保 stream 捕获与 durable consumer；收到合法事件时在 Inbox 事务里调用 `handler(event, { subject, stream, seq }, tx)`：受理记录、handler 经 `tx` 写下的业务行、consumer ACK 依次发生；已受理过的 `event.id` 直接 ACK，不再调用 handler。返回 `{ type, subject, durable, stop() }` |
| 事件 `dispatch/envelope-rejected` | 收到不合规信封时发出 `{ role, subject, stream, seq, reason }`，消息被 `term()`，不投递、不重投；同时写 logger。Cordis 事件不按 realm 隔离，同宿主各角色 realm 的监听器都会收到，按 `role` 过滤 |

## 信封与地址

- 线上形态：CloudEvents Core 1.0.2 + JSON Event Format 1.0.2 + NATS Protocol Binding 1.0.2（structured content mode，整个 JSON 即 NATS payload）。规范依据：[Core](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md)、[JSON Event Format](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/formats/json-format.md)、[NATS Protocol Binding](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/bindings/nats-protocol-binding.md)。
- 校验（`parseEvent`）：`specversion` 必须为 `"1.0"`；`id`、`source`、`type` 非空字符串；JSON 中 `null` 属性视为未设置并丢弃，其余属性必须是字符串；`data` 必填（JSON Format 中可选，此处为 DSH 约束）且不做内容校验；`time` 必填且为 RFC 3339；`dataschema` 与扩展属性原样透传，DSH 不定义扩展属性。
- DSH profile：`source` 只能是 `urn:dsh:center` 或 `urn:dsh:node:<UUID>`；`id` 由 `createEvent` 用 `randomUUID()` 生成（全局唯一），接收端按 `id` 在 Inbox 去重。
- NATS subject 固定派生：`dsh.events.<type>`，`type` 只能是点分的小写 token（`[a-z0-9][a-z0-9_-]*`）。规范没有规定 `type → subject` 的映射，这是 DSH profile（依据 [cloudevents-subject-practices](../../../docs/agent-dispatch/evidence/cloudevents-subject-practices.md)）。接收时 `type` 与所在 subject 必须配对，否则按不合规拒绝。CloudEvents 可选属性 `subject` 不生成、不依赖，但带着它的事件不被拒绝。
- DSH 原生事件省略 CE `subject`：`createEvent` 不写；外部合法 CloudEvents 带该属性时照常接收。

## 文件与权限

| 文件 | 内容 |
|---|---|
| `$DSH_HOME/dispatch/node/identity.json` | `{ "nodeId": "<UUIDv4>" }`，0600；`initNodeId` 用 `link()` 原子创建，已存在即报 `messaging/identity-exists`；普通启动缺失 `messaging/identity-missing`、损坏 `messaging/identity-invalid`，都不换号 |
| `$DSH_HOME/gateway/permissions.<role>.json` | 本插件按 `publish`/`subscribe` 声明写出（`{ publish: [subject], subscribe: [subject] }`）；Gateway 启动时读取并渲染进 `nats-server.conf` 的 `authorization.users[].permission` |
| JetStream stream `dsh-events` | File + Limits，`store_dir` 由 Gateway 显式设置；`subjects` 随声明在线 `streams.update` 追加 |
| `$DSH_HOME/dispatch/<role>/outbox.sqlite` | 该角色自管的 `node:sqlite` 文件（WAL，目录 0700）：Outbox 表 `outbox` 与 Inbox 表 `inbox`，见「Outbox 与 Inbox」 |
| durable consumer | 每个角色每个订阅 subject 一个：`<role>-<type 以 - 连接>-<sha256(subject) 前 8 位>`，`filter_subject` = 该 subject，`ack_policy: explicit` |

两套 permissions 模板（由 `dispatch/gateway` 渲染，均附带 JetStream 所需的 `$JS.API.>`、`$JS.ACK.>` publish 与 `_INBOX.>` subscribe）：

| 角色 | publish allow | subscribe allow |
|---|---|---|
| 中心 | JetStream + `dsh.events.<center 声明 publish 的 type>` | JetStream + `dsh.events.<center 声明 subscribe 的 type>` |
| 节点 | JetStream + `dsh.events.<node 声明 publish 的 type>` | JetStream + `dsh.events.<node 声明 subscribe 的 type>` |

没有声明文件的角色只保留 JetStream 基础权限，事件地址空间对其关闭。越权发布在 Gateway 立刻被拒，客户端表现为发布抛错（`@nats-io` v3 SDK：`RequestError`，`cause` 为 `PermissionViolationError`，消息 `Permissions Violation for Publish to "<subject>"`）。

## Outbox 与 Inbox

Transactional Outbox（#100，依据 #83 §可靠发布与持久受理）。不用宿主 `storageDomain`（无跨表事务、无索引），不引 Debezium／Kafka，也没有常驻中继进程：中继是插件内的一段循环。

- **表结构**（`src/outbox.ts`，两张表同一文件）：
  - `outbox(id PK, type, subject, event JSON, status pending|published, attempts, createdAt, publishedAt, stream, seq, lastError)`，索引 `(status, createdAt)`；`event` 是完整 CloudEvents 信封，中继原样发布。
  - `inbox(id PK, type, subject, stream, seq, acceptedAt)`，`id` = 事件 id。
- **业务结果与事件同一事务**：业务表可以建在同一文件里（`messaging.outbox.db.exec(...)`），在 `outbox.transaction(tx => { … })` 内用 `tx.db` 写业务行、`tx.publish(...)` 排队事件，一起提交或一起回滚。回调返回 Promise 时，事务保持到它 settle；期间该连接上的另一个 `transaction` 抛 `messaging/outbox-busy`。同一 `id` 不能排两次（`messaging/outbox-duplicate-id`）。
- **中继**：连接就绪后在插件内启动（`ctx.effect` 随插件停止），按 `createdAt` 顺序取 `pending`，逐条 `js.publish(..., { msgID: event.id })`，收到 PubAck 即 `markPublished` 并唤醒等待中的 `publish`；失败记 `attempts`/`lastError`，1 秒后重试，无上限、不丢。每次提交会唤醒它，另有 1 秒轮询兜底，所以崩溃重启后无需任何操作即继续补发。一轮内按顺序发布，前一条失败则本轮停下，下一轮从头重试。
- **持久受理**：`deliver` 在 `outbox.transaction` 里先 `tx.accept`（向 `inbox` 插入；已存在即返回 false，不再调 handler）再调 handler；事务提交后才 `ack()`。handler 抛错则受理记录一并回滚并 `nak()` 重投。**ACK 只表示持久受理，不表示执行完成**：handler 应把「接下这件事」的事实写进 `tx`，执行本身在事务外进行。
- **可能重复，不替代长期幂等**：JetStream 的 `Nats-Msg-Id` 去重只有短期窗口（默认 2 分钟），超过窗口的重复发布会在 stream 里留下多份；Inbox 保证同一 `event.id` 只受理一次，但 Inbox 不是业务效果的幂等键，业务效果自己的幂等仍由业务负责。
- **不是高可用**：一期 stream R=1，Outbox 文件也是单机单份；File 存储、durable consumer 与 Outbox 解决的是**重启恢复**（进程崩溃、NATS 重启），不解决机器或磁盘永久丢失。


<details>
<summary>实现说明与源码定位</summary>

- `src/envelope.ts`：`subjectFor`、`createEvent`、`parseEvent`、`nodeSource`。
- `src/identity.ts`：`nodeIdPath`、`initNodeId`、`readNodeId`。
- `src/catalog.ts`：事件目录 → permissions 文件（`writePermissions`）、`planStream`、`streamConfig`、`durableName`、`assertDeclared`。
- `src/service.ts`：`NatsDispatchMessaging`。`open()` 读 settings → 解析 seed → 写 permissions → 读 nodeId → `connect()`；断线重连完全用官方客户端（`reconnect` 默认开启），`subscribe()` 的循环只是在 consume 迭代器结束时重新打开它；`relay`／`drain` 是 Outbox 中继，`publish` 把事件排队后等待中继的 PubAck。
- `src/outbox.ts`：`openOutbox(path)`（建目录、建表、单连接事务）、`outboxPath(dshHome, role)`。
- `src/contract.ts`：Service Definition 与 `dispatch/envelope-rejected` 的 Cordis Events 声明。

</details>

## 已知限制与后续工作

- 真实 Gateway 场景（已在 nats-server 2.15.3 上跑通）。`tests/scenario.mjs` 覆盖：同宿主中心↔节点互发、坏信封被拒并记录、越权发布被 Gateway 拒绝、Gateway 重启后自动恢复、新增 type 在线生效；`tests/reliability.mjs` 覆盖 #83 场景 1–4（Gateway 停机期间提交的事件重启后补发；真实子进程在提交后、发布前退出，重启后以同一 `event.id` 补发；消费端在受理提交后、ACK 前崩溃，重投不重复产生效果；PubAck 丢失、中继重试、超过去重窗口仍只受理一次）；`tests/outbox.mjs` 是不需要 Gateway 的存储层测试。设 `DSH_NATS_SERVER=<二进制>` 后跑 `pnpm test`，或 `pnpm --filter dsh-secretary test:tracer`（缺二进制时明确失败并提示 `brew install nats-server`）。
- **permissions 在 Gateway 启动时生效**：声明变化后需重启 Gateway（`restartGateway`）；plugin 加载时写文件，若 Gateway 先于 plugin 启动，要再重启一次 Gateway 才会带上该角色的 permissions。
- `publish` 没有超时：Gateway 长时间不在线时调用一直 pending（事件安全地在 Outbox 里）；要「发完就走」的调用方不 await 它，或直接用 `outbox.transaction`。
- 消费端崩溃后，服务端要等 consumer 的 `ack_wait`（默认 30 秒）过去才重投；一期不改这个默认值。
- Outbox 记录标记 `published` 后保留不删，作为发布审计；清理策略后定。
- async handler 的事务在它 settle 前一直开着：期间不要在同一连接上开另一个事务，也不要做耗时工作。
- `jsm.streams.update` 并发追加 subject 没有重试；两个角色同时首次发布不同 type 时理论上可能冲突一次，重试即可。
- 远程 `tls://` 只做了地址校验并打开 TLS，未验证证书等选项。JetStream 权限 subject（`$JS.API.>`、`$JS.ACK.>`、`_INBOX.>`）已在真机验证够用。
- Gateway 重启期间（客户端官方重连完成前，约 1–2 秒）发起的 `publish`/`subscribe` 会以 SDK 的 `TimeoutError` 失败，SDK 不会在重连后补发该请求；调用方需自行重试。
