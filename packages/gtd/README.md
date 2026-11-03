# GTD

GTD 包保存事项系统的核心事实：Inbox、Project 与 Action。它把捕获和澄清分开，并提供 Action 查询、更新、完成及 Availability 派生。领域术语见仓库 [docs/glossary.md](../../docs/glossary.md)。

## 当前职责

- `inbox.capture` 原样保存一条输入，不同时创建 Project、Action、日期或 TimeBlock。
- `inbox.clarify` 在一次调用中新建一个 Project 和它的首个 Action，并移除已澄清的 Inbox 条目；写入失败时补偿删除本已创建的记录，保留原 Inbox。
- 提供 Inbox、Project、Action 的列表查询，以及单个 Action 查询、更新和完成。
- 读取 Action 时派生 `availability`：Action 或 Project 非 active 时为 `unavailable`；未来 Defer 或 sequential Project 中仍有前序 active Action 时为 `blocked`；否则为 `available`。
- Completed 只改变 Action 状态及完成时间，不生成或修改 TimeBlock 的 actual。

## 插件入口

| 入口 | 作用 | `inject` | `Config` |
|---|---|---|---|
| `dsh-secretary-gtd` | 注册 `ctx.gtd` 服务及持久化 | `['secretaryStorageDomain']` | `{ domain?: string }` |
| `dsh-secretary-gtd/tools` | 注册公共工具 `secretary_gtd` | `['tools', 'gtd']` | 无配置字段 |
| `dsh-secretary-gtd/agent` | 注册 `gtd-inbox-capture`、`gtd-clarify` 技能（assets/） | `['skills']` | 无配置字段 |

两个 GTD 技能均为 user-invocable、不可由模型自行调用；Secretary 技能会在需要时尊重这一边界。

`gtd` 的 `domain` 默认是 `secretary_gtd`，只接受小写字母开头的标识符。其余入口只接受空配置。

## 数据所有权

- 默认 domain 为 `secretary_gtd`，拥有 `projects`、`actions`、`inbox` 三张表。
- Action 上的 `preparationReminderId` 与 `preparationResultRef` 也只是对宿主 Schedule 和外部准备产物的引用；Schedule、文件和 TimeBlock 不由此模块拥有。
- 在默认 bundle 中，`secretary_gtd` 经小秘书专用 `secretaryStorageDomain`（`dsh-secretary-storage` 包）打开 SQLite，数据库为 `$DSH_HOME/storages/secretary.db`。独立组合时，实际后端由该 facility 的配置决定。

## 消费者

- `dsh-secretary-time-block` 通过 `ctx.gtd.getAction` 验证 TimeBlock 引用的 Action。
- `dsh-secretary-gtd/tools` 将服务能力暴露为 `secretary_gtd`，供 Secretary 技能和两个 GTD 技能使用。

## 当前限制

- 澄清当前总是新建 Project，不能把 Inbox 条目归入已有 Project，也不能追加后续 Action。
- 没有 Project 更新／完成、Action drop／重开／删除等公共操作。
- 当前没有 Action Group、Folder、Tag、Repeat、Perspective 或 Project Review；Availability 也不是完整 OmniFocus 规则集。
- `action.update` 支持标题、备注、Defer／Due／预计时长与准备引用；Action drop／重开等状态转换不属于当前公共能力。

## 验证

公开工具与真实临时 SQLite 覆盖捕获、澄清、完成和重开恢复；打包后的真实 Web／Schedule 链路还验证了 GTD 工具调用与最终事实。证据见 [verification.md](../../docs/verification.md)。真实模型的情境判断仍需凭据单独验收。
