# 当前验证证据

本文件只记录最近实际运行的生产代码证据，不保存逐轮历史，也不把目标架构或静态原型写成已验收能力。目标结构见 [architecture.md](architecture.md)，当前实施任务见 [active 规格](specs/product-delivery-remote-refactor.md)。

## 最近真实门禁

证据日期：**2026-11-04（Asia/Shanghai）**。生产代码基线为提交 `3e22801`；其后的 `cca50c2` 只增加 OmniFocus 调研与可丢弃原型，没有改变生产 UI。当前工作树在此基础上继续修改文档，尚未重新运行生产测试。

已实际执行：

```sh
pnpm build
pnpm test
```

结果：

- `packages/secretary/tests/tracer.mjs`：**51/51** 通过。
- `packages/secretary/tests/browser.mjs`：**7/7** 通过。
- 测试使用真实 Cordis 装配、公共 tools、Host routes、临时 SQLite、隔离 `dsh web` 与 Chromium，不以静态原型或内存 stub 代替生产链路。

`packages/secretary` 的 `pnpm pack` 也已执行：bundle 保留 `cordis.patch.yml`，Goal workspace 依赖在包清单中转换为 `0.1.0`。

## 已覆盖的生产行为

- Time、Tag 的现有领域能力与真实 SQLite 持久化，包括 Plan／Actual／Template／DeepTime、引用保护、错误补偿和完整关闭／重开。
- 当前 Time 右栏产品功能与交互的浏览器回归；这些行为是本次交付重构必须保持的基线。
- GTD 基础 Service 与 Agent tools 的既有能力；这不代表完整 OmniFocus 工作区已验收。
- 上游空 Goal Provider：Time 与 GTD 都声明真实 `goals` 依赖；Provider 晚就绪时消费者能够激活，卸载时消费者清理。
- bundle patch、Host inject、生产 client bundle、真实 overlays 与浏览器组合。
- 同一 SQLite 文件承载各领域事实，浏览器不直接访问 SQLite。

## 原型证据的边界

Open Design `secretary-prototype` 的 `omnifocus-mac.html` 已用 Playwright 检查 Perspective 切换、Projects／Inbox／Forecast／Review、Quick Entry、导航树及页面错误。它只证明可丢弃原型的设计交互，不连接真实 GTD 数据，不是生产验收证据。

## 当前明确未覆盖

以下目标均**尚未实现、尚未验收**：

- 独立的“小秘书-时间块”右栏插件与“小秘书-事项”左栏 `main` 空页。
- 旧聚合 `SecretaryProduct` 和 `/api/secretary.state`／`/api/secretary.command` 的退出。
- `TimeProductService`、Typert Remote 生成产物、Host 注册、Client assembly 与浏览器 `ctx.remote.<namespace>` 调用。
- Remote 的错误传播、卸载清理、冷启动及真实 SQLite 闭环。
- GTD 完整 OmniFocus UI、Folder、Action Group、Review、Repeat 与 Flagged。
- Goal 业务模型、统计、预算、时间对账及未来候选产品。

真实 desktop profile 的既有会话不会自动获得新的装配；目标重构完成后仍需新开会话和冷启动验收，不能以 HMR 或插件自报 active 代替。
