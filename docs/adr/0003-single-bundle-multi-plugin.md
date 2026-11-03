# 0003 · 单 bundle 内组合多个领域插件

- 状态：已被 [ADR 0004](0004-workspace-packages.md) 取代
- 日期：2026-10-28

## 背景

小秘书需要 GTD、TimeBlock、Statistics、IM 与 Agent 等模块各自拥有入口、Config、文档和扩展点。直接复制 DSH 官方 monorepo 会重新引入已经否决的多插件仓库边界；把所有行为塞在一个 `apply` 又无法形成清晰所有权。

## 决策

保持一个仓库、一个 npm package、一个可安装 bundle，在包内暴露多个 subpath Cordis plugins。GTD 与 TimeBlock Services 在根部全局挂载，Tools、Statistics 与 Skills 在 Secretary preset 内消费。每个可组合模块拥有自己的 `index.ts`、`Config`、README 和测试接缝；纯 contract library 不伪装成 plugin。

只有当某个 Service Definition、Provider 或 Consumer 需要独立版本、独立发布或被外部插件依赖时，才考虑拆成独立 package。

## 理由

- 与 DSH 的 capability seam 和组合方式一致，但不复制 workspace、统一版本、构建 aggregates 等 monorepo 治理设施。
- 全局 Service 让多个 Agent 和未来 UI 共享同一事实源，preset 只负责模型与消费者组合。
- 模块文档和配置可以独立演化，同时保持一次安装的产品体验。

## 影响

- 构建与 package exports 必须覆盖每个 subpath，发布验证使用打包安装而非仅源码 import。
- Consumers 依赖 Service Definitions，不直接 import 其他模块的 store。
- 新模块默认先加入同一 bundle；跨包拆分需要新的消费者证据和 ADR。
