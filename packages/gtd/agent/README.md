---
description: "GTD 用户侧技能（Inbox 捕获与澄清）；供需要调整技能内容或排查技能注册的维护者阅读。"
kind: "package-reference"
---

# dsh-secretary-gtd-agent

## 概述

本包注册两个用户可调用、模型不可自动调用的 GTD 技能：`gtd-inbox-capture` 与 `gtd-clarify`。技能只引导用户交互，不拥有事项事实；事实由 [`gtd-service`](../service/README.md) 保存。

## 使用本包

由 Secretary preset 组合，不单独安装。

| 出口 | 作用 |
|---|---|
| `.` | 注册两个 GTD 技能，注入 `skills` |

技能资产位于 `assets/<skill>/SKILL.md`，随包分发。

## 理解实现

`src/index.ts` 读取 `assets` 下的 Markdown frontmatter，经共享 `dsh-secretary-skill-resources` 注册；不直接读写 SQLite。

## 延伸阅读

- [GTD Service](../service/README.md)
- [GTD 产品范围](../../../docs/prd/gtd.md)

## 模型体验

模型可读取技能内容，但 `gtd-inbox-capture` / `gtd-clarify` 的 invocation 标记为仅用户可调用。

## 已知限制与后续工作

- 技能行为随 PRD 调整，不与领域事实重复维护。
