> 中文译本，仅助读；英文原文为权威版本：见原型仓库 `dsh-superagent-prototype/docs/006-deployment.md`（翻译于 2026-11-17）。

# 006 部署

本指南说明如何安装、配置与运维 dsh-superagent，涵盖账号、启动检查、升级与故障排查，内容建立在 [001 领域模型](001-domain.zh.md) 至 [005 面板](005-panel.zh.md) 的基础之上。

## 运行组件

- **一个专用的 DeepSeek Harness 配置档（profile）**，本指南中称为 `superagent`。请从 Web 配置档模板创建它。它加载 bundle，并在 `127.0.0.1` 上提供其面板。请把它与你日常工作的配置档分开：该插件会修改进程级的 `PATH` 和 git 设置，其进程需要独立重启与升级。
- **一个 Agent 的 GitHub 账号。** Agent 以该账号发表评论、推送分支并创建拉取请求，通过仅以该账号登录的 GitHub CLI 完成。
- **可选：** 一个用于聊天请求的飞书机器人。

插件配置保存状态目录与机器限制。其余设置都在面板中完成：来源（Source）用于配置仓库与账号，策略（Policy）用于配置允许列表，执行（Execution）用于配置工作目录与命令。

### 权限与隔离

bundle 为执行器（Executor）定义了 `dsh-superagent-worker`，为主 Session（Main Session）定义了 `dsh-superagent-router`。它们会出现在 DeepSeek Harness 的预设列表中，但仅供 dsh-superagent 使用。不要为个人 Session 选择它们，也不要禁用它们的配置行。应用需要它们来创建和恢复自己的 Session。

在 Web UI 中打开一个空白的托管 Session 时，可能会选中该配置档的默认预设。dsh-superagent 会在第一轮对话之前恢复其角色专属预设。

两个预设都以 `danger-full-access` 权限、以操作者的操作系统用户身份运行，并读取已订阅（Subscription）的线程（Thread）中的消息。账号包装脚本默认选择 Agent 的凭据，但它们并不隔离进程。执行器可以按路径执行程序，也可以读取操作者的主目录。如需隔离，请使用仅存放 Agent 凭据的专用操作系统账号。

## 前置条件

- Node.js 22.19+ 或 24+、pnpm、git 2.32+、Python 3.8+ 以及 tmux
- GitHub CLI（`gh`）2.48 或更高版本。来源的 CLI 字段必须指向 `gh` 或 `lark-cli` 包装脚本；宿主依赖它们的子命令与输出格式。
- github.com 上的一个仓库；不支持 GitHub Enterprise Server。若要为每个工单（Ticket）创建一份检出（checkout），请保留一份本地克隆，供 prepare 命令在其上添加工作树（worktree）。如果该仓库使用 Git LFS，请安装 `git-lfs`。
- 为 DeepSeek Harness 配置一个模型提供方。除非评估（Eval）或执行设置另行指定，dsh-superagent 使用该配置档的默认模型。
- 飞书相关：`lark-cli`（已在 1.0.90 上测试）以及一个带机器人的飞书或 Lark 应用

## 账号

### Agent 的 GitHub 账号

1. 为 Agent 创建一个 GitHub 用户账号，并授予它对仓库的写权限。GitHub App 不能充当 Agent，因为 dsh-superagent 需要读取该账号的通知。
2. 为它提供一个只使用自身凭据的 GitHub CLI：

   ```sh
   mkdir -p ~/.local/bin
   cat > ~/.local/bin/gh-agent <<'EOF'
   #!/bin/sh
   GH_CONFIG_DIR="$HOME/.config/gh-agent" exec gh "$@"
   EOF
   chmod +x ~/.local/bin/gh-agent
   gh-agent auth login
   gh-agent api user --jq .login
   ```

   以 Agent 账号登录；最后一条命令会打印其登录名。dsh-superagent 也以同样的方式读取登录名。

### 飞书机器人（可选）

1. 创建一个具备机器人能力的自建应用。授予它接收消息事件、读取并发送群消息、读取群成员的权限，然后发布应用版本。
2. 为机器人提供独立的 `lark-cli` 配置，限定为机器人身份，并创建一个包装脚本：

   ```sh
   LARKSUITE_CLI_CONFIG_DIR="$HOME/.lark-cli-dsh-superagent" lark-cli config init --app-id <cli_…> --app-secret-stdin
   LARKSUITE_CLI_CONFIG_DIR="$HOME/.lark-cli-dsh-superagent" lark-cli config strict-mode bot --global
   cat > ~/.local/bin/lark-bot <<'EOF'
   #!/bin/sh
   export LARKSUITE_CLI_CONFIG_DIR="$HOME/.lark-cli-dsh-superagent"
   exec lark-cli "$@"
   EOF
   chmod +x ~/.local/bin/lark-bot
   ```

   第一条命令从标准输入读取应用密钥。请使用独立的配置目录：`lark-cli` 对每个应用 id 只允许一个配置档，而你个人的配置中可能已包含该应用的用户登录。

   宿主会拒绝能代表用户行事的 CLI。它从机器人配置中读取应用 id、飞书/Lark 品牌以及机器人的 `open_id`。

   两份配置共用应用密钥的钥匙串条目。若只想移除机器人配置，删除它的目录即可；不要运行 `lark-cli config remove`，那会影响到共享的密钥。

## 安装

在尚无 `superagent` 配置档的机器上，执行一次下面的代码块：

```sh
npm install -g @deepseek-ai/dsh@0.2.1-rc.3
git clone <this repository> dsh-superagent && cd dsh-superagent
pnpm install && pnpm build
dsh superagent --from-default-profile web --dump-config > /dev/null
dsh plugin --profile superagent add "link:$PWD"
```

上面固定的版本是公开发布的；其他版本必须满足 `package.json` 中的 `engines.dsh`。

第四条命令从 DeepSeek Harness Web 模板创建 `~/.dsh/profiles/superagent`，第五条安装本 bundle。设置 `DSH_HOME` 可以改变默认的 `~/.dsh` 目录。

创建配置档的命令只应在全新安装时运行。如果该配置档已存在，这条命令会替换它并删除它的 `cordis.patch.yml`，其中包括机器配置。升级时不要使用它。

## 机器配置

把原型仓库的 `examples/profile.cordis.patch.yml`（`dsh-superagent-prototype/examples/`，不在本译本目录内）复制为 `~/.dsh/profiles/superagent/cordis.patch.yml`，替换原有的该文件，并替换其中每个 `<placeholder>`。若使用飞书，还要在此文件中启用 `dsh-superagent-feishu` 条目。`webserver` 条目设置面板端口。

| 键 | 是否必填 | 含义 |
| --- | --- | --- |
| `stateDir` | 是 | 绝对路径：存放数据库、锁文件、`worker-bin` 中的命令包装（shim）、Agent 的 git 配置，默认还包括 `work` 中的工单目录。升级前请备份 |
| `promptMaxChars`、`admissionContextMaxPages`、`admissionContextTimeoutMs` | 否 | 保存的提示词配置的最大长度，以及一次研判（Assessment）在多少时间内读取多少个线程分页 |

首次启动后，可在 **Settings → Deployment** 或 DeepSeek Harness 插件管理器中修改机器限制。改动无需重启即可生效。`stateDir` 无法在那里修改。无效值或未知配置键会阻止启动，日志会指出是哪个键。

## 启动与停止

```sh
scripts/dsh-superagent start
scripts/dsh-superagent status
```

`start` 在 tmux 会话 `dsh-superagent` 中运行 `dsh --profile superagent`；若使用其他配置档，则为 `dsh-<profile>`。它最多等待一分钟，等运行时（runtime）就绪或报告某项设置要求。首次运行时，它会打印缺失的设置信息。它会拒绝重复实例，包括在本脚本之外启动的实例。

`stop` 与 `restart` 请求优雅关闭，并最多等待五分钟让执行器结束。它们绝不强制终止进程，也不会动其他 tmux 会话。

`status` 打印进程 id、健康状况与设置问题。若使用其他配置档或端口，请使用 `--profile` 和 `--url`，或设置 `DSH_SUPERAGENT_PROFILE` 与 `DSH_SUPERAGENT_URL`。

`status`、`start` 和 `restart` 以以下四种退出码之一退出：

| 退出码 | 含义 |
| --- | --- |
| 0 | 服务正常运行 |
| 1 | 服务未运行、重复运行、无响应，或运行时报告错误；重启可能修复 |
| 2 | 服务在运行，但运行时之外的某个部分报错，例如某个来源或某次策略同步（`sync:<source id>`）；重启无法修复 |
| 3 | 服务在运行并等待完成设置；重启无法修复 |

仍在启动中的来源也算正常运行。设置检查未能核实情况的飞书机器人同样如此。

`status` 在 `errors` 下列出失败的部分及其详情，在 `setup` 下列出所需的设置项。`start` 与 `restart` 会把这些问题的逐行打印出来；若服务始终未能启动，它们以 1 退出。只有主动执行的 `stop` 才会暂停自动恢复。

每个配置档都把日志与控制文件存放在 `.artifacts/` 下：

- 启动日志：`dsh-superagent-<profile>-<date>-<time>-<pid>.log`，其中 pid 属于该脚本。只保留最新的 20 个。
- 控制文件：`control/profiles/<profile>/`，包含停止标记、锁与进程 id。

打开日志中打印的 URL，然后在侧边栏选择 **Superagent**。

### 每小时检查

请在平时使用的 DeepSeek Harness 配置档中创建这项每小时检查，而不要放在 `superagent` 里。这样即使 Agent 服务已停止，检查仍会运行。在该配置档中让 Agent 用下面的提示词创建一条每小时调度任务，并填入检出路径：

```text
检查 dsh-superagent：在 <checkout> 中运行 `scripts/dsh-superagent --profile superagent status`。退出码 0：什么都不做，也什么都不用说。退出码 2：不要重启；把 `errors` 下的每个部分及其详情告诉我，除非你已经就同样的部分告诉过我。退出码 3：不要重启；把 `setup` 说明的设置需求告诉我，除非你已经告诉过我。如果它报告 manually_stopped: true，就让它保持停止。否则（退出码 1）运行 `scripts/dsh-superagent --profile superagent --respect-stop restart`，它的退出方式相同：0 表示已恢复，因此什么都不用说；2 和 3 按上面所述报告；如果它以 1 退出或其他方式失败，读取最新的 .artifacts/dsh-superagent-superagent-*.log 以及 docs/006-deployment.md 的「故障排查」一节，尽你所能修复，并告诉我出了什么问题、你做了什么。
```

`--respect-stop` 会保留主动停止的状态。只有 `stop` 写入停止标记，`start` 会清除它。`restart` 不写标记，因此检查可以恢复一次关闭超时的重启。

## 设置

设置必须成功，轮询或工作才会开始。Overview 列出缺失的要求，并链接到对应的设置项。设置发生变更后会重新运行设置检查。如果你在应用之外修复了什么（例如 CLI 认证），请选择 **Check again**。

1. **来源（Sources）。** 设置 GitHub 仓库（`owner/name`）与 Agent CLI，例如 `/home/me/.local/bin/gh-agent`。请求通常通过 Agent 账号的通知到达。提及该账号的新 Issue 或新评论会在下一次轮询时到达；而通过编辑现有 Issue 正文添加的提及则不会。请改为发表新评论。飞书方面，设置机器人 CLI、群聊、每个群聊的接收模式（接收全部或仅接收提及），以及是否接收私信。
2. **策略（Policy）。** 两条示例规则可以编辑或删除。在 **On each Source** 下，添加可以请求工作的 GitHub 账号与飞书用户；在某个列表里有成员之前，任何请求都无法成为工单。使用飞书时，可以选择一个群聊，在启动时以及点击 **Sync now** 时从该群同步列表。
3. **执行（Execution）。** 目录根与一条 prepare 命令。要让每个工单都有仓库检出：

   ```sh
   git -C /home/me/src/widgets fetch --no-tags "https://github.com/$DSH_SUPERAGENT_GITHUB_REPOSITORY.git" "${DSH_SUPERAGENT_GITHUB_PR_HEAD:-HEAD}:refs/dsh-superagent/$DSH_SUPERAGENT_TICKET" &&
   git -C /home/me/src/widgets worktree add -b "agent/$DSH_SUPERAGENT_NAME" "$DSH_SUPERAGENT_DIR" "refs/dsh-superagent/$DSH_SUPERAGENT_TICKET"
   ```

   把个人 CLI（例如登录你自己账号的那个）列为被禁止的命令（blocked commands）。
4. **提示词（Prompts）。** 设置团队相关段落：GitHub 披露行、评审机器人、提交作者与自动合并条件。

### 管理 API

面板使用一个本地 HTTP API，Agent 也可以调用它。`SETUP.md` 用它保存设置，服务脚本则读取 `GET state`。

请把请求发到 `http://127.0.0.1:<port>/orchestrator/api/`，并带上 `x-orchestrator-request: 1`。Host 必须是 `127.0.0.1:<port>` 或 `localhost:<port>`。缺少该请求头，或 `Origin` 来自其他站点，都会收到 403。

经 API 保存的设置拥有与面板相同的权限。与通过主 Session 的工具所做的保存不同，它们可以修改执行环境与设置账号相关字段。

Agent 可以依赖下列路由与字段。`src/app/api.ts` 中的其他路由服务于面板，会随面板一同变化。

| 请求 | 响应 |
| --- | --- |
| `GET state` | 每个页面都会读取的内容：`setup`，含 `problem` 与 `feishuProblem`，各自为 `null` 或一个设置问题（含 `place`、`code`、`values` 与 `detail`），以及设置解析后的 `accounts`；`health`，每个部分一个条目（见下文），含 `state`（`starting`、`ready`、`paused` 或 `error`）、`detail` 与 `at`；`load`，即执行器 Session（Executor Session）的 `running` 数量、`queued` 的工单数量与 `maxWorkers`；`paused`；以及 `masterId` |
| `GET settings` | `blocks`：`policy`、`eval` 与 `executor`，各含其 `value` 与 `revision`；`sources`：来源实例，各含 `id`、`kind`、`installed`、其所属块的 `value`（`{"enabled": …, "config": {…}}`）、`revision`、其 kind 对应的表单，以及存在时的设置 `problem`；`policyVersion`；以及 `environment`，即执行环境的 `root` 与 `variables` |
| `GET sources` | 每个来源的状态：`state`（`missing`、`off`、`error`、`setup`、`starting`、`paused` 或 `ready`）、其各部分的 `health`、其设置 `problem`、最近一天的 `stats`、当天它通过 `filtered` 过滤掉的触发（Trigger），以及当天被它 `dropped` 丢弃的消息（最近的丢弃在前），每条含 `channel`、`preview`、`ticket`（`id` 与 `title`，若该消息属于某个工单）、`thread`（若存储中有）、`dropped.at` 与 `dropped.reason`、`channelGone` 或 `channelIgnored` |
| `PUT settings/<block>`，请求体 `{"value": …, "revision": n}` | 保存一个块：`saved`、该块的新 `revision`、`policy_changed` 与 `restarting`。`value` 是整个块，形式与 `GET settings` 返回的一致；缺失的键取默认值 |
| `POST executor/pause`，请求体 `{"paused": true}` 或 `false` | 暂停或恢复处理：`paused` |
| `POST setup/check` | 通过重启 dsh-superagent 重新运行设置检查：`restarting: true`。若设置没有可修复项则拒绝 |
| `POST policy-sync/<source id>` | 立即同步该来源的允许列表：`policy`，即该来源部分已保存的内容 |
| `GET prompts`、`PUT prompts`（请求体 `{"config", "baseRevision"}`） | 读取提示词配置：`current`，含 `revision` 与 `config`；`defaults`；`sections`，即团队段落（按 Session 读取的顺序）；`skillName`，即团队技能名称的模式；`builtin`，即团队技能不能使用的名称；以及 `skillPrefix`，即 Session 加载技能名称时使用的前缀。或保存它：返回新的 `revision` |
| `POST tickets/<id>/retry`、`POST tickets/<id>/stop` | 重试或停止某个工单，行为与面板一致 |

健康条目按职责分组：

| 条目 | 报告内容 |
| --- | --- |
| `runtime` | 应用本身 |
| `models` | 等待模型预算重试的 Session |
| `evals` | 最近一小时内不可用、且此后没有新的判定或驳回的评估 |
| `assessment`、`launch`、`delivery`、`relay`、`notice`、`reply` | [003 Execution](003-execution.zh.md) 中描述的已存储工作；delivery 统计等待中的工作，reply 覆盖渠道（Channel）消息 |
| `worker` | 执行器 Session 的事件处理；首次失败后出现 |
| `github`、`feishu`、`history` | 来源轮询、事件与历史恢复 |
| `sync:<source id>` | 允许列表同步 |

拒绝响应包含状态码与 `error`（其英文文本）：

- 400：无效值（`issues`，各含其 `path`）、账号检查失败（`setup`）、固定的拒绝（`code` 与 `values`），或请求体不是 JSON 或过大。
- 404：对象不存在。
- 409：修订号过期。
- 500：其他任何情况。

各配置块：

- `source:github`、`source:feishu`：`{"enabled": true, "config": {…}}`。GitHub 的配置含 `repository` 与 `cli`，以及开关 `observeIssues`、`observePulls`、`observeComments` 和 `observeCi`，默认关闭，开启后接收仓库中每个新 Issue、新拉取请求与评论，以及默认分支的 CI；飞书的配置含 `cli`、`chats`（形如 `[{"chatId": "oc_…", "name": "…", "listen": "mentions"}]`，或为 `"all"`）、`directMessages`，以及 `otherChats`（`"none"` 或 `"mentions"`）。
- `policy`：`{"rules": […], "sources": {"github": {"allowed": [{"id": "<login>"}], "bots": [{"id": "dependabot[bot]"}]}, "feishu": {"allowed": [{"id": "ou_…", "name": "…"}], "syncChat": "oc_…", "admission": {"oc_…": {"unlistedAddressed": "explicit"}}}}}`。`bots` 列出其消息可以成为推断候选的机器人。`admission` 行以群聊 id、飞书中的 `other` 或 `direct`、以及 GitHub 中的 `issues`、`pulls`、`comments` 或 `ci` 为键；未设置的单元格取其默认值（见 [002 Authorization](002-authorization.zh.md)）。
- `eval`：`mode`、`timeoutSeconds` 与 `model`。
- `executor`：`model`、`maxWorkers`、`directory`、`prepare` 与 `blockedCommands`。处理暂停是独立设置 `paused`，由 `POST executor/pause` 设置。

更改仓库或 CLI 会先运行对应的设置检查。检查失败会返回 400，详情在 `setup` 中。账号修改成功，或在设置尚待完成期间进行任何保存，都会返回 `restarting: true`。应用重启期间 API 暂时不可用。

```sh
api=http://127.0.0.1:3082/orchestrator/api
rev=$(curl -s -H 'x-orchestrator-request: 1' $api/settings | jq '.sources[] | select(.id == "github") | .revision')
curl -s -X PUT -H 'x-orchestrator-request: 1' -H 'content-type: application/json' $api/settings/source:github \
  -d "{\"value\": {\"enabled\": true, \"config\": {\"repository\": \"acme/widgets\", \"cli\": \"$HOME/.local/bin/gh-agent\"}}, \"revision\": $rev}"
```

## 设置检查

设置检查使用 DeepSeek Harness 的子进程服务，与 worker shell 相同。它会移除名称中包含 KEY、PASSWORD、SECRET 或 TOKEN 的环境变量。

设置检查会核实 GitHub 仓库与 Agent 的推送权限，写入 worker 环境，并确认 git 对 github.com 只使用 Agent 的凭据。飞书设置失败只会禁用飞书来源。

设置检查写入的进程环境：

- **命令包装**，位于 `<stateDir>/worker-bin`，排在 `PATH` 最前：`gh` 运行 Agent 的 CLI；`lark-cli` 运行机器人的 CLI；被禁止的命令会失败。包装脚本在运行目标之前，会把自己的目录从 `PATH` 中移除。
- **git 配置**，位于 `<stateDir>/worker-gitconfig`：替换操作者的全局与系统 git 配置。它选用 Agent 的 CLI 作为 github.com 的凭据助手，把 GitHub 的 SSH 地址改写为 HTTPS，并定义 Git LFS 过滤器。诸如 HTTP 代理之类的个人 git 设置不会生效。这里不设置提交身份，git 从不提示输入凭据，且 `GH_TOKEN` 与 `GITHUB_TOKEN` 会被移除。

`worker-bin` 或 `worker-gitconfig` 中若有 dsh-superagent 未写入的文件，会中止设置检查。若某个工单目录位于一个自身配置添加了凭据的 git 仓库内，该工单会失败。

## 试用

用一个在允许列表中的 GitHub 账号，创建一个 Issue，或发表一条包含 `@<agent login> <request>` 的评论。在一个轮询间隔内（默认一分钟），Overview 应显示一个工单。Agent 会确认该请求，在自己的 Session 与目录中工作，并在原对话中交付结果。飞书方面，在已配置的群聊中提及该机器人。

## 升级

1. 等到没有执行器正处于某一轮处理中。
2. 备份 `<stateDir>/orchestrator.sqlite`。
3. 运行 `git pull && pnpm install && pnpm build`。
4. 运行 `scripts/dsh-superagent restart` 并检查其状态。

重启会结束正在运行的派工（Assignment），并以恢复说明启动替代项。团队文本与被覆盖的提示词部分会保留；未被覆盖的部分跟随新的默认值。升级后请检查标有 **Default updated** 的部分。

被较新版本迁移过的数据库无法被旧版本打开。因此回滚依赖升级前的备份。升级 DeepSeek Harness 本身之后，请重启正在运行的实例，好让面板加载匹配的产物。

### Agent 预设

worker 与 router 预设会在 5 秒后把 shell 命令移到后台。Session 没有对应预设就无法加载。使用这些 Session 期间，请保留 `cordis.patch.yml` 中的 `dsh-superagent-worker` 与 `dsh-superagent-router` 行；否则恢复会以 `agent-preset/not-found` 失败。

## 故障排查

设置问题会以面板所用语言显示在概览页，并附修复链接；日志与 API 显示下面的英文原文。

| 症状 | 原因与修复 |
| --- | --- |
| `The agent GitHub CLI is not set.` | 在 GitHub 卡片上设置 Agent 的 CLI |
| `The agent GitHub CLI was not found.` | 设置包装脚本的绝对路径，或 `PATH` 上的某个命令名 |
| `The agent GitHub CLI cannot read its account` | 用 `auth login` 登录该包装脚本 |
| `@… cannot read …` 或 `@… cannot push to …` | 授予 Agent 账号对仓库的写权限 |
| `The GitHub Source names no repository.` | 在 GitHub 卡片上设置仓库，格式为 `owner/name` |
| 某个工单失败并报 `The prepare command failed: …` | 输出会指明原因，例如克隆路径错误；修正命令后重试该工单 |
| `git does not read the github.com credential configuration dsh-superagent writes` | 安装 git 2.32 或更高版本 |
| 某个工单失败并报 `The git configuration of the repository in … sets …` | 从克隆的 `.git/config` 中移除所指定的凭据或 `http.*.extraheader` 设置 |
| `… was not written by dsh-superagent` | 把所指定的文件移出 `<stateDir>/worker-bin` 或 `<stateDir>/worker-gitconfig`，或另选一个 `stateDir` |
| `The bot lark-cli allows user identities` | 把飞书来源指向仅限机器人的配置，参见上文飞书机器人一节 |
| `The bot lark-cli does not work.` 或 `The bot identity of app … is …` | 检查配置中的应用 id 与密钥 |
| `The Feishu bot is not a member of the chat.` | 在该群聊的设置中把机器人加入群；下次尝试即可成功 |
| `status` 以 2 退出 | 某个部分报错，重启无法修复：`errors` 指出每个部分（如管理 API 下所列）及其详情；各部分恢复后会自行清除其条目 |
| `status` 以 3 退出 | 设置检查在等待：`setup` 说明缺少什么，概览页会链接到对应的设置项 |
| `status` 以 1 退出 | 服务未运行、重复运行、无响应，或运行时报告错误；输出与最新日志会说明是哪一种 |
| `… timed out after 90 s`、`… was stopped by …`、`… exited with code …` 或 `… could not run: …` | 某个 CLI 失败但未打印原因；以操作者用户身份手工运行该程序，查看它自己的消息 |
| 面板提示 dsh-superagent 无响应 | 它正在重启，或因配置问题未能启动；DeepSeek Harness 日志会指出原因 |
| 日志出现 `dsh-superagent configuration has keys it does not use` | 移除所指定的键；该消息会说明每个值现在位于何处 |
| 日志提示插件与正在运行的 dsh 不兼容 | 安装一个位于 `engines.dsh` 范围内的 DeepSeek Harness 版本 |
| DeepSeek Harness 升级后，面板显示 "Failed to load plugins" | 重启正在运行的实例 |
| 提及之后没有任何反应 | 检查作者是否在来源的允许列表中、来源是否已开启、处理是否未暂停。在 GitHub 上，通过编辑 Issue 正文添加的提及不会被接收；请在评论中提及 Agent |
