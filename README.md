# dsh-secretary

DeepSeek Harness 的私人 Secretary Agent：以 GTD 管理事项，以独立 Tag 分类，以 Time 管理具体日期计划、实录、计划模板和深度时间。安装入口是 [packages/secretary](packages/secretary/README.md)。

> 当前验收范围仅为 **Time + Tag**。#6 GTD Review／Repeat／OmniFocus UI 与全产品 #8 暂停；现有 GTD UI 不是终稿。Goal、统计、预算和对账不在本轮，也没有对应实现交付。

## 当前能力

| 能力 | 干什么 | 入口 |
|---|---|---|
| 时间安排（Time） | 具体日期 PlanBlock／ActualBlock、weekday 模板及持久化 apply/undo、DeepTime 7×24 基础周模板 | `secretary_time` 工具与 Time 面板 |
| 统一标签（Tag） | `time`／`context` 两棵树、任意层级 CRUD／move／选色、桌面 HTML5 层级拖拽、父级后代查询与引用保护 | `secretary_tag` 工具与 Tags 面板 |
| 事项管理（GTD，基础切片） | 数字 ID 的 Inbox／Project／Action、Next／Forecast、Availability 与跨层 Tags 继承 | `secretary_gtd` 工具与基础 GTD 视图 |
| 主动工作 | Schedule 唤醒后读取同一批领域事实，准备材料并保存引用 | DSH Schedule + `secretary` 技能 |

Shell、文件、搜索、后台任务、Schedule、技能、计划模式、委派、提问和交付卡片等通用能力复用 DSH 官方插件。完整装配见 [bundle README](packages/secretary/README.md)。

## 安装与验证

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
dsh plugin --profile <name> add <本仓>/packages/secretary
```

运行要求 DSH `0.2.1-rc.5` 或兼容的 `0.2.x`。新开会话选择 **Secretary** preset；默认业务数据在 `$DSH_HOME/storages/secretary.db`。真实 desktop profile 的安装与新会话验收由交付 lead 另行执行，本仓测试只使用临时 `DSH_HOME`。

## 开发导航

| 你要做什么 | 去哪 |
|---|---|
| 改代码（命令、包图、改动约束） | [AGENTS.md](AGENTS.md) |
| 理解当前产品与交互边界 | [产品架构](docs/product-architecture.md)、[2026-11-03 产品基线](docs/specs/2026-11-03-secretary-product-foundation.md) |
| 理解领域事实与数据所有权 | [数据模型](docs/data-model.md)、[运行架构](docs/architecture.md) |
| 改某个包（exports、Config、限制） | 该包自己的 README |
| 查看本轮真实证据与未覆盖项 | [verification.md](docs/verification.md) |
| 追溯决策、术语、调研与进展 | [docs/](docs/README.md) |
