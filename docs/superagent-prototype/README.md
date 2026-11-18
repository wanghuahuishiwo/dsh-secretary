# superagent 原型文档 · 中文译本

`dsh-superagent-prototype`（本地仓库 `/Users/wanghuahui/workspace/dsh-superagent-prototype`）全部九篇文档的中文译本。**英文原文是权威版本，译本仅助读**；术语沿用原文档自带词汇表（Trigger=触发、Thread=线程、Ticket=工单、Mandate=授权等），首次出现括注英文。

翻译于 2026-11-17，为 agent-dispatch Wayfinder 决策（工单 [底座·节点·采集器（轮询游标/事件归一化/多消息 Thread/aone 优先）](https://github.com/wanghuahuishiwo/dsh-secretary/issues/85)）提供学习材料。原文后续更新时译本不自动跟随，引用时以原文为准。

## 建议阅读顺序

| 篇目 | 内容 | 对 agent-dispatch 的价值 |
|---|---|---|
| [000 哲学](000-philosophy.zh.md) | 注意力经济、按需行动、少概念少设置 | 所有设计的宪法 |
| [001 领域模型](001-domain.zh.md) | Source→Trigger→Thread→Eval→Mandate→Ticket→Assignment→Channel 核心循环 | 领域概念的来源；多张决策票的参照系 |
| [002 授权](002-authorization.zh.md) | 强度、准入表、接受模式、Policy 版本、恢复与停止 | "哪些消息能开工"的理解基础 |
| [003 执行](003-execution.zh.md) | Ticket 阶段、worker 槽位、失败与恢复、Channel 投递 | 任务执行票（#84）的参照 |
| [004 提示词](004-prompts.zh.md) / [005 面板](005-panel.zh.md) | prompt 组织、面板哲学 | 后置参考 |
| [006 部署](006-deployment.zh.md) / [007 架构](007-architecture.zh.md) / [008 实操手册](008-cookbook.zh.md) | 部署运维、实现架构、插件开发 | 大部分内容已被 #82/#83 决策与持久化清点吸收；做实现对照时用 |

## 与本仓库设计的已知差异（读时留意）

本仓库的 agent-dispatch 并非照搬 superagent，已有意偏离之处：

1. **Ticket 语义**：superagent 的 Ticket 是其内部工作单元；本仓库约定（设计参考 §3）不带前缀的"工单"指任务系统里的**外部真实工单**（aone 单、GitHub issue），内部执行单元用 graph 实例/派工表达。
2. **Thread 实体**：superagent 将 Thread 作为聚合根持久化；本仓库当前方向（采集器票讨论中）是 Thread 不存实体，仅作按 key 的事件历史派生视图。
3. **架构底座**：superagent 是单机单体；本仓库是中心/节点/Gateway 三角色 + CloudEvents/NATS（见 [docs/agent-dispatch/overview.md](../agent-dispatch/overview.md)）。
4. **Gate/Eval/准入**：对应本仓库调度图的过滤/决策节点，具体形态在 graph 模板（雾区）中定。
