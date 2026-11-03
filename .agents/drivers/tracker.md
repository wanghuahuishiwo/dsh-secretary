---
version: 1
driver: tracker
provider: github
---

本 driver 使用本机已认证的 GitHub CLI `gh` 操作 GitHub Issues。操作前读取项目 `docs/agents/issue-tracker.md`，核对 `repository` 为明确的 `owner/repo`，并使用 `gh auth status` 核对 github.com 身份。所有 Issue 命令显式传 `--repo <owner/repo>`，不使用 CLI 默认仓库或父项目资源。

driver 是 Markdown 执行说明，由当前 agent 使用实际工具完成，不是自动运行的 API。凭据由 `gh` 管理，不写入文件或输出日志。状态准入、父子、阻塞和业务授权由调用方负责。

# read

输入：GitHub Issue number、项目绑定。

实现：执行 `gh issue view <number> --repo <owner/repo> --json number,title,body,state,labels,assignees,url,comments`。读取正文、原生 open/closed 状态、标签、负责人、评论和真实 URL，核对仓库归属。

完成：返回完整对象、真实 URL 和未读范围；裸编号不作为完整工单标识。

# list

输入：项目绑定、open/closed/all 查询与分页上限。

实现：执行 `gh issue list --repo <owner/repo> --state <范围> --limit <上限> --json number,title,state,labels,assignees,url,updatedAt`。仅查询明确仓库，保留空结果与截断区别。

完成：返回对象及实际查询范围。

# create

输入：项目绑定、标题、UTF-8 正文文件、已核实的类型与标签。

实现：先按仓库查重；使用 `gh issue create --repo <owner/repo> --title <标题> --body-file <正文文件>`。仅添加项目已映射且真实存在的标签。创建失败或结果不明时先按标题、正文和仓库回读，不重复创建。

完成：返回真实 Issue number 与 URL，并按 number 回读正文、状态和标签。

# update

输入：Issue number、明确字段及依据。

实现：先 `read` 最新对象，再用 `gh issue edit <number> --repo <owner/repo>` 只修改获授权字段；标签增减分开执行，保留其他标签。发现并发变化时重新核对，不用旧正文覆盖。

完成：逐项回读实际字段，部分成功单列。

# comment

输入：Issue number、获授权记录及 UTF-8 正文文件。

实现：使用 `gh issue comment <number> --repo <owner/repo> --body-file <正文文件>` 追加普通评论，不重写正文，不主动触发 Agent 派发。

完成：回读新增评论的作者、正文、时间与 URL。

# link

输入：两端完整 Issue 引用、父子或阻塞等明确关系。

实现：当前只使用双方正文或普通评论中的真实 GitHub Issue URL，标明 Parent / Children / Blocks / Blocked by。此降级是项目正文约定，不冒充 GitHub 原生强制依赖；不使用 `Closes #...` 等自动关闭语法。

完成：两端可读，关系类型、方向与真实 URL 一致，并明确非原生限制。

# claim

输入：Issue number、已验证 GitHub 登录名及授权依据。

实现：先核对最新负责人和评论，再用 `gh issue edit <number> --repo <owner/repo> --add-assignee <login>` 写入认领，并追加普通认领评论。文件或 API 更新均不声称原子锁；有竞争则暂停。

完成：当前承接方、认领依据和最新评论可核对。

# transition

输入：Issue number、目标原生状态或项目阶段、依据。

实现：GitHub 原生状态只用 open/closed，对应 `gh issue reopen/close`。阶段使用项目映射的真实标签，通过 `gh issue edit --add-label/--remove-label` 仅替换流程管理的阶段集合，保留其他标签。标签必须先真实查询；缺失时报告，不自动创建。写后回读，并按项目归档规则处理状态变化。

完成：回读原生状态、标签及变化依据；不将自定义阶段称为 GitHub 原生状态。

## 恢复与边界

- 任何写入失败、超时或部分成功都先按仓库和 Issue number 回读；无 number 时查重，确认未创建后才考虑重试。
- 不使用 GitHub Issue 评论冒充 MR／CI、附件上传或远程合入结果。
- 当前未声明附件、MR、CI、自动通知和跨仓库关系动作；需要时另行核对真实 `gh` 能力后扩展。
