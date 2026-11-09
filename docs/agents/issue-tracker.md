# GitHub Issues 工单约定

本项目使用 **GitHub Issues**，唯一目标仓库为 `wanghuahuishiwo/dsh-secretary`，代码仓库 `origin` 也指向同一仓库。工单编号必须同时保存仓库、Issue number 和真实 URL；裸编号不足以定位。

操作前使用项目根解析并读取自定义 tracker driver（`provider: github`）：

```sh
python3 ~/.team-skills/scripts/driver.py resolve --project-root <项目根> --name tracker --provider github
```

## 依赖与资源边界

- 使用本机 `gh` 和已认证的 github.com 账号；所有 Issue 命令显式传 `--repo wanghuahuishiwo/dsh-secretary`。
- 首次及认证变化时使用 `gh auth status` 核对身份，凭据不写入项目文档或日志。
- 创建前只在目标仓库查重；写入失败或超时先回读，不重复创建。
- 不将 GitHub Issues 评论称为 MR、CI、附件上传或远程合入结果；这些能力未在当前 driver 中声明。

## 类型、状态与阶段

- GitHub 原生状态使用 `open / closed`，不创造其他原生状态值。
- `Type: req` 使用现有 `enhancement` 标签；`Type: bug` 使用现有 `bug` 标签。类型是项目标签约定，不冒充 GitHub 原生工单类型。
- `ready-for-agent` 使用同名 Issue 标签，Issue 原生状态保持 `open`。
- 所需标签必须先通过 `gh label list --repo wanghuahuishiwo/dsh-secretary` 真实查询；缺失时报告，不自动创建，也不用其他标签代替。
- 状态与阶段更新只修改映射集合，保留其他标签；认领和更新不构成原子锁。
- 父子与阻塞使用真实 Issue URL 的正文／评论约定，不使用自动关闭语法，也不冒充 GitHub 原生强制依赖。

## 需求生命周期

一张需求 Issue 贯穿全程，设计是它的一个阶段，不另建设计票。状态标签只回答一个问题：下一步该谁动（HITL 还是 AFK）；阶段进展靠评论与 PR 记录，不用标签表达。

- 未打标签：刚提的想法，一句话需求必然先走 HITL（`/grill-design` 拷问），无需初始状态标签。
- `needs-info`：拷问中缺信息，等用户回答；回答后回到未打标签。
- `ready-for-human`：设计已由 `/design` 产出（commit、范围记录在 Issue 评论），等人确认。
- `ready-for-agent`：设计已确认或无需设计，已规格化；进入 `/to-spec` 或直接实现。
- 交付完成后关闭；不做的事项用 `wontfix`。

写回规则：需求与设计补充写正文，只补不改原有结构；技术相关的决策、结论、待决追加为评论。

优先级是独立于状态的一根轴，用 `P1` / `P2` / `P3` 标签表达，与状态标签自由组合。

工作类型也是独立的轴，用于 agent 分发路由：`design` 路由到 OD worker（`/design`，改 `design/` 与共享组件），`dev` 路由到实现 worker（`/implement`，改 `packages/`）。类型标签只在 `ready-for-agent` 时参与分发；HITL 状态（`needs-info` / `ready-for-human`）不分发，无需类型标签。

## 规格、工单与证据

- 规格由 GitHub 父 Issue 正文承载，子 Issue 承载实施工单；不在仓库创建 `docs/specs/` 或其他本地副本。
- 需求变化更新同一个 Issue；已成立的当前规则同步到仓库对应文档，Issue 保留讨论、状态和交付过程。
- 测试与验收证据记录到对应 Issue 评论或真实 CI／日志链接，不在仓库创建历史验收报告。
