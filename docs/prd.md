# 产品需求入口

> 状态：现行需求由 2026-11-03 产品基线承载。本文件只提供导航，不复制一份容易漂移的规则。

## 权威来源

- [2026-11-03 小秘书一期产品基线](specs/2026-11-03-secretary-product-foundation.md)：问题、用户故事、数据契约、原子能力、交互与测试 seam。
- [产品架构](product-architecture.md)：一级模块、Time 子模块、Tags 入口和阶段边界。
- [数据模型](data-model.md)：GTD、Time、Tag 的事实、关联与不变式。
- [Time 与 Tag 原型说明](../design/time-tag-prototype-brief.md)：直接操作的探索依据；原型不是生产验收证据。

## 当前验收边界

本轮只验收 **Time + Tag**：日期计划、实录、模板 apply/undo、DeepTime、两种 Tag 树及其在同一产品壳中的直接操作。#6 GTD Review／Repeat／OmniFocus UI 与全产品 #8 暂停，当前 GTD UI 不是终稿。

Goal 保留一级入口但不实现模型；统计、预算、对账、深度时间日期例外和触摸端标签层级拖拽不在本轮。旧的 Action 关联 planned／actual TimeBlock 模型、独立 Statistics 包及其验收结论均已废止。

进展见 [progress.md](progress.md)，实际运行证据与明确未覆盖项见 [verification.md](verification.md)。
