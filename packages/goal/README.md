# dsh-secretary-goal

上游共享 Goal 模块。当前只提供空的 `goals` Cordis service，让 Time、GTD 与未来产品可以先表达并验证真实的依赖关系。

## 入口

- `dsh-secretary-goal`：挂载 `EmptyGoalService`。
- `dsh-secretary-goal/contract`：导出 `GoalService`，service key 为 `goals`。

## 当前边界

- 没有 Goal 实体、字段、目标树或关联规则。
- 不打开 SQLite domain，不提供 tools，不注册 UI。
- 空模块是依赖与生命周期的曳光弹，不代表 Goal 产品已设计或已交付。
- 第一条真实 Goal 能力出现时，再扩展 contract 与 implementation；调用方只依赖 contract，不依赖空 Provider 的具体类。
