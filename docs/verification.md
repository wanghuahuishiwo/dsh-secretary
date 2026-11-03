# 曳光弹验证记录

- 日期：2026-10-28（Asia/Shanghai）
- 产品基线：GTD + TimeBlock + Secretary Agent，SQLite，不兼容旧 Action 模型
- 运行宿主：DSH `0.2.1-rc.3`，隔离 `DSH_HOME` 与独立 Web profile

## 1. 公开工具与真实 SQLite

命令：

```sh
pnpm build
node --test tests/tracer.mjs
```

结果：5 个测试全部通过，覆盖：

1. 捕获 → 澄清 → Project／Action → TimeBlock → 改期 → actual／Completed → 55 分钟分类统计；actual 已存在时改期仍保持原值。
2. 完整关闭后，使用同一 SQLite 文件重开并读回 GTD 与 TimeBlock。
3. Secretary 与 GTD Skills 的调用边界、bundle 行、专用 SQLite facility，以及公开 Service Definition 与实现的类型同一性。
4. Action 的 Defer／Due／预计时长更新与清除、Availability 派生，以及非法预计时长的拒绝。
5. 在 Action 写入与 Inbox 删除两个故障点注入失败，验证澄清会补偿删除部分写入并保留原 Inbox。

E2E 发现的 `undefined` 可选字段导致 lossless JSON 工具输出失败，已转为回归断言并修复；普通改期的同类边界也已覆盖。组合测试还固定了扁平工具 schema，`action.update` 的嵌套误用会显式失败。

## 2. 发布与安装

- `pnpm pack` 的 tarball 包含全部 subpath entries、Skills、patch 与 package manifest。
- 在隔离 profile 安装后，`pnpm peers check` 无问题。
- `--dump-config` 确认全局 GTD／TimeBlock、Secretary preset、SQLite 与 `tool-ask-user`。小秘书使用独立 `secretaryStorageDomain`，不覆盖宿主全局 `storage-domain` 的默认 backend。
- 多入口构建启用 shared chunks，公开 `GtdService`／`TimeBlockService` 与运行实现的类型身份一致。
- 真实 DSH 进程创建 `$DSH_HOME/storages/secretary.db`，`units` 同时包含 `secretary_gtd` 和 `secretary_time`。

## 3. 真实 AgentLoop 与 Schedule

使用 keyless scripted adapter，仅替换模型边界；Web Host、AgentLoop、preset、Tools、Schedule、文件写入和 SQLite 均使用真实实现。

会话 `secretary-e2e-flow-2` 中观察到：

1. 用户消息触发 GTD 捕获与澄清，创建 Project、Action 和 TimeBlock。
2. `schedule_create` 创建准备唤醒，TimeBlock 保存对应 reminder ID。
3. 后续 inbox 消息具有 `source.kind = schedule`，携带同一 Action 与准备提示。
4. Agent 读取 Action，实际写出产品评审准备清单，并把文件引用保存为 `preparationResultRef`。
5. 用户确认后，Agent 写入 actual、`completedAt` 和分类统计，最终回复实际投入 55 分钟。
6. SQLite 最终保持 Action `status = completed`，TimeBlock 同时保留 planned、actual、`actualSource = user_reported` 和准备引用。

这证明目标装配与主动工作链路可以真实运行。改用专用 `secretaryStorageDomain` 后，又在 `secretary-e2e-review` 中重复验证了主动准备、actual 与 Completed。脚本生成的准备文件属于测试产物，验证后已删除。

## 4. 真实 Web 进程重启

完成上述链路后关闭并重新启动同一隔离 Web profile：

- 原 Session 历史仍可读取，共 113 条事件，最后为第三轮 `turn/end`。
- GTD 与 TimeBlock 仍可从同一 SQLite 文件读取。
- Secretary preset 继续可用于新会话。

## 5. 真实模型验收

凭据从当前 DSH credential store 安全复用到隔离环境，未输出密钥。真实模型为 `zai-coding-cn / glm-5.3`，不是 scripted adapter。

会话 `secretary-real-e2e-2` 完整验证：

1. 首次运行发现 `oneOf` 工具 schema 导致该 provider 连续生成空参数。改为 `op` 枚举的扁平 schema 后，Project、Action、TimeBlock 均成功创建。
2. Schedule 到点后，真实模型生成并读取评审准备清单，随后通过 `ask_user_question` 发起结构化确认；用户在 Web 问题卡片中选择“按计划进行”。
3. 验收还发现模型把准备引用误嵌套在 `action` 中，却向用户声称已经关联。随后为 `action.update` 增加顶层参数引导和嵌套误用显式拒绝，并在 Skill 中明确 reminder 归 TimeBlock、准备引用归 Action。
4. 真实模型在原会话中纠正两处引用，最终 SQLite 保存 `preparationResultRef`、`preparationReminderId`、actual、`actualSource = user_reported` 和 `completedAt`。
5. 统计返回本次实际投入 55 分钟；模型还识别出同名“工作”分类可能造成统计拆分并提醒用户，体现了超出机械工具调用的上下文价值。

真实 Web 重启后，该会话能够恢复并继续完成纠正与后续工具调用。

## 6. 验证边界

上述结果证明当前场景下的真实模型对话、主动准备、结构化确认和持久化链路可用，但不代表所有模型、所有事项类型或所有对话分支都具有相同表现。当前仍未验证独立 UI、IM、Obsidian 迁移、Repeat、Project Review 或真实 OmniFocus 数据兼容。
