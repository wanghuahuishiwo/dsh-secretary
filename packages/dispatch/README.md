---
description: "agent-dispatch 底座能力族。"
kind: "package-group"
---

# dispatch/

## 摘要

agent-dispatch 底座能力族。组目录是纯容器：不包含 `package.json` 或源码，包恰好在组下一层。仓库级包地图见 [packages/README.md](../README.md)。

## 包

| 包 | 名称 | 角色 |
|---|---|---|
| [`engine/`](engine/README.md) | `dsh-secretary-dispatch-engine` | graph 执行引擎内核：节点注册表、入口、事件历史与重放 |

## 约束

- 跨包只依赖 Service contract，不 import 其他包的内部源码。
