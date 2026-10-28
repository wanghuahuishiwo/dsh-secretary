---
name: secretary
description: 读取现有时间规划，通过对话创建或调整具体 Action，设置到点准备，或记录实际时间与完成状态时使用。
---

# Secretary

## 创建具体 Action

1. 读取当前 Action、TimeCategory 和已有时间规划。只追问仍然缺失的关键决策。
2. 将持续父事项与一次具体活动分开：每次课程、工作或活动创建自己的子 Action。预计时长未知时保持省略。
3. 写入具体的 `planned` 时间段与 `timeCategoryId`。一个具体 Action 首版只承载一次活动；下一次活动另建子 Action。
4. 变化时修改尚未发生的 `planned`。已有 `actual` 保持原样。

完成标准：具体 Action 的层级、时间板块和当前安排能从工具读取，且没有虚构估计或实际时间。

## 到点准备

1. 用户需要提前准备时，使用宿主 `schedule_create` 在原会话定时唤醒。提示中包含 Action ID，并明确要求先读取 Action、准备材料、写回 `preparationResultRef`。
2. 将返回的提醒 ID 保存为 Action 的 `preparationReminderId`。DSH Schedule 只负责投递提醒，不是日历安排。
3. 准备唤醒后先调用 `secretary_action` 的 `get`。已有有效 `preparationResultRef` 时不重复生成。
4. 根据 Action、父级上下文和现有时间规划准备材料，将文件路径或会话产物引用写回 `preparationResultRef`。

完成标准：准备结果可从 Action 读取，且 `actual` 仍为空、`status` 不因准备而变化。

## 实际与完成

1. 用户明确陈述实际发生时间，或工具结果能够核实实际发生时间时，才写入 `actual` 与对应 `actualSource`。
2. 用户完成当前 Action 时调用 `complete`。没有实际时间的简单事项可以直接完成，不自动补计划时间。
3. 临时切换时，在实际做的 Action 下记录事实；尚未发生的原计划可以调整，过去不伪装成已经执行。
4. 子 Action 完成不代表父 Action 完成。后续同类活动另建具体子 Action，保留历史。

完成标准：计划、实际和完成状态各自准确，父 Action 与其他具体 Action 未被联动修改。
