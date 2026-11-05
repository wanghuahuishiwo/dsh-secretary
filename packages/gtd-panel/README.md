# Secretary GTD Panel

独立的“小秘书-事项”产品交付插件。Browser 入口以同一稳定 id/key `dsh-secretary-gtd` 注册 `sidebar.panellist` 与 `main`：展开时显示清单图标和“小秘书-事项”，收起时只显示图标；点击后由 DSH AppFrame 打开空白主区，现有 Conversation／workspace 导航负责返回。

## 入口与限制

- `.`：空 Host apply，只让产品可被 Loader 独立装卸；没有 Host routes、Remote namespace 或 GTD API。
- `./client`：Web client 插件，仅依赖 `slots`，贡献左栏入口与空白 `main`。
- 不包含旧 GTD 工作区、OmniFocus 控件、Mac chrome、占位卡片或表单；不 import Time 或旧聚合面板。
- 既有 `dsh-secretary-gtd` Service、SQLite facts 与 Agent tools 由 bundle 独立组合，本产品卸载不带走它们。

真实 `dsh web` + Chromium 验证位于 `packages/secretary/tests/browser.mjs`。
