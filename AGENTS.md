# dsh-secretary

个人 Secretary Agent：以 GTD 管理事项，以 TimeBlock 管理时间，通过主动准备、协商和跟进帮助用户推进结果。

当前集中验收只覆盖 Time + Tag；#6 GTD Review／Repeat／UI 与全产品 #8 暂停，现有 GTD UI 不是终稿，不实现 Goal 或统计。

**pnpm workspace，一插件一包，对齐 deepseek-harness 官方仓与 dsh-plugin-template 规范**（结构决策见 [ADR 0004](docs/adr/0004-workspace-packages.md)，supersede 0003）。

## 命令（workspace 根）

```sh
pnpm build    # 按依赖序构建全部 packages/*（esbuild，兄弟包 external）
pnpm dev      # 全部包并行 watch
pnpm test     # 各包测试；主装配测试在 packages/secretary（真实临时 SQLite）
```

改 `packages/secretary/cordis.patch.yml` 后无需重启宿主：用 `/dsh-reload`（全局技能，戳 profile 配置触发 HMR 重组，重组会从磁盘重读 bundle patch），再新开会话验证。改任何包 `src/` 则先跑 `pnpm dev` 连上 lib 监听；兄弟包改动后需触发 `packages/secretary/lib` 重载。

## 包图

```text
packages/
├── core/          dsh-secretary-core       共享件：validation / tooling / skill-resources
├── storage/       dsh-secretary-storage    secretaryStorageDomain facility（SQLite 路由）
├── gtd/           dsh-secretary-gtd        GTD Service + tools + agent + assets/（GTD 技能）
├── tag/           dsh-secretary-tag        统一 time/context Tag Service + tools
├── time-block/    dsh-secretary-time-block Time Service + tools（依赖 tag 契约）
├── panel/         dsh-secretary-panel      真实 Host routes + Web client 产品壳
└── secretary/     dsh-secretary            可安装 bundle：cordis.patch.yml + preset + secretary 技能 assets
```

依赖方向：`secretary → 各领域包 → core`；领域包之间只经契约入口（`dsh-secretary-gtd/contract` 等）引用类型与服务，不 import 对方实现。

## 装配要点

- Secretary preset 的插件底座与官方 standard preset **全量对齐**（bash/pwsh、fs/search、jobs、schedule、skill-filesystem + tool-skill、goal、plan-mode、compaction、subagent/workflow、ask-user、todo、web、present、plugin-manager），差异仅 persona 文案与末尾领域件。升级 DSH 时重新 diff standard preset，防漂移。
- 全局禁用桌面端默认注册的 `skill-office`（用户确认不用，回滚删两行）。
- `timePlanPath` 指向 `~/my_knowledge/life-plan/01-人生规划.md`，只读上下文，权威在知识库文件。
- 每个包自己的 README 记录入口、Config、数据所有权与限制；领域术语统一在 [docs/glossary.md](docs/glossary.md)。

## 数据来源

GTD、Tag 与 Time 的唯一运行事实分别存于 `secretary_gtd`、`secretary_tag` 与 `secretary_time`，默认都路由到 `$DSH_HOME/storages/secretary.db`。准备产物由文件工具保存，Action 只保存引用。DSH Schedule 只负责定时唤醒，投递不代表模型已经执行。旧 `secretary.json`、Obsidian vault 与已删除的 Statistics 包不参与运行期读写。

## 文档

分类与索引：[docs/README.md](docs/README.md)。领域术语：[docs/glossary.md](docs/glossary.md)。OmniFocus 调研：[docs/research/omnifocus.md](docs/research/omnifocus.md)。

<!-- BEGIN TEAM-SKILLS-DRIVERS -->
## 驱动

- `tracker`：操作工单、MR、CI 和附件前读取 `.agents/drivers/tracker.md`，执行其中的动作；资源按当前项目指令及本次明确输入核对。
<!-- END TEAM-SKILLS-DRIVERS -->

## Team skills

### 工单

本项目使用 GitHub Issues，目标仓库为 `wanghuahuishiwo/dsh-secretary`。操作方法由项目级 tracker driver（provider: github）提供；操作工单前读取 [GitHub 工单约定](docs/agents/issue-tracker.md)，并按约定解析和读取 driver。
