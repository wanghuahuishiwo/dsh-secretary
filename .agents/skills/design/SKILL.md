---
name: design
description: 按需求 Issue 在 OpenDesign 里做设计：按 DESIGN.md 改组件、壳与 fixture，构建并提交分支与 PR，产出写回 Issue。
disable-model-invocation: true
---

# design

按需求 Issue 做设计。先读需求 Issue、[DESIGN.md](../../../DESIGN.md) 与相关 PRD 段落；Issue 里没有设计要求时，先让用户跑 `/to-design`。

**产物与边界**：按 [DESIGN.md](../../../DESIGN.md) 的组件分层、Adapter 边界与模块设计契约。

**只改**产品 UI（`src/ui`）与 `design/` 下的壳和 fixture；不改领域模型、Remote、数据库或领域 schema。需要新数据形状时写进 Issue 评论，留给后续开发流程决定。

**每轮**：按 Issue 上的最新意见改 → `pnpm --dir design build` → 提交并 push 到独立分支 → 开或更新 PR → 把分支与 PR 链接、commit SHA、改动、预览入口、待确认点写回 Issue 评论。

不自己确认、不进 Spec、不建票。
