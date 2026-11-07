# 设计资产

`design/` 保存 DSH Secretary 各产品模块的可运行设计稿。DSH 与 OpenDesign 读取同一份源文件，OpenDesign 以仓库根为项目目录。当前视觉与组件契约见 [DESIGN.md](../DESIGN.md)，语义 token 见 [tokens.css](../tokens.css)。产品模块地图见 [AGENTS.md](../AGENTS.md#产品模块)；本表只列已有设计资产。

## 模块

| 模块 | 入口 | 说明 |
|---|---|---|
| [time-block](time-block/README.md) | `time-block/index.html` | 小秘书-时间块右栏 |
| [gtd](gtd/README.md) | `gtd/omnifocus-mac.html` | 小秘书-事项独立主区 |

每个模块的 README 记录交互范围、数据边界和验收方式。

## 待设计模块

Goal 与 Tag 的模块边界和当前范围见 [AGENTS.md](../AGENTS.md#产品模块)；设计开始时再建对应模块目录、README、入口与场景。

## 构建与预览

在仓库根执行：

```bash
pnpm install
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
3. 将模块加入上表。
4. 执行 `pnpm --dir design build` 生成 `<module>/assets/`。

可复用模型和组件放在 `shared/`，产品模块页面放在各自的 `src/`。
