# TimeBlock

TimeBlock 包把 GTD Action 放入具体时间区间，保存 planned、actual、actual 来源和可选的固定专注档位 `focus`。它是小秘书自有时间模型，不是 OmniFocus 的单时刻 Planned Date。领域术语见仓库 [docs/glossary.md](../../docs/glossary.md)。

## 当前职责

- 创建、读取、列出和更新 TimeBlock；创建时验证 Action 存在。
- 保存带 `startAt`、`endAt`、`timeZone` 的 planned 区间，支持改期以及 `dedicated`／`parallel` 使用方式。
- 单独写入 actual 区间及 `user_reported`／`agent_observed`／`imported` 来源。
- 随 actual 写入可选的 `focus`（`deep`／`shallow`），档位是代码内封闭枚举，没有创建接口，Agent 只能取值不能扩展；`focus` 要求 actual 存在，且与 GTD 的 lifecycle `status` 无关。
- 更新 planned 时保留已有 actual；记录 actual 不会自动完成 Action。
- 保存可选的 `preparationReminderId`，但不自行创建 Schedule。

## 插件入口

| 入口 | 作用 | `inject` | `Config` |
|---|---|---|---|
| `dsh-secretary-time-block` | 注册 `ctx.timeBlocks` 服务及持久化 | `['secretaryStorageDomain', 'gtd']` | `{ domain?: string }` |
| `dsh-secretary-time-block/tools` | 注册公共工具 `secretary_time_block` | `['tools', 'timeBlocks']` | 无配置字段 |

核心服务的 `domain` 默认是 `secretary_time`，只接受小写字母开头的标识符。工具入口只接受空配置。

公开工具的 op 只有 `create`、`get`、`list`、`update`、`record_actual`；专注档位固定为 `deep`（深度）、`shallow`（浅层）两档，沿用知识库 2026-10-25「深度和中度统一叫深度」的口径，新增档位只能由用户改代码决定。

## 数据所有权

- 默认 domain 为 `secretary_time`，只拥有 `time_blocks` 一张表；专注档位是枚举而不是表。
- TimeBlock 只引用 GTD Action，不拥有或复制 Action；Action 的 Completed 仍由 GTD 包负责。
- 在默认 bundle 中，`secretary_time` 经小秘书专用 `secretaryStorageDomain`（`dsh-secretary-storage` 包）打开 SQLite，数据库为 `$DSH_HOME/storages/secretary.db`。独立组合时，实际后端由该 facility 的配置决定。

## 消费者

- `dsh-secretary-statistics` 读取 TimeBlock 的 actual 与 `focus`，派生按小时的状态统计。
- Secretary 技能通过 `secretary_time_block` 保存确认后的安排、改期和实际记录。

## 当前限制

- 没有日历／时间画布 UI、冲突检测、自动排程、重复规则或自动 actual 采集。
- 没有 TimeBlock 删除操作；每块只保存一个 planned 和一个可选 actual 区间。
- `focus` 只能跟随 actual 出现：没有 Action 的纯粹状态观察目前无处记录。
- `actualSource` 只记录声明的来源，本模块不自行核实用户陈述或外部导入。
- TimeBlock、actual 与 Action Completed 是不同事实，不能互相代替。

## 验证

公开工具与真实临时 SQLite 覆盖创建、改期、actual、专注档位（含非法值拒绝）和重开恢复；真实 Web／Schedule 链路还验证了 reminder ID、actual 与最终 SQLite 事实。证据见 [verification.md](../../docs/verification.md)。
