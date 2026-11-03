# 一期产品基线进展

> 快照：2026-11-03（Asia/Shanghai）。本页记录当前专项和暂停边界，不代表全产品交付。产品与数据规则见 [产品基线](specs/2026-11-03-secretary-product-foundation.md)、[产品架构](product-architecture.md)、[数据模型](data-model.md)。

## 当前范围

- **本轮只验收 Time + Tag。** 集中修复在 `acceptance/time-tag` 实施，证据只来自真实临时 SQLite、隔离 `dsh web` 与 Chromium。
- **#6 暂停**：GTD Review、Repeat、完整 OmniFocus 交互和 UI 终稿不在本轮；当前 GTD UI 只是已实现基础切片的载体。
- **全产品 #8 暂停**：跨模块总验收和远程交付收口不在本轮。Time + Tag 的完整 desktop 副本已启动成功；DSH 重启后 Time／Panel 已恢复 `active`，等待用户完成真实 GUI 冒烟验收。
- Goal、统计、预算、对账不实现；独立 Statistics 包及旧 timeBlocks 代码已删除。

## Time（#2、#3、#4、#7）

- [x] 具体日期 Plan／Actual CRUD、独立区间、跨小时与跨午夜查询，Actual 来源／focus 与 Completed 独立。
- [x] 计划模板 weekday 维护、显式 apply/undo、完整重开后持久化 undo，后续编辑拒绝覆盖。
- [x] Plan 使用独立 `plan_blocks`；跨日期 update、跨午夜 apply 与 undo 共用区间重叠语义，不保留 `plan_days`。
- [x] 多记录 apply／undo 的真实 SQLite 故障补偿与重试验证；Actual／Template 不变，ID 允许空洞。双次故障／重开证据明确补偿失败可能留下部分事实，不声称绝对原子。
- [x] `secretary_time` 保持 schema version 1；真实 v1 存储重开后 Actual／Template／Deep 可读，新 Plan 可写，旧空 `plan_days` 不迁移也不保留兼容层。
- [x] 10／15／30 分钟只改显示，24 行、48px、N 等分、跨小时标题、4px 实心标签色。
- [x] 标记／消除矩阵、安全 erase drag、Shift 编辑；添加／消除／编辑 Undo。
- [x] Undo 在 recreate 新 ID 后重映射早期编辑／删除逆操作，覆盖整次 erase drag 链；中途失败不误弹栈，剩余命令可重试并继续 remap 旧栈。
- [x] 批量消除在第二次 delete 失败时保留已删前缀的错误与 Undo；Plan 跨午夜次日或切换日期后 Undo 均按 `startAt + timeZone` 恢复原日期。
- [x] DeepTime 7×24、high／medium／low／unset、点按／拖刷／同档清除和重开恢复。
- [x] 同一临时 SQLite 一次完整关闭／重开同时恢复 Plan、Actual、PlanTemplate、DeepTime、Tag。
- [x] 真实宿主 light／dark token、选中标签与 Time 分段控件对比度、月历与编辑 dialog 计算样式、390px 无页面横向溢出及 light／dark PNG 证据。

## Tag（#2）

- [x] 统一字段与两种 kind、CRUD／move／选色、任意层级、Service 防循环／跨 kind／引用删除。
- [x] Plan 与 Actual 父标签查询均包含直接＋所有后代关联，并按记录 ID 去重。
- [x] time／context 共用真实桌面 HTML5 drag/drop 改父级和移回根级；Host 与 Time 画布重新读取层级。不宣称触摸拖拽。
- [x] Time 进入 Tags 自动选择 time，GTD 进入 Tags 自动选择 context。
- [x] 引用保护覆盖当前 Plan／Actual／Template 和仍可执行的模板 undo；后续编辑使 undo 失效后，历史快照不再单独阻止已无现实引用的 Tag 删除。

## 暂停与后续

- [ ] #6：Folder、完整 Action Group、Review、Repeat、项目结构变化规则和 OmniFocus UI 终稿。
- [ ] #8：真实 bundle 安装后的新会话／desktop profile 验收、全产品同源总验收与交付收口。
- [ ] Goal：模型、视图与验收均未开始。
- [ ] 后续专题：统计、预算、对账、深度时间日期例外；当前不提前实现。

## 历史集成记录

- #5 基础 GTD 闭环已在本地集成；公开 tools／Host routes、真实 SQLite 与 Chromium 覆盖 capture → clarify → Next／Forecast → 编辑／完成 → 重开。该结果不等同 #6 或全产品交付。
- #7 计划／实录共用画布已集成为本轮基线；通用 Undo 仍只保存当前会话，模板 undo 继续持久化。
- 本轮修复前基线为 `464c8cc57cd611d147c7252ddb70afc113ff15a1`；当前 integration 为 `bec21a3536d4af3f386fa9ac10a4e05ed193e57d`。精确测试数量和未覆盖项以 [verification.md](verification.md) 为准。
- 远程 Issue 状态保持原样；本轮没有远程交付操作。
