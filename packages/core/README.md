---
description: "共享基础设施子模块：校验、工具注册与 skill 资源注册。"
kind: "package-group"
---

# core/

## 摘要

共享基础设施能力族，按子模块拆包：每个包只服务一类复用需求。组目录是纯容器，不包含 `package.json` 或源码。仓库级包地图见 [packages/README.md](../README.md)。

## 包

| 包 | 名称 | 角色 |
|---|---|---|
| [`validation/`](validation/README.md) | `dsh-secretary-validation` | object / string / instant 等共享输入校验 |
| [`tooling/`](tooling/README.md) | `dsh-secretary-tooling` | Cordis tool 注册、`OUTPUT` 与 no-config schema |
| [`skill-resources/`](skill-resources/README.md) | `dsh-secretary-skill-resources` | 从 Markdown frontmatter 注册 skill 资产 |

## 约束

- 跨包只依赖公开导出，不 import 其他包的内部源码。
- 新增共享件先判断是否属于已有子模块；确需新角色时再拆包，并更新本页与 [packages/README.md](../README.md)。
