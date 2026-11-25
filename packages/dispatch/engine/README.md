---
description: "agent-dispatch graph 执行引擎内核：节点注册表、入口声明、事件历史与重放；接入基础通信后事件入图、节点经 emit 上 stream、引擎发 graph 生命周期事件。供写 graph node 或装配中心／节点的开发者阅读。"
kind: "package-reference"
---

# dsh-secretary-dispatch-engine

## 概述

本包是 graph 执行引擎内核，中心与节点各装载一份。graph 开发者用 `defineNode({ name, inputs, outputs, run })` 声明节点并经 `ctx.graphNodes.register` 注册，用入口声明让一种事件开一个实例；入口可带 `edges` 把入口节点与后续节点连成一条顺序链，上游 outputs 原样成为下游 inputs。`run(ctx, inputs)` 只写纯逻辑，副作用一律写成 `ctx.activities.<名字>(参数)`，由引擎执行一次并记入事件历史。重启后 `resume(instanceId)` 从头重放：已完成的节点直接取回记录的 outputs，未完成的节点从头跑 `run`，其中已记录的 activity 调用按结果注入、不再执行。

## 使用本包

本包由 Secretary bundle 的中心／节点角色各自装载，不单独安装。

两种接法：

- **接入基础通信**（插件入口，`inject: ['dispatchMessaging']`）：引擎与同角色的 [`dispatch/messaging`](../messaging/README.md) 装在同一个 `cordis:group` 里。事件经 durable consumer 入图；`emit` 与生命周期事件经该角色的 Outbox 上 stream；事件历史是该角色 Outbox 文件里的 `history` 表，于是「开实例的记录 + `graph.instance.started`」「`emit` 的记录 + 节点事件」「完成记录 + `graph.instance.finished`」各自是同一事务，崩溃不会留下只写了一半的记录或事件。
- **不经基础通信**（直接 `ctx.plugin(DispatchEngine, { role, historyPath })`，不经插件入口）：事件历史在自己的 SQLite 文件，`emit` 交给 `setEmitSink` 设的进程内 sink，没有生命周期事件。给单测与进程内嵌入用。

| 出口 | 作用 |
|---|---|
| `.` | 插件入口（`inject`、`apply`）、`DispatchEngine`、`Config`、`NonDeterminismError`、`fingerprint`、`STARTED`／`FINISHED` |
| `./contract` | `defineNode`、`Port`、`NodeDefinition`、`Edge`、`EntryDeclaration`、`DispatchEvent` 等类型 |
| `./history` | `openEventHistory(path)`：事件历史存储 |

Config（两个角色各给一份）：

| 字段 | 说明 |
|---|---|
| `role` | `center` 或 `node` |
| `historyPath` | 可选。只在直接构造且没有 `dispatchMessaging` 时用：事件历史 SQLite 文件，每个引擎独占一个，文件名带角色标识。插件入口有 `dispatchMessaging`，忽略它 |

装配行（中心与节点各一组，放在各自的 `cordis:group` 里；engine 在 messaging 之后由 inject 驱动，与行序无关）：

```yaml
- id: dispatch-center
  name: cordis:group
  group: true
  isolate:
    dispatchMessaging: true
    dispatchEngine: true
    graphNodes: true
  config:
    - id: dispatch-center-messaging
      name: dsh-secretary-dispatch-messaging
      config:
        role: center
        publish: [graph.instance.started, graph.instance.finished, work.reported]   # 必须含两个生命周期 type
        subscribe: [task.assigned]                                                  # 必须含每个入口的 on
    - id: dispatch-center-engine
      name: dsh-secretary-dispatch-engine
      config:
        role: center
    # 节点同形：id 换 node、role 换 node、messaging 另加 initNodeId
```

Service key 为 `dispatchEngine`（引擎）与 `graphNodes`（注册表），`isolate` 三个 key 一起隔离，两份引擎的注册表、历史与 Service 互不可见。**不要默认写进 bundle 的 `cordis.patch.yml`**（#99：普通桌面启动即失败），需要的机器在自己的 profile 里加。

事件历史文件：接入基础通信时是 `$DSH_HOME/dispatch/<role>/outbox.sqlite`（`dispatchMessaging` 的 Outbox 文件）的 `history` 表；控制台读路径（`api/dispatch-controller`）把 `historyPath` 指到这个文件。不用宿主 `storageDomain`，不与 schedule 等共库。不依赖 DSH schedule，不占用 `workflowEngine`。

### 引擎接口

| 成员 | 作用 |
|---|---|
| `nodes.register(defineNode(...))`（即 `ctx.graphNodes.register`） | 注册节点；同名重复注册抛错。返回取消函数 |
| `declareEntry({ graph, on, node, edges?, output, adapt })` | 声明入口。`output` 的端口集合与 `type` 标签必须与进入节点的 `inputs` 一致，`edges` 每条连线的端口也必须兼容（见下节），否则声明时抛错 |
| `feed(event)` | 喂一条事件 `{ id, type, data? }`。有入口认领则为每个入口开一个实例并跑完；没有则记 `unmatched`。接了基础通信时这是 subscribe handler 在做的事，业务代码一般不直接调 |
| `resume(instanceId)` | 按历史重放该实例；已完成的实例直接返回结果不再执行 |
| `activities.register(name, handler)` | 注册 activity 的执行侧。`emit` 由引擎提供，不可覆盖 |
| `setEmitSink(sink)` | 只在不接基础通信时用：`ctx.activities.emit({ type, data })` 把事件 `{ id, type, data }` 交给的 sink；未设置时 `emit` 抛错 |
| `history` | 事件历史：`listByInstance`、`listByEventId`、`instanceIds` |

接了基础通信时的三条约定（#102）：

- **事件入图**：引擎按角色事件目录的 `subscribe` 逐 type 订阅（一个 type 一个 durable consumer，启动时顺序建）。`declareEntry` 的 `on` 必须在 `subscribe` 里，否则声明时抛 `messaging/not-declared`；目录里没有入口的 type 收到事件即记 `unmatched`，stream 上不出任何事件。
- **`ctx.activities.emit({ type, data })`**：`type` 必须在角色的 `publish` 里，否则抛 `messaging/not-declared`、实例失败；`data` 必填（CloudEvents 约束，没有内容给 `null`），原样放进事件；`source` 是所在角色身份（中心 `urn:dsh:center`，节点 `urn:dsh:node:<nodeId>`）。事件与这次 activity 的记录同一事务排进 Outbox，由中继发布，不在这里等 PubAck；重放时记录注入，不再发。
- **生命周期事件由引擎发**：`graph.instance.started`（`data = { instanceId, graphId, entryEventId }`）与 `instance.opened` 同一事务；`graph.instance.finished`（`data = { instanceId, graphId, outcome: ok | error }`）与链尾节点（或失败节点）的 `node.completed` 同一事务。两个 type 必须在角色的 `publish` 里，否则引擎加载失败。与节点事件同一信封、同一 Outbox、同一 stream；一个实例各只发一次，`resume` 已结束的实例不再发。

`agent` activity 的调用约定是 `ctx.activities.agent({ prompt })` 返回 `{ text, structured?, nativeIds? }`；本包只提供注册位，宿主适配器由后续工单经 `activities.register('agent', ...)` 接入，未注册时调用抛错、实例失败。

### 顺序链连线

一期的 graph 就是一个入口加一条顺序链（sequential chain），连线声明在入口上：

```ts
engine.declareEntry({
  graph: 'task', on: 'task.assigned', node: 'work',
  edges: [{ from: 'work', to: 'report' }],
  output: { ticket }, adapt: event => event.data,
})
```

| 规则 | 说明 |
|---|---|
| 形状 | `edges: [{ from, to }]`，`from`／`to` 为已注册节点名。只支持顺序链：每个节点最多一条出边、一条入边，入口节点没有入边，不允许环；不并行、不分叉、不合并、不做条件路由 |
| 执行 | 实例从入口节点开始，节点完成后沿其唯一出边进入下一个节点；链尾（无出边）完成即实例完成，实例 `outputs` 为链尾节点的 outputs。任一节点失败则实例失败，不再向下执行 |
| 值传递 | 下游节点 `run(ctx, inputs)` 的 `inputs` 就是上游节点的 `outputs` 对象，原样传递、不改名不转换；因此连线两端端口集合必须完全一致 |
| 声明时校验 | `from.outputs` 与 `to.inputs` 的端口名集合、`type` 标签不一致即抛错，消息指明连线（`edge "work" -> "report"`）、端口名与两侧 `type`；端口结构校验 `check` 仍在运行时对实际值执行 |
| 恢复粒度 | 重放时已完成节点（有 `node.completed` 记录）直接取回 outputs，不重跑；未完成节点从头跑 `run`，其中该节点已记录的 `activity.completed` 按顺序注入、不重跑 |

`edges` 随 `instance.opened` 一起记入历史，`resume` 按记录的连线重放，不受之后入口声明变更影响。

### 参数指纹

`fingerprint(name, args) = sha256(JSON(排序键后的 ['activity', name, args]))`，`undefined` 字段丢弃。重放时按顺序游标取下一条已记录调用，名字或指纹不同即抛 `NonDeterminismError`（`nodeId` 指出节点），实例记为失败。

### 事件历史

只追加，记录形状 `{ seq, at, kind, instanceId, graphId, nodeId?, eventId?, payload }`。没有新增 kind：实例是否结束、结果如何，看链上最后一个 `node.completed`（`payload.error` 有值即失败）。实例结束后不会自动 `resume`，重启后由宿主对未结束的实例调 `resume(instanceId)`。`kind`：`instance.opened`（payload 为进入节点 `node`、连线 `edges`、原始事件与适配后的输入）、`node.started`（payload 为该节点的 `inputs`）、`activity.completed`（每次 activity 完成，payload `{ name, fingerprint, result }`）、`node.completed`（payload 为 `outputs` 或 `error`）、`unmatched`（无实例，`instanceId`／`graphId` 为 `null`）。

## 理解实现

<details>
<summary>实现说明与源码定位</summary>

`src/index.ts` 是引擎与插件入口（`runChain` 沿连线依次调 `runNode`，`checkEdges` 做声明时校验）；`src/contract.ts` 是 `defineNode`、`Edge` 与共享类型；`write` 是「记录 + 事件」的原子单元，`receive` 是 subscribe handler；`src/history.ts` 用 `node:sqlite` 写自己的文件或一个交给它的连接（接基础通信时是 Outbox 的连接；同步写，不经 `ctx.storageDomain`）。隔离区一期就是把 `run` 的 `ctx.activities` 换成记录／重放代理后直接调用，不做 vm 或 worker 隔离。

</details>

## 验证

从本包目录运行 `pnpm test`（先 build 再跑 node:test）：`tests/engine.mjs`、`tests/history.mjs` 覆盖注册节点与入口、事件开实例、activity 结果入历史、重启后重放不重跑、指纹不匹配报错、入口类型检查、顺序链执行与值传递、连线声明校验、链中途崩溃后按节点粒度恢复与双引擎隔离；`tests/wired.mjs` 用真实的 Outbox／Inbox 加一个替身的订阅面覆盖入图、`emit`、生命周期事件与未声明 type 的拒绝；`tests/tracer.mjs` 是真实 nats-server 上的验收（设 `DSH_NATS_SERVER` 后运行，或经 `pnpm --filter dsh-secretary test:tracer`，缺二进制时明确失败）。

## 已知限制与后续工作

- 连线只做顺序链（见「顺序链连线」）；一期不做 waitFor、子图、invoke、并行、分叉合并、条件路由与实例级共享上下文。
- 端口的结构校验在运行时对实际值执行（入口对适配器输出，连线对上游 outputs）；声明时只比较端口集合与 `type` 标签。
- `agent` 的宿主接入与骨架 graph 由 #103 完成。
- 入图只按事件目录订阅、只走入口（三叉路由的 ①waitFor 唤醒不做）；接了基础通信的实例在事件受理提交后于事务外执行，执行期间同一连接上的另一个事务仍会得到 `messaging/outbox-busy`，所以入口 `adapt` 应保持同步或很短。
- 重启后不自动 `resume` 未结束的实例（见「事件历史」）。
