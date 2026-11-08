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

## 规格、工单与证据

- 规格由 GitHub 父 Issue 正文承载，子 Issue 承载实施工单；不在仓库创建 `docs/specs/` 或其他本地副本。
- 需求变化更新同一个 Issue；已成立的当前规则同步到仓库对应文档，Issue 保留讨论、状态和交付过程。
- 测试与验收证据记录到对应 Issue 评论或真实 CI／日志链接，不在仓库创建历史验收报告。
