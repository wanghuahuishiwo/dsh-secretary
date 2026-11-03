# 运行架构

## 形态

仓库是 pnpm workspace，发布一个 `dsh-secretary` bundle。GTD、Tag、Time Services 与面板 Host routes 在 bundle 根层挂载；公共 tools、GTD／Secretary skills 在 Secretary preset 中组合。浏览器 client 只通过 Host routes 调用同一批 Services，没有浏览器私有事实源或直接 SQLite 写入。包图和开发命令见根 [AGENTS.md](../AGENTS.md)，逐包入口见各自 README。

Secretary preset 的通用插件底座与官方 standard preset 对齐。升级 DSH 时应重新 diff preset；当前 Storage 依赖与验收宿主均为 `0.2.1-rc.5`，不使用版本豁免代替兼容验证。

## 数据所有权

默认数据库为 `$DSH_HOME/storages/secretary.db`。`dsh-secretary-storage` 提供专用 `secretaryStorageDomain`，只路由本项目 domains，不改变宿主全局 `storage-domain` 的默认 backend 或其他 routes：

- `secretary_gtd`：`projects`、`actions`、`inbox`。
- `secretary_tag`：`tags`。
- `secretary_time`：`plan_blocks`、`actual_blocks`、`plan_template_blocks`、`plan_template_undos`、`deep_templates`。

各 domain 拥有各自的 next-id global 和串行写队列。PlanBlock 以 ID 独立保存，不按起始日期分桶；日期查询、模板 apply 和 undo 都采用“与目标日期的时区区间重叠”语义。`plan_template_undos` 按 target date 保存最近一次 before／after；当前日期集合与 after 不一致时拒绝覆盖后续编辑。Storage 没有跨 record 事务，因此多记录 apply／undo 使用明确补偿恢复；失败测试允许 next-id 出现空洞，但不接受半套计划或半套 undo。

GTD 与 Time 不直接关联 Action。Plan／Actual／Template 只保存直接选择的 time Tag；父标签查询包含所有后代并按记录 ID 去重。Tag 删除保护同时检查当前记录和仍可恢复的模板 undo 引用。DeepTime 是独立 7×24 基础周模板，不从 Actual 派生。

## 范围与验证分层

本轮只验收 Time + Tag。#6 GTD Review／Repeat／OmniFocus UI 和全产品 #8 暂停，现有 GTD UI 不是终稿；Goal、统计、预算、对账不在本轮。

- `packages/secretary/tests/tracer.mjs`：公开 tools、Host routes、真实临时 SQLite、故障注入和完整关闭／重开。
- `packages/secretary/tests/browser.mjs`：临时 `DSH_HOME` 中真实 `dsh web` 与 Chromium，覆盖直接操作、Tags 拖拽、Undo 链、宿主明暗主题和 390px。
- `pnpm pack` 检查 bundle 内容。真实安装包的新会话／desktop profile 验收由交付 lead 后续执行，不修改真实用户 profile。

只把已实际运行的结果写入 [verification.md](verification.md)；历史模型对话和旧 Action-TimeBlock 结论不属于本轮证据。
