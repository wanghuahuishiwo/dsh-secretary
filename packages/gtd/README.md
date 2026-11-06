---
description: "Secretary 的 Inbox、Project 与 Action 领域服务及 Agent 工具；供需要捕获、澄清、安排、跟进或排查事项事实的用户与维护者阅读。"
kind: "package-reference"
---

# dsh-secretary-gtd

## 概述

本包让你通过 Secretary 捕获和澄清事项，维护 Project 与 Action，并查询 Next Actions、Forecast、Availability 和 effective Tags。事项状态与日期在重启后保留；完成或放弃行动不会伪造时间实录。

## 目录

- [使用本包](#使用本包)
- [理解实现](#理解实现)
- [模型体验](#模型体验)
- [已知限制与后续工作](#已知限制与后续工作)

-----

## 使用本包

### 组合与配置

本包由 Secretary bundle 挂载，不需要独立安装。

| Config 字段 | 默认值 | 含义 |
|---|---|---|
| `domain` | `secretary_gtd` | Inbox、Project 与 Action 使用的存储领域名称 |

### 入口与能力

| 入口 | 作用 |
|---|---|
| `dsh-secretary-gtd` | 提供 `ctx.gtd`、持久化和 Tag 引用检查 |
| `dsh-secretary-gtd/tools` | 注册公共工具 `secretary_gtd` |
| `dsh-secretary-gtd/agent` | 注册 user-only 的捕获与澄清 Skills |

Agent 工具覆盖 Inbox 捕获／澄清／删除，Project 与 Action 的 CRUD，Action 完成／放弃，以及 Next、Forecast、effective Tags 查询。完整输入字段由 `contract` 和工具 schema 定义。

## 理解实现

<details>
<summary>实现说明与源码定位</summary>

Inbox、Project、Action 共用持久化数字 ID。Action 只保存自己的直接 Tags；读取时累加自身、父 Action 和 Project 的 Tags，不写回后代。

`plannedAt` 是单个柔性时刻，`dueAt` 是外部约束，`completedAt` 不表示实际工作区间。Availability 和 Forecast 都从当前事实派生，不另存视图。

事实默认路由到 `$DSH_HOME/storages/secretary.db`。结构性删除会拒绝留下孤儿 Action；写失败可以留下 ID 空洞，但不能产生重号或悬空 Tag 引用。

</details>

## 延伸阅读

- [GTD 当前产品范围](../../docs/prd/gtd.md)
- [当前数据模型](../../docs/data-model.md)
- [领域术语](../../docs/glossary.md)
- [GTD 产品页面](../gtd-panel/README.md)

## 模型体验

### GTD 工具、技能与结果

#### 模型看到什么

模型看到挂载时的 `secretary_gtd` schema、显式加载的捕获／澄清 Skills，以及调用后返回的事项、派生视图或错误。

#### Token 影响

工具 schema 产生固定开销；技能文本只在加载时计入；结果 token 随返回事项和派生字段变化。

#### KV Cache 影响

未变更的定义保留可复用前缀；技能加载和工具结果按对话历史追加，不重写已有事项消息。

## 已知限制与后续工作

- 当前没有生产浏览器读写 API；独立 GTD 页面仍为空白。
- 不包含完整 Folder、Action Group、Review、Repeat 或 OmniFocus 工作区。
- Schedule、准备文件和 Time 事实由各自模块拥有，不属于本包。
