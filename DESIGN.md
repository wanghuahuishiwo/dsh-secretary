# DSH Secretary 设计契约

本文件是项目级设计契约：跨产品模块的设计原则、共享视觉语言、组件分层、Adapter 边界、模块索引和验收规则。单个模块的视觉、组件组合与 token 细节下沉到 `design/<module>/DESIGN.md`，不在此重复。

行为事实以 [docs/prd/](docs/prd/README.md) 为准；产品模块地图见 [AGENTS.md#产品模块](AGENTS.md#产品模块)。设计预览是可运行交互稿，不等于生产验收。

## 设计原则

- **工具而非橱窗**：界面主角是用户记录的事实，不是品牌、插画或营销文案。任何装饰都不能比记录更显眼。
- **层级先于装饰**：用色阶表面、细边框和间距建立层级；不用大投影、玻璃拟态、发光或浮雕。
- **密度可控**：控件紧凑但不拥挤，间距以 4px 为步进；空间不足时在模块内部滚动，不让整个应用出现横向滚动。
- **语义先于色值**：颜色、字阶、间距和圆角都通过 token 表达。明暗主题是同一语义结构的两种取值，不改组件结构。
- **可验证**：设计稿使用固定、可复现的 fixture；交互通过 `scenarios.json` / 浏览器验收，不把 fixture 的内存成功当成生产持久化。

## 共享视觉语言

### 颜色

颜色先表达层级，再表达类别。页面、栏体、抬升面与悬停面用中性低对比色阶；分隔线保持细弱，整屏不出现粗重卡片边框。强调色只用于当前时刻、选中态和键盘焦点；危险色只用于删除、擦除等破坏性动作。类别色是语义标签，不代表优先级或完成度，明暗主题下保持相同名称与相近可读性。

### 字体

只使用系统字体，不下载 Web Font。字阶固定为 caption / label / body / title 四级；小时、日期、分钟和计数使用 tabular-nums，避免导航跳动。标题最多一个强调层级，中文字段短而直白，溢出时保留完整可访问名称。

### 间距与形状

间距以 4px 为最小步进。控件使用小/中圆角，超大圆角只保留给真正的浮层。网格、时间轴和列表保持连续拼接，不把每一行包成悬浮卡片。图标使用线性描边，尺寸跟随字阶。

### 层级与动效

默认平坦，只有 Toast、菜单、抽屉等临时浮层允许轻阴影。动效短促、可中断，并尊重 `prefers-reduced-motion`。主题切换、层切换和选择变化不能依赖动画来表达状态。

## Token 分层

```text
根 tokens.css                    --sec-*   项目级 foundation（颜色/字阶/间距/圆角）
design/<module>/tokens.css       模块 contract（alias 到 --sec-* + 模块尺寸/调色板）
packages/<pkg>/src/ui            只消费模块 token
packages/<pkg>/src/client        --dsw-* → 模块 token 的宿主绑定
```

- 根 token 只放跨模块共享的 foundation，不放某个模块的尺寸、组件或业务调色板。
- 模块 token 把颜色、字阶、间距和圆角 alias 到根 token；模块专属尺寸与 fixture 调色板用字面值。
- 组件里不出现宿主 token（`--dsw-*`）；宿主差异只在 client 的 token 绑定文件中处理。
- OpenDesign 同时加载根 token 与模块 token；生产由 client 绑定宿主值。两边 token 名称与语义一致，具体 RGB 由宿主决定。

## 组件分层

| 层 | 位置 | 职责 | 不做什么 |
|---|---|---|---|
| 纯 UI | `packages/<pkg>/src/ui` | 产品根组件、内部组件、纯 model、组件样式、UI 数据契约 | 不 import 宿主、Remote、产品包或 client；不持有全局 store |
| 宿主适配 | `packages/<pkg>/src/client` | Remote Adapter、DSH 生命周期、宿主 token 绑定 | 不复制 UI，不定义第二套样式 |
| 设计壳 | `design/<module>` | OpenDesign 壳、Fixture Adapter、主题与预览标识、场景 | 不复制产品 UI，不访问生产数据 |
| 设计文档 | `design/<module>/DESIGN.md` | 模块视觉、组件组合、模块 token 契约 | 不重复项目级原则 |

每个产品模块只导出一个稳定 UI 入口（产品根、纯 model、Adapter 契约类型）。内部组件不进入公开契约。设计壳只 import 该公开入口，不 import 生产 client。

## Adapter 边界

UI 只通过 Adapter 契约读数据、发命令：

- UI 发命令并渲染命令返回的新视图，不隐式 reload，也不假设写入已成功。
- Adapter 负责把命令映射到 Remote / fixture，并持有 Undo 历史；UI 只读 `canUndo` 并调用 `undo`。
- 错误以 reject 抛出，由产品根统一呈现错误与反馈；不得伪造成功。
- ID 在 UI 契约中使用字符串；生产 Adapter 在边界完成数字与字符串映射。
- 设计 fixture 与生产 Adapter 实现同一契约；fixture 只存在内存，不访问网络、SQLite 或真实用户数据。

## 模块索引

各产品模块的设计资产、当前清单与新增模块步骤见 [design/README.md#模块](design/README.md#模块)。

## 验收规则

- 根 `DESIGN.md` 不出现单个模块的 token 前缀、布局尺寸、专属组件或阶段限制。
- 根 token 只有 `--sec-*` foundation；模块 token 自洽并能 alias 到根 token。
- 纯 UI 目录不出现宿主/Remote/产品包 import，也不出现宿主 token；组件只消费模块 token。
- 每个模块只有一份产品 UI：设计壳 import 公开 UI 入口，不保留设计侧重复组件。
- 设计预览加载完整产品 UI，fixture 可复现，主题可切换，控制台错误与外部请求为 0。
- 生产验收必须经过真实 DSH + Remote + SQLite；OpenDesign 场景通过只代表设计壳确认。
- 文档链接有效；`pnpm build`、`pnpm test`、`pnpm --dir design build`、`git diff --check` 通过。

## 维护规则

同一主题只保留一个权威文件：项目级原则在本文件，模块视觉与 token 在模块 `DESIGN.md`，产品行为在 PRD，架构装配在 `docs/architecture.md`。根文件只做索引和约束，不复制模块细节；模块文档反向链接本文件。
