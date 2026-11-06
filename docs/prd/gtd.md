# 小秘书-事项

本文描述当前 GTD 产品的入口与页面边界。事项事实和 Agent 能力见 [GTD 领域包 README](../../packages/gtd/README.md)；入口与装卸实现见 [GTD 产品包 README](../../packages/gtd-panel/README.md)。

## 当前入口与页面

- 事项位于 DSH 左侧全局 panel 区，展开时显示图标和“小秘书-事项”，收起时只显示图标。
- 点击后保留 DSH AppFrame 和左栏，中央 Conversation 切换为独立的空白 `main`。
- 事项主区活跃时隐藏 Time 右栏；通过现有 Conversation／workspace 导航返回后，恢复相同会话与右栏。
- 产品装卸不改变 GTD 领域 Service、SQLite 事实或 Agent tools，也不影响 Time 产品。

## 当前能力边界

中央页面当前为空白，不能在页面中捕获、阅读或编辑事项。已有 GTD 能力继续通过 Secretary Agent 使用，包括 Inbox 捕获与澄清、Project／Action 维护、Next／Forecast／Availability 和 effective Tags 查询。

当前没有生产 GTD Remote、浏览器读写 API 或页面私有事实源。完整 OmniFocus 工作区、Quick Entry、Folder、Action Group、Flagged、Review、Repeat 和 Goal UI 均未实施。

## 设计参考

后续工作区的原型、可体验内容和设计取舍见 [OmniFocus Mac 原型说明](../../design/omnifocus-mac-brief.md)。原型不连接真实数据，也不代表其中功能已经获得实施授权。

## 相关阅读

- [当前数据模型](../data-model.md)
- [领域术语](../glossary.md)
- [OmniFocus 核心模型调研](../research/omnifocus.md)
- [运行架构](../architecture.md)
