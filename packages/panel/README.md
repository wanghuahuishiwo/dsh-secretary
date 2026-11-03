# Secretary Panel

真实 Web client 使用同一产品壳提供 **GTD、Time、Tags、Goal** 一级入口；Agent 没有入口，Goal 只显示“本期未实现”。

- GTD 提供 Inbox、澄清、Projects、Next Actions、Forecast 视图；支持 Project／独立 Action 澄清、日期与直接 Tags 编辑、完成 Action，并展示 Availability 与派生 effective Tags。
- Time 保留具体日期计划／实录、右侧时间标签树、10／15／30 分钟粒度、Shift 编辑、开始／停止，以及计划页内模板 apply/undo。
- 深度时间保留 7×24 base 周模板、high／medium／low 画笔和固定操作拖刷；未设置不等于 low。
- Tags 的时间／情境树复用同一套管理界面；移动端把 Time 标签架移到底部，GTD 与全部模块遵循宿主 token 和 390px 布局。

Host 半通过 `ctx.connection.fetch.register` 注册两个精确、受宿主认证保护的 route：

- `GET /api/secretary.state?date=YYYY-MM-DD&timeZone=...&forecastDate=YYYY-MM-DD`：返回 Tags、当日 Plan／Actual、Templates、template undo、deepWeek，以及 Inbox／Projects／Actions／Next／Forecast。`forecastDate` 省略时使用 `date`。
- `POST /api/secretary.command`：调用同一批 GTD／Tag／Time Service 原子能力，包括 GTD CRUD／澄清／完成、Plan／Template／Actual 与 DeepTime 写入。

route 只调用 `ctx.gtd`、`ctx.tags` 与 `ctx.time`。浏览器不获得 Host Cordis Context，不直接访问 Domain／SQLite，也没有另一套浏览器领域 store；React state 只保存界面选择、表单和 Host 返回的读取结果。公共 tools 与 routes 因而共享同一 Services 和事实源。

`packages/secretary/tests/browser.mjs` 在临时 `DSH_HOME` 启动真实 `dsh web`，用 Chromium 操作生产 client。三条测试分别覆盖 Time 计划／实录／模板、DeepTime，以及 GTD capture → clarify → Next／Forecast → 编辑／完成 → 完整重开；全部检查页面错误与窄屏边界，不连接真实用户数据或静态 prototype。
