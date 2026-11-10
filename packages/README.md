---
description: "本仓库 packages/ 的能力族分组、每组职责与包地图；新增或移动包时先看这一页。"
kind: "package-group"
---

# packages/ — 包地图

## 摘要

本仓库按官方 deepseek-harness 的形态组织：`packages/<能力族>/<包>`，能力族是纯容器，包恰好位于组下一层。每个包只承担一个当前角色——共享基础设施、领域 Service、Host 产品 API、浏览器产品 UI 或可安装装配；`dsh-secretary` 仍是唯一安装入口。结构调整历史见 [ADR 0010](../docs/adr/0010-package-groups-and-roles.md)。

## 分组

| 组 | 职责 |
|---|---|
| [`core/`](core/README.md) | 共享基础设施：校验、schema 约定与 skill 资源注册 |
| [`storage/`](storage/README.md) | Secretary SQLite domain 持久化路由 |
| [`goal/`](goal/README.md) | 上游 GoalService 空 Provider，只建立 seam |
| [`tag/`](tag/README.md) | 统一 TagService |
| [`gtd/`](gtd/README.md) | GTD 用户技能资源 |
| [`time/`](time/README.md) | Time 领域能力族 |
| [`api/`](api/README.md) | Host 产品 API（Typert Remote controller） |
| [`secretary/`](secretary/README.md) | Agent 自有运行代码（CLI） |
| [`client/`](client/README.md) | 浏览器产品 UI 与客户端插件 |
| [`bundle/`](bundle/README.md) | 可安装 bundle（preset、patch 与装配） |

## 包

| 包 | 能力族 | 角色 | 对外出口 |
|---|---|---|---|
| [`core/validation`](core/validation/README.md) | core | 共享输入校验 | `.` |
| [`core/tooling`](core/tooling/README.md) | core | no-config schema 与共享输出约定 | `.` |
| [`core/skill-resources`](core/skill-resources/README.md) | core | skill 资源注册 | `.` |
| [`storage/domain`](storage/domain/README.md) | storage | `secretaryStorageDomain` facility | `.` |
| [`goal/provider`](goal/provider/README.md) | goal | 空 `GoalService` Provider | `.`、`./contract` |
| [`tag/service`](tag/service/README.md) | tag | `TagService` 与契约 | `.`、`./contract` |
| [`gtd/agent`](gtd/agent/README.md) | gtd | GTD 用户技能 | `.` |
| [`time/time-block`](time/time-block/README.md) | time | `TimeService` | `.`、`./contract` |
| [`secretary/cli`](secretary/cli/README.md) | secretary | `dsh-secretary` CLI（agent 薄客户端） | `./bin` |
| [`api/time-controller`](api/time-controller/README.md) | api | `TimeProductService`、`TagProductService` 与 Remote 契约 | `.`、`./types`、`./typert`、`./remote` |
| [`client/ui-time`](client/ui-time/README.md) | client | 纯 React UI + `TimeAdapter` 契约 + 右栏插件 | `./ui`、`./client` |
| [`client/ui-gtd`](client/ui-gtd/README.md) | client | 左栏入口 + 空白 main | `.`、`./client` |
| [`bundle/secretary`](bundle/secretary/README.md) | bundle | 唯一安装入口：preset、skills、cordis.patch | `.` |

## 依赖方向

```text
bundle/secretary → client/ui-time ─┐
                                     ├→ api/time-controller → time/time-block + tag/service
bundle/secretary → client/ui-gtd     │                          └→ goal/provider → storage/domain → core/*
bundle/secretary → secretary/cli ───┘（CLI 经 /api 调用 secretaryTime/secretaryTag agentInvoke）
```

- Host 产品 API 只依赖领域 Service contract，不 import 其他产品的 UI 或插件。
- 浏览器插件只通过 `./client` 与产品自己的 Remote 契约通信，不直接接触 Host Cordis Context 或 SQLite。
- `client/ui-time/ui` 是宿主无关的纯 UI 入口：生产右栏与 `design/time-block` 共用同一份组件与契约。
- 跨包能力只经 Service Definition／Remote 契约；不 import 其他包的内部源码。

## 维护规则

- 新增包先选现有能力族；确实需要新组时，组目录只能是纯容器（无 `package.json`、无源码），并同时更新本页与根 [AGENTS.md](../AGENTS.md#仓库结构)。
- 拆包需要当前消费者证据：出现第二个消费者、或 Service Definition／Provider／Consumer 角色真正独立演化。没有证据就留在原包。
- 包名命名当前角色；接口包命名能力，实现包标明机制或环境，`local` 只在“同机执行属于契约”时使用。
