# Aone / 公司内部 Code 平台的程序化接入通道调研

为 wayfinder 决策票 #69 调研。对比三条程序化接入通道——`a1` CLI 轮询、内网 openapi、webhook 推送——在能力、限流、实时性、凭据方式上的差别，并给出采集器接入方式推荐。

证据分两类，文中逐条标注：

- **[本机一手]**：本机 a1 CLI（v0.2.85）、`~/.team-skills/docs/integrations/aone.md`、`~/workspace/myclaw/.team-skills/.agents/adr/`、a1 二进制 strings 分析。
- **[公网推断]**：阿里云云效（Yunxiao，Aone 的公网对应物）开放 API 文档。内网形态据此推断，不是实测事实。

调研时间：2026-11-11。

## 通道一：`a1` CLI 轮询 [本机一手]

### 实体形态

- 安装位置：`/Users/wanghuahui/.local/bin/a1`，Mach-O arm64 Go 二进制（约 34MB），`a1 version` → `0.2.85 (2026-10-30)`，源码仓库 `code.alibaba-inc.com/aone/a1`（内网可访问）。
- 底层调用：二进制 strings 中出现 `aone-api.alibaba-inc.com`、`aone-open.taobao.net/open-api`、`a1-server.alibaba-inc.com/api/v1/events`、`code.alibaba-inc.com`、`authx.alibaba-inc.com` 等端点——a1 本质是内网多个 openapi 网关的聚合 CLI 封装。由此可证内网 openapi 网关真实存在（见通道二），但端点的鉴权协议、路径规范未从二进制中还原，不可直接当开放接口用。

### 查询能力（只读命令面）

| 域 | 命令 | 说明 |
|---|---|---|
| 工单 | `project workitem list/get/comment list`、`type list`、`field list/options`、`relation list`、`version list`、`sprint list` | 支持丰富过滤（`--filter` 布尔表达式、自定义字段 `--cfs`、按 `gmtCreate` 时间范围），可按更新时间排序——适合增量轮询 |
| MR | `repo mr list/view/status/comment list` | `list` 支持 `--state/--source/--target/--mine/--order-by/--sort`，`view --ci` 读门禁与 ciTasks |
| 事件流 | `events repo`、`events user` | **关键**：按仓库/用户列活动事件，`--type push|merge-request|issue|comments|members`，`--since/--until` **最大 30 天窗口**，分页 `--page`（max 100）/`--per-page`（max 100） |
| CI | `ci run get`、`ci job list/log` | 日志可流式跟随（`a1 ci job log` 有 "Poll and stream new log content until the step finishes" 能力，仅限 CI 日志） |
| 其他 | `repo`（文件/commit）、`quality`、`testcase`、`staff` 等 | |

### watch / subscribe 能力：没有面向采集器的订阅命令

- 顶层命令与 `repo` 子命令中均无 `watch`/`subscribe`/`webhook`（`a1 repo webhook` 报 unknown command）。
- 存在 `a1 daemon`（后台任务队列），帮助文本提到 "remote triggers" / "remotely triggered background work"，对应 `a1-server.alibaba-inc.com/api/v1/events`；但其用途是 skill 安装/更新等 a1 自身后台任务，不是通用的 Aone 工单/MR 事件订阅机制，采集器无法注册自定义监听。
- `~/.team-skills/docs/integrations/aone.md`（"CI 与评审观察"一节）明确约定：「执行中按合理间隔继续查询……不声称已注册后台监听」——即官方推荐的实时性模型就是**轮询**。

### 凭据方式

- `a1 auth login` 走 **NCS 认证**（authx.alibaba-inc.com；二进制含 `try-ncs` CIAP 自动引导诊断命令），`a1 auth whoami` 返回个人域账号身份（实测：source=ncs）。凭据由 CLI 托管（aone.md：「凭据由 CLI 管理」），另有 `a1 auth setup-git` 为 Git HTTPS remote 复用凭据。
- 特点：**个人身份凭据**，非服务账号/API key；采集器只能以某个人的身份运行，权限与该人一致，敏感操作（认证续期）可能需要人的动作。

### 限流

- 未见任何文档化限流值；只有数据窗口约束：`events` 30 天窗口、分页单页 max 100；`repo mr list --ci` 固定第 1 页 100 条且不自动翻页（帮助文本明示可能截断）。采集器需按翻页协议自行读全并标注未读完范围（aone.md 同样要求）。
- 轮询频率上限未定义 → 需要实测探测，并保守设置间隔。

## 通道二：内网 openapi 直连 [本机一手证实存在，形态由公网推断]

- **存在性[本机一手]**：a1 二进制 strings 中的 `aone-api.alibaba-inc.com`、`aone-open.taobao.net/open-api`、`code.alibaba-inc.com`（Code 平台 API）证明内网有 openapi 网关，a1 即其客户端。
- **形态[公网推断]**：公网对应物云效的开放 API（api.aliyun.com，`devops/2021-06-25` 版本）提供工作项（GetWorkitemFlowInfo 等）、代码库（含 Webhook 管理）等 REST 接口，鉴权为阿里云 AK/SK、STS 临时授权或个人 accessToken（见 [AddWebhook 文档](https://help.aliyun.com/zh/yunxiao/developer-reference/api-devops-2021-06-25-addwebhook)）。内网网关大概率形态类似（REST + 个人 token 或内部 SSO 签名），但**具体域名、路径、鉴权协议、限流值均未在内网文档中查到，不能当作已知事实**。
- 直连的收益：绕过 CLI 进程开销、可自控并发与分页；代价：失去 a1 的聚合/回读/安全语义，且凭据可能无法绕过个人 NCS 身份（未验证服务账号是否存在）。
- 团队约定 [本机一手]：ADR 0001/0002（`~/workspace/myclaw/.team-skills/.agents/adr/`）明确「外部 a1 skill 与 CLI 提供平台操作，本仓库不复制其命令手册」「共享平台操作说明集中在 docs/integrations/<provider>.md」——myclaw 生态已选择 a1 作为唯一平台接入层。

## 通道三：webhook 推送 [公网推断为主，内网未证实]

- [公网推断] 云效开放 API 有 `AddWebhook`（POST `/repository/{repositoryId}/webhooks/create`）：按代码库粒度订阅 push / tagPush / mergeRequest / note（评论）事件，带 `secretToken` 校验、`lastTestResult` 回读。若内网 Code 平台同源（a1 的 `events` 命令事件类型 push/merge-request/issue/comments/members 与云效 webhook 事件高度同构），则内网很可能也有仓库级 webhook 能力——**但这是同构推断，未在内网验证**。
- [本机一手·反面证据] a1 CLI 不暴露 webhook 管理命令，说明 myclaw 现有工具链无法自助注册 webhook；即便内网有此能力，也需要 Code 平台控制台操作或直连 openapi。
- 事件覆盖（若存在）：仓库/代码维度为主；工单（workitem）维度的 webhook 在云效文档中未见于代码库 API，覆盖不完整。
- 部署前提：采集器必须有内网可回调的稳定 HTTP 端点。

## 三通道对比

| 维度 | a1 CLI 轮询 | 内网 openapi 直连 | webhook 推送 |
|---|---|---|---|
| 证据强度 | 本机一手，能力实测 | 网关存在（一手）；接口形态推断 | 公网推断，内网未证实 |
| 能力 | 工单/MR/CI/事件流全量查询，`events` 提供统一活动流 | 理论上=a1 的全部后端能力，可自控 | 仓库维度事件（push/MR/评论）；工单覆盖存疑 |
| 限流 | 未文档化；窗口硬约束（30 天/页 100）；CLI 串行进程开销 | 未文档化（推断同网关） | N/A（推送侧限流） |
| 实时性 | 轮询间隔决定，分钟级合理；无订阅命令 | 同左（除非有流式接口，未发现） | 秒级推送（若存在） |
| 凭据 | 个人 NCS 身份，CLI 托管，`whoami` 可校验 | 推断为个人 token/AK 类（未验证） | secretToken 校验 + 回调端点内网可达 |
| 工程成本 | 最低：已安装、已认证、myclaw 约定背书 | 高：逆向协议、自管凭据与分页 | 高：需注册途径 + 常驻服务 + 事件缺口需轮询补 |

## 推荐

**采集器首选 `a1` CLI 轮询：以 `a1 events repo/user`（30 天窗口内增量拉取）为主变化源，落到具体对象后用 `project workitem get/comment list`、`repo mr view/status` 回读详情；凭据沿用 CLI 托管的个人 NCS 身份，轮询间隔从分钟级起步并实测限流。** 内网 openapi 直连与 webhook 均无内网一手证据支撑，作为后续升级路径（先向平台方确认 webhook 注册途径与服务账号凭据），不作为首版依赖。

## 关键不确定点

1. **内网 openapi 的对外契约未知**：`aone-api.alibaba-inc.com` / `aone-open.taobao.net/open-api` 的路径、鉴权、限流均未文档化，直连方案目前只能靠逆向，不可承诺。
2. **内网 webhook 是否存在且可自助注册**：云效 AddWebhook 是同构推断；a1 无 webhook 命令是反面证据。需要人在内网 Code 控制台确认，或问平台方。
3. **a1 轮询的限流阈值未定义**：任何频率与并发数据都没有，首版只能保守间隔 + 实测。
4. **个人身份凭据的采集器语义**：a1 绑定个人 NCS 身份，采集器以谁的身份运行、其权限边界、token 过期后的无人值守续期，均未验证。
5. **`events` 的完整性**：30 天窗口与分页截断意味着长停机后需多轮翻页补拉；issue/comments 之外的字段级变更（如工单状态流转）是否都在事件流里，未逐一验证。

## 证据来源

本机一手（2026-11-11 采集）：

- `~/.team-skills/docs/integrations/aone.md`（myclaw team-skills 对 a1 的依赖、认证、轮询模型、支持边界）
- `a1 --help` 及子命令 help：`events (repo/user)`、`daemon`、`daemon tasks`、`auth`、`project workitem list`、`repo mr list`；`a1 repo webhook`（unknown command）；`a1 version` = 0.2.85
- `which a1` = `/Users/wanghuahui/.local/bin/a1`；`file` = Mach-O arm64 Go 二进制；strings 提取的内网端点
- `a1 auth whoami -f json`（NCS 个人身份，已脱敏不录具体工号）
- `~/workspace/myclaw/.team-skills/.agents/adr/0001-aone-drivers-and-workflows.md`、`0002-project-bindings-and-platform-docs.md`

公网（推断依据，非内网事实）：

- [云效 AddWebhook——创建代码库 Webhook](https://help.aliyun.com/zh/yunxiao/developer-reference/api-devops-2021-06-25-addwebhook)
- [云效 Webhooks 设置（用户指南）](https://www.alibabacloud.com/help/zh/yunxiao/user-guide/webhooks-settings-1)
- [云效 GetWorkitemWorkflowInfo 等工作项 OpenAPI](https://www.alibabacloud.com/help/zh/yunxiao/developer-reference/getworkitemworkflowinfo-get-work-item-workflow-information)
