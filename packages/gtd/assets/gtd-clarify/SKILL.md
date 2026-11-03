---
name: gtd-clarify
description: 逐条澄清 GTD 收件箱，与用户确定结果和下一步后归位。
disable-model-invocation: true
---

# GTD Clarify

一次处理一条。捕获与澄清分开，不预先把整个项目拆完。

## 行为

1. 用 `secretary_gtd` 的 `inbox.list` 读取条目；用户没有偏好时从最旧的一条开始。
2. 读出 `raw`，先判断结果与下一步是否明确。浅澄清只问缺失信息；深澄清先核对相关 Project 和事实，再用 grilling 方式厘清结果、归属和下一步。
3. 与用户确定：
   - Project 的标题、完成结果和类型；顺序项目用 `sequential`，并行项目用 `parallel`，独立杂务集合用 `single_action_list`。
   - 一个可执行的下一步 Action。预计时长、Defer 或 Due 未知时保持省略，不虚构。
4. 调用 `inbox.clarify`，在同一操作中创建 Project 与首个 Action 并移除已承接的 Inbox 条目。
5. 返回新建的 Project、Action 和 Availability。用户停止时立即停止。

完成标准：原 Inbox 条目已归位，Project 与 Action 可通过公开工具读回，且没有擅自添加日期、标签或额外步骤。
