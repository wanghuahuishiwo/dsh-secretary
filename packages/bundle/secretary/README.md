---
description: "可安装的 Secretary bundle：组合私人秘书 Agent、Time 右栏、GTD 左栏与共享 SQLite；供需要安装、配置、定制或排查整个产品的用户与维护者阅读。"
kind: "package-bundle"
---

# dsh-secretary

## 概述

安装本 bundle 后，profile 会获得同一个 Secretary Agent、完整的“小秘书-时间块”右栏和“小秘书-事项”左栏空白页。GTD、Tag 与 Time 事实共用 Secretary SQLite；GTD 完整工作区和 Goal 业务功能不在当前交付范围内。

## 目录

- [使用本包](#使用本包)
- [理解实现](#理解实现)
- [模型体验](#模型体验)
- [已知限制与后续工作](#已知限制与后续工作)

-----

## 使用本包

### 安装到 profile

先从仓库根构建，再把 bundle 安装到目标 profile：

```sh
pnpm build
dsh plugin --profile <name> add /绝对路径/dsh-secretary/packages/bundle/secretary
```

也可以使用 `plugin_manager` 安装本包。不要安装到正在使用的真实 profile 来试验；验收脚本始终使用临时 `DSH_HOME`。

### 安装后获得什么

- Secretary Agent 及其 GTD／Secretary 技能与 `secretary_gtd`、`secretary_tag`、`secretary_time` 工具。
- 独立 Time 右栏和 GTD 左栏入口。
- 上游空 Goal Provider，以及默认写入 `$DSH_HOME/storages/secretary.db` 的共享 SQLite。

### 配置

bundle 本身没有顶层 Config。Secretary agent 子插件支持：

| 字段 | 默认值 | 含义 |
|---|---|---|
| `defaultTimeZone` | `Asia/Shanghai` | 秘书使用的默认 IANA 时区 |
| `timePlanPath` | 未设置 | 只读人生规划文件的绝对路径 |

其他部署差异通过 profile patch 修改 `cordis.patch.yml`，不要在源码里新增隐藏默认值。

### 验证

```sh
pnpm test
pnpm --filter dsh-secretary test:browser
pnpm --filter dsh-secretary test:installed
```

`test:installed` 打包所有 workspace 包，在临时 profile 中安装最终 tarballs，并用真实 `dsh web`＋Chromium 验证冷启动、Remote 读取和持久化重开。修改 `cordis.patch.yml` 后，开发环境使用 `/dsh-reload` 并新开会话验证。

## 理解实现

<details>
<summary>装配说明与源码定位</summary>

`cordis.patch.yml` 组合共享存储、上游 Goal、GTD／Tag／Time 领域 Services、两个独立产品包和 Secretary preset。启动与重载由 Cordis `inject` 驱动，行序不承担启动语义。

patch 显式禁用宿主 `goal` Service entry，避免与项目空 Goal Provider 重复注册。所有按名字引用的运行包必须是安装 profile 的实际依赖，包括 `@deepseek-ai/dsh-storage-sqlite`。

</details>

## 延伸阅读

- [运行架构](../../docs/architecture.md)
- [当前产品范围](../../docs/prd/README.md)
- [当前数据模型](../../docs/data-model.md)
- [工单与验收操作](../../docs/agents/issue-tracker.md)

## 模型体验

### Secretary 提示词、工具与技能

#### 模型看到什么

模型看到 Secretary persona、挂载的工具 schema、显式加载的技能，以及工具返回的领域事实或错误。`defaultTimeZone` 与 `timePlanPath` 作为 Secretary 技能的当前配置后缀出现。

#### Token 影响

persona 和工具 schema 产生固定开销；技能文本在加载时计入；工具结果随返回事实变化。

#### KV Cache 影响

未变更的 persona、配置和工具定义保留可复用前缀；修改它们可能使前缀失效。技能与工具结果按对话历史追加。

## 已知限制与后续工作

- GTD 产品页当前为空白，不包含完整 OmniFocus 工作区。
- Goal 只有空 Provider，没有目标实体、工具、UI 或统计。
- 不包含时间统计、预算、对账、深度时间日期例外或旧数据自动迁移。
