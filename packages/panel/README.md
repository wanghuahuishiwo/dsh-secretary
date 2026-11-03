# Secretary Panel

真实 Web client 使用同一产品壳提供 **GTD、Time、Tags、Goal** 一级入口；Agent 没有入口，Goal 只显示“本期未实现”。

- GTD 提供 Inbox、澄清、Projects、Next Actions、Forecast 视图；支持 Project／独立 Action 澄清、日期与直接 Tags 编辑、完成 Action，并展示 Availability 与派生 effective Tags。
- Time 保留具体日期计划／实录、右侧时间标签树、10／15／30 分钟粒度、Shift 编辑、开始／停止，以及计划页内模板 apply/undo。
- 计划与实录共用 cell 级标记／消除：当前标签不存在时添加并行，存在时消除；双击已选标签进入消除态，拖刷固定处理起手 `timeTagId`，单击任意标签退出。添加、消除（含整次拖刷）和编辑提供当前会话 Undo；通用 Undo 不承诺跨完整重启保留。
- 同一 cell 的 N 条并行记录 N 等分，一小时一行且实际行高 48px；记录使用实心标签色、4px 圆角和细间距，跨小时只在首个覆盖 cell 显示标题。粒度切换只改显示与手动对齐，不重写 Host 事实。
- 深度时间保留 7×24 base 周模板、high／medium／low 画笔和固定操作拖刷；未设置不等于 low。
- Tags 的时间／情境树复用同一套管理界面；Time／GTD 进入时自动选择对应 kind。两种 kind 共用桌面 HTML5 drag/drop 改父级及根级放置区，drop 调用同一 `TagService.move`，不宣称触摸拖拽。移动端把 Time 标签架移到底部，全部模块使用宿主 token 并覆盖 390px 布局。

Host 半通过 `ctx.connection.fetch.register` 注册两个精确、受宿主认证保护的 route：

- `GET /api/secretary.state?date=YYYY-MM-DD&timeZone=...&forecastDate=YYYY-MM-DD`：返回 Tags、当日 Plan／Actual、Templates、template undo、deepWeek，以及 Inbox／Projects／Actions／Next／Forecast。`forecastDate` 省略时使用 `date`。
- `POST /api/secretary.command`：调用同一批 GTD／Tag／Time Service 原子能力，包括 GTD CRUD／澄清／完成、Plan／Template／Actual 与 DeepTime 写入。

route 只调用 `ctx.gtd`、`ctx.tags` 与 `ctx.time`。浏览器不获得 Host Cordis Context，不直接访问 Domain／SQLite，也没有另一套浏览器领域 store；React state 只保存界面选择、表单和 Host 返回的读取结果。公共 tools 与 routes 因而共享同一 Services 和事实源。

`packages/secretary/tests/browser.mjs` 在临时 `DSH_HOME` 启动真实 `dsh web`，用 Chromium 操作生产 client。八条测试覆盖 Time 计划／实录／模板、DeepTime、GTD 基础流程、计划／实录共用矩阵、 recreate 后新 ID 的完整 Undo 链、两种 Tag 的 HTML5 层级拖拽与入口 kind，以及真实宿主明暗主题 token／对比度和 390px。全部检查 page error 与非预期 console.error；明确 reload／进程重启用例只分类放行已识别的导航／关闭瞬时网络错误。主题测试可通过 `SECRETARY_SCREENSHOT_DIR` 输出证据图，默认不写仓库。测试不连接真实用户数据或静态 prototype。
