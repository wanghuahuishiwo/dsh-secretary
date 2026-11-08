---
description: "面向模型的 secretary_gtd 工具；供需要捕获、澄清、安排或查询事项的用户与维护者阅读。"
kind: "package-reference"
---

# dsh-secretary-tool-gtd

## 概述

本包把 `GtdService` 的 Inbox、Project、Action 与 Forecast 操作暴露为 `secretary_gtd` 工具。它只消费 [`gtd-service`](../service/README.md) 的 `./contract`，不拥有事项事实。

## 使用本包

由 Secretary preset 组合，不单独安装。

| 出口 | 作用 |
|---|---|
| `.` | 注册 `secretary_gtd`，注入 `tools` 与 `gtd` |

## 理解实现

`src/index.ts` 定义工具 schema 并调用 `GtdService`；错误与结果词汇遵循同一 Service 契约。

## 延伸阅读

- [GTD Service](../service/README.md)
- [运行架构](../../../docs/architecture.md)

## 模型体验

模型看到 `secretary_gtd` 的 op schema 与 Tool 结果；不改变系统提示。

## 已知限制与后续工作

- 不提供 GTD 产品界面。
