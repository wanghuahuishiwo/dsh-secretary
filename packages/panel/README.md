# Secretary Panel

真实 Web client：具体日期 ActualBlock 画布、右侧时间标签树，以及统一的 time/context 标签管理。画布支持 10 分钟直接记录、任意并行等分、Shift 编辑、开始／停止；移动端把标签架移到底部。

Host 半通过 `ctx.connection.fetch.register` 注册两个精确、受宿主认证保护的 route：

- `GET /api/secretary.state?date=YYYY-MM-DD&timeZone=...`
- `POST /api/secretary.command`

route 只调用 `ctx.tags` 与 `ctx.time`；浏览器不获得 Host Cordis Context，也不直接访问 Domain 或 SQLite。公共 tools 与这些 route 因而共享同一领域 Services 和事实源。

`packages/secretary/tests/browser.mjs` 在临时 `DSH_HOME` 启动真实 `dsh web`，用 Chromium 操作生产 client，并完整停止／重开同一 SQLite。不会连接开发中的正式 GUI 或读取静态 prototype。
