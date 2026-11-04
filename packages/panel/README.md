# Secretary Panel

真实 Web client 的产品壳：一个**右侧栏 tab**（kind `secretary`），左侧聊天不动，产品在右侧窄列里。

- 一级模块走 ☰ 抽屉：时间块 / 深度时间 / 事项 / 目标 / 标签 / 设置；标题永远显示 `模块 · 子模块`，二级（实录 / 计划）在标题下拉里。
- **时间块**：一格 10 分钟，一屏正好一天，7 天连续（今天 −2 … +4）。全是方格、无圆角、无并行记录；每个格子都带自己的标签名（有备注用备注）。交互固定为「先在格子上选，再点右侧类别」：拖选＝重新拉一段，单击已选格＝取消该格，`不选`／`Esc`／点空白清空，`橡皮`／`Delete`／`Backspace` 擦除。底栏只在有选中时可见，整段选中一条记录时显示类别与「备注」。
- **实录** 与 **计划** 是两张同构画布、不同图层（`actual_blocks` / `plan_blocks`），互不影响；标题下的撤销只覆盖上色/擦除，撤销用当日快照整段回写。
- **深度时间**：7×24 周网格（小时格），按周存储。没画过的周继承最近一个更早的周，再没有就用 `base` 种子；写入只落在本周（`week:<周一>`）。右侧三档 high / medium / low 是画笔，拖矩形选中后点档位上色，橡皮擦回 unset。
- 时间标签架读 `TagService` 的时间标签树：一级标签可展开子标签，点标签＝给当前选区上色；收起后只显示色块。
- 底色、边框、文字全部来自宿主 token（`--dsw-alias-*`），明暗主题跟随 DSH，不定义自己的调色板。

Host 半通过 `ctx.connection.fetch.register` 注册两个精确、受宿主认证保护的 route：

- `GET /api/secretary.state?anchor=YYYY-MM-DD&timeZone=…&weekStart=YYYY-MM-DD`：返回 7 天窗口的 `actual`/`plan`、`weekStart` 那周的 `deep`、`tags`，以及 GTD 的 Inbox／Projects／Actions／Next／Forecast。GTD 读取失败只降级为 `warnings`，不影响时间数据。
- `POST /api/secretary.command`：`time.paint`（把选中的 run 从旧记录里切出来再落新块并合并同色相邻块）、`time.replace`（整日回写，撤销用）、`time.update`、`time.delete`、`deep.paint`（一组矩形 set/clear）、以及 `tag.*` / `gtd.*` 原子能力。

route 只调用 `ctx.tags`、`ctx.gtd` 与 `ctx.time`；浏览器不获得 Host Cordis Context，不直接访问 Domain／SQLite，也没有另一套浏览器领域 store。React state 只保存界面选择、浮层草稿和 Host 返回的读取结果。

## 边界

- 标签管理（时间／情境两种 kind 的增删改与拖拽改父级）这一轮没有搬进新壳，`标签` 是占位页；建标签目前走 `secretary_tag` 工具或已有数据。
- 目标、设置是占位。
- 事项沿用既有 `GtdWorkspace`，仍是桌面三栏语义，没有改成原型里的手机单列。
- 没有开始/停止计时、计划模板 apply/undo、粒度切换、并行记录：这些能力留在 Service 层给 agent 用，UI 不再暴露。

`packages/secretary/tests/browser.mjs` 在临时 `DSH_HOME` 启动真实 `dsh web`，用 Chromium 操作生产 client：右栏 tab 的骨架（7 天 × 144 格、抽屉与标题两级、窄列）、拖选上色＋不选＋Delete＋撤销＋reload 存续、备注浮层改标签与备注、实录/计划互不影响、深度时间的画一周／继承／只改本周／重启存续、事项捕获，以及明暗主题下无页面错误。
