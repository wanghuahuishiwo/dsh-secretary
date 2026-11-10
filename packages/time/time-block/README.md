---
description: "Secretary 的日期计划、实录、计划模板与深度时间领域服务；供需要记录时间、复用模板或排查时间事实的用户与维护者阅读。"
kind: "package-reference"
---

# dsh-secretary-time-block

## 概述

本包让你通过 Secretary 管理具体日期的 PlanBlock、ActualBlock、可复用的 PlanTemplateBlock 和持续继承的 DeepTime 周模板。计划、模板、实录与深度时间分别保存，不因其中一个变化而伪造另一个。

## 领域模型

| 概念 | 回答的问题 | 数据特点 |
|---|---|---|
| 时间计划 | 打算如何安排某个具体日期的各时段？ | 由带明确开始、结束时刻的日期计划块组成，可包含睡觉、吃饭、通勤、娱乐和个人发展等活动。 |
| 计划模板 | 哪些周一到周日安排可以复用？ | 独立的周模板功能；可明确应用到指定日期，应用后不与日期计划自动同步。 |
| 时间实录 | 实际时间花在了哪里？ | 由实录块组成，必须有可说明的事实来源。 |

约束：

- 时间计划和时间实录是两条独立序列，实际不从计划自动复制。
- 计划块和实录块都必须且只以时间标签作为分类主体；GTD 对象只能在备注中提及，不与时间块建立直接结构化关联。
- 开始／停止实录不自动完成 Action；完成 Action 不伪造实际区间。
- 目标不是「计划 = 实际 100%」，而是让偏差可见、可解释、可调整。

```ts
interface TimeBlockContent {
  timeTagId: number  // 必填且是唯一分类主体，指向 kind = time 的 Tag
  note?: string      // 可补充说明或提及 GTD 对象，不形成直接结构化关联
}

interface PlanBlock extends TimeBlockContent {
  id: number
  startAt: string                // 带时区的具体开始时刻
  endAt: string                  // 带时区的具体结束时刻
}

interface ActualBlock extends TimeBlockContent {
  id: number
  startAt: string
  endAt?: string                 // 运行中实录尚未结束时缺省
  actualSource: 'user_reported' | 'agent_observed' | 'imported'
  focus?: 'deep' | 'shallow'
}

interface PlanTemplateBlock extends TimeBlockContent {
  id: number
  weekday: number                // 1–7，周一至周日
  startTime: string              // 模板内本地时刻，如 09:00
  endTime: string                // 模板内本地时刻，如 11:30
}
```

- `timeTagId` 回答「这段时间算什么」，是时间块唯一的分类主体。
- 备注可以提及 GTD 对象，但不形成 `gtdRefs` 等直接结构化关联，也不要求睡觉、吃饭、娱乐等生活时间拥有 GTD 对象。
- 计划与实录互不回写；实录可以改做其他事项，不修改具体日期计划。
- 应用计划模板时生成或替换目标日期的计划块；此后模板与日期计划互不回写，小长假可直接调整具体日期。
- 任意时间块都可以重叠，以多个块自然表达并行活动；没有 `dedicated`（专用）类型或互斥限制，也不需额外的并行标记。
- 并行活动使用独立块表达自己的时间标签，例如同一通勤时段同时存在「通勤」和「听 Git 热榜视频」。
- 重叠时间的汇总口径留待统计专题，不在记录模型中通过互斥约束预先限制。

### 深度时间（精力画像）

- 本产品中精力画像与深度时间指向同一个精力周模板子模块。
- 基础数据是一张 7×24 的周模板表，每小时格为可选枚举：`high` / `medium` / `low` / 未设置，不是布尔值；未设置不表示 `low`，用户可只使用 `high`。
- 当前仅支持持续复用的基础周模板，不支持指定日期的例外模板。
- 深度时间是指导用户安排和 Agent 理解精力分布的独立画像，不从时间实录派生，也不是统计视图。
- 可依据实际执行情况和当时状态动态调整；模块提供原子且输入输出明确的能力，Agent 使用策略由 Skill 决定，不写入领域模型。

## 目录

- [使用本包](#使用本包)
- [理解实现](#理解实现)
- [模型体验](#模型体验)
- [已知限制与后续工作](#已知限制与后续工作)

-----

## 使用本包

### 组合与配置

本包由 Secretary bundle 挂载。`dsh-secretary-time-block` 提供 `ctx.time`；右栏 UI 由 [`client/ui-time`](../../client/ui-time/README.md) 提供，Host 产品 API 在 [`api/time-controller`](../../api/time-controller/README.md)，Agent 入口是 CLI（`dsh-secretary`）。

| Config 字段 | 默认值 | 含义 |
|---|---|---|
| `domain` | `secretary_time` | 时间事实使用的存储领域名称 |

### Agent 能力

- `plan.*`：读取和维护具体日期的计划块。
- `template.*`：维护星期模板，显式应用或撤销目标日期计划。
- `actual.*`：补记、编辑、开始和停止实录。
- `reload`：关闭并按同一份 spec 重新打开时间领域，用于外部改库（迁移、修复脚本）之后；不重启宿主、不改写任何计划或实录。
- `deep.*`：读取、设置和清除周模板中的单格或闭区间矩形。

日期、时区和各操作的必填字段由 `contract` 与工具 schema 定义。画布手势属于 `client/ui-time`，Remote 产品方法属于 `api/time-controller`，不在本包重复定义。

## 理解实现

<details>
<summary>实现说明与源码定位</summary>

所有块只以 `kind = time` 的 Tag 分类，不直接关联 GTD Action。计划和实录可以任意重叠；运行中实录允许缺少 `endAt`。`actualSource` 与可选 `focus` 描述实录依据和当时专注状态。

DeepTime 使用 7×24 周模板；未写入的周继承最近的有效更早周，不从 Actual 派生。模板 apply／undo 通过明确补偿处理多记录写入，不宣称跨记录事务。

本包拥有 `plan_blocks`、`actual_blocks`、`plan_template_blocks`、`plan_template_undos` 和 `deep_templates`，默认路由到 `$DSH_HOME/storages/secretary.db`。

</details>

## 延伸阅读

- [TimeBlock 产品功能与交互](../../../docs/prd/time-block.md)
- [Time 产品 UI](../../client/ui-time/README.md)
- [Time Host API](../../api/time-controller/README.md)
- [运行架构](../../../docs/architecture.md)

## 模型体验

### Time 工具与结果

#### 模型看到什么

模型看到挂载时的 `secretary_time` 操作 schema，以及调用后返回的计划、实录、模板、深度周或错误结果。

#### Token 影响

工具 schema 产生固定开销；结果 token 随返回块数量、字段和错误内容变化。

#### KV Cache 影响

未变更的工具定义保留请求前缀；工具结果只追加到对话历史，不重写计划或实录事实。

## 已知限制与后续工作

- 不支持深度时间日期例外、统计、预算、时间对账或旧数据迁移。
- 本包不拥有产品 UI；浏览器通过独立 Time 产品调用同一 `TimeService`。
- 10／15／30 分钟粒度只是显示与操作对齐，不是领域事实字段。
