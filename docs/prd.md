# 小秘书产品需求文档（PRD）

> 状态：曳光弹实施基线
> 日期：2026-10-28
> 术语入口：[GLOSSARY-MAP](../GLOSSARY-MAP.md)

## 1. 产品定位

小秘书是一个可实际安装使用的私人 Secretary Agent，产品组合为 **GTD（参考 OmniFocus）+ TimeBlock + Agent**。GTD 管理结果与下一步，TimeBlock 管理计划与实际时间，Agent 以同一个可信赖秘书的身份主动承接、协商、准备和跟进。

领域层包含 **GTD、时间、独立 Tag 与 Agent**：GTD 复刻 OmniFocus 的核心产品逻辑；时间管理时间计划与时间实录；Tag 是跨模块的独立分类基础设施；Agent 贯穿各模块，不另建平行事实。**派生视图是各模块内部的读取能力，不是一级模块；产品导航与页面结构另行设计，不由领域模块直接映射为入口。**

睡觉、吃饭、洗漱、通勤等日常活动不进入 GTD，但属于时间模块的一等数据，可以出现在时间计划、时间实录和统计中。执行 Action 时可以联动更新 GTD 与时间实录，但两者仍是独立事实：开始／停止记录不自动完成 Action，完成 Action 也不伪造实际区间。

用户不应需要理解插件、存储或内部工具。秘书的价值不是替用户录入表单，而是减少用户管理事项和时间的成本。

## 2. 曳光弹目标

交付一颗可运行的曳光弹，而不是完整 OmniFocus 克隆或只有架构空壳。必须同时打通：

1. **用户主动触发**：用户提出事项，秘书帮助澄清、安排、改期、确认并跟进。
2. **Secretary 主动工作**：Schedule 唤醒后，秘书先完成一段有价值的准备，再带着结果联系用户。

两条链路都使用当前新模型和 SQLite，不保留旧 Action 兼容层，不使用 Obsidian。

## 3. 当前领域范围

### GTD

- **持久化边界（本人 2026-11-01 定）**：能在约两分钟内立即处理的事直接完成，不进入系统；只有尚未完成、需要后续推进的事项才进入 GTD Inbox。GTD 是处理流程，不要求把所有已执行行动留痕。
- 本产品采用执行型 Inbox：只收需要行动或形成承诺的事项；想法、参考资料与知识沉淀进入知识库，不为了套用 GTD 而混入执行收件箱。
- 吃饭、睡觉、洗漱等日常生理活动不进入 Inbox，也不生成 Action。它们不需要作为事项管理；若时间视图需要作息背景，应使用独立设置或时间事实，不得冒充 GTD 行动。
- Inbox 原样捕获与逐条澄清分离。
- Project 拥有结果、类型和状态；Action 拥有下一步、可选 Defer／Due／估计、Status 和完成时间。
- Availability 是派生状态，`active` 不等于 `available`。
- Completed 与 actual 是不同事实；简单事项可以没有 actual 而完成。

当前澄清只创建新 Project 与首个 Action。Action Group、Folder、Tag、Repeat、Perspective、Project Review 和已有 Project 归位属于后续切片。

### TimeBlock（时间账）

- **核心目的**：记录并比较时间分配，找到浪费、时间黑洞和可提高杠杆的位置；不是 GTD 的排期附件。
- **时间计划（Plan）**精确到具体日期，与实录共用日期导航；可安排睡觉、吃饭、洗漱、通勤、娱乐、运动和个人发展等时间，计划块只要求时间标签，不要求关联 Action。独立的计划模板按星期维护，可明确应用到指定日期，应用后不与日期计划自动同步。
- **实际时间（Actual）**是真实发生的时间分布，必须由用户陈述、可核实观察或外部记录支持，不从计划自动复制，也不用于伪造 Action 完成。
- 计划与实际是两条独立序列，可以关联但不得互相冒充。复盘按类别、时段、日／周比较，不强制每个计划块与实际块一一对应。
- 每个计划或实际块必须且只以时间标签作为分类主体；GTD 对象只能在备注中提及，不与时间块建立直接结构化关联。没有 GTD 对象的生活时间同样是合法时间事实。
- 目标不是「计划 = 实际 100%」，而是让偏差可见、可解释、可调整。休息、娱乐和家庭时间是主动分配，不因不是深度工作就被判为浪费。
- 杠杆分析关注：深度时间被碎片或浅层事项吞掉、低价值时间可压缩／委派／自动化、可并行场景，以及睡眠不足等会损害次日产能的偏差。
- planned 变化不改 actual；actual 不自动完成 Action。
- actual 可带固定专注档位 `focus`（`deep` / `shallow`），用来回答「一天里什么时段状态好」；这是时间属性而不是 lifecycle status，也不是用户维护的分类表，Agent 只能取值、不能新增或发明档位。

### Statistics

- 当前按「一天中的小时 × 专注档位」汇总 actual，区间按请求范围裁剪；未记录档位的分钟归入 `unlabelled`。
- Statistics 是只读 Projection，不拥有第二份事实。

### Secretary Agent

- 以同一个连贯身份理解上下文、提出安排、协商变化并跟进。
- 能先准备材料、清单或初稿时，不只发送空提醒。
- 根据情境判断分寸，不使用静态授权矩阵，也不通过重复请示转嫁管理成本。
- proposal、确认安排、actual 与 Completed 不互相伪装。

## 4. 主动工作链路

1. Secretary 使用宿主 `schedule_*` 在原会话创建唤醒，提示包含 Action 与准备目标。
2. Schedule 到点只负责投递；Agent 醒来后读取 Project、Action、TimeBlock 和已有准备引用。
3. 已有有效准备结果时复用，否则生成实际材料并保存文件，再写回 `preparationResultRef`。
4. Agent 带着准备结果和具体建议联系用户，协商后续。
5. 准备本身不写 actual、不完成 Action。用户明确报告实际或完成后才分别记录。

## 5. 数据与组合

一个 package、一个 bundle、多个 subpath Cordis plugins。GTD 与 TimeBlock Services 全局唯一，Consumers 与 Skills 在 Secretary preset 内组合。运行数据只进入 `$DSH_HOME/storages/secretary.db` 的两个业务 domains，不与旧 JSON 或 Obsidian 双写。

## 6. 验收标准

1. 捕获后能通过澄清得到 Project 与 Action，原 Inbox 条目被承接。
2. 能创建、改期 TimeBlock，planned 改期不改 actual。
3. 能分别保存 actual 与 `completedAt`，并能按「小时 × 状态档位」得到正确统计；专注档位不接受自定义值。
4. 完整关闭后，同一 SQLite 文件能恢复 GTD 与 TimeBlock。
5. 打包安装后，Secretary preset 暴露正确 Tools 和 Skills；GTD Skills 保持 user-only。
6. 真实 AgentLoop 能执行用户委托链路和 Schedule 主动准备链路，准备产物真实存在且引用可读取。
7. Schedule 消息来源可核实，准备阶段不写 actual、不自动完成 Action。
8. scripted adapter 不作为真实模型情境判断已通过的证据；真实模型验收单独记录。

## 7. 当前不做

独立 UI、IM、Obsidian runtime adapter、旧数据自动迁移、Action Group、Folder、Tag、Repeat、Project Review、Custom Perspective、完整 OmniFocus 数据兼容和静态授权引擎。
