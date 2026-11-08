---
description: "浏览器产品 UI 与客户端插件。"
kind: "package-group"
---

# client/

## 摘要

浏览器产品 UI 与客户端插件。组目录是纯容器：不包含 `package.json` 或源码，包恰好在组下一层。仓库级包地图见 [packages/README.md](../README.md)。

## 包

| 包 | 名称 | 角色 |
|---|---|---|
| [`ui-time/`](ui-time/README.md) | `dsh-secretary-ui-time` | 纯 UI `./ui`、右栏插件 `./client` |
| [`ui-gtd/`](ui-gtd/README.md) | `dsh-secretary-ui-gtd` | 左栏入口与空白 main |

## 约束

- 跨包只依赖 Service contract、`./types` 或 Remote 契约，不 import 其他包的内部源码。
- 新增包先留在本组；需要拆包时按 [ADR 0010](../../docs/adr/0010-package-groups-and-roles.md) 的判据。
