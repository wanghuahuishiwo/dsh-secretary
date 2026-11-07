# 长期产品设计工作流调研：GitHub 开源设计 Skill 与工作流生态

> 调研时间：**2026-11-06**（Asia/Shanghai）。
> 目的：为 `dsh-secretary`（GTD + TimeBlock 两个独立演进的产品）设计一条长期工作流——
> 需求讨论 → 更新可交互稿并由用户操作确认 → Spec → 工单 → 实现 → 对照交互稿验收 → 更新 PRD，
> 并尽量不引入「第二套当前真相」。
> 定位：本文保存第一方证据与来源版本，**不作为当前产品需求的平行权威**；产品范围仍以 `docs/prd/` 为准。

## 0. 结论速览

1. **设计类 Agent Skill 已经分层，不能指望一个仓库全包**：官方样例（`anthropics/skills`，187,930★）、流程方法论（`obra/superpowers`，313,264★）、单点设计技能（`ui-ux-pro-max` 145,914★、`hallmark` 49,116★）、设计资产注册表（`VoltAgent/awesome-design-md` 125,841★、`DESIGN.md` 规范 `google-labs-code/design.md` 28,760★）。四层职责不重叠。
2. **「双文件契约」是长期设计资产最硬的收敛点**：`SKILL.md` 只写 agent 怎么干活，`DESIGN.md` 承载视觉身份。Google Labs 在 2026-04 发布了 DESIGN.md 格式规范（YAML tokens + 固定顺序散文 + `lint/diff/export` CLI），被 Ant Design（100,095★）、OpenDesign（106,208★，151 个 design-system 包）、BMAD（55,060★）等独立采用。**【事实】**
3. **最完整的设计契约是 BMAD 的「双 peer contract」**：`DESIGN.md` 管 *how it looks*，`EXPERIENCE.md` 管 *how it works*（IA、行为、状态、交互、可访问性、journey），且明写「Both spines win on conflict with any mock, wireframe, or import」。本项目**不新增** EXPERIENCE.md：行为由 PRD（已实现）+ 设计 Issue（待确认）+ `scenarios.json`/`fixtures/`（可执行验收）承载（见 §9.4）。**【事实 + 推断】**
4. **没有任何高星项目做完「交互稿 ↔ spec ↔ 工单 ↔ 验收」闭环**：Pocock 的 `prototype` 明确是一次性 throwaway；设计 skill 要么一次性生成 UI（`frontend-design`、`huashu-design`），要么只维护纯文档设计系统。**这个缺口需要我们自己的项目级流程来补。**【事实 + 推断】**
5. **抗漂移靠可执行 gate，不靠提示词**：`hallmark` 的 `sloplint --before/--kept`（记录每个 link/field/handler/heading，改版缺失即 fail）、`spec-kit` 的「completion claims are not evidence」、`OpenSpec` 的 delta+archive、`cc-sdd` 的 `spec.json` approvals 状态机。**【事实】**
6. **视觉验收生态在收敛，不是扩张**：`storybookjs/test-runner`（280★）、`lost-pixel`（1,676★）、`pattern-lab`（2,082★）均已 archived；Storybook 的像素级回归依赖商业 Chromatic。2026 年的最小可行组合是 **Playwright（场景 + 交互断言 + 截图基线）+ reg-cli（428★，目录 A vs 目录 B 对账）**。**【事实 + 推断】**
7. **OpenDesign 与 DSH 是双向可调用的**：OD→DSH 走 native runtime（`@open-design/dsh-runtime`，本机已有 `~/.dsh/profiles/open-design` 与 `od-*` 会话为证）；DSH→OD 走 OD 的 stdio MCP（`od mcp` 的 `start_run / get_run / create_project / write_file` 等工具），DSH 侧配套 `@deepseek-ai/dsh-mcp-client`。用户已实测双向可用。**【事实（接口核实 + 用户实测）】**
8. **最小起步建议**：只做 TimeBlock；`design/DESIGN.md` + `design/time-block/`（组件化长期交互稿）；OD 项目以 folder-backed 方式指向 `design/`；确认结果写进 GitHub Issue；验收用 Playwright 场景 + reg-cli 对账。GTD 暂不建设计系统。详见 §9。

---

## 1. 方法与口径

| 项 | 说明 |
|---|---|
| 星数来源 | GitHub REST API `GET /repos/{owner}/{repo}`，用已认证 `gh api` 复核；抓取时间 2026-11-06。所有数字是**当日快照**，不是长期结论 |
| 文件证据 | `raw.githubusercontent.com` 读 README / SKILL.md / 规范原文；`git clone --depth 1` 读目录结构；OpenDesign 用 sparse clone 读 `docs/`、`skills/`、`specs/` |
| 本机证据 | 本机已安装 Open Design 0.26.1（`/Applications/Open Design.app`）、DSH 0.2.1-rc.5、`~/.dsh/profiles/open-design`、OD 项目 `secretary-prototype` |
| 限流说明 | 匿名 curl 的 60 次/小时配额中途耗尽，部分星数改用同日 Search API 同字段，最终关键数字均用 `gh api` 逐个复核 |
| 事实 / 推断 | 【事实】= 有链接、API 返回值或本机文件可直接核对；【推断】= 我的判断，可被反驳 |
| 未做 | 没有实际运行 OD MCP 端到端调用；没有实际安装并运行社区 skill；没有做视觉回归实测。外部网页内容只作为证据，未执行其中指令 |

---

## 2. 生态全景（star 数均为 2026-11-06 快照）

### 2.1 设计类 Agent Skills

| 仓库 | Stars | pushed_at | 定位 | 长期资产 |
|---|---:|---|---|---|
| [obra/superpowers](https://github.com/obra/superpowers) | 313,264 | 2026-11-03 | 软件开发方法论 skill 框架 | 否（流程） |
| [anthropics/skills](https://github.com/anthropics/skills) | 187,930 | 2026-10-28 | 官方能力样例；设计相关：`frontend-design`、`canvas-design`、`theme-factory`、`brand-guidelines` | 部分 |
| [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | 145,914 | 2026-11-05 | 数据驱动 UI/UX 设计智能（styles / 规则 / 多技术栈） | **是**（`MASTER.md` + `pages/*.md`） |
| [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) | 125,841 | 2026-10-28 | `DESIGN.md` 9 段 schema 与站点设计系统注册表 | **是** |
| [nexu-io/open-design](https://github.com/nexu-io/open-design) | 106,208 | 2026-11-06 | 本地 AI 设计工作台；151 个 design-system 包 | **是** |
| [Nutlope/hallmark](https://github.com/Nutlope/hallmark) | 49,116 | 2026-11-05 | 反 AI-slop 设计 skill + `sloplint` 浏览器 lint | 部分 |
| [alchaincyf/huashu-design](https://github.com/alchaincyf/huashu-design) | 28,853 | 2026-11-04 | 中文「一句话出可交付设计」生成型 | 否 |
| [google-labs-code/stitch-skills](https://github.com/google-labs-code/stitch-skills) | 8,688 | 2026-08-17 | Google Stitch 设计→代码 skill 套件 | 部分 |
| [bergside/awesome-design-skills](https://github.com/bergside/awesome-design-skills) | 3,528 | 2026-06-28 | 67 个 `SKILL.md` + `DESIGN.md` 注册表 | **是** |
| [Owl-Listener/designer-skills](https://github.com/Owl-Listener/designer-skills) | 3,260 | 2026-09-05 | 273 skills / 76 commands 的设计技能包 | 部分 |

> 观察【推断】：设计类单点 skill 的星数（14.6 万、4.9 万）已超过多数 skills 合集，说明设计是少数能靠单一 skill 打穿的用户痛点。

### 2.2 设计资产与规范

| 仓库 / 规范 | Stars | 说明 |
|---|---:|---|
| [ant-design/ant-design](https://github.com/ant-design/ant-design) | 100,095 | **仓库根就有 `DESIGN.md`**（332 行，YAML front matter + 9 段） |
| [google-labs-code/design.md](https://github.com/google-labs-code/design.md) | 28,760 | DESIGN.md 格式规范：YAML tokens + 8 段固定顺序散文 + `npx @google/design.md lint/diff/export` |
| [design-tokens/community-group](https://github.com/design-tokens/community-group) | 2,164 | W3C DTCG 设计令牌规范（TR 2025.10 已 Stable） |
| [style-dictionary/style-dictionary](https://github.com/style-dictionary/style-dictionary) | 4,878 | token → CSS/iOS/Android/JS 构建期生成 |
| [argyleink/open-props](https://github.com/argyleink/open-props) | 5,566 | CSS 自定义属性分发 + tokens.json / Figma / Style Dictionary |
| [adr/madr](https://github.com/adr/madr) | 2,620 | ADR 模板规范（Context/Drivers/Options/Outcome/Consequences/Confirmation） |
| [enjalot/latent-scope](https://github.com/enjalot/latent-scope) | 798 | 单职责文档组：`PRODUCT.md` + `DESIGN.md` + `CONTRACT.md` + `AGENTS.md` |
| [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | 127,483 | 不写设计文档：语义 CSS 变量对 + `components.json` + `.dark` |
| [storybookjs/storybook](https://github.com/storybookjs/storybook) | 91,468 | living styleguide 基座（story = 组件状态的最小可运行样例） |

### 2.3 Spec / 设计到实现工作流

| 仓库 | Stars | 核心理念 | design 位置 |
|---|---:|---|---|
| [github/spec-kit](https://github.com/github/spec-kit) | 148,031 | "code serves specifications"；`/speckit-converge` 产出 `missing/partial/contradicts/unrequested` 缺口 | 核心无 UI/design 概念 |
| [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) | 74,115 | delta + archive：`specs/<capability>` 单一当前态，变更写成 ADDED/MODIFIED/REMOVED | `design.md` 是技术设计，无交互稿槽位；**明确「no approval gate」** |
| [bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | 55,060 | 双 peer contract：`DESIGN.md`（looks）+ `EXPERIENCE.md`（works）；spines 优先于任何 mock | **最深入**（第 4 档） |
| [eyaltoledano/claude-task-master](https://github.com/eyaltoledano/claude-task-master) | 28,309 | PRD → task 图 | 无；且 pushed_at 2026-04-28，已停滞 |
| [buildermethods/agent-os](https://github.com/buildermethods/agent-os) | 5,584 | 收缩为「注入 codebase standards」；`visuals/` 可选 | 附件档；官方已放弃完整 spec 流程 |
| [gotalab/cc-sdd](https://github.com/gotalab/cc-sdd) | 3,755 | `spec.json` 记录 `generated != approved` + `ready_for_implementation` | 技术边界档，但审批状态机可复用 |
| [gemini-cli-extensions/conductor](https://github.com/gemini-cli-extensions/conductor) | 3,777 | Context → Spec & Plan → Implement | 写 spec 时把 "UI interactions" 列为澄清问题 |
| [gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done) | 64,156 | **archived: true**（2026-05-31），高星但不再维护 | — |

> 选型提醒【事实】：star 不能当唯一依据。`get-shit-done` 64k★ 已归档；`claude-task-master` 28k★ 停滞 6 个月；`agent-os` 主动收缩。看 `pushed_at` + `archived` + 维护模式。

### 2.4 视觉 / 交互验收

| 项目 | Stars | 状态 | 结论 |
|---|---:|---|---|
| [microsoft/playwright](https://github.com/microsoft/playwright) | 99,438 | 活跃 | 1.62 起组件测试改为 stories + galleries；实验性 `@playwright/experimental-ct-*` 不再维护 |
| [storybookjs/storybook](https://github.com/storybookjs/storybook) | 91,468 | 活跃 | 组件开发基座；像素级回归要靠商业 Chromatic（Free 5,000 snapshots/月，Starter $179/月） |
| [reg-viz/reg-cli](https://github.com/reg-viz/reg-cli) | 428 | 活跃 | 唯一轻量「目录 A vs 目录 B」逐场景对账（HTML + JUnit） |
| [storybookjs/test-runner](https://github.com/storybookjs/test-runner) | 280 | **archived** | 官方支持已结束 |
| [lost-pixel/lost-pixel](https://github.com/lost-pixel/lost-pixel) | 1,676 | **archived** | 已停止（加入 Figma） |
| [pattern-lab/patternlab-node](https://github.com/pattern-lab/patternlab-node) | 2,082 | **archived** | — |
| [alphagov/govuk-prototype-kit](https://github.com/alphagov/govuk-prototype-kit) | 342 | 活跃 | 长期维护原型但明确「look like GOV.UK, but do not have the same security provisions」 |

---

## 3. 设计 Skill 的三种形态（可直接借用的机制）

### 3.1 生成型

- `anthropics/skills` 的 `frontend-design`：workflow 第 1 条就是「If the repo already has design tokens, components, screenshots, or a `DESIGN.md`, use those as the source of truth」——**生成前先读资产**是官方写法。
- `huashu-design`：中文单句出设计，覆盖面广（网页/App/PPT/动画/信息图），但不维护长期资产。
- 判断【推断】：生成型适合「探索方向」，不适合当长期验收基线。

### 3.2 审查型

- **`hallmark` 的三层 gate**（原文 README）：
  > "The gates come in tiers. The **Floor** never ships (contrast, focus, reduced motion, invented facts, a broken phone layout). **Reflex** gates are the defaults a model falls into; a build with a reason may overrule one on the record. **Finish** checks are craft detail that never blocks a ship."
- **`hallmark` 的改版保真机制**（最值得移植）：
  > "`sloplint --before` records every link, field, handler and heading first, `sloplint --kept` fails the redesign if one went missing."

  它断言的不是像素，而是**交互契约**：链接、字段、handler、标题一个都不能少。这正解决「改完交互稿，上一轮确认过的行为悄悄丢了」。
- `design-review`（OpenDesign 收录，上游 `garrytan/gstack`）：visual audit → fixes with atomic commits + before/after screenshots。
- `designer-skills`（Owl-Listener）：`audit-system` / `handoff`（states、measurements、QA checklist）。

### 3.3 资产维护型

- `ui-ux-pro-max`：`design-system/<slug>/MASTER.md` 为全局真源，`pages/*.md` 做页面级覆盖（page override master）。这是**双产品分层**最贴切的检索结构。
- `design-md`（OpenDesign 收录，上游 `google-labs-code/skills`）：创建/维护 `DESIGN.md` 的 skill。
- OpenDesign 的 `design-systems/<slug>/{manifest.json, DESIGN.md, tokens.css}`：包级契约，硬要求 **prose 与 tokens.css 同步**。

**可借用清单**

| # | 机制 | 来源 | 落点 |
|---|---|---|---|
| 1 | 双文件契约：行为 skill vs 品牌文档 | anthropics/skills + google design.md | 项目级 skill 只写「怎么走流程」，品牌/视觉放 `DESIGN.md` |
| 2 | 全局真源 + 页面级覆盖 | ui-ux-pro-max `MASTER.md` + `pages/*.md` | `design/DESIGN.md` 写共享；产品级覆盖只写差异 |
| 3 | 改版前后行为保真（--before/--kept） | hallmark `sloplint` | 交互稿生成 `contract.json`（links/fields/handlers/headings），改版 fail on missing |
| 4 | 三层 gate（Floor/Reflex/Finish） | hallmark | Floor = 可访问性/对比度/390px 不破；Reflex = 默认套路；Finish = 工艺细节 |
| 5 | fresh-context reviewer | hallmark | 验收/审查用独立 subagent，避免同一上下文自我背书 |
| 6 | 「要不要看图」规则 | superpowers brainstorming | 只有外观/布局/流程/并排方案进设计工具；需求/范围/取舍留文本 |
| 7 | 反 AI-slop 与状态覆盖 | OpenDesign `craft/` + hallmark | `DESIGN.md` 里写死禁止项（grep list）与 empty/error/loading 状态清单 |

---

## 4. `DESIGN.md` 的真实地位与职责边界

### 4.1 它是有规范的，不是「没找到」

- **规范**：`google-labs-code/design.md`（28,760★，Apache-2.0）定义 YAML tokens（front matter 或段内 yaml 块）+ Markdown 散文；固定顺序的 8 段：Overview / Colors / Typography / Layout / Elevation & Depth / Shapes / Components / Do's and Don'ts；顺序错、重复标题、重复 key 直接判错。**【事实】**（[spec](https://raw.githubusercontent.com/google-labs-code/design.md/main/docs/spec.md)）
- **CLI**：`npx @google/design.md lint`（token 引用 + WCAG 对比度，输出结构化 JSON）、`diff`（token 级变更 + `regression` 布尔）、`export`（Tailwind / DTCG）。**【事实】**
- **真实采用**：`ant-design/ant-design` 仓库根 332 行 `DESIGN.md`；OpenDesign 151 个 design-system 包以 `DESIGN.md` 为核心品牌契约（README 原文：「Every render reads the active package's `DESIGN.md` as the core brand contract」）；`VoltAgent/awesome-design-md`（125,841★）把它当注册表 schema。**【事实】**
- **注意同名不同物**：GitHub code search 里大量 `design.md` 是 `openspec/changes/*/design.md`（变更提案）或工程架构文档，不是视觉规范。落地时必须靠 front matter（`version: alpha` + `name` + `description`）宣告身份。**【事实】**

### 4.2 建议的职责矩阵（本项目）

| 层 | 建议位置 | 只写什么 | 明确不写什么 |
|---|---|---|---|
| 共享视觉语言 | `design/DESIGN.md`（OD 项目根 = `design/`） | 视觉身份叙事、语义色/字阶/间距/圆角意图、390px 窄栏约束、宿主主题 token 映射、组件态样式、Do/Don't、反 AI-slop 禁止项（可 grep 清单） | 功能范围、页面流程、决策时间线、全量 `--var` |
| 产品差异 | `design/<product>/DESIGN.md`（可选，按需） | 该产品独有的视觉例外/覆盖 | 复制根文件正文 |
| 交互行为 | PRD（已实现）+ 设计 Issue（待确认）+ `scenarios.json`/`fixtures/`（可执行） | 流程、状态覆盖（empty/loading/error/offline/permission-denied/focus）、手势映射、确认版本 | 视觉 token、功能优先级 |
| tokens | 代码侧 `tokens.css` / 宿主 token 消费点 | 机器可读值、token 引用 | rationale |
| 产品范围 | `docs/prd/` | 当前范围、验收、不做的事 | 视觉理由、实现细节 |
| 可交互稿 | `design/<product>/` + OpenDesign 项目 | 可点击流程、边界态、多方案对比 | 全局视觉规范 |
| 决策历史 | `docs/adr/` + Issue 评论 | 架构决策与取舍（append-only） | 复述当前规范（写 MUST NOT restate） |
| Spec / 工单 / 验收证据 | GitHub Issues | 单一 Issue 承载 spec；证据在评论/CI | 本地 `docs/specs/` 或验收报告 |
| 生产实现 | 代码 | 组件、token 消费 | 唯一权威的视觉定义 |

### 4.3 防漂移的三条硬机制

1. **DESIGN.md 与 tokens 同源同步**：OpenDesign 硬要求「If `DESIGN.md` names an accent, type scale, spacing rhythm, or motion duration, the corresponding binding in `tokens.css` must express the same decision」。我们把这条写进评审清单 + CI lint。
2. **禁止项清单**：抄 `latent-scope` 的 `## 8. What dies (grep list)`——把禁止出现的旧类名/旧变量写成可搜索字符串，比抽象原则更能被 agent 和 review 执行。
3. **归属唯一**：一个视觉规则只在 `DESIGN.md` 写一次；PRD 只链接不复制；ADR 只记决策不复述规范。

---

## 5. 设计进入 Spec / 工单的位置

### 5.1 五档 design 进入点【事实 + 推断】

| 档 | 代表 | design 是什么 | 是否有门槛 |
|---|---|---|---|
| 0 缺席 | spec-kit 核心、task-master | 无 design 层 | 无 |
| 1 附件 | agent-os | spec 目录下可选 `visuals/` | 无（"Visuals are optional"） |
| 2 澄清输入 | conductor | 写 spec 时问一句 "UI interactions" | 无 |
| 3 技术契约 | OpenSpec、cc-sdd | `design.md` = HOW / 边界，与 UI 无关 | cc-sdd 有 `approvals`；OpenSpec 明确无门 |
| 4 设计契约 | **BMAD** | `DESIGN.md`（looks）+ `EXPERIENCE.md`（works）双 peer contract | readiness gate：story 不得依赖「没人记录的决策」 |

BMAD 原文（`skills/bmad-ux/SKILL.md`）：
> "Produce two peer contracts: **`DESIGN.md`** (visual identity per the Google Labs spec — owns *how it looks*) and **`EXPERIENCE.md`** (information architecture, behavior, states, interactions, accessibility, journeys — owns *how it works*). EXPERIENCE.md cross-references DESIGN.md tokens by name using `{path.to.token}` syntax. Both spines win on conflict with any mock, wireframe, or import."

### 5.2 流程顺序的三种流派

| 流派 | 代表 | 顺序 | 适用信号 |
|---|---|---|---|
| 串行流水线 | spec-kit、cc-sdd、conductor | spec → plan → tasks → implement | 单 feature、可一次想清 |
| delta 增量 | OpenSpec | proposal → delta specs → design → tasks → apply → archive 合入主 spec | brownfield、能力长期演进 |
| 票树 + 按需重切 | BMAD | ticket tree → refine → stories → build | 多 epic、多 agent 并行 |

**我们的取舍**【推断】：采用「串行 + 原地更新」主流程（与现有 `to-spec → to-tickets → implement-spec` 一致），吸收 BMAD 的「稳定 ID + 带日期 Decision 行 + Revalidation Triggers」，**不引入 OpenSpec 的 full delta**（双产品、个人使用，delta 纪律成本可能大于收益；等真出现「多份当前真相」再升级）。

### 5.3 验收的社区共识：不信任 checkbox

- `spec-kit` 的 `templates/commands/converge.md` 原文：「Convergence phase: **completion claims are not evidence.** Verify current behavior against the spec, plan, tasks, and constitution」；缺口分四类 `missing / partial / contradicts / unrequested`。**【事实】**
- `OpenSpec` 的 verify：三维度评分卡（Completeness/Correctness/Coherence），必须以 "Ready for archive" 或 "Fix before archiving" 收尾；对 REMOVED 做反向检查（行为是否真的消失），未检查项写 "Not verified"，**不把未搜索的移除计为通过**。**【事实】**
- `cc-sdd` 的 `spec.json`：`generated != approved`，`ready_for_implementation` 是机器可读布尔门。**【事实】**

**可借用清单**

| # | 机制 | 用途 |
|---|---|---|
| 1 | `missing/partial/contradicts/unrequested` 四类缺口 | 验收报告固定结构；`unrequested` 抓「顺手多做的交互」 |
| 2 | 「completion claims are not evidence」 | 验收只看代码/交互稿差异，不看 checkbox |
| 3 | REMOVED 反向检查 | 删除类需求防止残留 |
| 4 | approvals 状态机 | 交互稿未确认不得进 `/to-spec` |
| 5 | Revalidation Triggers | 列出「哪些变更必须重新对照交互稿」 |
| 6 | 冲突仲裁规则只写一次 | 明确「用户确认的交互稿 vs 文档」谁优先 |
| 7 | 「只记会冲突的决策」过滤器 | 决定交互稿写多细，避免像素级复述 |

**要警惕**

- 不要吸收 OpenSpec 的「no approval gate」（原文：「no approval gate... That's the whole answer, and it's by design」）——与「用户操作确认后才继续」直接冲突。
- `design.md` 规范只覆盖静态视觉，不管交互行为/状态；跑了 `lint` 不等于验收完成。
- `agent-os` 的 `visuals/` 附件式设计已是收缩路线，不应当范本。
- star 不能当选型依据（见 §2.3）。

---

## 6. 漂移发现与视觉/交互验收

### 6.1 现状判断

- 2026 年视觉回归生态在**收敛**：`storybookjs/test-runner`、`lost-pixel`、`pattern-lab` 归档；BackstopJS 最后 release 2020-07 且公开求维护者。【事实（子代理核对）】
- Storybook 的像素级回归是商业能力（Chromatic），免费部分只到「把 story 变成测试」。【事实】
- **没有成熟开源项目做「设计稿 ↔ 生产代码」直接漂移检测**；实际只有两条路：像素级（确认稿截图当基线 diff）或语义级（场景期望写成断言）。【事实 + 推断】

### 6.2 推荐组合（2 件，不叠工具）

1. **Playwright**：场景 gallery + 交互断言 + `toHaveScreenshot`（`viewport 390×844`）。
2. **reg-cli**：把「生产截图目录」与「已确认交互稿截图目录」逐场景对账（HTML + JUnit）。

三种绿灯必须分开：

| 绿灯 | 含义 | 用什么 |
|---|---|---|
| spec 绿 | 交互行为与确认稿一致 | Playwright 交互断言 |
| snapshot 绿 | 与上一版实现一致 | Playwright 截图基线 |
| reg-cli 绿 | 与已确认交互稿一致 | reg-cli 目录对账 |

### 6.3 本仓适配的硬约束

- `packages/time-panel` 用 esbuild 构建（client 打 cjs、React 19 外置），Storybook 官方测试路径要求 Vite 基座——引入 Storybook 等于**再加一条构建链**。Playwright 无此问题（只需能 serve 一个 gallery 页）。【事实 + 推断】
- 390px 不能只设 viewport：宿主主题 token 不是 `prefers-color-scheme`，`colorScheme` 挡不到，必须显式注入 CSS 变量 + `data-theme`。
- 共享状态会污染场景：**每场景新建 store 实例、显式 seed**，否则 VRT 周期性抖动，最后会被关掉。
- 现有 `packages/time-panel/prototype/` 已有 `*.html` + 对照 png 的习惯，可直接升级为基线目录。

### 6.4 原型不变成第二套生产应用的四条边界

命中两条即停【推断】：
1. 需要真实业务逻辑才能跑；
2. 有了自己的依赖图/构建产物且必须跟着生产代码改；
3. 需要部署给非开发者使用；
4. 基线图需人工逐张批准且频率高于每周一次。

GOV.UK Prototype Kit 是「长期维护原型但明确不是生产系统」的范本（342★，活跃）。

---

## 7. OpenDesign 实际协同能力核实

> 本节是本次调研中与「能否直接调用 OpenDesign」最相关的部分。分四层：运行关系、双向接口、执行入口、多文件能力。

### 7.1 运行关系：OD 与 DSH 各有一侧作为编排者

- OD 是本地优先的 AI 设计工作台：Electron 外壳 + Express daemon（`apps/daemon`，`/api/*` 的产品权威）+ Next.js web app；项目、会话、文件版本、预览、导出由 daemon 持有。**【事实】**（[docs/architecture.md](https://github.com/nexu-io/open-design/blob/main/docs/architecture.md)）
- **DSH 是 OD 的 native runtime**：OD 通过 `od agent setup deepseek-harness` 安装 `@open-design/dsh-runtime` 到用户自己的 `dsh` profile，然后每次 run 启动一个短生命的 `dsh --profile open-design --stdio` 进程；harness session 存储提供冷恢复。**【事实】**（[dsh-runtime README](https://github.com/nexu-io/open-design/blob/main/packages/dsh-runtime/README.md)、[agent-adapters.md](https://github.com/nexu-io/open-design/blob/main/docs/agent-adapters.md)）本机证据：`~/.dsh/profiles/open-design/package.json` 依赖 `@open-design/dsh-runtime`；`~/.dsh/storages/session_projcache/sessions/od-*.json` 是 OD 启动的 DSH 会话，cwd 指向 OD 项目 `secretary-prototype`。
- OD 给 DSH 的 prompt 是自包含 bundle：本机抓到 `open-design.od-next-prompt-bundle/v2`，含 `task_type` / `task_type_skill` / `task_metadata` / `task_configuration` / `stable_request_context` / `session_skills` / `runtime_tool_environment` / `request_input_facts` / `od-next-context`。**【事实（本机会话缓存）】**
- 项目存储有两类：**OD-owned**（`data/projects/<id>`）与 **folder-backed**（外部文件系统根；`user-local` 为用户自选文件夹、OD 原地编辑；`orchestrator-scratch` 为外部编排者的临时工作区）。**【事实】**（[orchestrator-workspaces.md](https://github.com/nexu-io/open-design/blob/main/docs/orchestrator-workspaces.md)）
- 文件变化有 **per-project chokidar watcher**（add/change/unlink → `file-changed` 事件，`apps/daemon/src/project-watchers.ts`），每个文件有 `.file-versions` 版本库（带 prompt 来源、恢复版本）。**【事实（源码）】**
- `DESIGN.md` 是渲染契约：处于激活状态的 design-system 包决定每次 render 的 brand；filesystem-backed CLI run 会写 canonical project files，OD 预览跟随这些文件。**【事实】**（README「Why OpenDesign」+「Use OpenDesign from your coding agent」）

### 7.2 双向调用都已可用

- **OD → DSH（native runtime）**：见 7.1；本机已安装、已有 `od-*` 会话。**【事实】**
- **DSH → OD（stdio MCP）**：`od mcp` 暴露 `list_projects`、`get_active_context`、`get_artifact`、`get_project`、`get_file`、`search_files`、`list_files`、`create_artifact`、`write_file`、`delete_file`、`create_project`、`start_run`、`get_run`、`cancel_run`、`list_agents`。`start_run` 原文：「Commission OpenDesign to generate or refine a design. OpenDesign spawns its own agent to do the work and returns a runId immediately. Poll get_run(runId)...」。**【事实（源码 + 用户实测双向可用）】**
- DSH 侧的 MCP 客户端是 `@deepseek-ai/dsh-mcp-client`（工具名 `mcp__<serverName>__<rawName>`，支持 stdio / streamable-http）。**【事实（npm README）】**
- 操作细节（不是能力问题）：OD 的 `od mcp install` 支持 17 个 agent、不含 dsh，所以 DSH 侧注册是一次性手工配置（或在 DSH profile 里加 mcp-client 条目）；本机 `od` 命令不在 PATH，app 包内有 `prebundled/daemon/daemon-cli.mjs`。**【事实（源码 + 本机检查）】**
- 本机 OD 项目 `secretary-prototype` 是 **OD-owned**（不在仓库里）；调研时 `design/omnifocus-mac-brief.md` 同时记录“本机评审原件”和“仓库副本”，两处 `omnifocus-mac.html` 均为 31,734 bytes——**这是当前手工同步的证据，也是改成 folder-backed 的直接理由**。该说明现已归档到 `design/gtd/README.md`。**【事实（本机文件）】**

### 7.3 执行入口不构成流程差异

| 入口 | 谁干活 | 适用 |
|---|---|---|
| DSH 会话（本会话） | DSH 直接改文件；需要 OD 生成时经 MCP `start_run` | 日常迭代、上下文已在会话里 |
| OD 产品内（Local Agent → DSH） | OD 起 `dsh --profile open-design --stdio`，agent 读写项目文件 | 用户想在 OD 里操作，或需要 OD 的 skill / design-system |
| 任一方 + Issue | 两者都读同一 Issue、同一 `design/` 目录 | **推荐的默认** |

**要点**【推断】：流程不依赖「谁调谁」，依赖三件事——同一个 Issue、同一份仓库 `design/`、同一条确认门槛。

### 7.4 多文件原型在 OpenDesign 里是可行的

- **[事实]** OD 的 design-template 可以是多文件静态结构：`design-templates/html-ppt` 含 `assets/base.css`、`assets/themes/*.css`、`assets/runtime.js`、`assets/animations/fx/*.js`；模板原文「One theme file = one look. One layout file = one page type.」「One command, no build. Pure static HTML/CSS/JS with only CDN webfonts.」预览是 iframe 加载真实 HTML。
- **[事实]** 项目文件支持嵌套路径（`write_file` 示例 `components/Hero.tsx`、`codex-product/index.html`）；`get_artifact` 返回「entry file + every referenced sibling」；预览有 URL 与 srcDoc 两种模式，URL 模式由 daemon 提供相对路径资源。
- **[事实]** OD 自己的 design-system 包就是多文件：`manifest.json` + `DESIGN.md` + `tokens.css` + 可选 `components.html` / `components.manifest.json` / `preview/`。
- **[推断]** 把 `design/<product>/` 拆成 tokens / components / layouts / pages / fixtures，并用一个 `index.html` 作入口，是 OD 原生支持的结构；ES modules 相对导入应可用，但需一次性验证（srcDoc 模式不支持外部资源，必须走 URL 模式）。

---

## 8. 与现有 Matt 流程的对照

| 现有技能 | 现状 | 缺口 |
|---|---|---|
| `prototype` | 明确 throwaway、无持久化、验证完即弃 | **与「长期交互稿 + 验收基线」冲突**：验收要求基线与实现可 diff，一次性原型做不到 |
| `to-spec` | 把对话综合成 spec 发布到 Issue；`ready-for-agent` | 缺：与交互稿版本绑定、`design.approved` 门槛、状态清单 |
| `to-tickets` | 垂直切片 + blocking edges + acceptance checkbox | 缺：每个 ticket 的「验收方式」字段与交互稿引用 |
| `implement-spec` / `implement` | 按 spec 实现 | 缺：实现后对照交互稿的验收步骤 |
| `research` / `ask-matt` / `grill-with-docs` | 调研、路由、评审 | 可继续复用 |

**结论**【推断】：不推翻现有流程，而是**补上「设计确认」与「设计验收」两段**，并把 `prototype` 明确定位为「探索用」，长期交互稿另立位置。

---

## 9. 推荐工作流（最小起步：TimeBlock 优先）

### 9.1 设计资产：像代码一样拆分

```text
design/
├── DESIGN.md                    # 唯一的视觉规范（共享视觉语言，Google Labs 8 段格式）
├── tokens.css                   # 语义 token，与 DESIGN.md 同名绑定
├── README.md                    # 产品 → 入口 → 当前 Issue 的映射
├── time-block/
│   ├── index.html               # 唯一渲染入口：装配 layout + page
│   ├── app.js / app.css         # 入口级装配与样式
│   ├── components/              # 公共组件，一目录一组件（模板 / CSS / 行为）
│   │   ├── canvas-grid/         # 固定 10 分钟格阵画布
│   │   ├── selection-bar/       # 底栏 + 数量角标 + 展开
│   │   ├── tag-shelf/           # 标签架
│   │   ├── record-editor/       # 完整记录编辑 / 删除
│   │   └── ...
│   ├── layouts/rail-390/        # 390px 右栏壳：标题栏 / 画布 / 底栏
│   ├── pages/                   # 页面级组合：plan / actual / deep-time
│   ├── fixtures/                # 场景夹具 JSON（与 Playwright 共用同一份）
│   ├── scenarios.json           # 场景 ID + 期望交互 + 状态清单
│   └── baselines/               # 确认版截图：page / scenario / theme
└── gtd/                         # 本轮不建（保留 omnifocus brief 作为唯一原型）
```

组件形态（待定，见 §11）：

- **A（推荐）静态 ES modules + Web Components，无构建**：OD preview 直接加载 `index.html`；组件 = 自定义元素 + 模板 + CSS 变量；fixtures 注入 store。与 OpenDesign 的多文件静态模板一致（`design-templates/html-ppt` 即 `assets/base.css` + `themes/*.css` + `runtime.js`）。
- **B React + esbuild 构建到 `dist/`**：更接近生产（production 是 React 19），可复用仓库 esbuild；但多一条构建链，OD 预览的是 dist，存在 src/dist 不同步风险。
- **不采用单文件 HTML**：agent 每次改动都要整文件重写、diff 噪音大、组件状态无法独立验收。

组件契约保持轻：每个组件在 `scenarios.json` 声明 states（empty/loading/error/disabled/...）与必须保持的交互（links/fields/handlers/headings），验收按组件 × 状态覆盖。

### 9.2 工作单元：Issue（可被任一方领取）

- **一个 feature 一个 Issue**；设计阶段就在该 Issue 上进行，不另起「设计 issue」再复制上下文（如想拆开，见 §11）。
- Issue 承载：设计 brief、当前确认方向、已否决方案（带日期）、原型入口路径、`scenarios.json` 版本、确认记录（commit SHA + 日期 + 范围）。
- 领取：`gh issue` assignee + 评论；不做原子锁（driver 不声明）。**DSH 会话与 OD 内 agent 都读写同一个 Issue 和同一个 `design/` 目录，所以入口不重要。**
- 用户确认后才进入 spec；未确认不写 spec、不进 `/to-tickets`。

### 9.3 主流程

```text
1. 在这里讨论需求与交互（文本）
      ↓  只有外观 / 布局 / 流程 / 并排方案才进设计工具（superpowers「要不要看图」规则）
2. 创建 / 更新 feature Issue（design 阶段）
      ↓
3. 任一方领取（DSH 会话 或 OD 里的 agent；OD→DSH / DSH→OD 均可）
      - 读 Issue + design/DESIGN.md + 当前入口与组件 + 已确认 / 已否决
      - 约束：390px、宿主 token / 主题、手势、不新增路由
      ↓
4. 改 design/time-block/ 的组件 / 页面 + fixtures + scenarios（小文件、可 diff）
      ↓
5. 用户在 OpenDesign 中操作、反馈、反复迭代
      ↓  明确确认后：Issue 记录「确认版本（commit SHA）+ 日期 + 范围」
6. 同一 Issue 补 spec（引用 DESIGN.md commit、原型 commit、scenarios）
      - 未确认项显式列出；确认未记录则停止
      ↓
7. /to-tickets（子 Issue）
      - 每个 ticket：交互状态验收 + 原型 / 场景引用 + 「验证方式」
      ↓
8. /implement-spec 或 /implement
      ↓
9. 验收
      - Playwright：用同一份 fixtures / scenarios 断言交互（390×844，显式注入主题 token，每场景独立 store + seed）
      - reg-cli：生产截图 vs design/time-block/baselines 对账（组件 / 页面 / 主题分组）
      - 四类缺口 missing/partial/contradicts/unrequested；skipped 写 "Not verified"
      - 用户手动确认：交互手感、状态切换、信息层级
      ↓
10. 原地更新 PRD（稳定 ID、带日期 Decision 行）
      - 视觉规则变化 → 同步 DESIGN.md；行为 / 状态变化 → 同步 PRD 与 scenarios
      - 重大架构 / 流程取舍 → 新增 ADR
```

### 9.4 为什么不新增 EXPERIENCE.md

- BMAD 的 `EXPERIENCE.md` 是「行为契约」，价值在「look」与「works」分离、且约定压过 mock。
- 我们已有三处承载行为：PRD（已实现）、Issue（待确认）、`scenarios.json` + `fixtures/`（可执行验收）。再写一份就是第四份，违反「同一主题只保留一个权威文件」。
- 保留其洞察：仲裁规则只声明一次——**「用户确认过的原型版本 + Issue 里的确认记录」优先于任何文字稿；文档与原型冲突时以最近一次确认版本为准，并回写另一侧**。
- 若将来行为契约复杂到需要稳定 ID 与跨产品复用，再单独立，不预建。

### 9.5 何时必须走设计、何时不必

| 场景 | 是否进设计工具 | 说明 |
|---|---|---|
| 新增/修改交互、布局、信息层级、视觉语言 | 是 | 用户操作确认后才能进 spec |
| 纯视觉 bug（不改变交互） | 可跳过确认，但必须跑截图对账 | 若基线变化，记录原因 |
| 文案 / 微调样式 | 否 | 走常规工单；验收仍跑 reg-cli |
| 纯技术重构、后端 / 领域逻辑 | 否 | 不改交互稿；若意外改了外观，视为漂移 |
| 一次性探索、并排方案 | throwaway | 放 `packages/*/prototype/`，不进 `design/` |

### 9.6 项目级技能的最小职责（若决定做）

- 输入：产品（time-block / gtd）、Issue、本次变更描述。
- 只做五件事：① 路由到产品路径；② 装配最小上下文（Issue + DESIGN.md + 入口 / 组件 + scenarios + 已否决）；③ 更新设计资产（或经 MCP `start_run` 让 OD 生成）；④ 返回变更摘要 + 需用户确认的点；⑤ 用户确认后写入 Issue 确认记录，**然后停止**（不自动进 `/to-spec`）。
- 不做：不重新实现 `to-spec` / `to-tickets` / `implement`；不做验收；不替用户做设计确认。
- 先用 recipe 跑一轮真实迭代，再决定是否固化成 skill。

### 9.7 不建议做的事

- 不写单文件 `prototype.html`。
- 不共享生产 React 组件（原型不变成第二套生产应用）；**共享 fixtures / scenarios 即可**。
- 不建共享 Shell，不把 GTD 与 TimeBlock 合并。
- 不把 `packages/*/prototype/` 的废稿当获批设计。
- 不在仓库新建验收报告 / 规格副本；证据留在 Issue。
- 不引入 Storybook / Chromatic（除非已日常用 Storybook；且要「替换」而非叠加）。
- 不把 OD 的 full delta 流程照搬。

---

## 10. 成本、收益与可观察指标

### 10.1 成本

| 项 | 一次性 | 每次迭代 |
|---|---|---|
| `DESIGN.md` + 组件化设计资产骨架 | 1~2 天 | 维护少量 |
| OD 项目 folder-backed 导入（一次性配置） | 10 分钟 | 0 |
| DSH 侧 MCP 注册（一次性） | 半小时~1 小时 | 0 |
| Playwright + reg-cli 场景与基线 | 1~2 天 | 每个场景少量 |
| 项目级 skill（若做） | 半天 | 0 |

### 10.2 收益判断【推断】

- 回报明显：交互复杂、迭代频繁、用户经常亲自操作确认（TimeBlock 属于此类）。
- 收益一般：纯后端/数据层、几乎无 UI 变化。
- 过度流程：一次性页面、外部依赖升级、GTD 这种当前没有生产 UI 的产品（先不建）。

### 10.3 可观察检验指标（用后续几轮真实迭代验证）

| 指标 | 基线（现在） | 目标 |
|---|---|---|
| 每次设计迭代的上下文装配时间 | 手工复制 PRD/截图进 OD（分钟级~十分钟级） | 一次调用内完成，≤1 分钟 |
| 返工：实现后因与交互稿不一致被 reopen 的 ticket 比例 | 未统计 | 下降 |
| 漂移发现时点 | 多为验收/使用中 | 多数在实现前（spec/ticket 阶段） |
| 每轮设计确认次数 | 未统计 | ≤2~3 次 |
| 「当前真相」份数（同一主题） | 2 份（OD 项目 + 仓库副本） | 1 份 |
| 小改动额外耗时 | — | 明显小于收益；若大于 2 倍则回退 |

建议在接下来 3 轮 TimeBlock 迭代（例如并行时间块闭环、下一个功能）中记录以上数字。

---

## 11. 仍需用户决定的问题

1. **组件形态**：A 静态 ES modules + Web Components（无构建，OD 原生预览）还是 B React + esbuild 构建到 `dist/`？建议先 A。
2. **Issue 粒度**：设计阶段与实现共用一个 feature Issue（推荐，避免上下文复制），还是设计 issue + 实现 issue 两个？
3. **DESIGN.md 位置**：`design/DESIGN.md`（推荐，OD 项目根 = `design/`）还是仓库根 `DESIGN.md`（OD 项目根 = 仓库根）？
4. **确认记录**：Issue 评论 + commit SHA（推荐，符合「证据进 Issue」）还是仓库内单独文件？
5. **验收自动化时机**：现在上 Playwright + reg-cli，还是先人工截图对照、稳定后再自动化？
6. **是否现在做项目级 skill**：建议先用 recipe 跑一轮再决定。
7. **GTD**：本轮不建设计系统，仅保留入口与空白 main，对吗？
## 12. 参考链接

**设计资产 / 规范**
- DESIGN.md 规范：https://github.com/google-labs-code/design.md ｜ spec：https://raw.githubusercontent.com/google-labs-code/design.md/main/docs/spec.md ｜ PHILOSOPHY：https://raw.githubusercontent.com/google-labs-code/design.md/main/PHILOSOPHY.md
- Ant Design 根 DESIGN.md：https://github.com/ant-design/ant-design/blob/master/DESIGN.md
- OpenDesign design system 指南：https://github.com/nexu-io/open-design/blob/main/docs/design-systems.md ｜ craft：https://github.com/nexu-io/open-design/blob/main/craft/README.md
- latent-scope：https://github.com/enjalot/latent-scope （`DESIGN.md` / `PRODUCT.md`）
- DTCG：https://github.com/design-tokens/community-group ｜ Style Dictionary：https://github.com/style-dictionary/style-dictionary

**Skills / 工作流**
- anthropics/skills（frontend-design）：https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md
- BMAD UX（双 peer contract）：https://github.com/bmad-code-org/BMAD-METHOD/blob/main/skills/bmad-ux/SKILL.md
- spec-kit converge：https://github.com/github/spec-kit/blob/main/templates/commands/converge.md
- OpenSpec（no approval gate）：https://github.com/Fission-AI/OpenSpec/blob/main/docs/editing-changes.md
- hallmark：https://github.com/Nutlope/hallmark ｜ ui-ux-pro-max：https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- superpowers：https://github.com/obra/superpowers

**验收**
- Playwright：https://github.com/microsoft/playwright ｜ reg-cli：https://github.com/reg-viz/reg-cli
- Storybook 视觉测试（Chromatic）：https://storybook.js.org/docs/writing-tests/visual-testing
- GOV.UK Prototype Kit：https://github.com/alphagov/govuk-prototype-kit

**OpenDesign**
- 仓库：https://github.com/nexu-io/open-design
- 架构：https://github.com/nexu-io/open-design/blob/main/docs/architecture.md
- agent adapters：https://github.com/nexu-io/open-design/blob/main/docs/agent-adapters.md
- orchestrator workspaces：https://github.com/nexu-io/open-design/blob/main/docs/orchestrator-workspaces.md
- MCP 工具源码：https://github.com/nexu-io/open-design/blob/main/apps/daemon/src/mcp.ts
- DSH runtime：https://github.com/nexu-io/open-design/blob/main/packages/dsh-runtime/README.md
- DSH MCP client：https://www.npmjs.com/package/@deepseek-ai/dsh-mcp-client
