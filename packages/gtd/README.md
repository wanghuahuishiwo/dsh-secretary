---
description: "GTD 能力族：领域 Service、模型工具与 Agent 技能分属三个角色包。"
kind: "package-group"
---

# gtd/

## 摘要

GTD 能力族：Inbox、Project、Action 事实与派生查询，及其模型工具和用户技能。组目录是纯容器，仓库级包地图见 [packages/README.md](../README.md)。

## 包

| 包 | 名称 | 角色 |
|---|---|---|
| [`service/`](service/README.md) | `dsh-secretary-gtd-service` | `GtdService` 与 `./contract` |
| [`tool-gtd/`](tool-gtd/README.md) | `dsh-secretary-tool-gtd` | 面向模型的 `secretary_gtd` 工具 |
| [`agent/`](agent/README.md) | `dsh-secretary-gtd-agent` | 用户侧 GTD 技能与技能资产 |

## 约束

- `service` 不注册工具或技能；`tool-gtd`、`agent` 只通过 `./contract` 与领域事实交互。
- 跨包只依赖 Service contract，不 import 其他包的内部源码。
