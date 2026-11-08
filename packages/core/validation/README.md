---
description: "共享输入校验：object、非空字符串与 offset instant 等。"
kind: "package-reference"
---

# dsh-secretary-validation

## 概述

被领域包与工具共用的纯函数校验；不持有状态、不注册 Cordis 资源。

## 使用

本包由需要共享能力的 workspace 包以 `workspace:*` 依赖；不单独安装到 profile。

## 验证

从仓库根运行 `pnpm build` 与 `pnpm test`；本包随消费方一起验证。
