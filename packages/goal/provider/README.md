---
description: "Secretary 上游空 Goal Provider；供需要理解 Time／GTD 共享依赖或排查 goals 服务生命周期的维护者阅读。"
kind: "package-reference"
---

# dsh-secretary-goal-provider

## 概述

本包提供一个空 `goals` 服务，让 Time 和 GTD 可以表达真实的上游依赖与生命周期等待。它不保存目标，也不提供目标管理功能；用户当前不能通过本包创建或查看 Goal。

Goal 作为产品模块保留独立入口，但当前只规划空壳页（未来 `goal-panel`），尚未实现；Goal 实体、字段、目标树、进度、Remote 和 UI 设计后置。

## 目录

- [使用本包](#使用本包)
- [理解实现](#理解实现)
- [模型体验](#模型体验)
- [已知限制与后续工作](#已知限制与后续工作)

-----

## 使用本包

### 组合方式

本包由 Secretary bundle 挂载，不需要独立安装。

| 入口 | 作用 | 依赖 |
|---|---|---|
| `dsh-secretary-goal` | 注册 `EmptyGoalService` | 无 |
| `dsh-secretary-goal-provider/contract` | 导出 `GoalService` 类型与 `goals` service key | 仅消费方类型依赖 |

本包没有 Config。消费方依赖 `GoalService` 契约，不依赖空实现的具体类。

## 理解实现

<details>
<summary>实现说明与源码定位</summary>

`src/index.ts` 只注册空 Provider，`src/contract.ts` 定义消费方使用的服务类型。它不打开 SQLite，也不注册工具、UI 或模型输入。

Secretary bundle 显式禁用宿主自带的 `goal` Service entry，因此安装后由本包提供唯一的 `goals` 服务。

</details>

## 延伸阅读

- [共享上游架构](../../../docs/architecture.md)
- [Secretary bundle](../../bundle/secretary/README.md)

## 模型体验

### 模型上下文

#### 模型看到什么

无。空 Provider 不提供工具、提示词、会话事件或目标事实。

#### Token 影响

零直接 token 影响。

#### KV Cache 影响

本包不改变模型请求，也不影响 KV Cache。

## 已知限制与后续工作

- 没有 Goal 实体、字段、目标树、关联规则、工具、UI 或持久化。
- Goal 产品只有空壳入口规划，`goal-panel` 尚未实现；空服务只证明依赖与生命周期，不代表 Goal 产品已经设计或交付。
- Goal 的实体/字段/层级/进度、GoalService 真实实现、Remote 与 UI 均待后续设计评审。
