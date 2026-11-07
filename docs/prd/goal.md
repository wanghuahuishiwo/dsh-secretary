# 小秘书-目标

本文定义 Goal 产品的当前范围。目标业务模型、交互和数据尚未设计，本文不提前发明字段、层级或进度规则。

## 当前范围

- Goal 保留为独立产品模块，不并入 GTD 或 TimeBlock。
- 首个交付只提供空壳入口：独立入口 + 空白 `main`。
- 当前没有 Goal 实体、字段、目标树、状态机、进度、统计或持久化。
- `GoalService` 继续作为 bundle 级空实现，供 Time/GTD 表达依赖；空壳页不消费它。
- Goal 产品未实现前，不建立 Goal Remote、浏览器写入 API 或产品包。

## 后续方向

Goal 的定位、目标与 Project/Action 的关系、是否支持层级、进度或时间预算，均待单独设计评审。确认前不进入生产范围。

## 非目标

- Goal 实体、字段、目标树、状态、进度、统计。
- Goal 管理 UI 与完整交互。
- Goal Remote、SQLite 表和产品包。
- 时间预算、KPI 与 OKR 打分。

## 相关阅读

- [Goal 空壳边界与模块地图](https://github.com/wanghuahuishiwo/dsh-secretary/issues/15)
- [GoalService 包](../../packages/goal/README.md)
- [运行架构](../architecture.md)
- [数据模型](../data-model.md)
