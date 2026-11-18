# 003 执行（Execution）

> 中文译本，仅助读；英文原文为权威版本：见原型仓库 `dsh-superagent-prototype/docs/003-execution.md`（翻译于 2026-11-17）。

本文档追随一张被接受的 Ticket（工单）走过执行、投递与恢复。它建立在 [001 领域模型](001-domain.zh.md)与 [002 授权](002-authorization.zh.md)之上。

## Ticket 阶段

每张打开的 Ticket 有一个阶段，由它在等什么决定。表格自上而下读，第一个匹配的行生效。

| 阶段 | 条件 | 面板标签 |
| --- | --- | --- |
| person / delivery | 向 Executor Session 投递一个 Input 失败；2 秒后重试，随后按倍增至一分钟的间隔重试；投递成功、新 Assignment（派工）或 Ticket 结束会清除它 | Input undelivered |
| person / answer | 它有一个 Attention（待人工决定） | Awaiting answer |
| person / review | 最新的 Report（报告）是 `ready` | Awaiting review |
| person / blocked, failed | 最新 Report 是 `blocked` 或 `failed`，且此后没有人的消息到达过该 Ticket | Blocked · Failed |
| working / queued | 没有 Assignment，或有一个 pending 的 | Queued |
| idle | 最新 Report 是 `waiting`，或 Assignment 已结束 | Waiting for a Trigger |
| working | 其余一切 | Working |

`person` 阶段表示 Ticket 没有人工输入就无法继续。一条新的人类消息会把 `blocked` 或 `failed` 的 Ticket 释放回它的 Executor，于是它进入下一个匹配的阶段，通常是 `working`。

一张 `idle` 的 Ticket 已完成其回合且没有未决问题。被订阅 Thread 上的一个 Trigger 可以延续它。

## Executor

每张 Ticket 得到一个名为 `worker-<ticket id>` 的 Executor Session 和一个以 Ticket 短名命名的目录。目录在配置的执行根下创建，默认是 `<stateDir>/work`。

Executor Session 以操作者的 OS 用户身份、无需批准地运行命令。它们的 `dsh-superagent-worker` preset 包含工作所需的工具，并在 5 秒后将前台 shell 命令转为后台作业。这让 worker 在下一步就能收到新消息，而不是等一条长命令跑完。

主 Session 使用 `dsh-superagent-router`，有同样的 5 秒 shell 与作业等待上限，以及更小的路由工具集。Session 保留创建时选择的 preset。worker 的子代理用 DeepSeek Harness 的 `standard` preset。

### 后台工作与 worker 槽位

当一个回合结束时仍有 shell 作业或子代理在运行，Ticket 保留其 worker 槽位并保持 working。它不会被报告为等待，主 Session 也收不到等待报告。一个完成的作业或子代理会以同一槽位唤醒 Executor 并带回结果。当一个回合结束且没有后台工作后，Executor 才正常报告等待。

每个回合之后，后台工作至多有 30 分钟完成。到点后，shell 作业被杀掉，Ticket 报告等待。报告包含 Executor 的最后留言、哪些作业被杀、哪些子代理仍在运行。子代理允许继续。Executor 在下一回合读取被杀作业的结果。

移交给人的时刻立即释放槽位，并让当前 Report 保持有效。这适用于一次 `ready` Report 或一个问题之后（除非此后又来了新 Input），以及任何 `blocked` 或 `failed` Report 之后。

移交时，子代理停止。shell 作业——比如一个供评审的服务器——可以继续到 Assignment 结束。它们不占槽位、也不受 30 分钟限制约束，包括后续回合之后。它们的完成不唤醒 Executor；Executor 在下一回合读取结果。

人也可以直接在 Executor Session 里写入来开启一个回合。其后台工作遵循同样的规则。

Assignment 结束时，它的 shell 作业被杀且不唤醒 Session。它的子代理被释放，其完成所唤醒的任何回合都被丢弃。替代的 Assignment 及其等待中的 Input 在该关闭完成后启动。

在 DeepSeek Harness 进程内停止或重启插件走同一条关闭路径。尚未进入 Session 历史的 Input 被保留。关闭时对每个 worker 的后台工作至多等 10 秒；进程重启则直接终止这些工作。忙碌中被打断的 Assignment 会带着一条恢复提示重启。

worker 的子代理（含嵌套的）使用 DeepSeek Harness 的 `standard` preset，带 worker 的权限。它们只保留 worker 被允许的工作工具，Ticket 结束时失去这些工具。`standard` 下，shell 命令 60 秒后转入后台。子代理结束时其作业被杀。

### 准备 Ticket 目录

第一次 Assignment 之前，若 Ticket 目录不存在，prepare 命令以 `sh` 在执行根下运行一次。它有十分钟完成。没有配置 prepare 命令时，worker 在空目录中启动。

命令失败则 Ticket 失败并记录其输出。重试或人在 Ticket 某个 Thread 上的消息会再次尝试准备。一个典型的命令用 `git worktree` 创建一个检出。一个 pull request，当其分支的最后一段路径与 Ticket 短名匹配时，属于该 Ticket。

### 并发

Ticket 从一次启动（launch）的开始（包括准备阶段）、或从唤醒其 idle Executor 的那次投递起，持有一个 worker 槽位。在一个活跃回合的全程也持有。

配置的并发上限作用于这些槽位，另加一个额外槽位给人的消息或状态请求。这种唤醒在常规槽位满时可使用额外槽位，并在新启动之前优先取得下一个空闲槽位。新工作因此不能阻止人延续一张已有的 Ticket。

其他 Input——如 CI 结果——等待常规槽位。一次启动在 `working / queued` 中等待槽位空闲。多个启动并发运行，所以一个缓慢的 prepare 命令只延误它自己的 Ticket。

### 执行变量

prepare 命令与 Executor 指令收到相同的执行变量。命令读取环境变量；Executor 在其 prompt 中读取它们的值和说明。任何一个都不含凭据。

| 变量 | 注册者 | 值 |
| --- | --- | --- |
| `DSH_SUPERAGENT_DIR`、`DSH_SUPERAGENT_NAME`、`DSH_SUPERAGENT_TICKET` | Executor | Ticket 的目录、短名和 id |
| `DSH_SUPERAGENT_BLOCKED_COMMANDS` | Executor | Executor 不得运行的命令 |
| `DSH_SUPERAGENT_GITHUB_REPOSITORY` | GitHub | Source 监视的仓库，`owner/name` |
| `DSH_SUPERAGENT_GITHUB_ACCOUNT`、`DSH_SUPERAGENT_GITHUB_COMMIT_EMAIL` | GitHub | agent 账号及其提交邮箱 |
| `DSH_SUPERAGENT_GITHUB_NUMBER`、`DSH_SUPERAGENT_GITHUB_PR_HEAD` | GitHub | 发起 Ticket 的 Issue 或 pull request，及其为 PR 时的 head ref |
| `DSH_SUPERAGENT_FEISHU_BOT`、`DSH_SUPERAGENT_FEISHU_CHAT` | Feishu | bot，以及发起 Ticket 的聊天 |

Ticket 特定的值来自其目录和起源 Trigger。其他值来自当前部署设置。只有面板能更改执行环境设置；发给主 Session 的文本不能更改已配置的 shell 命令。

worker 通过 agent 账号的 `gh` 访问 GitHub，通过 bot 的 `lark-cli` 访问 Feishu。被禁止的命令按名字调用时失败。

这些包装器与目录建立的是默认约束，不是安全边界。worker 仍可以用绝对路径执行程序。

## 合并

自动合并由**交付要求（Delivery requirements）** prompt 治理。宿主没有针对合并的决策逻辑。

默认情况下，Executor 绝不以 agent 账号启用自动合并：GitHub 会把合并归因于启用它的那个账号。交付要求必须指名另一个账号的 CLI 来做合并。没有指名时，由人来合并 pull request。

默认指令只对 Ticket 自己开出的 pull request 允许自动合并，条件是它已就绪、必需的批准覆盖 head commit、且增删行数合计少于 200 行。推送新修订之前，Executor 会撤回自动合并。

没有正文的评审——如批准——也作为 Trigger 到达，能唤醒等待评审的 Executor。这些指令治理 agent，不是 GitHub 的合并规则。要强制批准，请在分支保护中要求批准并清除过期批准。省略合并 CLI 或删除自动合并段落，即可要求人工合并。

## Ticket 如何结束

- **就绪且无 pull request：**一次 `ready` Report 将 Ticket 以完成结束。
- **无事可做：**Executor 发现没有需要人处理的工作——如一个无法复现或已被取代的请求——时报告 `dropped`。Ticket 静默结束（除非命中规则要求留言），人之后在其 Thread 上的消息可以恢复它。

### Pull request

Ticket 从其 Executor 报告之时起追随它起源的那个 pull request。它也追随从其分支开出的每个 pull request——由 Executor 报告、或被 GitHub Source 发现时。被重开的 pull request 再次被追随。

当 Ticket 开出的 pull request 没有一个还开着时，它就完成了。若它一个也没开出，则它追随的所有 pull request 都须关闭。它随后以最后一次相关关闭的结果结束，并保留其 Subscription，允许之后的人类评论恢复它。

恢复、重试或恢复性工作未完成时，关闭不结束 Ticket。若 Executor 确认或回答了它持有的跟进、但此后尚未做出非进展 Report 或在读过该消息后结束回合，它也等待。之后的 `ready` Report 在满足同一 pull request 完成规则后结束 Ticket。

聊天 Channel（渠道）收到一次关于 pull request 结果的最终通知。GitHub 已在 pull request 上显示结果。撤掉 Ticket 对某个 pull request 的 Subscription 也停止追随它。

因此"等待评审"意味着一次带 pull request 的 `ready` Report。

### 跟进与上下文 Thread

Executor 决定其 Ticket 自己 Thread 上的人类跟进。它处理范围内的请求，交回超出范围或属于其他 Ticket 的请求。一旦没有 Executor 持有该消息，它成为主 Session 的候选。除此之外，主 Session 对跟进只能应人的请求停止工作。

一个 Input 在 Session 将其纳入某个步骤、并随后做出 Report 或结束回合后算作已读。Ticket 结束时，未被确认、回答或交回的未读消息回到 Eval，如 [002 授权](002-authorization.zh.md)所述。读过而未行动的消息——如道谢——不返回。

仅作上下文追随的 Thread 仍投递消息，但不赋予 Ticket 对人类跟进的持有、也不能恢复已结束的 Ticket。这些消息可以被独立研判。

只要有一张活着的 Ticket 订阅，Source 就轮询被订阅的 Thread，并持续到最后一个 Trigger 与各订阅 Ticket 结束两者中较晚者之后的两个星期。此后，消息只经普通入口到达：GitHub 通知或飞书实时事件。

## 失败与恢复

### Executor 受阻或失败

当 Executor Session 报告 `blocked` 或 `failed`，或启动失败、报错（记录为 `failed`）时，Ticket 不接收自动 Input。

模型供应商或网络的一过性失败——HTTP 408、429、5xx，或连接被拒、重置、超时——先重试，三次、退避递增：启动重跑；回合失败的 worker 被告知继续；失败的 prepare 命令不重试。

一旦失败，CI 和 bot 的消息被记录在它上面，但不投递、也不唤醒 Session。

其工具保持可用，人可以直接在 Session 里继续。

人的消息、之后一次既非 `blocked` 也非 `failed` 的 Report、或一次重试，结束该保持状态。

它由存储的 Report 和 Input 推导，因此重启后仍保留。

### 重试

在打开的 Ticket 处于 `person / delivery`、`person / blocked` 或 `person / failed` 期间可用：一个新的 Assignment——它重新启动其 worker 并取走等待中的 Input——是这三种情况的共同解法。

人的消息到达受阻或失败的 Ticket 后，Executor 已持有该消息，于是 Ticket 显示为 working（或失败启动重跑时为 queued），不再提供重试——除非该消息的投递失败了。

重试结束当前 Assignment，并在同一 Executor Session、同一目录、同一分支、同一 pull request 中开启新的。

Executor 的模型只在创建 Session 时生效；已有的 Session 保留其模型。

### 重启

运行中的 Assignment 以"宿主已重启"结束，新的 Assignment 带着一条恢复提示启动——提示 Executor 在重复任何外部动作之前，先检查其目录、git 历史和 GitHub；最旧的 Ticket 优先。

处于等待、就绪、受阻或失败状态的 Assignment 保持原样，除非在该 Report 之后有 Input 到达，那样它们也会重新启动。

Session、目录、Subscription、等待中的消息和下文的已存储工作在重启后存活；每个 Executor Session 把哪些消息纳入了其历史的记录同样存活——一个步骤先认领消息、再在其模型调用前做这件事：被重启切断的回合纳入的消息，在有 Report 或回合结束时算作已读；被步骤认领但在纳入历史前被取消或出错切断的，算作未读。

重试或重启会把"交付给被替代 Assignment、但其 Executor Session 未取走"的消息再次交给新 Assignment——取消或被切断的步骤可能丢掉这些消息；仍留在 Session 里的一份副本（由重启保留或跨崩溃持久化）在新 Assignment 的第一条消息之前被取走，使新投递成为唯一副本。

### 已存储工作（Stored work）

dsh-superagent 在做出决定之后的每个动作——把候选、跟进或报告转交给主 Session、启动一个 Assignment、投递一个 Input——都先存储、后执行。

一次失败的转交或投递——如其 Session 无法到达——在 2 秒后重试，随后按倍增至一分钟的间隔重试；启动失败则 Ticket 失败，除非是如上的一过性失败。

每类工作只有在同一种工作连续失败三次后，才在总览的系统问题中报告错误；失败的 Input 投递显示在其 Ticket 上。

发往主 Session的转交保持顺序，通知也是；一个失败的转交拦住同种后续的转交。

### Source 失败

GitHub Source 独立读取每个 Issue、pull request 和 Thread：失败的读取把错误留在其 Thread 上，下次轮询时重读，并计入 Source 的错误——默认连续三次失败的轮询后报告；任何一次成功的轮询重置计数。

当 agent 失去私有仓库访问权时 GitHub 也回答 404，因此 404 会重试。

一个被通知的 Issue 或 pull request，若读取持续失败，在首次失败读取的一天后被丢弃；GitHub 报告其已删除时立即丢弃。此后它不再使轮询失败，其 Thread 保留错误，Source 的状态点名它。

其读取位置保持不动，因此之后的通知或对其 Thread 的轮询能读出失败读取期间错过的内容。

飞书事件消费者报告每一次失败，订阅话题的轮询把每个失败留在其 Thread 上。

GitHub 列表或飞书页面中一个格式损坏的条目被跳过，并计入 Source 的状态。

### Channel 失败

出站消息作为已存储工作保存和发送，从 5 秒起退避重试、倍增至 300 秒。

一张 Ticket 发往同一会话的消息按其排队顺序发出，因此其确认先于其后的回答或结果：一条消息在"同一 Ticket 发往同一会话的更早消息尚未发出"期间等待，直到那条连续失败三次并显示为问题。

其他 Ticket 的消息、以及不属于任何 Ticket 的消息，不为它等待。

一条有失败尝试的消息，直到发出或被撤回之前，都是系统问题。

消息只在两种情况下被丢弃：其 Source 不再监听该会话，或 Source 回答该会话永远无法接收它；Source 关闭期间，它等待。

对 GitHub 上已删除的 Issue 或已锁定的会话、对飞书上已撤回或已找不到的消息，Source 会给出这样的回答。

给一条已不存在的评审评论的回复，改为发到 pull request 的会话。

被丢弃的消息保留其记录——何时、为何被丢弃、为哪张 Ticket——因此它永不再排队；一条被丢弃的确认显示为 dropped，不是已发送。

### 暂停处理（Pause processing）

停止派发、新 Eval、Eval 超时、Input 投递和回复；已在进行中的启动等待处理恢复。

Source 继续记录 Trigger，运行中的 Executor 回合不被打断。

发给已结束 Ticket 的人的消息等待：暂停结束后的第一轮处理恢复该 Ticket——前提是其 Mandate 在当时的 Policy 下仍然成立。

进行中的 Eval 在暂停期间不超时；其截止时间顺延暂停的时长。

### 无效配置

被其种类拒绝的已存储 Source 配置，会禁用该 Source 实例。
