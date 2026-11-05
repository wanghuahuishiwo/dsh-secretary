# 0008 · 产品交付插件各自拥有 Host API adapter

- 状态：已接受（2026-11-05）

## 背景

旧 `dsh-secretary-panel` 同时注入 GTD、Tag、Time，并以一个 state route 和一个 `domain + op` command route 为所有产品服务。即使拆成两个前端入口，如果保留这个聚合 BFF（Backend for Frontend，面向前端的适配层），产品依赖、生命周期和页面修改仍会互相牵连。

DSH 官方调研表明：统一 Remote 装配与传输不等于统一业务代理，跨领域 `ApiProxy` 是明确反例；同时也存在产品交付包携带专用 Host 能力的先例。证据见 [DSH 产品插件 Host API 归属调研](../research/dsh-product-api-architecture.md)。

## 决策

- **每个产品交付插件拥有自己的 Host API adapter 和浏览器调用契约**。API 放在产品交付包内，不另建统一的 Secretary API 代理插件，也不把页面专用 DTO 与交互编排塞入领域包。
- Time 产品包的 Host adapter 调用 `TimeService` 与 `TagService`，拥有当前三模块窗口 projection、`paint`、`replace`、DeepTime 批量操作等页面专用编排；这些实现从旧 panel 原样迁移，不改变 Time 的功能、交互或公共 `TimeService` 契约。
- GTD 本期只有左栏入口和空白 `main` 页面，没有浏览器读写需求，因此不创建空 Host adapter 或 state/command routes。第一个真实 GTD 页面能力出现时，在 GTD 产品交付包内建立最小 adapter。
- `secretary` bundle 只负责组合、Preset 与 Skills，不拥有产品 routes 或跨产品命令总线。
- Agent tools 与浏览器 API 是同一领域 Service 上的平级 adapters：它们共享 Service contract、领域校验和事实，不互相调用，也不共享 transport schema。
- Remote 与 exact Fetch 是独立的传输选择，本 ADR 不要求为改变 API 归属而同时迁移 RPC 体系。

## 后果

- Time 产品插件卸载只移除自己的 UI 与 routes，不带走仍供 Agent 使用的 `TimeService` 和 tools；GTD 产品装卸不影响 Time。
- 页面交互修改集中在对应产品交付包，领域包继续拥有事实、规则和稳定 Service contract。
- 不保留一个同时注入 GTD／Time 的父 adapter，也不保留宽泛的跨产品 `domain + op` union。跨产品的 Goal／Tag 上游依赖仍由真实 Cordis `inject` 表达。
- `paint/replace` 的搬家不声称获得跨多次 Service 调用的事务原子性；该问题如需改变必须另行设计与验收。
- 若未来出现独立于任何页面、需要供多个外部调用方使用的稳定公开领域 API，可另立决策；不以此为由提前污染当前领域包。
