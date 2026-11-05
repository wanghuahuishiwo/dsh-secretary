# 产品需求

本文是用户可见产品范围与交互的唯一权威。领域事实见 [data-model.md](data-model.md)，技术交付与 Remote 结构见 [architecture.md](architecture.md)，实施任务只使用 [active 规格](specs/product-delivery-remote-refactor.md)。

## 产品原则

- 小秘书以 GTD 管理承诺，以 TimeBlock 管理全部生活时间，通过同一个 Secretary Agent 承接、准备、协商和跟进。
- 不同产品不共用一个“小秘书”总壳。共享 SQLite、Tag、Goal 与 Agent 契约不等于共享产品 UI、入口或 Host API。
- Tag 与 Goal 是上游共享模块；TimeBlock、GTD 及未来产品是下游消费者。TimeBlock 与 GTD 彼此不直接依赖。
- Agent 不设置独立 UI，通过对话和各产品的原子能力操作同一批事实。

## 产品入口与当前范围

| 产品或模块 | 入口与内容 | 当前边界 |
|---|---|---|
| **小秘书-时间块** | DSH 右侧栏；包含**实录、计划、深度时间**三个模块。计划模板属于计划，不是第四个模块。 | 保留当前已经实现的产品功能、页面交互和事实语义，本次只重构交付与底层调用。 |
| **小秘书-事项** | DSH 左侧栏全局 panel 区，与 Plugins／Schedules 同级；点击后保留 DSH 左栏，中央 `main` 打开独立页面。 | 本期只提供**空白页面**以确认入口和形式。现有 GTD Service 与 Agent tools 保留，完整 OmniFocus UI 暂缓。 |
| **Tag** | 上游共享 TagService 与 Agent tools；Time 使用 `time` Tags，GTD 使用 `time` 与 `context` Tags。 | 不新增独立产品入口，不在本次另建管理 UI 或空 API。 |
| **Goal** | 上游共享空 GoalService Provider，用于证明依赖和生命周期。 | 不实现 Goal 实体、存储、tools、UI 或统计。 |
| **学习、成长、财务、记账** | 候选独立产品。 | 均未规划，不提前设计字段、界面、包或 API。 |

## TimeBlock 保持不变的规则

- 实录、计划、深度时间的现有功能和交互是本次重构的回归基线；历史原型不得用于顺带增删当前能力。
- 计划与实录是不同事实，互不回写；计划模板显式应用到具体日期后也不持续同步。
- 深度时间是独立的 7×24 精力周模板，不是实录统计或派生视图。
- 时间块只以时间标签作为分类主体；GTD 对象只能在备注中提及，不建立直接结构化关联。
- Agent 与手动 UI 继续复用同一 TimeService 和 TagService；浏览器不直接访问 SQLite。
- 本次只迁移现有 UI 组件、页面编排和验证，不重新设计并行、画笔、粒度、日期导航或编辑手势。

## 事项与 OmniFocus 设计边界

- 当前评审稿为 Open Design `secretary-prototype` 中的 `omnifocus-mac.html`，仓库引用与说明见 [omnifocus-mac-brief.md](../design/omnifocus-mac-brief.md)。
- 后续内容设计以 Mac 完整工作区为参照：Perspectives Bar、按 Perspective 变化的 Sidebar、Outline 与按需 Inspector；不采用事项右侧栏形态。
- 空白 `main` 页面不代表 Perspectives、Quick Entry、Folder、Action Group、Flagged、Review、Repeat 或其他 OmniFocus 功能已获实施授权。
- 旧 `GtdWorkspace` 不随本次重构保留为隐性产品壳，也不作为事项终稿。

## 目标交付结构

- Time 与 GTD 各有独立产品交付插件及生命周期。
- 每个产品拥有自己的 Host application service、浏览器调用面与 product-local Remote assembly；Secretary bundle 只负责组合、Preset 与 Skills，不拥有跨产品业务代理。
- 常规业务 API 使用 DSH 官方 Typert Remote。Time 的 `TimeProductService` 拥有三模块 projection、`paint`、`replace` 与 DeepTime 批量编排，再调用领域 Services。
- GTD 空页没有 Remote namespace 或空 service；第一个真实页面能力出现时再按同一模式添加。
- 决策理由见 [ADR 0007](adr/0007-independent-product-entry-points.md)、[ADR 0008](adr/0008-product-owned-host-api-adapters.md) 与 [ADR 0009](adr/0009-product-api-typert-remote.md)。

## 当前非目标

- 完整 OmniFocus 工作区及其新领域能力。
- Goal 业务模型与 UI。
- 时间预算、统计、时间对账及按 Project 汇总实录。
- 深度时间的指定日期例外模板。
- Custom Perspectives、Nearby、日历集成、系统通知、云同步、Omni Automation 和 OmniFocus 数据兼容。
- 学习、成长、财务、记账等候选产品的功能设计。
- 旧 JSON、Obsidian、旧 Action／TimeBlock 数据的自动迁移或兼容层。
