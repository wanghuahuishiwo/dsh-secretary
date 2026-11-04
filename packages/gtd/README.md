# GTD

GTD 包保存 Inbox、Project 与 Action 的唯一事项事实，提供捕获／澄清、CRUD、完成／放弃，以及 Next Actions、Forecast、Availability 和 effective Tags 派生查询。领域术语见 [docs/glossary.md](../../docs/glossary.md)。

## 当前契约

- Inbox、Project、Action 使用同一个 GTD domain 内持久化自增的数字 ID；没有 UUID、旧 Action／TimeBlock 兼容层或迁移。
- `inbox.capture` 只保存原始输入。`inbox.clarify` 可创建 Project + 首个 Action，也可省略 `project` 只创建独立 root Action。两分钟立即完成、参考资料与日常生活由捕获／澄清 Skills 引导到其他去向，领域 Service 不按标题拦截。
- Project 的直接 `tagIds` 必须恰好包含一个 time Tag，可另含 context Tags；`single_action_list` 不强制也不伪造整体 Outcome。独立 root Action 至少有自己的 time Tag。
- Action 只持久化自己的直接 `tagIds`。读取时的 `effectiveTags` 是自己、所有 parent Action 祖先和 Project Tags 的数字 ID 累加去重，不写回后代。
- Action 的 `deferAt / plannedAt / dueAt / completedAt / droppedAt` 都是带显式 offset 的 instant；`plannedAt` 是单个柔性计划时刻，不是区间。`estimatedMinutes` 是正整数。不会增加 `defer ≤ planned ≤ due` 的错误排序约束。
- Availability 由自身／祖先／Project 状态、未来 Defer 和 sequential 前序 active 兄弟派生。`action.next` 只返回当前 `available` 的叶子；parallel 与 SAL 可同时有多个 Next Actions。`action.forecast` 按明确 `date + timeZone` 返回 Defer／Planned／Due 落在该日期的 Action，不保存 Projection。
- Completed／Dropped 只改变 GTD 状态与对应时刻，不创建或修改 ActualBlock；Actual start／stop 也不完成 Action。

## 原子操作

公共工具 `secretary_gtd` 使用扁平 `op` schema，所有 ID 参数均为正整数，输出可无损 JSON 往返：

- `inbox.capture / list / clarify / delete`
- `project.list / get / create / update / delete`
- `action.list / create / get / update / delete / complete / drop`
- `action.next / forecast / effectiveTags`

`action.update` 的修改字段放在参数顶层。Project 仍有 Action、Action 仍有子级时拒绝直接删除，避免孤儿结构。

## 插件入口与数据所有权

| 入口 | 作用 | `inject` |
|---|---|---|
| `dsh-secretary-gtd` | 注册 `ctx.gtd`、GTD 持久化与 Tag 引用 inspector | `secretaryStorageDomain`、`tags`、`tagReferences`、`goals` |
| `dsh-secretary-gtd/tools` | 注册 `secretary_gtd` | `tools`、`gtd` |
| `dsh-secretary-gtd/agent` | 注册两个 user-only GTD Skills | `skills` |

默认 domain 为 `secretary_gtd`，拥有 `projects`、`actions`、`inbox` 与 next-id global，经 `secretaryStorageDomain` 路由到 `$DSH_HOME/storages/secretary.db`。建立／修改 GTD Tag 引用与 Tag delete 共用 `withReferenceConsistency` 串行边界；这不是跨 domain 事务，写失败允许 ID 空洞，但不允许重号或悬空 Tag 引用。

准备提醒与产物仍由 Action 保存引用；Schedule、文件与 Time 事实不属于 GTD。完整 Folder、Action Group 类型／移动／Resolved 规则、Review 和 Repeat 留给 #6，不在本包提前实现。

## 验证

`packages/secretary/tests/tracer.mjs` 通过公开工具、Host routes 与真实临时 SQLite 覆盖上述契约、故障回滚、Tag 并发和完整重开；`tests/browser.mjs` 用隔离 `dsh web` + Chromium 走完 capture → clarify → Next／Forecast → 编辑／完成 → 完整重开。
