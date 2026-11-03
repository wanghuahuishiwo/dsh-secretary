# 一期产品基线进展

> 快照：2026-11-03 16:07（Asia/Shanghai）。本页只记总进度、各模块剩余与备注；设计与规格见 [产品架构](product-architecture.md)、[数据模型](data-model.md)、[规格](specs/2026-11-03-secretary-product-foundation.md)。工单入口：[Issue #1](https://github.com/wanghuahuishiwo/dsh-secretary/issues/1)（子工单 #2–#8）。

## 总进度

计算规则（每层同一算法）：

- 叶子 = 下方交付项，完成计 1、未完成计 0。
- 每个非叶节点 = 子节点进展的算术平均，同级等权，不设人工权重。
- 整体 = 一级节点（GTD、Time、Tag、Agent、Goal、交付与集成）进展的平均。
- 条目增减会改变分母，数值随 Actions 勾选更新，可复算。

按当前勾选：整体 **39%**。

| 节点 | 进展 | 计算 |
|---|---|---|
| GTD | 0% | 0/6 项 |
| Time | 79% | 计划 100%、实录 50%、深度时间 100%、共用 67% 的平均 |
| Tag | 80% | 4/5 项 |
| Agent | 67% | 4/6 项 |
| Goal | 0% | 0/3 项 |
| 交付与集成 | 11% | 1/9 项 |
| **整体** | **39%** | 6 个节点等权平均 |

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
  - [x] 提交 `ticket/4-deep-time` 改动并验证（备注：`7a051b6`，合入 `56e1b9a`）
  - [x] 7×24 周模板与原子能力（high／medium／low／未设置，未设置 ≠ low；公共 tools + 临时 SQLite 覆盖）
  - [x] 周网格画笔：点按、拖刷、同档起手清除（真实 dsh web + Chromium 覆盖）
  - [x] 完整重开恢复基础周模板（工具与浏览器两层均覆盖）
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
- [x] 工具与面板 host route 共用 Tag／Time Services（备注：tracer 覆盖，含计划／模板／深度时间）
- [x] Time 工具补齐计划、模板（备注：随 #3 合入）
- [x] Time 工具补齐深度时间（备注：随 #4 合入）
- [ ] GTD 工具随 GTD 改造补齐
- [ ] 端到端同源验收：Agent 工具与 UI 操作同一事实源、重开一致（归交付）

### Goal

- [ ] Goal 模型
- [ ] Goal 视图
- [ ] Goal 验收

（备注：规格把 Goal 列为本期不做；这里按产品全景计入整体进展。）

### 交付与集成（跨模块，#8）

- [x] 产品导航壳：GTD／Time／Tags／Goal 入口（备注：GTD、Goal 仍是占位页）
- [ ] GTD／Goal 真实页面接入
- [ ] 真实 bundle 安装与新开会话生效（备注：现有浏览器测试用 overlay + `file://`，不是正式安装）
- [ ] 明暗主题在真实客户端验证（390px 已测）
- [ ] 完整重开恢复全部领域事实：GTD、计划、实录、模板、深度时间、Tag
- [ ] 规格 13 条验收场景重新执行并留证（备注：不继承原型结论）
- [ ] 清理 `packages/statistics` 残留与 `AGENTS.md` 包图
- [ ] 文档收口：根 README、`verification.md`、ADR 等旧模型描述
- [ ] 推送远程并收敛 Issue 状态（备注：远端仓库当前为空）

## 备注

- 基线：集成分支 `integration/secretary-product-foundation` @ `56e1b9a`（merge #4）；2026-11-03 16:07 复跑 `pnpm build && pnpm test` 通过（tracer 32/32、真实浏览器 2/2）。
- Time 由并行会话按切片推进：#3、#4 已合入。#4 已知边界：深度时间 UI 对一次手势逐格串行提交，中途失败可能部分持久化。
- GTD 旧底座（Inbox 捕获／澄清、Project／Action／Availability）不计入总进度：按规格要迁到新契约后才算完成项。
- 远端仓库为空，Issue 全部 open；远程交付为零。
