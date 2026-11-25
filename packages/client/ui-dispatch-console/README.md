---
description: "底座控制台浏览器插件：左栏一项「底座控制台」、主区整页、页内左栏四分区（Gateway／节点／事件已填，Graph 留位）、页顶 Gateway 状态与节点在线数、shell.overlay 提示。"
kind: "package-reference"
---

# dsh-secretary-ui-dispatch-console

## 概述

本包是底座控制台的壳与 Gateway／节点／事件三个分区：DSH 左栏一项「底座控制台」→ 主区整页；页顶常显 Gateway 状态与节点在线数（= 在线服务实例数）；页内左栏按对象分 Gateway / 节点 / 事件 / Graph 四区，Graph 留位。Gateway 非正常运行时经 `shell.overlay` 出一条可点入的提示，正常运行不显示。全部数据经 [`api/dispatch-controller`](../../api/dispatch-controller/README.md) 的 `secretaryDispatch` Remote，浏览器不直连 NATS。

节点与事件分区是**底层原样视图**（#94／#105）：不新增存储、不派生状态、不加工字段、不过滤、不贴标签、不计数、不藏任何东西。

| 分区 | 数据 | 刷新 |
|---|---|---|
| 节点 | `listServices`：一行一个在线服务实例（服务名、实例 ID、版本、metadata、endpoints），行内展开完整 JSON | 10 秒轮询（`nodesFeed`），页顶在线数同源 |
| 事件 | `listEvents`：stream 原样，最新在上，默认最近 200 条，滚到列表末尾再往前读 200 条；列 = 信封全部属性（事件有什么显示什么）+ `data` 完整 JSON + 引擎消费记录（无记录即空）；无过滤控件 | `watch` mark：跟随中重读最新一页；上滚离开顶部即暂停并出「N 条新事件」，点击或滚回顶部回到最新 |
| 事件详情 | 整页：完整信封 JSON + 完整消费记录 JSON，返回列表 | — |

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
| `./ui` | 纯 UI 入口：`NodesSection`、`EventList`、`EventDetail`、`eventColumns`、`PAGE_SIZE` 与契约类型（供 Node 侧渲染测试） |

左栏图标 `IconDatabaseOutlineRegular`；测试以 `page.getByRole('button', { name: '底座控制台', exact: true })` 再 `getByRole('main')` 定位。

## 理解实现

<details>
<summary>实现说明与源码定位</summary>

- `src/ui/`：纯 UI，不 import 宿主或 Remote。`contract.ts` 是 `DispatchConsoleAdapter`（readStatus/start/stop/restart/readSettings/updateSettings + listServices/listEvents/watchEvents）；`NodesSection.tsx`、`EventsSection.tsx`（含 `EventList`、`EventDetail`）是节点与事件分区；`sections.ts` 的 `SECTIONS` 是四个分区的唯一定义；`Console.tsx` 只管页顶、页内导航与内容挂载，分区主体由 `renderSection(section)` 传入；`GatewaySection.tsx` 是 Gateway 分区（原样展示 `GatewayStatus` 字段、按状态给出启动／停止／重启、`logTail` 原样展示）；`GatewayNotice.tsx` 是 overlay 提示；`styles.ts` 定义模块 token `--dc-*`。
- `src/client/`：`remoteAdapter.ts` 把契约映射到 Remote（`listServices`／`listEvents` 的 JSON 文本在这里 `JSON.parse`）；`statusFeed.ts` 是每个插件实例一份的轮询状态（页顶、分区、提示共用）；`nodesFeed.ts` 是节点列表的 10 秒轮询；`index.tsx` 负责装配与明暗信号。
- Graph 分区：在 `index.tsx` 的 `renderSection` 分支里替换 `ReservedSection`，不改壳与导航。

</details>

## 模型体验

无。本包不注册工具、提示词或会话事件。

## 已知限制与后续工作

- Graph 分区为留位文案。
- 事件详情只显示完整信封 JSON 与消费记录 JSON，没有跳转。
- 本机／远程模式切换暂未做成表单控件（直接改 `settings.json` 的 `mode`）；远程模式的地址与凭据引用可在设置页签填写。
- 浏览器验收在 bundle 的 `tests/browser.mjs`「底座控制台」用例（真实 `dsh web` + Chromium + 真实 Gateway，需要 `DSH_NATS_SERVER`）；包内 `tests/client-lifecycle.mjs`、`tests/ui-sections.mjs` 在 Node 里加载并渲染。
