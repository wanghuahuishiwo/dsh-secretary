# “计划时间 vs 实际时间”对照形态调研

- 资料性质：非规范研究。本文“独立记录、不做 ID 关联”的产品前提是当时的探索假设；当前 GTD + TimeBlock 模型以 [ADR 0002](../adr/0002-gtd-time-block-agent.md) 为准，不能用本文替代当前领域契约。
- 调研日期：2026-10-26（Asia/Shanghai）
- 用途：供 dsh-secretary 的日视图、日/周/月独立统计及定期复盘设计参考。
- 产品前提：planned（计划）与 actual（实际）是两个独立视图、独立统计；不做记录 ID 关联或状态转换；标签为“一级类别－二级内容”树；同一时间格允许并行多条记录。
- 资料范围：只采用产品官方帮助、官方 changelog（更新日志）、开发者提交给 App Store 的描述及官方可视化文档；未登录产品或做交互实测。本文评价的是对照形态，不是产品整体。

## 1. 结论先行

**推荐组合：日视图用“共享时间刻度的并排双轨”，周/月复盘用“按类别聚合的 Planned / Actual / Δ 表 + 偏差排序”。**

1. **日视图**：保留计划、实际两个独立视图，另提供对照模式；对照时左右两轨共用同一时间刻度，各自完整呈现并行记录。不要跨轨配对，不显示逐条“完成/延期”。
2. **周/月复盘**：默认展示一级类别，按需展开二级内容；每行显示计划记录时长、实际记录时长和 `Δ = Actual − Planned`。提供按 `|Δ|` 排序及“仅一侧有记录”的筛选。
3. **图形保持克制**：MVP（最小可行版本）只有表即可。若后续确需图形，优先在复盘中增加一个可按差值排序的 range/gap（区间/差距）图，而不是同时堆分组柱状图、趋势图和偏差图。
4. **不把 `Actual / Planned` 命名为完成率**：没有逐记录关联时，它最多是“实际与计划记录时长之比”，不能回答某项计划是否完成；并行记录、零计划、当前周期和计划修改都会进一步削弱其解释力。

## 2. 证据等级与关键边界

- **【官方事实】**：以下来源直接写明的功能、字段或图形语义。
- **【设计推断】**：把上述形态迁移到 dsh-secretary 后的建议、统计口径和交互取舍，不冒充任何产品的既有能力。
- App Store 文案是**开发者提交、Apple 分发**的第一方资料，不等同于本文实测。
- baseline（基线快照）不等于“当前计划”。Microsoft Project 的 baseline 用于保存原计划参照点；本产品若没有计划快照，复盘只能称为“当前计划记录 vs 实际记录”，不能暗示是在与最初版本比较。[S1]
- 未从官方资料确认的透明度、连线、配对算法等视觉或交互细节，不写成事实。

## 3. 五种代表性对照形态

### 3.1 并排双时间轴：回答“两个独立的一天分别怎样度过”

**【官方事实】**DAYLine 的开发者说明明确使用 planned day / real day side by side；在日历中点开某天，可看到 plan 与 actual 的 time bars 并排展示，并显示“started 10 min late”“ended 5 min early”等差异。开发者还描述了今日 PLAN / ACTUAL 之间的滑动切换。[S5]

**最适合回答**

- 原计划把时间放在哪里，实际记录把时间放在哪里？
- 哪些时段出现了不同的活动密度、空白或并行安排？
- 在不强制逐条对应的前提下，两个独立日程在时间上如何错位？

**不适合 / 风险**

- 不适合直接回答“哪条实际记录完成了哪条计划”；那需要本产品的模型明确不存在的记录关联。
- 周/月逐日铺开会过宽、过密；它应是日级形态，不应扩展成长期日历墙。
- 窄屏双轨容易压缩标签；不能靠缩小到不可读来硬保留对照。

**【设计推断】本产品判定：日视图采用，但只借双轨，不借逐条偏差。**每条轨内部允许同一时刻多条记录；轨间不画配对线，也不计算逐条开始/结束差。

**明确不复制的模型：**同一段 DAYLine 官方说明还写到，完成计划会按相同时间复制到 actual log。[S5] 这与本产品“独立记录、无状态转换”的前提不同，不能随布局一起引入。

### 3.2 同轴 Gantt / overlay / ghost：回答“同一对象相对基线移动了多少”

**【官方事实】**Microsoft Project 可保存 baseline，再用 Tracking Gantt 作图形比较，或用 Variance 表查看 scheduled 与 baseline 的开始、完成日期及 variance（偏差）。官方配图说明为“Baseline and actual bars with a 2-day slip”。[S1]

**【官方事实】**Sunsama 2026-02-06 官方 changelog 提到 “Planned vs. actual” calendar visualization，并提到与 scheduled events 对应的 actual time entries 使用相应日程颜色。[S6] 该 changelog 足以证明存在日历上的计划/实际可视化，但**不足以证明其采用半透明 ghost、何种遮挡规则或任意记录间自动配对**，本文不作这些断言。

**最适合回答**

- 对具有稳定身份的一对一对象，当前时间条相对 baseline 提前或推迟多少？
- 少量对象的时长变化和位置偏移是什么？

**不适合 / 风险**

- Microsoft Project 的比较语义依附于同一任务及其 baseline；不能把这套逐任务语义套到无 ID 关联的双记录模型。[S1]
- 同一格有多条计划与多条实际时，overlay（叠加）容易遮挡；ghost（半透明底影）还会增加“哪一条对应哪一条”的错误暗示。
- 颜色、透明度和叠放顺序不能替代记录关系；密集并行时尤其脆弱。

**【设计推断】本产品判定：不作为默认日对照。**若未来增加显式计划版本和稳定对象关系，再评估 Gantt/ghost；在当前模型下，并排双轨更诚实、更简单。

### 3.3 按类别的 Planned / Actual / Δ 表：回答“时间分配差在哪里”

**【官方事实】**Float 的 Single Project Report 提供 Logged vs Scheduled，以及 Baseline estimate vs Logged 等模式；其摘要在相应预算类型下包含 Logged、Scheduled 和 Difference。官方还说明 baseline/logged 对照可用折线按日期比较，在摘要中突出差值，并按 phases、tasks、team members 提供明细表。[S4]

这里可确认的是 Float 的**比较模式、差值摘要和分组明细组合**；不能据此断言其每一张表都固定具有本文建议的三列。

**最适合回答**

- 某周期内，每个一级类别/二级内容的计划与实际记录时长各是多少？
- 哪些类别实际比计划多或少，差多少小时？
- 哪些类别只在一侧出现，因而值得在复盘时解释？

**不适合 / 风险**

- 不能呈现具体开始时间、持续位置或并行关系；这些仍属于日时间轴的问题。
- 不能从差值推出原因、质量、价值或完成状态。
- 只保留实际非零类别，或只保留计划非零类别，都会漏掉重要的单侧记录；分类集合应取两侧并集。

**【设计推断】本产品判定：周/月复盘的主形态。**把 Float 的项目/阶段/人员分组思想收敛为本产品已有的标签树，不引入项目、预算或人员维度。

### 3.4 分组条形/柱状图：回答“各类别两个绝对量怎样比较”

**【官方事实】**Datawrapper 的 grouped bar chart 用类别标签和至少两个数值系列形成分组条形；官方指出横向 grouped bar 在宽度有限时能容纳较多类别。[S7]

**最适合回答**

- 少量一级类别中，计划与实际的绝对时长谁更大、量级差多少？
- 一周内按天比较计划与实际总量时，哪几天整体较高或较低？

**不适合 / 风险**

- 两个系列的柱长差异不等于直接显示 `Δ`；精确差值仍需数值标签或表格。
- 一级类别再叠加全部二级内容会迅速变密，图例、颜色和柱间距都会增加阅读成本。
- 它不占位时间轴，不能回答某条记录放在一天中的哪里，也不能表达并行关系。

**【设计推断】本产品判定：可作为后续替代图，不与主表同时首屏堆叠。**若使用，应让 Planned / Actual 共用同一数值轴并直接标时长，不用堆叠柱把两者加成“总时间”。

### 3.5 按偏差排序的 range/gap 或有符号 Δ 图：回答“先看哪些差异”

**【官方事实】**Datawrapper 的 range plot 在每行绘制两个可比较的值，以两个点和连接线强调二者距离；官方定制文档支持按 start、end 或二者 difference 排序。[S8] [S9]

**【官方事实】**Datawrapper 对 arrow plot 的定义则是两个日期间的箭头，方向从较早日期指向较晚日期；其文档建议，若重点是两点间 gap 而非时间流逝，应选 range plot。[S10]

**最适合回答**

- 本次复盘最值得先讨论的是哪些大类差异？
- 差异有多大，同时两端的计划/实际绝对量分别是多少？

**不适合 / 风险**

- 只按 signed Δ（有符号差值）排序，会让最大正向和最大负向分居两端；按 `|Δ|` 排序才回答“差异最大”，二者问题不同。
- 以零为中心的正负 Δ 横条适合纯偏差排序，但会丢失两端绝对量；零两侧的红色/绿色也容易被误读成好坏评价。
- 不建议把 Planned → Actual 画成箭头：它容易暗示同一对象随时间转变，与本产品的独立双记录模型不符。

**【设计推断】本产品判定：先把偏差排序做进表格；确需图形时再选 range/gap。**有符号 Δ 发散条形仅是可选图形推断，本次没有找到足够第一方资料把某个时间产品的具体“发散偏差图”实现写成事实。

## 4. 完成率与百分比：为什么不能简化

**【官方事实】**即使在同一款 Microsoft Project 中，“完成百分比”也不是唯一口径：`% Complete = Actual Duration / Duration`，而 `% Work Complete = Actual Work / Work`；官方明确区分任务工期完成状态与工作量完成状态。[S2] [S3] 这说明百分比必须连同分子、分母和对象语义一起定义，不能只看一个百分数。

以下为本产品的**【设计推断】**：

| 陷阱 | 为什么误导 | 本产品口径 |
|---|---|---|
| 把 `Actual / Planned` 叫完成率 | 没有记录 ID 关联，无法知道哪条计划被哪条实际记录“完成” | 默认不显示完成率；如未来展示，只能准确命名为“实际/计划记录时长比” |
| `Planned = 0` | 除法无定义；实际有记录时既不是 0%，也不是凭空 100% | 显示 `0h / 实际值 / +Δ`，标记“仅实际有记录”，比率显示 `—` |
| 把比率截断到 100% | 会隐藏实际记录多于计划的部分，并把超限误作圆满 | 不截断差值；但超 100% 也不自动判为坏 |
| 把 `<100%` 当未完成 | 独立实际记录可能尚未补记，也可能记录在别的类别；均无完成状态含义 | 使用中性文案“实际记录较少”，不用“未完成” |
| 并行记录直接类比时间利用率 | 多条记录时长求和是 record-hours（记录小时数），不是 wall-clock（自然流逝时长）；一天合计可超过 24h | 合计明确叫“记录时长”；不要除以 24h 得出忙碌率/完成率 |
| 当前日/周/月直接比较 | 实际记录有补记延迟，未来计划又已经存在，比例随时间推进不断变化 | 当前周期显示“截至 HH:mm”及最近更新时间；定期复盘默认看已结束周期 |
| 把当前计划当 baseline | 计划后来被修改时，差值不再代表与最初意图的差距 | 标题写“当前计划记录 vs 实际记录”；无快照就不谈原计划达成 |
| 分类只取一侧 | 会漏掉计划为 0 或实际为 0 的类别，恰好隐藏最大差异之一 | 行集合取计划与实际分类的并集；两侧都为 0 的行默认不显示 |

`Δ` 也必须保持中性：**正数只表示实际记录时长较多，负数只表示较少；都不自动代表好坏、超支或未完成。**

若以后确需百分比，较安全的是分别展示“计划构成比”和“实际构成比”，各自使用本侧总记录时长作分母，并同时显示小时数；它们回答的是时间分配结构，不是完成率，且不必进入 MVP。

## 5. 针对 dsh-secretary 的最小推荐方案

### 5.1 日视图：独立视图 + 可选双轨对照

```text
时间       计划（独立记录）          实际（独立记录）
09:00      工作 / 写作               工作 / 资料整理
           生活 / 运动（可并行）      沟通 / 临时会议（可并行）
10:00      ...                       ...
```

- 计划、实际原有视图和各自统计保持不变；对照是组合展示，不生成关联、不迁移状态。
- 两轨共享时间刻度、日期范围和缩放；每轨独立处理同格并行记录。
- 不做跨轨连线、逐条“晚开始/早结束”、自动匹配或 ghost。
- 顶部可分别显示计划记录时长与实际记录时长；若显示总 `Δ`，沿用 `Actual − Planned`，并注明是记录时长差。

**理由**：它直接保留本产品最特殊的两个约束——独立记录和并行同格——同时仍能回答日级“计划怎样、实际怎样”。相比同轴叠加，它用更多横向空间换取更少的错误配对暗示。

### 5.2 周/月复盘：一张分类差值表，按需一个图

```text
周期：2026-W43                         数据截至：10-25 23:59
类别              Planned       Actual       Δ = Actual − Planned
工作              18.0h         20.0h        +2.0h
  写作             8.0h         10.5h        +2.5h
生活               6.0h          3.0h        −3.0h
运动（仅实际）       0.0h          1.5h        +1.5h
```

- 默认一级类别，点击展开二级内容；展开只改变分组粒度，不改变两侧原始记录。
- 提供按 `|Δ|` 的“差异优先”排序，并可恢复标签树顺序；另提供“仅一侧有记录”筛选。
- 周与月复用同一组件，只切换周期；月视图不必为了“看起来更丰富”增加图矩阵。
- 独立计划统计、实际统计继续存在；复盘页是第三个只读组合视角，不取代两者。
- MVP 到此为止。若真实使用证明表格不直观，再增加**一个**一级类别 range/gap 图，保留 Planned、Actual 两端值并按 difference 排序；不建设复杂 BI dashboard（商业智能仪表盘）。

### 5.3 明确不做

- 不做计划与实际记录之间的隐式匹配、ID 关联、完成状态或状态转换。
- 不用一个总完成率给周期打分，不用红/绿把正负差值道德化。
- 不为了复刻 Gantt 而引入 baseline、依赖关系或逐条偏差。
- 不在首屏同时放双时间轴、分组柱状、趋势图、偏差图和多层交叉筛选。

最终只回答三个复盘问题：**计划记录的时间在哪里？实际记录的时间在哪里？哪些类别的时长差异值得解释？**“是否完成、为何发生、是否有价值”需要额外证据，不能由这些对照图自动给出。

## 6. 第一方来源

| 标记 | 来源与本文用途 |
|---|---|
| [S1] | [Microsoft Support：Create or update a baseline or an interim plan in Project desktop](https://support.microsoft.com/en-us/project/create-or-update-a-baseline-or-an-interim-plan-in-project-desktop) — baseline 定义、Tracking Gantt、Variance 表及比较边界 |
| [S2] | [Microsoft Support：Percent (%) Complete fields](https://support.microsoft.com/en-us/project/percent-complete-fields) — 工期完成百分比公式及其与工作量完成百分比的区别 |
| [S3] | [Microsoft Support：Percent (%) Work Complete fields](https://support.microsoft.com/en-us/project/percent-work-complete-fields) — 工作量完成百分比公式 |
| [S4] | [Float Help Center：Single Project Report](https://support.float.com/en/articles/8811004-single-project-report) — Logged/Scheduled/Difference、baseline 对照及分组明细 |
| [S5] | [Apple App Store：DAYLine - Planner & Time Log](https://apps.apple.com/us/app/dayline-planner-time-log/id6808438205) — 开发者提交的并排计划/实际时间条、差异文案及复制行为说明 |
| [S6] | [Sunsama 官方 Changelog：Weekly product changelog, Feb 6, 2026](https://roadmap.sunsama.com/changelog/weekly-product-changelog-feb-6-2026) — Planned vs. actual calendar visualization 的可确认范围 |
| [S7] | [Datawrapper Academy：How to create a grouped bar chart](https://www.datawrapper.de/academy/how-to-create-a-grouped-bar-chart) — grouped bar 的数据结构、类别比较和横向形态 |
| [S8] | [Datawrapper Academy：How to create a range plot](https://www.datawrapper.de/academy/how-to-create-a-range-plot) — 两点、连接线与 gap 语义 |
| [S9] | [Datawrapper Academy：Customizing your range plot](https://www.datawrapper.de/academy/customizing-your-range-plot) — 按 difference 排序及差值标签 |
| [S10] | [Datawrapper Academy：How to create an arrow plot](https://www.datawrapper.de/academy/how-to-create-an-arrow-plot) — arrow 的两日期/方向语义及与 range 的选择边界 |

[S1]: https://support.microsoft.com/en-us/project/create-or-update-a-baseline-or-an-interim-plan-in-project-desktop
[S2]: https://support.microsoft.com/en-us/project/percent-complete-fields
[S3]: https://support.microsoft.com/en-us/project/percent-work-complete-fields
[S4]: https://support.float.com/en/articles/8811004-single-project-report
[S5]: https://apps.apple.com/us/app/dayline-planner-time-log/id6808438205
[S6]: https://roadmap.sunsama.com/changelog/weekly-product-changelog-feb-6-2026
[S7]: https://www.datawrapper.de/academy/how-to-create-a-grouped-bar-chart
[S8]: https://www.datawrapper.de/academy/how-to-create-a-range-plot
[S9]: https://www.datawrapper.de/academy/customizing-your-range-plot
[S10]: https://www.datawrapper.de/academy/how-to-create-an-arrow-plot
