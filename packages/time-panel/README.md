---
description: "小秘书-时间块右栏产品；供需要使用完整 Time 画布、迁移 Remote 调用或排查产品生命周期的用户与维护者阅读。"
kind: "package-reference"
---

# dsh-secretary-time-panel

## 概述

本包提供“小秘书-时间块”右栏，让你查看和编辑实录、计划与深度时间，完成日期导航、上色、擦除、删除和 Undo。浏览器通过官方 Typert Remote 调用自己的 Host 产品服务，不直接访问 SQLite。

## 目录

- [使用本包](#使用本包)
- [理解实现](#理解实现)
- [模型体验](#模型体验)
- [已知限制与后续工作](#已知限制与后续工作)

-----

## 使用本包

### 组合与入口

本包由 Secretary bundle 组合，不单独安装到 profile。右栏标题为“小秘书-时间块”，tab id 为 `dsh-secretary-time-panel`，kind 为 `secretary-time-block`。

| 出口 | 作用 |
|---|---|
| `.` | 提供 `TimeProductService`，只注入 `time` 和 `tags` |
| `./typert` | 官方生成的 Host Remote 描述 |
| `./remote` | 官方生成的浏览器 Remote contribution |
| `./types` | 浏览器安全的请求与 projection 类型 |
| `./client` | product-local Remote 装配与右栏 UI |
| `./ui` | 纯 React UI：`TimeProduct`、`timeMath`、`TimeAdapter` 契约类型 |

本包没有 Config。Remote 签名、namespace、错误词汇或 exports 变化后，从仓库根运行 `pnpm generate:typert`，再构建并验证真实链路。

## 理解实现

<details>
<summary>实现说明与源码定位</summary>

`TimeProductService` 提供 `readWindow / paint / replaceDay / updateBlock / deleteBlock / paintDeep`，调用既有 TimeService／TagService。

源码分两层，UI 不接触宿主：

- `src/ui/`：纯显示组件、`TimeAdapter` 契约类型与纯 `timeMath`；只通过 `./ui` 公开，不 import 宿主、Remote 或产品包。
- `src/client/`：`RemoteTimeAdapter`（Remote 映射与 Undo）、`TimeClient`（DSH 生命周期）与 `hostTokens`（`--dsw-*` → `--tb-*`）。

Client 先 `$mount()` 自己的 `/remote`，再在 child Context 等待 `remote.secretaryTime` 并注册 UI。卸载按 UI → Remote 清理；child 激活失败会同时撤销 Remote。

Design 的 `design/time-block` 复用同一个 `./ui`，只把 `RemoteTimeAdapter` 换成 `FixtureTimeAdapter`，用于 OpenDesign 静态预览。

</details>

## 延伸阅读

- [TimeBlock 功能与交互](../../docs/prd/time-block.md)
- [运行架构](../../docs/architecture.md)
- [Time 领域包](../time-block/README.md)
- [Secretary bundle](../secretary/README.md)

## 模型体验

### 模型上下文

#### 模型看到什么

本包不直接添加模型输入。Secretary 的 Time 工具与产品 UI 使用同一领域 Services；工具结果由 `time-block` 包拥有。

#### Token 影响

零直接 token 影响；Agent 使用工具时由对应工具 schema 和结果计算。

#### KV Cache 影响

产品读取和 Remote 调用不改变模型请求前缀。

## 已知限制与后续工作

- 不包含 GTD、Goal、Tag 管理或设置页面。
- 不提供计划模板、Tag 写入、GTD 或开始／停止实录的额外 Remote 方法；这些领域能力不因未暴露 Remote 而被删除。
