# 运行架构

## 形态

仓库是 pnpm workspace，发布一个 `dsh-secretary` bundle。GTD、Tag、Time Services、空 Goal Provider 在 bundle 根层挂载；公共 tools、GTD／Secretary skills 在 Secretary preset 中组合。Tag 与 GoalService 是上游共享能力，Time／GTD 通过 Cordis `inject` 消费它们；Goal 产品空壳不消费 `goals`。运行时等待与重载由 service 可用性驱动，patch 行序没有启动语义。浏览器不获得 Host Cordis Context，也不直接写 SQLite；它只通过所属产品的 Host API adapter 调用同一批领域 Services，没有浏览器私有事实源。仓库结构见根 [AGENTS.md](../AGENTS.md)，逐包入口见各自 README。

## 模块装配

产品模块、入口和共享边界只维护在 [AGENTS.md](../AGENTS.md#产品模块)；本节只描述当前实现的装配。

当前产品交付插件只有 `time-panel` 与 `gtd-panel`。`TagService`、`GoalService` 是 bundle 级共享服务；`goal-panel` 空壳和共享 `TagManager` UI/Remote 尚未实现，不能据此声称已经运行。

Secretary preset 的通用插件底座与官方 standard preset 对齐。升级 DSH 时应重新 diff preset；bundle 兼容范围以实际 manifest 为准，不使用版本豁免代替兼容验证。

## 产品交付与 API 层

入口决定见 [ADR 0007](adr/0007-independent-product-entry-points.md)，API 归属见 [ADR 0008](adr/0008-product-owned-host-api-adapters.md)，官方推荐的传输终点见 [ADR 0009](adr/0009-product-api-typert-remote.md)。当前结构是：

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
    │   │   ├── @Remote：readWindow / paint / replaceDay / updateBlock / deleteBlock / paintDeep
    │   │   └── 调用 TimeService + TagService
    │   ├── ./typert + ./remote + ./types + ./client
    │   └── Browser：product-local $mount → child remote.secretaryTime + UI
    │       └── 小秘书-时间块右栏；现有实录 / 计划 / 深度时间原样保留
    └── gtd-panel
        └── Browser → 小秘书-事项左栏 sidebar.panellist + 空白 main
            当前没有 Remote namespace，也不依赖 Time
```

当前树只列已实现的产品插件；目标产品的 `goal-panel` 空壳和共享 `TagManager` UI/Remote 尚未实现，不能据此声称已经运行。

Time 的浏览器 Remote 与 Agent tools 是平级 adapters，不是上下层：

```text
Time Browser → ctx.remote.secretaryTime → TimeProductService ─────────┐
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
- `secretary_tag`：`tags`（唯一表；`kind` 区分 `time` / `context`）。
- `secretary_time`：`plan_blocks`、`actual_blocks`、`plan_template_blocks`、`plan_template_undos`、`deep_templates`。

各 domain 的 next-id、串行写队列、日期与标签不变式见 [data-model.md](data-model.md)。GoalService 空 Provider 不打开 domain，也没有 Goal 表。

## 验证入口

当前高层测试 seam 是：**生成产物 → Host Remote 注册 → product-local Client assembly → 真实浏览器 → 产品 application service → 领域 Service → 真实临时 SQLite**。冷启动必须证明 strict generated descriptor 生效，不能用 SRC fallback、固定 sleep 或内存 stub 替代真实链路。

- `packages/secretary/tests/tracer.mjs`：公开 tools、TimeProductService、真实临时 SQLite、故障注入、Goal 晚就绪与 Provider 卸载清理、完整关闭／重开；反向断言 bundle 不含聚合 panel 与 routes。
- `packages/secretary/tests/browser.mjs`：临时 `DSH_HOME` 中真实 `dsh web` 与 Chromium，覆盖三模块操作、日期导航、Undo、主题和窄栏。
- `packages/secretary/tests/installed.mjs`：打包每个 workspace 包，经官方 `dsh plugin add` 与临时 profile file overrides 安装最终 tarballs；在全新 `DSH_HOME` 和空 SQLite 中验证服务激活、两个产品、第一次 Remote 读取与 paint 重开持久化，不使用产品源码 overlay。
- `pnpm pack` 检查发布内容。所有测试使用临时环境，不修改真实用户 profile；验收证据记录到对应 Issue。
