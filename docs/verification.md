# Time + Tag 专项验证记录

> 日期：2026-11-03（Asia/Shanghai）。范围仅为 Time + Tag；#6 GTD Review／Repeat／UI 与全产品 #8 暂停。当前 GTD UI 不是终稿，本记录不代表全产品交付。

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
- `packages/secretary/tests/tracer.mjs`：**44/44** 通过，0 skipped／todo／failed。
- `packages/secretary/tests/browser.mjs`：**8/8** 通过，0 skipped／todo／failed。
- 合计 **52 项测试全部通过**。此后为浏览器测试补充 console 监听，并再次实际运行 **8/8** 通过。
- `git diff --check` 无输出、退出码 0。

运行宿主为 DSH **0.2.1-rc.5**。Storage／storage-domain／storage-sqlite 均为 rc5；浏览器测试没有 `allow-version` 或其他版本豁免。

## 2. Service、SQLite 与故障证据

真实 Cordis 公共 tools、Host routes 和临时 SQLite 已覆盖：

1. Plan／Actual 的父标签查询都包含直接父级、子级和孙级关联，按记录 ID 去重；跨 kind 查询与非法时间区间被拒绝。
2. Plan 在 day A 创建后 update 到 day B：A 不再显示、B 显示；随后 apply day A 不会误删已移动到 B 的记录。
3. 跨午夜块在起始日、次日及 target date apply 中使用同一区间重叠语义；undo 精确恢复 before，后续编辑使 undo 拒绝覆盖，Actual／Template 不变。
4. `plan_blocks` 独立记录和 `plan_template_undos` 持久化 before／after，完整关闭／重开后仍可 undo；没有 `plan_days` 双写兼容层。
5. 对多记录 apply／undo 的每一个 PlanBlock put/delete 及 undo record 写入分别注入一次真实 SQLite 失败：补偿后保持完整 before 或 after，失败 apply 不留半套 undo，失败 undo 可重试。ID 允许空洞。
6. 当前 Plan／Actual／Template 和可恢复 undo 中的 Tag 引用均阻止删除；Tag Service 继续防循环和跨 kind。
7. 同一个 `databasePath` 在一次完整关闭／重开后，同时读回 Plan、Actual、PlanTemplate、DeepTime、Tag，不是各领域分别建库。
8. DeepTime 7×24、枚举、点按／区间写入、清除与重开；GTD Completed 与 Actual 独立；公共 tools 与 Host routes 看到同一 Services 事实。

## 3. 真实 Chromium 证据

所有用例都启动隔离 `DSH_HOME` 中的真实 `dsh web` 和生产 client，不使用静态 prototype，不连接真实 desktop profile。

- 日期计划、实录、模板、月历、完整进程停止／重开、10／15／30 分钟、N 等分、48px、跨小时标题和 Shift 编辑。
- 添加／消除／编辑 Undo；recreate 产生新 ID 后，继续撤销较早编辑和添加。Actual 与 Plan 均覆盖整次 erase drag 恢复及后续 Undo 链。
- time 和 context 都通过真实桌面 HTML5 drag/drop 拖到父级并移回根级；Host 重新读取持久化 parentId，Time 画布重新读取 depth。Time→Tags 为 time，GTD→Tags 为 context。
- 通过真实宿主 Account menu → Settings → Appearance 切换浅色／深色。面板计算背景与 `--dsw-alias-bg-base` 一致，计算文字与 `--dsw-alias-label-primary` 一致；两种主题的文字／背景对比度断言均 ≥ 4.5:1。
- light／dark 及既有流程均覆盖 390px 页面无横向溢出。全部 pageerror 为零，非预期 console.error 为零；仅在明确 reload／进程重启用例中分类放行 `ERR_INCOMPLETE_CHUNKED_ENCODING` 和 WebSocket `ERR_CONNECTION_REFUSED` 导航／关闭瞬时错误。

真实截图由同一主题测试设置 `SECRETARY_SCREENSHOT_DIR` 生成，默认测试不写仓库：

- [light：真实宿主与 Time 画布](assets/verification/time-tag-light.png)
- [dark：真实宿主与 Time 画布](assets/verification/time-tag-dark.png)

## 4. Bundle 检查

在 `packages/secretary` 实际运行 `pnpm pack` 成功。tarball 包含：

- `package.json`、`lib/index.js`、`cordis.patch.yml`、`README.md`、`assets/secretary/SKILL.md`。
- `workspace:*` 兄弟依赖已转换为 `0.1.0`；`engines.dsh` 为 `>=0.2.1-rc.5 <0.3.0`；Storage dev 依赖为 rc5。

## 5. 明确未覆盖项与剩余风险

- **未做真实 bundle 安装后的新会话／desktop profile 验收**；由 lead 后续执行。本轮没有修改真实 profile 或远程 Issue。
- #6 的 GTD Review／Repeat／OmniFocus UI、全产品 #8、Goal、统计、预算、对账均未交付；现有 GTD UI 不是终稿。
- 只验收桌面 HTML5 标签层级拖拽，未宣称触摸拖拽。
- 通用添加／消除／编辑 Undo 仍只保存当前会话；模板 undo 才持久化。
- Storage 无跨 record 事务。故障测试覆盖每个单点写入的一次失败和成功补偿；持续介质不可用或补偿自身失败会显式报错，未做进程在多条写入之间崩溃的故障注入。
- DeepTime 一次指针手势仍逐格串行提交，中途失败可能保留部分格子的修改，这是本轮未扩大的既有边界。
- 浏览器测试使用 `DEEPSEEK_API_KEY=browser-test-no-model`，不评价真实模型的语义判断或 Agent 工作流。
