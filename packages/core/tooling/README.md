---
description: "共享 Cordis tool 注册与 no-config schema。"
kind: "package-reference"
---

# dsh-secretary-tooling

## 概述

把 tool 定义注册进宿主 `tools` 服务，并统一 `OUTPUT` 渲染；不实现具体工具的领域语义。

## 使用

本包由需要共享能力的 workspace 包以 `workspace:*` 依赖；不单独安装到 profile。

## 验证

从仓库根运行 `pnpm build` 与 `pnpm test`；本包随消费方一起验证。
