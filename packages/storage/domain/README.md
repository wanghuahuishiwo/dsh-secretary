---
description: "把 Secretary 的 GTD、Tag 与 Time 领域路由到同一 SQLite；供需要配置、排查或修改持久化归属的维护者阅读。"
kind: "package-reference"
---

# dsh-secretary-storage-domain

## 概述

本包让 Secretary 的 GTD、Tag 和 Time 事实共用一个 SQLite 文件，同时不接管宿主其他领域。消费方通过 `secretaryStorageDomain` 打开自己的领域，无需直接选择或操作 SQLite backend。

## 持久化语义

Secretary 的 Tag、Time 两个领域由本包路由到同一个 SQLite 文件；GTD 是 Markdown 数据面，不经过本包。读写在两个层次上工作：

- **领域在 open 时读取一次全量快照**，之后每条写入逐条写回 SQLite；关闭时不整表回写。
- 因此**外部写入**（迁移脚本、修复脚本、其他进程直接改库）不会被运行中的进程察觉，直到该领域重新加载。

### 重新加载

CLI（`dsh-secretary`）的 `tag reload` 与 `time reload` 关闭当前领域、按同一份 spec 重新打开，让之后的读写落在新快照上。它不重启宿主、不改写任何事实，也不触发领域间的联动。外部改库后必须显式 reload；否则服务继续返回旧值，用旧 id 上色还会把事实写到错误标签上。画布顶部提供同一件事的产品入口：刷新按钮调用 `TimeProductService.reloadWindow`，重读标签与时间块后重画当前窗口。GTD 数据面是 Markdown，现读即所见，无 reload。

### 坏记录隔离

领域 open 时若某条记录不再匹配 schema，包装层把它移出原表、写进 `secretary_quarantine` 领域并记录 error 日志，然后重试 open；域照常可用，其余记录不受影响。隔离记录保留原值与拒绝原因，供事后核对与修复。没有这一层时，一条历史脏数据会让整个域打不开，并连带让其他域的写入失败（例如标签引用检查会拦住任何标签删除）。

## 目录

- [使用本包](#使用本包)
- [理解实现](#理解实现)
- [模型体验](#模型体验)
- [已知限制与后续工作](#已知限制与后续工作)

-----

## 使用本包

### 组合与配置

本包由 Secretary bundle 组合，不需要单独安装。入口 `dsh-secretary-storage` 提供 `ctx.secretaryStorageDomain`，依赖 `storage` 和 `storage.backend.sqlite`。

本包没有自有 Config 字段。SQLite 文件和 journal mode 由 Secretary bundle 的 `cordis.patch.yml` 配置；默认文件是 `$DSH_HOME/storages/secretary.db`。

### 消费方式

GTD、Tag 与 Time 分别使用 `secretary_gtd`、`secretary_tag`、`secretary_time` 打开领域。其他领域不经过本设施，不能借此改写宿主默认存储路由。

## 理解实现

<details>
<summary>实现说明与源码定位</summary>

`src/index.ts` 用 `storageBackendServiceKey('sqlite')` 解析当前 backend，并只路由上述三个领域。卸载时关闭本设施打开的领域，不关闭由其他 Provider 拥有的共享 backend。

领域 open 失败且错误为 `invalid-record` 时，本设施把那条记录移出原表、写进 `secretary_quarantine` 领域（保留原值与拒绝原因），然后重试 open：一条读不出来的历史记录不该让整个域和依赖它的写入一起不可用。无法定位到具体记录的失败（global 槽、backend 故障）照原样抛出。

写入持久化和领域语义由实际领域包拥有；本包不提供跨领域事务，也不做旧数据迁移。

</details>

## 延伸阅读

- [运行架构](../../../docs/architecture.md)
- [Secretary bundle](../../bundle/secretary/README.md)

## 模型体验

### 模型上下文

#### 模型看到什么

无。本包不注册工具、提示词或会话事件；只有消费方通过自己的接口暴露数据时，模型才会看到相关结果。

#### Token 影响

零直接 token 影响。

#### KV Cache 影响

领域读写不改变模型请求前缀，也不会使缓存复用失效。

## 已知限制与后续工作

- 只路由 Secretary 拥有的三个领域，不提供通用宿主存储代理。
- 不提供跨领域事务、旧 JSON／Obsidian 数据复制或业务迁移。
- 隔离只做「不丢数据地绕开」，不做语义修复：原值能读回，但字段未补、未重写。
- 领域在 open 时取一次快照；外部改库要由领域消费者显式 reload，本设施不监视文件变化。
