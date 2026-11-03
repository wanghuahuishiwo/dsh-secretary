# 架构

## 形态

当前是一个可安装 bundle，内含多个 subpath Cordis plugins。GTD 与 TimeBlock Services 在 bundle 根部全局挂载；Tools、Statistics 和 Skills 在 Secretary preset 中消费。Secretary preset 的插件底座与官方 standard preset 全量对齐（秘书不是能力受限的封闭 agent，差异仅 persona 与领域件）。运行需要带 `agentPresets`、Schedule 与 Web 组合的 DSH 宿主，不使用 Obsidian，也不保留旧 Action store 兼容层。

**集成链路（怎么被 DSH 加载）与能力装配（preset 全量工具清单）见安装入口文档 [packages/secretary/README.md](../packages/secretary/README.md)。**

workspace 拆包与依赖方向的决策见 [ADR 0004](adr/0004-workspace-packages.md)；包图速览在根 [AGENTS.md](../AGENTS.md)。长期约束只有一条：领域包之间只经契约入口（`dsh-secretary-gtd/contract` 等）引用类型与服务，不 import 对方实现。每个包的入口、Config 和限制见各自 README（`packages/*/README.md`）。

## 数据所有权

默认数据库为 `$DSH_HOME/storages/secretary.db`。`dsh-secretary/storage` 提供小秘书专用的 `secretaryStorageDomain`，仅将以下 domains 路由到 SQLite，不修改宿主全局 `storage-domain` 的默认 backend 或其他 routes：

- `secretary_gtd`：`projects`、`actions`、`inbox`。
- `secretary_time`：`time_blocks`。

宿主其他 domains 保持原 backend。两个 domains 各自串行写入，关闭时排空并释放；当前没有跨 domain 事务，因此 TimeBlock 只保存 Action ID，不复制 Action，Statistics 不保存统计副本。准备产物由文件工具拥有，Action 只保存 `preparationResultRef`。

## GTD 语义

Project 与 Action 是不同角色，不再用任意 Action 树同时表达所有容器。Action 的 Status 与 Availability 分开：Availability 由 Action／Project 状态、Defer 和 sequential 前序 Action 派生。Completed 与 `completedAt` 属于 GTD；actual 工作区间属于 TimeBlock。

当前只实现曳光弹所需子集：Inbox 捕获与澄清、新建 Project 与首个 Action、查询与更新 Action、完成 Action，以及基础 Availability。Action Group、Folder、Tag、Repeat、Perspective 和 Project Review 不属于当前实现。

## 时间语义

TimeBlock 引用一个 Action，保存一个 planned 区间与可选 actual 区间。改期不改 actual；actual 必须带来源；记录 actual 不自动完成 Action。TimeBlock 是小秘书自有扩展，不是 OmniFocus 的单时刻 Planned Date。

actual 可以带一个固定的专注档位 `focus`（`deep` / `shallow`），描述这段时间里人能专注到什么程度，用于校准状态曲线。档位是代码内封闭枚举，不提供自定义入口，Agent 只能取值不能扩展；`focus` 依赖 actual 存在。它与 GTD 的 lifecycle `status`（active / completed / dropped）是不同概念。时间「花在哪条线」不属于 TimeBlock 模型。

Statistics 读取 TimeBlock 的 actual 与 `focus`，按请求范围裁剪，并按「一天中的小时 × 专注档位」汇总分钟数，不产生第二份事实源。

## Agent 与主动工作

Secretary Skill 是用户委托和 Schedule 唤醒共用的行为接口。用户触发时，Agent 读取 GTD 与时间安排，提出方案、协商改期并保存确认结果。主动工作时，Schedule 只负责在原会话唤醒；Agent 后续读取 Action、准备实际材料、保存引用并带着成果联系用户。

Schedule 投递成功不代表模型执行成功。`preparationResultRef` 用于幂等复用，准备不写 actual、不自动 Completed。Agent 根据影响、可逆性、把握程度和用户偏好判断分寸，不使用静态授权矩阵。

## 验证分层

- `packages/secretary/tests/tracer.mjs`：built lib、公开工具、真实临时 SQLite、完整关闭与重开。
- 打包与隔离 profile：检查发布文件、依赖、完整 Loader 配置与 peers。
- 真实 Web + scripted adapter：验证真实 AgentLoop、preset、工具调用、Schedule 来源消息、准备产物和最终 SQLite 事实。
- 真实 `glm-5.3`：已验证自然协商、Schedule 主动准备、结构化确认、actual／Completed 与统计；schema 和准备引用问题已转成实现修复与回归证据。其他模型和对话分支仍需持续评估。
