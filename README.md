# dsh-secretary

个人 Secretary Agent：读取你已有的时间规划，通过对话创建具体 Action，到点前准备材料，并保存实际时间与完成结果。

首版只包含 **Action + TimeCategory** 两类业务数据。每次具体活动都是独立子 Action，计划时间、实际时间和完成状态保存在它自身；不引入独立 Schedule／Execution／Budget 模型。

## 构建与验证

```sh
pnpm build
pnpm test
```

## 安装

先构建，再在 DSH 会话内用 `plugin_manager`（`action: install_bundle`，`target` 填本目录绝对路径），或终端：

```sh
dsh plugin --profile <name> add /绝对路径
```

不要手写 profile 依赖。安装后新建会话并选择 **Secretary** preset；既有会话仍保留原来的 preset。运行环境必须是带 `agentPresets` 与 Schedule 服务的 Web/Desktop 宿主，首版不支持 headless 组合。

Secretary 通过 `secretary_action` 与 `secretary_time_category` 工具读写数据，通过宿主 `schedule_*` 工具设置到点准备。已有时间规划默认作为只读上下文；未配置 `timePlanPath` 时，Agent 会在需要时询问路径。

## 已知限制

- 首版没有独立 UI、周期统计或 Review 页面。
- DSH 宿主必须运行，定时提醒才能投递到原会话；投递不代表 Agent 已完成准备。
- 多次活动通过多个具体子 Action 表达，首版没有 recurring 模板。
- 计划修改不改写实际；准备与定时投递不写实际、不自动完成 Action。
- 首版不包含外部 IM、通用 Tag、Energy 或时间预算同步。
