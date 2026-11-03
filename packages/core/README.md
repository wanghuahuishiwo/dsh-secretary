# Secretary Core

`dsh-secretary-core` 是兄弟包共享的内部代码库，不是 Cordis 插件，也没有根入口。使用方必须按 subpath 引入所需能力。

## Exports

| Subpath | 内容 |
|---|---|
| `dsh-secretary-core/validation` | `objectOf`、`normalizeName`、`parseInstant`、`parseTimeRange`、`optionalString`、`withoutUndefined` 与 `TimeRange` |
| `dsh-secretary-core/tooling` | 公共工具输出 `OUTPUT`、`noConfig`、`registerTool` |
| `dsh-secretary-core/skill-resources` | `SkillRegistration`、`registerSkill`；读取调用方指定的技能文件并在调用方 Context 注册 |
| `dsh-secretary-core/package.json` | 包元数据 |

## Config

本包没有插件 `Config`，不接受配置，也不提供 `apply`。`noConfig` 只是供其他插件声明“只接受空配置”的 helper；各领域自己的配置约束由各领域包拥有。

## 数据所有权与限制

- 不拥有领域事实、数据库、文件路径或工具／技能注册表，不创建独立 UI。
- `registerSkill` 只读取调用方显式给出的文件；`registerTool` 只在调用方提供的 Host Context 上注册。生命周期与权限由调用方和宿主负责。
- validation 只实现通用输入检查，不替代 GTD、Time、Tag 的领域不变式，也不负责时区策略或持久化迁移。
- 仅供本 workspace 复用；不要把业务规则集中到本包。
