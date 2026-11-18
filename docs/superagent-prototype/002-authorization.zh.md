# 002 授权（Authorization）

> 中文译本，仅助读；英文原文为权威版本：见原型仓库 `dsh-superagent-prototype/docs/002-authorization.md`（翻译于 2026-11-17）。

授权决定谁可以开始工作、以及那项工作可以包含什么。本文档建立在 [001 领域模型](001-domain.zh.md)之上。

宿主执行允许名单、规则和 Mandate（授权）。消息、评论和被引用的文档只是决定的输入；它们不能改变这些权限。

## 一个 Trigger 的两条路径

### Eval：决定是否开始新工作

Source 记录一条消息是否指向 agent：`mention` 表示 @ 了 bot 或 agent 账号，`direct` 表示私信。Gate（准入）检查发送者和 Source 的 Policy（策略）：

- 允许名单上的人指向 agent，构成一个明确（explicit）请求。
- 一个人在已有 Ticket（工单）的 Thread（线程）上跟进，按下面的规则处理。
- 其他人类消息按其接收范围的准入表（admission table）处理。
- 在 Source 的 bot 名单上的 bot，只能产生推断（inferred）候选，永远不能构成明确请求。其他 bot 不予准入。

### Subscription（订阅）：延续已有工作

被订阅 Thread 上的每条消息都作为上下文到达订阅它的各张 Ticket，包括来自 bot 和 CI 的消息。这种投递绕过 Gate，也不授予新权限。每张 Ticket 仍受其 Mandate 限制。

一个人落在 Ticket 自己的 Thread 上的消息，归那张 Ticket 的 Executor（执行器）决定。主 Session（Main Session）把消息附到某张 Ticket 上时同样如此。Executor 持有该消息期间，它不走 Eval、不产生 Decision。每个 Executor 或在其 Ticket 范围（scope）内处理该请求，或把它交回（hand back）以路由到别处。

只要 Ticket 还活着，持有关系就持续，即使有人撤掉了它的 Subscription。持有关系也覆盖一张未被人工停止、且有等待恢复它的消息的已结束 Ticket。

主 Session 收到一条跟进通知。Executor 持有消息期间，主 Session 只能应人的请求停止工作；accept（接受）、attach（附加）、ignore（忽略）、requeue（重新排队）都被拒绝。停止仍会经过 Gate，强度按下面描述的跟进强度处理。

### 交回与释放跟进

当 Executor 被要求做超出 Ticket 范围的工作、或该消息属于另一张 Ticket 时，它把消息交回一次。Ticket 保留其 Subscription。若被附加的 Thread 与之无关，Executor 交回它在那里持有的消息。

一条消息只有在没有任何 Ticket 仍持有它之后，才进入一次新的 Eval。它的候选信息包含各 Executor 的交回理由。Gate 把它当作该 Thread 上的一条普通消息评判，主 Session 可以接受它、把它附加到别处或忽略它。交回一条 Ticket 并不持有的消息——比如 bot 消息、或人已发给 Eval 的消息——不会排队任何东西。

一张 Ticket 结束时，释放其 Executor 未读、未接手的跟进。包括从未投递到 Executor 的消息，以及在其最后一次 Report（报告）或回合结束之后投递的、且它既未确认、未回答、也未交回的消息。每条被释放的消息，在没有其他 Ticket 持有它时进入 Eval。停止只结束被停止那张 Ticket 的工作。

被人工停止的 Ticket 不会把它的停止消息再次送入 Eval，除非另一张 Ticket 交回了它。执行停止的主 Session 可以把该消息的其余部分当作新工作接受。

人可以从面板把一条被持有的跟进送入 Eval。若主 Session 随后又把它附回一张活着的 Ticket，Executor 会再次收到它。当没有有效判断覆盖某条消息时，面板也提供重新评估。

### 仅上下文的订阅

Executor 可以追随一个相关 Thread（如另一个 Issue 或 pull request）作为上下文。那里的消息到达 Ticket，但不授予权力或跟进强度。那里的人类消息不能恢复已结束的 Ticket，除非主 Session 从该 Thread 附加一条消息。主 Session 关于其他工作的通知也只是上下文。

没有到达任何 Ticket 的人类消息——包括其 Ticket 被人工停止的 Thread 上的——走 Eval 路径。bot 消息独立于其向订阅 Ticket 的投递，也走该路径。

## 强度（Strength）

| 强度 | 适用情形 |
| --- | --- |
| explicit（明确） | 名单上的人指向 agent，或在已有 Ticket 的 Thread 上跟进；准入表某个格子设为明确请求 |
| inferred（推断） | 不在名单上的人在有 Ticket 的 Thread 上跟进（除非其准入表格子为明确）；准入表设为推断候选的格子；Source 的 bot 名单上的 bot，在指向 agent 或到达 Source 全量接收的范围时 |
| not admitted（不予准入） | 其他任何 bot 的消息；准入表忽略的一切；接受模式为 `off` 时的全部推断情形 |

对不在名单上的人，即使 Thread 上已有 Ticket，明确的准入格子仍优先，且在任何接受模式下都有效。否则其跟进是推断的，`off` 模式下不予准入。仅作上下文追随的 Thread 上的消息使用准入表，而非跟进强度。

## 准入（Admission）

每个 Source 的 Policy 有一张准入表。它的行是接收范围：

- **Feishu**：每个配置的聊天、bot 收到 @ 的其他聊天、以及私信。其他聊天只有在飞书卡片上把**其他群**设为**仅 @** 时才接收。
- **GitHub**：新 Issue、新 pull request、评论、默认分支的 CI。

每行至多三个格子。每个格子决定一条消息成为明确请求、推断候选还是什么都不是：

| 格子 | 可选值 | 默认 |
| --- | --- | --- |
| 在名单上、未指向 agent | inferred、ignore | inferred |
| 不在名单上、指向 agent | explicit、inferred、ignore | ignore |
| 不在名单上、未指向 agent | inferred、ignore | ignore |

未指向消息的格子只在 Source 全量接收消息的范围内可用，如设为**全部消息**的飞书聊天，或打开了全量接收开关的 GitHub 范围。CI 结果没有发送者，其行只提供最后一个格子。bot 消息使用 bot 名单而非这些格子。

把"不在名单上、指向 agent"的格子设为 explicit，能让该范围内的任何人通过 @ agent 请求工作。对一个专门的支持群，这可能有用。推断候选仍取决于接受模式。跟进通常绕过这张表，但明确的格子仍授予明确强度。

准入表是 Policy 版本的一部分。削弱一个格子不会立即停止在其之下接受的在途 Ticket。当这些 Ticket 恢复前重新校验时，它可以撤销它们的 Mandate。

### bot 与自动化评审者

宿主把 GitHub Apps、以 `[bot]` 结尾的登录名和飞书 bot 识别为 bot。Source 可以列出如 `dependabot[bot]` 这样的 bot，其消息可以成为推断候选。它们必须指向 agent、或在一个全量接收的范围内发言。它们不能提出明确请求、不能停止 Ticket。

使用普通账号的自动化评审者，对宿主而言是人。其评论到达订阅的 Ticket 并产生跟进通知。团队的 prompt 文本必须把这类账号标识为自动化评审者。

## 路由候选

主 Session 用 `orchestrator_route` 路由明确的候选。一次调用可以包含多个 accept、attach、stop 或 ignore 决定。各项独立处理：一项被拒绝或缺失字段，不妨碍其余各项执行。

推断候选通常需要完整研判（Assessment）。只有一个捷径：若其卡片明确不触及任何启用的规则——如纯闲聊或无关讨论——主 Session 可以直接忽略它。Decision 记录 `ignoredFromCard` 以区别于规则研判。主 Session 在其 Policy 的 prompt 段落中读取启用的规则。

接受一个推断候选总是需要研判。直接 accept 会拒绝未被 Gate 以明确身份准入的 Trigger。

## 接受模式与规则

接受模式是 Policy 的一部分：

| 模式 | 效果 |
| --- | --- |
| `off` | 任何推断都不成为候选，如未指向的消息、bot 消息、不在名单上的人的跟进 |
| `observe`（默认） | 推断候选被研判；正向研判记录为标注"本会接受"的 ignore，不接受任何工作 |
| `auto` | 推断候选的正向研判即接受它 |

明确的请求在任何模式下都有效。从 `observe` 开始，审查记录的 Decision 后再切换到 `auto`。每次研判对每条启用的规则恰好评判一次，无论是否命中。主动接受至少需要一条命中的规则。

每条规则描述一类主动型工作。Ticket 的 Mandate 记录命中的规则，其 Executor 收到这些规则的名字和说明。

对那张 Ticket 而言，规则的流程与沟通要求覆盖默认值。一条静默规则可以抑制确认；一条评审规则可以指明必需的评审人与合并前批准。适用于每张 Ticket 的要求属于团队 prompt 段落，不放在规则里。

## Policy 版本

规则、接受模式和各 Source 的 Policy 部分共同构成 Policy 版本。每个 Mandate 记录它据以被接受的版本。

版本变更会作废正在运行的 Eval，并把它们的 Trigger 重新排队。它还向每张受影响的在途 Ticket 发送一个 policy-changed Input（输入）。该 Input 说明：

- 一条命中的规则变了（含新文本）、还是不再适用；
- 请求者可能不再能发起工作；或
- 主动型工作不再被接受，例如模式从 `auto` 改走了。

不受影响的 Ticket 不收到通知。变更不立即撤销在途 Ticket 的 Mandate。

Source 配置与 Policy 分离。它控制什么进入系统：读哪些聊天、一个范围接收全部消息还是只接收 @。Mandate 记录它的 Source 和接收范围。恢复要求 Source 仍在监听那个 Thread，但不要求它仍在那儿全量接收。

Source 关闭期间，回复等待。Source 不再监听其目的地时，回复被丢弃。

关于 Executor 可以对自己的结果做什么的条件——比如何时可以合并——不决定谁可以授权工作。它是 agent 指令的一部分，不属于 Policy。

## 恢复与停止

已结束的 Ticket 保留其 Mandate。人的消息落在它自己的某个 Thread 上，可以恢复同一件工作，无需新的 Eval 或 Decision，无论发送者是谁。bot 和 CI 不能唤醒已结束的 Ticket。Executor 判断该请求是否在范围内，不在则结束本轮。

只有三个操作改变 Mandate：accept 创建它，人的 stop 撤回它，重校验失败撤销它。被人工停止的 Ticket 保持结束、不再接收任何东西。在那里请求的工作需要一次新的接受。

### 恢复前重校验

Source 必须仍在监听原 Thread。其余检查取决于 Mandate 的依据：

- 明确的跟进 Mandate 直接通过。
- 推断的 Mandate 需要 `auto` 模式且其命中的规则仍启用。
- 由准入表格子准入的 Mandate，在今天的表格和发送者成员关系下必须仍获得至少原有的强度。因此把一个发送者移出名单，可以撤销通过"名单发送者"格子接受的 Mandate。
- bot 的 Mandate 要求该 bot 仍在 Source 的 bot 名单上。推断的表格与 bot Mandate 还需要 `auto` 模式和启用的命中规则。
- 其他 Mandate 要求发送者仍在 Source 的允许名单上。

重校验失败时，Ticket 保持结束，不接收任何等待中的消息。每条消息被视同没有到达任何 Ticket；若无其他 Ticket 持有它，它进入 Eval。主 Session 不会被告诉它到达过某个 worker。处理暂停（pause）之后同样适用。附加到该 Ticket 被拒绝，进一步的工作需要一次新的接受。

- **一个人在 Thread 里说"停止"，是一条普通的 Trigger**，由 Eval 决定停止。Executor 不能宣称有人让它停止。
- **面板里的停止是一条命令。**它直接作用于 Ticket，并记录为人工停止。
- **等待条件属于 Source。**"N 小时无人认领"这样的条件，应该是一个自己等待并反复检查的 Source；Eval 永不等待。

## Eval 未完成时

时限从候选到达主 Session 起算。等待投递的时间不计，未投递的候选永不超时。

超时的 Eval 把它的 Trigger 重新排队再试一次。连续两次重试后，第三次超时记录 `unavailable`。研判失败也记录 `unavailable`；之后的 Trigger 可以开启新的 Eval。Policy 变更、或依据过期 Policy 做出的决定，记录 `unavailable` 并立即按当前版本重新排队该批次。

`evals` 健康项报告最近一小时未解决的 unavailable Decision。`scripts/dsh-superagent status` 包含该错误。

仅当 unavailable Decision 不满 24 小时、仍是其 Thread 上最新的 Decision、未被忽略（dismiss）、且该 Thread 既未排队也未在评估中时，面板才请求人的注意。人可以重新评估该 Trigger，或忽略该问题。
