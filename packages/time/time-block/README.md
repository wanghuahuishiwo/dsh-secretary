---
description: "Secretary 的日期计划、实录、计划模板与深度时间领域服务；供需要记录时间、复用模板或排查时间事实的用户与维护者阅读。"
kind: "package-reference"
---

# dsh-secretary-time-block

## 概述

本包让你通过 Secretary 管理具体日期的 PlanBlock、ActualBlock、可复用的 PlanTemplateBlock 和持续继承的 DeepTime 周模板。计划、模板、实录与深度时间分别保存，不因其中一个变化而伪造另一个。

## 目录

- [使用本包](#使用本包)
- [理解实现](#理解实现)
- [模型体验](#模型体验)
- [已知限制与后续工作](#已知限制与后续工作)

-----

## 使用本包

### 组合与配置

本包由 Secretary bundle 挂载。`dsh-secretary-time-block` 提供 `ctx.time`，`/tools` 注册公共工具 `secretary_time`；右栏 UI 由 [`client/ui-time`](../../client/ui-time/README.md) 提供，Host 产品 API 在 [`api/time-controller`](../../api/time-controller/README.md)。

| Config 字段 | 默认值 | 含义 |
|---|---|---|
| `domain` | `secretary_time` | 时间事实使用的存储领域名称 |

### Agent 能力

- `plan.*`：读取和维护具体日期的计划块。
- `template.*`：维护星期模板，显式应用或撤销目标日期计划。
- `actual.*`：补记、编辑、开始和停止实录。
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
- [当前数据模型](../../../docs/data-model.md)
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
