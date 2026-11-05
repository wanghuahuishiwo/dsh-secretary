# 0002 · 以 GTD + TimeBlock + Agent 取代 Action-only 模型

- 状态：已被取代（2026-11-03）
- 原决策日期：2026-10-28
- 取代：[0001 · 以 Action 承载事项、安排与执行](0001-action-centric-model.md)
- 被取代：[当前产品需求](../prd.md)、[数据模型](../data-model.md)

> 本文件仅保留历史决策。其中 TimeBlock 直接关联 Action、planned／actual 同记录、Statistics Projection 等规则已废止，不得作为当前实现依据。

## 背景

最初模型用同一 Action 树承载持续事项、具体活动、计划与实际时间，排除了 Project、Schedule 类实体和材料流水线。后续产品方向明确为“时间块 + OmniFocus + Agent”，并要求 GTD 的 Skills、数据与未来 UI 都能在一个小秘书项目中生长。旧模型无法表达 OmniFocus 的 Project／Action 区别，也无法让重复事项对应多个独立时间记录。

## 决策

- GTD 是核心领域，包含 Inbox、Project 与 Action；Availability 派生，Completed 是 Action 的状态事实。
- TimeBlock 是独立时间记录，引用 Action，保存 planned、actual、来源与 TimeCategory。一个 Action 可以关联多个 TimeBlock。
- Statistics 是只读 Projection，Secretary Agent 是用户触发与主动工作的统一行为层。
- 运行存储完全离开 Obsidian，使用 DSH `storageDomain + SQLite`。旧 vault 与旧 `secretary.json` 不参与运行期双写，数据迁移另行评审。
- 曳光弹直接采用新模型，不保留旧工具、旧 exports 或旧 Action store 兼容层。

## 理由

- Project 与 Action 的角色和状态不同，不能继续压缩成无约束父子树。
- 私教等重复活动需要同一 Action 对应多段计划／实际时间；Completed 也不能代替 actual。
- SQLite 适合本机单用户事务性数据，DSH 已有正式 backend，无需引入 MongoDB 服务。
- 新链路若同时背负旧模型兼容，会把目录重构变成两套语义并存的长期负担。

## 影响

- 现行 PRD、Glossary、工具与存储按新模型重写，旧 ADR 不再作为当前权威。
- 首颗曳光弹只实现新模型的最小闭环，未实现的 OmniFocus 概念不能借名称宣称支持。
- 旧数据需要显式迁移项目，不能在切换 backend 时假定自动保留。
