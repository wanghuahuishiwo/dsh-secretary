---
name: gtd-inbox-capture
description: 把一条内容原样记入小秘书的 GTD 收件箱（Inbox.md）。
disable-model-invocation: true
argument-hint: "要记入收件箱的内容"
---

# GTD Inbox Capture

捕获与澄清分开。只保存仍需后续推进或跟踪的承诺，不替用户拆解、分类或虚构日期。GTD 目录以 secretary skill 末尾「Current configuration」的 GTD data directory 为准，格式约定见目录内 README.md。

## 行为

1. 调用时没有附带内容，问用户：「要捕获什么？」
2. 先识别不需要进入 GTD 的情况：约两分钟内能立即完成的事直接引导完成；参考资料转入用户指定的知识库；睡觉、吃饭、洗漱、通勤等日常生活如需安排或记录，转入时间记录。上述情况不写 Inbox.md。
3. 对仍需跟踪的承诺，读 Inbox.md，把新条目追加到文件末尾，一次一条：
   - `- [ ] 压缩后的标题 #inbox`
   - 下一行缩进引用保留用户原话：`  > 原话：...`（不改写、不总结、不润色）。
4. 一次给多条内容时逐条处理，不合并。
5. 写前重读、写后回读，确认落盘后提醒用户 `/gtd-clarify` 可以处理它。

完成标准：Inbox.md 能读回原始输入，且没有创建项目、行动、日期或时间块；两分钟事项、参考资料与日常生活没有被强行写入 GTD。
