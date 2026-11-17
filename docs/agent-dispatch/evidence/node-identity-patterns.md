# 逻辑节点持久身份：行业机制与 UUID 持久化提议核验

> 状态：只读调研证据，不是架构决策，不修改现有实现。
>
> 问题边界：只讨论逻辑节点在重启、重建、克隆与恢复后保持相同 `source/nodeId` 的身份机制；不把在线实例 ID、Pod UID、宿主机 ID 或稳定网络名混同为通用逻辑节点 ID。
>
> 方法与标注：仅采用官方文档、官方源码和正式标准。**事实**表示来源直接说明或源码直接实现；**推断**表示由这些事实得出的项目适配结论。官方没有给出通用保证的地方明确写“未找到”，不以产品名代替生命周期承诺。所有 URL 的访问日期均为 **2026-11-14**。
>
> 版本说明：Consul 配置文档取 v1.22.x，源码证据固定到访问时的 `main` commit；Kubernetes 文档对应当前官网及其 `main` 文档源；`machine-id(5)` 页面显示 systemd 262；NATS 文档显示 2.15；SPIRE 源码固定到访问时的 `main` commit。具体实施仍应固定并复测所采用版本。

## 1. 结论摘要

### 1.1 事实

1. **“初始化时创建或获发身份、将身份状态放入 durable storage、后续启动复用”有多个直接官方实现。** Consul 未显式配置 `node_id` 时，会在启动时生成 ID 并持久化到 data directory；`/etc/machine-id` 通常在安装或首次启动时生成并在后续启动保持不变；SPIRE Agent 在 node attestation 后获得 SPIFFE ID/SVID，并可把 agent 私钥与 SVID 状态持久化到磁盘。[C1][C2][C3][M1][S1][S2][S3]
2. **持久 ID 与单次运行实例 ID 是被明确区分的不同概念。** Kubernetes replacement Pod 即使名字相同也会有不同 UID；StatefulSet 保持的是 ordinal、稳定网络身份及相应稳定存储。NATS Services 为每个新 running copy 自动生成新的 service ID，用于在线发现，不提供持久逻辑身份语义。[K1][K2][N1][N2][N3]
3. **稳定身份的适用范围都不是无限的。** Consul `node_id` 是节点跨名称/地址变化的唯一标识；StatefulSet 的 stable 是跨 Pod `(re)scheduling`；`machine-id` 标识 local system/host；NATS service ID 标识一个 running copy。[C1][K1][M1][N1]
4. **持久化不能阻止复制状态造成重复身份。** Consul 官方 gossip merge 代码会拒绝冲突 node ID；systemd 官方要求 golden image 清除或重置 `/etc/machine-id`，否则所有实例会以相同 ID 启动。[C4][M2]
5. **长期逻辑 ID 与可轮换凭据是两个生命周期。** SPIRE 的 join token 一次性使用，agent 私钥可从磁盘重载，但证书过期后需要重新 attestation；持久 UUID 本身并不提供认证或防伪。[S1][S2][U1]

### 1.2 推断

1. **此前“首次初始化生成随机 UUID、持久化、本机启动只读、缺失报错、显式新建/恢复”的主方向符合行业模式。** 其中“随机生成后持久保存并只读复用”与 Consul 的 `disable_host_node_id=true` 路径尤其接近；“显式新建/恢复”也正确覆盖了克隆和灾备边界。[C1][C3][M2][S2][S3]
2. **“缺失报错”是合理的项目安全策略，但不是所核验产品的统一默认。** Consul 在缺少持久 `node-id` 文件时会生成并写入；systemd 在 `/etc/machine-id` 缺失或为空时会尝试建立并保存新 ID；SPIRE 可在需要时重新 attestation。项目若要不接受静默换号，应把“首次 provisioning”与“已部署节点普通启动”明确分开，只在后者实行缺失失败。[C3][M1][S1]
3. **建议把自动生成的 UUID 放在专用持久状态文件/目录，而不是可被日常配置重写覆盖的一般配置文件。** Consul 将自动 ID 放在 `data_dir/node-id`，SPIRE 将 agent 状态放在 data directory，这更接近“身份状态所有权明确、启动只读”的模式。[C2][C3][S3]
4. **仅保存随机 UUID 不足以解决克隆。** 同一份状态复制到两个实例会复制同一个 ID；同一备份恢复两次也有同样问题。必须有中心侧唯一性检查、显式恢复授权及“恢复后只允许一个逻辑实例持有该身份”的运维边界。[C4][M2]
5. **不应直接把 NATS Services instance ID 或 `/etc/machine-id` 当作本项目的长期逻辑 `source/nodeId`。** 前者是 fresh-per-running-copy；后者是 host 级且有保密与克隆约束。StatefulSet 名称/ordinal 只能在明确限定 cluster、namespace、StatefulSet 与 ordinal 的部署契约中作为稳定标识输入，不能外推为所有场景的通用 ID。[K1][K2][K3][M1][M2][N1][N3]

## 2. 行业共同模式

以下“共同模式”是对所核验一手实现的归纳，不表示存在一份跨产品的统一节点身份协议。

| 模式 | 官方事实依据 | 对本问题的含义（推断） |
|---|---|---|
| **逻辑身份与运行实例身份分层** | Consul 持久 `node_id`；StatefulSet stable identity 与 replacement Pod UID 分离；NATS 每个 running copy 新 service ID。[C1][K1][K2][N1] | `source/nodeId` 应属于长期逻辑身份层，不应复用进程、连接或单次 Pod 实例的临时标识。 |
| **初始化/登记时创建，后续复用持久状态** | Consul 写 `data_dir/node-id`；systemd 保存 `/etc/machine-id`；SPIRE attestation 后保存 agent 身份状态与私钥。[C3][M1][S1][S2][S3] | 首次初始化生成一次 UUID、之后只读，是有直接行业依据的流程。 |
| **身份稳定依赖 durable state，而非随机算法本身** | Consul 要求 data directory durable across reboots；SPIRE `disk` KeyManager 重启时从磁盘加载 key。[C2][S2] | 状态目录必须纳入重装、卷挂载、备份和权限设计；随机 UUID 只降低意外碰撞概率，不负责持久性。 |
| **稳定身份有明确作用域** | StatefulSet 的 stable 限定为 Pod rescheduling；`machine-id` 是 host 标识；NATS ID 是 running copy 标识。[K1][M1][N1] | 项目需先定义节点身份的唯一作用域与何时算“同一逻辑节点”，再谈 UUID 是否保持不变。 |
| **重复身份需要显式约束** | Consul merge 对冲突 node ID 返回错误；systemd 要求通用镜像重置机器 ID。[C4][M2] | 中心侧应拒绝不同节点重复占用同一 ID；镜像、克隆和恢复流程不能无审查复制身份。 |
| **身份与凭据可以一起 provisioning，但后续生命周期不同** | SPIRE join token 一次性使用；SVID/私钥可持久化，证书过期需重新 attestation。[S1][S2] | UUID 可长期不变，认证密钥/证书可以轮换；不能把 UUID 当 secret，也不能用凭据轮换暗示换逻辑 ID。 |
| **缺失状态的默认处理并不统一** | Consul 与 systemd 会初始化缺失 ID；SPIRE 可重新 attestation；Consul 对已存在但非法的持久 UUID 则报错。[C3][M1][S1] | “普通启动缺失即失败”应被写成本项目防静默换号的显式选择，而非宣称行业都如此。 |

## 3. 各官方机制

### 3.1 Consul：`node_id` 与 `data_dir/node-id`

#### 事实

- `node_id` 支持显式配置，格式为 36 字符 UUID 字符串；官方将其定义为即使节点名称或地址改变也跨时间保持唯一的节点标识。[C1]
- 未提供 `node_id` 时，agent 在启动时生成 ID，并持久化到 data directory，使 agent 重启后保持不变。默认会尽可能利用 host 信息生成 deterministic node ID；`disable_host_node_id=true` 才改为生成随机 ID 并持久化。[C1]
- `data_dir` 是所有 agent 必需的状态目录，官方要求其 **durable across reboots**，并支持 filesystem locking。[C2]
- 官方 `newNodeIDFromConfig` 实现的优先级是：
  1. 若配置中已有 `node_id`，校验并直接采用；
  2. 否则若 `<data_dir>/node-id` 存在，读取、规范化为小写并校验 UUID；
  3. 否则生成 ID，写入 `<data_dir>/node-id`，权限为 `0600`。
  已存在但内容非法的持久 ID 会返回错误；显式配置路径本身不会把该值写入这个文件。[C3]
- 官方 `lanMergeDelegate.NotifyMerge` 会检查冲突：相同 node ID 对应不同节点名，或待合并成员之间两个节点使用相同 node ID，都会返回错误并中止 merge。代码注释明确说明 node IDs 对运行至关重要，只允许加入身份无冲突的集群。[C4]

#### 推断与边界

- **重装是否保持 ID，关键不是二进制是否重装，而是显式 `node_id` 或 data directory 是否保留。** 保留与原身份一致的显式配置或 data directory，即可按上述优先级复用；清空 data directory 且没有显式配置，会重新走生成路径。
- **复制 data directory 会复制 `node-id`。** 因而“备份用于替换同一逻辑节点”与“复制用于创建另一节点”必须分开；后者会产生重复身份，Consul 的 merge 检查提供了直接行业证据。
- **不能把 Consul 概括为始终随机 UUID。** 默认 deterministic host-based ID 与其 `disable_host_node_id` 随机模式都受官方支持；本项目明确选择随机 UUID，更接近后者。[C1][C3]

### 3.2 Kubernetes StatefulSet：stable ordinal/network identity 与 Pod UID

#### 事实

- StatefulSet 适用于需要稳定且唯一网络标识、稳定持久存储等场景；这里的 **stable** 明确定义为跨 Pod `(re)scheduling` 保持。[K1]
- StatefulSet Pod 身份由 **ordinal、stable network identity、stable storage** 组成。默认 ordinal 从 `0` 到 `N-1`；Pod hostname 为 `$(statefulset name)-$(ordinal)`，配合用户负责创建的 Headless Service 形成相应 DNS 名称。[K1]
- 每个 Pod 创建时获得唯一 UID。Kubernetes 明确说明：同一个 UID 定义的 Pod 不会被重新调度到另一节点；replacement Pod 即使 `.metadata.name` 相同，也一定有不同 `.metadata.uid`。[K2]
- kubelet 对容器的重启是在**同一 Pod、同一节点**中创建 replacement containers，因此不能与 Pod 删除重建混为一谈。[K2]
- StatefulSet 的 PVC 默认保留；replacement Pod 可继续使用原 PVC。删除或缩容 StatefulSet 时是否删除 PVC 还受 retention policy 控制，稳定存储不是无条件永久保留。[K1]
- Kubernetes 名称的唯一性依赖 API group、resource type、namespace 与 name；UID 则是另一类对象标识。官方还特别警告：物理 host 以同名重建、但没有删除重建 Node 对象时，Kubernetes 会把新 host 当旧 host，可能导致不一致。[K3]

#### 推断与边界

- **容器/进程重启且 Pod 对象未重建：ordinal、网络名和 Pod UID 都保持。** **Pod 重建：ordinal 与相应网络名可按 StatefulSet 契约保持，Pod UID 改变。** 这是两种不同生命周期。[K1][K2]
- **稳定 DNS 名不是任意场景通用的逻辑节点 ID。** 它依赖 Headless Service、namespace、cluster domain 和 StatefulSet 的存在；跨集群、跨 namespace、删除后另建控制器或复制 manifest 时，名称可能相同但对象与底层实例已不同。若项目采用它，必须把完整作用域及重建边界写入部署契约，不能只取 `web-0` 作为全局身份。[K1][K3]
- 本次未找到 Kubernetes 对任意备份工具、跨集群恢复或克隆后的“逻辑应用节点 ID”作出的统一保证；应按是否仍为同一 API 对象及是否保留持久状态逐项判断。

### 3.3 Linux `/etc/machine-id`：host 身份，不是任意应用节点身份

#### 事实

- `/etc/machine-id` 包含 local system 的 machine ID，为 128-bit 值的小写十六进制表示；通常在安装或首次启动时从随机源生成，之后各次启动保持不变。硬件替换或本地/网络配置变化本身不会改变它。[M1]
- 它也可以被显式 provision，或受 kernel command line、D-Bus machine ID、虚拟机/固件信息等来源影响；因此“生成 machine ID”并不在所有路径上都等于独立随机 UUID。[M1]
- 官方将其定义为**唯一标识 host**，同时要求把它视为 confidential，尤其不得暴露到不受信任的网络。应用若需要与机器绑定的稳定唯一标识，**不得直接使用原 machine ID 或其一部分**，应使用固定 application-specific key 做带密钥密码学哈希；官方提供 `sd_id128_get_machine_app_specific(3)`。[M1]
- 对一次制作、部署到多台机器的 generic/golden image，官方要求 `/etc/machine-id` 缺失、为空或按镜像构建指南方针重置，使每个实例在首次启动获得自己的 ID。若镜像保留有效 ID，所有实例会以相同 ID 启动，并可能使从它派生的网络标识发生冲突。[M1][M2]
- 文件缺失或为空时，systemd 会尝试建立 machine ID 并保存；无法立即写入时还存在临时 bind mount 与稍后 commit 的机制。因此缺失并不天然意味着应用启动失败。[M1]

#### 推断与边界

- **它不能直接作为所有应用节点 ID：** 一台 host 上可以有多个独立逻辑节点，一个逻辑节点也可能按产品定义迁到另一 host；host 作用域与应用逻辑作用域不同。官方还要求应用不要直接使用原 machine ID 派生本应用标识，并禁止把原值暴露到不受信任的环境；因此不能不加处理地把它作为网络上通行的 `source/nodeId`。[M1]
- application-specific keyed hash 能解决“不要暴露原 machine ID”和派生值域分离，但**不能自行解决**一机多逻辑节点、克隆后希望换新身份、备份恢复到多个实例或中心注册唯一性；这些仍需项目策略。
- 本次未找到 systemd 对一般应用备份/恢复的专门统一流程。可确定的是有效文件会被后续启动复用；**推断**：包含 `/etc/machine-id` 的备份恢复到同一逻辑 OS 会恢复原 ID，而恢复到多个独立实例会复制该 ID，应与 golden image 一样显式决定去重。

### 3.4 NATS Services instance ID：在线 running copy 标识

#### 事实

- 官方创建服务文档明确：framework 为“this one running copy”自动生成 NUID 形式的 service ID，**You never set it**；service name 标识服务种类，service ID 标识它的一个实例。[N1]
- 水平扩展文档进一步明确：每个新实例都有 fresh auto-generated service ID，且 **You don't register instances anywhere**。停止实例会退订 `$SRV` discovery verbs，使其从在线发现中消失。[N3]
- `$SRV.PING/INFO/STATS` 由当前服务实例订阅并应答；按 name 查询会收集时间窗内的多个 responders，按 ID 可定位一个 running instance。INFO schema 将 `id` 定义为 “A unique ID for this instance of a service”。[N2][N4]

#### 推断与未找到项

- 这些官方语义直接支持“**NATS Services instance ID 是在线运行实例标识**”，不支持把它作为跨进程重启保持不变的长期逻辑节点 ID。重新创建服务实例会得到 fresh ID，也没有需要由应用持久化并恢复的 instance registry。[N1][N3]
- 本次在 Services 创建、discovery、scaling 与 INFO schema 官方资料中，**未找到** instance ID 跨重启复用、持久化、备份恢复或作为长期逻辑身份的保证。若另由应用长期保存一个 NATS ID，那已成为应用自定义语义，不再是 NATS Services 所提供的保证。

### 3.5 补充实现：SPIRE 的 node attestation 后持久保存身份与凭据

#### 事实

- SPIRE Agent 首次连接 Server 时进行 node attestation；成功结果为 agent 获得唯一 SPIFFE ID，Server 再向 agent 签发 SVID。使用 server-generated join token 时，token 是预共享密钥，并在使用后立即过期。[S1]
- 官方 `KeyManager "disk"` 插件为 agent identity 生成 key pair 并保存私钥；agent 重启时从磁盘加载 key。若离线时间长到证书过期，需要重新 attestation。相对地，`memory` KeyManager 不保存私钥，重启后必须重新 attestation。[S2]
- 官方 agent storage 接口提供 `LoadSVID/StoreSVID` 与 `LoadBundle/StoreBundle`；当前实现把 SVID、bundle 和 attestation 相关状态序列化到 `<data_dir>/agent-data.json`，写文件使用 `diskutil.AtomicWritePrivateFile`。[S3]

#### 推断与边界

- 这是一个直接的“**一次性 enrollment 证据 → node attestation → 获发身份与凭据 → durable state → 重启复用，必要时重新 attestation**”官方实现。[S1][S2][S3]
- 它同时证明：持久逻辑身份、私钥保存、证书有效期和重新登记不是同一件事。项目可以把 UUID 设计为长期稳定，同时独立轮换认证凭据。
- 本次未找到“所有 NodeAttestor 在任意重新 attestation 后都必然返回同一个 SPIFFE ID”的统一承诺，也未找到 SPIRE 对克隆/多次恢复同一 agent 私钥与 SVID 的通用安全保证。因此它支持持久化模式，但不能被引用来证明任意克隆/恢复都保持且只允许一个身份。

## 4. 生命周期对照表

**读表约定：** “普通重启”指 OS/machine reboot 且 durable disk 保留；“进程重启”指同一运行环境内重新执行进程；“重建”按各行注明是软件、Pod 或系统替换。表中结论除明确标为“推断”的单元外均来自官方语义；“未找到统一保证”不是断言永远变化，而是不能据此作出承诺。

| 机制 | 首次创建 | 普通重启 | 进程重启 | 重建 | 克隆 | 备份恢复 | 配置丢失 |
|---|---|---|---|---|---|---|---|
| **Consul `node_id`** | 显式配置，或启动时生成并写 `<data_dir>/node-id`；默认可为 host-deterministic，`disable_host_node_id=true` 为随机。[C1][C3] | data directory durable 时复用同一 ID。[C1][C2] | 同一 data directory/配置下复用同一 ID。[C3] | **推断：** 保留显式配置或 data directory 则保持；两者均清除则重新生成。默认 host-based 路径不应当作跨所有重装的随机新 ID 保证。 | **推断：** 复制 data directory 即复制 ID；Consul merge 拒绝冲突 node ID。[C4] | **推断：** 恢复 data directory 即恢复原 ID；同一份恢复给多个活动节点会重复。无 data directory 的备份不包含自动生成的 ID。 | 自动 ID 仍在 data directory 时不受一般配置丢失影响；若此前只有显式 `node_id` 且从未生成过 `node-id` 文件，配置丢失后会走生成路径。[C3] |
| **StatefulSet + Pod** | controller 分配 ordinal；构造相应 hostname/DNS；每个新 Pod 获得 UID。[K1][K2] | 若仍是同一 Pod 对象，ordinal/网络名/UID 不变；若 node failure 导致 replacement，则名字可相同而 UID 改变。[K1][K2] | kubelet 在同一 Pod 内重启 replacement containers，Pod UID 不变。[K2] | Pod 重建后 ordinal/网络名按同一 StatefulSet 契约保持，UID 改变；PVC 是否保留按相应机制与策略。[K1][K2] | 未找到跨 cluster/namespace/控制器克隆的统一逻辑 ID 保证；名称可复用不代表同一 UID 或同一逻辑对象。[K3] | 未找到任意备份恢复场景的统一保证；必须区分原对象是否仍在、是否创建新 UID、持久卷是否恢复。 | manifest 丢失不影响已存在 Pod 的 UID；但若控制器/对象被删除后另建，不能把旧名称外推为所有层面的原身份。[K2][K3] |
| **`/etc/machine-id`** | 安装或首次 boot 时 provision/生成并保存；可有随机及平台提供等多种来源。[M1] | 有效持久文件存在时保持不变。[M1] | 进程重启不改变该文件所表示的 host ID。[M1] | **推断：** 保留 `/etc` 与有效文件则保持；全新安装且文件缺失/为空时重新建立。硬件替换本身不改变已有 ID。[M1] | golden image 必须重置，否则所有实例得到相同 ID；这是官方明确警告。[M2] | 未找到专门通用备份流程。**推断：** 恢复有效文件即恢复原 host ID；多实例恢复同一文件即重复。 | 文件本身缺失/为空时 systemd 会尝试建立并保存 ID，而不是天然报错；也可由显式参数/平台来源提供。[M1] |
| **NATS Services ID** | `AddService` 为一个 running copy 自动生成 NUID。[N1] | 新 running copy 创建时得到 fresh ID；未找到持久复用承诺。[N1][N3] | 重新创建服务实例即新的 running copy，fresh ID。[N1][N3] | 新实例 fresh ID；官方说明实例不需要注册，停止后退出在线 discovery。[N3] | 未找到长期身份或克隆语义；不应复用为本项目持久 ID。 | 未找到 instance ID 备份恢复语义；持久化是应用自定义行为，不是 Services 保证。 | 创建配置不要求用户设置 ID；未找到通过配置恢复长期 instance ID 的官方语义。[N1] |
| **SPIRE Agent（disk KeyManager + agent storage）** | 一次性 join token 等证据完成 attestation，获发唯一 SPIFFE ID/SVID；私钥与 SVID 状态可落盘。[S1][S2][S3] | disk key 重启时加载；持久 SVID 可读取；证书过期需重新 attestation。[S2][S3] | 同普通进程重启；使用 memory KeyManager 则必须重新 attestation。[S2] | **推断：** 保留兼容 data directory/key 时可复用仍有效状态；缺失或过期时重新 attestation。重新 attestation 是否同一 SPIFFE ID 取决于具体机制，未找到统一保证。 | 未找到通用克隆保证。**推断：** 复制私钥/SVID 会复制认证能力，不能把文件复制当作新节点 provisioning。 | **推断：** 可读取恢复的有效 key/SVID；过期仍需重新 attestation。多次恢复相同秘密会复制凭据，未找到官方唯一性承诺。 | 一次性 join token 不能作为以后可重复使用的恢复凭据；需仍有效的持久状态或新的合法 attestation 证据。[S1][S2] |

## 5. 对本项目 UUID 持久化提议的支持与冲突

以下为**推断/适配判断**，不是上述产品替本项目作出的决定。

| 此前提议 | 判断 | 行业依据与必要修正 |
|---|---|---|
| **首次初始化生成随机 UUID** | **支持，但应明确为 provisioning 行为。** | Consul 支持随机生成并持久化的模式，systemd 也支持安装/首启随机生成；RFC 9562 的 UUIDv4 是随机或伪随机 UUID 标准形式。[C1][C3][M1][U1] 但 Consul 默认还可能用 host-deterministic ID，所以“行业全部随机”不成立。项目应采用明确随机路径，不依赖主机名、IP 或 Pod UID。 |
| **持久化到本机配置** | **支持本机持久化；建议改为专用身份状态文件/目录。** | Consul 自动 ID 属于 data directory，SPIRE agent 状态也在 data directory，而非每次由用户编辑的普通配置。[C2][C3][S3] 应明确唯一 owner、durable 路径、权限、原子写入与备份归属，避免日常配置覆盖意外换号。 |
| **普通启动只读** | **支持。** | Consul 对已有 `node-id` 是读取和校验，SPIRE 对已有 key/SVID 是加载复用。[C3][S2][S3] 普通启动不应重新 mint UUID，也不应把修复配置、重新登记和常规启动混为一个隐式动作。 |
| **缺失报错** | **与所核验产品默认不同，但作为防静默换号策略合理。** | Consul/systemd 缺失时会自动初始化，SPIRE 可重新 attestation，所以不能说这是统一行业默认。[C3][M1][S1] 项目可规定：首次 `init` 是唯一自动创建入口；已部署节点普通启动若状态缺失、不可读、损坏或 UUID 非法均失败，并提示显式 `init` 或 `restore`，不得自动换一个身份继续。 |
| **显式新建身份** | **支持，需防止覆盖既有身份。** | systemd 把初始化/重置放在 first-boot/image provisioning 边界，SPIRE 把新身份获取放在 attestation 流程。[M2][S1] 项目的 `new/init` 应是独立显式操作；已有身份时默认拒绝覆盖，是否允许强制更换需另行决策。 |
| **显式恢复身份** | **支持且必要，但不是可直接照抄的统一产品命令。** | Consul 表明恢复 data directory 就恢复 ID，同时重复 ID 会被拒绝；SPIRE 表明身份与凭据可一并持久化。[C3][C4][S3] 恢复必须校验备份、目标作用域和当前占用，不得把同一备份无约束恢复到多个活动实例。具体恢复命令、审批和冲突处理属于项目策略。 |
| **用 UUID 本身保障身份** | **需要修正表述：UUID 只提供标识，不提供认证或唯一活跃的保证。** | Consul 还需 merge 冲突检查，SPIRE 另有私钥/SVID/attestation。[C4][S1][S2] 项目应把“稳定 nodeId”“中心唯一注册”“认证凭据”“单次运行实例标识”分别定义。 |

## 6. 推荐的具体保障流程（推断）

### 6.1 先固定不变量

1. `source/nodeId` 是**逻辑节点持久 ID**，至少在项目定义的中心/租户作用域内唯一；普通进程重启和 OS 重启不变。
2. 同一逻辑节点在保留身份状态或经授权恢复后，重装软件/更换进程不变；新克隆节点默认应获得新 ID。
3. NATS service ID、进程 ID、连接 ID、Pod UID 等运行实例标识若被使用，应另设字段，不写回持久 `nodeId`。
4. UUID 不是认证秘密；身份认证凭据与 UUID 绑定，但可独立轮换。[C4][S1][S2][U1]

### 6.2 首次 `init` / provisioning

1. 仅在用户或部署系统显式执行初始化时运行；若目标身份文件已存在，默认停止，不覆盖。
2. 使用操作系统/CSPRNG 生成 **UUIDv4**，按统一 canonical 文本形式保存；不要把 hostname、IP、MAC、Pod UID 或 NATS instance ID 当作随机性的替代。[U1][K2][N1]
3. 写入专用 durable identity state，例如单独的 `node-identity` 状态文件，而非混在会被日常重写的配置中。最小内容可只有 `formatVersion` 与 `nodeId`，避免把易变运行信息混入身份事实。
4. 采用**原子、私有、create-once** 写入：写私有临时文件并校验，以排他创建预留目标或等价的 **no-clobber** 原子提交完成落盘，限制只有节点运行账户可读；目录与文件权限失败要显式报错，并发初始化不得互相覆盖。SPIRE 的 `AtomicWritePrivateFile` 是原子私有写入的直接官方参照；Consul 的持久 `node-id` 使用 `0600` 是另一参照，no-clobber/create-once 则是本项目为避免并发换号增加的限制。[C3][S3]
5. 若需要中心登记或认证凭据，使用一次性 enrollment 证据完成登记，再把获发/绑定的身份与凭据安全保存。SPIRE 的 one-time join token → attestation → SVID 是直接模式依据；不要让普通启动反复使用一次性 enrollment secret。[S1][S2][S3]
6. 初始化完成后回读并校验 UUID 与登记结果；只有持久化和登记都成功，才把节点视为已 provisioned。

### 6.3 普通启动：只读、验证、失败关闭

1. 以只读方式打开既有身份状态，校验格式版本、canonical UUID、文件权限/所有者及与中心登记或凭据的绑定；读取成功前不生成新随机值。
2. **文件缺失、路径指向空的新状态目录、不可读、损坏、UUID 非法、身份与凭据冲突，分别给出可诊断错误。** 错误应提示“显式初始化新节点”或“显式恢复既有节点”，不能静默换号。Consul 对非法持久 UUID 报错是直接依据；缺失即失败则是本项目更严格的生命周期策略。[C3]
3. 普通启动不改写身份文件；认证证书/密钥的轮换应走独立凭据生命周期，不能顺带更换 `nodeId`。[S1][S2]
4. 启动日志可记录 nodeId 或其明确指纹用于核对，但不输出私钥、enrollment token 等秘密。是否记录完整 UUID 仍需按项目暴露面决定。

### 6.4 普通重启与软件重装

- **普通进程/OS 重启：** 使用同一 durable identity path，启动后 nodeId 必须逐字相同；这是 Consul durable data directory 与 SPIRE disk key 复用的同类保障。[C2][C3][S2]
- **重装但仍是同一逻辑节点：** 保留并重新挂载同一身份目录，或在启动前执行显式恢复；不要先生成新 ID 再从旧记录“猜测”身份。
- **希望成为新逻辑节点的重装：** 必须走显式 `new/init`，中心登记为新身份；不要把“文件恰好丢了”自动解释成用户想新建节点。

### 6.5 克隆与镜像

1. **golden image 不打包已 provisioned 的 node identity 与私钥。** 每个克隆首次启动执行自己的 provisioning。依据是 systemd 对 `/etc/machine-id` 的镜像重置要求。[M2]
2. 若整个运行环境/卷被克隆且身份状态不可避免地被复制，中心必须能发现重复 nodeId 并拒绝不合法的第二个身份使用；Consul merge 的重复 ID 拒绝是直接依据。[C4]
3. “克隆后仍代表同一逻辑节点”与“克隆后是两个逻辑节点”不能由文件内容自行判断，必须由用户选择：前者走显式恢复/替换并保证旧实例不再使用；后者走显式新建并登记新 UUID。

### 6.6 备份与显式 `restore`

1. 把身份文件和必需认证材料视为**secret-bearing identity state** 纳入同一受保护备份；备份只含普通配置而不含自动生成的身份状态，不足以恢复原 ID。[C3][S2][S3]
2. `restore` 只由显式管理操作触发：校验备份完整性、UUID、目标中心/作用域、身份与凭据绑定；目标已有其他身份时默认拒绝覆盖。
3. 恢复前查询中心是否已有相同 nodeId 的登记或活动持有者。若是灾难替换同一逻辑节点，按选定策略撤销/停用旧持有关系；若目标应是另一节点，则不得恢复旧 ID，应改走 `new/init`。[C4][S1]
4. 同一备份不得在多个活动实例上恢复为同一 nodeId。恢复成功后回读验证，并记录一次可审计的身份恢复事件；这与普通启动只读路径分离。

### 6.7 最低验收矩阵（建议）

| 场景 | 必须观察到的结果 |
|---|---|
| 首次 `init` 后连续进程重启、OS 重启 | UUID 完全不变，启动不再写身份文件。 |
| 保留状态目录的软件重装 | UUID 不变；不需要重新生成。 |
| 删除/丢失/损坏身份文件后普通启动 | 明确失败，不产生新 UUID，不连接为新身份。 |
| 已有身份时再次执行 `init/new` | 默认拒绝覆盖；只有明确的新建流程才能产生不同 UUID。 |
| 同一逻辑节点授权恢复备份 | 恢复原 UUID 与对应凭据，恢复过程可审计。 |
| 同一份状态复制/恢复到两个实例 | 中心发现重复 nodeId；至少第二个不合法持有者被拒绝，不能静默共存。 |
| golden image 克隆为新节点 | 不继承已 provisioned 身份；每个节点独立获得 UUID 与凭据。 |
| 凭据轮换或过期 | 按凭据流程更新，持久 `nodeId` 不变。 |

## 7. 仍需用户决定的边界

1. **“同一逻辑节点”的定义与作用域：** 按中心、租户、用户、应用安装、profile 还是其他边界唯一；一台 host 是否允许多个逻辑节点，迁移到另一 host 后何时仍算同一节点。
2. **重装语义：** 保留数据目录的重装默认延续旧身份，还是默认新建；升级已有安装但历史上没有身份文件时，是迁移既有 ID、一次性生成，还是要求用户确认。
3. **克隆与恢复语义：** 是否绝对禁止同 ID 同时在线；灾难替换旧节点时由谁授权、如何确认旧实例已停用，是否允许同 ID 的不同凭据接管。
4. **中心冲突策略：** 相同 nodeId 但凭据不同、相同凭据但从另一环境出现、恢复旧备份与当前登记冲突时，分别拒绝、替换还是需要人工审批。
5. **身份与凭据的存储/备份：** durable path、文件所有者与权限、是否使用 OS secret store/硬件密钥、备份加密与谁能执行恢复；UUID 可非秘密不等于认证材料可明文扩散。
6. **首次 enrollment 是否必须经过中心：** 离线本地生成后补登记是否允许；中心不可用时初始化是否失败；一次性 enrollment token 的签发、过期与撤销由谁负责。
7. **Kubernetes 部署是否采用平台身份输入：** 若采用 StatefulSet stable name/ordinal，需明确是否把 cluster、namespace、StatefulSet 名和 ordinal 全量纳入身份作用域，以及删除控制器、跨集群恢复时是否视为新节点；不能只使用 DNS 短名。
8. **身份退役与复用：** 节点永久删除后 UUID 是否永久不再复用，历史登记保留多久，显式换 ID 后旧身份是否撤销及保留审计。

## 8. 一手来源

以下来源均为官方文档、官方源码或正式标准；访问日期均为 **2026-11-14**。正文 `[编号]` 对应此处。官方源码使用固定 commit，避免把工作树后续变化误当本次证据。

### Consul 官方

- **[C1]** HashiCorp, *Node parameters for Consul agent configuration files*（`node_id` 显式配置、生成与持久化、host-deterministic 与 `disable_host_node_id`）：https://developer.hashicorp.com/consul/docs/v1.22.x/reference/agent/configuration-file/node#node_id ；对应官方文档源：https://github.com/hashicorp/web-unified-docs/blob/5cfc711eb66d05992bc980a9542890e20430a1f4/content/consul/v1.22.x/content/docs/reference/agent/configuration-file/node.mdx （访问日期：2026-11-14）
- **[C2]** HashiCorp, *General parameters for Consul agent configuration*（`data_dir` 必需、durable across reboots、filesystem locking）：https://developer.hashicorp.com/consul/docs/v1.22.x/reference/agent/configuration-file/general#data_dir ；对应官方文档源：https://github.com/hashicorp/web-unified-docs/blob/5cfc711eb66d05992bc980a9542890e20430a1f4/content/consul/v1.22.x/content/docs/reference/agent/configuration-file/general.mdx （访问日期：2026-11-14）
- **[C3]** `hashicorp/consul` 官方源码 `agent/nodeid.go`，`newNodeIDFromConfig` 与 `makeNodeID`（显式配置优先、读取/校验 `data_dir/node-id`、缺失时生成、`0600` 写入、host/random 两路径），commit `42686d513c56de628fcdcbeb8673ff3ae9a607c5`：https://github.com/hashicorp/consul/blob/42686d513c56de628fcdcbeb8673ff3ae9a607c5/agent/nodeid.go （访问日期：2026-11-14）
- **[C4]** `hashicorp/consul` 官方源码 `agent/consul/merge.go`，`lanMergeDelegate.NotifyMerge`（重复/冲突 node ID 使 merge 返回错误），commit `42686d513c56de628fcdcbeb8673ff3ae9a607c5`：https://github.com/hashicorp/consul/blob/42686d513c56de628fcdcbeb8673ff3ae9a607c5/agent/consul/merge.go （访问日期：2026-11-14）

### Kubernetes 官方

- **[K1]** Kubernetes, *StatefulSets*（stable 的 rescheduling 边界、ordinal、network identity、Headless Service、stable storage 与 PVC retention）：https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/ ；官方文档源 commit `a96b3ebd15296afc96819e6e5f8a90bcff00b828`：https://github.com/kubernetes/website/blob/a96b3ebd15296afc96819e6e5f8a90bcff00b828/content/en/docs/concepts/workloads/controllers/statefulset.md （访问日期：2026-11-14）
- **[K2]** Kubernetes, *Pod Lifecycle*（Pod UID、同一 Pod 内容器重启、replacement Pod 同名但不同 UID）：https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-fault-recovery ；官方文档源 commit `a96b3ebd15296afc96819e6e5f8a90bcff00b828`：https://github.com/kubernetes/website/blob/a96b3ebd15296afc96819e6e5f8a90bcff00b828/content/en/docs/concepts/workloads/pods/pod-lifecycle.md （访问日期：2026-11-14）
- **[K3]** Kubernetes, *Object Names and IDs*（名称作用域、UID、同名物理 host 重建警告）：https://kubernetes.io/docs/concepts/overview/working-with-objects/names/ ；官方文档源 commit `a96b3ebd15296afc96819e6e5f8a90bcff00b828`：https://github.com/kubernetes/website/blob/a96b3ebd15296afc96819e6e5f8a90bcff00b828/content/en/docs/concepts/overview/working-with-objects/names.md （访问日期：2026-11-14）

### systemd / freedesktop 官方

- **[M1]** systemd, *`machine-id(5)`*，页面版本 systemd 262（host 语义、安装/首启生成与持久化、其他 ID 来源、confidential 与 application-specific keyed hash、缺失处理、generic image 初始化）：https://www.freedesktop.org/software/systemd/man/latest/machine-id.html （访问日期：2026-11-14）
- **[M2]** systemd, *Building Images Safely*（golden image 必须重置 `/etc/machine-id`，否则所有实例同 ID，以及其他身份/随机状态重置）：https://systemd.io/BUILDING_IMAGES/ （访问日期：2026-11-14）

### NATS 官方

- **[N1]** NATS, *Your first service*（为一个 running copy 自动生成 NUID、`You never set it`、service name 与 instance ID 区别）：https://docs.nats.io/learn/services/your-first-service （访问日期：2026-11-14）
- **[N2]** NATS, *Discovery*（当前实例应答 `$SRV`、broadcast/deadline、按 ID 定位 running instance）：https://docs.nats.io/learn/services/discovery （访问日期：2026-11-14）
- **[N3]** NATS, *Scaling*（每实例 fresh service ID、无需注册实例、停止后退订 discovery）：https://docs.nats.io/learn/services/scaling （访问日期：2026-11-14）
- **[N4]** NATS, *Info Response*（`id` 为 service instance 的唯一 ID）：https://docs.nats.io/reference/services/info-response （访问日期：2026-11-14）

### SPIRE / SPIFFE 官方

- **[S1]** SPIFFE, *SPIRE Concepts*（node attestation、唯一 SPIFFE ID、Server 签发 agent SVID、one-time join token）：https://spiffe.io/docs/latest/spire-about/spire-concepts/#node-attestation （访问日期：2026-11-14）
- **[S2]** `spiffe/spire` 官方文档 *Agent plugin: KeyManager "disk"*（私钥落盘、重启加载、证书过期重新 attestation），commit `f722f5f0994ecc47ddd2ce9c805d262627529061`：https://github.com/spiffe/spire/blob/f722f5f0994ecc47ddd2ce9c805d262627529061/doc/plugin_agent_keymanager_disk.md ；同版本 agent 配置参考另列 `memory` KeyManager 重启必须重新 attestation：https://github.com/spiffe/spire/blob/f722f5f0994ecc47ddd2ce9c805d262627529061/doc/spire_agent.md （访问日期：2026-11-14）
- **[S3]** `spiffe/spire` 官方源码 `pkg/agent/storage/storage.go`（SVID/bundle load/store、`agent-data.json`、`AtomicWritePrivateFile`），以及 `pkg/agent/agent.go` 中以 `storage.Open(a.c.DataDir)` 传入 data directory 的调用，commit `f722f5f0994ecc47ddd2ce9c805d262627529061`：https://github.com/spiffe/spire/blob/f722f5f0994ecc47ddd2ce9c805d262627529061/pkg/agent/storage/storage.go 与 https://github.com/spiffe/spire/blob/f722f5f0994ecc47ddd2ce9c805d262627529061/pkg/agent/agent.go （访问日期：2026-11-14）

### UUID 正式标准

- **[U1]** IETF, *RFC 9562 — Universally Unique IDentifiers (UUIDs)*，尤其 §4.2 与 §5.4（UUIDv4 为 randomly or pseudorandomly generated 版本；UUID 是标识机制而非认证机制）：https://www.rfc-editor.org/rfc/rfc9562.html#section-5.4 （访问日期：2026-11-14）
