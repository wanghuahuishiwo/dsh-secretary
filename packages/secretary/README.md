# dsh-secretary

一个可安装到 DeepSeek Harness 的私人 Secretary Agent bundle：以 GTD 管理 Project 与 Action，以 TimeBlock 保存计划与实际时间，并通过主动准备、协商安排和持续跟进减少用户管理成本。本包是 workspace 的安装入口，领域能力来自兄弟包 `dsh-secretary-{core,storage,gtd,time-block,statistics}`。

当前曳光弹打通两条真实入口：

- **用户主动委托**：捕获 → 澄清 → Project／Action → 协商与改期 → TimeBlock → actual／Completed → Statistics。
- **Secretary 主动工作**：DSH Schedule 在原会话唤醒 → 读取事项 → 准备实际材料 → 保存引用 → 带着成果与下一步联系用户。

## 构建与验证

在 workspace 根执行（自动按依赖序构建全部包）：

```sh
pnpm install
pnpm build
pnpm test
```

`pnpm test` 使用真实临时 SQLite 文件验证公开工具链路、完整关闭后的重开恢复，以及 Skills 与 bundle 装配。

## 开发体验

```sh
pnpm dev   # workspace 根：全部包并行 watch
```

desktop profile 通过 `link:` 使用 `packages/secretary` 的构建产物，DSH HMR 监听 `packages/secretary/lib`。注意：改动兄弟包（gtd 等）后需要触发 `packages/secretary/lib` 重建或 `/dsh-reload` 才会重载。发布与隔离验收使用 `pnpm pack`（在本包目录）。

## 安装与集成链路

DSH 宿主本身不认识"小秘书"。集成靠三层机制，全部声明式，不修改宿主代码：

1. **安装 = profile 的依赖**。宿主按 profile（如 `~/.dsh/profiles/desktop`）加载插件，profile 的 `package.json` 把 `dsh-secretary` 声明为依赖（本机开发用 `link:.../packages/secretary`），并在 `dsh.profile.bundles` 里启用。**bundle patch 里按名字引用的每个包都必须是 profile 的直接依赖**：除了 `dsh-secretary` 本体，还包括兄弟包 `dsh-secretary-storage/gtd/time-block/statistics`（link/安装）与 **`@deepseek-ai/dsh-storage-sqlite`**（registry 版本，见本包 `package.json` dependencies）。缺任何一个，宿主从 profile 根解析不到名字 → 对应条目 `failed to import`、依赖它的服务全部 pending → preset 激活失败、新会话的模式列表里不会出现 Secretary（pnpm 的嵌套 `node_modules` 对宿主不可见）。排查方法：克隆 profile 为其他名字后 `dsh --profile <克隆名>` 启动，告警会列出未激活条目及原因（desktop profile 被 Electron 独占，不能直接 CLI 启动）。
2. **装配 = cordis.patch.yml 分层合并**。本包 `cordis.patch.yml` 是 bundle 层 patch，在宿主各层之后应用，做两件事：根层禁用 `skill-office`；`insert` 一组插件条目——SQLite backend、三个全局领域服务，以及一个 `dsh-agent-preset` 实例（即 Secretary 模式）。preset 的 `plugins` 列表就是一次新会话的完整装配单（见下「能力装配」）。
3. **运行 = 新会话按 preset 组装**。新建会话选择 Secretary，宿主按该 preset 的 plugins 列表创建 AgentLoop：注入 persona 与上下文、注册工具与技能。改 `cordis.patch.yml` 后用 `/dsh-reload` 触发 HMR 重组（从磁盘重读 patch），**已开会话保持旧装配，需新开会话生效**；改任何包 `src/` 先 `pnpm dev`（或 `pnpm build`）让 `lib/` 产物更新。

一次委托的执行路径：用户消息 → Secretary preset 的 AgentLoop（persona 要求先加载 `secretary` 技能）→ 模型选择工具 → 领域工具（`secretary_gtd` 等）→ 全局领域 Service（`ctx.gtd` / `ctx.timeBlocks`）→ `secretaryStorageDomain` → SQLite（`secretary.db`）。通用工具（bash/fs/web 等）不经过领域服务，由 DSH 插件直接执行。

正式安装（非 link）：先构建，再在 DSH 会话内用 `plugin_manager`（`action: install_bundle`，`target` 填 `packages/secretary` 绝对路径），或终端：

```sh
dsh plugin --profile <name> add /绝对路径/dsh-secretary/packages/secretary
```

运行 profile 必须组合 `dsh-base`、`dsh-web-app` 与本 bundle。首版不支持 headless 或 SDK-only 组合。

## 使用

- 直接告诉 Secretary 要推进的结果，由它读取上下文、提出安排、协商改期并跟进。
- `/gtd-inbox-capture`：只捕获原始输入，不擅自分类。
- `/gtd-clarify`：与用户确定 Project 的结果和首个 Action。
- Secretary 可以创建准备提醒；到点后先准备材料，再带着结果联系你。

GTD Skills 保持 user-only，Secretary Skill 允许模型按需加载。preset 插件底座与官方 standard 全量对齐（见 cordis.patch.yml 头部注释）。

## 能力装配（全量清单）

以下来源均为本包 `cordis.patch.yml` 实际条目，与官方 `web-app/presets/standard.patch.yml` 逐行同构（升级 DSH 时重新 diff 防漂移）。preset 装配单按职能分九类：A–H 全部是 DSH 官方插件（我们只配参数），只有 I 是本项目开发。

### 根层条目（对所有 preset 生效）

| 条目 | 包 | 来源 | 作用 |
|---|---|---|---|
| `skill-office`（禁用） | 桌面端默认注册 | DSH | 办公文档技能，本机不用，整层禁用；回滚 = 删这两行 |
| `storage-sqlite` | `@deepseek-ai/dsh-storage-sqlite` | DSH | SQLite backend，指向 `$DSH_HOME/storages/secretary.db`，WAL |
| `secretary-storage` | `dsh-secretary-storage` | 本项目 | `secretaryStorageDomain` facility：把 `secretary_gtd`/`secretary_time` 两个 domain 路由到上面的 SQLite |
| `secretary-gtd` | `dsh-secretary-gtd` | 本项目 | 全局 GTD Service（`ctx.gtd`），Inbox/Project/Action/Availability 唯一事实 |
| `secretary-time-block` | `dsh-secretary-time-block` | 本项目 | 全局 TimeBlock Service（`ctx.timeBlocks`），planned/actual 区间，校验 Action 引用 |

### A. 身份与上下文注入（DSH 机制，文案本项目）

| 条目 | 包 | 作用 |
|---|---|---|
| `persona` | `@deepseek-ai/dsh-persona` | 系统提示前缀：私人秘书角色、先加载 secretary 技能、不暴露内部结构 |
| `agent-instructions` | `@deepseek-ai/dsh-agent-instructions` | 注入 AGENTS.md 指令链（上限 64KB） |
| `time-context` | `@deepseek-ai/dsh-time-context` | 当前时间与时区上下文 |

### B. 执行工具：Shell 与文件（全部 DSH）

| 条目 | 包 | 暴露的工具 |
|---|---|---|
| `tool-bash` | `@deepseek-ai/dsh-tool-bash` | `bash`（非 Windows；Windows 由 `tool-pwsh` 替代，本机禁用） |
| `tool-fs` | `@deepseek-ai/dsh-tool-fs` | `read` / `write` / `edit`；准备产物落盘靠它 |
| `tool-fs-search` | `@deepseek-ai/dsh-tool-fs-search` | `glob` / `grep` |

### C. 执行工具：联网与交付（全部 DSH）

| 条目 | 包 | 暴露的工具 |
|---|---|---|
| `tool-web` | `@deepseek-ai/dsh-tool-web` | `web_search` / `web_fetch`，准备材料时的联网调研 |
| `present` | `@deepseek-ai/dsh-tool-present` | `present`，把文件产物作为交付卡片呈现 |

### D. 主动性与后台（全部 DSH）

| 条目 | 包 | 暴露的工具 |
|---|---|---|
| `tool-schedule` | `@deepseek-ai/dsh-tool-schedule` | `schedule_create/list/update/delete`；主动唤醒入口，**只负责定时投递，不代表模型已执行** |
| `tool-jobs` | `@deepseek-ai/dsh-tool-jobs` | `job_list` / `job_output` / `job_kill`，后台任务 |

### E. 规划与过程管理（全部 DSH）

| 条目 | 包 | 暴露的工具 |
|---|---|---|
| `tool-goal` + `command-goal` | `@deepseek-ai/dsh-tool-goal` / `dsh-command-goal` | `create_goal` / `get_goal` / `update_goal`，跨轮长期目标 |
| `plan-mode`（隔离组） | `@deepseek-ai/dsh-plan-mode` | `exit_plan_mode`，先规划后执行 |
| `tool-todo` | `@deepseek-ai/dsh-tool-todo` | `todo_write`，任务清单跟踪 |
| `compaction` 组 | `dsh-compaction-basic` / `dsh-command-compact` / `dsh-compaction-tool-result-pruner` | 上下文压缩与工具结果裁剪（通用机制，与领域流程无关） |

### F. 协作与委派（全部 DSH）

| 条目 | 包 | 暴露的工具 |
|---|---|---|
| `tool-ask-user` | `@deepseek-ai/dsh-tool-ask-user` | `ask_user_question`，协商时间、澄清取舍 |
| `delegation` 组 | `dsh-tool-subagent-control` / `dsh-tool-subagent`（spawn+fork）/ `dsh-workflow-ptc` / `dsh-tool-workflow` | `subagent` / `subagent_fork` / `workflow`，子代理与多路编排 |

### G. 技能机制（DSH 机制；技能内容见「技能归属」）

| 条目 | 包 | 作用 |
|---|---|---|
| `skill-filesystem` | `@deepseek-ai/dsh-skill-filesystem` | 从文件系统根（项目/用户/bundled）发现技能，含 `~/.agents/skills` |
| `tool-skill` | `@deepseek-ai/dsh-tool-skill` | `skill` 工具，按需加载技能全文指令 |

### H. 插件管理（DSH，均与领域流程无关）

| 条目 | 包 | 状态 |
|---|---|---|
| `tool-plugin-manager` | `@deepseek-ai/dsh-plugin-manager/tools` | 启用（无 profile 上下文时自动禁用） |
| `tool-plugin-market` | `@deepseek-ai/dsh-plugin-market/tools` | **本 preset 禁用** |

### I. 领域件（本项目，小秘书私有）

| 条目 | 包 | 暴露什么 |
|---|---|---|
| `secretary-gtd-tools` | `dsh-secretary-gtd/tools` | **`secretary_gtd` 工具**：inbox.capture/clarify、project/action 查询与更新、完成 Action（op 分发） |
| `secretary-time-block-tools` | `dsh-secretary-time-block/tools` | **`secretary_time_block` 工具**：TimeBlock 增改查、actual 记录与固定专注档位 `focus` |
| `secretary-statistics` | `dsh-secretary-statistics` | **`secretary_statistics` 工具**：只读统计 Projection，按小时 × 专注档位汇总 actual |
| `secretary-gtd-agent` | `dsh-secretary-gtd/agent` | 注册技能 `gtd-inbox-capture`、`gtd-clarify`（**仅用户可调用**） |
| `secretary-agent` | `dsh-secretary` | 注册 `secretary` 技能（模型+用户均可调用），尾部注入默认时区与 `timePlanPath` 人生规划只读上下文 |

### 技能归属

| 技能 | 来源 | 调用方 |
|---|---|---|
| `secretary` | 本项目（`packages/secretary/assets`） | 模型 + 用户 |
| `gtd-inbox-capture` / `gtd-clarify` | 本项目（`packages/gtd/assets`） | 仅用户 |
| 其余技能（如 `dsh-reload`、`archify` 等） | 文件系统根 / 其他 bundle，经 `skill-filesystem` 发现 | 视各自声明 |

**结论：三个领域工具（`secretary_gtd` / `secretary_time_block` / `secretary_statistics`）和三个技能是本项目全部"私有"能力；其余执行手段（shell、文件、联网、定时、委派、提问等）全部复用 DSH 官方插件**，秘书不是能力受限的封闭 agent。

## 数据

小秘书只拥有 `secretary_gtd` 与 `secretary_time` 两个 storage domains，默认都路由到 SQLite：

```text
$DSH_HOME/storages/secretary.db
```

宿主其他数据域保持原 backend。当前不读取或双写旧 `secretary.json`，不使用 Obsidian、Tasks、Dataview 或 `gtd-vault-inject`。

## 当前边界

- 没有独立 Web UI、IM Channel、Repeat、Action Group、Folder、Tag 或 Project Review。
- 澄清当前新建 Project 与首个 Action，尚不能归入已有 Project 或追加后续 Action。
- 没有旧 Action 模型兼容层，也没有旧 JSON 或 Obsidian 数据自动迁移。
- 已通过 scripted adapter 与真实 `glm-5.3` 双链路验收；不同模型、事项类型和对话分支仍需在真实使用中持续评估。

## 文档

仓库级索引与架构见 [docs/README.md](../../docs/README.md)；各包契约见 `packages/*/README.md`。
