# dsh-secretary

个人 Secretary Agent：读取现有时间规划，通过对话创建具体 Action，到点前准备材料，并保存实际时间与完成结果。

规范遵循 dsh-plugin-template 仓的《插件项目规范》（目录结构、构建契约、测试分层）；本文件只写本插件特有的事实。

## 命令

```sh
pnpm build    # node build.mjs -> lib/index.js
pnpm test     # tests/contracts.mjs（built lib/，plain Node）
```

## 结构约定

- `src/index.ts`：宿主入口，装配 store、工具与技能。
- `src/store.ts`：唯一写入口；`storageDomain` 为 `secretary`，表为 `actions` 与 `time_categories`；变更经共享 FIFO 串行执行。
- `src/commands.ts`：Agent 与未来 UI 共用的命令接口。
- `src/tools.ts`：`secretary_action` 与 `secretary_time_category` 工具；Action 操作为 `list/get/create/update/complete/delete`，分类操作为 `list/get/create/update/delete`。
- `skills/`：Secretary Agent 行为；DSH `schedule_*` 只负责定时唤醒。
- 首版没有 client，也没有独立的 Schedule／Execution／Budget 模型。

## 数据来源

Action 与 TimeCategory 由本仓插件自持，运行期真相存于 `$DSH_HOME/storages/secretary.json`。已有的人生与时间规划是 Agent 只读上下文，权威仍在原知识库文件，不复制进插件存储。

## 文档

分类与索引：[docs/README.md](docs/README.md)。
