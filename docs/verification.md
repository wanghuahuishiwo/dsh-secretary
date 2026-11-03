# Time + Tag 专项验证记录

> 日期：2026-11-03（Asia/Shanghai）。范围仅为 Time + Tag；#6 GTD Review／Repeat／UI 与全产品 #8 暂停。当前 GTD UI 不是终稿，本记录不代表全产品交付。
>
> 本轮重做：产品面板按已采纳原型 `design/time-tag-prototype.html`（A · 标签架）重写，DOM、类名、样式与宿主 token 映射都以原型为基准；同时修复“一个旧 GTD 记录让整个面板 400、时间与标签全部空白”的阻断缺陷。

## 1. 完整门禁

实际在工作区根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
git diff --check
```

结果：

- frozen lockfile 安装成功，workspace 为 8 个项目；`pnpm build` 构建 7 个包全部成功。
- `packages/secretary/tests/tracer.mjs`：**48/48** 通过，0 skipped／todo／failed。
- `packages/secretary/tests/browser.mjs`：**11/11** 通过，0 skipped／todo／failed。
- 合计 **59 项测试全部通过**。
- `git diff --check` 无输出、退出码 0。

运行宿主为 DSH **0.2.1-rc.5**。Storage／storage-domain／storage-sqlite 均为 rc5；浏览器测试没有 `allow-version` 或其他版本豁免。

## 2. Service、SQLite 与故障证据

真实 Cordis 公共 tools、Host routes 和临时 SQLite 已覆盖：

1. Plan／Actual 的父标签查询都包含直接父级、子级和孙级关联，按记录 ID 去重；跨 kind 查询与非法时间区间被拒绝。
2. Plan 在 day A 创建后 update 到 day B：A 不再显示、B 显示；随后 apply day A 不会误删已移动到 B 的记录。
3. 跨午夜块在起始日、次日及 target date apply 中使用同一区间重叠语义；undo 精确恢复 before，后续编辑使 undo 拒绝覆盖，Actual／Template 不变。
4. `plan_blocks` 独立记录和 `plan_template_undos` 持久化 before／after，完整关闭／重开后仍可 undo；没有 `plan_days` 双写兼容层。
5. 对多记录 apply／undo 的每一个 PlanBlock put/delete 及 undo record 写入分别注入一次真实 SQLite 失败：补偿后保持完整 before 或 after，失败 apply 不留半套 undo，失败 undo 可重试。ID 允许空洞。
6. 当前 Plan／Actual／Template 和仍可执行的 template undo 中的 Tag 引用均阻止删除；后续编辑使 undo 失效后，不再被当前事实引用的 before／after Tag 可删除。Tag Service 继续防循环和跨 kind。
7. 同一个 `databasePath` 在一次完整关闭／重开后，同时读回 Plan、Actual、PlanTemplate、DeepTime、Tag，不是各领域分别建库。
8. DeepTime 7×24、枚举、点按／区间写入、清除与重开；GTD Completed 与 Actual 独立；公共 tools 与 Host routes 看到同一 Services 事实。
9. 用 v1 的真实 `secretary_time` schema（含空 `plan_days`）写入 Actual／Template／Deep，完整关闭后以当前服务重开：三类旧记录逐字段读回，新 `plan_blocks` 可继续写入；domain 保持 version 1，不读取或恢复 `plan_days` 兼容层。
10. 面板 state 路由在 GTD 读取出错时保持 Time／Tag 可用：把 `listInbox`／`listProjects`／`listActions`／`listNextActions`／`listForecast` 都替换为抛错后，`GET /api/secretary.state` 仍返回 200，tags／blocks／deepWeek 正常，GTD 各段降级为空数组并带 `warnings[0].domain === 'gtd'`；同时 `POST /api/secretary.command` 的 Actual 写入仍然成功。真实数据库中那条旧 UUID Inbox 记录正是此前整页 400 的来源，现由同一规则兜住。
11. 对主写入与后续补偿删除各注入一次真实 SQLite 失败，服务显式报 `rollback failed`；完整重开后读回同样的部分 Plan 集合，且不存在可伪造恢复完整 before 的 template undo。该用例证明并记录补偿失败边界，不作为原子性保证。

## 3. 真实 Chromium 证据

所有用例都启动隔离 `DSH_HOME` 中的真实 `dsh web` 和生产 client，不使用静态 prototype，不连接真实 desktop profile。

- 面板结构与原型一致：顶部 brand＋一级模块、Time 分段＋时间格粒度、日期条（含“计划模板”与“撤销模板应用”）、画布状态条（当前画笔／消除状态／开始实录）、24×48px 画布、右侧时间标签架（搜索、层级、父级可选、状态脚注），Float 编辑浮层与月历浮层贴靠触发元素并在视口内收边。
- 时间块按“每个时间格一个绝对定位片段”绘制，同一记录跨格只首格带名称与时间；平行记录按 lane 等分高度。10／15／30 分钟切换、N 等分、48px 行高、跨小时标题与 Shift 编辑均有断言。
- 日期计划与实录：点击格子添加、点同标签记录消除、双击已选标签进入消除态、整段拖刷消除、Shift 点击编辑；模板模式直接在画布上按星期编辑并在应用后互不回写。
- 编辑浮层为一次性提交：标签、备注、开始／结束时刻、来源与专注档位在“保存”时合成一条命令并只产生一条 Undo 记录；未改动时保存不写入。
- 顶部撤销入口承载添加／消除／编辑 Undo（栈空时按钮 disabled）；recreate 产生新 ID 后，继续撤销较早编辑和添加。Actual 与 Plan 均覆盖整次 erase drag 恢复及后续 Undo 链。
- 整批 Actual erase 的第二次 delete 注入 HTTP 500：错误以顶部警示条持续可见，首条已删除记录保留 Undo，恢复后首条与未删除的第二条同时存在，随后两次 Undo 依栈序清空两条。
- Plan 跨午夜块在次日消除后 Undo 恢复到原始开始日期；在原日消除、切换到其他日期后 Undo 也恢复原日。两种场景均产生新 ID，且最终无错误提示。
- 三条 Actual 的 erase Undo 在第二次 create 注入 HTTP 500：不误弹栈，已恢复首条与剩余两条命令保留；重试只执行剩余两条，随后较早编辑和三个添加逆操作均正确使用 remap 后的新 ID。
- time 和 context 都通过真实桌面 HTML5 drag/drop 拖到父级并移回根级；Host 重新读取持久化 parentId，Time 画布重新读取 depth。Time→Tags 为 time，GTD→Tags 为 context。
- 通过真实宿主 Account menu → Settings → Appearance 切换浅色／深色。面板计算背景与 `--dsw-alias-bg-base` 一致，计算文字与 `--dsw-alias-label-primary` 一致；两种主题的正文、次级日期按钮、Time 分段选中控件、小时刻度、选中标签（浅色底＋主文案色）、月历及其选中日期、编辑浮层标签／输入／主按钮均做计算样式与对比度断言。文字对比度 ≥ 4.5:1；半透明选中背景先逐层合成到面板背景再计算。
- light／dark 及既有流程均覆盖 390px 页面无横向溢出。全部 pageerror 为零，非预期 console.error 为零；仅在明确 reload／进程重启用例中分类放行 `ERR_INCOMPLETE_CHUNKED_ENCODING` 和 WebSocket `ERR_CONNECTION_REFUSED` 导航／关闭瞬时错误。

截图取自隔离 `dsh web`＋生产 client，预置同一套标签与时间事实（`SECRETARY_SCREENSHOT_DIR` 可选开启，默认不写仓库）：

- [实录 · 浅色](assets/verification/time-tag-light.png) · [实录 · 深色](assets/verification/time-tag-dark.png)
- [计划](assets/verification/time-tag-plan.png) · [计划模板](assets/verification/time-tag-template-mode.png)
- [深度时间](assets/verification/time-tag-deep.png) · [编辑浮层](assets/verification/time-tag-editor.png)
- [标签管理](assets/verification/time-tag-manager.png) · [390px](assets/verification/time-tag-mobile.png)

## 4. Bundle 检查

在 `packages/secretary` 实际运行 `pnpm pack` 成功。tarball 包含：

- `package.json`、`lib/index.js`、`cordis.patch.yml`、`README.md`、`assets/secretary/SKILL.md`。
- `workspace:*` 兄弟依赖已转换为 `0.1.0`；`engines.dsh` 为 `>=0.2.1-rc.5 <0.3.0`；Storage dev 依赖为 rc5。

另外用 desktop profile 配置的完整副本、同一份真实数据库的隔离副本启动完整 Secretary bundle，Time 产品壳可打开，说明 bundle、当前数据文件和生产 client 的组合可运行。该诊断不修改真实数据库。

真实 desktop profile 已补齐 `dsh-secretary-tag` 直接依赖并移除 Statistics 链接。完成 DSH 重启后，插件管理已确认 `secretary-time-block` 与 `secretary-panel` 均为 `active`，新 schema 的 Actual／Plan／Template／Deep 表已初始化；当前等待用户完成“出现 → 消除 → 撤销恢复”等人工冒烟验收，不能把 active 状态直接写成人工验收通过。真实数据库中另有旧 UUID GTD Inbox 记录不符合新 schema；按“不做旧数据迁移、#6 暂停”的决定未擅自修改，这与 Time + Tag 验收分开记录。

## 5. 明确未覆盖项与剩余风险

- 旧 UUID GTD 记录不再阻断面板；失败降级为可关闭的顶部警示条。**人工冒烟仍需用户本人完成**：出现 → 消除 → 撤销恢复，以及模板、深度时间、标签拖拽。不以插件状态、隔离副本或自动化断言替代人工结论。远程 Issue 未修改交付状态。
- #6 的 GTD Review／Repeat／OmniFocus UI、全产品 #8、Goal、统计、预算、对账均未交付；现有 GTD UI 不是终稿。
- 只验收桌面 HTML5 标签层级拖拽，未宣称触摸拖拽。
- 通用添加／消除／编辑 Undo 仍只保存当前会话；模板 undo 才持久化。
- Storage 无跨 record 事务，不能声称所有故障下绝对原子。单点写入失败且补偿成功已逐项覆盖；另已覆盖主写入与补偿删除连续失败，服务显式报错，部分事实在重开后仍存在。持续介质不可用、其他二次失败组合及进程在多条写入之间崩溃仍不保证自动恢复。
- DeepTime 一次指针手势仍逐格串行提交，中途失败可能保留部分格子的修改，这是本轮未扩大的既有边界。
- 浏览器测试使用 `DEEPSEEK_API_KEY=browser-test-no-model`，不评价真实模型的语义判断或 Agent 工作流。
