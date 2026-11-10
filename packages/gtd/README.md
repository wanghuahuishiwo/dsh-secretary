---
description: "GTD 能力族：领域 Service、模型工具与 Agent 技能分属三个角色包。"
kind: "package-group"
---

# gtd/

## 摘要

GTD 能力族：Inbox、Project、Action 事实与派生查询，及其模型工具和用户技能。组目录是纯容器，仓库级包地图见 [packages/README.md](../README.md)。

## 包

| 包 | 名称 | 角色 |
|---|---|---|
| [`agent/`](agent/README.md) | `dsh-secretary-gtd-agent` | 用户侧 GTD 技能与技能资产 |

## 约束

- GTD 数据面是 Markdown（`gtdPath` 目录）；`agent` 只注册技能，SQLite GTD 域与工具已随 #51 退役。
- 跨包只依赖 Service contract，不 import 其他包的内部源码。

## 领域模型

GTD 管理承诺、项目、行动及其可用性。事实存放在插件自有的 Markdown 数据面，不是数据库表；产品范围见 [GTD 产品范围](../../docs/prd/gtd.md)。

### 进入系统的条件

- 能在约两分钟内立即处理的事直接完成，不持久化。
- 只有尚未闭环、需要后续推进或跟踪的承诺才进入 GTD。
- 想法、参考资料与知识沉淀进入知识库，不混入执行型 Inbox。
- 吃饭、睡觉、洗漱等日常活动不进入 GTD，也不生成 Action。

### 日期语义

| 字段 | 含义 | 关键边界 |
|---|---|---|
| Defer Date | 不早于此时间开始可用 | 不是打算执行的时间 |
| Planned Date | 打算何时开始做 | 是时间点和柔性意图，不是时间区间 |
| Due Date | 必须在此之前完成或放弃 | 不是计划完成时间 |
| Estimated Duration | 预计工作量 | 不是计划区间或实际时长 |
| Completed Date | Action 变为 Completed 的时刻 | 不是实际工作区间 |

不另设「行动计划」概念；Action 上的 Planned Date 已足够表达意图。

### Next Actions

- 是当前可选择的 physical, visible next step。
- 可以是不属于项目的独立行动。
- 顺序项目的后续行动受前序阻挡；并行项目可同时有多个 Next Actions。
- 不要求 Planned Date 或时间块。
- 通常按 Context 组织，也可按 Project 查看；这是视图差异，不是两份事实。

### 有效时间标签

- 项目段的 `#标签` 对其下所有行动生效；行动行的 `#标签` 是追加，不覆盖或阻断继承。
- 独立行动必须自己带时间标签，才能保证每个行动都有有效时间标签。

```text
有效 Tags = 自己的 Tags + 所有 GTD 祖先的 Tags（按 Tag id 去重）
```

- 继承只用于查询，不复制写入子 Action。
- 这是「GTD 层级继承」；与「标签树向上汇总」（子标签命中归入父标签查询，见 [tag/](../tag/README.md)）是两种不同关系。
- `time` 标签同时可用于 TimeBlock 和 GTD Project／Action；`context` 仍用于 GTD 情境分类。TimeBlock 与 GTD 之间只共享标签，不建立直接结构化关联。

### 数据面

数据面是 `gtdPath` 目录（默认 `$DSH_HOME/storages/secretary/gtd/`）：checkbox 表达行动状态、缩进表达层级、Obsidian 式标签表达属性、标题表达项目；由秘书／普通 agent／用户经通用文档工具或 Obsidian 直接读写，现读现写。目录内 README.md 是格式与读写约定的唯一来源，种子模板见 [`packages/bundle/secretary/assets/gtd/README.md`](../bundle/secretary/assets/gtd/README.md)。
