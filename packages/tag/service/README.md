---
description: "Secretary 的统一 time／context 标签树 Service 与 contract；供消费 TagService、排查引用一致性或迁移标签领域的用户与维护者阅读。"
kind: "package-reference"
---

# dsh-secretary-tag-service

## 概述

本包提供唯一 `TagService` 与 `./contract`：Time 和 GTD 共用一棵可持续保存的标签树，数字 ID 用于精确关联，`time` 与 `context` 两种 `kind` 不会因同名而合并。面向模型的 `secretary_tag` 工具在 [`tool-tag`](../tool-tag/README.md)，不在本包。

## 使用本包

本包由 Secretary bundle 组合，不单独安装。

| 出口 | 作用 |
|---|---|
| `.` | 提供 `TagService` |
| `./contract` | Tag 类型、输入与引用检查接口 |

本包没有 Config。TagManager UI/Remote 尚未实现；本包只提供 Service 事实。

## 理解实现

<details>
<summary>实现说明与源码定位</summary>

`src/index.ts` 实现 Tag 树、唯一性与引用保护；`src/contract.ts` 是消费者共享的类型与接口。数据落在唯一的 `tags` 表，`time` / `context` 只是 `kind`。

</details>

## 延伸阅读

- [Tag 产品范围](../../../docs/prd/README.md)
- [Tag Agent 工具](../tool-tag/README.md)
- [运行架构](../../../docs/architecture.md)

## 模型体验

### 模型上下文

本包不添加模型输入；`secretary_tag` 的工具 schema 与结果由 `tool-tag` 拥有。

#### Token 影响

零直接 token 影响。

#### KV Cache 影响

标签读取与写入不改变模型请求前缀。

## 已知限制与后续工作

- 不注册 Agent 工具或 UI；共享 TagManager UI/Remote 后置。
