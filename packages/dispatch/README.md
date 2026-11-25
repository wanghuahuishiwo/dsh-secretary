---
description: "agent-dispatch 底座的共享逻辑：Gateway 管理；角色插件集自后续工单起加入。"
kind: "package-group"
---

# dispatch/

## 摘要

agent-dispatch 底座的共享逻辑。组目录是纯容器：不包含 `package.json` 或源码，包恰好在组下一层。仓库级包地图见 [packages/README.md](../README.md)，底座设计见 [foundation.md](../../docs/agent-dispatch/foundation.md)。

本组的包不依赖 Cordis 运行时（零运行时依赖，只用 Node 内置模块），因此命令行、Host 插件与测试都能直接 import 同一段逻辑。

## 包

| 包 | 名称 | 角色 |
|---|---|---|
| [`gateway/`](gateway/README.md) | `dsh-secretary-dispatch-gateway` | 无状态 Gateway（nats-server）管理：settings、NKey、派生配置、状态探测、start/stop/restart、CLI 契约 |

## 约束

- 包只做无状态逻辑，不常驻、不持有进程句柄；Cordis 装配留在 `api/`。
- 中心／节点是角色插件集，按 `cordis:group` + `isolate` 行装配在 bundle，不在本组定义。
