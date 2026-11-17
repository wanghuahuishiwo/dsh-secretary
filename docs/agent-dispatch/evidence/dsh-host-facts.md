# DSH 宿主形态取证（证据）

> 取证时间：2026-11-11；对象：DSH 源码 `~/workspace/deepseek-harness`（只读）。
> 用途：新地图「中心宿主进程形态」票的证据底稿（headless / SDK / boot() / ACP / 内置 schedule / webServer 远程 / 常驻 Agent 成本，逐条 path:line）。

# 中心进程宿主形态取证（只读）

**取证对象**：DSH 源码 `/Users/wanghuahui/workspace/deepseek-harness`（版本 `0.2.2-rc.1`），辅以已安装运行时 `dsh`（`0.2.2-rc.1`）的 `--help` / `--dump-default-config`。
**方法**：源码 grep + 文档阅读 + 运行时只读命令；未修改任何仓库。`--dump-default-config` 的完整输出留在 `/tmp/wf71/web-default.yml`（命令：`dsh --profile web --dump-default-config`，不启动、不监听）。
**取证件约定**：`路径:行号` 指源码 checkout 内的相对路径；「命令输出」直接贴运行结果；确实没有依据的写「未找到证据」。

---

## 1. headless 模式

**结论一句话**：`dsh headless` 是**一次性任务** runner——每次调用创建一个（或用 `--session-id` 收养一个）Agent、投递**一条**任务、打印结果后**请求进程退出**；它明确不挂 Host / HTTP server / Web runtime，因此**不能**在进程内保持一个长期存活的 Agent 接受后续多次输入，只能靠「新进程 + `--session-id`」续接同一 Session。

**证据列表**

- 语义（一次性、无 server、跑完即退）：`packages/bundle/headless/README.md:12`（"runs one dsh task … then exits — no GUI, no server, no browser … The boundary: one task per invocation, no interactive follow-up"）；`:110`（"process stays alive only for the run, opens no listening port, and exits on its own"）；Known Limitations `:183`（"One task per run — after the task is answered the process exits"）。
- 组合事实（不挂 HTTP/Web）：`packages/bundle/headless/cordis.patch.yml:2`（"It mounts no Host, HTTP server, Web runtime, or browser plugin"）。
- runner 语义：`packages/bundle/headless/src/index.ts:316`（"Run one task through one Agent and request process exit"）；`:443`（`io.exit(outcome.reason?.kind === 'completed' ? 0 : 1)`）。
- 单 Agent 生命周期：`packages/bundle/headless/src/index.ts:389-396`（`agents.create` 或 `resolveAgent`（内部 `agents.resume`，见 `:291`）→ `agent.whenIdle()`）；任务只投递一次：`:420-426`（`agent.followup(...)` 后 `await agent.whenIdle()`，循环仅等待子 Agent 结算）。
- 续聊能力（跨进程 Session 复用）：`packages/bundle/headless/README.md:77`（`--session-id` 收养持久化 Session；要求组合了 `sessionPersistence` 与 `sessionQuery`；**进程内已 live 的同 id Agent 会被拒绝**）；`:191`（收养还受 cwd、subagent session、preset 记录约束）。
- 拒绝 live Agent 的实现：`packages/bundle/headless/src/index.ts:277-283`（"a live Agent already has an owner … the one-shot runner cannot own an exclusive run interval"）。
- CLI 语法：`docs/cli-help.md:106`（`Usage: dsh --profile headless [options] [task...]`）；`:128-131`（一次任务、stdin、`--json`、`--session-id` 续接）。
- 已安装运行时输出（命令）：`dsh headless --help` → `Usage: dsh --profile headless [options] [task...]` / `Answer one task and exit; the answer goes to stdout and diagnostics to stderr.`；选项含 `--json`、`--session-id`、`--permission-mode`、`--approval-policy`、`--add-dir`。

**直接回答**：能否保持长期存活 Agent 并接受后续多次输入？**不能**（进程级）。Session 级可以「下次再拉起」：新进程用 `--session-id` 收养，但每次仍只吃一个任务。

---

## 2. SDK

**结论一句话**：`packages/sdk` 提供的是**跨进程**驱动能力——`client` 负责 **spawn 一个 `dsh` 子进程**并用换行分隔 JSON-RPC 驱动它，`server` 是在 runtime 里挂载的 stdio 服务端，`protocol` 是纯类型/传输库；因此「自建 Node daemon 内嵌 SDK」实际是 **daemon 管理一个常驻 dsh 子进程**，不是把 DSH 作为库 import 进 daemon。真正 in-process 的入口是 `@deepseek-ai/dsh-app-boot` 的 `boot()`（定位为 lower-level embedder/test 辅助）。

**结论一句话（能力面）**：能创建/恢复 Session、程序化投递 prompt、订阅事件与子 Agent 完成；`subagents`/`ptcRuntime`/`workflowEngine` 在子 runtime 内**按 profile 被组合**，但 **SDK 线协议没有对应方法**，调用方不能直接调它们，只能由模型经工具使用。

**证据列表**

- 组定位：`packages/sdk/README.md:12`（"lets another process drive a complete DeepSeek Harness runtime over newline-delimited JSON-RPC … client launches `dsh` with a named profile and ordered patches"）。
- 客户端 spawn 子进程：`packages/sdk/client/README.md:12`（"Callers may provide `dshBin`; otherwise the client resolves the same-version `@deepseek-ai/dsh` executable. The client owns the subprocess"）；`:28`（"drive a complete Harness runtime from another process"）；`:79`（"The subprocess starts lazily on first use and stays owned by the instance across `run()` calls"）。
- 依赖/版本：`packages/sdk/client/package.json:32`（`"@deepseek-ai/dsh": "workspace:*"`）；`package.json:8-9`（`engines.node >= 24.9.0`）；`packages/sdk/client/README.md:184`（不解析打包运行时，需同版本 `@deepseek-ai/dsh` 或显式 `dshBin`）。
- 最小用法（README 原文）：`packages/sdk/client/README.md:41`（`new DeepSeekHarness({ dshHome, approvalRequests: true })` + `harness.run('...').finalResponse`）；`:66`（launch spec：`profile: 'sdk'`, `dshHome`, `patches`, `provider`, `model`, `reasoningEffort`, `maxTokens`）；`:56`（`await harness.resumeSession(savedId)` 恢复持久化 Session）。
- 线协议方法（程序化投递/订阅）：`packages/sdk/protocol/README.md:40-58`——client→server：`initialize`、`session/prompt`、`session/query`、`session/resume`、`session/wait`、`session/working-directory/get|set`、`shutdown`；server→client：`approval/request`、`user-question/ask`、`session.event`、`session.status`、`session.query.completed`、`subagent.started`、`subagent.finished`。**表中无 `workflowEngine`/`ptcRuntime` 方法**。
- 限制：`packages/sdk/protocol/README.md:141`（"No cancel or session-close methods — a client abandons a turn by closing the runtime process"）；`packages/sdk/client/README.md:185-186`（RPC 超时不停止 runtime work；结果可能混入 steering/排队工作）。
- runtime 侧组合：`packages/bundle/sdk-app/README.md:12`（sdk profile 是 `dsh-base` 之上的 bundle；"The base profile owns adapters, tools, persistence, policy, settings, and credentials"）；`:65`（"No graphical client … the SDK starts no Web server"）；`:68`（"Schedules share the runtime lifetime — delivery needs a running process and its persistent Session storage"）；`:69`（自定义 profile 若不保留 `dsh-sdk-jsonrpc-server`，client 初始化失败）。
- base 里可复用的执行底座：`packages/bundle/base/cordis.patch.yml:405-414`（root 行：`ptc-runtime`（`dsh-ptc-runtime-node`）、`workflow-ptc`、`tool-workflow`）；`:530-531`（`agent-loop`）；`:138-141`（`session-persistence-jsonl`，root=`dshHomePath('sessions')`）。
- `sdk-minimal` 是另一套最小树：`packages/bundle/sdk-minimal/README.md:12`（显式 **excludes** `dsh-base`、Web、settings、managed credentials、telemetry、jobs、**subagents**），注意它没有 workflow/subagent 能力。
- in-process 选项（关键备选）：`packages/boot/app-boot/README.md:12`（"Product applications use the `dsh` launcher instead of publishing separate bins; direct-config helpers remain only for lower-level embedders and tests"）；`:36-42`（最小嵌入：`installFailLoud('dsh')` + `const ctx = await boot('dsh', configPath)`）；`packages/boot/app-boot/src/index.ts:1200`（`export async function boot(binName, absoluteConfigPath, patches?, prepare?, bareModuleBaseUrl?): Promise<Context>`）。
- 拿到 ctx 之后可用的能力：`packages/core/agent/README.md:28`（`ctx.agents` + 需 `dsh-session-projection` + driver 注册 factory，shipped driver 是 `dsh-agent-loop`）；`:32`（`ctx.agents.create()` / `ctx.agents.resume()` 返回 `AgentHandle`，`get(id)`/`list()` 查 live agent）；`packages/workflow/workflow/README.md:51`（`ctx.workflowEngine.start(...)`）；`packages/ptc-runtime/ptc-runtime/README.md:28`（`ctx.ptcRuntime` 被工具执行器与 workflow-ptc 共用）。
- 不需要 Electron：`apps/cli/src/args.ts:83-86`（`desktop` profile 由 Electron 独占，CLI 拒绝 boot/dump；反过来 SDK/headless/acp 都不依赖 Electron 进程）。
- 已安装运行时输出（命令）：`dsh sdk --help` → `Usage: dsh --profile sdk [options]` / `Serve DeepSeek Harness SDK clients over stdio JSON-RPC.` / `dsh --profile sdk     serve one SDK runtime until its client disconnects`。

**已知限制（事实清单）**

1. 版本：client 解析**同版本** `@deepseek-ai/dsh`（或 `dshBin`）；无打包运行时解析（`packages/sdk/client/README.md:184`）。
2. 依赖：Node `>=24.9.0`（`package.json:8-9`）；Python 侧另需用 `download_primary_runtime()` 准备 Node/pnpm（`packages/bundle/sdk-app/README.md:38`）。
3. 传输：stdio JSON-RPC，**不是** TCP；daemon 必须自己 spawn/持有子进程。
4. 无 cancel / session-close RPC：只能关进程（`packages/sdk/protocol/README.md:141`）。
5. 无 Electron 依赖。
6. `subagents` 只以通知形式暴露（`subagent.started/finished`），`workflowEngine`/`ptcRuntime` 无线协议入口。

---

## 3. ACP

**结论一句话**：`packages/acp` 是 **Agent Client Protocol（ACP）的 server 端（agent side）**，通过 stdio JSON-RPC 让外部程序**常驻控制**一个 dsh runtime：一个连接可并发多个 session，可 `new/list/resume/close`、prompt/cancel、收 semantic update、答权限请求；它是「标准化、自动化专用」的对照面，**有意不暴露 DSH 专有呈现**（plans/titles/commands 等）。

**证据列表**

- 组定位：`packages/acp/README.md:12`（"a server that lets programs and automation run persistent DeepSeek Harness agents over the standard Agent Client Protocol. A client can create, list, resume, and close sessions; attach standard MCP servers; select model options; send text and image prompts; receive semantic updates; answer permission prompts; and cancel work without a human in the loop"）。
- 包定位/取舍：`packages/acp/acp/README.md:12`（"automate persistent … agents through the standard ACP … intentionally omits DSH-specific presentation data and interactive UI features. Persistence supports listing, resuming, and closing sessions across process restarts, but deletion, forks, transcript replay, and additional directories are unsupported"）。
- 服务端角色 + 常驻多 session：`packages/acp/acp/README.md:60`（"One connection can run several sessions at once, each independent"）；`:55`（`pnpm dsh --profile acp` 启动 stdio server；acp profile 挂载 session persistence）。
- 方法面：`packages/acp/acp/README.md:64-71`（`initialize`、`authenticate`、`session/new`、`session/list`、`session/resume`、`session/close`、`session/set_config_option`、`session/prompt`、`session/cancel`、`session/update`、`session/request_permission`）。
- 不支持面：`packages/acp/acp/README.md:82` 与 `:177`（`session/load`、deletion、fork、additional directories、modes、commands、plans、terminals、client filesystem ops、elicitation 均被省略或拒绝；无 transcript replay）。
- 进程生命周期：`packages/bundle/acp-app/README.md:27`（stdin EOF 绑定 launcher 的 bounded shutdown；ACP connection close / SIGINT / SIGTERM 会 drain agents 与 root tree 后退出；stdout 只留 ACP JSON-RPC 帧）。
- profile 组合：`packages/bundle/acp-app/cordis.patch.yml` 全文（只 insert `acp-app-startup` 与 `acp` 两行，`provider: deepseek-official` / `model: deepseek-v4-flash`；**没有** schedule / webserver 行）。
- 已安装运行时输出（命令）：`dsh acp --help` → `Serve automation clients over Agent Client Protocol stdio.` / `dsh --profile acp     serve ACP until the client disconnects`。
- 与 SDK 的关系/取舍（事实）：
  - 同为 stdio JSON-RPC、同需外部进程持有子进程（`packages/acp/acp/README.md:12` vs `packages/sdk/client/README.md:12`）。
  - ACP 走标准 ACP v1 语义，只有受限的标准面；SDK 走 DSH 自有协议，额外支持原生 slash command（`/compact`、`/permission`、`/plan`、`/goal`）、`approval/request`、`user-question/ask`、`session.query.completed`（`packages/sdk/server/README.md:36` command-input 段；`packages/sdk/protocol/README.md:40-58`）。
  - ACP 一个连接多 session（`:60`）；SDK 通过 `session/prompt` 的 `sessionId` 分 session，同样可多 session（`packages/sdk/server/README.md:60` "creates one agent per `sessionId`"）。
  - ACP 不支持 slash commands/plans（`:177`），SDK 支持（`packages/sdk/server/README.md:36` command-input 段）。
  - 两者都不暴露 `workflowEngine`/`ptcRuntime` 编程接口。

---

## 4. 内置调度器（`packages/schedule`）

**结论一句话**：Schedule 是**宿主级、持久化**的任务服务：支持 `after/at/every/daily/weekly/cron/rrule` 七种时间类型（含 cron 与 interval），任务存 `$DSH_HOME/storages/schedule.json` 或 SQLite 的 `u_schedule_tasks`，重启后恢复并只补投**最新**一次错过的时点；它记录「下一次已提交时点 `scheduledAt`」与「上次投递回执 `lastDelivery`/`deliveryHistory`」，**但没有通用回调**——投递目标只能是 Session（`session` / `new_once` / `new`），所以「每 N 分钟跑一次」注册的是「每 N 分钟向某个 Session 投一条指令」，不是任意 host 回调。

**证据列表**

- 宿主级 + 七种时间类型：`docs/subsystems/schedule.zh.md:3`（"Schedule 独立于 Session 的激活状态存储宿主任务……七种权威时间类型：`after`、`at`、`every`、`daily`、`weekly`、`cron` 和 `rrule`"）。
- 持久化位置与加载方式：`packages/schedule/schedule/README.md:82`（"JSON uses `<DSH_HOME>/storages/schedule.json`. SQLite stores … in `u_schedule_tasks.value` … `version: 2, compatibleVersions: [1]`"）；`:84`（"Schedule loads and validates all tasks into memory at Host open"）。
- 重启行为：`packages/schedule/schedule/README.md:12`（"Tasks survive restarts, but the Host must be running to deliver them. After a restart, a recurring task sends only its latest missed occurrence"）。
- 「上次/下次」字段：`:131`（`scheduledAt` = committed occurrence，下一次投递时推进）；`:116`（`lastDelivery`、`deliveryHistory` 为可选回执/历史）；`docs/subsystems/schedule.zh.md:118-122`（回执含 `scheduledAt`、`deliveredAt`、`messageId`、`targetSessionId`；历史最多 200 条/30 天，查询用 message-id 游标）。
- interval 支持：`packages/schedule/schedule/README.md:137`（`every` = `everySeconds`，**最小 60 秒**）；`docs/subsystems/schedule.zh.md:49`（固定频率输入与追赶）。
- 投递目标只有 Session：`docs/subsystems/schedule.zh.md:76-80`（`session` / `new_once` / `new`；默认 `new_once`；**新增/替换 `new`、`new_once` 需要嵌入环境提供 Session 创建能力**；SDK 组合缺该能力时以 `invalid_rule` 拒绝）；`packages/schedule/schedule/README.md:285`（投递下限 60 秒；错过时点合并）。
- 宿主定时器 + 执行槽：`docs/subsystems/schedule.zh.md:127`（"一个 Host 定时器驱动活动任务"；复用 Session 的任务占用执行槽直到目标 Agent 空闲）；`:129`（定时与手动投递均遵守单任务 60 秒最小间隔）。
- 服务依赖（与 workflow/webServer 无关）：`packages/schedule/schedule/src/index.ts:224`（`static inject = ['agents','sessions','storageDomain','sessionPersistence']`）；`:249`（可选 `ctx.inject(['sessionController'], …)` 作为 Web 的激活/恢复后备）；`packages/schedule/schedule/package.json` 的 `peerDependencies` 中**没有** `dsh-host-webserver` / `dsh-workflow`（未找到对 workflow 引擎或 webServer 的依赖）。
- 插件注册方式（事实）：插件可通过 `ctx.schedule.create({ title, prompt, timing, target? }, actorSessionId?, signal?)` 注册（`packages/schedule/schedule/README.md:63`；`docs/subsystems/schedule.zh.md:87` task-management 表），`timing.kind:'every'` + `every_seconds>=60`；对外只有任务管理 API，`run({id})` 为立即投递（`docs/subsystems/schedule.zh.md:87` 表的 `run` 行），**未找到**「任意 host 回调/自定义 job 函数」入口。
- 组合位置：Web profile 挂载 `schedule`（`packages/bundle/web-app/cordis.patch.yml:135-136`）；SDK profile 也挂载 `schedule` 并 `inject: [sdkSessionActivation]`（`packages/bundle/sdk-app/cordis.patch.yml:57-58`）；headless/acp 的 patch 未包含 schedule（`packages/bundle/headless/cordis.patch.yml`、`packages/bundle/acp-app/cordis.patch.yml` 全文）。

---

## 5. webServer 与远程面板

**结论一句话**：中心进程若加载 Web profile，`ctx.webServer` 是**一个** `node:http`（配 `tls` 时 `node:https`）监听器 + 命名路由表，**本身不带任何认证/Origin 策略**；远程访问靠三件事：绑定一个**具体的本机非通配 IP**（`--host`，`0.0.0.0` 被拒）、目标 authority 加入 `--trusted-host`（Host/Origin fence）、以及 `dsh web` 打印的**每进程随机 launch token** 在 `GET /` 换成签名 cookie（之后 401/403）；HTTPS 用 `--tls-cert/--tls-key`（不自动签发/续期）。桌面端**没有**现成的「远程连中心」通道：Electron 只 spawn 本机 host 进程并用 IPC/HTTP 转发与 cookie 鉴权。

**证据列表**

- 载体定位与「无认证」：`docs/subsystems/web-server.md:5`（"one `node:http` server — `node:https` when `tls` is configured — providing `ctx.webServer` … It serves browsers only: Electron loads the built files over `file://` and sends fetch requests through an IPC bridge instead of this server"）；`:102`（"The carrier owns no authentication or Origin policy … The shipped `dsh web` command selects loopback by default and accepts one concrete `--host` address … its Connection plugin supplies Host/Origin checks plus browser-session authentication"）。
- 绑定约束：`docs/subsystems/web-server.md:102`（unspecified/wildcard 地址 load 时被拒）；`:106`（`ctx.webServer` 激活即 listen；`EADDRINUSE` 拒绝初始化；`register(route)` 重复 `(kind,path)` 抛错）。
- 默认 loopback / 只接受具体 `--host` / token+cookie：`packages/bundle/web-app/README.md:67`（"By default the GUI listens on loopback … `--host` … one concrete local IPv4 or IPv6 address, never a wildcard … The launch-token exchange and signed session cookie authenticate every API method and WebSocket stream"）。
- token 与 cookie 实现细节：`packages/client/connection/README.md:41`（"Each process mints a random launch token … accepts that token only on `GET /`, writes an authority-bound signed cookie … missing/expired/malformed/wrong-authority cookie returns 401 … accepts no Authorization-header token"）。
- Host/Origin fence 与 `--trusted-host`：`packages/client/connection/README.md:47`（Host 必须 loopback / 等于 bind IP / 命中 `trustedHosts`；`Origin` 必须同 authority；`sec-fetch-site: cross-site` 拒绝；失败 403；**`dsh web --host 0.0.0.0` is unsupported**）。
- TLS：`packages/bundle/web-app/README.md:69`（`--tls-cert`/`--tls-key` 必须成对，启动时读一次，失败不回落 HTTP，无 ACME/自签，证书需覆盖浏览器访问的 authority）；`docs/subsystems/web-server.md:106`（TLS 材料读一次，坏对拒绝初始化）。
- 反向代理/公网部署：`docs/user/guide/public-deployments.md:17`（代理必须保留浏览器侧 Host）、`:27`（"Neither the advertised URL nor the fence protects the listening port itself"）、`:31`（TLS 可在代理/监听器/两者终止；http 根会让 launch token 明文）；`packages/bundle/web-app/README.md:81`（`--public-url` 只做广告，不授予信任）；`:85`（打印的 URL 含进程凭据）。
- Remote/HTTP 通道现状：
  - `packages/api` 是 **Client→Host 的 Remote 层**（`packages/api/README.md:12`：typed calls/streams/forwarded events over shared Connection），不是远程网络方案；调用走 `/api/<namespace>/<method>`（`docs/api-gateway.md:126`）。
  - 桌面端：`apps/desktop/src/main.ts:531-543`（spawn 本机 `DesktopHostProcess`，`authenticateWebHost(ready.url)` 拿 cookie，`hostUrl = ready.url`）；`:815-816`（boot 返回 `streamBaseUrl: new URL(hostUrl).origin`）；`packages/client/connection/README.md:30`（静态桌面页可提供 `__DSH_TRANSPORT__.streamBaseUrl` 指向 HTTP origin，但"The desktop carrier owns authentication; setting the origin alone grants no access"）。
  - 未找到证据：桌面端连接**远程**中心的现成开关/配置（README、docs、desktop 源码里没有 remote-host 连接入口；`DesktopHostProcess` 由本机 resources 启动）。
  - 唯一现成的「远程看/控一个 Session」是实验性 LiveShare（独立 Liveshare server，非 webServer 面板）：`docs/subsystems/liveshare.md:5`（opt-in bundle，owner 把单个 Session 分享给 external viewer，viewer 通过独立 server 接入）。
- 一期只读面板的最小可行形态（组合事实，不含偏好）：
  1. **现成可用**：`dsh --profile web` 本身就是「HTTP + SPA + Remote」的完整面板；远程打开 = `--host <具体IP>` + `--trusted-host <浏览器访问的 authority>` + 用打印出的 `?token=` URL 打开（之后 cookie 鉴权）。**未找到**内置「只读模式」开关：认证通过后 Remote 方法按 `remote-access` 策略放行（`packages/client/connection/README.md:49`）。
  2. **自建只读面板**：webServer 只提供 `register(route)`（`docs/subsystems/web-server.md:106`），认证在 Connection（`ctx.connection.admit` / cookie / Peer，`packages/client/connection/README.md:49`）；即「只读」需要自己只注册 GET 路由并自行决定暴露哪些 Remote/资源，DSH 没有现成的只读面板插件（未找到证据）。
  3. 只读的现成参照是 LiveShare 的 `view` 模式（读工具白名单），但它依赖独立 Liveshare server 与 owner 分享流程（`docs/subsystems/liveshare.md:17`），不是中心进程自带的 webServer 面板。

---

## 6. 常驻 Agent 的成本与生命周期

**结论一句话**：daemon 持有活 Agent 的前置是「`dsh-agent` + `dsh-session-projection` + 一个 driver 注册的 `AgentFactory`（shipped 为 `dsh-agent-loop`）+ 持久化后端（`sessionPersistence`，base 用 JSONL，root=`$DSH_HOME/sessions`）+ 包含这些行的 profile 装配」；`ctx.agents.create()`/`resume()` 可建/恢复多个 Agent，`get/list` 查 live，Session 可跨进程 resume；空闲 Agent 的 `AgentStatus` 是 `idle`（无 driver 活动），在 `packages/core/agent/src` 与 `packages/core/agent-loop/src` 中**未找到心跳/轮询定时器**，因此空闲不产生模型请求；其常驻成本是内存中的 Session 日志/投影 + 存储写句柄 + 每 Agent 的 scoped Context，**未找到量化数据**。

**证据列表**

- 前置 1（服务与 factory）：`packages/core/agent/README.md:28`（"Mount `dsh-agent` with `dsh-session-projection` … Creating or resuming an Agent also requires a driver to register a factory; the shipped driver is `dsh-agent-loop`"）；`docs/subsystems/core.md:51`（`ctx.agents.setFactory()`，消费方不依赖具体 loop 包）。
- 前置 2（创建/恢复/多 Agent）：`packages/core/agent/README.md:32`（`ctx.agents.create()` 建新 Agent+Session；`ctx.agents.resume()` 载入持久化 Session 重建；返回 `AgentHandle`；`get(id)`/`list()` 找 live agent）；`docs/subsystems/core.md:195`（`whenIdle()` 观察整个 Agent）。
- 前置 3（持久化后端）：`packages/session/session-persistence-jsonl/README.md:43`（`root` 必填，无默认）；`packages/bundle/base/cordis.patch.yml:138-141`（`session-persistence-jsonl`，`root: !!js dshHomePath('sessions')`）；`packages/session/session-persistence/README.md:53`（`create/open('write')` 取 in-process 单写者所有权；flush 是持久化屏障）。
- 前置 4（profile 装配）：`packages/bundle/base/README.md:32`（自定义 profile 的 `package.json` 以 `@deepseek-ai/dsh-base` 为第一个 bundle）；`apps/cli/README.md:37`（profile = `package.json`（`dsh.profile.bundles`）+ `cordis.patch.yml`）；`:42-43`（层序：bundle patch → profile patch → home patch）。
- 空闲状态定义：`docs/subsystems/core.md:149`（"`idle` means no driver is active; `running` begins when waking input starts …"）；`:195`（`running` 覆盖 driver 排空区间，不等于 turn 还开着）。
- 无心跳证据（命令输出）：`grep -rn "setInterval\|setTimeout" packages/core/agent/src packages/core/agent-loop/src` → **无匹配**；`docs/subsystems/core.md:149` 的 idle 语义与「事件驱动唤醒」一致（`followup()`/`steer()` 才唤醒 driver，`inject()` 不唤醒：`packages/core/agent/README.md:58`）。
- 会话内存模型：`docs/subsystems/session.md:3`（"The in-memory, event-sourced model … a `Session` is an append-only log …"），即活 Agent 在内存里持有整条日志与派生历史。
- 多会话 + 按需 resume（跨形态事实）：
  - SDK：`packages/sdk/client/README.md:56`（`resumeSession`），`packages/sdk/server/README.md:32`（`session/resume` 经 `agents.resume()` 恢复、修复中断 turn、不发新输入；occupied session 拒绝）。
  - ACP：`packages/acp/acp/README.md:68`（`session/resume` 恢复持久化 inactive session；log 恢复不重放 update）。
  - headless：`packages/bundle/headless/README.md:77`（`--session-id` 收养；需 `sessionPersistence` + `sessionQuery`）。
- Session 日志位置：`packages/bundle/base/cordis.patch.yml:141`（JSONL root = `$DSH_HOME/sessions`）。

---

## 额外：一个 dsh 进程同时加载「中心插件 + workflow-ptc + tool-workflow + schedule + webServer」

**结论一句话**：**没有已知的「单引擎/单 context」硬冲突**，但有三条单实例约束必须遵守：一个 Context 只能有一个 `workflowEngine` 实现（第二个 engine 会大声失败）、一个 Context 只能有一个 `webServer`（且路由 `(kind,path)` 唯一）、同一 scope 内工具名唯一；Web profile 已经示范了「同进程 = webserver + schedule + ptc-runtime + 各 preset 内 workflow-ptc/tool-workflow」，它靠 **root 层把 workflow-ptc/tool-workflow 置 disabled、由 preset 在 `isolate: { workflowEngine: true }` 的隔离 realm 里各挂一份**来避免冲突。

**证据列表**

- 单 workflow 引擎：`packages/workflow/workflow/README.md:71`（"one engine serves a context at a time — loading a second engine fails loudly"）。
- 隔离 realm 机制：`packages/bundle/web-app/presets/standard.patch.yml:86-111`（`delegation` group，`isolate: { workflowEngine: true }`，内挂 `workflow-ptc` + `tool-workflow`）；`packages/preset/agent-preset-registry/src/mount.ts:61-65`（isolate realm 的服务存在 realm-private symbol 下，「correctly absent」于 root realm）；`packages/boot/app-boot/src/index.ts:758-764`（`cordis:group` 就是给一个 isolate realm 的 provider 与其 consumers 用的）。
- Web profile 的实际组合（命令输出，`/tmp/wf71/web-default.yml`）：
  - root 层被禁用：`.../web-default.yml:312-318`（`- id: workflow-ptc` … `disabled: true`；`- id: tool-workflow` … `disabled: true`），注释标明由 `@deepseek-ai/dsh-web-app` patch 覆盖 base。
  - root 层仍启用共享 PTC runtime：`.../web-default.yml:309-310`（`- id: ptc-runtime` → `@deepseek-ai/dsh-ptc-runtime-node`）。
  - preset 各自带 workflow 行：`:765` / `:781-786`（standard）、`:930-966`（ptc preset，workflow-ptc disabled、tool-executor-ptc 启用）、`:1208`（cordis preset）。
- webServer 单实例/路由唯一：`docs/subsystems/web-server.md:47`（fallback "one owner only, a second registration throws"）；`:106`（重复 `(kind,path)` 抛错；listen 失败 `EADDRINUSE` 拒绝初始化）。
- patch 覆盖 base 的机制：`packages/bundle/base/README.md:88`（"A patch replaces the targeted row's whole `config` … Later bundle layers and the user's profile `cordis.patch.yml` override rows by id, with the last write winning per row"）。
- 工具名唯一：`packages/core/tools/README.md:77`（"duplicate providers in one scope fail"）；`packages/core/tools/src/index.ts:69-70`（同 scope 重名报错；per-agent variant 走 `agent.ctx`）。
- headless 已验证「同进程 workflow-ptc + tool-workflow」：命令 `dsh --profile headless --dump-default-config | grep ...` → `- id: ptc-runtime` / `- id: workflow-ptc` / `- id: tool-workflow` 均在 root 层（无 preset 隔离），说明这条组合本身是 shipped 行为。
- schedule 与二者无依赖：`packages/schedule/schedule/src/index.ts:224`（只 inject `agents/sessions/storageDomain/sessionPersistence`）；`packages/schedule/schedule/package.json` 的 peerDeps 无 workflow/webserver。
- PTC 运行时是共享 seam：`packages/ptc-runtime/ptc-runtime/README.md:28`（`dsh-tool-executor-ptc` 用于工具程序、`dsh-workflow-ptc` 用于 workflow 编排，共用一个 `ctx.ptcRuntime`）；同一 provider 一个 context 内注册一个实现（`packages/ptc-runtime/ptc-runtime/src/index.ts:99` 注释 + `:150` `super(ctx, 'ptcRuntime')`）。
- 中心插件作为普通 root 行插入：`apps/cli/README.md:37` + `packages/bundle/base/README.md:32`（profile 的 `cordis.patch.yml` / 自定义 bundle insert 即可，不需要新 bin）。

---

## 对中心进程形态的候选比较

> 只列事实差异，不含偏好。

| 维度 | (a) 常驻 dsh 进程（自定义 headless profile） | (b) 自建 Node daemon 内嵌 SDK | (c) ACP 驱动 | (d) 一次性 dsh headless + 外部 cron |
|---|---|---|---|---|
| **常驻性** | headless bundle 本身**不常驻**：runner 投递一条任务后 `io.exit()`（`packages/bundle/headless/src/index.ts:443`；`packages/bundle/headless/README.md:12`、`:183`），且不挂 HTTP/Web（`packages/bundle/headless/cordis.patch.yml:2`）。要常驻必须替换/禁用 `headless-runner` 并引入自己的入口（`apps/cli/README.md:37` 的 profile patch 机制；required id 缺失不阻断启动，`packages/boot/app-boot/README.md:45`），即实际不再是 headless 形态。 | daemon 常驻；SDK **client 本身不常驻 runtime**，它 spawn 一个 dsh 子进程并在实例生命周期内复用（`packages/sdk/client/README.md:79`）。in-process 备选是 `boot()` 返回 `Context`（`packages/boot/app-boot/src/index.ts:1200`），此时 daemon 与 runtime 同进程。 | ACP server 常驻直到连接关闭/stdin EOF/SIGINT/SIGTERM（`packages/bundle/acp-app/README.md:27`）；一个连接可多 session（`packages/acp/acp/README.md:60`）。 | 无常驻进程：每次 cron 拉起一个进程，跑完退出，无监听端口（`packages/bundle/headless/README.md:12`、`:110`）。 |
| **程序化投递** | headless 只有 argv/stdin 一次（`docs/cli-help.md:106`；`packages/bundle/headless/README.md:77`）；若换成自定义常驻 profile，投递面取决于你挂的插件（Web 形态即 HTTP/Remote；`docs/api-gateway.md:126`）。 | 有：`run()` / `session/prompt` / `session/query`，`session.resume`，`onNotification`/`subscribeSessionTree`（`packages/sdk/client/README.md:79`；`packages/sdk/protocol/README.md:40-58`）。无 cancel/close RPC，只能关进程（`packages/sdk/protocol/README.md:141`）。 | 有：`session/prompt`、`session/update`、`session/request_permission`、`session/cancel`（`packages/acp/acp/README.md:64-71`）。 | 只能 argv/stdin 投一条；`--json` 输出 NDJSON 事件流（`packages/bundle/headless/README.md:110`）；续接靠 `--session-id`，受 cwd/preset/live-agent 约束（`packages/bundle/headless/README.md:77`、`:191`；`packages/bundle/headless/src/index.ts:277-283`）。 |
| **复用 dsh 服务** | headless 行集 = base + headless 自身两行（未挂 schedule/webserver/ACP/SDK server，`packages/bundle/headless/cordis.patch.yml` 全文）；要复用这些须在自定义 profile 里另加行。若组装成常驻 Web 形态，则 agents/ptcRuntime/workflowEngine/schedule/webServer 同处一个 Context，并受单实例约束（`packages/workflow/workflow/README.md:71`；`docs/subsystems/web-server.md:47`、`:106`；`packages/core/tools/README.md:77`）。 | 子 runtime 按 profile 组合：`sdk` profile 继承 base 的 agents、ptc-runtime、workflow-ptc、tool-workflow、tool-subagent 等行（`packages/bundle/base/cordis.patch.yml:405-414`；`packages/bundle/sdk-app/README.md:12`）；但线协议**不暴露** workflowEngine/ptcRuntime，调用方只能经模型工具间接用（`packages/sdk/protocol/README.md:40-58`）。`sdk-minimal` 明确不含 subagents/base（`packages/bundle/sdk-minimal/README.md:12`）。 | 只暴露标准 ACP 面（`packages/acp/acp/README.md:82/177`）；acp-app patch 未挂 schedule/webServer；subagents/base 工具随 base 组合但在 ACP 面不可编程调用。 | 每次进程重新装配 base+headless（headless patch 还禁用了托管 credentials，`packages/bundle/headless/cordis.patch.yml:38-46`）；跨进程只复用 Session 日志，无内存/服务复用。 |
| **部署复杂度** | 需要 dsh 安装 + `$DSH_HOME/profiles/<name>`（profile 的 `package.json` 的 `dsh.profile.bundles` + `cordis.patch.yml`）+ Node >= 24.9（仓库根 `package.json:8-9`；`apps/cli/README.md:37`）；插件走 pnpm（`dsh plugin --profile`，`apps/cli/README.md:46`）。 | 需要 **同版本** `@deepseek-ai/dsh` 可执行文件或显式 `dshBin` + 一个 DSH_HOME（`packages/sdk/client/README.md:184`）；daemon 负责子进程 spawn/回收（`:79`，dispose 阶梯在 `packages/sdk/client/src/dispose.ts`）；不需要 Electron（`apps/cli/src/args.ts:83-86` 只限制 `desktop` profile）。 | 需要 dsh 二进制 + 一个 ACP v1 客户端（`packages/acp/acp/README.md:55`；`packages/bundle/acp-app/README.md:27`）；同样由外部进程持有子进程与 stdout 纯协议约束。 | 最低：cron/外部定时器 + dsh 二进制 + 环境变量里的 API key（headless 禁用托管凭据，改用 launch env / `.env`，`packages/bundle/headless/README.md:54` Credentials 段）；无端口、无 server、无 profile 常驻。 |
| **可观测** | 取决于组合：Session JSONL 日志（`$DSH_HOME/sessions`，`packages/bundle/base/cordis.patch.yml:141`）、Web GUI/Remote、stderr、进程日志。 | `RunResult { sessionId, finalResponse, finishReason, events, notifications }`（`packages/sdk/client/README.md:79`）；子进程 stderr 保留尾部用于诊断（`:79` initialize 诊断）；session 日志仍在子 runtime 的 DSH_HOME。 | 只有标准 semantic update（committed assistant message/thought、tool 生命周期、配置变更、context usage），无 DSH 专有卡片/title/plan，无 transcript replay（`packages/acp/acp/README.md:82/177`）。 | stdout 最终答案 / `--json` NDJSON（session→status/text/thinking/tool_call/tool_result→final）、exit code 0/1、stderr 诊断、`dsh: <code>: <message>`（`packages/bundle/headless/README.md:110`）；`--json` 是投影，非完整日志（`packages/bundle/headless/README.md:192`「event stream is a projection, not the log」）。 |
| **跨实例续接** | 进程内 Agent 不共享；Session 可被新进程收养（headless 需 `sessionPersistence`+`sessionQuery`，`packages/bundle/headless/README.md:77`）。 | `harness.resumeSession(id)`（`packages/sdk/client/README.md:56`）；server 侧 `session/resume` 经 `agents.resume()`（`packages/sdk/server/README.md:32`）；occupied session 拒绝。 | `session/list` + `session/resume` 跨进程重启（`packages/acp/acp/README.md:55/67-68`）；不支持 `session/load`/transcript replay（`packages/acp/acp/README.md:82`）。 | `--session-id` 收养同一 Session（`packages/bundle/headless/README.md:77`、`:191`），cwd/preset 不匹配或进程内 live 则拒绝。 |

---

### 附：本次取证用到的只读命令

```sh
dsh --version                      # 0.2.2-rc.1
dsh --help | sed -n '1,30p'
dsh headless --help
dsh sdk --help
dsh acp --help
dsh web --help
dsh --profile web --dump-default-config > /tmp/wf71/web-default.yml
grep -rn "setInterval\|setTimeout" packages/core/agent/src packages/core/agent-loop/src
```

### 附：明确「未找到证据」的点

1. headless 能否在**同一进程内**接受第二次输入：无入口；README 明确 `one task per invocation`（`:12`、`:183`）。
2. SDK 是否有 in-process 的官方「embed API」：SDK 包内没有；只有 `dsh-app-boot` 的 `boot()` 被描述为 lower-level embedder/test 辅助（`packages/boot/app-boot/README.md:12`）。
3. 桌面端「远程连接中心」的现成通道：未找到；desktop 只 spawn 本机 host（`apps/desktop/src/main.ts:531-543`），`streamBaseUrl` 可换 origin 但认证由 desktop carrier 承担（`packages/client/connection/README.md:30`）。
4. Web 面板的内置「只读模式」：未找到。
5. 常驻 Agent 空闲时的资源消耗量化（CPU/内存/心跳）：未找到量化数据；只找到「idle = no driver active」与「agent 源码无心跳定时器」。
6. Schedule 的「任意 host 回调/自定义 job」注册入口：未找到；目标只能是 Session，且有 60 秒投递下限。

---

## 7. 多角色同宿主与桌面装配补充取证（2026-11-13）

> 本节的 DSH 源码对象仍为 `/Users/wanghuahui/workspace/deepseek-harness` 当前 worktree；根 `package.json:3` 为 `0.2.2-rc.1`，但 `git describe` 为 `dsh-v0.2.2-rc.1-811-gfcc0ad46217`，以下行号对应该 worktree，而非 tag 原样。只读核查，未修改 DSH 仓库。

### 7.1 同宿主角色组合与 isolate

- `cordis:group` + `isolate` 是 Loader 通用能力，不是 agent preset 专属：app boot 对任意 composition 注册内建 group（`packages/boot/app-boot/src/index.ts:738-764`），非 preset 的 root bundle 也直接使用（`packages/experimental/terminal-bundle/cordis.patch.yml:1-19`）。
- 不同角色 group 分别写 `isolate: { workflowEngine: true }` 会创建按 entry id 区分的 LocalRealm；字符串 label 则会加入同名共享 GlobalRealm（`vendor/loader/src/config/isolate.ts:48-67,75-100`）。同一 isolate key 上第二个同名 Service provider 会失败（`vendor/cordis/src/reflect.ts:291-305`），不同 LocalRealm 可分别持有 graph 执行引擎。
- 未列入 isolate 的 root 服务由子 realm 继承（`vendor/loader/src/config/isolate.ts:91-100,123-127`），因此 root webServer、schedule、ptcRuntime 可被角色 group 共享；provider 与其 consumers 必须留在同一 group，组外普通 Context 不会自动选中私有 realm（`packages/preset/agent-preset-registry/README.md:56-60`）。
- isolate 只隔离 service instance，不是安全或网络边界：child context 共享 `ctx.root`（`vendor/cordis/src/context.ts:16-22`），实现处于同一 `reflect.store`（`vendor/cordis/src/reflect.ts:221-223`）。未找到跨 realm 自动 RPC、自动序列化或禁止直接方法调用的机制，因此「角色间只能经 Gateway」必须由模块与客户端设计保证。
- 其他同宿主约束：nested group 仍共享 EntryTree 的 id 索引（`vendor/loader/src/config/tree.ts:18-20,43-50,88-102`；`vendor/loader/src/config/group.ts:80-82`）；同一 scope 工具重名失败（`packages/core/tools/src/index.ts:62-70,121-152`）；共享 `ctx.subagents` 的 provider 名唯一（`packages/subagent/subagent/src/index.ts:514-540`），Agent factory 单实例且 live Agent id 唯一（`packages/core/agent/src/index.ts:365-386,474-482`）。
- 生命周期并不因 realm 独立：root webServer unload 会关闭 listener 并 destroy upgraded sockets（`packages/host/webserver/src/index.ts:629-642`）；共享 Node PTC runtime unload 会 abort active runs（`packages/ptc-runtime/ptc-runtime-node/src/index.ts:31-47`）。

### 7.2 真实 WebSocket 与现有客户端的例外

- `webServer.registerUpgrade()` 支持 exact-path HTTP upgrade（`packages/host/webserver/src/index.ts:76-82,454-465,584-617`）；shipped Typert Gateway 使用 `ws.WebSocketServer({ noServer: true })`（`packages/api/gateway/src/stream-server.ts:54-95`）。但 Typert 语义是 Client→Host RPC/stream/event forwarding（`packages/api/gateway/README.md:10-13,24-41`），不是 agent-dispatch 的星形事件中转协议。
- 同进程 Typert Client 默认先尝试 `connection.rpc.open`，本地 carrier 不存在时才走 WebSocket（`packages/api/gateway/src/client/index.ts:232-245`）。因此「同宿主也走真实 Gateway 协议」需要显式客户端路径，不能依赖默认 in-process 分支。
- 未找到 realm→Gateway 自动桥接、现成 agent-dispatch 三角色 profile，或同进程真实 loopback 的专门硬冲突。

### 7.3 DSH 桌面 Host 的装配与生命周期

- 桌面 profile 固定为 `$DSH_HOME/profiles/desktop`（`apps/desktop/src/paths.ts:17-22`；`apps/desktop-host/src/index.ts:33`），没有 profile 名/目录覆盖或 `--patch` 入口（`apps/desktop-host/src/index.ts:35`）。CLI 直接 boot/dump desktop 会被拒（`apps/cli/src/args.ts:83-87,183`）。
- 桌面 Host 使用普通 profile 加载器（`apps/desktop-host/src/index.ts:28-35`），层序仍为 bundle patches → profile patch → home patch（`apps/cli/README.md:43,60`）。因此中心/节点角色可以通过 desktop profile 的 bundle 或 `cordis.patch.yml` 装载；home patch 会影响所有 profile，不作为角色装配路径。
- 带 `dsh.bundle` 的包可通过应用内 Plugins 页或 Desktop 安装的 CLI 加入 desktop profile（`apps/desktop/README.md:136-144,173`；`packages/boot/plugin-manager/src/operations.ts:86-121`）。已存在的 profile 文件不会被启动准备重置（`packages/boot/app-boot/src/profile.ts:191-217`）。
- Electron 负责 spawn 桌面 Host（`apps/desktop/src/host-process.ts:211-224`）；Host 失去父进程 IPC 会停止（`apps/desktop-host/src/index.ts:129`）。桌面 App 固定连接自己 spawn 的 Host（`apps/desktop/src/main.ts:793-803,812-817`），未找到连接外部 Host 的入口。
- 自定义 `dsh web` profile 可复用同一 Web 前端，但桌面 App 不能 attach 到它，且会失去桌面专属增强；它不是本决策需要的替代路径（`apps/desktop/README.md:38,144`；`packages/bundle/web-app/README.md:67-85`）。
- 未找到 DSH 的 service/daemon/supervisor 命令，也未找到独立 Gateway 与桌面 Host 的统一启动入口。`dsh web` 是前台进程，无 daemonize 标志（`packages/bundle/web-app/src/startup.ts:59-75`）。
