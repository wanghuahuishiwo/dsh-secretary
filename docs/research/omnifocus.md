# OmniFocus 4 领域模型与设计哲学调研

- 调研日期：2026-10-28（Asia/Shanghai）
- 官方手册：OmniFocus 4 Reference Manual **4.10**；当前手册页面资源标识为 **4.10.0.1**。调研时官方 `/universal/4/en/` 入口重定向至 `/universal/4.10/en/`，因此本文以 4.10 为当前公开手册基线。[手册目录](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/contents/)
- 适用范围：研究 OmniFocus 的核心概念、层级、日期、Status／Availability、Repeat、Perspective／Forecast／Review 和 Time Zone，并提炼可供小秘书参考的设计哲学。
- 资料边界：只使用 Omni Group 官方手册，不使用二手 GTD 文章，不推断未公开的数据库实现，也不把本文当成实机交互测试或真实 OmniFocus 数据兼容承诺。
- 与小秘书的关系：本文是研究资料，不改写现行 PRD、Glossary 或 ADR；“采用／扩展／有意不照搬”是供后续评审的设计建议，不代表尚未确定的产品范围已经全部定稿。

## 1. 证据等级与阅读方式

- **【官方事实】**：手册直接定义的概念、字段或行为。各节附对应官方 URL。
- **【我们的解释】**：从这些机制中归纳出的设计哲学，不是 Omni Group 的原文或强制要求。
- **【设计建议】**：面向小秘书的映射、扩展和待决问题，不冒充 OmniFocus 原生能力。

两个版本边界需要保留：

1. Planned Date 的 Inspector 是 OmniFocus 4.7 新增能力，完整使用要求 4.7 或更高版本数据库格式。[Planned Inspector](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/inspector/#dates-and-times)
2. 当前 Repeat Inspector 在 4.7 更新，完整规则同样依赖 4.7 或更高版本数据库格式；本文不拿旧版手册的重复语义覆盖当前定义。[Repeat Inspector](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/inspector/#repeat-inspector)

## 2. 核心概念与层级

### 2.1 Action、Task 与 Inbox

**【官方事实】**

- **Action** 是可完成的具体事项，可以位于 Inbox、Project 或 Project 内的 Action Group。官方使用 Action 而非一般性的 task，是为了强调推动目标的下一步。
- **Task** 在官方 Glossary 中只有 “See Action”，不是另一种实体。
- **Inbox** 是捕获和暂存待处理事项的入口及标准 Perspective。简单事项可以在 Inbox 直接完成，也可以被分配到 Project、添加 Tag 或 Convert to Project。
- Inbox 条目的清理由设置决定；不能简化成“加 Tag 必然离开”或“必须有 Project 才能离开”。

官方来源：[Action](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/glossary/#action)、[Task](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/glossary/#task)、[Inbox](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/perspectives/#inbox)。

### 2.2 Project、Action Group、Folder 与 Project Type

**【官方事实】**

- **Project** 是 Action 与 Action Group 的集合，可以共同服务一个目标，也可以只是由共同元素聚合。
- **Action Group** 是属于另一个 Action 的子 Action 集合，可理解为 sub-project；其子项必须全部 Resolved（Completed 或 Dropped）后，主 Action 才能被视为 Completed。Action Group 可嵌套，类型为 Parallel 或 Sequential。
- **Folder** 组织 Project 或其他 Folder，与 Tag 的交叉分类不同。
- Project 有三种类型：**Parallel** 不限制完成顺序；**Sequential** 要求自上而下完成；**Single Actions List** 中的 Action 不服务一个整体目标，排列顺序不产生依赖。
- Project 默认类型可以配置；Action Group 只有 Parallel／Sequential，没有 Single Actions List 类型。

官方来源：[Project](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/glossary/#project)、[Action Group](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/glossary/#action-group)、[Folder](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/glossary/#folder)、[Project Type](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/perspectives/#project-type)。

### 2.3 官方层级不是任意 Action 树

**【官方事实】**手册描述的概念层级为：

```text
Folder → Folder | Project
Project → Action Group | Action
Action Group → Action Group | Action
```

Project 不能直接包含 Project，Folder 不直接包含 Action。这个层级描述不等同于公开底层数据库 schema，但足以否定“所有容器都可以无约束地视为同一种 Action”的假设。

官方来源：[Hierarchy](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/glossary/#hierarchy)。

### 2.4 Tag 是交叉上下文，不是 Folder 或 TimeCategory

**【官方事实】**

- Tag 可附加到 Action、Action Group 或 Project，用于表示人、地点、工具、心态、精力等上下文；一个事项可以有多个 Tag。
- Tag 可以形成层级，但不改变事项的 Project 归属。
- Tag／Tag Group 的状态为 Active／On Hold／Dropped，没有 Completed；On Hold 或 Dropped 会影响相关事项的可见性或 Availability。

官方来源：[Tag](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/glossary/#tag)、[Tag Hierarchy](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/glossary/#tag-hierarchy)、[Tag Status](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/perspectives/#tag-status)。

## 3. 日期、时长与继承

### 3.1 每个字段回答不同问题

| 概念 | 【官方事实】语义 | 不应误读为 |
|---|---|---|
| **Defer Date** | 事项何时开始 Available，即 “Start No Earlier Than”；未来 Defer 会使事项暂不可用 | 计划开始执行的时间 |
| **Planned Date** | 计划何时做工作的**单个日期时间**，不改变 Status，也不形成硬约束 | 带 start/end 的时间块 |
| **Due Date** | 必须在此前 Completed 或 Dropped，即 “End No Later Than” | 计划结束时间或完成状态 |
| **Estimated Duration** | 对完成所需时间的估计，可用于 Latest Start Date 等计算 | Planned 时间段或实际时长 |
| **Completed Date** | 状态成为 Completed 的日期时间；设置它会完成事项，改成其他状态会移除它 | 实际工作区间的结束时间 |
| **Dropped Date** | 状态成为 Dropped 的日期时间，与状态联动 | actual 或计划字段 |

官方来源：[Defer Date](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/glossary/#defer-date)、[Planned Date](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/glossary/#planned-date)、[Due Date](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/glossary/#due-date)、[Estimated Duration](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/glossary/#estimated-duration)、[Completed Date](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/glossary/#completed-date)、[Dates and Times](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/inspector/#dates-and-times)。

**边界：**手册列出的 Action／Action Group／Project 日期时间属性包括 Estimated Duration、Defer、Planned、Due、通知、Time Zone、Completed 和 Dropped，没有 actual start／end／duration。小秘书若保存实际工作区间，应明确称为自有扩展，而不是 OmniFocus 原生字段。

### 3.2 容器继承不等于统一排序约束

**【官方事实】**

- 容器的 Defer 会向下继承，子项直接 Defer 不能早于容器。
- 容器的 Due 会向下继承，子项直接 Due 不能晚于容器。
- Planned 也可以继承，但它不提供硬约束；子项 Planned 可以早于 Defer 或晚于 Due。
- 因而不能自行增加 `defer ≤ planned ≤ due` 的全局校验。

官方来源：[Inherited Dates](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/outline/#inherited-dates)、[Using Planned Dates](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/outline/#using-planned-dates)。

## 4. Status 与 Availability

### 4.1 直接状态因对象而异

| 对象 | 【官方事实】直接 Status |
|---|---|
| Action／Action Group | Active／Completed／Dropped |
| Project | Active／On Hold／Completed／Dropped |
| Folder | Active／Dropped |
| Tag | Active／On Hold／Dropped |

**Resolved** 表示 Completed 或 Dropped。On Hold 不是叶子 Action 的通用第四状态，Completed Date 和 Dropped Date 也不能由普通 `updatedAt` 代替。

官方来源：[Status Inspector](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/inspector/#status-inspector)、[Status](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/glossary/#status)、[Resolved](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/glossary/#resolved)。

### 4.2 Availability 是派生状态

**【官方事实】**对 Action／Action Group 而言，Availability 根据自身 Status、容器、Tag、Defer 和 Sequential 等条件派生，包括 Available、Blocked、Unavailable 及 with-container 变体。由此：

```text
status = active  ≠  available = true
```

官方来源：[Availability](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/glossary/#availability)。

### 4.3 容器可以传播状态

**【官方事实】**Action／Action Group 可以继承容器的 Completed／Dropped；Folder 和 Tag 也有各自的继承规则。官方还明确说明，将 Project 标为 Completed 会自动完成其中未完成的 Action。这个行为与 Action Group 的“子项全部 Resolved 后，主项才可视为 Completed”是不同方向的规则，不能混成一句“父子状态联动”。

官方来源：[Inherited Status](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/outline/#inherited-status)、[Project Status](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/perspectives/#project-status)、[Action Group](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/glossary/#action-group)。

## 5. Repeat

**【官方事实】**当前手册的 Repeat 模型包括：

- 可用于 Action、Action Group、Parallel／Sequential Project，不用于 Single Actions List；官方 Web 版不提供此 Inspector。
- **Regularly**：按既定日程生成下一次，与实际何时完成无关；可选择 Catch up automatically，跳过已经过去的 occurrence。
- **From Completion**：以本次 Completed Date 为基准计算下一次，不是以 actual end 为基准。
- **Based On**：可选择 Defer、Planned 或 Due，并在重复时保持各日期之间的相对关系；不能简化成只重复 Due。
- 支持结束条件。完成 repeating item 会生成下一 occurrence；Drop 时会根据选择跳过本次或完全 Drop，不能笼统声称 Drop 总是生成下一次。
- 完成 repeating Project／Group 会生成下一组并恢复包含项为 Active；嵌套重复可能生成重复 Action，官方明确给出警告。

官方来源：[Repeat Inspector](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/inspector/#repeat-inspector)、[Dropping Repeating Items](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/inspector/#dates-and-times)。

**【设计建议】**这套规则说明“重复”不是简单复制标题和日期。小秘书是否实现自动 recurrence、实现哪个子集、occurrence 如何保留历史，都应单独评审，不能从“参考 OmniFocus”自动推出完整 Repeat 功能。

## 6. Perspective、Forecast 与 Review

### 6.1 Perspective 是查看方式，不是事项实体

**【官方事实】**Perspective 是同一批 OmniFocus 数据的查看方式；有标准 Perspective，Pro 可创建 Custom Perspective。它不是新的事项类型，也不形成另一套归属关系。

官方来源：[Perspective](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/glossary/#perspective)。

### 6.2 Forecast 是日期导向的组合视图

**【官方事实】**Forecast 以 Due 项为固定核心，可按设置加入 Planned、Defer、通知、Flagged／Forecast Tag 等内容，也可并排显示来自 Apple Calendar 的只读事件。它不等于“只有 Planned 的时间块日历”，Calendar Event 也不会因此变成 OmniFocus Action。

官方来源：[Forecast](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/perspectives/#forecast)。

### 6.3 Review 维护 Project，不是时间统计

**【官方事实】**Review 以 Project 为单位。Project 有 Next review、Review every 和只读 Last reviewed；Mark Reviewed 更新上次／下次日期。Review 用于检查 Project 状态、是否增删或重组 Action 等，不等同于计划／实际复盘或时间统计。

官方来源：[Review](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/perspectives/#review)、[Review Inspector](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/inspector/#review-inspector)。

## 7. Time Zone：Floating 与 Fixed

**【官方事实】**

- **Floating** 是默认值：不保存本地时区，跨时区保持同一个墙上时间，例如始终显示 08:00。
- **Fixed**：保存本地时区，跨时区换算为同一时刻，例如 Seattle 11:00 对应 New York 14:00。
- 两种语义服务于不同类型的时间安排，不能只用“保存一个时区字段”概括全部需求。

官方来源：[Time Zone Inspector](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/inspector/#time-zone-inspector)。

## 8. 设计哲学：官方机制与我们的解释

下表的“官方机制”只复述前述手册事实；“我们的解释”和“对小秘书的启示”是设计分析，不是 Omni Group 的产品宣言。

| 官方机制【官方事实】 | 我们的解释【我们的解释】 | 对小秘书的启示【设计建议】 |
|---|---|---|
| Inbox 捕获与后续组织可以分开 | 先降低记录阻力，再在适当上下文里做判断 | Agent 不应在捕获时擅自拆解、分类或虚构日期 |
| Perspective 只提供同一事实的不同视图 | 可信系统不需要为每个页面复制一份数据 | Next、Forecast、统计和时间画布应尽量成为 Projection，而非平行事实源 |
| Status 与 Availability 分离 | “想做／仍在做”和“现在可做”是不同问题 | Next 不应只是 `status=active` 的别名，应显式设计派生规则 |
| Defer、Planned、Due、Completed 各司其职 | 日期越多不一定越复杂；混用一个日期才会失去语义 | 不把计划开始、可见时间、外部截止和实际完成塞进同一字段 |
| Planned 不形成 Defer／Due 式硬约束 | 柔性意图与刚性承诺需要并存 | 时间调整不应自动伪造截止、完成或实际记录 |
| Project、Action Group、Folder、Tag 各有不同职责 | 好的层级不是无限统一，而是只保留有用的约束 | 不因实现方便把所有容器压成无规则的一棵树 |
| Review 以 Project 为节奏维护系统 | 长期可信来自定期维护，不只来自一次性录入 | Project Review 与时间统计应是两个可协作但不同的工作流 |

本节官方依据：[Inbox](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/perspectives/#inbox)、[Perspective](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/glossary/#perspective)、[Availability](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/glossary/#availability)、[Using Planned Dates](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/outline/#using-planned-dates)、[Review](https://support.omnigroup.com/documentation/omnifocus/universal/4.10/en/perspectives/#review)。

## 9. 小秘书采用／扩展／有意不照搬

本节是【设计建议】，用于后续 PRD 和 ADR 评审，不表示所有能力都进入同一开发阶段。

### 9.1 可采用的核心思想

- 以 Action 表示具体可完成事项，同时保留 Project、Action Group、Folder 的不同角色和约束。
- 将 Availability 设计为派生结果，而不是另一个需要手工维护的 Status。
- 让 Perspective、Forecast 和统计读取同一事实源，避免每种 UI 各自复制事项。
- 区分 Defer、Planned、Due 和 Completed；允许 Planned 表达柔性安排，不把它提升为硬约束。
- 将 Project Review 与时间复盘分开：前者维护事项系统，后者分析时间事实。

### 9.2 小秘书自有扩展

- **TimeBlock**：用于表达小秘书的计划／实际时间安排，可以具有 start/end 等区间语义。它不是 OmniFocus 的 Planned Date；**Planned Date 是单个时刻，不能被写成时间段**。
- **actual**：保存实际发生的工作区间及来源，是小秘书自有事实，不是 OmniFocus Completed Date 的别名，也不能由 Planned 自动生成。
- **TimeCategory**：用于时间画布着色和时间构成统计，与 OmniFocus Tag 的多对多执行上下文不同；不能通过改名把二者合并。
- **DSH Schedule**：只承担宿主定时唤醒，不冒充 OmniFocus 的 Defer、Planned、Due、Repeat 或 TimeBlock。

### 9.3 有意不照搬或不得误抄

- 不新增与 Action 并列的 Task 实体；官方 Task 只是 Action 的别称。
- 不把 Perspective、Forecast 或 Review 建成新的事项实体。
- 不把 Completed Date 当成 actual end，也不从 Due 推断实际完成。
- 不自行增加 `defer ≤ planned ≤ due` 校验，不照搬与 Planned 相矛盾的硬约束。
- 不默认实现 Custom Perspectives、Nearby、完整通知、云同步、Omni Automation、完整 Repeat 矩阵或真实 OmniFocus 数据库 round-trip（往返兼容）；这些都需要独立需求。
- 不把“参考 OmniFocus”理解为复制完整功能清单，更不以其名称掩盖小秘书自己的时间领域语义。

## 10. 与旧 Action + TimeCategory PRD／ADR 的冲突

以下对照基于调研时的旧 [产品需求](../prd/README.md)、[glossary.md](../glossary.md) 和 [0001-action-centric-model.md](../adr/0001-action-centric-model.md)。这些文件当时描述的是 Action-only 首版基线；当前产品方向已由 [ADR 0002](../adr/0002-gtd-time-block-agent.md) 和 [ADR 0003](../adr/0003-single-bundle-multi-plugin.md) 取代，现行 PRD 也已更新。本节保留调研时的差异分析，不再把旧模型称为当前契约。

| 旧基线（调研时） | OmniFocus 官方机制 | 需要后续决策的冲突 |
|---|---|---|
| 只有 Action + TimeCategory，持续父事项和具体活动都使用 Action | Project、Action Group、Folder 各有不同层级和状态语义 | 是否引入显式实体，或使用受约束的 kind／role；不能继续无规则地把所有父 Action 当 Project |
| Action 可以任意嵌套，根 Action 是统一归属 | Project 不套 Project，Folder 不直接包含 Action，Action Group 另有规则 | 新层级约束与现有任意 `parentId` 树不兼容 |
| 子 Action 完成不推导父 Action，父子状态不联动 | Project 完成可传播 Completed；Action Group 还有 Resolved 规则 | 哪些传播规则采用、哪些有意偏离，必须逐项说明 |
| `planned` 是 startAt/endAt/timeZone 的时间段 | Planned Date 是单个日期时间 | 两者不能直接字段映射；需要决定是并存、改名还是迁移 |
| 每个具体 Action 最多一段 planned 和一段 actual，多次活动新建子 Action | Repeat 有独立规则，Completed Date 也不是 actual 区间 | occurrence、多个时间段与 Action 历史的关系需要重新建模 |
| TimeBlock 是具体 Action 在时间网格中的展示单位，不是独立事项实体 | OmniFocus 没有同义的区间 TimeBlock 模型 | 若让 TimeBlock 独立保存时间事实，属于小秘书的新模型决策，而非 OmniFocus 映射 |
| TimeCategory 单值、最多两级，服务于时间分类和统计 | Tag 多对多、可分层，表达执行上下文并影响 Availability | TimeCategory 与 Tag 不可互换；是否需要通用 Tag 仍未确定 |
| `Action.use = parallel` 表示时间可与其他活动并行 | Parallel Project 表示子 Action 的完成顺序不受限 | 同名不同义，字段与 UI 文案都必须避免混用 |
| 没有 Defer／Due／CompletedAt／DroppedAt，使用 status 与 updatedAt | 各日期有独立语义，Status 与 Availability 分离 | 不能从现有 planned／updatedAt 推导这些字段 |
| 每次活动由 Agent 创建具体子 Action，不做自动 recurring | Repeat 支持 Regularly、From Completion、Based On 等规则 | 子 Action 历史不等于 recurrence；实现哪个子集需单独评审 |
| 没有 Project Review 模型；Review 主要指后续时间复盘方向 | Review 以 Project 为单位，维护 Next／Last reviewed 和 Review every | Project Review 与时间复盘应命名、分开建模 |

这些冲突不表示现行首版实现“写错了”，而表示：**一旦目标转为“GTD（参考 OmniFocus）+ TimeBlock + Agent”，旧模型不能仅靠目录迁移或字段改名升级为新模型。**

## 11. 尚未由本研究确定的产品范围

以下问题仍需产品决策或 ADR，不在本文擅自定稿：

1. **实体表达**：Project、Folder、Action Group 使用独立实体，还是统一记录上的受约束角色；Single Actions List 如何表达。
2. **行为子集**：Project Type、On Hold、Availability、状态继承和完成传播采用到哪一层。
3. **时间字段**：OmniFocus 式 Planned Date 与小秘书 TimeBlock 是否并存，以及现有 planned TimeRange 如何迁移。
4. **TimeBlock 关系**：是否独立持久化、一个 Action 可关联多少块、planned／actual 是同记录两字段还是不同记录，以及它与 occurrence 的关系。
5. **Actual 与 Completion**：完成是否必须有 actual、CompletedAt 如何保存、多次执行如何记录，以及 actualSource 的权威规则。
6. **Tag 与 Repeat**：是否实现、实现哪个最小子集，不把完整官方矩阵当默认需求。
7. **Perspective 与 Review**：只做固定内置查询还是支持自定义；Project Review 与时间复盘如何协作。
8. **Time Zone**：是否同时支持 Floating 与 Fixed，以及跨时区重复采用哪种语义。
9. **兼容目标与迁移**：是否只借鉴核心语义，还是另立项目支持真实 OmniFocus 数据导入／导出；现有 Action 数据和个人 GTD 数据如何迁移，均不属于本文自动决定的事项。

## 12. 结论

**【我们的解释】**OmniFocus 最值得学习的不是功能数量，而是它如何用少量清晰分工维持一个可信的 GTD 系统：捕获与组织分离，事实与视图分离，Status 与 Availability 分离，柔性计划与刚性日期约束分离，并通过 Project Review 持续维护。

**【设计建议】**小秘书可以沿着这些原则形成“GTD + TimeBlock + Agent”的组合，但必须保持术语诚实：TimeBlock、actual 和 TimeCategory 是自己的扩展；Planned Date 不是时间段；Project、Action Group、Tag、Perspective 和 Review 也不能被压缩成现行 Action 树的不同别名。后续设计应先确定最小模型与迁移规则，再决定 UI 和功能范围。
