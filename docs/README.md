# 文档索引与维护规则

## 单一权威

- 同一含义只保留一个权威位置；其他文档使用链接，不复制产品规则。
- **只有 ADR 追加历史。** 产品、架构、数据模型、术语、调研与验证文档都在原文件维护当前内容，不使用日期、`v2`、“最新”或“第 N 轮”制造平行版本。
- 讨论过程留在会话、Git 历史与工单，不写入当前产品说明。已被取代的 ADR 在文件头标明 superseded，正文保留决策背景。
- 文件名按稳定职责命名。新增文档前必须先确认现有文档无法承载该职责。

## 当前文档

| 文档 | 唯一职责 |
|---|---|
| [prd.md](prd.md) | 用户可见的产品范围、入口、交互边界与非目标。 |
| [architecture.md](architecture.md) | 包、依赖、Host／Client、产品 application service 与 Typert Remote。 |
| [data-model.md](data-model.md) | 领域事实、关系、标签关联、日期区间与持久化不变式。 |
| [glossary.md](glossary.md) | 领域术语与同名概念边界。 |
| [verification.md](verification.md) | 最近真实运行的生产代码证据与未覆盖项；目标设计不算验证结果。 |
| [specs/product-delivery-remote-refactor.md](specs/product-delivery-remote-refactor.md) | 当前 active 的独立入口与 Remote 重构规格。 |

规格只保留 active 工作项，使用稳定主题名并在原文件更新。完成或被取代后，把仍需保留的规则合并回上述文档，再移除旧规格；GitHub Issues 保存工单过程。

## 决策与设计

- [adr/](adr/) — 追加式架构决策及 supersede 关系。
- [../design/omnifocus-mac-brief.md](../design/omnifocus-mac-brief.md) — 当前 GTD 原型、Open Design 引用与实施边界。
- [agents/issue-tracker.md](agents/issue-tracker.md) — GitHub Issues 接入与更新约定。

仓库只保留当前评审原型；Open Design 保存评审过程。已实现产品以生产行为和真实验证为准，旧原型不充当平行权威。包 README 只记录入口、exports、Config、数据所有权与包级限制，产品规则回链本文列出的权威文档。

## 研究资料

研究记录第一方证据与版本边界，一个主题一份并原地更新，不作为产品需求的平行版本。

- [research/timeblock-app.md](research/timeblock-app.md) — iPhone App「时间块」概念模型。
- [research/timeblocks-interaction.md](research/timeblocks-interaction.md) — 「时间块」交互证据。
- [research/omnifocus.md](research/omnifocus.md) — OmniFocus 核心模型、日期与状态语义。
- [research/gtd-theory-review.md](research/gtd-theory-review.md) — GTD 理论核查。
- [research/omnifocus-mac.md](research/omnifocus-mac.md) — OmniFocus Mac 官方交互、UI 与视觉证据。
- [research/omnifocus-ios-navigation.md](research/omnifocus-ios-navigation.md) — OmniFocus iOS 导航证据。
- [research/dsh-plugin-development.md](research/dsh-plugin-development.md) — DSH 插件依赖、bundle 装配与 Host／Client 边界。
- [research/dsh-product-api-architecture.md](research/dsh-product-api-architecture.md) — DSH 产品 API 归属、Typert Remote 与 Fetch routes。
- [research/plan-actual-comparison.md](research/plan-actual-comparison.md) — 计划与实录对照研究；不代表现行统计能力。
