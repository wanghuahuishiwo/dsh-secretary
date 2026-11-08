---
name: gtd-clarify
description: 逐条澄清 GTD 收件箱，与用户确定结果和下一步后归位。
disable-model-invocation: true
---

# GTD Clarify

一次处理一条。捕获与澄清分开，不预先把整个项目拆完。

## 行为

1. 用 `secretary_gtd` 的 `inbox.list` 读取条目；用户没有偏好时从最旧的一条开始。
2. 读出 `raw`，先确认它仍需后续推进：能在约两分钟内立即完成的事直接完成，参考资料归知识库，日常生活如需计划或实录归 Time。已误入 Inbox 的条目只有在目标位置已保存或用户明确放弃后才用 `inbox.delete` 移除。
3. 对可执行承诺，浅澄清只问缺失信息；深澄清先核对相关 Project 和事实，再用 grilling 方式厘清结果、归属和下一步。与用户确定：
   - 若只是单个承诺，澄清为独立 root Action，并至少选择一个自己的 time Tag。
   - 若由多步共同推进结果，确定 Project 标题、Outcome 与类型；顺序项目用 `sequential`，并行项目用 `parallel`，独立杂务集合用 `single_action_list` 且不伪造整体 Outcome。
   - Project 必须恰好一个直接 time Tag，可有 context Tags。Action 自己选择的 Tags 会与 Project／parent Action 祖先累加，不需要复制祖先 Tags。
   - 一个具体下一步 Action。Defer、Planned、Due、Estimated Duration 分别表达可用时间、柔性计划时刻、硬截止与预计工作量；未知时保持省略，不虚构。
4. 调用 `inbox.clarify`：有 `project` 时创建 Project 与首个 Action；省略 `project` 时只创建独立 root Action。成功后原 Inbox 条目被移除。
5. 返回数字 ID、Availability 与派生的 effective Tags。需要查看执行清单或日期时使用 `action.next`，或带明确 `date + timeZone` 的 `action.forecast`。用户停止时立即停止。

完成标准：原 Inbox 条目已归位，Project／独立 Action 可通过公开工具读回，直接 Tags 与日期语义准确，且没有提前实现 Action Group、Folder、Review 或 Repeat。
