# 小秘书-事项 · OmniFocus Mac 原型说明

> 状态：待用户在 Open Design 评审。原型是可丢弃代码，不连接真实 GTD 数据，不代表 Review／Repeat 等暂停范围已进入实施。

## 回答的问题

1. 事项作为独立产品入口时，怎样复刻 OmniFocus Mac 的信息架构与交互，而不是沿用当前临时表单工作区。
2. Mac 的多区工作流进入 DSH 后如何承载：完整宽工作区与右侧栏分别呈现，不在未看效果前硬压成窄栏。

## 官方视觉依据

本轮直接查看了 Omni Group 官网当前 OmniFocus 4 页面及其中五张 Mac 图像：[OmniFocus 官方产品页](https://www.omnigroup.com/omnifocus/)。手册结构、快捷键和 Sidebar／Outline 行为另见 [OmniFocus Mac 调研](../docs/research/omnifocus-mac.md)（含 16 张已核验官方原图）。

| 官方图像 | 直接观察到的结构 |
|---|---|
| [hero](https://www.omnigroup.com/assets/img/app/focus-4/of4-hero.png) | Mac 明暗主题；透视图标栏、树、Outline、Inspector 可同时存在。 |
| [Projects 深色](https://www.omnigroup.com/assets/img/app/focus-4.9/capture-mac-1.jpg) | 蓝色 Projects 标题；选中行动为整行浅蓝底；状态圆圈、标签、Defer／Planned／Due、备注、旗标都在行内。 |
| [Projects 浅色](https://www.omnigroup.com/assets/img/app/focus-4.9/organize-mac-2.jpg) | 高密度列表而非卡片网格；项目组之间使用细分隔线；Focus 是独立提示条。 |
| [Tags](https://www.omnigroup.com/assets/img/app/focus-4.9/do-mac-1.jpg) | 紫色 Tags 视觉；标签树与行动 Outline 分离；行动可显示所属 Project。 |
| [Review](https://www.omnigroup.com/assets/img/app/focus-4.9/review-mac-3.jpg) | 左侧项目检查列表，右侧项目与行动内容；顶部提供上一／下一项目和 Mark Reviewed。 |

App Store 网页在当前网络下重定向到 Today，未据此声称已读取 App Store Mac 截图。官方 2012 Mac PDF 只作历史材料，不作为 OmniFocus 4 的视觉依据。

## 原型方案

Open Design 项目 `secretary-prototype` 中的 `omnifocus-mac.html`：

- **A · Mac 完整工作区**（`?variant=mac`）：透视图标栏 + 项目／标签树 + Outline + Inspector。用于确认要复刻的 Mac 交互基准。
- **B · DSH 右侧栏**（`?variant=rail`）：保留图标栏与 Outline；项目树通过左上按钮覆盖打开；Inspector 作为右侧覆盖层。用于判断真实入口的承载方式。

底部浮动栏可切换 A／B 与明暗主题，左右方向键也可切换 A／B。

## 已覆盖的原型交互

- 切换收件箱、项目、下一步、标签、预测、旗标、检查；Inbox 不显示第二 Sidebar。
- 项目／标签树筛选；窄栏中导航树可覆盖打开并在选择后收起。
- Forecast 使用月历 Sidebar 与 Piano Keys 日期格，支持过去、今天、明天、后续日期及未来筛选。
- Review 使用平坦项目队列，一次只显示一个项目，支持上一／下一项目与标记已检查后前进。
- 行动选中态与 Inspector；完成／恢复、旗标、备注和日期状态。
- 搜索标题与备注；Quick Entry 以单条行动行捕获到内存 Inbox，Esc／外部点击关闭弹层。

## 设计边界

- 不把行动行改成卡片，不引入桌面式“先点视图再填一整套表单”的旧工作区。
- Defer、Planned、Due 分行呈现；Planned 不是时间块区间。
- 标签在事项中是情境分类；不在原型中虚构 Goal 字段或 Goal 管理 UI。
- Review／Repeat 的交互是否进入实现仍由后续范围决定；原型中出现的位置不等于已承诺交付。

## 待评审选择

推荐 **B 作为 DSH 常驻入口，A 作为完整工作区交互基准**。这样列表、选中、Inspector 与 Mac 一致，同时不把项目树和 Inspector 永久挤压在 652px 里。若用户希望事项始终使用完整 Mac 工作区，则入口应承载更宽的内容，而不是继续缩小右栏字体与行高。
