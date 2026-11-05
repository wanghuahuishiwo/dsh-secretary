# 当前验证证据

本文件只记录最近实际运行的生产代码证据，不保存逐轮历史，也不把目标架构或静态原型写成已验收能力。目标结构见 [architecture.md](architecture.md)，当前实施任务见 [active 规格](specs/product-delivery-remote-refactor.md)。

## 最近真实门禁

证据日期：**2026-11-05（Asia/Shanghai）**。验证基线为 #12 实现提交 `75431e8`，实际宿主为 `dsh 0.2.1-rc.5`；随后合并 integration `5e1309a`，该合并只带入本文件既有的 #11 记录。

已实际执行：

```sh
pnpm install --frozen-lockfile
pnpm generate:typert
pnpm build
pnpm test
pnpm pack  # 在 packages/time-panel 与 packages/secretary 分别执行
git diff --check
```

结果：

- `packages/secretary/tests/tracer.mjs`：**64/64** 通过。
- `packages/secretary/tests/browser.mjs`：**12/12** 通过，包含真实 Chromium 中完整 Time Remote UI 的冷启动、三模块读写、日期导航、编辑／删除、多日 Undo、失败回滚、主题、窄栏、完整重开、卸载与重挂。
- `packages/time-panel`：**3/3** 通过，覆盖五个生成输出、Client inline、child 激活失败回滚、取消与 stale method 清理。
- Time 产品的 pack 含四个 Remote 发布产物及 `lib/client.js`，不发布 declaration map；Secretary bundle 保留 `cordis.patch.yml`。
- 测试使用真实 Cordis Loader／Registry／Gateway、公共 tools、临时 SQLite、隔离 `dsh web` 与 Chromium，不以静态原型或内存 stub 代替产品高层链路。

## 已覆盖的生产行为

- 独立“小秘书-时间块”右栏与“小秘书-事项”左栏空白 `main`；旧聚合面板在本阶段并存且回归通过。
- `TimeProductService` 仅注入 `time`／`tags`，只公开 `readWindow`、`paint`、`replaceDay`、`updateBlock`、`deleteBlock`、`paintDeep`；projection 不含 GTD facts／warnings。`paint` 保留切割、覆盖、合并、擦除及 Plan／Actual 独立性；`replaceDay` 与 DeepTime 批量写入保留原多次 Service 调用和部分失败语义。
- 官方 `WorkspaceTypertGenerator`／artifact writer 从源码生成 strict Host／Client descriptors；真实 Loader 撤回后返回 `gateway/definition-unavailable`，不回退 SRC。
- Remote 的 `gateway/input-invalid`、`secretaryTime/invalid-input`、`not-found`、`write-failed` 均已验证；write cause 不跨 wire，TimeService／Agent tools 在产品卸载后继续读写。失败上色不推 Undo，编辑／删除失败不关闭 RecordSheet，Undo 逐日检查 `RemoteResult`，均不显示成功。
- Time、Tag 的现有领域能力与真实 SQLite 持久化，包括 Plan／Actual／Template／DeepTime、引用保护、错误补偿和完整关闭／重开。
- 当前 Time 右栏产品功能与交互已在独立 Remote 入口下回归；旧聚合面板同日保持可用。
- GTD 基础 Service 与 Agent tools 的既有能力；这不代表完整 OmniFocus 工作区已验收。
- 上游空 Goal Provider：Time 与 GTD 都声明真实 `goals` 依赖；Provider 晚就绪时消费者能够激活，卸载时消费者清理。
- bundle patch、Host inject、生产 client bundle、真实 overlays 与浏览器组合。
- 同一 SQLite 文件承载各领域事实，浏览器不直接访问 SQLite。

## 原型证据的边界

Open Design `secretary-prototype` 的 `omnifocus-mac.html` 已用 Playwright 检查 Perspective 切换、Projects／Inbox／Forecast／Review、Quick Entry、导航树及页面错误。它只证明可丢弃原型的设计交互，不连接真实 GTD 数据，不是生产验收证据。

## 当前明确未覆盖

以下目标均**尚未实现、尚未验收**：

- 旧聚合 `SecretaryProduct` 和 `/api/secretary.state`／`/api/secretary.command` 的退出属于后续 #13，本阶段仍需保留旧面板回归。
- GTD 完整 OmniFocus UI、Folder、Action Group、Review、Repeat 与 Flagged。
- Goal 业务模型、统计、预算、时间对账及未来候选产品。

真实 desktop profile 的既有会话不会自动获得新的装配；目标重构完成后仍需新开会话和冷启动验收，不能以 HMR 或插件自报 active 代替。
