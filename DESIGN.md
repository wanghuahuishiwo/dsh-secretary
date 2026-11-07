---
version: alpha
name: DSH Secretary TimeBlock
description: 390px 窄右栏的克制型时间工具视觉与组件化设计预览契约。
colors:
  tb-surface-page: "#0e0f12"
  tb-surface-rail: "#16181c"
  tb-surface-raised: "#1d2025"
  tb-surface-hover: "#252931"
  tb-grid-cell: "#191c21"
  tb-text-primary: "#eceff3"
  tb-text-secondary: "#a3a9b4"
  tb-text-tertiary: "#727a88"
  tb-border-subtle: "rgba(255, 255, 255, 0.07)"
  tb-border-strong: "rgba(255, 255, 255, 0.14)"
  tb-accent: "#82aaff"
  tb-accent-soft: "rgba(102, 141, 222, 0.16)"
  tb-danger: "#ef8c84"
  tb-selection: "#f4f7fb"
  tb-tag-work: "#6479c8"
  tb-tag-focus: "#547ec4"
  tb-tag-collaboration: "#8870bd"
  tb-tag-life: "#50856c"
  tb-tag-meal: "#a27a4c"
  tb-tag-exercise: "#4f927b"
  tb-tag-learning: "#a0704e"
  tb-tag-reading: "#737fb5"
  tb-tag-rest: "#737985"
  tb-tag-errand: "#a26978"
typography:
  tb-font-caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: 10px
    fontWeight: 400
    lineHeight: 1.4
  tb-font-label:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.4
  tb-font-body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  tb-font-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: 15px
    fontWeight: 650
    lineHeight: 1.4
spacing:
  tb-space-1: 4px
  tb-space-2: 8px
  tb-space-3: 12px
  tb-space-4: 16px
  tb-space-5: 20px
  tb-space-6: 24px
  tb-control-height: 30px
  tb-hour-height: 26px
  tb-rail-width: 390px
  tb-shelf-width: 116px
rounded:
  tb-radius-sm: 5px
  tb-radius-md: 8px
  tb-radius-lg: 12px
components:
  tb-rail:
    backgroundColor: "{colors.tb-surface-rail}"
    textColor: "{colors.tb-text-primary}"
    width: "{spacing.tb-rail-width}"
  tb-active-tab:
    backgroundColor: "{colors.tb-surface-hover}"
    textColor: "{colors.tb-text-primary}"
    rounded: "{rounded.tb-radius-md}"
  tb-grid-cell:
    backgroundColor: "{colors.tb-grid-cell}"
    borderColor: "{colors.tb-border-subtle}"
    height: "{spacing.tb-hour-height}"
  tb-tag:
    backgroundColor: "{colors.tb-accent-soft}"
    textColor: "{colors.tb-text-primary}"
    rounded: "{rounded.tb-radius-sm}"
    height: 28px
  tb-selection-bar:
    backgroundColor: "{colors.tb-surface-raised}"
    textColor: "{colors.tb-text-secondary}"
    height: 42px
---

# DSH Secretary · TimeBlock 设计契约

## Overview

TimeBlock 是一个藏在 DSH 窄右栏里的时间工具，不是独立工作台，更不是展示品牌的 landing page。视觉应当安静、紧凑、可读，让“这一天的时间去了哪里”成为唯一主角。界面用低对比中性色建立秩序，用低饱和标签色承载时间事实；装饰不能比记录更显眼。

本文件是根目录唯一的视觉、设计组件与预览架构契约，供 DSH 与 OpenDesign 共读。行为事实仍以 `docs/prd/time-block.md` 为准；`scenarios.json` 是设计预览的可执行期望，不把尚未确认的交互升级为生产事实。本轮不包含 GTD，不建立跨 GTD / TimeBlock 的共享 Shell，也不设计并行时间块的新交互。

暗色是默认评审主题，浅色是同一语义结构的另一种表达。所有颜色、字阶、间距和圆角都在根 `tokens.css` 绑定；YAML 中的 `tb-*` 与 CSS 的 `--tb-*` 是同一 token，只允许同步修改两侧。

## Colors

颜色先表达层级，再表达类别。`tb-surface-rail` 是产品底，`tb-surface-raised` 承托标签架与底栏，`tb-surface-hover` 只用于悬停和当前控件。分隔线保持低对比，整屏不能出现粗重卡片边框。

`tb-accent` 仅表示当前时刻、回到今天和键盘焦点，不与时间标签争色。`tb-danger` 只用于橡皮等擦除动作。选区由 `tb-selection` 的实线内框与勾选符号共同表达，不能只靠颜色变化。

标签色是类别语义，不代表优先级、完成度或能量。同一组标签在明暗主题保持相同名称，具体色值随主题调整以保证可读性。禁止新增彩虹渐变、发光块或用透明度过低的文字隐藏层级。

## Typography

只使用宿主已有的系统字体，不下载 Web Font。标题 `tb-font-title` 15px，正文 `tb-font-body` 12px，控件标签 `tb-font-label` 11px，辅助刻度 `tb-font-caption` 10px。小时、日期、分钟数使用 tabular-nums，避免导航与计数跳动。

标题最多一个强调层级；标签与记录使用 500–600 的中等字重，不制造大号数字或营销式标题。中文标签应简短、直白，例如“深度工作”“协作沟通”“用餐”。390px 下允许省略记录备注，但完整名称保留在可访问名称或 `title` 中。

## Layout

产品壳固定最大宽度 `tb-rail-width: 390px`，在更宽预览视口靠右对齐，在 390px 视口完整占宽，不派生另一套移动页面。顶部依次是标题/主题/Undo 与计划/实录、日期导航；中间是共享时间格画布和标签架；底部是选区栏。

画布每小时一行、每小时六列、每格固定 10 分钟。小时行高为 `tb-hour-height: 26px`；空间不足时只在画布或标签架内部滚动，不让整个右栏出现横向滚动。默认标签架宽 `tb-shelf-width: 116px`，收窄后把空间交还画布。选区底栏保留 42px，防止操作时布局跳动。

间距以 4px 为最小步进。分组靠间距、表面与细线完成，不把每行记录包成悬浮卡片。

## Elevation & Depth

层级以 tonal surface（色调表面）和边框为主，页面本身保持平坦。标题栏、画布、标签架和底栏不使用大面积投影。只有临时 Toast 这类浮层允许一层轻阴影；不得让时间块呈现玻璃拟态、浮雕或悬浮卡片效果。

## Shapes

控件圆角为 5px 或 8px，12px 只保留给未来真正的浮层。时间格保持直角并连续拼接，以维护日程密度和时间轴秩序。标签圆点是小方角标记，不用大型插画、胶囊群或过度圆润的按钮替代标签架。

## Components

### RailShell

`design/shared/components/RailShell.tsx` 只承担 TimeBlock 窄栏产品壳：产品名、设计预览标识、计划/实录切换、日期前后/今天、Undo 和明暗切换。它不是全仓库共享应用 Shell，不引用 GTD。

### TimeCanvas 与 TimeBlockPage

`design/time-block/src/components/TimeCanvas.tsx` 是计划与实录共用的 144 格画布。空格可点选，已选格再次点击取消，同日拖动形成连续选区；选区有清晰内框和总分钟数。`TimeBlockPage.tsx` 负责页面组合和选择状态，不直接访问任何数据实现。

计划与实录展示同一日期但使用不同数据层；切层不改日期，也不把一层的写入复制到另一层。上色与擦除成功后清空选区。Undo 只恢复当前层的上色/擦除历史。

### TagShelf

`design/shared/components/TagShelf.tsx` 使用真实中文层级标签。父级可展开/收起，标签架可整体收窄；没有选区时写入按钮禁用。点击标签只表示给当前选区上色，不启动未确认的刷子、并行块或拖放交互。

### SelectionBar 与反馈

`design/shared/components/SelectionBar.tsx` 在无选区时显示“10 分钟 / 格”和手势提示；有选区时显示分钟、格数、“不选”和“橡皮”。“不选”只清选区，“橡皮”才擦除事实。Toast 只确认成功的内存操作，不伪造 Remote 成功。

### 主题与状态

主题切换只修改语义 token，不改组件结构。默认覆盖 ready、空白格、已填充格、选区、禁用 Undo、禁用标签与操作反馈；本轮不把 loading/error 做成完整生产状态机。

## Do's and Don'ts

- Do 保持 390px 同一套操作，并优先验证中文溢出、内部滚动和键盘焦点。
- Do 让计划/实录、选择、上色、擦除、Undo 与日期导航可以独立验收。
- Do 用 fixtures 表达真实的一天，并保持场景数据可复现。
- Don't 加入 GTD、共享产品 Shell、并行块、新记录编辑器或深度时间页面。
- Don't 使用渐变、装饰性 hero、营销文案、外部图片或 CDN 字体。
- Don't 把设计预览的内存成功当作生产持久化事实。
- Don't 手工修改生成物，或为预览引入第二份视觉 token 真源。

## 可执行预览架构

OpenDesign 项目根是仓库根；静态预览入口固定为非忽略的 `design/time-block/index.html`。入口只引用 `design/time-block/assets/index.js` 与 `index.css`，React 19 和 ReactDOM 由 esbuild 一并打包，不能像生产 DSH client 一样 external。

组件分为 `design/shared/model`、`design/shared/components` 与 `design/time-block/src`。shared 仅沉淀本轮 TimeBlock 可复用的前端接口和显示组件，不意味着跨产品装配。页面不依赖 React Context 之外的隐式数据通道，也不直接 import 生产 Remote。

## Fixture / Remote 与生成文件边界

所有 UI 只依赖 `design/shared/model/adapter.ts` 的 `load / paint / erase / undo`。本轮组合根实例化 `FixtureTimeAdapter`：数据只存在内存，固定演示今天为 2026-11-06，重载即复位，不访问网络、SQLite 或真实 DSH 数据。未来生产 Remote Adapter 应实现同一前端接口；本轮不做生产接线，也不描述服务端实现。

根 `tokens.css`、本文件、`design/shared/`、`design/time-block/src/`、`fixtures.ts`、`scenarios.json` 与 `index.html` 是可编辑源文件。`design/time-block/assets/` 下的 JS、CSS 和 source map 全部由 `pnpm --dir design build` 生成，不手工编辑；生成目录不得改名为 `dist/`，也不得被忽略或隐藏。
