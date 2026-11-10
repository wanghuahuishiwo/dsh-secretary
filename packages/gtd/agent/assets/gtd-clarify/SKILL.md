---
name: gtd-clarify
description: 逐条澄清 GTD 收件箱（Inbox.md），与用户确定结果和下一步后归位到 GTD.md。
disable-model-invocation: true
---

# GTD Clarify

一次处理一条。捕获与澄清分开，不预先把整个项目拆完。GTD 目录以 secretary skill 末尾「Current configuration」的 GTD data directory 为准，格式约定见目录内 README.md。

## 行为

1. 读 Inbox.md，用户没有偏好时从最旧的一条开始（文件顶部第一条待办）。
2. 读出条目与原话，先确认它仍需后续推进：约两分钟内能立即完成的事直接完成；参考资料归知识库；日常生活如需计划或实录转时间记录。已误入 Inbox 的条目只有在目标位置已保存或用户明确放弃后才从 Inbox.md 删除。
3. 对可执行承诺，浅澄清只问缺失信息；深澄清先核对相关项目与事实，再用 grilling 方式厘清结果、归属和下一步。与用户确定：
   - 单个承诺 → GTD.md「## 独立行动」下的一行 `- [ ] 下一步 #标签`。
   - 多步共同推进的结果 → `## 项目标题` 新段，段首一句 Outcome；顺序项目子行动按执行顺序列 checkbox，用缩进表达层级。
   - 日期与工作量属性用标签表达：`#defer/YYYY-MM-DD`、`#planned/YYYY-MM-DDTHH:mm`、`#due/...`、`#est/90m`；未知时省略，不虚构。
4. 写 GTD.md 前重读文件，写入后回读确认；再从 Inbox.md 删除原条目（同样写前重读）。
5. 长备注与澄清过程放 `notes/` 并在行动行链接。用户停止时立即停止。

完成标准：原 Inbox 条目已移除，GTD.md 能读回完整的项目／行动与下一步，属性标签语义准确；没有提前实现回顾、重复等机制。
