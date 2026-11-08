# 0009 · 产品业务 API 以 Typert Remote 为终点

- 状态：已接受（2026-11-05）
- 前置：[ADR 0008 · 产品交付插件各自拥有 Host API adapter](0008-product-owned-host-api-adapters.md)

## 背景

产品 API 的归属已经确定，但传输不能仅因现有代码使用手写 HTTP JSON routes 就沿用现状。DSH 官方对常规业务调用提供 Typert Remote：由 Host 能力方法生成类型、codec 和 Client 调用面，经显式 assembly 挂载；exact Fetch routes 主要承载流式、下载、原始字节和浏览器原生响应。用户明确要求采用官方推荐的终态，而不是以迁移成本选择过渡架构。

## 决策

- Time／GTD 等产品的常规浏览器业务 API 以 **Typert Remote** 为唯一目标形态，不保留手写的聚合 HTTP JSON API 作为终点。
- Time 产品交付包拥有 `TimeProductService extends TypertRemoteService`。它的 Remote 方法自己执行三模块 projection、`paint`、`replace`、DeepTime 批量编排等真实产品能力，再调用 `TimeService`／`TagService`；不建立只做转发的壳方法。
- 产品包按官方约定导出 `./typert`、`./remote`、浏览器安全的类型词汇和真正的 `./client` 产品插件。Client 类型以生成结果为唯一来源，不手写第二份重复声明。
- 每个产品的浏览器插件在自己的生命周期中挂载自己的 `/remote` contribution，再在 child Context 中等待 `remote.<namespace>` 并注册 UI；失败与卸载按 UI／Remote 的反向顺序清理。product-local assembly 不包含业务方法或跨产品 `domain + op`。Host 侧由 Typert Loader 从已挂载产品包的 `./typert` 注册协议。
- 常驻共享能力若未来确实需要 Remote，可另按 Provider 与消费者生命周期选择 bundle 级 assembly；不把 TimeService／GtdService 称为天然常驻，也不为假想共享 API 提前建立中央插件。
- 领域 `TimeService`、`GtdService`、`TagService` 不因此被迫承载页面 Remote API；Agent tools 继续直接调用这些领域 Services。
- GTD 空页没有读写需求，因此没有 Remote namespace 或空 service。未来第一个真实 GTD 产品能力按同一模式归 GTD 产品交付包。
- exact Fetch 只用于确有需要的流式上传、文件下载、原始字节或浏览器原生响应，不作为常规 Time／GTD JSON 业务调用的替代终点。

## 后果

- 旧 `/api/secretary.state`、`/api/secretary.command` 及其跨领域 DTO 随重构退出，不作为兼容终态保留。
- 构建链必须生成并校验 Host／Client Remote 产物，bundle 必须显式完成 Host 与 Client 两侧装配；只增加 decorator 或一个 `api/` 目录不算贯通。
- 第一条曳光弹必须用最小 Time 调用验证“生成 → Host 注册 → Client assembly → 真实浏览器 → 领域 Service → 临时 SQLite”，包括冷启动、卸载清理和错误传播；通过后再迁移其余 Time 操作。
- 页面交互和领域事实不因传输迁移而改变。`paint/replace` 仍是产品 application service 的多次领域调用，不借 Remote 之名声称新增跨操作事务原子性。
- 官方机制与版本证据见 [DSH 产品插件 Host API 归属调研](../research/dsh-product-api-architecture.md) 和 [DSH 开发流程调研](../research/dsh-plugin-development.md)。
