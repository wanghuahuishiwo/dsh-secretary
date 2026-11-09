---
description: "面向模型的 secretary_tag 工具；供需要创建、重命名、移动或删除 Tag 的用户与维护者阅读。"
kind: "package-reference"
---

# dsh-secretary-tool-tag

## 概述

本包把 `TagService` 的 create / get / list / update / move / delete 以及 reload 操作暴露为 `secretary_tag` 工具。它只消费 [`tag-service`](../service/README.md) 的 `./contract`，不拥有标签事实。

## 使用本包

由 Secretary preset 组合，不单独安装。

| 出口 | 作用 |
|---|---|
| `.` | 注册 `secretary_tag`，注入 `tools` 与 `tags` |

## 理解实现

`src/index.ts` 定义工具 schema 并调用 `TagService`；校验与错误文案遵循同一 Service 契约。`op: reload` 让运行中的服务重新读取持久化标签，用于外部改库之后。

## 延伸阅读

- [Tag Service](../service/README.md)
- [运行架构](../../../docs/architecture.md)

## 模型体验

### 模型上下文

模型看到 `secretary_tag` 的 op schema 与 Tool 结果。

#### Token 影响

仅在模型调用工具时产生 schema 与结果 token。

#### KV Cache 影响

不改变系统提示或请求前缀。

## 已知限制与后续工作

- 不提供 Tag 管理 UI。
