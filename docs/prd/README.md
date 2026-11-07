# 产品需求

本目录保存当前产品范围与交互。全局共享规则只写在这里；具体产品的功能与操作由各自文档承担。产品模块、入口、领域服务和共享边界只维护在 [AGENTS.md](../../AGENTS.md#产品模块)；本目录不重复模块地图。领域事实见 [data-model.md](../data-model.md)，技术结构见 [architecture.md](../architecture.md)，实施规格与验收由 [GitHub Issues](../agents/issue-tracker.md) 承载。

## 产品文档

| 产品 | 当前文档 |
|---|---|
| **小秘书-时间块** | [TimeBlock 功能与交互](time-block.md) |
| **小秘书-事项** | [GTD 当前范围与导航](gtd.md) |
| **小秘书-目标** | [Goal 当前范围与导航](goal.md) |

## 全局产品原则

- 小秘书以 GTD 管理承诺，以 TimeBlock 管理全部生活时间，通过同一个 Secretary Agent 承接、准备、协商和跟进。
- 不同产品不共用一个“小秘书”总壳。共享 SQLite、Tag、Goal 与 Agent 契约不等于共享产品 UI、入口或 Host API。
- 模块边界、入口与共享依赖见 [AGENTS.md](../../AGENTS.md#产品模块)；本目录只记录产品行为。
- Agent 不设置独立 UI，通过对话和各产品的原子能力操作同一批事实。

## 共享能力与候选方向

- Tag 与 Goal 的模块边界、入口和当前范围见 [AGENTS.md](../../AGENTS.md#产品模块)；Goal 的产品范围见 [goal.md](goal.md)。
- **学习、成长、财务、记账**：均为未规划候选，不提前设计字段、界面、包或 API。

## 全局非目标

- Goal 实体、字段、层级、进度、业务模型与 UI。
- 时间预算、统计、时间对账及按 Project 汇总实录。
- 学习、成长、财务、记账等候选产品的功能设计。
- 旧 JSON、Obsidian、旧 Action／TimeBlock 数据的自动迁移或兼容层。

## 决策与跟进

- 独立入口、API 归属与 Remote 终点分别见 [ADR 0007](../adr/0007-independent-product-entry-points.md)、[ADR 0008](../adr/0008-product-owned-host-api-adapters.md) 和 [ADR 0009](../adr/0009-product-api-typert-remote.md)。
- 新需求、规格、工单和验收证据不写入本目录，统一进入 tracker。产品文档可保留“规划中（尚未实现）”小节：写已确认的产品意图与交互规则并链接 tracker，不复制字段、实现或验收细节。
