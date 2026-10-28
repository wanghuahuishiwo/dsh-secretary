# 小秘书产品需求文档（PRD）

> 状态：首版评审基线  
> 日期：2026-10-27  
> 领域术语：[GLOSSARY](../GLOSSARY.md)

## 1. 产品定位

小秘书是一个运行在 DeepSeek Harness（DSH）中的个人 Secretary Agent。它读取用户已有的人生与时间规划，通过对话确认当前要做的事，创建具体安排，在到点前准备所需材料，并在实际完成后保存事实。

首版以 DSH 对话为主要界面，以 **Action + TimeCategory** 为全部业务分类与事项模型。首版不建设完整时间画布或后台管理界面。

## 2. 首版原则

- **只有 Action 事项**：持续父事项与一次具体活动都使用 Action，不引入 Project、Arrangement、Execution、TimeEntry 或 Budget 实体。
- **一次活动一个具体 Action**：例如“私教”持续存在，“周二 20:00 练胸私教课”是独立的子 Action，完成后结束；下次活动再建新的子 Action。
- **预计可以未知**：预计时长可选，Agent 不为了排程虚构精度。
- **安排允许变化**：计划时间是当前判断，可以修改；实际时间记录真实情况，不互相伪装。
- **完成各自独立**：子 Action 完成不改变父 Action；时间过去或计划结束不自动完成 Action。
- **Agent 负责判断**：追问、切换、重排和准备由 Agent 根据上下文处理，不建立固定工作流或复杂状态机。
- **宿主能力保持原名**：DSH `Schedule` 只表示宿主定时任务，不作为小秘书的日历安排。
- **基础能力完整暴露**：首版实体的查询、创建、修改、删除和完成操作由统一命令接口提供，Agent 与未来 UI 共用。

## 3. 首版端到端链路

1. Secretary Agent 读取用户现有的时间规划，将其作为安排依据；不复制成新的预算数据。
2. 用户表达想做的事情，Agent 结合现有 Action 与规划，只追问尚未明确的关键决策。
3. 沟通确认后，Agent 创建或更新一个具体 Action，保存计划时间、时间板块和可选准备需求。
4. 需要提前准备时，Agent 使用 DSH `schedule_*` 创建定时唤醒，提示中引用具体 Action ID。
5. 到点唤醒后，Agent 读取 Action，准备所需上下文与材料，保存准备结果引用；定时唤醒本身不产生实际时间或完成状态。
6. 用户明确完成或切换后，Agent 在对应的实际 Action 上记录实际时间与来源，并完成该 Action；临时改做其他事情时，不为原计划伪造执行事实。

首版验收以这条链路为主，不以页面数量或统计图表数量为标准。

## 4. 领域模型

### 4.1 Action

Action 可以任意嵌套；根 Action 是所有后代的统一归属，不另设子项目类型。

首版字段：

| 字段 | 要求 |
|---|---|
| `id` | 稳定唯一 ID |
| `parentId` | 父 Action ID；根 Action 为 `null` |
| `title` | 非空标题 |
| `note` | 可选说明 |
| `timeCategoryId` | 可选；存在计划或实际时间时必填 |
| `estimatedMinutes` | 可选正整数，未知时省略 |
| `planned` | 可选计划时间段 |
| `actual` | 可选实际时间段 |
| `actualSource` | 有实际时间时必填：`user_reported`、`agent_observed` 或 `imported` |
| `status` | `active`、`completed` 或 `dropped`；不参与父子自动联动 |
| `use` | `dedicated` 或 `parallel`，默认 `dedicated` |
| `preparationReminderId` | 可选 DSH 定时任务 ID |
| `preparationResultRef` | 可选准备结果引用，如文件路径或会话产物 |
| `createdAt / updatedAt` | 创建与最近修改时间 |

时间段 `planned` 与 `actual` 使用相同结构：

- `startAt`：带明确偏移的 ISO 时间。
- `endAt`：带明确偏移的 ISO 时间，晚于开始时间。
- `timeZone`：IANA 时区，用于保留本地时间安排语义。

约束：

- 一个具体 Action 首版最多保存一个计划时间段和一个实际时间段；多次活动创建新的具体子 Action。
- 计划时间修改不改变实际时间。
- 记录实际时间不要求先有计划时间。
- 完成 Action 不自动填写实际时间；实际来源必须来自明确事实。
- 父 Action 可以长期存在，子 Action 的完成不向父级传播。

### 4.2 TimeCategory

TimeCategory 描述时间类型，与 Action 归属无关。首版最多两级，用于表达如“技术 / 深度时间”“运动 / 私教”等分类。

字段：

- `id`：稳定唯一 ID。
- `parentId`：父分类 ID；一级分类为 `null`，二级分类必须指向一级分类。
- `name`：同一父级下的非空名称。
- `createdAt / updatedAt`：创建与最近修改时间。

TimeCategory 是以后时间画布主颜色与时间构成统计的分类依据，不与 Action 合并。

## 5. 数据与工具接口

### 5.1 统一命令接口

所有写入经过同一个 store 与命令接口，提供结构化校验和错误；Agent、自动化与未来 UI 不各自复制业务规则。进程内变更按 FIFO 串行执行，引用检查与写入不能分离为产生孤儿数据的两个并发步骤；卸载必须等待写入排空与存储关闭。

### 5.2 Action 操作

- `list`：查询 Action；支持父级、状态、时间板块、计划／实际时间范围筛选。
- `get`：读取单个 Action，并返回其祖先路径与时间板块信息。
- `create`：创建根或子 Action。
- `update`：修改标题、说明、父级、分类、估计、计划／实际时间、准备引用等。
- `complete`：记录完成；可选地同时保存经确认的实际时间与来源。
- `delete`：删除明确指定的 Action；存在子 Action 时拒绝级联删除。

### 5.3 TimeCategory 操作

- `list`、`get`、`create`、`update`、`delete`。
- 最多两级；仍被 Action 使用或存在子分类时不得静默删除。

### 5.4 DSH 定时任务

Secretary Agent 直接使用宿主 `schedule_create`、`schedule_list`、`schedule_update` 和 `schedule_delete`。小秘书不实现自己的 cron、提醒存储或 AgentLoop。

## 6. Secretary Agent 行为

- 根据已有时间规划与当前 Action 提出安排，只询问无法从上下文确定的决策。
- 预计时长未知时仍可沟通安排，不自动补 0 或虚构估计。
- 用户临时切换时，优先响应当前需求，再调整尚未发生的安排；不要求用户维护计划完成率。
- 创建具体 Action 后，如用户需要准备，则设置与 Action 对应的 DSH 定时唤醒。
- 准备唤醒后先读取 Action；已有有效准备结果时不重复生成。准备过程不创建实际时间，不完成 Action。
- 只有用户明确陈述或可核实的工具结果才能形成实际记录；推断先询问。
- 低风险的数据调整保持轻量；涉及真实外部承诺或对外发送时，先与用户确认。

## 7. 首版明确不做

- 独立 Project、Arrangement、Execution、TimeEntry、Budget 或通用 Tag 实体。
- 时间预算的复制导入与双向同步。
- 完整时间画布、统计与 Review UI。
- 持久化 Energy、材料流水线、固定重排算法。
- 自动 recurring 模板；首版由 Agent 创建具体子 Action。
- 外部 IM、多用户、云同步、快照和 baseline。

## 8. 首版验收标准

1. 能创建多级 Action 与两级 TimeCategory，重启后数据保留。
2. 能创建“周二 20:00 练胸私教课”这样的具体子 Action，计划时间未知预计时长也可保存。
3. 修改计划时间不会改变实际时间；无计划时间也能记录实际时间。
4. 完成具体子 Action 不改变父 Action 或其他子 Action。
5. 能保存准备提醒 ID 与准备结果引用；准备过程不产生实际时间或完成状态。
6. 能创建下一次独立私教 Action，不覆盖上一次历史。
7. Agent 使用统一工具完成创建、准备和完成，不直接修改存储文件。
8. Action 与 TimeCategory 的全部首版基础操作通过契约测试与构建验证。

## 9. 后续方向

以下能力保留，但不阻塞首版链路：

- 执行统计、专用／并行时间的分母、周期 Review 与计划／实际对照。
- A 版时间画布与人工校正界面。
- 精力状态、周计划模板、快照、导出与分享。
- 与现有 GTD 数据的迁移或联动，由同一个 Secretary Agent 操作。
- 主动复盘、更多自动化与外部 IM 通道。
