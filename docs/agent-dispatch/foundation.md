# agent-dispatch · 底座细节

> 状态：架构讨论进行中的临时文档，只收录**已确认**的结论；未定项在第 3 节单列。
> 本文承接 [overview.md](overview.md)（宏观四概念：中心、节点、Gateway、事件），展开两个模块：**graph 执行引擎**（中心与节点共享的底座子模块）和**部署角色**（进程怎么摆）。
> 决策出处：底座核心见 wayfinder [#79](https://github.com/wanghuahuishiwo/dsh-secretary/issues/79)（已关，其中「引擎只在中心」已修正为「引擎插件双端装载」，见 1.1）；#70 的引擎选型已被 #79 取代。进程与宿主形态见 [底座·进程与宿主形态（中心/节点/Gateway 各跑在什么里）](https://github.com/wanghuahuishiwo/dsh-secretary/issues/82)。

---

## 1. graph 执行引擎（中心与节点共享的子模块）

```text
        静态编排图（人声明/画布）              动态执行图（引擎自动生成）
   ┌─────────────────────────┐        ┌──────────────────────────┐
   │ entry 新工作 ══▶ [过滤]  │        │ 实例X: ①task:check-ci ✓   │
   │ entry 存量评论 ═▶ [决策]─┼───▶    │        ②wait:approval ⊙   │
   │                  [委派]  │ 执行    │        （2h后）③注入继续   │
   └─────────────────────────┘        └──────────────────────────┘
```

**简述**：流程 = graph；一次执行 = 实例。引擎 durable 化：把每次副作用与等待记入事件历史，恢复靠重放。图是一等事实源，graph node 内部以代码为主形态（细逻辑不拆画布）。

### 1.1 引擎的装载位置（DSH 插件，双端装载）

graph 引擎是一个 **DSH 插件**，谁装载谁就有：

- **中心装载** → 跑**调度 graph**（过滤 → 决策 → 委派这类流程）；
- **节点装载** → 跑**任务内部 graph**（一个复杂任务本身也可以是一张图，在节点本地跑）。

同一个引擎、同一套开发模型（run / ctx / runTask / waitFor）、同一套观测。**铁律：系统的权威记录只由中心追加（单一写入点）**——节点上任务 graph 的本地历史，经 `task.result` 等事件回传汇入中心的权威事件历史，观测仍是一条流。

概念（本模块全部概念，按层次分组）：

### 1.2 图的结构

- **graph**：流程的定义，事实源。粗粒度：graph node 是业务能力单元之间的连线。
- **graph node（图节点）**：graph 的元素，一个业务能力单元（如过滤、决策、委派）。DSH 插件形态，自带端口类型声明；连线时类型兼容才能连（语义类型标签 + 结构校验）。
- **入口声明（entry）**：一张 graph 可声明多个入口，每个入口 = 触发事件 + 进入节点 + 输入适配器；适配器输出必须满足进入节点的入参类型（声明时类型检查）。对应 BPMN multiple start events 语义。
- **子图**：graph node 的一种——实现 = 调用另一个 graph。两种调用：invoke（同步等结果）/ spawn（异步，事件回联）。
- **并行**：graph 按 DAG 设计（多出边 + Join：等全部/等任一/竞速）；一期不主动使用，架构不封路。

### 1.3 执行与恢复

- **实例（instance）**：graph 的一次执行。睡着时不占任何资源，状态全在事件历史里。
- **事件历史（Event History）**：引擎持久化的只追加事件记录（task 结果、等待登记与唤醒、定时器）。恢复与观测的共同来源。中心的是权威事件历史；节点本地的经事件回传汇入。
- **重放（replay）**：恢复时 run 从头重跑，已记录的调用从历史注入结果；匹配 = 顺序游标 + 类型/名字/参数指纹，对不上即 non-determinism 错误。
- **信号（Signal）**：外部事件注入运行中的实例——唤醒的机制名。
- **持久化定时器（Durable Timer）**：waitFor 超时 / cron 到点 = 生成唤醒事件，重启不丢。审批 vs 超时 = 同一实例上的事件竞速。

### 1.4 事件怎么进入图（三叉路由）

```text
事件到达
 ├─ ① 查等待登记（有实例在 waitFor 这个信号名）→ 唤醒，从睡着的 graph node 注入继续（不经入口）
 ├─ ② 查入口声明 → 开新实例，从声明的入口 graph node 进
 └─ ③ 都没有 → 记 unmatched，不产生执行
```

① 优先于 ②（已有实例在等就不再开新的）。存量事件（关联已存在实体）三种解法：实体长生命周期实例（一个 MR 一个实例活到合并）· 独立后续模板 · 复活已结束实例。

### 1.5 graph node 的开发模型

```ts
// 节点 = defineNode({ 端口类型声明, run(ctx, inputs) })
async run(ctx, { ticket }) {
  const env = 纯逻辑(...)                                  // 判断层（node:vm 内）
  const ci  = await ctx.runTask('check-ci', { repo })      // 副作用层（房间外子进程）
  if (!ci.pass) {
    const ok = await ctx.waitFor(`approval:${ticket.id}`,  // 等待（登记，事件命中注入）
      { schema: ..., timeout: '24h' })
  }
  return { result: ... }
}
```

- **run(ctx, inputs)**：graph node 的入口函数，引擎的调用约定。
- **判断层**：run 里的纯逻辑与 await，esbuild 打包后进 node:vm 隔离区；全局调包（Date/random/计时器走事件历史），无模块系统，副作用物理上只能走纸条。
- **副作用层**：`ctx.runTask(名字, 参数)` 纸条模式——实现在引擎侧**任务执行器**（子进程）真执行一次、结果入事件历史；重放时从历史注入，绝不重跑。
- **ctx.waitFor(信号名, {schema, timeout})**：登记等待；事件命中后返回值注入，代码就地 if/else。信号名由领域层从事件 `data` 派生（#85：信封无扩展属性，token 派生归中心侧路由节点）。
- 开发规范 4 条：纯逻辑随便写；副作用必须 runTask；等外部必须 waitFor；时间/随机用调包版全局（自动记账）。vm 防误不防恶，恶意代码靠任务执行器进程隔离。
- **HITL = await**：人机闭环就是 waitFor（提问是副作用、回答是事件命中）；hitl/afk 状态 = 实例位置的投影。
- **任务队列 / 工作器（Task Queue / Worker）**：runTask 纸条的执行侧（Temporal 概念）。

---

## 2. 部署角色：角色、宿主与进程

一期单机的最小链路固定为**双进程**：一个独立 Gateway 进程，加一个同时装载中心与节点角色的 DSH 桌面宿主进程。

```text
┌──────────────────────────────────────┐
│ DSH 桌面 App                          │
│ └─ DSH 宿主进程（desktop profile）     │
│    ├─ 中心角色插件集                  │
│    │  ├─ graph 执行引擎（调度 graph）  │
│    │  ├─ 权威事件历史（单一写入点）     │
│    │  └─ 观测面                       │
│    └─ 节点角色插件集                  │
│       ├─ graph 执行引擎（任务 graph）  │
│       ├─ 采集器组                     │
│       └─ Worker 池                    │
└──────────────────┬───────────────────┘
                   │ 真实 Gateway 事件协议
          ┌────────┴────────┐
          │ Gateway 独立进程 │
          │   （非 DSH）     │
          └─────────────────┘
```

### 2.1 角色与宿主的组合契约

- **中心与节点是 DSH 角色插件集，不是进程名**。二者可以同宿主，也可以分到不同宿主；同一 DSH 同时启用中心与节点是一等合法配置，不能报错或靠禁止安装回避组合问题。
- **同宿主组合正确性属于底座验收**：中心与节点各自的 graph 执行引擎必须隔离，Loader id、工具名和注册表不能因角色组合意外冲突，可共享的 DSH 服务必须明确，角色私有状态不能意外共用。
- **Gateway 一期是独立非 DSH 的 `nats-server` 进程并启用 JetStream**，不提供 DSH 内嵌模式。NATS 内建鉴权提供连接认证与授权；Gateway 只拥有连接、鉴权、通用服务发现、订阅、投递、JetStream 序号与短期发布去重等自身领域，不承载中心、节点或具体业务语义；消费端长期幂等不属于 Gateway。
- **一切跨角色通信经 Gateway**：中心与节点即使同宿主，也必须通过官方 `nats.js` 走真实 NATS 协议，不能直接方法调用；DSH isolate realm 不是这一规则的强制边界。本机使用 `nats://`，远程默认 `tls://`，只有浏览器直连或 HTTP/HTTPS 代理约束成为真实条件时才启用 `ws/wss`。连接、重连与幂等细节由 [底座·Gateway 协议（事件信封/注册心跳鉴权/重连/序号幂等）](https://github.com/wanghuahuishiwo/dsh-secretary/issues/83) 决定。
- **一期默认一个 File/Limits stream**：File 存储用于跨 NATS 重启恢复。stream 数量不是永久不变量，只有 account、保留、存储／副本、配额或恢复边界不同时才拆分，不按事件类型或语义拆分；一期 R=1 是无容错单点，File/durable 解决重启恢复，不解决机器或磁盘永久丢失。
- **中心与节点通过 NATS Services 发现彼此**：双方只配置同一个 NATS 地址，以 NATS Service 上线并通过 `$SRV.PING/INFO` 发现在线实例，不配置彼此 IP。NATS Services 不是持久注册中心；需要保留的离线历史目录由中心持久化保存，一期不新增独立注册中心进程。
- **长期 `nodeId` 与 NATS Services 临时实例 ID 分离**：首次显式初始化时用安全随机源生成 UUIDv4，以原子、默认不覆盖的方式写入专用持久身份文件；普通启动只读取和校验，缺失或损坏时不静默换号。新建、克隆、恢复分别显式处理，中心检查并拒绝重复 `nodeId` 的登记和派工。节点 `source` 由持久值构造为 `urn:dsh:node:<nodeId>`，进程重启和 OS 重启保持不变；NATS Services 实例 ID 只标识本次在线运行实例。
- **节点按机器计身份，不按进程计数量**：每台机器一个逻辑节点角色实例、一套采集器组和 Worker 池；同机拆分其他进程不能再制造第二个节点身份。
- **中心与 Gateway 一期保持逻辑唯一**。未来可以用多个物理实例支撑这些逻辑角色，但多机多活属于二期，本设计不展开集群方案。

### 2.2 单机与双机部署

- **一期最小链路只验收单机双进程**：desktop profile 同时装载中心与节点，DSH 桌面统一观察双方 Agent/Session；不增加同机三进程验收。
- **中心与节点需要分开时按双机理解**：中心机器运行中心 DSH 宿主与本机独立 Gateway，另一台机器运行节点 DSH 宿主并主动连接 Gateway。角色代码不随拆分改变，只改变 profile 与部署配置。
- **中心角色**承载调度 graph、权威事件历史与观测面；中心角色自身不采集、不跑 Worker 会话、不碰业务代码。节点角色与中心同宿主是部署组合，不改变这一职责边界。
- **节点（机器角色）**装载任务内部 graph、采集器与 Worker 池，不做调度判断、不写中心权威事件历史。注意与 **graph node（图元素）** 区分。
- **观测台**仍只读事件历史与服务健康；DSH 桌面的统一 Agent/Session 视图不替代事件流之上的观测查询面，后者仍在未定项中。

### 2.3 启停与 Gateway 设置

- DSH 桌面 App 按现有方式启动桌面 Host，desktop profile 装载中心与节点角色；无桌面的节点机器使用自定义常驻 DSH profile，以 `dsh` 前台命令启动。
- **节点始终由所在机器本地启动**，启动后主动连接配置的 Gateway 地址；中心只负责派工，不远程创建节点进程。
- Gateway 保留独立命令行入口，同时一期提供 **Gateway 设置 UI**，在本机模式与远程模式之间二选一：
  - **本机模式**：管理本机独立 Gateway 进程，支持启动、手动重启、停止和运行状态；自动生成本机连接地址并写入本机中心、节点角色的客户端配置，用户不重复填写 URL。
  - **远程模式**：只配置远程 Gateway 地址与凭据引用，只控制本机客户端连接，不提供远程进程的启动、重启、停止或状态控制。agent-dispatch 协议也不暴露远程进程控制 API。
- 中心与节点分别使用 NATS 内建 **NKey** 用户连接，并以 subject permissions 限制发布、订阅权限。本机模式由 Gateway 设置 UI 生成并保存凭据引用，远程模式配置已有凭据引用；私有 seed 不写入 URL，也不传入模型上下文。本机 loopback 仍要求 NKey，远程连接额外强制 TLS。
- 两种模式的连接配置都持久化在所在机器；无桌面节点通过 CLI／配置文件维护同一份配置，不依赖桌面 UI。UI 是操作入口，不限定底层配置存储格式。
- 由 UI 启动的 Gateway 在 DSH 桌面退出后继续运行，DSH 重开后可以重新识别并控制同一实例；正常停止由用户显式操作，不随桌面联动退出。一期不做崩溃自动重启、自定义守护或第三个常驻管理器。
- 以后需要无人值守运行时，分别把现有启动命令接入 launchd（macOS）或 systemd（Linux），不改变角色代码。

**外部系统 / 人**仍不归我们运行：外部系统经节点采集器参与；人既是事件源（审批/回填），也是监督者（面板）。

---

## 3. 中心内部 Ticket（工作单元）

> 决策出处：wayfinder [#90](https://github.com/wanghuishiwo/dsh-secretary/issues/90)、#91（均已关）。

- **实体地位**：内部 Ticket 是中心的持久化权威实体，持有结构化领域事实，不从事件流派生。事件（外部采集、worker 回写）职责收窄为**输入与触发**：中心处理器消费事件、按领域规则落笔。graph 引擎的事件历史（重放/恢复）属引擎领域——**引擎领域靠事件重放，Ticket 领域靠结构化事实**，两者分层。
- **写入权**：只有中心能改 Ticket，一切变更由中心侧调度 graph 节点的副作用落笔；与 graph 实例无领域关联。每次变更追加**操作记录** `{at, operator(worker), action, from→to, 理由?}`，无匿名变更：中心调度署名其具名 PM worker，worker 回写署名该 worker，人操作署名人的 worker 名。
- **worker 统一模型**：一切执行者都是 worker：`{ name, type: user|agent, 所在节点(人为 null) }`（命名跟 GitHub actor `type: User/Bot`）。人也是 worker；agent worker 各自起名，全局唯一。是否在等人直接看 `assignee.type`，不做 hitl/afk 概念。
- **领域结构（核心模板 = Linear 原样）**：
  - `status : Todo | In Progress | Done | Canceled`（终态不可改写；不加 resolution、不加 Failed——完成判定定案后回看）；
  - `assignee : Worker?`（默认 Unassigned，委派=变更+操作记录+通知）；
  - `labels[]`、`parent : Ticket?`、`relations[] : {type: related|duplicate|blocks, target}`（全 Linear 原封，不另加 follows）；
  - 子记录（追加式）：**评论** `{at, author(worker), content}`、**操作记录**（≈Linear activity + 云效操作日志）；
  - **自设计仅两处**：`externalRefs[] : {system, kind, nativeId, url}`（只引用不镜像；分容器级/对象级，路由汇聚只认对象级；适配器注册表，一期只实现 aone）与**执行记录引用位**（结构归任务执行领域）；
  - 派生不存：children（反查 parent）、inverseRelations；模型双向、存储单向、不双写。
- **无 Assignment 实体**：指派历史 = 操作记录中 assignee 变更的串联；attempt / session 等运行时事实归任务执行领域（#84）。
- **复活语义**：终态票（Canceled 除外）被**人**重开 → 回 Todo；机器触发一律开新票并以 `related` 关联旧票。
- **trigger 与 externalRef**：触发事件的 `data` 携带对象身份（#85 义务），建票时持久化为 externalRefs；一个 externalRef 对应多次 trigger。语义相关（如同群不同票）由决策节点研判，不自动归并。

## 4. 中心工作流（v1）

> 决策出处：wayfinder [#91](https://github.com/wanghuishiwo/dsh-secretary/issues/91)（已关）。骨架参考 superagent 原型，词汇用本仓库术语。

```text
① 触发事件（data 必带对象级身份）
     → 被对应链路的入口声明订阅认领（标准 pub/sub；无人认领 → unmatched）
     → 输入适配器从 data 取对象身份查票（汇聚键 = externalRef，不建 Thread）
     → [过滤]（确定性规则：自写/噪声/可信来源）不过 → unmatched
     → [决策]（可调模型）开工 → 创建 Ticket（Todo/Unassigned，operator=PM）
              已有票 → 推进；忽略/停止 → unmatched（不建 Decision 实体）
     → [委派]（assign → In Progress + 通知）
② Report 事件（worker 回写，带 ticketId）→ 直达该票推进节点，不走路由
     → 推进：置 Done / 重派 / 转给人（底座给动作，流程 graph 给策略）
③ 定时器 → 引擎内部唤醒事件 → 直接起 Source graph 短实例（不经 Gateway）→ 产出触发事件
④ 外部系统写回 = worker 的任务内容，中心不碰外部凭据
```

- **不建的实体**：Thread（汇聚键 = externalRef）、Decision（结局落操作记录/unmatched）、Mandate（不考虑）。
- **人的介入**：人就是 worker（type=user），对票的评论/操作与 agent 回写同构，都是带票身份的输入，中心只提供落笔入口；agent 问人 = assignee 改为人，无问答实体。
- **建票时点**：过滤、决策在建票之前；创建（create）与委派（assign）是两条操作记录，票短暂处于 Todo/Unassigned，不丢弃。

---

## 5. 未定项（空白，非结论）

- 任务路由到哪台节点（能力标签 / 槽位）
- 节点本地事件历史与中心权威事件历史的汇合细节（全量回传 vs 摘要+引用）
- 完成判定定案后回看 Done 是否需细分（如 Failed）
- 凭据与安全（token 如何交给节点与任务，不进模型上下文）
- graph 版本化（改图不破坏运行中/睡着的实例）
- graph 节点输入结构与校验（固定结构与文本输入的差异、统一校验位置及失败行为）
- graph 实例级共享上下文：节点除前置节点输入外，是否支持实例范围内可读写的自定义上下文，及其与事件历史、重放确定性的关系
- 可观测查询面细节、可用性分级与 DB 演进（#77 / #78 吸收）
- graph 引擎 MVP 边界与实现拆分（后续 /to-spec）
