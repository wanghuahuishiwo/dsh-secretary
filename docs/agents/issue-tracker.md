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

## 当前规格与迁移来源

小秘书一期产品基线的权威正文位于 `docs/specs/2026-11-03-secretary-product-foundation.md`，远程工单为 [GitHub Issue #1](https://github.com/wanghuahuishiwo/dsh-secretary/issues/1)。迁移前的本地工单位于 `docs/tickets/secretary-product-foundation/spec.md`。

迁移后在本地工单 Comments 追加真实 GitHub Issue URL，后续以远程 Issue 为工单权威入口；本地文件保留迁移证据，不自动删除。
