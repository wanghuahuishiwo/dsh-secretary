---
description: "从 Markdown frontmatter 注册 skill 资源。"
kind: "package-reference"
---

# dsh-secretary-skill-resources

## 概述

读取 skill 文件、校验 frontmatter 并注册到宿主 `skills` 服务；不决定 skill 的业务内容。

## 使用

本包由需要共享能力的 workspace 包以 `workspace:*` 依赖；不单独安装到 profile。

## 验证

从仓库根运行 `pnpm build` 与 `pnpm test`；本包随消费方一起验证。
