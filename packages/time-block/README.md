# Time / PlanBlock / ActualBlock / PlanTemplateBlock / DeepTime

`dsh-secretary-time-block` 在同一个 `TimeService` 与 `secretary_time` domain 中拥有具体日期的 **PlanBlock（计划块）**、**ActualBlock（实录块）**、按星期复用的 **PlanTemplateBlock（计划模板块）**，以及持续复用的 **DeepTime 基础周模板**。前三类块只以 `kind = time` 的 Tag 分类，不直接关联 GTD Action；备注可以提及 GTD 对象。计划、模板、实录与深度时间互不回写，深度时间不从 Actual 派生。

## 插件入口

| 入口 | 作用 | `inject` | `Config` |
|---|---|---|---|
| `dsh-secretary-time-block` | 注册 `ctx.time`（`TimeService`）及持久化 | `secretaryStorageDomain`、`tags`、`tagReferences` | `{ domain?: string }` |
| `dsh-secretary-time-block/tools` | 注册公共工具 `secretary_time` | `tools`、`time` | 无配置字段 |

工具操作：

- `plan.list / get / create / update / delete`：创建必须显式提供 `date + timeZone + startAt/endAt`；开始时刻必须落在该时区的目标日期，跨日结束允许。按日期查询返回与该日期重叠的计划。
- `template.list / create / update / delete`：模板使用 `weekday: 1–7` 与本地 `startTime/endTime`；`endTime` 早于 `startTime` 表示跨日，`24:00` 可作为结束时刻。
- `template.apply / undo`：`apply` 必须显式提供 `weekday + targetDate + timeZone`，一次替换目标日期的计划并返回生成后的块；`undo` 恢复 apply 前的当日计划。apply 后修改模板或日期计划不会同步另一方；若当日计划在 apply 后已变化，undo 会拒绝覆盖后续编辑。
- `actual.list / get / create / update / delete / start / stop`：`start` 持久化缺少 `endAt` 的运行中记录，`stop` 补写结束时刻；完整区间要求 `endAt > startAt`。
- `deep.getWeek`：返回 `scope: base` 的完整 168 格，每格含 `weekday`、`hour` 与 `high / medium / low / unset`。
- `deep.setCell / clearCell`：设置或清除一格；`deep.setRange / clearRange`：以 `startWeekday/startHour/endWeekday/endHour` 设置或清除闭区间矩形。set 只接受 `high / medium / low`，clear 恢复独立的 `unset`，用户可只使用 `high`。

共同约束：

- ID 是同一个 TimeService 内持久化自增数字，KV key 仅在其字符串形式下使用；写失败允许留下 ID 空洞，单次写失败且补偿成功时不留下半套计划事实。
- 任意区间可以重叠；计划或模板的创建、改绑与 apply 验证时间 Tag，并与 Tag 删除共用一致性写队列。
- `actualSource` 固定为 `user_reported / agent_observed / imported`；`focus` 是可选封闭枚举 `deep / shallow`，与 Action Completed 无关。
- `actual.list` 与 `plan.list` 支持具体日期及父时间标签的直接＋所有后代关联查询，并按块 ID 去重；`actual.list` 另支持 `from/to` 范围。

## 数据所有权与原子性

默认 domain 为 `secretary_time`（schema version 1），拥有 `plan_blocks`、`actual_blocks`、`plan_template_blocks`、`plan_template_undos`、`deep_templates` 表和 next-id global。默认 bundle 中它经 `secretaryStorageDomain` 路由到 `$DSH_HOME/storages/secretary.db`。UI Host routes 与公共工具都调用 `TimeService`，不直接写 SQLite。旧 `plan_days` 聚合桶及 Action-TimeBlock 数据没有兼容层或自动迁移；既有 v1 Actual／Template／Deep 记录可直接重开，旧 Plan 数据按空数据处理。

`deep_templates` 以 `base` key 保存含 `scope: base` 的完整周模板，为后续适用范围扩展保留位置；本期没有日期例外。每次单格或区间修改只写一个聚合 record。

`plan_blocks` 以 ID 独立保存每条 PlanBlock。日期列表、模板 apply 与 undo 共用目标日期的时区区间重叠语义，因此跨午夜块和已改到其他日期的块不会受起始日期桶影响。`plan_template_undos` 按 target date 持久化最近一次 before／after；undo 只在当前集合仍精确等于 after 时恢复 before，随后删除该 undo 记录。Storage 没有跨 record 事务，多记录替换使用明确补偿恢复；单次真实写失败且补偿成功时恢复完整 before／after，失败允许 ID 空洞。补偿自身再次失败会显式报错并可能留下可重开的部分事实，不保证绝对原子。当前集合和仍可执行的 undo 中的 Tag 引用受删除保护；后续编辑使 undo 失效后，其历史快照不再单独阻止 Tag 删除。

## 当前限制

没有深度时间日期例外、统计、时间预算／对账或旧 Action／TimeBlock 数据迁移。`actualSource` 记录来源声明，本模块不自行核实用户陈述或外部导入。10／15／30 分钟粒度只是 UI 显示与操作对齐，不是本领域事实字段。

## 验证

`packages/secretary` 使用真实 Cordis 公共 tools 和临时 SQLite 覆盖 Plan/Template/Actual CRUD、日期／时区／跨日、apply/undo、应用后独立、计划与实录隔离、引用保护、完整重开恢复及真实写失败回滚；DeepTime 覆盖整周读取、封闭枚举、单格／区间设置与清除、非法坐标和区间、Actual 独立及完整重开。真实 Chromium 测试覆盖生产面板的月历、模板操作、深度时间画笔手势、刷新与完整进程重开。
