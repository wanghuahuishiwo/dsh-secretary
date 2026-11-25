---
description: "agent-dispatch graph 执行引擎内核：节点注册表、入口声明、事件历史与重放；供写 graph node 或接入 Gateway／agent 宿主的开发者阅读。"
kind: "package-reference"
---

# dsh-secretary-dispatch-engine

## 概述

本包是 graph 执行引擎内核，中心与节点各装载一份。graph 开发者用 `defineNode({ name, inputs, outputs, run })` 声明节点并经 `ctx.graphNodes.register` 注册，用入口声明让一种事件开一个实例；`run(ctx, inputs)` 只写纯逻辑，副作用一律写成 `ctx.activities.<名字>(参数)`，由引擎执行一次并记入事件历史。重启后 `resume(instanceId)` 从头重跑 `run`，已记录的调用按结果注入、不再执行。

## 使用本包

本包由 Secretary bundle 的中心／节点角色各自装载，不单独安装。

| 出口 | 作用 |
|---|---|
| `.` | 插件入口、`DispatchEngine`、`Config`、`NonDeterminismError`、`fingerprint` |
| `./contract` | `defineNode`、`Port`、`NodeDefinition`、`EntryDeclaration`、`DispatchEvent` 等类型 |
| `./history` | `openEventHistory(path)`：事件历史存储 |

Config（两个角色各给一份）：

| 字段 | 说明 |
|---|---|
| `role` | `center` 或 `node` |
| `historyPath` | 事件历史 SQLite 文件；每个引擎独占一个，文件名带角色标识 |

Service key 为 `dispatchEngine`（引擎）与 `graphNodes`（注册表）。同宿主同时装载中心与节点时，两条 Loader entry 各自配置 `isolate: { dispatchEngine: true, graphNodes: true }`，两份引擎的注册表、历史与 Service 互不可见。不依赖 DSH schedule，不占用 `workflowEngine`。

### 引擎接口

| 成员 | 作用 |
|---|---|
| `nodes.register(defineNode(...))`（即 `ctx.graphNodes.register`） | 注册节点；同名重复注册抛错。返回取消函数 |
| `declareEntry({ graph, on, node, output, adapt })` | 声明入口。`output` 的端口集合与 `type` 标签必须与进入节点的 `inputs` 一致，否则声明时抛错 |
| `feed(event)` | 喂一条事件 `{ id, type, data? }`。有入口认领则为每个入口开一个实例并跑完；没有则记 `unmatched` |
| `resume(instanceId)` | 按历史重放该实例；已完成的实例直接返回结果不再执行 |
| `activities.register(name, handler)` | 注册 activity 的执行侧。`emit` 由引擎提供，不可覆盖 |
| `setEmitSink(sink)` | `ctx.activities.emit({ type, data })` 把事件 `{ id, type, data }` 交给的 sink；未设置时 `emit` 抛错。接 Gateway 由后续工单在此注入 |
| `history` | 事件历史：`listByInstance`、`listByEventId`、`instanceIds` |

`agent` activity 的调用约定是 `ctx.activities.agent({ prompt })` 返回 `{ text, structured?, nativeIds? }`；本包只提供注册位，宿主适配器由后续工单经 `activities.register('agent', ...)` 接入，未注册时调用抛错、实例失败。

### 参数指纹

`fingerprint(name, args) = sha256(JSON(排序键后的 ['activity', name, args]))`，`undefined` 字段丢弃。重放时按顺序游标取下一条已记录调用，名字或指纹不同即抛 `NonDeterminismError`（`nodeId` 指出节点），实例记为失败。

### 事件历史

只追加，记录形状 `{ seq, at, kind, instanceId, graphId, nodeId?, eventId?, payload }`。`kind`：`instance.opened`（payload 为进入节点、原始事件与适配后的输入）、`node.started`、`activity.completed`（每次 activity 完成，payload `{ name, fingerprint, result }`）、`node.completed`（payload 为 `outputs` 或 `error`）、`unmatched`（无实例，`instanceId`／`graphId` 为 `null`）。

## 理解实现

<details>
<summary>实现说明与源码定位</summary>

`src/index.ts` 是引擎与插件入口；`src/contract.ts` 是 `defineNode` 与共享类型；`src/history.ts` 用 `node:sqlite` 直接写独立文件（`node:sqlite` 同步写，不经 `ctx.storageDomain`）。隔离区一期就是把 `run` 的 `ctx.activities` 换成记录／重放代理后直接调用，不做 vm 或 worker 隔离。

</details>

## 验证

从本包目录运行 `pnpm test`（先 build 再跑 node:test）；覆盖注册节点与入口、事件开实例、activity 结果入历史、重启后重放不重跑、指纹不匹配报错、入口类型检查与双引擎隔离。

## 已知限制与后续工作

- 一期不做 waitFor、子图、invoke、并行、实例级共享上下文，也不做节点间连线：实例只执行入口节点。
- 端口的结构校验在喂事件时对适配器输出执行；声明时只比较端口集合与 `type` 标签。
- `emit` 只到进程内 sink，接 Gateway 与 `agent` 宿主接入由后续工单完成。
