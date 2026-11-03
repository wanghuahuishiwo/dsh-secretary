# 一期产品基线进展

> 快照：2026-11-03 15:36（Asia/Shanghai）。本页只记总进度、各模块剩余与备注；设计与规格见 [产品架构](product-architecture.md)、[数据模型](data-model.md)、[规格](specs/2026-11-03-secretary-product-foundation.md)。工单入口：[Issue #1](https://github.com/wanghuahuishiwo/dsh-secretary/issues/1)（子工单 #2–#8）。

## 总进度

**约 40%**（按主模块加权估算，权重和分模块完成度见下；权重和「Goal 是否计入」需要你确认）。

- 分模块完成度：GTD ~20%、Time ~70%、Tag ~95%、Agent ~55%、Goal 0%、交付与集成 ~10%。
- 暂定权重：GTD 35%、Time 30%、Tag 5%、Agent 10%、Goal 10%、交付 10%。若 Goal 按一期范围排除，约 44%。
- 视图是单独阶段：Time 的视图已按原型落地；GTD（Inbox／Next／Forecast／Review）和 Goal 的视图尚未开始；Agent 按设计没有独立视图。
- 子工单：#2、#3 已合入集成分支，#4 进行中，其余 4 个未开始。

| 模块 | 状态 | 还差 |
|---|---|---|
| GTD | 未开始（有旧底座） | 契约改造、标签继承、视图（Inbox／Next／Forecast／Review）、结构／Repeat |
| Time／时间计划（含模板） | 完成（本地集成） | 远程交付 |
| Time／时间实录 | 基本完成 | 共用交互增强、主题证据 |
| Time／深度时间 | 进行中（worktree 未提交） | 提交验证、周网格 UI、重开验收 |
| Time／计划与实录共用 | 部分 | 连续拖刷、添加／消除／编辑撤销 |
| Tag | 完成 | 画布联动断言 |
| Goal | 未做（规格列为本期不做） | 模型、视图、验收全部未开始 |
| Agent | 部分 | Time／GTD 工具随模块补齐、端到端同源验收 |
| 交付与集成（跨模块） | 未开始 | 安装、主题、全量重开、场景重跑、清理、推送 |

## Actions

### GTD（#5、#6）

- [ ] 契约改造：标签字段、`plannedAt`、数字 ID（备注：现为字符串 ID；旧数据为空，不需要迁移）
- [ ] Project 时间标签必填，后代 Action 累加继承，父标签查询去重
- [ ] Inbox、Next Actions、Forecast、Review 的查询与视图（备注：视图尚未设计；产品导航已有 GTD 占位页）
- [ ] Folder、Action Group
- [ ] Review、Repeat
- [ ] 项目结构变化后 Availability 与标签继承仍正确

### Time（#3、#4、#7）

- 时间计划（含计划模板）（#3）
  - [x] 提交 `ticket/3-plan-template` 改动并跑 build + tracer（备注：`35c9774`，合入 `612172a`）
  - [x] 计划与模板界面：按日期浏览计划，模板按星期编辑、应用、撤销
  - [x] 浏览器验收：计划、模板、月历、重开持久化
- 时间实录（#2、#7）
  - [x] CRUD、start／stop、actualSource、focus，与 Action Completed 独立（备注：tracer 覆盖）
  - [x] 日期／范围查询、父标签去重、重启恢复、390px（备注：浏览器测试覆盖）
  - [ ] 共用交互增强落地后同步复用并验收
  - [ ] 明暗主题证据
- 深度时间（#4）
  - [ ] 提交 `ticket/4-deep-time` 改动并验证（备注：域层、`deep.*` 工具与 tracer 已在 worktree，未提交、未验证）
  - [ ] 7×24 周网格界面接入面板（备注：集成分支中仍是占位页）
  - [ ] 浏览器验收：档位读写、拖刷、重开恢复
- 计划与实录共用（#3、#7）
  - [x] 日期导航：前后箭头、日期输入、今天
  - [x] 月历跨月选择与高亮
  - [x] 15／30 分钟粒度切换
  - [x] 计划侧复用同一画布
  - [ ] 连续拖刷（一次拖刷只处理起手标签）
  - [ ] 撤销添加、消除、编辑（备注：模板应用撤销已有）

### Tag（#2）

- [x] 统一字段与两种 kind、增删改、层级移动、选色
- [x] 防循环、防跨类型、有子级或仍被引用时拒绝删除（备注：引用保护已覆盖计划与模板）
- [x] 父标签查询包含直接与后代关联且按记录去重
- [x] 面板统一标签管理（产品导航 Tags 入口可用）
- [ ] 画布联动断言：移动／删除标签后画布即时更新（备注：只缺浏览器断言）

### Agent（#8）

- [x] 三个公共工具门面（GTD／Tag／Time）+ `secretary`／`gtd-inbox-capture`／`gtd-clarify` 技能
- [x] 工具与面板 host route 共用 Tag／Time Services（备注：tracer 覆盖，含计划／模板）
- [x] Time 工具补齐计划、模板（备注：随 #3 合入）
- [ ] Time 工具补齐深度时间（备注：随 #4）
- [ ] GTD 工具随 GTD 改造补齐
- [ ] 端到端同源验收：Agent 工具与 UI 操作同一事实源、重开一致（归交付）

### 交付与集成（跨模块，#8）

- [ ] 产品导航：GTD、Time、Tags、Goal（备注：导航壳已有，GTD／Goal 仍是占位页）
- [ ] 真实 bundle 安装与新开会话生效（备注：现有浏览器测试用 overlay + `file://`，不是正式安装）
- [ ] 明暗主题在真实客户端验证（390px 已测）
- [ ] 完整重开恢复全部领域事实：GTD、计划、实录、模板、深度时间、Tag
- [ ] 规格 13 条验收场景重新执行并留证（备注：不继承原型结论）
- [ ] 清理 `packages/statistics` 残留与 `AGENTS.md` 包图
- [ ] 文档收口：根 README、`verification.md`、ADR 等旧模型描述
- [ ] 推送远程并收敛 Issue 状态（备注：远端仓库当前为空）

## 备注

- 基线：集成分支 `integration/secretary-product-foundation` @ `612172a`；2026-11-03 15:29 复跑 `pnpm build && pnpm test` 通过（tracer 24/24、真实浏览器 1/1）。
- Time 由并行会话按切片推进：#3 已提交并合入；#4 在 `../dsh-secretary-ticket-4` worktree 实施中，未提交。本记录只跟状态，不重复安排。
- 远端仓库为空，Issue 全部 open；远程交付为零。
- 本期不做：Goal 模型与界面（导航保留入口）、统计、预算、时间对账、深度时间例外模板、Agent 调用策略、旧数据迁移。
