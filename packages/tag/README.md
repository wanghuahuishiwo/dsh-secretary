---
description: "统一 Tag 能力：Service/contract 与 Agent 工具分属两个角色包。"
kind: "package-group"
---

# tag/

## 摘要

统一 Tag 能力；`time` / `context` 只是 `kind`。组目录是纯容器，不包含 `package.json` 或源码，仓库级包地图见 [packages/README.md](../README.md)。

## 包

| 包 | 名称 | 角色 |
|---|---|---|
| [`service/`](service/README.md) | `dsh-secretary-tag-service` | `TagService` 与 `./contract` |
| [`tool-tag/`](tool-tag/README.md) | `dsh-secretary-tool-tag` | 面向模型的 `secretary_tag` 工具 |

## 约束

- `service` 不注册 Agent 工具；`tool-tag` 只通过 `./contract` 消费 `TagService`。
- 跨包只依赖 Service contract，不 import 其他包的内部源码。
