---
description: "统一 Tag 能力：Service/contract 与 Agent 工具分属两个角色包。"
kind: "package-group"
---

# tag/

## 摘要

统一 Tag 能力；`time` / `context` 只是 `kind`。组目录是纯容器，不包含 `package.json` 或源码，仓库级包地图见 [packages/README.md](../README.md)。

## 包

| 包 | 名称 | 角色 |
|---|---|---|
| [`service/`](service/README.md) | `dsh-secretary-tag-service` | `TagService` 与 `./contract` |

## 约束

- `service` 不注册 Agent 入口；CLI 与产品 Remote 都只通过 `./contract` 消费 `TagService`（工具已随 #51 退役）。
- 跨包只依赖 Service contract，不 import 其他包的内部源码。

## 领域模型

### 数据结构

```ts
interface Tag {
  id: number          // 自增数字主键，系统自动生成
  name: string        // 用户维护的展示名称
  kind: 'time' | 'context' // 系统内置用途类型；新增类型须由产品显式扩展
  parentId?: number   // 标签树父级
  color?: string
  description?: string // 这个标签算什么、什么时候该选它；≤500 字符，空串按未设置处理
}
```

- `kind = time`：用于时间分类与统计。
- `kind = context`：用于 GTD 执行情境。
- `kind` 决定标签语义和允许的关联对象，不是用户自定义的展示分组；未来新增类型必须由产品明确用途和规则。
- 同一棵标签树必须属于同一个 `kind`：创建根标签时确定，子标签继承父标签的 `kind`，禁止跨 `kind` 的父子关系和移动。同名标签可分别存在于不同 `kind` 的树中，但仍是不同 Tag。
- 当前所有 `kind` 共用上述统一字段和管理能力，不引入类型专有状态或属性；差异化生命周期等细节留待后续。
- 标签树只负责组织、筛选和汇总，不改变 Project / Action 的归属关系。
- 用户只维护 `name`、`color` 与 `description`。AI 默认使用 `name` 和上下文；需要精确消歧时，可使用 `tag:12`、`action:345` 这类带类型的短数字引用。
- `description` 写「什么时候选这个标签」的判据，不是名称的复述：名字自带含义的（睡眠、吃饭）可不写，靠约定才成立的（主线／副线、方法论实践）必须写，否则几个月后没人记得当初的分法。`update` 传 `null` 可清空。

### 任意层级都可关联

父标签和叶子标签都可以被关联，不采用 leaf-only 限制。

直接关联父标签表示「只确定大类，尚未细分」。以后增加子标签，不影响既有直接关联。

### 只保存实际选择的标签

关联一个标签时，只保存该标签，不把它的祖先标签复制到记录上。

查询父标签时：

```text
直接关联父标签的记录
+ 关联其任意后代标签的记录
→ 按记录去重
```

这条是「标签树向上汇总」：子标签的命中结果归入父标签查询。它与 GTD 的「层级继承」（Project／父 Action 的标签向子 Action 派生，见 [gtd/](../gtd/README.md)）是两种不同关系；两者都只用于查询，不复制写入。
