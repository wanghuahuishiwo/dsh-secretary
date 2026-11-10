# 小秘书 Agent（Secretary Agent）

## 1. 定位

Secretary Agent 是对话式私人秘书：无独立 UI，在 DSH 会话中工作，经原子工具操作与产品 UI 相同的领域事实。架构上它不是代码模块，而是**一组插件经 Secretary preset 组装出的组合体**——每个插件可贡献多类能力，本文按能力域类型盘点（§2），插件作为来源标注。全部领域数据落在同一 SQLite（`$DSH_HOME/storages/secretary.db`），Agent 无私有事实源，与浏览器产品同经领域 Services（见 [architecture.md](architecture.md)）。

## 2. 能力域类型总览

| 能力域类型 | 回答的问题 | 来源插件举例 | 节 |
|---|---|---|---|
| Tools（工具） | 模型能调用什么 | tool-web、tool-fs、tool-bash（time/tag 经 bash CLI） | §3 |
| Skills（技能） | 模型按什么行为规则做事 | dsh-secretary、gtd-agent、skill-filesystem | §4 |
| Prompt 注入（系统提示词段落） | 每轮固定看到什么 | persona、system-prompt、各工具插件 | §5 |
| Context 快照（动态上下文） | 环境事实如何随轮刷新 | time-context、working-directory | §6 |
| 指令链（AGENTS.md） | 项目级约定如何进入 | agent-instructions | §7 |
| Schedule（定时） | 何时自己醒来做事 | tool-schedule | §8 |
| Commands（命令） | 用户有哪些 `/` 命令 | command-goal、command-compact | §9 |
| 上下文治理机制 | 请求形状管理 | compaction 系列 | §10 |
| Config（插件配置） | 环境参数 | dsh-secretary | §11 |

同一插件在多个类型下出现是正常的（交叉引用，非重复归属）。裁剪操作面 = preset 的插件行；**裁掉一个插件 = 同时失去它在所有类型下的贡献**。

---

## 3. Tools（工具）

| 工具 | 能力 | 来源插件 | 裁掉后果 |
|---|---|---|---|
| ~~`secretary_gtd`~~ | 已退役：GTD 走 Markdown 数据面 + 通用文档工具 | —（#51） | — |
| ~~`secretary_tag`~~ / ~~`secretary_time`~~ | 已退役：op 面并入 CLI `dsh-secretary`（经 `bash` 调用） | —（#51） | — |
| `bash` / `pwsh` | Shell 命令（按平台二选一）；`"$DSH_SECRETARY_CLI"` 即 time/tag 能力入口 | `@deepseek-ai/dsh-tool-bash` / `dsh-tool-pwsh` | 失去 CLI 通道与系统操作兜底 |
| `read` / `write` / `edit` | 文件读写与编辑 | `@deepseek-ai/dsh-tool-fs` | 准备产物、备注材料、（将来）GTD Markdown 全部失效 |
| `glob` / `grep` | 文件查找与内容搜索 | `@deepseek-ai/dsh-tool-fs-search` | 不能在大目录里找材料 |
| `web_search` / `web_fetch` | 网络搜索与抓取 | `@deepseek-ai/dsh-tool-web` | 秘书不能自查资料，准备只能靠用户喂 |
| `ask_user_question` | 结构化提问 | `@deepseek-ai/dsh-tool-ask-user` | 协商决策点退化为自由文本追问 |
| `present` | 发布交付文件 | `@deepseek-ai/dsh-tool-present` | 不能以文件卡片发材料 |
| `todo_write` | 任务清单 | `@deepseek-ai/dsh-tool-todo` | 多步跟进无结构化清单 |
| `jobs` | 后台任务 | `@deepseek-ai/dsh-tool-jobs` | 长命令阻塞对话 |
| `subagent` / `subagent_fork` | 子代理委派 | `@deepseek-ai/dsh-tool-subagent` | 不能并行准备 |
| `workflow` | 多代理编排 | `@deepseek-ai/dsh-tool-workflow` | 不能大规模并行 |
| `schedule` | 定时唤醒（§8） | `@deepseek-ai/dsh-tool-schedule` | **主动工作唯一通道，不裁** |
| `goal` | 会话目标 | `@deepseek-ai/dsh-tool-goal` | 失去 `/goal`；秘书有自己的事项体系 |
| `plugin_manager` | 管理插件（条件可用） | `@deepseek-ai/dsh-plugin-manager/tools` | 失去插件管理；非秘书场景 |
| `skill` | 按需加载技能 | `@deepseek-ai/dsh-tool-skill` | 不能按需取技能 |

CLI op 明细（`dsh-secretary <time|tag> <op>`，真实代码枚举；与 `secretaryTime/secretaryTag agentInvoke` Remote 一一对应）：

| 域 | op |
|---|---|
| `tag` | `create` / `get` / `list` / `update` / `move` / `delete` · `reload` |
| `time` | `plan.list` / `get` / `create` / `update` / `delete` · `actual.list` / `get` / `create` / `update` / `delete` / `start` / `stop` · `template.list` / `create` / `update` / `delete` / `apply` / `undo` · `deep.getWeek` / `setCell` / `clearCell` / `setRange` / `clearRange` · `reload` |

数据路径：agent shell → CLI（`/connect` 换凭据）→ `/api` → `secretaryTime` / `secretaryTag` Remote → TimeService / TagService → 同一 SQLite；GTD → Markdown 数据面（通用文档工具）。端点、launch token 与 CLI 路径由 `ctx.shellEnv.register` 注入 `DSH_SECRETARY_URL` / `DSH_SECRETARY_TOKEN` / `DSH_SECRETARY_CLI`。CLI 包：本仓 [secretary/cli](../packages/secretary/cli)。

## 4. Skills（技能）

| 技能 | 内容 | 来源插件 | 裁掉后果 |
|---|---|---|---|
| `secretary` | 行为主体（主循环 + 授权边界，见下），persona 要求处理相关事项时加载 | `dsh-secretary`（当前插件） | 不可裁——秘书行为规则全部在此 |
| `gtd-inbox-capture` / `gtd-clarify` | 捕获与澄清流程，仅用户显式调用 | `dsh-secretary-gtd-agent`（当前插件） | 失去捕获/澄清引导，GTD 工具仍在但无流程约束 |
| 技能目录（来源方） | preset 已显式 `disabled: true`（#51）：目录只剩运行时注册技能，71 个全局技能不再进入任何秘书会话，旧 vault 同名冲突随之消除 | `@deepseek-ai/dsh-skill-filesystem` | 重新启用 = 71 个全局技能回流（25 个 model-invocable） |

**技能的两条进入通道**（汇入同一注册表）：文件系统目录扫描（`skill-filesystem`，现已禁用）与**运行时注册**（插件 `apply` → `ctx.skills.register`，当前插件 3 个技能：secretary、gtd-inbox-capture、gtd-clarify）。当前插件的技能随包安装在 profile 的 `node_modules/<包>/assets/` 下，不依赖 `~/.agents/skills` 与 workspace。

secretary skill 行为规则（资产：本仓 `packages/bundle/secretary/assets/secretary/SKILL.md`）——主循环：

```text
理解 ──→ 准备 ──→ 协商 ──→ 确认 ──→ 跟进
读事实    做准备    提 Proposal   用户拍板    Schedule 唤醒复查
```

授权边界：

| 层 | 内容 |
|---|---|
| 自主可做 | 读事实；整理信息；准备清单/摘要/议程/初稿；`schedule_create` 自唤醒 |
| 必须用户确认 | 写入或修改日期计划；写入实录；完成/放弃 Action |
| 永不 | 把 Proposal 当已确认；把 Preparation 当已执行；伪造实录或完成状态；绕过领域工具直写存储 |

配套不变式（[glossary.md](glossary.md) §5）：Proposal 不是事实，Preparation 不是执行，Completed 与时间实录互不伪造。

## 5. Prompt 注入（系统提示词段落，每轮固定）

| 注入内容 | 来源插件 | 裁掉后果 |
|---|---|---|
| **秘书 persona 前缀**（四句身份文案 + 模型名介绍，文案见下） | `@deepseek-ai/dsh-persona`（机制，preset 行）+ 当前插件文案 | 不可裁——身份注入的唯一通道；文案随时可改 |
| Harness 身份一句 | `@deepseek-ai/dsh-system-prompt` | 不可裁（组装必需） |
| 各工具使用指导段（十数段，随 §3 工具） | 各工具插件（tool-bash、tool-fs…各自注册） | 随对应工具插件裁剪消失，省每轮固定 token |
| 计划模式规则段（激活时） | `@deepseek-ai/dsh-plan-mode` | 失去"先探索后审批"；秘书场景影响小 |
| 工具 SDK 与结构化输出指导 | `@deepseek-ai/dsh-system-prompt` | 不可裁 |
| Harness 源码 / Web 表层 / 部署后缀 | `@deepseek-ai/dsh-system-prompt` | 可经 system-prompt 配置收窄 |

persona 文案：

> 你是用户长期信任的私人秘书。主动承接、判断分寸、减少用户管理成本。
> 处理事项、安排、准备、跟进或 Schedule 唤醒时，先加载 secretary skill 并遵循其中行为。
> 用户始终只与一个连贯的秘书对话，不向用户暴露内部插件或存储结构。
> 先读取上下文并做出有用准备，再就带着成果的具体方案联系用户。

配置文档：DSH 官方仓（`deepseek-harness`）`packages/preset/persona/README.zh.md`、`packages/core/system-prompt/README.zh.md`；文案在本仓 [bundle/secretary/cordis.patch.yml](../packages/bundle/secretary/cordis.patch.yml) `preset-secretary → persona.prefix`。

## 6. Context 快照（动态上下文，user 角色消息按需刷新）

| 注入内容 | 来源插件 | 裁掉后果 |
|---|---|---|
| 当前时间、浏览器时区、与上一消息间隔（默认 ≥10 分钟一次） | `@deepseek-ai/dsh-time-context` | 秘书不知现在几点，日期语义降级 |
| 当前工作目录 | `@deepseek-ai/dsh-working-directory` | 相对路径失去锚点 |
| 沙箱策略 / 审批策略 | `@deepseek-ai/dsh-sandbox-policy` / `dsh-user-approval` | 宿主级安全边界，不建议动 |

配置文档：DSH 官方仓 `packages/context/time-context/README.md`、`packages/session/working-directory/README.zh.md`。

## 7. 指令链（AGENTS.md）

| 注入内容 | 来源插件 | 裁掉后果 |
|---|---|---|
| AGENTS.md 指令链（全局 + 项目级，64KB 预算，durable user 消息） | `@deepseek-ai/dsh-agent-instructions` | 不再读 AGENTS.md；秘书行为本由 skill 承载，影响可控 |

配置文档：DSH 官方仓 `packages/context/agent-instructions/README.zh.md`。

## 8. Schedule（定时，主动性）

唯一主动性通道。当前工作流：

```text
用户请求（或会话中协商）
  → schedule_create 定唤醒，提示含 Action ID 与准备目标
  → 提醒 ID 写入 Action.preparationReminderId（不进实录）
  → 唤醒后：读 Action / 已有 preparationResultRef
      ├─ 已有有效准备 → 复用，不重复生成
      └─ 没有 → 读材料，生成清单/摘要/议程/初稿
  → 文件保存产物 + action.update 写回 preparationResultRef
  → 带着成果和具体建议联系用户（不是"你有事项待办"）
```

- 来源插件：`@deepseek-ai/dsh-tool-schedule`（配置文档：DSH 官方仓 `packages/schedule/README.zh.md`）
- **未定义**：触发源（到期/偏差/回顾）、打扰边界（静默/频率/去重）、宿主重启可靠性 → [#25](https://github.com/wanghuahuishiwo/dsh-secretary/issues/25)；离开 DSH 的送达通道 → [#26](https://github.com/wanghuahuishiwo/dsh-secretary/issues/26)

## 9. Commands（命令）

| 命令 | 内容 | 来源插件 | 裁掉后果 |
|---|---|---|---|
| `/goal` | 会话目标管理 | `@deepseek-ai/dsh-command-goal` | 失去目标命令；`goal` 工具也随之裁 |
| `/compact` | 手动压缩上下文 | `@deepseek-ai/dsh-command-compact` | 失去手动压缩入口 |

## 10. 上下文治理机制（非注入）

| 机制 | 内容 | 来源插件 | 裁掉后果 |
|---|---|---|---|
| 压缩 | 历史压缩与工具结果修剪（threshold 8192 字符） | `@deepseek-ai/dsh-compaction-basic` + `dsh-compaction-tool-result-pruner` | 长对话无压缩，易爆上下文 |

## 11. Config（插件配置）

| 字段 | 默认 | 含义 | 所属插件 | 注入方式 |
|---|---|---|---|---|
| `defaultTimeZone` | `Asia/Shanghai` | 秘书默认 IANA 时区 | `dsh-secretary`（当前插件） | secretary skill 配置后缀 |
| `timePlanPath` | 未设置 | 只读人生规划文件绝对路径 | 同上 | 同上 |

配置经 profile patch 调整，不改代码（[bundle README](../packages/bundle/secretary/README.md)）。

## 12. 能力面与已知缺口

| 能力 | 现状 | 去向 |
|---|---|---|
| 会话内承接/协商/准备/跟进 | ✅ 已运行 | — |
| GTD 捕获与澄清 | ✅ 已运行（user-only 技能） | — |
| 计划/实录/模板/深度时间读写 | ✅ 已运行 | — |
| 主动工作模型（触发/打扰/频率/去重） | ❌ 未设计 | [#25](https://github.com/wanghuahuishiwo/dsh-secretary/issues/25) |
| 外部送达通道（钉钉） | ❌ 未设计，依赖 #25 | [#26](https://github.com/wanghuahuishiwo/dsh-secretary/issues/26) |
| 非秘书会话调用秘书能力 | ✅ CLI 已交付（#51/#45） | — |
| 时间块统计 | ❌ 未设计 | [#48](https://github.com/wanghuahuishiwo/dsh-secretary/issues/48) |
| GTD 完整工作区 UI | ❌ 空白页 | [#6](https://github.com/wanghuahuishiwo/dsh-secretary/issues/6) / [#5](https://github.com/wanghuahuishiwo/dsh-secretary/issues/5) |
| GTD 过渡数据面（Markdown 直读） | ✅ 已交付（#51/#53） | — |
| 技能目录噪音与同名冲突（§4） | ✅ 已裁剪（skill-filesystem 禁用） | — |

**官方还有、当前未挂载的扩展**（需要时在 preset 加插件行）：mcp（外部工具接入）、team（多代理任务板）、session-query（会话历史检索，对秘书回忆潜力大）、attachment（用户发文件）、webhook（外部事件唤醒，与 #25 相关）、guard / spill（循环守卫与结果外溢）、lsp / terminal / computer-use / browser-use（工程向，秘书用不到）。分组总表见 DSH 官方仓 `packages/README.zh.md`。

## 13. 资产落位与演进

已定的落位规则（2026-11-10）：

- **设计权威**：本文。Agent 的架构叙述只在这里维护，包 README 只讲包级事实。
- **当前资产**：`bundle/secretary` 事实上是 Secretary Agent 的家（persona 配置、secretary skill、技能注册、preset 组合），兼唯一安装入口。
- **演进触发已发生**：CLI（`packages/secretary/cli`，#51）是第一块 Agent 自有运行代码，`packages/secretary/` 能力族已建立；后续自有运行代码迁入该族。
- **GTD 技能**暂留 `gtd/agent`；出现跨领域编排技能时再收拢。
- **命名规则**：指"小秘书这个实体"永远带 `secretary` 限定（secretary-agent、`packages/secretary/`）；裸 `agent` 留给"给 agent 的指令与基础设施"这一既有含义（AGENTS.md、`.agents/`、`gtd/agent`）。

## 14. 事实约束（非目标）

- Agent 独立 UI 或独立产品入口：不做。
- 另建平行事实源：不做——Agent 与 UI 必须操作同一批领域事实。
- 使用策略写进领域模块：不做——策略属于 skill / persona 层，领域模块只提供原子能力。
- 复制 SKILL.md 全文、工具参数细节或验收记录到本文：不做——归各自权威。
