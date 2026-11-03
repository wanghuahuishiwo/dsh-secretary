# Tag

独立的 `TagService` 维护统一字段 `id / name / kind / parentId? / color?`，当前 `kind` 只有 `time` 与 `context`。同名不同 kind 是不同对象，公开 ID 为持久化自增数字。

## 插件入口

| 入口 | 作用 | `inject` |
|---|---|---|
| `dsh-secretary-tag` | 注册 `ctx.tags`、`ctx.tagReferences`，默认打开 `secretary_tag` | `secretaryStorageDomain` |
| `dsh-secretary-tag/tools` | 注册 `secretary_tag` | `tools`、`tags` |

公共操作：`list / get / create / update / move / delete`。子标签继承父级 kind；移动拒绝跨 kind 和循环；有子级或仍被领域记录引用时拒绝删除。

Time 等消费方通过 `tagReferences` 注册只读引用 inspector，并在建立或修改引用时与 Tag 写入共用一致性队列。该机制不是跨 domain 事务：next-id 与记录写入允许出现 ID 空洞，但不复用 ID。

默认 domain 经 `secretaryStorageDomain` 路由到同一 `$DSH_HOME/storages/secretary.db`。GTD 有效标签继承属于后续切片，本包不提前实现。
