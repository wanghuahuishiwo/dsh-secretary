# ADR 0006 — Tag / Goal 是上游共享模块，Goal 先以空 Provider 落地

- 状态：已接受（2026-11-04）

## 背景

时间块与 GTD 需要独立的产品 UI、交互和入口，但共用底层数据库、Tag 与 Goal。把它们描述成一组“平行且互不依赖的领域模块”会丢失真实的依赖方向；把 Goal 仅描述成复盘视角，也不足以表达其他产品需要引用目标事实。

同时，目标模型尚未设计。如果等完整 Goal 落地后才允许 Time／GTD 表达依赖，就无法用曳光弹验证目标架构；如果提前发明 Goal 字段和 UI，又会把未决设计误当成事实。

## 决策

- **Tag 与 Goal 是上游共享模块**；TimeBlock、GTD 及未来学习、成长、财务、记账等产品是下游消费者。TimeBlock 与 GTD 彼此不互相依赖，但不与 Tag／Goal 平级。
- 共享数据仍由拥有它的模块管理。下游通过 contract 和 Cordis service 使用能力，不直接读取上游 SQLite 表，也不复制事实。
- Goal 先提供空 `GoalService`，service key 为 `goals`。它不包含 Goal 实体、字段、storage、tools 或 UI。
- Time 与 GTD 的 Host 插件声明 `inject = [..., 'goals']`，installable bundle 挂载空 Provider。用晚就绪、卸载清理与真实浏览器冷启动验证这条依赖，而不是靠 patch 行序或手工状态推断。
- 本 ADR 不确定 Goal 的未来字段、目标树、关联接口或管理 UI，也不决定时间块／事项的最终导航设计。

## 后果

- Goal Provider 缺失时，Time、GTD 及其面板会按真实依赖保持等待，而不是静默运行在一个违反目标架构的降级形态里。
- 空 Provider 让依赖与生命周期可以先验收；第一条真实 Goal 能力出现时再扩展 contract，调用方不依赖 `EmptyGoalService` 实现类。
- 未来产品登记在产品模块清单中即表示候选方向，不表示已有包、数据模型或交付承诺。
