# 交接文档：小秘书（个人 AI 秘书，v0 → dsh 插件）

> 生成：2026-10-26 · 来源 session：小秘书产品形态讨论 + 钉钉通道实测
> **你要做什么**：在这个项目里继续设计并开发小秘书。产品形态和通道已关闭，不要重新讨论；你的工作是实现。

## 一句话定位

提醒工具告诉你「什么时候做什么」；**秘书把「做这件事要用的东西」提前放到你手上**。计划、提醒都是手段，**材料预置是灵魂**。

用户原话（2026-10-24）：「能指定计划，按照计划主动去提前准备好相关的材料内容，以及提醒，或者调整日程。」
典型场景：快吃饭了，排队时手里有手机可以**听**（纯听觉、无视觉依赖），坐下时可以**看文本**（单页、低交互）——同一份材料要跨两种情境承接。

## 已拍板的产品决策（不要重新讨论）

1. **三层形态**：
   ```
   [通道 adapter]  钉钉 TMCP（已验证） │ 未来 dsh 手机端 │ …
                      ↑ push(message) / on_message(handler)
   [秘书本体]  计划引擎 · 材料预置 · 触发重排 · 状态记忆（常驻进程，当前 Mac）
                      ↓ 读写
   [数据层]    计划(YAML) · 材料库 · 个人配置 —— 全是通用 schema
   ```
2. **产品通用、数据个人**：接口通用（作息/通道/材料源全是配置或 provider），实现只维护用户自己这一份实例。用户原话：「数据是个人的，产品是通用的」。
3. **五模块**：intake（计划文件 + IM 自然语言，后者落进前者）/ **stager**（材料预置流水线：检索→下载→转格式→按通道与时长切分→入库→直链；生命周期：需求→备货中→就绪→已投递→已消费）/ scheduler（三类触发：块前就绪、到点提醒、变化重排；重排=按约束重新求解，不是顺延）/ state（执行进度、消费记录、偏好、**承诺台账**：「回头再说」到点主动来找人）/ channels（adapter）。
4. **消息三段式**：一句安排 + 材料链接 + 快捷回应（好 / 推迟 / 跳过）。**每天主动消息 ≤ 5 条**，宁可漏推不要多推。
5. **IM 纪律（所有通道通用）**：敏感内容（财务、凭据、家庭细节）不在 IM 发明文，只推「有更新，回电脑看」。
6. **先 v0 后 v1**：v0 纯后台零 UI，用现成原语跑真实循环验证价值；跑顺了才固化成 dsh 插件。防「元工具做到 80%、正事没动」。
7. **本体跑在当前 Mac**。已知边界：Mac 睡眠 = 断连，v0 接受盲区，后续 launchd 唤醒 + caffeinate 缓解。
8. 公司不装微信/钉钉客户端的限制不影响本形态——推送是 Mac 向外发 websocket，不是装 IM 客户端。
9. **公司禁用 hermes 和 openclaw 两个 app——只借通道，绝不启动这两个应用。** 本机 `~/workspace/openclaw`、`~/workspace/hermes-agent` 是源码参考仓库，只读不跑。

## 通道交接（本项目最大的已验证资产）

通道 = **钉钉「Hermes个人助手」 ←→ TMCP websocket**（公司内部 OpenClaw/TMCP 基础设施）。

### 已实测（2026-10-26，双侧确认）

| 项 | 结果 |
|---|---|
| 连接 + JWT 认证 | ✅ ConnectedEvent：user_id=122241，server 1.2.1 |
| 主动推送（它找你） | ✅ 用户未说话，agent 侧发出，钉钉实时收到 |
| 接收（你找它） | ✅ InboundMessage 秒级 |
| 寻址规则 | **conversation_id = 目标用户 ID（122241），不是会话 ID**。会话 ID（cidrb… 格式）会被拒：`TARGET_NOT_SELF`——服务器强制只能发给自己，天然个人边界 |
| 多实例共存 | ✅ 不同 instanceId 互不干扰 |

### 协议要点

- URL：`wss://open-claw.alibaba-inc.com/ws/dingtalk?token=<JWT>&channelId=hermes_default&instanceId=<uuid>&instanceName=<name>&agentType=hermes`
- 子协议 `tmcp.v1`；二进制帧 = `TmcpFrame`（protobuf）；30s 心跳（fire-and-forget）
- 帧类型（proto 定义）：连接生命周期（connected/error/go_away/disconnect_notice/heartbeat）、inbound_message（含文本/图片/语音，语音带 ASR recognition）、send_text_req/resp、媒体上传下载、**AI 卡片全套（create/stream/finish + CardCallback 按钮回调）**、表情、群生命周期、群绑定
- protobuf 定义可直接复用，不用重新生成：pipx 包 `hermes-tmcp-dingtalk` 0.2.16 的 site-packages：
  `/Users/wanghuahui/Library/Application Support/pipx/venvs/hermes-tmcp-dingtalk/lib/python3.12/site-packages/hermes_tmcp_dingtalk/proto/tmcp_channel_dingtalk_v1_pb2.py`
  （该 venv 的 python 也装了 websockets/protobuf，`verify/` 脚本就是用它跑的）
- 连接管理参考实现（心跳/重连/request-response 关联）：同包 `tmcp_client.py` + `connection_manager.py`，可读抄思路，不依赖其代码

### 凭据

- 在 `./.env`（已 gitignore）：token、channel_id、target user id、robot_code
- 申请入口（内网）：https://tace.alibaba-inc.com/#/hermes-plugins
- token 无 exp 字段，失效就去重新申请；2026-10-26 曾出现在会话记录中，介意则吊销重发

### 验证脚本（可直接跑）

- `verify/tmcp_verify2.py`：连接 → 主动推一条 → 监听 10 分钟 → 收到自动回。用法：
  `"/Users/wanghuahui/Library/Application Support/pipx/venvs/hermes-tmcp-dingtalk/bin/python" verify/tmcp_verify2.py "$TMCP_ACCESS_TOKEN"`
- `verify/tmcp_send_once.py`：一次性主动发送（30s 窗口）

### 协议已确认、未实测（v0 跑起来后补验）

- **断连期间消息是否补发**（Mac 睡眠时用户发的消息，重连后会不会丢）——决定要不要做消息补偿
- AI 卡片 + 按钮回调（快捷回应「好/推迟/跳过」的根基；ConnectedEvent 里 card_template_id 为空，可能要申请模板）
- 语音/图片收发（通勤场景语音指令的通道）

## 你要建的：v0

范围：**纯后台、零 UI**。计划 = YAML 文件；循环 = 定时原语（DSH schedule / launchd / cron 均可，选型你定）；通道 = TMCP 常驻小进程（launchd 保活）；材料 = 一个目录。界面就是钉钉消息 + Markdown 台账。

建议开工顺序（按风险与价值排）：

1. **通道 adapter（TMCP）**——刚实测完，趁热固化成 `connect / push / on_message / 心跳重连` 的干净模块（这是本产品第一块正式代码，也是将来 dsh 插件的通道层）
2. **stager**——材料预置流水线，产品灵魂，唯一有真技术难度的模块。可复用的现成链路：B 站视频「短链→元数据→音频下载→ffmpeg→whisper 转写→LLM 总结」已在本机跑通（见知识库 inbox「通勤认知助手」构想）
3. **scheduler**——三类触发 + 重排
4. **intake**——YAML 计划 schema + IM 自然语言解析

数据 schema 提醒：计划/材料/配置都是通用 schema；用户的 life-plan（`~/my_knowledge/life-plan/`）只是**配置的数据源之一**，设计上不许依赖它的具体数字。

## v1 及以后（现在不做，知道方向即可）

- 固化成 dsh 插件。**命名（2026-10-26 定）**：目录 = 仓库 = 包名 = **`dsh-plugin-secretary`**，对齐 dsh 社区主流（官方插件市场文档示例 `dsh-plugin-foo`；GitHub `dsh-plugin` 前缀仓库 4500+，awesome 列表按此前缀自动收录）。dsh checkout：`/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/`；插件开发参照 `~/workspace/skill-tree-plugin`；客户端插件 HMR 需同时跑 `pnpm run dev:web`，其余改动需重建 Web 产物并刷新验证
- AI 卡片快捷按钮（好/推迟/跳过）
- dsh 手机端 = 新 adapter（用户有计划开发 dsh 移动端；小秘书是它最自然的杀手级用例）
- Readest 作材料面的消费终端（开源阅读器，全平台含 iOS/Android，支持 Markdown/EPUB、TTS 朗读、跨设备进度同步——「排队听→坐下看」的承接由它免费解决；见 https://github.com/readest/readest）

## 相关文档

- 设计档案（本项目的知识库侧档案，含验证记录全文）：`~/my_knowledge/projects/secretary/00-index.md`
- 作品线产品表：`~/my_knowledge/life-plan/10-作品线.md`（⚠️ gitignore，含敏感信息）
- 时间预算（材料预置要填的时间块的真相）：`~/my_knowledge/life-plan/04-时间与精力.md` + `04a-作息与通勤.md`（⚠️ gitignore；**内容是大纲草稿非终稿，只作需求参考，不作为设计依赖**）
- GTD 数据仓库：`~/workspace/gtd/`（秘书是它的执行层，不是替代品；绝不另立一套待办）

## 用户协作偏好（务必遵守）

- 中文回复，专业术语保留英文
- 最小实现；不替用户做假设，不确定就问；有多种解读就列出来
- 反对教科书式拆分（「写了跟没写一样」）、反对过度设计、反对先建项目后问
- 验证文化：声称完成前必须实际跑过并确认输出；能跑真实验证就不写纸面设计
- 学习/研究类内容产出进 `~/my_knowledge/inbox/`（知识收件箱），行动类进 `~/workspace/gtd/inbox/`（GTD 收件箱），两码事不要混
- `personal/`、`life-plan/` 已 gitignore，禁止提交与 push

## 建议技能

- `codebase-design`：模块 seam 设计（五模块的接口边界）
- `prototype`：stager 流水线先用一次性原型验证，再定正式架构
- `tdd`：通道 adapter 这类协议代码适合测试先行
