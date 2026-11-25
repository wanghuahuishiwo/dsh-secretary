---
description: "agent-dispatch 底座能力族：Gateway 管理、基础通信、graph 执行引擎；角色插件集自后续工单起加入。"
kind: "package-group"
---

# dispatch/

## 摘要

agent-dispatch 底座能力族。组目录是纯容器：不包含 `package.json` 或源码，包恰好在组下一层。仓库级包地图见 [packages/README.md](../README.md)，底座设计见 [foundation.md](../../docs/agent-dispatch/foundation.md)。

## 包

| 包 | 名称 | 角色 |
|---|---|---|
| [`gateway/`](gateway/README.md) | `dsh-secretary-dispatch-gateway` | 无状态 Gateway（nats-server）管理：settings、NKey、派生配置、状态探测、start/stop/restart、CLI 契约 |
| [`messaging/`](messaging/README.md) | `dsh-secretary-dispatch-messaging` | 基础通信插件：NKey 连接 Gateway、CloudEvents 信封（DSH profile）、nodeId 身份、stream 与 durable consumer 在线创建、Transactional Outbox 可靠发布与持久受理后才 ACK、Transactional Outbox 可靠发布与持久受理后才 ACK |
| [`engine/`](engine/README.md) | `dsh-secretary-dispatch-engine` | graph 执行引擎内核：节点注册表、入口、事件历史与重放 |

## 约束

- 跨包只依赖 Service contract，不 import 其他包的内部源码。
- `gateway` 只做无状态逻辑，不常驻、不持有进程句柄，零运行时依赖（命令行、Host 插件与测试直接 import）；Cordis 装配留在 `api/`。
- `messaging` 是业务插件唯一的收发入口：seed 只在该插件进程内解析；它向 `gateway/` 写各角色的 permissions 文件，由 `gateway` 在启动时渲染。
- 中心／节点是角色插件集，按 `cordis:group` + `isolate` 行装配在 bundle，不在本组定义。
