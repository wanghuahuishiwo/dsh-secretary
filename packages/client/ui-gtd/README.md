---
description: "小秘书-事项左栏入口与空白主区；供需要检查独立产品导航、页面形式或装卸生命周期的用户与维护者阅读。"
kind: "package-reference"
---

# dsh-secretary-ui-gtd

## 概述

本包在 DSH 左侧全局 panel 区提供“小秘书-事项”入口，点击后保留 DSH AppFrame 和左栏，在中央打开空白 `main`。它只提供独立页面形式，不包含事项表单或 OmniFocus 控件。

## 目录

- [使用本包](#使用本包)
- [理解实现](#理解实现)
- [模型体验](#模型体验)
- [已知限制与后续工作](#已知限制与后续工作)

-----

## 使用本包

### 组合与导航

本包由 Secretary bundle 组合，不需要单独安装。左栏展开时显示图标和“小秘书-事项”，收起时只显示图标；现有 Conversation／workspace 导航负责返回会话。

| 出口 | 作用 |
|---|---|
| `.` | 空 Host `apply`，使产品能被 Loader 独立装卸 |
| `./client` | 注册 `sidebar.panellist` 入口和空白 `main` |

本包没有 Config，也没有 Host routes、Remote namespace 或 GTD 业务 API。

## 理解实现

<details>
<summary>实现说明与源码定位</summary>

入口和页面共用稳定 id/key `dsh-secretary-gtd`。Browser 只依赖 `slots` 注册导航与页面，不 import Time 或旧聚合面板。

产品卸载只移除入口与空白页；`dsh-secretary-gtd` Service、SQLite 事实和 Agent tools 由 bundle 独立组合，不随页面卸载。

</details>

## 延伸阅读

- [GTD 领域包](../../gtd/service/README.md)
- [当前 GTD 产品范围](../../../docs/prd/gtd.md)
- [OmniFocus 原型说明](../../../design/gtd/README.md)

## 模型体验

### 模型上下文

#### 模型看到什么

无。本包不注册工具、提示词、会话事件或事项内容。

#### Token 影响

零直接 token 影响。

#### KV Cache 影响

页面打开、返回或装卸不改变模型请求。

## 已知限制与后续工作

- 中央页面当前为空白，不能在其中捕获、阅读或编辑事项。
- 不包含完整 OmniFocus 工作区、Quick Entry、Folder、Review、Repeat 或 Goal UI。
