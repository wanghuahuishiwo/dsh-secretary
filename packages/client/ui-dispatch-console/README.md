---
description: "底座控制台浏览器插件：左栏一项「底座控制台」、主区整页、页内左栏四分区（Gateway 已填，节点／事件／Graph 留位）、页顶 Gateway 状态与 shell.overlay 提示。"
kind: "package-reference"
---

# dsh-secretary-ui-dispatch-console

## 概述

本包是底座控制台的壳与 Gateway 分区：DSH 左栏一项「底座控制台」→ 主区整页；页顶常显 Gateway 状态（与节点在线数位，数据待基础通信工单）；页内左栏按对象分 Gateway / 节点 / 事件 / Graph 四区，本期只填 Gateway（概览 + 设置两个页签），其余留位。Gateway 非正常运行时经 `shell.overlay` 出一条可点入的提示，正常运行不显示。全部数据经 [`api/dispatch-controller`](../../api/dispatch-controller/README.md) 的 `secretaryDispatch` Remote，3 秒轮询。

## 目录

- [使用本包](#使用本包)
- [理解实现](#理解实现)
- [模型体验](#模型体验)
- [已知限制与后续工作](#已知限制与后续工作)

-----

## 使用本包

| 出口 | 作用 |
|---|---|
| `.` | 空 Host `apply`（浏览器 roster 行） |
| `./client` | `$mount` Remote，注册 `main`（key `dsh-secretary-dispatch-console`）、`sidebar.panellist`（order 21，label「底座控制台」）、`shell.overlay`（id `secretary-dispatch.gateway-notice`） |

左栏图标 `IconDatabaseOutlineRegular`；测试以 `page.getByRole('button', { name: '底座控制台', exact: true })` 再 `getByRole('main')` 定位。

## 理解实现

<details>
<summary>实现说明与源码定位</summary>

- `src/ui/`：纯 UI，不 import 宿主或 Remote。`contract.ts` 是 `DispatchConsoleAdapter`（readStatus/start/stop/restart/readSettings/updateSettings）；`sections.ts` 的 `SECTIONS` 是四个分区的唯一定义；`Console.tsx` 只管页顶、页内导航与内容挂载，分区主体由 `renderSection(section)` 传入；`GatewaySection.tsx` 是 Gateway 分区（原样展示 `GatewayStatus` 字段、按状态给出启动／停止／重启、`logTail` 原样展示）；`GatewayNotice.tsx` 是 overlay 提示；`styles.ts` 定义模块 token `--dc-*`。
- `src/client/`：`remoteAdapter.ts` 把契约映射到 Remote；`statusFeed.ts` 是每个插件实例一份的轮询状态（页顶、分区、提示共用）；`index.tsx` 负责装配与明暗信号。
- 后续分区：在 `index.tsx` 的 `renderSection` 分支里替换 `ReservedSection`，不改壳与导航。

</details>

## 模型体验

无。本包不注册工具、提示词或会话事件。

## 已知限制与后续工作

- 节点在线数只留数位（`—`），节点／事件／Graph 分区为留位文案。
- 本机／远程模式切换暂未做成表单控件（直接改 `settings.json` 的 `mode`）；远程模式的地址与凭据引用可在设置页签填写。
- 尚未接入浏览器验收测试（`tests/browser.mjs`）；当前以 `tests/client-lifecycle.mjs` 在 Node 里加载并渲染。
