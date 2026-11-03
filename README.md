# dsh-secretary

DeepSeek Harness 的私人 Secretary Agent：以 GTD 管理事项、以 TimeBlock 管理时间，通过主动准备、协商安排和持续跟进帮你推进结果。pnpm workspace，一插件一包，安装入口是 [packages/secretary](packages/secretary/README.md)。

## 能力全景

**领域能力（本项目开发，小秘书私有）**

| 能力 | 干什么 | 入口 |
|---|---|---|
| 事项管理（GTD） | Inbox 捕获与澄清、Project 与 Action、完成与 Availability 派生 | `secretary_gtd` 工具 |
| 时间安排（Time） | 具体日期 PlanBlock 与 ActualBlock、weekday 计划模板及持久化 apply/undo；计划与实录独立 | `secretary_time` 工具 |
| 统一标签（Tag） | 维护 time/context 两棵标签树，为时间块提供唯一分类主体 | `secretary_tag` 工具 |
| 主动工作 | Schedule 定时唤醒 → 读取事项 → 准备实际材料 → 保存引用 → 带着成果联系你 | DSH Schedule + `secretary` 技能 |

**通用执行能力（全部复用 DSH 官方插件，与 standard preset 对齐）**

Shell（bash）、文件读写与搜索、联网搜索抓取、后台任务、定时提醒、长期目标、计划模式、任务清单、子代理与工作流委派、向你提问、技能加载、交付卡片。秘书不是能力受限的封闭 agent。

**技能**

`secretary`（模型+用户，委托与主动工作的统一行为）、`gtd-inbox-capture` / `gtd-clarify`（仅用户斜杠命令）。

逐条插件/工具装配清单（含每条归属与配置）见 [packages/secretary/README.md「能力装配」](packages/secretary/README.md)。

## 安装与使用

```sh
pnpm install && pnpm build && pnpm test
dsh plugin --profile <name> add <本仓>/packages/secretary   # 含兄弟包依赖，详见 bundle README
```

新开会话选择 **Secretary** preset，直接说要推进的结果；`/gtd-inbox-capture` 捕获、`/gtd-clarify` 澄清。数据存于 `$DSH_HOME/storages/secretary.db`。

## 开发导航

| 你要做什么 | 去哪 |
|---|---|
| 改代码（命令、包图、改动约束） | [AGENTS.md](AGENTS.md) |
| 理解领域设计（GTD/时间语义、数据所有权） | [docs/architecture.md](docs/architecture.md) |
| 改某个包（入口、Config、限制） | 该包自己的 README（`packages/*/README.md`） |
| 追溯决策 / 术语 / 验证证据 / 调研 | [docs/](docs/README.md) |
