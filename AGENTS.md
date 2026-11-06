# dsh-secretary

个人 Secretary Agent：以 GTD 管理事项，以 TimeBlock 管理时间，通过主动准备、协商和跟进帮助用户推进结果。

## 行为准则

## 仓库结构

```text
packages/
├── core/        共享校验、工具与 skill 资源
├── storage/     Secretary SQLite domain 路由
├── goal/        上游空 Goal Provider
├── tag/         统一 Tag Service 与 Agent tools
├── gtd/         GTD Service、tools、agent 与技能资源
├── time-block/  Time Service 与 Agent tools
├── time-panel/  独立 Time 右栏、TimeProductService 与 Remote
├── gtd-panel/   独立 GTD 左栏入口与空白 main
└── secretary/   可安装 bundle、Preset 与 Secretary 技能

docs/
├── prd.md           当前产品范围与交互
├── architecture.md  当前装配、依赖、Remote 与验证入口
├── data-model.md    当前事实、关系与持久化语义
├── glossary.md      领域术语
├── adr/             架构决策历史
├── research/        调研证据
└── agents/          工单与驱动配置

design/   当前仍在评审的设计原型
scripts/  Remote 生成等仓库工具
```

命令以实际 `package.json` scripts 为准；包级入口、Config 和限制见各包 README。

## 文档

- 同一主题只保留一个当前权威文件，其他位置使用链接。
- 文档原地更新；只有 ADR 追加历史。规格、工单与验收证据由 tracker 保存。

<!-- BEGIN TEAM-SKILLS-DRIVERS -->
## 驱动

- `tracker`：操作工单前读 [工单约定](docs/agents/issue-tracker.md) 与 `.agents/drivers/tracker.md`，按其动作执行；目标仓库和资源边界以本次任务及工单约定为准。
<!-- END TEAM-SKILLS-DRIVERS -->
