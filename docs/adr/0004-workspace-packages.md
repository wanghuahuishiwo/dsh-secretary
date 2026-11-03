# ADR 0004 — pnpm workspace 多包结构（supersede 0003）

- 状态：已接受（2026-10-29）
- 取代：[ADR 0003](0003-single-bundle-multi-plugin.md)

## 背景

ADR 0003 选择「单仓单包、多 subpath plugins」：一个 package.json、根级 `src/<模块>/`、subpath exports（`dsh-secretary/gtd` 等）。运行一年内暴露两个问题：

1. **结构漂移**：模块 README/GLOSSARY 混在 `src/` 代码目录里，技能资产挂在仓根 `skills/`，与 dsh-plugin-template 规范和 deepseek-harness 官方仓「一插件一包、src 纯代码、assets 放资源」的形态不一致。
2. **演进受限**：preset 插件底座已与官方 standard preset 全量对齐，领域包边界逐步清晰，单包 subpath 装配让包间依赖只能靠路径约定。

## 决策

改为 pnpm workspace（对齐官方仓与模板 Tier 2 形态）：

```text
packages/
├── core/          dsh-secretary-core：validation / tooling / skill-resources 共享件
├── storage/       dsh-secretary-storage：secretaryStorageDomain facility
├── gtd/           dsh-secretary-gtd：Service + tools + agent + assets/（GTD 技能）
├── tag/           dsh-secretary-tag：统一 time/context Tag Service + tools
├── time-block/    dsh-secretary-time-block：Time Service + tools
├── panel/         dsh-secretary-panel：Host routes + Web client
└── secretary/     dsh-secretary：可安装 bundle（cordis.patch.yml + preset + secretary 技能 assets）
```

- 安装入口仍是**一个 bundle**：`packages/secretary`，用户视角无变化。
- 插件名从 subpath（`dsh-secretary/gtd`）改为包名（`dsh-secretary-gtd`、`dsh-secretary-gtd/tools`）。
- 兄弟包在 esbuild `external`（正则 `/^dsh-secretary-/`），运行时由 workspace 链接解析，不重复打包。
- 每包独立 build/test/README；仓库级文档（architecture、glossary、ADR）留在根 `docs/`。
- 提前于模板 Tier 2 判据（尚无第二个消费者）执行，理由是**对齐官方仓形态**这一用户明确要求，见本 ADR。

## 后果

- desktop profile 的 `link:` 与 HMR watch 路径需指向 `packages/secretary`；兄弟包改动后需触发重载。
- 发布 `pnpm pack` 在 `packages/secretary`，workspace 兄弟包需随包分发（dependencies `workspace:*` 在 publish 时替换为版本号）。
- 升级 DSH 时继续 diff standard preset，防止底座漂移（与 ADR 0003 的维护规则一致）。
