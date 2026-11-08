---
description: "统一 Tag 能力；`time` / `context` 只是 kind。"
kind: "package-group"
---

# tag/

## 摘要

统一 Tag 能力；`time` / `context` 只是 kind。组目录是纯容器：不包含 `package.json` 或源码，包恰好在组下一层。仓库级包地图见 [packages/README.md](../README.md)。

## 包

| 包 | 名称 | 角色 |
|---|---|---|
| [`tag/`](tag/README.md) | `dsh-secretary-tag` | TagService、`./contract` 与 `secretary_tag` 工具 |

## 约束

- 跨包只依赖 Service contract、`./types` 或 Remote 契约，不 import 其他包的内部源码。
- 新增包先留在本组；需要拆包时按 [ADR 0010](../../docs/adr/0010-package-groups-and-roles.md) 的判据。
