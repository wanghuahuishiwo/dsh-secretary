# Secretary Panel

真实 Web client：已确认产品壳中的 Time 工作区包含具体日期的 **计划／实录** 与持续复用的 **深度时间基础周模板**。计划与实录复用日期画布和右侧时间标签树；计划模板从计划页进入，不是第四个子模块。Tags 使用统一的 time/context 管理界面，GTD 与 Goal 不在本切片扩展。

- 日期文字打开真实月历，支持前后月、任意日期、前后日，以及日期栏和月历中的“今天”；今天按浏览器当前日期高亮。
- 画布支持 10／15／30 分钟粒度切换，切换只改变显示和操作对齐，不重写 PlanBlock 或 ActualBlock。
- 实录保留任意并行等分、Shift 编辑、开始／停止；计划使用相同的标签架、画布与编辑能力。
- 模板按 weekday + startTime/endTime 维护，显式 apply 到当前日期；undo 按钮由 Host 返回的可撤销事实驱动，刷新或进程重开后仍可恢复。
- 移动端把标签架移到底部。
- 深度时间显示真实 7×24 base 周网格；选择 high／medium／low 后点按或连续 pointer 拖刷，同档起手固定整次清除，否则固定写入当前画笔，不逐格 toggle。未设置使用独立 `unset` 与宿主 surface 色，不冒充 low；网格颜色沿用宿主明暗 token。窄屏只允许网格容器内部横向滚动，不扩大页面。

Host 半通过 `ctx.connection.fetch.register` 注册两个精确、受宿主认证保护的 route：

- `GET /api/secretary.state?date=YYYY-MM-DD&timeZone=...`：返回 Tags、当日 Actual/Plan、Templates、当日 template undo 可用性与完整 deepWeek。
- `POST /api/secretary.command`：调用同一批 Tag/Time Service 原子能力，包括 Plan CRUD、Template CRUD/apply/undo 与 DeepTime 单格／区间设置和清除。

route 只调用 `ctx.tags` 与 `ctx.time`；浏览器不获得 Host Cordis Context，也不直接访问 Domain 或 SQLite。公共 tools 与这些 route 因而共享同一领域 Services 和事实源。

`packages/secretary/tests/browser.mjs` 在临时 `DSH_HOME` 启动真实 `dsh web`，用 Chromium 操作生产 client，覆盖月历跨月/今天、计划模板应用/撤销、实录隔离、粒度切换，以及深度时间三档点按、连续拖刷、同档整次清除、只用 high、unset/low 视觉差异、390px 布局、页面重载和完整停止／重开同一 SQLite。不会连接开发中的正式 GUI、真实用户数据或静态 prototype。
