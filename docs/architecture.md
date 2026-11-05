# 运行架构

## 形态

仓库是 pnpm workspace，发布一个 `dsh-secretary` bundle。GTD、Tag、Time Services、空 Goal Provider 在 bundle 根层挂载；公共 tools、GTD／Secretary skills 在 Secretary preset 中组合。Tag、Goal 是上游共享模块，Time／GTD 通过 Cordis `inject` 消费它们；运行时等待与重载由 service 可用性驱动，patch 行序没有启动语义。浏览器不获得 Host Cordis Context，也不直接写 SQLite；它只通过所属产品的 Host API adapter 调用同一批领域 Services，没有浏览器私有事实源。包图和开发命令见根 [AGENTS.md](../AGENTS.md)，逐包入口见各自 README。

Secretary preset 的通用插件底座与官方 standard preset 对齐。升级 DSH 时应重新 diff preset；当前 Storage 依赖与验收宿主均为 `0.2.1-rc.5`，不使用版本豁免代替兼容验证。

## 产品交付与 API 层

入口决定见 [ADR 0007](adr/0007-independent-product-entry-points.md)，API 归属见 [ADR 0008](adr/0008-product-owned-host-api-adapters.md)，官方推荐的传输终点见 [ADR 0009](adr/0009-product-api-typert-remote.md)。目标结构是：

```text
dsh-secretary bundle：composition / preset / skills
│
├── 上游共享
│   ├── storage / core
│   ├── tag        → TagService + Agent tools
│   └── goal       → 空 GoalService Provider
│
├── 下游领域
│   ├── time-block → TimeService + Agent tools ──→ tag/contract + goal/contract
│   └── gtd        → GtdService + Agent tools ───→ tag/contract + goal/contract
│
└── 产品交付插件
    ├── time-panel
    │   ├── TimeProductService extends TypertRemoteService
    │   │   ├── @Remote：三模块 projection、paint / replace、DeepTime 批量编排
    │   │   └── 调用 TimeService + TagService
    │   ├── ./typert + ./remote + ./types + ./client
    │   └── Browser：product-local $mount → child remote.secretaryTime + UI
    │       └── 小秘书-时间块右栏；现有实录 / 计划 / 深度时间原样保留
    └── gtd-panel
        └── Browser → 小秘书-事项左栏 sidebar.panellist + 空白 main
            当前没有 Remote namespace，也不依赖 Time
```

Time 的浏览器 Remote 与 Agent tools 是平级 adapters，不是上下层：

```text
Time Browser → ctx.remote.<time-namespace> → TimeProductService ─┐
                                                                 ├→ TimeService / TagService → Storage
Agent → secretary_time / secretary_tag ──────────────────────────┘

GTD 空页 → 仅注册左栏入口与 main，无 GTD Remote 调用
```

不保留统一 Secretary 业务代理、同时注入 GTD／Time 的父 adapter、跨产品 `domain + op` 命令总线、常驻中央产品 assembly，或手写的聚合 HTTP JSON API。每个产品的 assembly 只挂载自己的 Remote 并与该产品 UI 共同清理，不包含业务方法。Time 产品插件装卸不影响 GTD，也不卸载仍供 Agent 使用的 TimeService/tools。TimeService／GtdService 是独立于 UI 的下游领域 Services，并非天然常驻；实际装载由 bundle 装配和消费者决定。第一个真实 GTD 页面能力出现时，再在 GTD 产品包中建立最小 `GtdProductService`。

exact Fetch 只用于流式上传、文件下载、原始字节或浏览器原生响应。常规业务调用的 Client 类型以 Remote 生成结果为唯一来源，不手写第二份重复声明。

Time 的 `./client` 是 DSH Client 插件，运行于桌面端的 Chromium renderer／Web 客户端，不是独立网页应用。其 bundle inline 生成的 `/remote` 与 `typert-protocol/remote-info`；平台实际提供的 React、Cordis 和 UI 模块继续 external。

## 数据所有权

默认数据库为 `$DSH_HOME/storages/secretary.db`。`dsh-secretary-storage` 提供专用 `secretaryStorageDomain`，只路由本项目 domains，不改变宿主全局 `storage-domain` 的默认 backend 或其他 routes：

- `secretary_gtd`：`projects`、`actions`、`inbox`。
- `secretary_tag`：`tags`。
- `secretary_time`：`plan_blocks`、`actual_blocks`、`plan_template_blocks`、`plan_template_undos`、`deep_templates`。

各 domain 拥有各自的 next-id global 和串行写队列。空 Goal Provider 不打开 domain，当前没有 Goal 表或目标事实。PlanBlock 以 ID 独立保存，不按起始日期分桶；日期查询、模板 apply 和 undo 都采用“与目标日期的时区区间重叠”语义。`plan_template_undos` 按 target date 保存最近一次 before／after；当前日期集合与 after 不一致时拒绝覆盖后续编辑。Storage 没有跨 record 事务，因此多记录 apply／undo 使用明确补偿恢复；失败测试允许 next-id 出现空洞，但不接受半套计划或半套 undo。

GTD 与 Time 不直接关联 Action。Plan／Actual／Template 只保存直接选择的 time Tag；父标签查询包含所有后代并按记录 ID 去重。Tag 删除保护同时检查当前记录和仍可恢复的模板 undo 引用。DeepTime 是独立 7×24 基础周模板，不从 Actual 派生。

## 范围与验证分层

本轮验收 Time + Tag 与空 Goal Provider 的依赖生命周期。#6 GTD Review／Repeat／OmniFocus UI 和全产品 #8 暂停，现有 GTD UI 不是终稿；Goal 业务模型／UI、统计、预算、对账不在本轮。

本次产品与 Remote 重构的高层测试 seam 是：**生成产物 → Host Remote 注册 → product-local Client assembly → 真实浏览器 → 产品 application service → 领域 Service → 真实临时 SQLite**。先用一条最小 Time 读取与写入贯通并验证冷启动、卸载清理和错误传播，再迁移其余 Time 操作；冷启动必须证明 strict generated descriptor 生效，禁止以 SRC fallback 或固定 sleep 掩盖装配问题。静态原型和内存 stub 不能替代这条链路。

- `packages/secretary/tests/tracer.mjs`：公开 tools、Host routes、真实临时 SQLite、故障注入、Goal 晚就绪与 Provider 卸载清理、完整关闭／重开。
- `packages/secretary/tests/browser.mjs`：临时 `DSH_HOME` 中真实 `dsh web` 与 Chromium，覆盖直接操作、Tags 拖拽、Undo 链、宿主明暗主题和 390px。
- `pnpm pack` 检查 bundle 内容。真实安装包的新会话／desktop profile 验收由交付 lead 后续执行，不修改真实用户 profile。

只把已实际运行的结果写入 [verification.md](verification.md)；历史模型对话和旧 Action-TimeBlock 结论不属于本轮证据。
