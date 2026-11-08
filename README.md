# dsh-secretary

DeepSeek Harness 的私人 Secretary Agent：以 GTD 管理承诺，以独立 Tag 分类，以 TimeBlock 管理具体日期计划、实录、计划模板和深度时间。安装入口是 [packages/bundle/secretary](packages/bundle/secretary/README.md)。

## 产品与模块

产品模块、入口、领域服务和共享边界的唯一地图在 [AGENTS.md](AGENTS.md#产品模块)；产品范围见 [prd/](docs/prd/README.md)，设计资产见 [design/](design/README.md)。规格、工单与验收证据由 [GitHub Issues](docs/agents/issue-tracker.md) 保存。

## 安装与验证

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
dsh plugin --profile <name> add <本仓>/packages/bundle/secretary
```

运行要求 DSH `0.2.1-rc.5` 或兼容的 `0.2.x`。默认业务数据在 `$DSH_HOME/storages/secretary.db`。本仓测试只使用临时 `DSH_HOME`，不修改真实用户 profile。

## 开发导航

| 你要做什么 | 去哪 |
|---|---|
| 改代码（仓库结构、行为准则） | [AGENTS.md](AGENTS.md) |
| 做产品设计或查看交互稿 | [design/](design/README.md) |
| 理解当前产品范围与交互边界 | [prd/](docs/prd/README.md) |
| 理解包、依赖、产品 API 与 Remote 终点 | [architecture.md](docs/architecture.md) |
| 找某个包属于哪个能力族 | [packages/README.md](packages/README.md) |
| 理解领域事实与数据所有权 | [data-model.md](docs/data-model.md) |
| 改某个包（exports、Config、限制） | 该包自己的 README |
| 查看工单、规格与验收证据 | [GitHub Issues](docs/agents/issue-tracker.md) |
| 查看文档索引、ADR 与调研 | [docs/README.md](docs/README.md) |
