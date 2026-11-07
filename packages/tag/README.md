---
description: "Secretary 的统一 time／context 标签树与 Agent 工具；供需要使用标签、配置标签领域或排查引用一致性的用户与维护者阅读。"
kind: "package-reference"
---

# dsh-secretary-tag

## 概述

本包让 Time 和 GTD 共用一棵可持续保存的标签树。Agent 可以列出、创建、重命名、移动和删除标签；数字 ID 用于精确关联，`time` 与 `context` 两种用途不会因同名而合并。

Tag 是一个共享模块：唯一 `TagService`、唯一 `tags` 表，`time` / `context` 只是 `kind`。GTD 和 TimeBlock 将按 `kind` 使用同一套共享 `TagManager` UI 管理同一批标签；本包当前只提供 Service 与 Agent tools，TagManager UI/Remote 尚未实现。

## 目录

- [使用本包](#使用本包)
- [理解实现](#理解实现)
- [模型体验](#模型体验)
- [已知限制与后续工作](#已知限制与后续工作)

-----

## 使用本包

### 组合与工具

本包由 Secretary bundle 挂载。`dsh-secretary-tag` 提供 `ctx.tags` 和 `ctx.tagReferences`，`/tools` 注册公共工具 `secretary_tag`，支持 `list / get / create / update / move / delete`。

| Config 字段 | 默认值 | 含义 |
|---|---|---|
| `domain` | `secretary_tag` | 标签树使用的存储领域名称 |

子标签继承父级 `kind`。移动不能跨 `kind` 或形成循环；有子级或仍被领域记录引用时不能删除。

## 理解实现

<details>
<summary>实现说明与源码定位</summary>

Tag 保存 `id / name / kind / parentId? / color?`。GTD 与 Time 通过 `tagReferences` 注册只读引用 inspector，并在写入引用时与 Tag 删除共用一致性队列；这不是跨领域事务。

标签事实默认路由到 `$DSH_HOME/storages/secretary.db`。GTD 的 effective Tags 由 GTD 自己派生，本包不复制继承结果。

</details>

## 延伸阅读

- [领域术语](../../docs/glossary.md)
- [当前数据模型](../../docs/data-model.md)
- [Time 领域](../time-block/README.md)

## 模型体验

### Tag 工具与结果

#### 模型看到什么

挂载工具时，模型看到 `secretary_tag` 的操作描述、输入 schema，以及调用后返回的标签或错误结果。

#### Token 影响

工具 schema 在挂载期间产生固定开销；结果 token 随标签字段、树大小和错误内容变化。

#### KV Cache 影响

未变更的工具定义保留请求前缀；修改工具定义可能使前缀失效，工具结果只追加到对话历史。

## 已知限制与后续工作

- 当前只有 `time` 和 `context` 两种 `kind`。
- TagManager UI 和浏览器写入 Remote 尚未实现；Time 产品当前只读取时间标签树。
- Tag 不是独立产品入口；共享 UI/Remote 的边界由后续设计和实现承接。
