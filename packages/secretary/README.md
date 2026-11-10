# secretary 能力族

小秘书 Agent 自有运行代码的能力族：随包发布、由 Agent 直接使用的资产。与 `bundle/secretary`（纯装配）相对；建立于 #51（CLI 通道）。

| 包 | 名称 | 角色 |
|---|---|---|
| [`cli/`](cli/README.md) | `dsh-secretary-cli` | `dsh-secretary` CLI：连接运行中 host 的 agent 薄客户端 |

- CLI 不含领域逻辑：`/connect` 换凭据后经 `/api` 调 `secretaryTime` / `secretaryTag` 的 `agentInvoke` Remote；端点与凭据由 host 插件经 `ctx.shellEnv.register` 注入。
