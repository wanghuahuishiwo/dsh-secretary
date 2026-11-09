---
description: "Secretary 的 Inbox、Project 与 Action 领域 Service 与 contract；供需要理解事项事实、派生查询或迁移 GTD 领域的用户与维护者阅读。"
kind: "package-reference"
---

# dsh-secretary-gtd-service

## 概述

本包提供 `GtdService` 与 `./contract`：捕获、澄清、Project/Action 维护，以及 Next Actions、Forecast、Availability 与 effective Tags 等派生查询。事项状态与日期在重启后保留；完成或放弃行动不会伪造时间实录。模型工具与用户技能分别在 [`tool-gtd`](../tool-gtd/README.md) 和 [`agent`](../agent/README.md)。

## 使用本包

由 Secretary bundle 组合，不单独安装。

| 出口 | 作用 |
|---|---|
| `.` | 提供 `GtdService` |
| `./contract` | 事项事实、输入与查询接口 |

`reload()` 关闭当前领域并按同一份 spec 重新打开，用于外部改库（迁移、修复脚本）之后；它不改写项目、行动或收件箱事实，也不会让 GTD 与 Time 自动对齐。

## 理解实现

<details>
<summary>实现说明与源码定位</summary>

`src/index.ts` 实现事项事实、状态与派生查询；`src/contract.ts` 是 Agent 工具与产品共同消费的类型契约。数据通过 `secretaryStorageDomain` 写入共享 SQLite。

</details>

## 延伸阅读

- [GTD 产品范围](../../../docs/prd/gtd.md)
- [GTD 模型工具](../tool-gtd/README.md)
- [GTD Agent 技能](../agent/README.md)
- [运行架构](../../../docs/architecture.md)

## 模型体验

本包不直接添加模型输入；工具 schema 与技能内容分别由 `tool-gtd`、`agent` 拥有。

## 已知限制与后续工作

- 不注册工具、技能或 UI。
- 完整 GTD 工作区界面后置。
