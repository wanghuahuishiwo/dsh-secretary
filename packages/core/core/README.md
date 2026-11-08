---
description: "本仓领域包共用的校验、工具注册与技能资源内部库；供需要定位共享代码或判断复用边界的维护者阅读。"
kind: "package-library"
---

# dsh-secretary-core

## 概述

本库让兄弟包复用输入校验、工具注册和技能文件加载，而不各自复制这些通用实现。它是纯代码依赖，不是 Cordis 插件，不拥有业务事实，也不应承载 GTD、Time 或 Tag 的领域规则。

## 目录

- [使用本包](#使用本包)
- [理解实现](#理解实现)
- [模型体验](#模型体验)
- [已知限制与后续工作](#已知限制与后续工作)

-----

## 使用本包

### 何时使用

仅当本仓另一个包需要已经实现的共享 helper 时按 subpath 引入。不要把它安装到 profile，也不要为了集中业务规则而新增入口。

```ts
import { parseInstant } from 'dsh-secretary-core/validation'
import { registerTool } from 'dsh-secretary-core/tooling'
import { registerSkill } from 'dsh-secretary-core/skill-resources'
```

本库没有插件 `Config`、根 `apply` 或独立运行时生命周期。

## 理解实现

<details>
<summary>实现说明与源码定位</summary>

- `validation`：通用输入、时刻和区间校验，不替代领域不变式。
- `tooling`：在调用方 Host Context 注册工具及公共输出约定。
- `skill-resources`：读取调用方显式指定的技能文件并注册。
- 各调用方拥有自己的数据、权限、配置和生命周期。

</details>

## 延伸阅读

- [仓库运行架构](../../docs/architecture.md)
- [当前数据模型](../../docs/data-model.md)

## 模型体验

### 模型上下文

#### 模型看到什么

本库不直接提供模型输入。只有调用方通过自己的工具、技能或提示词暴露能力时，模型才会间接看到结果。

#### Token 影响

没有直接 token 影响；调用方的工具 schema、技能文本和结果各自计算。

#### KV Cache 影响

本库不改变请求前缀；是否复用由调用方实际生成的模型输入决定。

## 已知限制与后续工作

- 仅供本 workspace 内部复用，不提供独立安装或插件入口。
- 不拥有数据库、文件路径、业务规则、工具注册表或 UI。
