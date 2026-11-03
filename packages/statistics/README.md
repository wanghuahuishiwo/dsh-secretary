# Statistics

Statistics 是从 TimeBlock 事实即时派生统计的组合包。当前只提供按「一天中的小时 × 专注档位」汇总 actual 分钟数，不保存第二份统计事实。

## 当前职责

- 注册公共工具 `secretary_statistics`。
- 提供 `focus_by_hour`：读取给定 `[from, to)` 范围内的 actual，裁剪跨界区间后按小时切分，并按 `deep`／`shallow`／`unlabelled` 汇总分钟数。
- 返回 24 个小时行、各档位合计与中文标签，便于直接对照知识库里的状态曲线。
- 忽略没有 actual 的 TimeBlock，以及跟范围没有正时长交集的区间。

## 插件入口

| 入口 | 作用 | `inject` | `Config` |
|---|---|---|---|
| `dsh-secretary-statistics` | 注册 `secretary_statistics` 工具 | `['tools', 'timeBlocks']` | 无配置字段，只接受空配置 |

调用 `focus_by_hour` 必须提供可解析且 `from < to` 的 `from`、`to`；`timeZone` 可选，默认 `Asia/Shanghai`，决定小时归属与跨 DST 的切分。

## 数据所有权

本包不拥有 domain、存储表或派生结果副本。Action、planned、actual 与 `focus` 的权威仍分别属于 GTD 和 TimeBlock；统计只通过 `ctx.timeBlocks` 读取它们。

## 消费者

Secretary 技能在需要时间反馈时调用 `secretary_statistics`。默认 Secretary preset 装配此工具；其他宿主也可在提供 `tools` 与 `timeBlocks` 后独立组合。

## 当前限制

- 只有实际时间的档位分布，没有 planned 对比、完成率、趋势、Project Review 或目标分析。
- 汇总分钟数是精确到毫秒的裁剪结果，保留三位小数；当前没有独立报表持久化、缓存或 UI。
- 跨时区记录混在同一份小时表里，按请求的 `timeZone` 归属。
- 统计结果不反向修改 TimeBlock 或 Action。

## 验证

公开工具与真实临时 SQLite 验证一段 55 分钟 actual 在 `deep` 档位下切成 19 点 50 分钟、20 点 5 分钟，并验证跨零点区间裁剪到请求范围。证据见 [verification.md](../../docs/verification.md)。
