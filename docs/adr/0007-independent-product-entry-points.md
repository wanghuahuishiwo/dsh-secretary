# 0007 · 时间块与事项使用不同的产品交付入口

- 状态：已接受（2026-11-05）

## 背景

旧的单一“小秘书”右栏把 Time、GTD、Tag、Goal 等模块放进同一个抽屉和同构页面，但时间块适合常驻窄栏直接操作，OmniFocus GTD 则需要完整的 Perspectives Bar、Sidebar、Outline 与 Inspector 工作区。把两者压进同一壳会持续牺牲各自的交互，也会让聚合 Host route 与产品页面相互牵连。

## 决策

- **小秘书-时间块**使用 DSH 右侧栏入口。保留当前已经实现的实录、计划、深度时间三个模块及其页面交互和产品功能，只重构交付入口与底层适配，不按历史原型重做。
- **小秘书-事项**使用 DSH 左侧栏入口，通过 `sidebar.panellist` 注册入口、以相同 panel id/key 注册 `main` 页面，进入独立二级页。本期页面内容为空，只验证入口与页面形式；OmniFocus 完整工作区继续原型评审，不采用事项右侧栏变体。
- 两个产品不共享“小秘书”产品壳，也不互相 import 产品页面。共享 SQLite、Tag、Goal 与 Agent 契约不等于共享 UI；现有聚合面板及 Host route 按产品边界重构。
- 已核验的 DSH 官方参照为 `ui-schedule` 与 `ui-plugin-manager` 的 `sidebar.panellist` + `main` 组合。具体包拆分、路由命名和二级导航状态由后续规格确定。

## 后果

- 时间块与事项可以独立装载、卸载、导航和验收，一个产品的读取失败不再天然拖垮另一个产品。
- 旧 `SecretaryProduct`、`GtdWorkspace` 和聚合读取／命令 route 不是终稿，不能因复用方便而保留成隐性总壳。
- 时间块的三个既有模块、产品功能和交互全部保留；事项空页面不授权实现原型中的 Review／Repeat 或其他完整工作流。
- Tag、Goal 是上游共享模块，其管理入口不随本决定自动变成任一产品的子页面。
