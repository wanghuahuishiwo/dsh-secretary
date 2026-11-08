---
description: "Secretary 的 SQLite 持久化入口。"
kind: "package-group"
---

# storage/

## 摘要

Secretary 的 SQLite 持久化入口。组目录是纯容器：不包含 `package.json` 或源码，包恰好在组下一层。仓库级包地图见 [packages/README.md](../README.md)。

## 包

| 包 | 名称 | 角色 |
|---|---|---|
| [`domain/`](domain/README.md) | `dsh-secretary-storage-domain` | `secretaryStorageDomain` facility，按 domain 路由到 SQLite |

## 约束

- 跨包只依赖 Service contract、`./types` 或 Remote 契约，不 import 其他包的内部源码。
