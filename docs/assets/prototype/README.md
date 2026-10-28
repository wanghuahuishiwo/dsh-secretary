# 小秘书效果稿（PROTOTYPE）

这是 OpenDesign 依据 [PRD](../../prd.md) 和 [v2 直接操作 brief](secretary-brief-v2.md) 生成的 throwaway 产品原型，不是生产代码。状态只保存在内存和 `?variant=` URL 参数中，没有后端和持久化。

v2 根据评审反馈推翻了上一版的后台式布局：主画面改为**一小时一行、每行 4 个 15 分钟格**，去掉大标题、KPI 卡片和常驻编辑表单，以「选格 → 点标签 → 完成」为主闭环。

## 打开

直接用浏览器打开 [secretary-prototype.html](secretary-prototype.html)，不需要安装依赖或启动服务。默认进入 `?variant=A` 的实际记录画布。

三个变体共享时间网格、示例数据和主要功能，区别是主要标记入口：

- `?variant=A`：**标签架**。时间画布 + 右侧可点选标签，最接近时间块的操作方式。
- `?variant=B`：**纯净画布**。拖选后在选区旁弹出标签 picker，没有常驻右栏。
- `?variant=C`：**底部快捷标记**。通过底部标签 dock 选类、标记和编辑。

左下角 `A / B / C` 或键盘左右方向键可切换变体；输入框聚焦时不会拦截方向键。

## 可以试的操作

- 点击或拖选时间格，再点击标签，立即生成记录。
- 点击已有记录，在浮层或底部上下文中改标签、备注、精力或删除。
- 在桌面端上下拖动已有记录，按 15 分钟移动；`Cmd/Ctrl+Z` 撤销。
- 计划模式通过星期 strip 编辑每周重复模板；实际记录不会继承计划。
- 对照模式查看计划/实际双画布，或切换分类时长、构成比差异。
- 右上角打开独立统计 sheet、标签管理和明暗主题；精力带可独立标注、显示或隐藏。

## 已验证（2026-10-27）

对归档 HTML 使用 Chromium + Playwright 独立验收：

- JavaScript 语法通过，单页无外部运行依赖。
- 24 个小时行、每小时严格 4 格；跨小时和并行记录正确显示。
- A/B/C 的选格、拖选、标签着色、记录编辑、删除与撤销。
- 已有记录直接拖动及撤销；精力标注、隐藏与恢复。
- 周计划展开、计划/实际独立、双画布和分类构成比对照。
- 统计 sheet、明暗主题及 390px 移动布局。
- **58/58 项交互与布局断言通过**；浏览器 console/page error 均为空；390px 无横向溢出。
- 最终展示截图使用未编辑的干净示例数据重新截取。

## v2 截图

- [A · 标签架](secretary-v2-a.png)
- [B · 纯净画布](secretary-v2-b.png)
- [B · 选区旁标签浮层](secretary-v2-b-picker.png)
- [C · 底部快捷标记](secretary-v2-c.png)
- [周计划](secretary-v2-plan.png)
- [计划/实际双画布](secretary-v2-compare.png)
- [独立统计 sheet](secretary-v2-stats.png)
- [深色主题](secretary-v2-dark.png)
- [390px 布局](secretary-v2-mobile.png)

OpenDesign 原项目位于其本地项目 `secretary-prototype` 中；本文件是同一 `index.html` 的归档副本。生成停止后，以上检查均针对归档文件重新执行，而不是依赖生成端状态。
