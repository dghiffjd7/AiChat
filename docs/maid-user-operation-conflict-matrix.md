# 女仆任务与用户操作冲突矩阵

日期：2026-08-07  
阶段：冲突矩阵主线已收口。世界书、消息优化、会话删除与聊天/生图发送链 P0，以及头像/壁纸、世界书绑定、联系人画像、角色卡生命周期与 UI 点击 P1 生产守卫均已落地并通过 dev 实测；格式修复、群成员和记忆删除时序的 P2 参考烟测也已完成。

## 范围与判定

- dev 运行时注册表共有 34 个 `capabilities.write === true` 的女仆工具，已全部纳入下方分组。
- `D`：已在 Windows dev APP 中动态复现；`U`：已有或本轮新增单元测试；`S`：仅完成源码链路审查；`P`：待补动态测试。
- `安全`：当前链路有明确的身份、版本或追加语义保护；`条件安全`：只在显式目标或严格串行时安全；`冲突`：可能静默丢写、写错目标或用过期确认执行。
- 并发不只指多线程。用户在确认窗、模型请求、图片生成或旧编辑器停留期间操作，同样会形成跨 `await` 的竞态。

## 已执行的世界书 dev 冲突测试

测试入口：`scripts/dev/maid-user-worldbook-conflict-probe.js`

| ID | 时序 | 最终结果 | 判定 |
| --- | --- | --- | --- |
| WB-01 | 用户先改 B 并保存，随后女仆改 A | A=女仆、B=用户 | 安全；女仆执行阶段读取到最新数据（D/U） |
| WB-02 | 女仆确认窗停留时用户改 B，确认后女仆改 A | A=女仆、B=用户 | 安全；确认后会重新读取（D/U） |
| WB-03 | 用户打开世界书编辑器；女仆改 A；用户在旧编辑器真实输入修改 B 后保存 | A=女仆、B=用户 | 安全；编辑器 CAS 冲突后对非重叠字段做三方合并（D/U） |
| WB-04 | 女仆执行阶段完成最终读取后暂停；用户改 B 并保存；释放女仆提交 A | A=女仆、B=用户 | 安全；最终 CAS 拒绝旧 revision，工具读取最新内容后重试（D/U） |
| WB-05 | 确认窗显示会话绑定的世界书 A；等待期间用户把绑定切到 B；女仆继续 | A 被修改、B 未变，执行结果仍指向 A | 安全；确认目标已固定，不再从变化后的会话绑定重新推导（D/U） |

所有场景只使用 `__codex_conflict_probe_*` 临时世界书；最近一次运行
`guardReady=true`、`baselineMatched=false`、`cleanup.deleted=true`、`remaining=[]`。

## 已执行的消息与会话 dev 冲突测试

测试入口：`scripts/dev/maid-user-chat-conflict-probe.js`

| ID | 时序 | 最终结果 | 判定 |
| --- | --- | --- | --- |
| CS-01 | `session.delete_many` 确认窗停留时，目标聊天室收到新消息 | 跳过删除并返回 `session_changed_during_confirmation`，新消息与聊天室保留 | 安全；删除确认会随会话内容 revision 失效（D/U） |
| CS-02 | 目标聊天室存在运行中任务时执行真实 `SessionPanel.removeCore` | 任务收到 `session_deleted`，settle 后才删除；剩余任务数为 0 | 安全；删除持有 closing guard，先取消、等待，超时则拒绝删除（D/U） |
| CS-03 | 当前页面不切房，女仆向显式目标聊天室追加消息 | 消息只进入目标聊天室，当前会话前后不变 | 安全；发送目标固定，不从后续 active session 重新推导（D/U） |
| CS-04 | 正文优化等待期间，用户编辑或删除目标消息 | 分别返回 `revision_expired` / `message_not_found` | 安全；模型确认后与最终写入点各复查一次原文（D/U） |

探针只创建 `__codex_chat_conflict_*` 临时聊天室，不调用聊天或生图模型；最近一次运行
五项 summary 全为 `true`、`guardReady=true`、`cleanup.deleted=true`、`remaining=[]`。

## 已执行的头像与壁纸 dev 冲突测试

测试入口：`scripts/dev/maid-user-media-conflict-probe.js`

| ID | 时序 | 最终结果 | 判定 |
| --- | --- | --- | --- |
| MA-01 | `persona.set_avatar` 未指定目标；确认窗期间用户切换 active persona | 原角色头像更新，新 active 角色保持不变 | 安全；preflight 固定 targetId/scope/generation/avatar revision（D/U） |
| MA-02 | 确认窗期间用户手动替换目标头像 | 返回 `avatar_changed_during_operation`，用户头像保留 | 安全；确认后与图片准备后均复查头像 revision（D/U） |
| MA-03 | 女仆替换联系人头像期间，用户修改联系人说明 | 头像与用户说明同时保留 | 安全；提交只 patch `avatar`，不再用旧完整联系人覆盖（D/U） |
| MA-04 | `session.set_wallpaper` 未指定目标；确认窗期间用户切换当前聊天室 | 原聊天室取得持久壁纸，新当前聊天室保持不变 | 安全；固定 session/scope/generation/wallpaper revision（D/U） |
| MA-05 | 确认窗期间用户手动替换目标壁纸 | 返回 `wallpaper_changed_during_operation`，用户壁纸保留 | 安全；壁纸字段 compare-before-set；原生保存采用两阶段提交，保存后冲突会删除新孤儿文件（D/U） |

探针使用内嵌 1×1 PNG，不调用付费模型；最近一次运行五项冲突 summary 与清理项全部为 `true`、
`guardReady=true`、`remainingSessions=[]`、`remainingPersonas=[]`，创建的原生壁纸经 `wallpaper_path_exists=false` 验证删除。

## 已执行的世界书绑定 dev 冲突测试

测试入口：`scripts/dev/maid-user-worldbook-binding-conflict-probe.js`

| ID | 时序 | 最终结果 | 判定 |
| --- | --- | --- | --- |
| WBB-01 | 两个女仆调用同时向同一聊天室 append 不同世界书 | 两本均保留 | 安全；提交点对 live 集合做同步原子 add，不再各自写回旧整表（D/U） |
| WBB-02 | 单笔省略 session；等待世界书期间用户切换当前聊天室 | 只绑定等待前的原聊天室 | 安全；当前目标在第一次 await 前固定（D/U） |
| WBB-03 | 女仆读取到目标书已绑定；用户随后手动解绑同一本书 | 返回 `binding_changed_during_operation`，不把用户解绑加回 | 安全；append 比较目标成员资格，同时保留无关 add/remove（D/U） |
| WBB-04 | 读取后世界书被删除并以同 ID 重建 | 返回 `worldbook_recreated_during_operation`，不写绑定 | 安全；提交前比较 worldbook generation（D/U） |
| WBB-05 | 批量确认窗期间两个临时聊天室交换同名显示名 | 仍只绑定确认时解析出的原 sessionId | 安全；preflight 保存解析目标与绑定基线，execute 不按名称重解析（D/U） |
| WBB-06 | 绑定快照 scope 与提交时 bridge scope 不一致 | 返回 `target_scope_changed`，原绑定不变 | 安全；原子提交同时校验 persona scope（D/U） |
| WBB-07 | RP 绑定目标仍是原角色，但当前 binding scope 已切到另一角色 | 返回 `target_scope_changed`，不把 `rp:<原角色>` 写进新角色 scope | 安全；RP 工具要求 binding scope 与 personaId 相同（D/U） |

探针走真实 Agent Registry、临时聊天室与生产 binding bridge，不调用模型；当前 dev 的 38,379,040-byte
`worldinfo_store.json` 已触发现有载入上限，因此探针只对测试世界书注入可控 snapshot/generation，且不写世界书正文。
最近一次运行八项 summary（含清理）全部为 `true`、`guardReady=true`，`remainingSessions=[]`、`orphanBindings=[]`。

## 已执行的联系人画像 dev 冲突测试

测试入口：`scripts/dev/maid-user-contact-profile-conflict-probe.js`

| ID | 时序 | 最终结果 | 判定 |
| --- | --- | --- | --- |
| CP-01 | `contact_profile.upsert` 确认期间用户修改同一画像 | 返回 `profile_changed_during_operation`，保留用户版本 | 安全；preflight 固定 scope/contactId/revision，整条替换以 CAS 提交（D/U） |
| CP-02 | 确认期间画像被删除并以同 contactId 重建 | 旧提交被拒绝，重建版本保留 | 安全；删除和重建都会推进持久化 revision，拒绝 ABA（D/U） |
| CP-03 | 确认期间画像 store 切到另一角色 scope | 返回 `target_scope_changed`，原 scope 画像不变 | 安全；scopeId + 单调 scope token 可识别切走再切回（D/U） |
| CP-04 | 两个女仆写入在同一基线确认后同时提交 | 一笔成功、一笔明确冲突 | 安全；不会再以最后完成者静默覆盖（D/U） |
| CP-05 | 后台画像 autosave 生成期间用户修改同一画像 | autosave 返回冲突，用户版本保留 | 安全；候选读取 profile snapshot，最终走相同 CAS（D/U） |
| CP-06 | 候选生成后用户修改画像，再点击“保存画像” | 批准返回冲突且保留旧候选供用户忽略/重建 | 安全；候选持久化 base revision/exists，批准与清除在单次提交中完成（D/U） |

探针使用 `__codex_contact_profile_*` 临时画像，走真实 Agent Registry、ContactProfilerAgent、bridge 与 store，
不调用模型。最近一次运行六项冲突与清理 summary 全部为 `true`、`guardReady=true`；临时画像、候选及
revision 记录均已删除，原 scope 与画像设置已恢复。画像持久化另改为单 store 顺序队列，避免快速保存的 KV 完成顺序反转。

## 已执行的角色卡与 UI 点击 dev 冲突测试

测试入口：`scripts/dev/maid-user-persona-ui-conflict-probe.js`

| ID | 时序 | 最终结果 | 判定 |
| --- | --- | --- | --- |
| PU-01 | `persona.delete_many` 确认期间用户编辑目标角色卡 | 返回 `persona_changed_during_confirmation`，用户版本保留 | 安全；确认快照比较 revision（D/U） |
| PU-02 | 确认期间删除并以同 ID 重建角色卡 | 返回 `persona_recreated_during_confirmation`，新实例保留 | 安全；确认快照比较 generation（D/U） |
| PU-03 | 用户刚手动切换角色，女仆随即执行 `persona.switch` | 返回 `user_persona_switch_lease_active`，不自动抢回 | 安全；手动切换建立 3 秒 interaction lease（D/U） |
| PU-04 | 两次 inspect 后使用第一次的 `ref` | 返回 `ref_not_found` | 安全；每次 inspect 产生单调 revision，旧引用立即失效（D/U） |
| PU-05 | inspect 后目标 DOM 被替换 | 返回 `element_detached` / `element_replaced` | 安全；执行前复核同一 DOM 身份与所属面板（D/U） |
| PU-06 | inspect 后用户在底层界面操作 | 返回 `user_interaction_since_inspect` | 安全；pointer/keyboard/input 竞争操作令旧目标失效（D/U） |
| PU-07 | 只读任务以纯 `ref` 指向“删除”按钮 | 返回 `agent_tool_write_intent_required`，且不请求确认 | 安全；先解析真实按钮文案，再执行意图与危险规则（D/U） |
| PU-08 | 写入任务确认危险按钮 | 确认后准确点击一次 | 安全；确认框内选择不误算成底层界面竞争，框外操作仍会失效（D/U） |

探针不调用模型，只创建临时角色卡与按钮；最近一次九项 summary（含清理）全部为 `true`、
`guardReady=true`，active persona 已恢复，`remainingPersonas=[]`，临时按钮已移除。

## 已执行的 P2 参考时序 dev 烟测

测试入口：`scripts/dev/maid-user-p2-conflict-smoke.js`

| ID | 时序 | 最终结果 | 判定 |
| --- | --- | --- | --- |
| P2-01 | 取得格式修复基线后，用户修改目标消息 | revision 校验返回 `revision_expired`，用户正文保留 | 安全；在真实临时消息上调用生产 revision helper，不调用模型（D/U） |
| P2-02 | `group.update_members` 确认期间用户修改成员 | 返回 `group_members_changed_during_confirmation`，用户成员表保留 | 安全；提交前 compare-before-commit（D/U） |
| P2-03 | 记忆模型请求进行中，用户删除目标会话 | 删除先取消并等待记忆任务；任务记为 cancelled、无 edit、无迟到写回 | 安全；记忆任务登记到共享 session work runtime，目标校验异常 fail closed（D/U） |

烟测使用临时会话/联系人和本地挂起假响应，不调用模型或网络；最近一次四项 summary（含清理）全部为
`true`、`guardReady=true`，`remainingSessions=[]`、`remainingContacts=[]`、`remainingWork=0`。

## 冲突矩阵

| 女仆写操作（运行时工具） | 用户编辑/保存同资源 | 用户删除、重命名或重建目标 | 用户切换当前会话/角色/用户/配置 | 同域第二个写操作 | 当前保护与证据 | 优先级 / 建议守卫 |
| --- | --- | --- | --- | --- | --- | --- |
| 世界书正文：`worldbook.create`、`generate_entries`、`update_entries`、`delete_entries` | **已保护**：普通与引用型编辑器均自动合并非重叠条目/字段；同字段冲突不静默覆盖 | **已保护**：revision + generation 拒绝过期保存与同名重建 ABA | **已保护**：确认阶段固定 worldbookId（WB-05） | **已保护**：每书写队列串行提交，CAS 处理队列外写入 | WB-01～05 全部通过；普通编辑器提供“查看冲突 / 载入最新 / 另存副本 / 保留草稿”，引用型编辑器提供来源字段审阅与载入最新（D/U） | **世界书 P0 完成**；保留回归探针作为门禁 |
| 世界书整本删除：`worldbook.delete_many` | **已保护**：确认后的新增/编辑会让 revision 失效并拒绝删除 | **已保护**：确认记录 revision/generation；同 ID 删除后重建会失效 | 不依赖当前范围，目标列表显式固定 | 删除与保存进入同一资源队列并以 CAS 判定 | 显式列表、内置书保护、revision/generation、删除后验证与 ABA 单测（U/S） | **世界书 P0 完成**；变更后要求用户重新确认 |
| 世界书绑定：`bind_session`、`bind_rp_session`、`bind_sessions` | **已保护**：append 在 live 集合上原子加入；无关绑定变化保留，同一本书被用户解绑则明确冲突；replace 要求完整基线未变 | **已保护**：提交前复查 exists/generation，删除或同 ID 重建会拒绝旧操作；会话/角色删除重建也会使目标快照失效 | **已保护**：单笔在第一次 await 前固定 session/persona；批量在确认前固定解析后的 sessionId；bridge 同时校验 persona scope，RP 还要求 scope 与目标 personaId 相同 | **已保护**：每次提交同步读取 live 集合并原子改写，并发 append 不丢写；批量逐项验证且保留实际提交前补偿快照 | `get/updateWorldSessionBinding` 原子 bridge、target/generation/scope 快照与 WBB-01～07（D/U） | **世界书绑定 P1 完成**；保留探针，未来若新增 unbind 工具必须复用同一原子提交协议 |
| 聊天追加：`chat.send_message`、`chat.generate_image` | **已保护**：追加不覆盖旧消息；用户与女仆消息仍可能按实际完成时间交错 | **已保护**：删除先把目标标成 closing，取消并等待聊天/生图任务；5 秒未收口则拒绝删除，不允许删后写回 | **已保护**：`handleSend` 开始即固定 sessionId；关键 await 后复查目标存在，切房不漂移（CS-03） | AI 回复仍由既有全局 active-generation 串行；每会话 work runtime 追踪聊天与图片任务 | 显式目标、提交前存在性复查、AbortController、target-scoped cancel/wait、结构化 `session_deleted`（D/U/S） | **聊天 P0 完成**；全局串行是更保守的安全边界，未来若要跨房并发再改为 per-session generation gate |
| 消息格式修复：`chat.repair_message_format` | **已保护**：原文变化返回 `revision_expired`，不会套用旧补丁 | 目标消息消失/turn 改变会拒绝 | 使用解析出的目标 session/turn | 同消息第二次修复由 revision 阻挡旧结果 | 写回前 diff；social/creative 链路都有 revision/turn 校验；P2-01（D/U） | **P2 参考烟测完成**；继续作为 revision 守卫参考实现 |
| 消息正文优化：`chat.optimize_message` | **已保护**：模型与 diff 等待后会比较当前原文，最终写入点再比较一次 | **已保护**：目标删除或不再是 assistant 时返回 `message_not_found` | session/messageId 在开始时固定 | 同消息后到结果看到先到写入后的新原文，会以 `revision_expired` 拒绝 | `resolveChatBodyOptimizeWritebackTarget` + 写前双重 compare-before-set；CS-04（D/U） | **消息优化 P0 完成**；保留双检查，不能只依赖确认窗 |
| 记忆更新：`memory.update_after_chat`、`memory.abort_update` | **已保护**：checkpoint 变化会跳过过期结果，校验异常 fail closed | **已保护**：删除会话先取消并等待登记的记忆任务，不允许删后写回 | sessionId 必填且任务租约绑定目标会话 | 每 session 队列；abort 清 pending 并中止当前请求 | queue + AbortController + checkpoint + session work runtime；P2-03（D/U） | **P2 参考烟测完成**；保留删除会话取消/等待门禁 |
| 聊天室生命周期：`session.create`、`session.delete_many` | **已保护**：确认预览记录联系人及会话消息/pending/draft/settings 指纹，任一变化都会跳过删除 | **已保护**：执行时复查存在性；删前关闭目标并等待任务，删后验证；同名新建也会改变指纹 | 当前会话与 RP 会话受保护；确认后切入待删目标时执行阶段再次跳过 | 批量逐项验证；closing guard 会立即取消删除期间迟到注册的同会话任务 | 内容 revision token、当前/RP 保护、存在性复查、target-scoped cancel/wait；只读 unread/pending/variables getter 不再复活已删除会话；CS-01/02 与媒体清理实测（D/U/S） | **会话删除 P0 完成**；变化后要求重新确认，等待超时 fail closed |
| 角色卡生命周期：`persona.create`、`persona.delete_many`、`persona.switch` | **已保护**：确认期间编辑会令删除 revision 失效 | **已保护**：同 ID 重建会令 generation 失效 | **已保护**：用户手动切换后 3 秒内拒绝自动抢回 | create 复用同名；delete 逐项复查与验证 | revision/generation 快照、interaction lease；PU-01～03（D/U） | **角色卡 P1 完成**；变化后要求重新确认，手动切换优先 |
| 用户档案：`user.create`、`user.switch` | create 不覆盖既有档案 | 无删除工具 | 两次切换最后操作获胜 | 同名默认复用 | 目标查询明确、无整档更新（U/S） | **P2**：切换时只需状态提示/短期 interaction lease |
| 群聊：`group.create`、`group.update_members` | **已保护**：成员基线变化会明确拒绝 | 群或成员消失会拒绝 | 目标 groupId 固定；可选 open 只影响导航 | 更新用确认快照并在提交前比对成员列表 | `group_members_changed_during_confirmation`、成员复查、提交后验证；P2-02（D/U） | **P2 参考烟测完成**；继续作为 compare-before-commit 参考 |
| 模型配置切换：`config.switch_profile` | 不修改配置内容 | 目标配置被删会在查找/切换时失败 | 与用户同时切换时最后操作获胜 | 两次切换无数据丢失，但 UI 意图可能反复 | scope 与 profile 目标显式（U/S） | **P2**：操作状态提示；用户主动切换时取消待执行的自动切换 |
| 头像/壁纸替换：`persona.set_avatar`、`user.set_avatar`、`contact.set_avatar`、`session.set_wallpaper` | **已保护**：同字段变化返回结构化冲突；联系人说明与 session 其他 settings 等非重叠修改会保留 | **已保护**：执行阶段复查存在性及 `created/createdAt/addedAt` generation，同 ID 删除重建 ABA 会拒绝 | **已保护**：preflight 固定 targetId、store scope 与字段 revision，确认期切 active target 不漂移 | 同目标后到任务会因字段 revision 变化拒绝；不同目标可独立完成 | 共享头像 setter、字段稳定指纹、patch-only 联系人写回；壁纸先保存新文件、保存后复查、提交后删除旧文件，冲突时清理新孤儿文件；MA-01～05（D/U） | **头像/壁纸 P1 完成**；保留媒体探针及 post-save orphan cleanup 单测作为门禁 |
| 独立图片资产：`image.generate`、`media.generate_image` | 新建资产/附件，不覆盖用户资料 | 目标资源主要在后续应用阶段 | 生成本身不依赖当前页面 | 多生成可并行，注意附件池容量/回收 | append/new-id 语义（S/P） | **P2**：资产生成可并行；应用资产时再走目标 revision |
| 联系人画像：`contact_profile.upsert`、后台 autosave、候选批准 | **已保护**：仍是整条 normalized profile 替换，但基线变化会返回 `profile_changed_during_operation`，不覆盖人工修改 | **已保护**：每联系人持久化单调 revision；删除/同 ID 重建会令旧提交失效 | **已保护**：工具确认与后台任务固定 scopeId/contactId/scope token，切走或切回均拒绝旧任务 | **已保护**：同基线只有第一笔 CAS 成功，后到写入明确冲突；不同联系人互不阻塞 | store snapshot/CAS、候选 base revision、顺序持久化队列与 CP-01～06（D/U） | **联系人画像 P1 完成**；冲突时要求重新生成候选，不做不透明字段合并 |
| 女仆长期记忆：`maid.memory.archive` | 不改正文，只改 status；确认期间正文变化仍会归档 | 执行时按 ID 复查存在、status、task_state 保护 | 不依赖当前 UI 范围 | 重复归档幂等跳过 | 软归档、逐项复查、保护 active task state（U/S） | **P2**：高价值显式记忆变化时可比较 updatedAt；现状可接受 |
| 动态发布：`moments.publish` | 新建唯一动态，不覆盖旧动态 | 不以既有动态为目标 | 发布时固定作者；发布后评论是异步副作用 | 并行发布主要是排序问题 | append/new-id 语义（U/S） | **P2**：保持唯一 ID；评论任务绑定 momentId 并在删除时中断 |
| 任意可见 UI 点击：`ui.click_element` | **已保护**：危险文案（含纯 ref）先经过写入意图与用户确认 | **已保护**：新 inspect、DOM 替换、隐藏、改文案或失效节点均拒绝 | **已保护**：inspect 后用户 pointer/keyboard/input 操作会暂停自动点击 | 每次成功点击返回新 inspect revision，旧 ref 随即失效 | inspect revision、DOM/面板/可见性/文案复核、interaction revision；PU-04～08（D/U） | **UI 点击 P1 完成**；仅该工具持有确认 scope 时豁免确认框选择，其他竞争仍 fail closed |

## 守卫组合与当前落地状态

单一“全局锁”不能解决旧编辑器快照，也会让无关资源互相阻塞。世界书现已采用完整 CAS/合并组合，世界书绑定采用 scope/target/generation 快照与 live 集合原子提交，消息与会话链采用目标固定、compare-before-set 与 target-scoped cancel/wait，记忆任务也登记进同一会话工作租约；头像/壁纸采用字段 revision 与 patch-only/两阶段提交，联系人画像采用 per-contact revision/scope token 与顺序持久化，角色卡与 UI 点击分别采用 revision/generation/interaction lease 与短生命周期 ref。其余低风险资源可依同一原则逐项迁移：

1. **确认目标固定（target pinning）**：preflight 产生不可变的 `{ resourceType, resourceId, baseRevision }`；execute 只能操作该 ID。若用户切换当前范围，不得重新推导到另一个目标。
2. **乐观并发控制（revision/CAS）**：读取返回 revision；保存传 `expectedRevision`。不匹配时返回结构化 `conflict`，禁止静默覆盖。
3. **按资源排队**：同一本世界书、同一会话、同一消息的女仆提交串行；不同资源仍可并行。队列缩小窗口，但不能替代 CAS。
4. **编辑器基线与合并**：世界书编辑器 `show` 保存 base revision；提交冲突时自动合并不同 entryId/字段，重叠字段让用户选择“载入最新 / 另存副本 / 查看差异”，不提供静默强制覆盖。
5. **删除确认失效**：删除预览记录 generation/revision/重要计数；期间资源被编辑或同 ID 重建时必须重新确认。
6. **中断规则**：用户删除目标时中断长任务；用户仅导航离开时任务可继续写固定目标并提示；用户主动修改同字段时，让后到的女仆结果进入冲突审阅而不是覆盖。

世界书 bridge 另以 generation token 防止删除/同名重建 ABA；模板、脚本、插件与 slash 等旧兼容写入口也已收口到同一 bridge 队列/CAS。可继续复用的现有模式还有：记忆更新的 per-session queue + checkpoint、群成员更新的 baseline compare、格式修复的 baseRevision。

## 本批次完成状态与后续低风险项

1. P1 角色卡生命周期与 `ui.click_element` 已完成生产守卫、单测及 dev 时序探针。
2. P2 消息格式修复、群成员更新与记忆任务×会话删除已完成参考烟测；这三种既有模式现在有永久回归证据。
3. 矩阵主线至此收口。仍可后续按实际需求补强的低风险 P2 项为：用户档案/模型配置的主动切换提示或短租约、独立图片资产应用阶段的目标 revision、长期记忆归档的 updatedAt 比较、动态删除时中止发布后评论。它们当前没有已复现的静默丢写问题，不阻塞本轮完成判定。

## 复现命令

先用 Windows PowerShell 启动带 CDP 的 dev APP：

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9222'
npm run dev
```

另一个 Windows PowerShell 窗口执行：

```powershell
node scripts/dev/app-eval.mjs @scripts/dev/maid-user-worldbook-conflict-probe.js
node scripts/dev/app-eval.mjs @scripts/dev/maid-user-chat-conflict-probe.js
node scripts/dev/app-eval.mjs @scripts/dev/maid-user-media-conflict-probe.js
node scripts/dev/app-eval.mjs @scripts/dev/maid-user-worldbook-binding-conflict-probe.js
node scripts/dev/app-eval.mjs @scripts/dev/maid-user-contact-profile-conflict-probe.js
node scripts/dev/app-eval.mjs @scripts/dev/maid-user-persona-ui-conflict-probe.js
node scripts/dev/app-eval.mjs @scripts/dev/maid-user-p2-conflict-smoke.js
node scripts/tests/contact-profile-store-tests.mjs
node scripts/tests/app-content-tools-tests.mjs
node scripts/tests/app-navigation-tools-tests.mjs
node scripts/tests/agent-ui-click-runtime-tests.mjs
node scripts/tests/memory-update-runtime-tests.mjs
node scripts/tests/app-session-tools-tests.mjs
node scripts/tests/media-asset-tools-tests.mjs
node scripts/tests/session-delete-runtime-utils-tests.mjs
node scripts/tests/session-async-work-runtime-utils-tests.mjs
```

世界书生产守卫门槛为：`baselineMatched=false`、`guardReady=true`、`cleanupPass=true`，两个 hazard 字段都必须为 `false`。消息/会话探针要求五项 summary 全为 `true`、`guardReady=true`；媒体探针要求头像目标、头像 revision、联系人 patch、壁纸目标、壁纸 revision 与清理六项全为 `true`，且原生壁纸存在性复查为 `false`；世界书绑定探针要求并发 append、active target、同目标解绑、worldbook ABA、确认目标、一般 scope、RP scope 与清理八项全为 `true`；联系人画像探针要求人工编辑、删除重建、scope、双写、autosave、候选批准与清理七项全为 `true`；角色/UI 探针要求删除 revision、角色 ABA、切换租约、inspect revision、DOM 替换、用户竞争、正常点击、ref 危险识别、确认后点击与清理十项全为 `true`；P2 烟测要求格式 revision、群成员基线、记忆删除取消/等待与清理五项全为 `true`。任一探针清理失败或门槛回退，都应视为并发保护回归。
