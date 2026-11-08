# ADR 0005 — 时间类型是固定的专注档位 `focus`，不是可自定义分类

- 状态：部分被 2026-11-03 产品基线取代；`ActualBlock.focus: deep | shallow` 的封闭枚举继续有效
- 更新：[ADR 0001](0001-action-centric-model.md)、[ADR 0002](0002-gtd-time-block-agent.md) 中「TimeCategory 可自定义」的部分

> 当前模型为独立 PlanBlock／ActualBlock＋time Tag；本文旧 `TimeBlock` 字段、`use` 和 Statistics 实现决策仅作历史记录。统计本轮不实现。

## 背景

早期模型把 TimeBlock 的时间维度做成 `TimeCategory`：一张可增删改的用户表，用于「按分类汇总实际时间」。设计时假定分类由用户长出来，和 OmniFocus Tag 的边界只要说清楚即可。

用户 2026-10-29 指出真实意图不是这个：**时间类型要回答的是「这个人一天里什么时段状态好、什么时段状态差」**，也就是深度、浅层这类**人的专注档位**，用来用实测数据校准知识库里的状态曲线。它既不是「时间花在哪条线」（工作/家庭/技术…），也不是任务深浅，更不是可以随意增删的自定义分类。固定档位才可比、才能跨月对照；允许自定义等于每加一个名字就把历史数据切碎。

## 决策

- 时间维度改为 `focus`（专注档位），代码内固定枚举，**不提供任何创建／修改入口**：
  - `deep`（深度）：能推需要连续专注的难事
  - `shallow`（浅层）：碎片、输入型、可被打断的事（读文档/源码、听播客、刷资讯这类）

  沿用知识库 2026-10-25 的口径：深度和中度统一叫「深度」，连续性比分级重要。谁也不能在运行时长出第三档。
- `TimeBlock.timeCategoryId` → `TimeBlock.focus?`，挂在 **actual 上**：专注档位是对已发生区间的观察，不是排期时的假设；因此 `focus` 要求 `actual` 存在（与 `actualSource` 同一条不变式）。
- 删除 `time_categories` 表、`createCategory` / `listCategories` 服务方法与 `secretary_time_block` 的 `category.*` op；`secretary_time_block` 只保留 `create` / `get` / `list` / `update` / `record_actual`。
- Statistics 的 `actual_by_category` 换成 `focus_by_hour`：把 actual 分钟按「一天中的小时」×「专注档位」切分，直接产出可画状态曲线的数据；未记录档位的区间归入 `unlabelled`，不猜测。

## 后果

- 档位增删是代码改动（一处常量 + 标签），不是用户或 Agent 操作；Agent 只能取枚举内的值，非法值直接报错，没有任何「创建档位」的接口。已记录的 block 不受影响。
- 专注档位只在有 actual 时存在：没有任何 Action 的纯粹状态观察目前无处可记，若需要，应新增独立的观察事实而不是给 block 加字段（未实现）。
- 字段名用 `focus` 而不是 `state`：`state` 在业界与 `action.status`（active / completed / dropped）语义重叠，会被误读成记录本身是否有效或已删除。`focus` 直接表达「能专注到什么程度」。
- `use`（`dedicated` / `parallel`）与专注档位正交：前者是时间记账方式，后者是人在那段时间里的专注程度，二者不合并。
- 迁移成本为零：改动前 `time_categories` 与 `time_blocks` 均为空表。旧库中遗留的空表不需要清理。
