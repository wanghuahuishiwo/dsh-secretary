---
description: "小秘书-时间块的浏览器 UI：宿主无关的 React 画布、TimeAdapter 契约与 DSH 右栏插件；供改 UI、做 OpenDesign 预览或排查客户端生命周期的用户与维护者阅读。"
kind: "package-reference"
---

# dsh-secretary-ui-time

## 概述

本包提供“小秘书-时间块”的浏览器半边：`./ui` 是与宿主无关的纯 React UI（`TimeProduct`、`timeMath`、`TimeAdapter` 契约），`./client` 是在 DSH 右侧栏注册产品页并挂载 Remote 的浏览器插件。生产右栏与 OpenDesign 预览渲染同一份 `./ui`，生产只通过 [`api/time-controller`](../../api/time-controller/README.md) 的 `./remote` 与 Host 通信。

## 目录

- [使用本包](#使用本包)
- [理解实现](#理解实现)
- [模型体验](#模型体验)
- [已知限制与后续工作](#已知限制与后续工作)

-----

## 使用本包

### 组合与入口

本包由 Secretary bundle 组合，不单独安装到 profile；bundle 的 `secretary-time-ui` 是只承载 `dsh.client` 的 roster 行。

| 出口 | 作用 |
|---|---|
| `.` | 空 Host `apply`，使浏览器功能可被 Loader 寻址 |
| `./ui` | 纯 React UI、`timeMath` 与 `TimeAdapter` 契约类型 |
| `./client` | 右栏 tab 注册、Remote 装配与 `TimeClient` |

OpenDesign 的 `design/time-block` 只 import `./ui`，用 `FixtureTimeAdapter` 提供 fixture 与主题切换，不访问生产 Remote 或 SQLite。

## 理解实现

<details>
<summary>实现说明与源码定位</summary>

`src/ui/` 是纯显示层：画布、深度周、日期选择、Tag shelf、样式 token 与 `timeMath`；只通过 `./ui` 公开，不 import 宿主、Remote 或产品包。`src/client/` 负责 `RemoteTimeAdapter`（Remote 映射与 Undo）、`TimeClient`（DSH 生命周期）和 `hostTokens`（`--dsw-*` → `--tb-*`）。

Client 先 `$mount()` controller 的 `/remote`，再在 child Context 等待 `remote.secretaryTime` 并注册 UI。卸载按 UI → Remote 清理；child 激活失败会同时撤销 Remote。

</details>

## 延伸阅读

- [TimeBlock 设计契约](../../../design/time-block/DESIGN.md)
- [TimeBlock 功能与交互](../../docs/prd/time-block.md)
- [Time Host API](../../api/time-controller/README.md)
- [Secretary bundle](../../bundle/secretary/README.md)

## 模型体验

### 模型上下文

#### 模型看到什么

无。本包不注册工具、提示词或会话事件；它只渲染 Host 已经返回的产品数据。

#### Token 影响

零直接 token 影响。

#### KV Cache 影响

页面打开、主题切换或 Remote 重载不改变模型请求前缀。

## 已知限制与后续工作

- 不含领域事实与校验；`TimeService`／`TagService` 由 bundle 独立挂载。
- 不含 GTD、Goal 或 Tag 管理页面。
