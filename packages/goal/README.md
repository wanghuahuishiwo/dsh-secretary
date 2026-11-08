---
description: "上游 GoalService 的空 Provider，只建立共享能力 seam。"
kind: "package-group"
---

# goal/

## 摘要

上游 GoalService 的空 Provider，只建立共享能力 seam。组目录是纯容器：不包含 `package.json` 或源码，包恰好在组下一层。仓库级包地图见 [packages/README.md](../README.md)。

## 包

| 包 | 名称 | 角色 |
|---|---|---|
| [`goal/`](goal/README.md) | `dsh-secretary-goal` | 空 GoalService Provider；实体、模型与 UI 后置 |

## 约束

- 跨包只依赖 Service contract、`./types` 或 Remote 契约，不 import 其他包的内部源码。
- 新增包先留在本组；需要拆包时按 [ADR 0010](../../docs/adr/0010-package-groups-and-roles.md) 的判据。
