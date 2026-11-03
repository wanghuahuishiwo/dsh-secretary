# 一期产品基线进展

> 快照：2026-11-03 15:47（Asia/Shanghai）。本页只记进展与备注；设计与规格不在这里：[产品架构](product-architecture.md)、[数据模型](data-model.md)、[规格](specs/2026-11-03-secretary-product-foundation.md)。工单入口：[Issue #1](https://github.com/wanghuahuishiwo/dsh-secretary/issues/1)（子工单 #2–#8）。

## 结果

一期结束时：GTD／Time／Tag 按规格可用，Agent 用同一批原子工具操作事实，安装进 DSH 后完整重开能恢复全部数据。

## 状态

| 模块 | 状态 | 还差 |
|---|---|---|
| GTD | 未开始（有旧底座） | 契约改造、标签继承、界面、结构／Review／Repeat |
| Time／时间计划（含模板） | 进行中（worktree 未提交） | 提交验证、界面收尾、浏览器验收 |
| Time／时间实录 | 基本完成 | 共用交互增强、主题证据 |
| Time／深度时间 | 本地完成（待集成） | 日期例外属二期 |
| Time／计划与实录共用 | 部分 | 月历、拖刷、撤销、粒度 |
| Tag | 完成 | 仅剩画布联动断言 |
| Goal | 本期不做 | — |
| Agent | 部分 | 工具随模块补齐、端到端同源验收 |
| 交付与集成（跨模块） | 未开始 | 安装、导航、主题、全量重开、场景重跑、清理、推送 |

## Actions

### GTD（#5、#6）

- [ ] 契约改造：标签字段、`plannedAt`、数字 ID（备注：现为字符串 ID；旧数据为空，不需要迁移）
- [ ] Project 时间标签必填，后代 Action 累加继承，父标签查询去重
- [ ] Next Actions、Forecast 查询
- [ ] GTD 真实界面（现在只有工具和两个技能）
- [ ] Folder、Action Group
- [ ] Review、Repeat
- [ ] 项目结构变化后 Availability 与标签继承仍正确

### Time（#3、#4、#7）

- 时间计划（含计划模板）（#3）
  - [ ] 提交 `ticket/3-plan-template` 改动并跑 build + tracer（备注：未提交、未验证）
  - [ ] 计划与模板界面收尾：按日期浏览计划，模板按星期编辑、应用、撤销（备注：面板已有未提交改动）
  - [ ] 浏览器验收：计划、模板、重开持久化
- 时间实录（#2、#7）
  - [x] CRUD、start／stop、actualSource、focus，与 Action Completed 独立（备注：tracer 覆盖）
  - [x] 日期／范围查询、父标签去重、重启恢复、390px（备注：浏览器测试覆盖）
  - [ ] 共用交互增强落地后同步复用并验收
  - [ ] 明暗主题证据
- 深度时间（#4）
  - [x] 7×24 周模板与原子能力（high／medium／low／未设置，未设置 ≠ low；备注：公共 tools + 临时 SQLite 覆盖）
  - [x] 周网格画笔：点按、拖刷、同档起手清除（备注：真实 dsh web + Chromium 覆盖）
  - [x] 完整重开恢复基础周模板（备注：工具与浏览器两层均覆盖）
- 计划与实录共用（#3、#7）
  - [x] 日期导航：前后箭头、日期输入、今天
  - [ ] 月历跨月选择与高亮（备注：面板已有未提交改动）
  - [ ] 连续拖刷（一次拖刷只处理起手标签）与撤销
  - [ ] 15／30 分钟粒度切换（备注：面板已有未提交的粒度控件）
  - [ ] 计划侧复用同一画布

### Tag（#2）

- [x] 统一字段与两种 kind、增删改、层级移动、选色
- [x] 防循环、防跨类型、有子级或仍被引用时拒绝删除
- [x] 父标签查询包含直接与后代关联且按记录去重
- [x] 面板统一标签管理（时间／情境切换）
- [ ] 画布联动断言：移动／删除标签后画布即时更新（备注：只缺浏览器断言）

### Agent（#8）

- [x] 三个公共工具门面（GTD／Tag／Time）+ `secretary`／`gtd-inbox-capture`／`gtd-clarify` 技能
- [x] 工具与面板 host route 共用 Tag／Time Services（备注：tracer 覆盖）
- [ ] Time／GTD 工具随模块补齐（计划／模板在 worktree 中，深度时间未做）
- [ ] 端到端同源验收：Agent 工具与 UI 操作同一事实源、重开一致（归交付）

### 交付与集成（跨模块，#8）

- [ ] 真实 bundle 安装与新开会话生效（备注：现有浏览器测试用 overlay + `file://`，不是正式安装）
- [ ] 产品导航：GTD、Tags、Goal 入口（备注：现在只有 Time；Goal 只留入口）
- [ ] 明暗主题在真实客户端验证（390px 已测）
- [ ] 完整重开恢复全部领域事实：GTD、计划、实录、模板、深度时间、Tag
- [ ] 规格 13 条验收场景重新执行并留证（备注：不继承原型结论）
- [ ] 清理 `packages/statistics` 残留与 `AGENTS.md` 包图
- [ ] 文档收口：根 README、`verification.md`、ADR 等旧模型描述
- [ ] 推送远程并收敛 Issue 状态（备注：远端仓库当前为空）

## 本期不做

Goal 模型与界面（导航保留入口）；统计、预算、时间对账；深度时间日期例外模板；Agent 调用策略与授权矩阵；旧模型数据迁移。

## 基线备注

- 集成分支 `integration/secretary-product-foundation` @ `8c02bc5`；2026-11-03 14:38 实测 `pnpm build && pnpm test` 通过（tracer 15/15、真实浏览器 1/1）。
- #3 的改动在 `../dsh-secretary-ticket-3` worktree，未提交、未验证；15:00 快照时仍在变化（计划／月历／模板／粒度已进入面板，测试与包 README 也在改）。
- #4 在 `ticket/4-deep-time` 完成本地实现；15:47 实测 `pnpm build && pnpm test` 通过（公共 tools + 临时 SQLite 32/32、真实 Chromium 2/2），尚未合入 integration。
- 远端仓库为空，Issue 全部 open；远程交付为零。
