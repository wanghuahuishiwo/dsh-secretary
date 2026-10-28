# 0001 · 以 Action 承载事项、安排与执行

- 状态：已接受
- 日期：2026-10-27

## 背景

早期方案分别设计 Project、Plan、Schedule、Execution 等概念，导致分类重复，并与 DSH 的 `Schedule` 定时任务重名。用户实际需要的是一个能灵活安排与切换的 Secretary Agent，而不是多套需要维护的记录系统。

## 决策

首版只设两类业务实体：

- **Action**：所有事项及父子层级。持续父事项与一次具体活动使用同一实体；每次活动创建独立的子 Action。
- **TimeCategory**：与 Action 无关的时间类型分类。

具体 Action 自身保存可选计划时间、实际时间与完成状态。多次活动通过多个具体子 Action 表达，不引入 Arrangement、Execution、TimeEntry 或 Budget 实体。

DSH `Schedule` 只表示宿主定时任务。Secretary Agent 使用它完成到点唤醒，不把它当作日历安排。

## 理由

- 一次具体的私教课可以自然创建、完成并保留历史，下一次再建子 Action。
- 计划与实际可以独立修改，不需要实体间同步或 ID 配对。
- 子 Action 完成不推导父 Action 完成，符合独立判断。
- 数据面足够小，Agent 可以先跑通创建→准备→完成，后续统计读取同一批 Action。

## 影响

- Action 可以任意嵌套，查询与统计需要沿父子关系汇总。
- 已完成的具体 Action 保留在历史中，默认待办查询需要过滤状态。
- 计划／实际对照不提供逐条自动配对或完成率。
- 未来 UI 与统计必须复用统一 Action 命令接口，不能重新引入另一套事实来源。
