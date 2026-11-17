# Agent 调度系统 · 设计参考（讨论沉淀）

> 状态：设计讨论沉淀，持续更新；对应工单 [#66](https://github.com/wanghuahuishiwo/dsh-secretary/issues/66)（工单本体不在本文重复维护，本文是仓库侧参考文档）。
> 参考原型：`/Users/wanghuahui/workspace/dsh-superagent-prototype`（下称 superagent），其 `docs/001-domain.md` 是术语与模式的主要学习对象。

## 1. 系统全景：三环节

1. **环节一 · 事件源**：我关心的事物被及时采集——aone 单状态、公司 code 平台（PR/CI）、个人 GitHub、内部监控预警、聊天（阿里钉/企微/Discord/飞书）、投资数据、关注领域新闻、GTD action 到期。
2. **环节二 · 过滤**：来源庞大，两级过滤（确定性规则 + 模型语义），只留有意义的候选。
3. **环节三 · 委派执行**：由 agent 决定「人处理」还是「某个 worker 启动处理」；人也是 worker。干完/HITL → 更新实体状态 → 被环节一再次探测，闭环。

## 2. 中心 / 节点（部署形态）

**中心**（常驻机器 · 可为公司服务器或个人电脑 · daemon 形式；角色固定、位置可迁）：

| 组成 | 职责 |
|---|---|
| Router（主判断流） | 对上报事件跑 Gate/Assessment/Decision（workflow 图，见 §6） |
| Engine | 状态机与记账：Decision 历史、Assignment、ticket↔sessionId 映射；中心不存工单本体 |
| 状态库 | 上述内部账 + Attention |
| Machine 注册表 | 各节点档案：在线心跳、网络域、worker 能力 |
| Source 归属表 | 每个源当前归哪个节点采（详见 §5） |
| Dispatcher | 接单后选目标（哪台节点哪种 worker / 人），创建 Assignment 下发；含复用/新开判据（§7） |
| 通道服务 | 入站：节点注册/心跳/事件上报/领工单；出站：hitl 唤起通知（只提醒，不承载回答，见 §4） |

**worker 类型轴**（对 Dispatcher 可路由，开放扩展）：

| 类型 | 宿主 | 说明 |
|---|---|---|
| design（设计类） | od | 设计工单：交互稿、原型、视觉产物（对应 od 的设计工作台定位，§2.1） |
| coding（编码类） | dsh、pi | 改代码、跑测试、开 PR |
| general（通用类） | dsh、pi | 调研、汇总、通知类杂活 |
| 将来其他类型 | … | 类型开放；工单落点/项目可与类型对应（如设计项目） |

Dispatcher 选目标的完整判据 = **worker 类型匹配 → 机器网络域/凭据可达 → 节点在线 → 负载/槽位**。
| 观测 | ticket↔sessionId 映射、langfuse 链路 |

中心不采源、不跑 worker session、不碰业务代码。

**节点**（每台机器一个，daemon 形式）：

| 组成 | 职责 |
|---|---|
| 采集器组（Sources） | 按中心归属表采本网络域的源，归一化上报 |
| Worker 池（Executor） | 收派工单 → 宿主适配器（dsh/od/pi）→ 创建 session（**此刻绑 ticket↔sessionId**）→ 注入工单上下文/目录 → 投输入 → 收报告（含结构化问题字段，只搬运不保管） |
| 注册/心跳 | 开机自启后向中心注册，断线重连 |

跨机通信：节点在 NAT 后，**节点主动外连中心**（注册 + 拉取），中心只接 inbound。

### 2.1 宿主适配器（dsh / pi / od）程序化能力现状

调研于 2026-11-11，一手证据：`pi --help`（v1.1.0，`~/.hermes/node/bin/pi`）、OpenDesign 桌面版 0.26.1 + 官方 README（[nexu-io/open-design](https://github.com/nexu-io/open-design)）、[pi 源码](https://github.com/mariozechner/pi)。

| 能力 | dsh | pi | od（OpenDesign） |
|---|---|---|---|
| 程序化创建会话 | ✅ SDK/headless/ACP | ✅ `--session-id`、`--fork`、`-p` headless | 🟡 走 daemon HTTP API；「新建会话/发消息」端点未逐条确认，需装源码版实测 |
| 注入初始上下文 | ✅ | ✅ 位置参数 + `@file` + `--system-prompt` + cwd + `--skill` | ✅ 真实项目目录 spawn、DESIGN.md/checklist 预注入 |
| 运行中投递输入 | ✅ | ✅ `--mode rpc`（stdio JSON-RPC 长连接） | 🟡 流式双向通道存在，公开 API 未确认 |
| 收集结果 | ✅ | ✅ `--mode json` 结构化流、退出码、JSONL 落盘 | ✅ 磁盘产物 + SQLite 记录 + `POST /api/artifacts/lint`、CLI `--json` |

适配器策略结论：

- **pi**：四能力齐全且有官方 RPC 协议，HostAdapter 以 `--mode rpc` 为主通道、`-p --mode json` 为降级一次性通道。
- **od**：本质是「设计工作台宿主」，自己再去驱动各 coding CLI；适配最可行路径 = daemon HTTP API + 产物目录/SQLite 轮询。两个前置：① 安装形态要先固定（桌面版无 CLI，npm/源码版才有 `od`/`tools-dev`；注意 `which od` 命中的 `/usr/bin/od` 是 macOS 八进制 dump，同名冲突有历史教训）；② 会话创建/投递端点装好后实测确认，**不按假设设计接口**。
- **dsh**：参考宿主，能力最全。
- 风险：pi 与 od 均 0.x~1.x 高速迭代，适配器接口要留版本容错。

### 2.2 Gateway 与部署拓扑（关键决策）

**中心是角色，不是固定位置**：个人场景下中心与节点可以同机；多机时中心在常驻机器，节点分布。二者统一经 **Gateway（WebSocket 服务）** 通信：

| 形态 | 拓扑 | 用途 |
|---|---|---|
| 单机模式 | 中心 + Gateway + 节点全部在本机（localhost ws） | 个人使用 / 开发调试，零网络依赖 |
| 混合模式 | Gateway 在本机监听 WSS，远程节点主动连入 | 一期推荐：中心可迁、节点可多 |
| 分布式模式 | Gateway 独立部署作中继，中心与节点都是其客户端 | 后续扩展；换 Gateway 位置不动业务代码 |

约束：① Gateway 是传输层抽象，不是领域概念，单机与跨机同一套协议；② 节点永远主动连 Gateway（NAT 友好），中心在分布式模式下同样作为客户端；③ 节点注册/心跳、鉴权、断线重连、消息序号与幂等在 Gateway 层统一处理；④ 中心单例是逻辑约束——任一时刻只有一个中心写状态库，换机器 = 迁进程，不改调用关系。

## 3. Ticket = 任务系统里的真实工单（关键决策）

不是中心私有对象。中心判断为有效任务时：已有外部工单（aone 单 / GitHub issue）则绑定，没有则在**对应项目创建**。落点规则：内网工作 → aone；外网/个人 → GitHub issue（将来接入类 Jira 的外网任务系统时扩展；届时建不同项目区分）。

状态语言沿用既有约定：**hitl**（等人）/ **afk**（agent 可继续）。工单评论是**人、人的 agent、worker agent、中心**四方共享的唯一事实面。

## 4. HITL = 一次小调研，不是一次问答

现实前提：代码基本都是 AI 写的，人不掌握细节，无法即时回答；人需要开自己的 agent session 多轮拷问、重建理解，再回填。

- worker 挂 hitl 时写进工单的不是「问人」，是**给人的调研 session 的 handoff 任务书**（问题、卡住原因、代码/PR 位置、已尝试/已排除）——按「另一个 agent 读了就能开工」的标准。
- 人调研完把结论 / to-spec 写回工单评论，状态改 afk——这是 HITL 的完成态；通知（钉钉/面板）只做唤起，不是回答通道。
- Source 探测到状态变化 → 中心重新判断 → 再次委派，进入下一轮循环。

## 5. Source 设计：唯一归属 + 多活

- **同一时刻每个 source 只有一个活跃采集者**（避免重复事件、轮询配额浪费、副作用）。
- **多活**：source 可改派——持有该 source 的节点掉线/关机时，中心把 source 改派给另一台**在线且允许执行**（网络域可达）的节点。家里机关机时段就没人采外网源，属预期行为；所有机器都下线则无解，也无需解。
- 中心仍按 `(源类型, 外部ID, 变化序号)` 对事件幂等去重，对外效果幂等（改派瞬间双采的兜底）。

## 6. Workflow 引擎：所有流程编排皆 workflow（关键决策）

- **范围**：一切流程编排都用 workflow 表达，不限于中心判断流；节点拓扑可随时调整，调整流程的低成本是选 workflow 的根本动机。
- **节点类型**：代码自定义节点（纯逻辑，确定性好测）+ agent 节点（判断型/执行型）+ 触发/路由/效果类节点。
- **实现优先级**：全部优先用 dsh 实现（workflow 引擎、宿主适配、worker 宿主）。
- 基础可参考 dsh 既有件：`workflow-ptc` + `tool-workflow`（脚本编排 subagent）、`ui-workflow-run`（运行展示）；缺 DAG IR 持久化与可视化画布（后置子项）。
- 安全不变量（学习 superagent「会思考的与会规则的分开」）：授权复核、事务边界等留在引擎/固定节点，画布可调拓扑与参数，不可改写复核逻辑。

## 7. 再次委派：复用原 session vs 新开

Dispatcher 的一根决策轴，三判据：

| 判据 | 倾向复用 | 倾向新开 |
|---|---|---|
| 原 worker 存活 | 活着 | 已结束 |
| 问题对原上下文依赖 | 高（PR 细节追问、评审意见） | 低 |
| 工单交接质量 | handoff 没写好只能复用 | 自足，新开≈handoff 交接 |

激励闭环：worker 把 hitl 工单写得越全，session 越可抛弃；**复用是优化项，不是正确性依赖**。

## 8. 术语约定（学习 superagent，不改其词表）

- 照搬：Source / Trigger / Thread / Eval（Gate/Assessment/Decision）/ Mandate / Ticket / Assignment / Subscription / Report / Attention / Disposition / Input / Scope / Strength。
- 外部系统对象**必须带源名**（GitHub issue、aone 单）；不带前缀的「工单/Ticket」指调度系统视角下的任务系统工单（§3）。
- 概念正交轴（讨论中确认的三对，避免再混）：
  - 领域概念 vs 运行形式（Executor vs daemon；daemon = 守护进程，只描述形态）；
  - 概念边界 vs 部署位置（领域账由中心保管 ≠ 领域=中心）；
  - 业务事实 vs 执行设施（Ticket/Assignment vs Machine/进程）。
- superagent 本身没有「每机进程」的领域概念（它是单机版）；我们的 Machine/节点是部署概念，不进领域词表。

## 9. 观测链路（一等公民）

**可观测性是一等公民**（用户明确决策，2026-11-11）：中心每一次判断、每个 workflow 节点的执行、每次派工都必须留下可回放的记录（输入/输出/耗时/结果/依据），人随时可查、可下钻、可分析——否则系统是黑盒，无法掌控、优化与归因。任何子模块设计不满足此前提即不通过。

`任务系统工单 → sessionId → langfuse(session messages)`。绑定时机：agent worker 由 Worker 池创建 session 时统一完成；**人作为 worker 的绑定方式待设计**（候选：开 session 的绑定命令 / 完成后补登记）。

**终态画像**（用户决策，2026-11-11）：任一 ticket 可看完整旅程（来源节点 → 判断/各节点 → 派工 → worker → 回写 → HITL），任一节点可下钻内部全部；每次事件进入中心生成 **trace id** 贯穿全链路，串联中心 SQLite、workflow run 记录、langfuse、dsh session 日志。中间链路用到其他底层插件（定时调度等）的能力时，可观测跟随各能力选型（横切判据）。trace id 生成点在事件入中心处，曳光弹顺手实现，避免后补。

**一期曳光弹 = 真源 aone**（用户决策，2026-11-11）：一个真实 aone bug 从 afk 被采集 → 判断 → 开/绑工单 → 派工 → worker 干完 → 回写状态的全链路；不做 mock 源。

## 10. 待决与调研中

- [x] ~~调研中：od（OpenDesign）与 pi 的程序化接口~~ → 已完成，结论见 §2.1；od 的会话端点实测为遗留动作。
- [ ] 人作为 worker 的 session 绑定方案（§9）。
- [ ] 外网类 Jira 任务系统的具体选型与项目规划（§3）。
- [ ] GTD 与任务系统的关系（GTD action 目前只作为触发源接入；是否升级为一类工单，后置）。
- [ ] 拆分落地：父票 #66 + 子票（workflow 引擎 / 画布 / 执行层 / 事件源适配 / 观测纵切）的具体划分与范围，待本文稳定后定。
