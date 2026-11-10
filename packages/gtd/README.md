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
| [`agent/`](agent/README.md) | `dsh-secretary-gtd-agent` | 用户侧 GTD 技能与技能资产 |

## 约束

- GTD 数据面是 Markdown（`gtdPath` 目录）；`agent` 只注册技能，SQLite GTD 域与工具已随 #51 退役。
- 跨包只依赖 Service contract，不 import 其他包的内部源码。
