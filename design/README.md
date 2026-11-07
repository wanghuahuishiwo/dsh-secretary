# 设计资产

`design/` 保存 DSH Secretary 各产品模块的可运行设计稿。DSH 与 OpenDesign 读取同一份源文件，OpenDesign 以仓库根为项目目录。项目级设计契约见 [DESIGN.md](../DESIGN.md)，产品模块地图见 [AGENTS.md](../AGENTS.md#产品模块)；本表只列已有设计资产。

## 模块

| 模块 | 设计契约 | 入口 | 说明 |
|---|---|---|---|
| [time-block](time-block/README.md) | [DESIGN.md](time-block/DESIGN.md) | `time-block/index.html` | 小秘书-时间块右栏；完整 `TimeProduct` + Fixture Adapter |
| [gtd](gtd/README.md) | 待建 | `gtd/omnifocus-mac.html` | 小秘书-事项独立主区设计稿 |

每个模块的 `README.md` 记录交互范围、数据边界和验收方式；`DESIGN.md` 记录模块视觉、组件组合与 token 契约（已有模块按需补齐）。

## 待设计模块

Goal 与 Tag 的模块边界和当前范围见 [AGENTS.md](../AGENTS.md#产品模块)。Goal 仍是空壳入口，不冒充已完成设计；设计开始时再建对应模块目录、`README.md`、`DESIGN.md`、入口与场景。

## Token

根 `--sec-*` 与模块 token 的分层、消费规则见 [DESIGN.md#token-分层](../DESIGN.md#token-分层)。

## 构建与预览

在仓库根执行：

```bash
pnpm install
pnpm build          # 先构建设计依赖的包（如 time-panel），再构建 design
```

只重建设计侧时，先确保依赖包已构建，再执行：

```bash
pnpm --dir design build
```

构建会为包含 `<module>/src/index.tsx` 的模块生成 bundle，写入 `<module>/assets/`。浏览器直接打开模块 README 中的入口即可预览，不依赖 DSH 宿主或后端服务。

开发时监听源文件：

```bash
pnpm --dir design dev
```

## OpenDesign

OpenDesign 桌面端使用 folder-backed 项目读取仓库根。首次接入或换机时，在仓库根执行：

```bash
pnpm --dir design od
```

命令复用已指向本仓库的项目；没有时创建 `dsh-secretary 设计`。完成后在 OpenDesign 的「设计文件」中选择模块入口。

## 新增模块

1. 创建 `<module>/src/index.tsx` 和 `<module>/index.html`，HTML 引用 `./assets/index.js` 与 `./assets/index.css`。
2. 在 `<module>/README.md` 写交互范围、数据边界与验收方式；需要浏览器回归时添加 `<module>/scenarios.json`。
3. 在 `<module>/DESIGN.md` 写模块视觉、组件与 token 契约；需要模块 token 时新增 `<module>/tokens.css`。
4. 将模块加入上表。
5. 执行 `pnpm --dir design build` 生成 `<module>/assets/`。

产品 UI 属于对应 package 的 `src/ui`，设计侧只 import 该包的公开 `/ui` 入口；不要把可复用组件再复制到 `design/` 下。
