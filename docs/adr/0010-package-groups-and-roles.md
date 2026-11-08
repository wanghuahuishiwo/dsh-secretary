# 0010 · 包按官方能力族分组并按角色拆分

- 状态：已接受（2026-11-08）
- 取代：[ADR 0004](0004-workspace-packages.md)

## 背景

ADR 0004 把单包 subpath 改成了 pnpm workspace，但只搬了 `packages/` 这个名字与“每包独立构建”：9 个包平铺在同一层，共享基础设施、领域服务、产品交付和可安装 bundle 混在一起；`time-panel` 一个包同时是纯 React UI 库（`design/` 是第二消费者）、Host Remote controller、浏览器插件和 UI 契约四种角色。

官方 deepseek-harness 公开仓的做法是 `packages/<能力族>/<包>`，组是纯容器、包恰好在组下一层；组按角色分（`client/` 浏览器半边、`api/` Remote controller、`bundle/` 可安装 patch 层、`host/` 宿主页面交付、`core/`/`util/`/`storage/` 等能力族）。包名命名当前真实角色；Service Definition / Provider / Consumer 只在各自独立演化时拆包。证据见 [packages/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/README.md)、[packages/client/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/README.md)、[packages/api/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/api/README.md) 与 [adding-a-package.md#name-the-role-that-exists](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-package.md#name-the-role-that-exists)。

## 决策

目录与角色同时对齐官方：

```text
packages/
├── core/validation/      dsh-secretary-validation：共享输入校验
├── core/tooling/         dsh-secretary-tooling：tool 注册
├── core/skill-resources/ dsh-secretary-skill-resources：skill 资源注册
├── storage/storage/      dsh-secretary-storage：Secretary SQLite domain 路由
├── goal/goal/            dsh-secretary-goal：上游空 GoalService Provider
├── tag/tag/              dsh-secretary-tag：统一 TagService + Agent tools
├── gtd/gtd/              dsh-secretary-gtd：GtdService、tools、agent 与技能
├── time/time-block/      dsh-secretary-time-block：TimeService + Agent tools
├── api/time-controller/  dsh-secretary-time-controller：TimeProductService + ./typert/./remote
├── client/ui-time/       dsh-secretary-ui-time：纯 React UI + TimeAdapter 契约 + 浏览器插件
├── client/ui-gtd/        dsh-secretary-ui-gtd：左栏入口 + 空白 main
└── bundle/secretary/     dsh-secretary：可安装 bundle（preset/skills/patch）
```

- `time-controller` 拥有 Host Remote 方法，不再包含 React 或 UI 契约；导出 `.`、`./types`、`./typert`、`./remote`。
- `time-ui` 拥有 `./ui`（`TimeProduct`、`timeMath`、`TimeAdapter`）与 `./client` 浏览器插件；Host 侧只有空 `apply` 的 roster 行，供 Loader 寻址。
- `gtd-ui` 只有左栏入口与空白 main，不创建 Host adapter 或 Remote namespace。
- bundle 仍是唯一安装入口；`cordis.patch.yml` 同时挂 `secretary-time-controller`（Host 服务）与 `secretary-time-ui`（浏览器 roster 行）。
- 产品 tab id 与 kind 不改：`dsh-secretary-time-panel` / `secretary-time-block`、`dsh-secretary-gtd`，避免用户侧状态失效。

## 理由

- 官方分组让“基础设施 / 领域服务 / Host API / 浏览器 UI / 安装装配”各自的归属一眼可见，新增包有明确的组可去。
- `./ui` 同时被生产右栏和 `design/time-block` 消费，是真实第二消费者；把它从 Host 包里拆出符合 capability seam 与模板 Tier 2 判据。
- 包边界与生命周期不回归：Time 产品卸载仍只移除自己的 UI 与 Remote，不带走 Agent 仍在使用的 TimeService／tools；GTD 装卸不影响 Time。

## 后果

- workspace glob 改为 `packages/*/*`；根 `tsconfig.host.json`／`tsconfig.client.json` references、包 `prepare` 脚本、DSH profile 的 link 路径与测试固定路径同步更新。
- Host 与浏览器两侧各自构建：controller 生成 Typert 产物；ui-time 只负责 UI/客户端 bundle，并在构建期从 controller 的 `./remote` 内联生成信息。
- 新增一条客户端 roster 行；只增加 `dsh.client` 字段而不在 patch 注册行，不算完成装配。
- `packages/README.md` 成为仓库级包地图；调整组或新增包必须同时更新该页与根 [AGENTS.md](../../AGENTS.md) 的仓库结构。
