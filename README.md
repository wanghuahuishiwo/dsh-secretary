# dsh-secretary

DeepSeek Harness 的私人 Secretary Agent：以 GTD 管理承诺，以独立 Tag 分类，以 TimeBlock 管理具体日期计划、实录、计划模板和深度时间。安装入口是 [packages/secretary](packages/secretary/README.md)。

## 产品形态

- **小秘书-时间块**：DSH 右侧栏，保留当前实录、计划、深度时间三个模块的功能与交互。
- **小秘书-事项**：DSH 左侧栏全局 panel 区，进入独立空白 `main` 页面；完整 OmniFocus UI 继续原型评审。
- **Tag／Goal**：上游共享模块，不是任一产品的子页面。Goal 当前只有空 Provider。
- **Secretary Agent**：通过对话和原子 tools 操作同一批领域事实，没有独立产品 UI。

Time 与 GTD 使用独立产品入口，不提供旧聚合面板或 state／command routes；Time 浏览器通过 DSH 官方 Typert Remote 调用自己的产品 application service。规格、工单与验收证据由 [GitHub Issues](docs/agents/issue-tracker.md) 保存。

## 安装与验证

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
dsh plugin --profile <name> add <本仓>/packages/secretary
```

运行要求 DSH `0.2.1-rc.5` 或兼容的 `0.2.x`。默认业务数据在 `$DSH_HOME/storages/secretary.db`。本仓测试只使用临时 `DSH_HOME`，不修改真实用户 profile。

## 开发导航

| 你要做什么 | 去哪 |
|---|---|
| 改代码（仓库结构、行为准则） | [AGENTS.md](AGENTS.md) |
| 理解当前产品范围与交互边界 | [prd/](docs/prd/README.md) |
| 理解包、依赖、产品 API 与 Remote 终点 | [architecture.md](docs/architecture.md) |
| 理解领域事实与数据所有权 | [data-model.md](docs/data-model.md) |
| 改某个包（exports、Config、限制） | 该包自己的 README |
| 查看工单、规格与验收证据 | [GitHub Issues](docs/agents/issue-tracker.md) |
| 查看文档索引、ADR 与调研 | [docs/README.md](docs/README.md) |
