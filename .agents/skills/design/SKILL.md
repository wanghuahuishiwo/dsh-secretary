---
name: design
description: 在 OpenDesign 里按需求 Issue 执行设计：改组件、壳与 fixture，构建预览，把产出写回 Issue。
disable-model-invocation: true
---

# design

在 OD 会话里按需求 Issue 执行设计。先读需求 Issue、[DESIGN.md](../../../DESIGN.md) 与相关 PRD 段落；Issue 里没有设计要求时，先让用户跑 `/to-design`。

**产物**：共享组件 + `design/<module>/` 的壳与 fixture。

**只改**：产品 UI（`src/ui`）与 `design/` 下的壳和 fixture。**不改**领域模型、Remote、数据库或领域 schema；需要新数据形状时写进 Issue 评论，留给后续开发流程决定。

**每轮**：按 Issue 上的最新意见改 → `pnpm --dir design build` → 预览入口 `design/<module>/index.html` → 提交到独立分支（不直接进 master）→ 把 commit SHA、改动、预览入口、待确认点写回 Issue 评论。

不自己确认、不进 Spec、不建票、不开 PR。
