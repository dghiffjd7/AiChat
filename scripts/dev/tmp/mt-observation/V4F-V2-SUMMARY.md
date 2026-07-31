# 女仆 Deepseek V4 Flash 系统冻结观察 V2

时间：2026-07-31 13:19 CST

## 结论

本轮以接近真实用户的自然指令完成 **103 条任务**，覆盖基础读写、批量安全操作、导入角色卡建房、群聊、世界书继承与局部绑定、格式画像、Sub-agent、生图、真实角色回复、整轮格式修复、四层记忆提取及女仆自主归档。所有测试都在隔离角色卡、隔离用户与隔离女仆线程中执行，本轮**只观察与记录，没有针对结果修改产品源码**。

数据最终状态符合主要写入目标，批删取消／确认、导入卡继承、群成员、局部失败恢复、格式修复取消不写回、语义记忆归档不再注入均经独立读回确认。V4 Flash 可以完成大部分流程，但暴露了 5 类需要后续处理的问题：

1. 整个 origin 的 localStorage 已被多类双写 payload 填至约 10.36MB；`worldinfo_store` 主镜像会在超限时自清，真正的 P0 是其 KV 读取失败且镜像缺失时会把内存缓存重置为空，后续任一保存都可能用近空缓存覆盖 KV 权威数据。
2. “没有才创建”的备用用户／角色卡任务只读取后就把资源摘要当最终成功，实际没有创建。
3. `chat.send_message` 只证明请求已触发，无法向女仆证明 assistant 最终是否通过协议并落库；两次故意施压格式的回复被 parser 丢弃，自动格式修复又因 V4 Flash 连续返回无效 JSON 而没有候选补丁。
4. 长链存在重复调用与成本失控：一次方形壁纸恢复重复生图并覆盖写回；批量绑定与总审计也有重复读取／写入。
5. Shadow 本轮原始样本为 **150 valid / 134 hit / 16 miss（89.33%）**；16 条已逐条归因，0 条无法解释，但说明当前仍不适合进入 Canary。

## 修复实施结果（2026-07-31 15:31 CST）

本节记录冻结观察之后的产品修复；上面的 103 条原始结果、成本和 v3 Shadow 统计保持原样，不用修复后的状态倒改历史证据。

1. **worldinfo 已 fail closed。** KV 读取增加短退避重试；Tauri 下读取连续失败、返回超大或形态不确定时，不再用空对象替换 cache／写 index，并把 Store 锁为只读，`save/remove/saveMany` 均拒绝整体回写。成功读取合法空值仍可初始化空库；纯 Web 环境继续使用 localStorage。专项测试覆盖瞬时恢复、连续失败、存在本地 fallback、超大响应与合法空库。
2. **localStorage 大 payload 已迁到权威 KV。** memory snapshot payload、RP session、persona archive、turn checkpoint 与 capability retrieval state 均改为 Tauri KV 优先；只有 KV 写入成功或两端内容验证一致后才移除本地镜像，读写失败／内容冲突会保留恢复副本，Web 路径仍保留本地能力。干净重启后的真机读回从修复前 **1,056 keys / 10,356,538 bytes** 降为 **282 keys / 1,545,072 bytes**；大 payload 家族已退出 localStorage，只剩 106 个有界 snapshot refs、世界书索引和 2 个尚未证明可安全移除的 checkpoint 恢复副本。
3. **Shadow 门槛改用单调计数。** 新增 counter v1，按 `retrieverVersion + maidContextVersion + mode` 分池，独立累计 decision/valid/hit/miss/policyExcluded、Run 覆盖、已归因／未解释 miss，并保留最多 45 个日桶；不再受 500 snapshots 或 160 aggregates 裁切影响。历史 v3 数据不猜测回填；当前真机 counter 已初始化，尚未产生修复后的真实决策，因此 pool 为空是预期。
4. **条件 user/persona 创建不会再被清单摘要吞掉。** 确定性剩余义务会先精确确认名称；缺失时调用对应 create 且 `setActive:false`，存在时直接复用并明确“不重复创建／不切换”，创建后以读回证据收口。两条冻结原句及已存在反例均有回归测试。
5. **`chat.send_message` 已具备 assistant 终态与协议事务。** 触发角色回复时 `waitForReply` 默认 true，工具可区分 `request_triggered / assistant_delivered / protocol_rejected / repair_failed / blocked_by_config`，并回传新增 assistant message IDs。流式协议先完整缓冲，再做整轮 parse、全事件 preflight、消息／动态事务提交；任一事件失败会回滚已写消息和动态状态。记忆表格、摘要、变量／插件、群系统操作、UI 与已读等后处理只在整轮协议提交后执行。解析拒绝仍保存完整 raw 供格式修复；女仆等待链会等自动格式复查结束并把无有效补丁报告为 `repair_failed`。
6. **重复付费与尾部验证已收口。** “重新生成”不再令整轮永久绕过幂等守卫；按目标＋用途计算可消费生图额度，“一张”成功生成并写回后即耗尽，明确两张／再一张才允许第二次。单绑自带 verification、批绑已返回验证结果时，同目标的尾部 `worldbook.list`／session worldbook 读取会确定性收口，不再为状态好看而追加跨能力读取。
7. **16 个 miss 已按类型修到 retriever v4。** 补齐后台消息、建房／清单／打开主要结果、世界书绑定读回、记忆 list→archive 等自然话术，并为 session 创建、取消后复验、配置阻塞、缺会话恢复、记忆顺序目标增加有界 ReAct dependency。版本升为 `maid-capability-retriever-v4`，因此后续真实样本从干净 Shadow 池重新起算；v3 历史证据保留，不进入 Canary。冻结原句与依赖顺序的离线回归已通过，尚未用模型执行新的大批次。

验证结果：Windows PowerShell 完整 `npm run test:all` 通过；另行通过 `test:chat-moments`、`test:chat-generation`、`test:agent`、`test:migration`、`test:memory`、`test:session-shared`、`test:release`、相关 `node --check` 与 `git diff --check`。Windows dev 已以 CDP 9222 干净重启，Agent 工具注册正常、当前无生成任务，重启后未出现新的启动错误；曾见的 `deferProtocolAfterReceiveEffects` ReferenceError 属修复过程中的旧热重载日志，当前启动恢复作用域已无该引用并有静态回归断言。

## 冻结配置与边界

- 女仆主模型：现有 Deepseek 档，`deepseek-v4-flash`。
- APP 聊天模型：同一 Deepseek V4 Flash。
- Sub-agent「快手 flash」：Deepseek V4 Flash。
- 生图：NovelAI `nai-diffusion-4-5-full`，当前预设固定 1024×1024。
- 能力路由：`shadow`，候选上限 8；没有为本轮 miss 改目录、concept 或 retriever。
- 隔离角色卡：`冻结观察V4F-V2-0731`。
- 隔离用户：`冻结观察用户V4F-V2-0731`。
- 隔离女仆线程：`maid_v4f_observation_20260728`。
- 正式女仆线程测试前已备份为 `maid-conversation-before-v4f-v2-20260731.json`。
- 测试资源保留供人工查看，不混入原海贼王角色卡。

收尾时已将隔离线程另存为 `maid-conversation-after-v4f-v2-20260731.json`，再恢复正式 `maid_default`（120 turns / 240 memory rows / 7,554 context tokens）；界面回到「海贼王／我／娜美」。女仆和聊天继续使用 Deepseek V4 Flash，生图继续使用 NAI，Windows dev 保持运行。

## 原始统计

| 批次 | 任务数 | succeeded | responded | failed | interrupted | awaiting | cancelled |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| pilot | 12 | 11 | 1 | 0 | 0 | 0 | 0 |
| core | 40 | 32 | 4 | 2 | 2 | 0 | 0 |
| capabilities | 24 | 23 | 0 | 1 | 0 | 0 | 0 |
| complex | 16 | 12 | 0 | 1 | 0 | 2 | 1 |
| media + recovery | 4 | 3 | 0 | 0 | 1 | 0 | 0 |
| chat / format / memory | 7 | 6 | 1 | 0 | 0 | 0 | 0 |
| **合计** | **103** | **87** | **6** | **4** | **3** | **2** | **1** |

原始状态不能直接当语义通过率：

- 两个 `awaiting_confirmation` 是导入卡零写入预览；一个 `cancelled` 是用户主动取消冻结计划。
- `capabilities-015` 的 failed 是确认框取消，X/Y 当时仍存在。
- `core-025` 的 failed 是读取不存在世界书后安全停止。
- `complex-013` 的 failed 是刻意混合真实／不存在会话的部分成功测试；真实目标写入成功，缺失目标未误写，随后按精确 retry 恢复。
- `media-002` 的 interrupted 是 NAI 当前固定方形预设拒绝 16:9 请求，未复用旧附件；这是正确的配置约束结果，但状态表达仍不理想。

## 成本与时延

- 任务 wall duration 加总：3,402,463 ms，约 **56.71 分钟**。
- 中位：16.09 秒；P95：139.19 秒；最大：375.98 秒。
- 已记录的女仆 Run usage：**3,432,337 tokens**：
  - prompt 3,162,790
  - completion 269,547
  - 241 次模型调用
  - 179 次工具调用
- 这些数字来自女仆 Run；角色聊天、自动格式守卫等旁路调用未必全部纳入，不能当整个 APP 的完整计费账单。

最高成本样本：

| 任务 | tokens | 模型调用 | wall duration | 观察 |
| --- | ---: | ---: | ---: | --- |
| complex-015 全量收尾审计 | 196,253 | 10 | 375.98s | 9 次工具，重复读取 session 全量 |
| core-035 批量绑定 | 106,701 | 6 | 157.71s | 6 次工具，成功后又 preview／单绑／再读 |
| media-recovery-001 | 105,017 | 6 | 139.19s | 同一目标重复生图与写壁纸 |
| media-003 媒体读回 | 101,147 | 6 | 174.21s | 会话解析／恢复阶段候选漂移 |
| complex-009 三份格式画像 | 82,766 | 6 | 37.14s | 两次空参数失败后才完成三份写入 |
| format-repair-001 | 64,250 | 3 | 243.73s | 能正确解析整轮，但手动修复成本过高 |

## 数据与流程验收

### 基础与批量能力

- 观测站 A/B/C/D、保留 G 与联合观测群均按任务建立；E/F 经预览、取消、再次确认后删除，G 保留。
- 世界书 X/Y 的取消轮未删除，确认轮只删除 X/Y。
- 测试角色卡 P/Q 被批量删除，当前测试角色卡受到保护；批量删除没有跨资源误删。
- 观测站 A/B 最终各直接绑定 `V4F-V2档案库-0731`。
- 联合观测群最终成员为 A/C，B 已移除。

### 导入卡复杂流程

- 第一次人物建房预览后取消，零写入；第二次预览确认后只建立：
  - 私聊：艾琳·洛、顾风、米娅；
  - 群聊：`V4F-V2霜港调查组-0731`，成员恰好为三人。
- 四个会话均继承角色卡共用书 `V4F-V2导入卡资料-0731`；创建时没有为每人复制世界书，也没有把共用书重复写入 session direct binding。
- 三个私聊收到完全相同的只写不回消息并独立读回。
- 三份 `<frostport>...</frostport>` 格式画像均保存成功。
- Sub-agent 向共用世界书新增 `雾潮预警` 与 `遗迹勘察流程`，最终 12→14 条；正文分别 125/138 字，低于约 160 字的软目标，但没有破坏原 12 条。
- 局部绑定测试只给艾琳·洛直接绑定 `V4F-V2长文库-0731`；不存在的 H 没有误写。恢复轮只创建 H 并只绑定 H。
- 群聊在最终审计中会解析到长文库，是因为群成员艾琳拥有该 direct book 后被群成员聚合解析；不是群聊自身 direct binding。

### 媒体

- 女仆在生成艾琳头像时自动使用 NAI 英文 tags，并带稳定英文别名；头像生成后写为 256px WebP，独立读回存在。
- 16:9 壁纸按当前 NAI 1024×1024 固定预设 fail closed，没有复用头像附件。
- 用户随后自然接受方形规格后，壁纸成功写入且读回为 1024×1024、opacity 1。
- 恢复轮实际执行了两次 `media.generate_image → session.set_wallpaper`，最后一张覆盖前一张。最终文件存在，前一张孤立文件已由覆盖清理链移除，但产生了一次不必要的生图费用。

### 真实聊天与格式修复

- 两个故意施压格式的角色回复都没有通过 APP 私聊协议，parser 因而没有落 assistant 气泡；`chat.send_message` 仍只报告“已触发请求”。
- 自动格式守卫的 synthetic source 能拿到完整 raw，但 Deepseek V4 Flash 连续两次返回无效 JSON，所以没有生成可应用候选。
- 正常自然消息成功生成同一轮 10 个 assistant 气泡（9 个文本、1 个图片 meta）。
- 10 个气泡共享同一个 `formatRepairTurn.turnId`，每个文本气泡都有 `rawOriginalRef`；以第一气泡触发格式修复时，工具解析的是该轮完整原始回复，而不是最后一个气泡或更早轮次。
- 修复器正确判定 9 个文本气泡缺 `<frostport>` 外层，排除图片 meta；确认列表中选择取消后，修复前后聊天快照 `deepStrictEqual`，没有任何写回。

### 四层记忆与女仆自主管理

- 自然用户明确偏好“完成 V4F-V2 测试先说霜港核对完成”。
- 经过 10 个受控无新事实 turn 后，第二个压缩批次覆盖目标 turn；自定义记忆提取模型 Deepseek V4 Flash 一次成功，提取为：
  - `kind=preference`
  - `key=format.default`
  - `confidence=explicit`
  - `status=active`
- `maid.memory.list` 能找到该条；`maid.memory.archive` 经结构化确认只归档该条。
- 归档后该 ID 不再进入女仆语义注入，物理记录仍在且 `status=archived`，符合可恢复设计。
- 隔离线程最终为 113 turns / 105 compacted / 8 active / 21 memory rows / 21 extraction batches。

## 确认的产品问题

### P0：worldinfo 读取失败后的空缓存回写风险

- 最终页面有 1,056 个 localStorage item，按值的 UTF-16 长度粗算约 10,356,536 bytes；这是整个 origin 被多类 store 的镜像共同填满，不是 worldinfo 自身占用 10MB。
- `worldinfo_store` 已有 3MB 软上限；超限或 `QuotaExceededError` 时会主动移除主镜像。因此现场不是“主镜像停留在旧版本”，而是主镜像缺失。`worldinfo_store_index_v1` 写失败只 warning、不自清，索引才可能陈旧。
- 更严重的链路是：KV 读取异常且主镜像缺失时，`_loadCache()` 会 `_replaceCache({})`；此后任一 `save/remove/saveMany` 都会把近空 cache 整体写回 KV，可能清洗原有权威世界书。当前本轮读回正确只说明事故尚未发生，不能消除该风险。
- 修复应参照 regex store 的 fail-closed：KV 读取重试；区分“成功读到合法空值”和“读取不确定”；不确定时不替换 cache、不改索引并设置拒写状态，阻止所有整体回写。纯 Web 环境仍保留 localStorage-only 可用路径。
- `navigator.storage.estimate()` 的约 10.7GB quota 只反映 IndexedDB 等存储，不能否定 localStorage 的独立 origin 限额。

### P0：origin localStorage 容量治理

现场对全部 key 做过一次性体积盘点（下列仍是按 value UTF-16 粗算，不含 key 与实现开销）：

| key family | key 数 | 约 bytes | 占比 |
| --- | ---: | ---: | ---: |
| `memory_snapshot_payload_v1` | 704 | 6,333,020 | 61.15% |
| `rp_session_v1` | 15 | 1,095,554 | 10.58% |
| `persona_archive_store_v1` | 22 | 617,516 | 5.96% |
| `turn_checkpoint_v1` | 35 | 527,778 | 5.10% |
| `memory_snapshot_refs_v1` | 106 | 333,100 | 3.22% |
| `capability_retrieval_store_v2` | 1 | 331,734 | 3.20% |
| `worldinfo_store_index_v1` | 1 | 1,460 | 0.01% |

- `worldinfo_store` 主镜像现场不存在，故它不是容量大户；原 final-state JSON 只保存了 top-20 `largestItems`，不是 1,056 个 key 的完整原始清单，本表来自修复前的现场全量枚举。
- 第一迁移目标是 `memory_snapshot_payload_v1`：Tauri 下先验证 KV 写入成功，再移除 localStorage 大 payload；refs／摘要继续有界保留。Web 端改用 IndexedDB 或明确有界的 local fallback，不能直接失去离线能力。
- 后续依次检查 RP session、persona archive 与 checkpoint。已确认 RP hydrate/persist 会绕过其 160k 软读上限；persona archive 虽有 80 份数量上限，但没有总字节上限。治理原则是“大 payload 进 KV/IndexedDB，localStorage 只留有界 bootstrap/index”，不是全量删除镜像。

### P1：条件创建会被只读摘要提前收口

- `core-007`：要求“检查，不存在才创建备用用户”，只调用 `app.read_resource(user)`；目标未创建，却直接返回用户清单摘要并标 succeeded。
- `core-009`：备用角色卡同样只读后收口，目标未创建。
- 这不是安全护栏拒写，而是固定／确定性资源摘要抢先成为最终结果，模型没有继续判断缺项。

### P1：角色回复缺少真正的终态契约

- `chat.send_message` 的成功只代表请求开始，不代表 assistant 已落库、协议已通过、格式修复已成功或副作用已提交。
- 本轮两次格式压力回复证明女仆会把“请求触发”当任务完成，即使最终 UI 没有 assistant 气泡。
- 后续应给发送工具提供可选终态等待／读取结果，独立于现有 Run lifecycle，至少区分 `request_triggered`、`assistant_delivered`、`protocol_rejected`、`repair_failed` 与 `blocked_by_config`；后者可先表现为现有 failed/interrupted lifecycle 加结构化 `completionOutcome/failureCode`，避免直接扩 AgentRun 状态枚举。并继续遵守“协议验收成功后才提交记忆／变量等功能副作用”的事务边界。

### P1：重复执行与无进展成本

- 方形壁纸恢复在第一次生成＋写入成功后再次完整生成并覆盖。现有幂等守卫其实能识别“生成附件已被 setter 消费”并阻止意外重复；本轮是原始任务含“重新生成”，使整轮都被视为显式变体请求，因而每一步都绕过守卫。应改成目标级、可消费的变体额度：例如“只生成一张”冻结额度 1，成功生成并设置后即耗尽；明确要求两张或“再来一张”才增加相应额度。
- 批量绑定在批量 apply 成功后又做 preview、单目标 bind 与额外 list。
- 全量收尾审计重复读取整个 session 投影，单任务 196k tokens / 376 秒。
- 建议先补“已经验证的相同目标＋相同结果不再重做”的成功账本／no-progress 终止，再为总审计与格式修复收紧 observation 和模型输出预算；不是简单减少允许步数。

### P1：跨能力验证白名单

- `core-016` 已成功绑定并读回，但最后一次 `app.read_resource` 被 feature 白名单判成 `tool_not_allowed`，使整轮 interrupted。
- 绑定工具自身已有 verification，不应再鼓励模型追加读取；若确需跨域核对，候选／白名单必须明确允许该只读 child verification。

### P2：其他模型行为

- `core-006` 两个读取均成功，但模型没有最终回答，返回 `missing_final_message`。
- `core-022` 把“不存在的聊天模型配置”错路由到 `session.open_config`，安全地以 `session_not_found` 停止，但领域错误。
- 三份格式画像保存时，模型连续两次用空参数调用后才自行恢复。
- Sub-agent 两个条目低于用户给的约 160 字软目标。
- 手动整轮格式修复虽正确，但 64k tokens / 244 秒对日常交互过重。

## Shadow miss 逐条归因

原始 JSONL 中共有 150 个 metric-eligible selection，134 hit、16 miss，全部有解释：

| 分类 | 数量 | task / selected capability | 根因 |
| --- | ---: | --- | --- |
| 次级／跨域验证与依赖 | 9 | pilot-001 `app.state.read`; core-017 `app.resource.read`; core-035 `worldbook.list`; core-036 `app.resource.read`; capabilities-008 `session.list`; media-002 `config.model.switch`; media-003 `session.list`; media-003 recovery `app.resource.read`; media-recovery `app.resource.read` | 主能力候选已命中，但下一步跨到状态、配置、会话解析或最终读回时没有扩展对应只读能力 |
| 新记忆能力／顺序目标 | 3 | capabilities-020 `maid.memory.list`; capabilities-021 `maid.memory.archive`; memory-management-002 `maid.memory.archive` | 新能力自然话术不足；同轮 list 后 archive 没有保留第二目标 |
| 主动作／历史或话术污染 | 4 | core-003 recovery `chat.send_message`; capabilities-005 `session.create`; capabilities-007 `session.list`; complex-016 `session.open` | 条件动作、取消复验或长链最后动作被先前历史／sticky／通用候选挤出 |

结论：

- **0 个无法解释的 miss**，满足人工归因要求。
- 其中并非 16 个都该靠增加 alias 修复；9 个属于长链的次级跨域步骤，应优先用验证契约、结构化剩余目标或受控 candidate expansion 处理。
- 3 个记忆能力 miss 适合补目录概念／自然话术原句回归。
- 4 个主动作 miss 需要分别检查条件创建收口、恢复 query 与长链 history/sticky，而不是统一扩候选。

最终 Store 聚合从批次起点约 1,212 valid / 1,028 hit 变为 1,346 / 1,151，表面增量只有 134/123/11；这与原始 150/134/16 不一致，是因为 Store 只保留 160 个 aggregate cohort 桶，新桶会驱逐旧桶。500 条 snapshot 还会优先保留 miss，因此它也不能反推无偏的长期分母。以后单批验收仍以逐决策 JSONL 为证据；发布门槛则必须增加不受诊断桶裁切影响的紧凑单调计数，至少按 `retrieverVersion + maidContextVersion` 记录 first/last seen、decision/valid/hit/miss/policyExcluded/runCovered、7–14 天日桶及已归因／未解释 miss。160 个 cohort aggregate 只保留作诊断。

## 建议顺序

1. 先给 worldinfo 补 KV 读取重试、读取不确定时 fail-closed 拒写和专项回归，消除近空 cache 覆盖权威数据的 P0。
2. 治理整个 origin 的 localStorage 容量：先迁移 memory snapshot 大 payload，再处理 RP session、persona archive 与 checkpoint 的绕界／无总量边界。
3. 增加 Shadow 的版本级单调累计与日桶；它不改变 retriever 行为，但必须在下一轮样本与任何 Canary 门槛核算前完成。
4. 修复条件式备用 user/persona 创建被只读摘要提前结束，并补原句回归。
5. 给 `chat.send_message` 增加可等待的 assistant 终态／配置阻塞结果，并把 table、variable、image 等副作用移到协议验收后提交。
6. 把生图“显式重画”改成目标级可消费额度；对已由工具 verification 证明完成、且无剩余目标的步骤确定性收口，减少重复绑定／尾部白名单误撞。
7. 最后按上面三类归因分别修 Retriever，执行干净重跑；保持 Shadow，不进入 Canary。

## 证据

- 机器汇总：`v4f-v2-analysis-20260731.json`
- 11 份原始批次：`results-v4f-v2-*-0731.jsonl`
- 最终独立状态：`v4f-v2-final-state-20260731.json`
- 记忆老化与提取：`v4f-v2-memory-aging-20260731.json`
- 正常角色回复：`v4f-v2-role-reply-natural-20260731.json`
- 格式修复前后：`v4f-v2-role-turn-before-repair-20260731.json`、`v4f-v2-role-turn-after-repair-cancel-20260731.json`
- 测试前正式线程：`maid-conversation-before-v4f-v2-20260731.json`
- 测试后隔离线程：`maid-conversation-after-v4f-v2-20260731.json`

## 安全复核增量修复（2026-07-31 16:35 CST）

本节是 15:31 修复实施结果之后的第二次代码级安全复核；不修改前述 103 条冻结观察、150/134/16 的原始统计或既有 miss 归因。

1. **剩余权威存储清洗链已封堵。** `rp-session-store`、`persona-archive-store` 在 Tauri 下改为读取重试＋fail-closed：连续 KV 失败、非法返回、或相同 `updatedAt` 但内容分歧时，保留本地恢复副本并拒绝所有后续写入，不再让 `setGreetings` 等操作把近空内存整体覆盖 KV。`turn-checkpoint` 的 `renameSession/clearSession` 也必须先通过源／目标 hydrate 与 `persistenceBlocked`，失败时不写空 fallback。首跑时间平局会比较内容，不再无条件选 KV 后删除本地增量。
2. **唯一 KV 副本改为原子替换。** Rust `save_kv` 先在目标同目录建立唯一临时文件，完整写入并 `sync_all`，再 rename 覆盖目标；任一步失败都会尝试清理临时文件。这样进程中止不会再把旧文件先截断成损坏的半份 JSON。
3. **角色回复等待有明确上限。** `chat.send_message` 在默认 `waitForReply:true` 下声明 180 秒 timeout，超时稳定返回 `generation_failed`，女仆 Run 可以失败收口或继续恢复，不再因 provider 流悬挂而无限等待。
4. **协议事务补齐顺序依赖、回滚和 checkpoint 边界。** preflight 逐事件执行并能看见同轮已验证的前序事件，因此“创建动态→回复该动态”不再误拒。消息删除与 moments 快照恢复分别捕获错误，前者失败也不会跳过后者；事务拒绝后的 `mutatedMoments` 不再泄漏到 checkpoint 同步。
5. **事务提交后恢复原投放体验。** 完整缓冲仍然保留，因为整轮 parse／preflight／持久化与功能副作用需要一个原子提交边界；变化仅在提交之后：已经持久化的协议气泡会重新送入现有投放队列，按原顺序恢复逐气泡打字与投放动画。队列使用 `alreadyPersisted` 路径，只重放 UI／已读／插件等提交后效果，不重复写消息。
6. **生图与尾部收口修正。** 生图配额按当前目标和当前用途局部解析，混合“人物头像＋房间壁纸”各计各的额度；无量词“重新生成／重画／换掉它”也会形成新的可消费额度。绑定后若用户明确要求展示内容，不再用罐头摘要吞掉读取；复合 `include:["members","worldbooks"]` 也不会因为含 worldbooks 而把成员读取一起收口。
7. **阻断态 rejection 被接住。** template-engine 两处 `worldStore.save` 都显式处理同步 throw 与异步 reject，Store fail-closed 时记录 warning 而不产生未处理 Promise rejection。

固定运营约定：

- 每个真实模型批次完成后，必须先导出本批逐决策记录，并在任何 retriever／catalog 修改、测试资源清理或运行态迁移前逐条 join AgentRun 归因所有 raw miss。
- 归因必须在 snapshot 尚处于 **14 天 TTL／500 条上限**内调用 `recordMissAttribution`；随后以对应 `retrieverVersion + maidContextVersion + mode` 单调池确认 `unexplained=0`。
- 过期或无法 join 的 miss 一律保持 unexplained，该版本池不得进入 Canary，不能凭事后推测补写“已解释”。池级／批次级归因接口可列入后续工具化；在它完成前继续执行“每批结束即逐条归因”。

验证：Windows PowerShell 下 RP／persona／checkpoint、工具 registry、`chat.send_message`、协议事务／投放／checkpoint、生图额度、绑定尾读、template rejection 与 Rust 原子写专项测试均通过；完整 `npm run test:all` 亦通过（主题 71 findings / baseline 79、无新增）。低危项（过期的工具 `network/cost` 元数据、assistant IDs 仅当前会话、abort cancelled 标志、大 snapshot KV payload 失败可观测性、`app.js` 四处 checkpoint catch）保留下一轮，不混进本次高危修复。

## 协议揭示与低危可靠性收口（2026-07-31 17:37 CST）

本节处理 16:35 修复之后复查发现的揭示竞态与低危清单；不修改前述 103 条冻结观察、150/134/16 原始统计或 miss 归因。

1. **重进房不再重复气泡。** 根因是消息先事务提交进 store、进房从 store 全量加载，而仍在运行的揭示队列随后再次追加同一 `message.id`。投放器现在先检查当前会话 DOM；若进房流程已渲染该 ID，则不再 `addMessage`，但仍保留尚未执行的已读／插件等提交后效果。
2. **中途删除和重启恢复都不会复活消息。** 已提交投放计划把 `alreadyPersisted` 一并写入 localStorage／KV fallback。揭示槽位若发现该 ID 已从 store 删除，直接记为 `missing-committed-message` 并推进／移除计划；恢复器也遵守同一语义，不再把删除误认为尚未 append。没有该标记的旧待写计划继续按旧行为恢复。
3. **中止不会遗留后续批次动画。** transaction delivery loop 在每批创建前、每批 promise 返回后都复验 generation id 与 cancelled 状态；队列创建到登记之间没有异步让出，因此当前批可由统一 cancel 链停止，后续批不会再注册。
4. **工具超时会取消真实生成。** registry 的 timeout 向工具传入派生 AbortSignal；`chat.send_message` 收到 180 秒 `generation_failed` 超时后调用现有 `cancelActiveGeneration('tool_timeout')`，继续向下取消 provider、stream controller 与消息队列，及时解除会话 busy。用户主动停止则稳定透传 `cancelled:true / user_aborted`，失败分类与步骤摘要不再落 `unknown` 或误报 `sent message`。
5. **生图配额补齐自然语言边界。** 否定分句先剥离，因此“不要再生成第二张”不扩额度；画风／风格参考附件的数量属于输入，不计输出；同一目标与用途的裸“另一张／另一幅／另一个版本”会提供一个额外变体额度。
6. **RP 与资料包写入服从 fail-closed。** 新增、编辑、切换开场白三个 UI 入口统一捕获 `rp_session_store_read_unavailable` 并显示只读保护提示；内部默认开场白选中静默失败。自定义资料包不再直接把 RP state 写入 `save_kv`，改由 `RpSessionStore.flush()` 统一断言可写，阻断态不会被导出／导入收尾旁路。

验证：Windows PowerShell 下 10 个直接影响测试、完整 `npm run test:all`、`npm run check:fast` 全绿；后者包含 `app.js` 语法检查、影响范围测试与 Windows `cargo check`。主题审计仍为 71 findings / baseline 79、无新增，`git diff --check` 无错误。dev 干净重启后的 CDP 读回为页面 complete、71 个工具、`chat.send_message`／`maid.memory.list` 已注册、无 active generation、无运行时错误。此轮没有新增真实模型决策或 Shadow 样本。

## 发送工具语义与跨会话回执收口（2026-07-31 17:58 CST）

本节关闭 16:35 已明确延后的两个小项；不修改冻结批统计、原始结果或 Shadow miss 归因。

1. **成本／联网元数据按最强路径声明。** `chat.send_message` 默认会触发聊天 provider，能力元数据现为 `network:true / cost:'variable'`；`triggerReply:false` 的本地追加只是同一工具的低成本子路径，不再使权限展示、审计或成本统计把整个能力误判成免费离线操作。
2. **跨会话 assistant 回执完整。** 协议事务提交账本中的每个 `{targetSessionId,messageId}` 会在完成前回查 store，只保留仍存在的 assistant 消息。旧 `assistantMessageIds` 继续返回且覆盖本轮全部目标会话；新增 `assistantMessageRefs: [{sessionId,messageId}]` 提供无歧义定位。用户／系统消息、被回滚或中途删除的消息不会进入回执，普通单房回复仍有当前会话增量兜底。

验证：三组直接红绿测试与 Windows `test:agent`、`test:chat-generation`、`test:chat-moments` 均通过；本次修改后的完整 `npm run check:fast` 通过，包含 `app.js` 语法、影响范围测试与 Windows `cargo check`；`git diff --check` 无错误。Windows dev 冷启动后 CDP 实读为页面 complete、71 个工具、`chat.send_message network=true / cost=variable`、0 active generation、0 runtime error。本节不产生真实 provider 调用或 Shadow 样本。
