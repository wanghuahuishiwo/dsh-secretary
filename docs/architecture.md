# 架构

## 形态

首版是 DSH **host-only** 插件。DSH 对话是主要界面；早期时间画布原型不属于首版运行时装配。运行需要带 `agentPresets` 与 Schedule 服务的 Web/Desktop 组合，headless 组合不提供这些服务。

## 数据所有者

`src/store.ts` 是 Action 与 TimeCategory 的唯一写入口。宿主 `storageDomain` 提供版本化、本地持久化存储：

- domain：`secretary`
- version：`1`
- tables：`actions`、`time_categories`
- 运行期文件：`$DSH_HOME/storages/secretary.json`

`src/model.ts` 负责记录与时间语义校验。Action 的父子关系、计划／实际时间独立、完成状态独立和 TimeCategory 两级约束都在同一写入路径执行。进程内所有变更进入共享 FIFO，引用检查与写入在同一个串行操作中完成；卸载时 Cordis disposer 返回并等待存储关闭 Promise。

## 公开接缝

### 统一命令接口

`src/commands.ts` 解析不可信输入并调用 store。Agent 工具与未来 UI 共用这一接口，测试也在这里验证数据行为，不绕过它直接写存储。

首版命令：

- `action.list / get / create / update / complete / delete`
- `timeCategory.list / get / create / update / delete`

### Agent 装配接口

`src/tools.ts` 将统一命令注册为 Agent 工具；`src/skills.ts` 与随包 `skills/` 提供 Secretary 行为。专用 Agent 使用 DSH 原生 preset 组合，不新建 AgentLoop。

Agent 通过宿主 `schedule_*` 工具创建准备提醒。提醒提示引用 Action ID；唤醒后读取 Action、完成材料准备并写回 `preparationResultRef`。宿主定时投递不直接修改 Action 的实际时间或完成状态。

## 外部规划

用户已有的人生规划与时间规划是 Agent 的只读上下文，不复制为预算实体。`Config.timePlanPath` 可选配置当前规划文件，`Config.defaultTimeZone` 提供默认时区。

## 测试

- `tests/contracts.mjs` 在构建后的 `lib/index.js` 上运行。
- 数据行为通过统一命令接口验证。
- 工具、技能与准备链路通过 Agent 装配接口验证。
- 不用内部函数、私有存储结构或原型截图替代行为验证。
