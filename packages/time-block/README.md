# Time / ActualBlock

`dsh-secretary-time-block` 当前拥有具体日期的 **ActualBlock（实录块）**。每块只以 `kind = time` 的 Tag 分类，不直接关联 GTD Action；备注可以提及 GTD 对象。计划、模板与深度时间属于后续切片，本包当前不实现这些模型。

## 插件入口

| 入口 | 作用 | `inject` | `Config` |
|---|---|---|---|
| `dsh-secretary-time-block` | 注册 `ctx.time`（`TimeService`）及持久化 | `secretaryStorageDomain`、`tags`、`tagReferences` | `{ domain?: string }` |
| `dsh-secretary-time-block/tools` | 注册公共工具 `secretary_time` | `tools`、`time` | 无配置字段 |

工具操作：`actual.list / get / create / update / delete / start / stop`。`start` 持久化缺少 `endAt` 的运行中记录，`stop` 补写结束时刻；完整区间要求 `endAt > startAt`。

- ID 是持久化自增数字，KV key 仅在其字符串形式下使用。
- `actualSource` 固定为 `user_reported / agent_observed / imported`。
- `focus` 是可选封闭枚举 `deep / shallow`，与 Action Completed 无关。
- 任意区间可以重叠；`list` 支持具体日期、`from/to` 范围及父时间标签的直接＋后代查询。
- 创建或改绑时验证 Tag 存在且为 `time`；引用检查与 Tag 删除共用一致性写队列。

## 数据所有权

默认 domain 为 `secretary_time`，当前只拥有 `actual_blocks` 表和 next-id global。默认 bundle 中它经 `secretaryStorageDomain` 路由到 `$DSH_HOME/storages/secretary.db`。UI 与公共工具都调用 `TimeService`，不直接写 SQLite。

## 当前限制

没有日期计划、模板、深度时间、统计或旧 Action／TimeBlock 数据迁移。`actualSource` 记录来源声明，本模块不自行核实用户陈述或外部导入。

## 验证

`packages/secretary` 使用真实 Cordis 公共 tools 和临时 SQLite 覆盖 CRUD、重叠、父级去重查询、运行中状态、Action 独立性、引用删除与完整重开恢复；真实 Chromium 测试覆盖生产面板。
