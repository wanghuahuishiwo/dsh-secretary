---
description: "共享 Cordis tool 注册与 no-config schema。"
kind: "package-reference"
---

# dsh-secretary-tooling

## 概述

共享的 `OUTPUT` 输出约定与 `noConfig` 配置 schema；会话内工具已退役（#51），本包不再提供 tool 注册。

## 使用

本包由需要共享能力的 workspace 包以 `workspace:*` 依赖；不单独安装到 profile。

## 验证

从仓库根运行 `pnpm build` 与 `pnpm test`；本包随消费方一起验证。
