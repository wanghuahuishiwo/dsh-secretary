# 产品需求

本文是当前用户可见产品范围与交互的唯一权威。领域事实见 [data-model.md](data-model.md)，技术结构见 [architecture.md](architecture.md)；实施规格与验收由 [GitHub Issues](agents/issue-tracker.md) 承载。

## 产品原则

- 小秘书以 GTD 管理承诺，以 TimeBlock 管理全部生活时间，通过同一个 Secretary Agent 承接、准备、协商和跟进。
- 不同产品不共用一个“小秘书”总壳。共享 SQLite、Tag、Goal 与 Agent 契约不等于共享产品 UI、入口或 Host API。
- Tag 与 Goal 是上游共享模块；TimeBlock、GTD 及未来产品是下游消费者。TimeBlock 与 GTD 彼此不直接依赖。
- Agent 不设置独立 UI，通过对话和各产品的原子能力操作同一批事实。

## 产品入口与当前范围

| 产品或模块 | 入口与内容 | 当前边界 |
|---|---|---|
| **小秘书-时间块** | DSH 右侧栏；包含**实录、计划、深度时间**三个模块。计划模板属于计划，不是第四个模块。 | 提供当前完整画布、日期导航、编辑、删除、Undo 与主题适配。 |
| **小秘书-事项** | DSH 左侧栏全局 panel 区；点击后保留 DSH 左栏，中央 `main` 打开独立页面。 | 当前只有空白页面。GTD Service 与 Agent tools 保留，完整 OmniFocus UI 未实施。 |
| **Tag** | 上游共享 TagService 与 Agent tools；Time 使用 `time` Tags，GTD 使用 `time` 与 `context` Tags。 | 没有独立产品入口或浏览器写入 API。 |
| **Goal** | 上游共享空 GoalService Provider。 | 不实现 Goal 实体、存储、tools、UI 或统计。 |
| **学习、成长、财务、记账** | 候选独立产品。 | 均未规划，不提前设计字段、界面、包或 API。 |

## TimeBlock 当前规则

- 计划与实录是不同事实，互不回写；计划模板显式应用到具体日期后不持续同步。
- 深度时间是独立的 7×24 精力周模板，不是实录统计或派生视图。
- 时间块只以时间标签作为分类主体；GTD 对象只能在备注中提及，不建立直接结构化关联。
- Agent 与手动 UI 复用同一 TimeService 和 TagService；浏览器不直接访问 SQLite。

## 事项与 OmniFocus 设计边界

- 后续事项工作区的设计细节与原型引用以 [omnifocus-mac-brief.md](../design/omnifocus-mac-brief.md) 为唯一设计权威；本文只保持产品范围与实施边界。
- 空白 `main` 不代表 Perspectives、Quick Entry、Folder、Action Group、Flagged、Review、Repeat 或其他 OmniFocus 功能已获实施授权。
- 旧 `GtdWorkspace` 不存在于当前产品，也不作为事项终稿或兼容壳。

## 产品与 Agent 边界

- Time 与 GTD 各有独立产品交付插件及生命周期；Secretary bundle 只负责组合、Preset 与 Skills。
- Agent 通过领域 Services 操作同一批事实。产品 API 的具体归属、Remote 和装配见 [architecture.md](architecture.md)。
- 决策理由见 [ADR 0007](adr/0007-independent-product-entry-points.md)、[ADR 0008](adr/0008-product-owned-host-api-adapters.md) 与 [ADR 0009](adr/0009-product-api-typert-remote.md)。

## 当前非目标

- 完整 OmniFocus 工作区及其新领域能力。
- Goal 业务模型与 UI。
- 时间预算、统计、时间对账及按 Project 汇总实录。
- 深度时间的指定日期例外模板。
- Custom Perspectives、Nearby、日历集成、系统通知、云同步、Omni Automation 和 OmniFocus 数据兼容。
- 学习、成长、财务、记账等候选产品的功能设计。
- 旧 JSON、Obsidian、旧 Action／TimeBlock 数据的自动迁移或兼容层。
