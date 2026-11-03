---
name: gtd-inbox-capture
description: 把一条内容原样记入小秘书的 GTD 收件箱。
disable-model-invocation: true
argument-hint: "要记入收件箱的内容"
---

# GTD Inbox Capture

捕获只进不判。把用户给的内容原样保存，留待 `/gtd-clarify` 单独处理。

## 行为

1. 调用时没有附带内容，问用户：「要捕获什么？」
2. 调用 `secretary_gtd` 的 `inbox.capture`：
   - `title`：压缩原话，不拆解。
   - `raw`：保留用户原话，不改写、不总结、不润色。
   - `source`：填 `user_invocation`。
3. 一次给多条内容时，逐条捕获，不合并。
4. 返回已保存条目的标题与 ID，并提醒用户 `/gtd-clarify` 可以处理它。

完成标准：能通过 `inbox.list` 读到原始输入，且没有创建 Project、Action、日期或 TimeBlock。
