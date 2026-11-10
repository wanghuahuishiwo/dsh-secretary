# dsh-secretary-cli

`dsh-secretary` 命令行：任何 DSH 会话内的 agent 经 bash 使用小秘书的 time/tag 能力。薄客户端，无领域逻辑。

- 用法：`"$DSH_SECRETARY_CLI" <time|tag> <op> [--字段 值 ...] [--json '<对象>']`；输出 JSON，失败非零退出。
- 环境变量：`DSH_SECRETARY_URL`（host origin）、`DSH_SECRETARY_TOKEN`（launch token）、`DSH_SECRETARY_CLI`（本 CLI 路径）——由 bundle 的 `dsh-secretary` 插件注入；缺失时报错退出，绝不直写 SQLite。
- 通道：`GET /connect?token=…&interactions=none` 换 API cookie → `POST /api/secretary{Time,Tag}/agentInvoke`（官方 Connection envelope）。
- op 面与退役前的 `secretary_time` / `secretary_tag` 工具一一对应；错误码沿用领域契约（如 `secretaryTime/invalid-input`）。
- 值为整数的 flag 自动转数字；含数字文本的字符串经 `--json` 传。
