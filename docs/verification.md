# 当前验证证据

本文件只记录最近实际运行的生产代码证据，不保存逐轮历史，也不把目标架构或静态原型写成已验收能力。当前结构见 [architecture.md](architecture.md)，实施边界见 [active 规格](specs/product-delivery-remote-refactor.md)。

## 最近真实门禁

证据日期：**2026-11-05（Asia/Shanghai）**。最终验证代码基线为 `integration/product-delivery-remote` 提交 `0e93bb2`；实际宿主为 `dsh 0.2.1-rc.5`。

已实际执行：

```sh
pnpm install --frozen-lockfile
pnpm clean
pnpm generate:typert  # 从不存在 Remote 生成物的状态开始
pnpm build
pnpm test
git diff --check
pnpm pack  # 在 packages/time-panel、packages/gtd-panel 与 packages/secretary 分别执行
pnpm --filter dsh-secretary test:installed  # 另打包全部 9 个 workspace 包并做真实安装冷启动
```

结果：

- `packages/secretary/tests/tracer.mjs`：**66/66** 通过，其中新增 2 个真实 SQLite 回归覆盖 `paint`／`replaceDay` 对 missing／context Tags 的删除前预验。
- `packages/secretary/tests/browser.mjs`：**11/11** 通过，覆盖真实 Chromium 中独立 Time Remote UI 的冷启动、三模块读写、日期导航、编辑／删除、多日 Undo、失败回滚、主题、窄栏、完整重开、GTD 入口与两个产品的独立装卸。
- `packages/time-panel`：**3/3** 通过，覆盖五个生成输出、Client inline、child 激活失败回滚、取消与 stale method 清理。
- 合计 **80/80** 通过。frozen-lockfile install、clean-generation、显式生成、完整 build 与 diff-check 均成功。
- `packages/secretary/tests/installed.mjs`：**1/1** 通过。最终 **9/9** workspace tarballs 经临时 profile `pnpm-workspace.yaml` file overrides 与官方 `dsh plugin add` 安装；全新 `DSH_HOME` 从空 SQLite 冷启动，未使用产品源码 overlay，未额外安装 protocol 或修改 peer 模型。
- Time pack 共 11 个文件，含 `typert.host.js/.d.ts`、`typert.remote-client.js/.d.ts` 四个 Remote 发布产物以及 `client.js`、`types.js` 和 declarations，不发布 declaration map；GTD pack 共 4 个文件，含独立 `client.js`；Secretary pack 共 5 个文件，含 `cordis.patch.yml` 与最终组合，不含旧 panel dependency。
- installed profile 中 Storage、secretaryStorageDomain、Empty Goal、Tag、Time 与 GTD Services 全部激活；宿主 Goal 冲突和 SQLite 模块缺失均未再出现。真实 Chromium 展示 Time 右栏与 GTD 左栏空白 main，第一次 `readWindow` 无重试成功，一次 Remote `paint` 在完整 `dsh web` 重启后仍返回同一 ActualBlock。
- 测试使用真实 Cordis Loader／Registry／Gateway、公共 tools、临时 SQLite、隔离 `dsh web` 与 Chromium，不以静态原型或内存 stub 代替产品高层链路。

## 已覆盖的生产行为

- 最终产品只有独立“小秘书-时间块”右栏与“小秘书-事项”左栏空白 `main`。旧 `dsh-secretary-panel`、`SecretaryProduct`、`GtdWorkspace`、聚合 state／command routes 与跨领域 `domain + op` 已删除，无兼容壳；真实 Host 对旧 routes 返回 404。
- `TimeProductService` 仅注入 `time`／`tags`，只公开 `readWindow`、`paint`、`replaceDay`、`updateBlock`、`deleteBlock`、`paintDeep`；projection 不含 GTD facts／warnings。`paint` 保留切割、覆盖、合并、擦除及 Plan／Actual 独立性；`paint`／`replaceDay` 在任何删除前预验所有请求引用的 Tag 存在且 `kind = time`，missing／context Tag 返回 `secretaryTime/invalid-input` 且既有 SQLite facts 完全不变。校验通过后的 `replaceDay` 与 DeepTime 批量写入仍保留原多次 Service 调用和部分失败语义。
- 官方 `WorkspaceTypertGenerator`／artifact writer 从源码生成 strict Host／Client descriptors；第一次 Remote 调用成功，Loader 撤回后返回 `gateway/definition-unavailable`，不回退 SRC。
- Remote 的 `gateway/input-invalid`、`secretaryTime/invalid-input`、`not-found`、`write-failed` 均已验证；write cause 不跨 wire。失败上色不推 Undo，编辑／删除失败不关闭 RecordSheet，Undo 逐日检查 `RemoteResult`，均不显示成功。
- Time 产品卸载只清理其 UI 与 Remote，TimeService 和 Agent tool 继续读写；重挂后 namespace 与 UI 恢复。GTD 产品装卸不影响 Time，也不带走 GtdService；test-only fixture 直接调用 GtdService 验证卸载后仍可写入。
- GTD 空页没有生产 Remote 或业务 API。浏览器与截图测试的 Tag 数据准备使用临时 Host fixture 直接调用 TagService，没有为测试增加 Tag／GTD Remote。
- Time、Tag、GTD 的现有领域能力与真实 SQLite 持久化，包括 Plan／Actual／Template／DeepTime、引用保护、错误补偿和完整关闭／重开；GTD 基础 Service 与 Agent tools 保留，不代表完整 OmniFocus 工作区已验收。
- 上游空 Goal Provider：Time 与 GTD 都声明真实 `goals` 依赖；Provider 晚就绪时消费者能够激活，卸载时消费者清理。bundle 显式禁用宿主 `goal` Service entry，安装后由项目 `EmptyGoalService` 提供唯一 `goals`。
- bundle patch、Host inject、生产 client bundles 与浏览器组合；同一 SQLite 文件承载各领域事实，浏览器不直接访问 SQLite。除源码 overlay 的回归链路外，最终 tarball 的独立安装、冷启动和重开也已覆盖。

## 当前明确未覆盖

- GTD 完整 OmniFocus UI、Folder、Action Group、Review、Repeat 与 Flagged。
- Goal 业务模型、统计、预算、时间对账及未来候选产品。
- 真实 desktop profile 的人工新会话与目标版本交付验收。上述结果是隔离 `DSH_HOME` 的集成证据，不冒充桌面端人工交付；真实既有会话不会自动获得新装配，仍需由交付 lead 后续执行。
