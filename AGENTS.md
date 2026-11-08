# dsh-secretary

个人 Secretary Agent：以 GTD 管理事项，以 TimeBlock 管理时间，通过主动准备、协商和跟进帮助用户推进结果。

## 行为准则

### 文档

- 同一主题只保留一个当前权威文件，其他位置使用链接。
- 文档原地更新；只有 ADR 追加历史。规格、工单与验收证据由 tracker 保存。

### 设计资产

- 做设计或产品 UI 工作前，先读根 [DESIGN.md](DESIGN.md)；涉及生产运行、Remote 或服务端时再读 [architecture.md](docs/architecture.md)。
- `design/` 保存长期可运行交互稿；`packages/*/prototype/` 仅用于一次性探索，不作为验收基线。
- OpenDesign 与 DSH 共用同一仓库根；设计预览使用 Fixture Adapter，不访问真实 SQLite 或生产数据；生产 UI 使用 Remote Adapter。

## 产品模块

本节是产品模块、入口、领域服务和共享边界的唯一地图；其他文档引用本节，不重复维护。

| 产品模块 | 入口 | 领域服务 | 当前范围 |
|---|---|---|---|
| 小秘书-时间块 | DSH 右侧栏 | `TimeService` + `TimeProductService` | 生产 UI 与 Remote |
| 小秘书-事项 | DSH 左侧栏 + `main` | `GtdService` | 入口与空白页，完整界面后置 |
| 小秘书-目标 | 独立入口 + 空白 `main` | `GoalService`（bundle 级空实现） | 空壳入口；实体、模型、Remote、UI 后置 |

- **Tag**：共享模块，唯一 `TagService` 与 `tags` 表；`time` / `context` 只是 `kind`。共享 `TagManager` UI/Remote 待实现，不是独立产品入口。
- **Storage / Core**：基础设施。
- **Secretary Agent / bundle**：工具、技能与装配，不是产品 UI。
- **包分组**：`packages/<能力族>/<包>`，组只是容器；包地图见 [packages/README.md](packages/README.md)，结构与角色拆分决策见 [ADR 0010](docs/adr/0010-package-groups-and-roles.md)。
- `goal-panel`、TagManager UI/Remote 尚未实现；空壳或规划不表示产品已完成。

产品范围与交互见 [docs/prd/](docs/prd/README.md)，设计资产见 [design/](design/README.md)，技术装配见 [docs/architecture.md](docs/architecture.md)。

## 仓库结构

```text
packages/
├── core/          共享基础设施子模块
│   ├── validation/
│   ├── tooling/
│   └── skill-resources/
├── storage/       Secretary SQLite domain 路由
│   └── domain/
├── goal/         上游空 Goal Provider
│   └── provider/
├── tag/          统一 Tag 能力
│   ├── service/
│   └── tool-tag/
├── gtd/          GTD 能力
│   ├── service/
│   ├── tool-gtd/
│   └── agent/
├── time/         Time 领域能力
│   └── time-block/      Time Service 与 Agent tools
├── api/          Host 产品 API
│   └── time-controller/ TimeProductService、./typert 与 ./remote
├── client/       浏览器产品 UI
│   ├── ui-time/         纯 React UI、TimeAdapter 契约与右栏插件
│   └── ui-gtd/          左栏入口与空白 main
└── bundle/       可安装装配
    └── secretary/       bundle、Preset 与 Secretary 技能

docs/
├── prd/             当前产品范围与各产品交互
├── architecture.md  当前装配、依赖、Remote 与验证入口
├── data-model.md    当前事实、关系与持久化语义
├── glossary.md      领域术语
├── adr/             架构决策历史
├── research/        调研证据
└── agents/          工单与驱动配置

design/   长期可运行交互稿、组件与场景 fixtures
scripts/  Remote 生成等仓库工具
DESIGN.md 当前视觉与组件/预览架构契约
```

命令以实际 `package.json` scripts 为准；包级入口、Config 和限制见各包 README。

<!-- BEGIN TEAM-SKILLS-DRIVERS -->
## 驱动

- `tracker`：操作工单前读 [工单约定](docs/agents/issue-tracker.md) 与 `.agents/drivers/tracker.md`，按其动作执行；目标仓库和资源边界以本次任务及工单约定为准。
<!-- END TEAM-SKILLS-DRIVERS -->
