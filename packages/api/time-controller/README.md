---
description: "小秘书-时间块的 Host 产品 API 与 Agent CLI 的 Remote 面：九个产品级 Typert Remote 方法；供迁移 Remote、排查产品生命周期或核对领域调用边界的用户与维护者阅读。"
kind: "package-reference"
---

# dsh-secretary-time-controller

## 概述

本包提供“小秘书-时间块”的 Host 产品服务 `TimeProductService`：把画布需要的三模块窗口、paint／replace／update／delete、DeepTime 批量操作与显式重读暴露为七个画布 Typert Remote 方法，调用既有 `TimeService` 与 `TagService`；另提供 `TagProductService`（`secretaryTag` namespace），其 `agentInvoke` 与 `secretaryTime/agentInvoke` 一起承载退役会话工具的全部 op 面，供 `dsh-secretary` CLI 经 `/api` 调用。浏览器 UI 由 [`client/ui-time`](../../client/ui-time/README.md) 拥有，本包不含 React 或界面代码。

## 目录

- [使用本包](#使用本包)
- [理解实现](#理解实现)
- [模型体验](#模型体验)
- [已知限制与后续工作](#已知限制与后续工作)

-----

## 使用本包

### 组合与入口

本包由 Secretary bundle 组合，不单独安装到 profile。bundle 的 `secretary-time-controller` 行挂载它；浏览器 roster 行与 UI 在另一个包。

| 出口 | 作用 |
|---|---|
| `.` | 提供 `TimeProductService`，只注入 `time` 和 `tags` |
| `./typert` | 官方生成的 Host Remote 描述 |
| `./remote` | 官方生成的浏览器 Remote contribution |
| `./types` | 浏览器安全的请求与 projection 类型 |

本包没有 Config。Remote 签名、namespace、错误词汇或 exports 变化后，从仓库根运行 `pnpm generate:typert`，再构建并验证真实链路。

## 理解实现

<details>
<summary>实现说明与源码定位</summary>

`src/index.ts` 是唯一的 Host 实现：`TimeProductService` 提供 `readWindow / reloadWindow / paint / replaceDay / updateBlock / deleteBlock / paintDeep`，调用既有 TimeService／TagService；`src/types.ts` 是浏览器安全的请求与 projection 词汇。

`lib/typert.host.js`、`lib/typert.remote-client.js` 及声明由官方 Typert generator 生成，不入库。浏览器侧只在 `client/ui-time` 中通过 `./remote` 挂载，不复制第二份声明。

</details>

## 延伸阅读

- [TimeBlock 功能与交互](../../../docs/prd/time-block.md)
- [运行架构](../../../docs/architecture.md)
- [Time 领域包](../../time/time-block/README.md)
- [Time 产品 UI](../../client/ui-time/README.md)
- [Secretary bundle](../../bundle/secretary/README.md)

## 模型体验

### 模型上下文

#### 模型看到什么

本包不直接添加模型输入。Secretary 的 Time 工具与产品 UI 使用同一领域 Services；工具结果由 `time-block` 包拥有。

#### Token 影响

零直接 token 影响；Agent 使用工具时由对应工具 schema 和结果计算。

#### KV Cache 影响

产品读取和 Remote 调用不改变模型请求前缀。

## 已知限制与后续工作

- 不包含 React、样式或浏览器生命周期；UI 在 `client/ui-time`。
- 不包含 GTD、Goal、Tag 管理或设置页面。
- `agentInvoke` 承载 CLI 的全量 op 面（含计划模板与实录 start/stop）；GTD 不设 Remote——GTD 数据面是 Markdown。
