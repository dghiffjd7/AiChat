# 女仆 v4f 系统观察总结

时间：2026-07-28 21:16 CST

## 范围与冻结配置

- 测试前由女仆删除旧会话 `冻结观察会话-A/B/C/D-0728`，存储层验收为 16→12，四个名称全部不存在。
- 女仆主模型切换为现有 `Deepseek / deepseek-v4-flash` 档；旧的 `gemini-3.5-flash` model override 已清空。
- APP 主聊天档保持 `Deepseek / deepseek-v4-flash`；Sub-agent「快手 flash」保持 `deepseek-v4-flash`。
- 能力路由保持 `shadow`；本轮只观察、归因和记录，没有针对 v4f miss 修改产品源码。
- 为排除旧历史污染，测试前备份女仆原线程（120 turns / 240 memory rows），用空白线程执行 52 项；测试线程另存后，原线程已完整恢复。
- Windows PowerShell 顺序执行：pilot 12 项 + obs-03 40 项。

## 原始结果

| 批次 | 任务 | succeeded | responded | failed | interrupted / timeout | Shadow 命中 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| v4f pilot | 12 | 12 | 0 | 0 | 0 | 15 / 15 |
| v4f obs-03 | 40 | 32 | 2 | 6 | 0 | 49 / 51 |
| 合计 | 52 | 44 | 2 | 6 | 0 | **64 / 66（97.0%）** |

原始状态不能直接当语义通过率：

- `obs-03-019` 是预期的删除拒绝，后续读回确认条目仍在。
- `obs-03-031` 是预期的 `no_attachment` 安全停下，没有调用写工具。
- succeeded / responded 中仍有错误域路由或未执行目标工具。
- `obs-03-002`、`obs-03-035` 的断言不成立是上游创建失败的连锁结果，需与首因分开。

## 成本与时延

- 52 项 duration 加总 1,036,830 ms，平均约 19.9s/项。
- 有 usage 的 run 46 个，共 1,298,123 tokens：
  - prompt 1,219,528
  - completion 78,595
- 主批次 40 项：平均 21.96s，中位 11.64s，p95 66.32s，最大 133.28s；56 个工具步骤。
- 与 17:30 的旧 obs-03 相比，主批次 duration 加总下降 41.6%、tokens 下降 65.7%、工具调用 83→56；但两轮之间同时包含 retriever v3、紧凑资源、确定性收口、空白线程等变化，**不能把差异全部归因给模型**。

## 独立首因 / 语义问题

1. **条件式显式写入被 read-only 护栏误判**
   - `obs-03-001`：「先确认是否已有；没有才创建」先正确 list，随后 `session.create` 被 `write_intent_required` 拦截。
   - `obs-03-034`：「检查后仅创建缺少的 B/C」同样被拦；最终 B/C 均未创建。
   - `obs-03-028`：明确要求执行格式修复并在应用 diff 前取消，仍被当成只读；工具完成原文/画像读取后，`chat.repair_message_format` 被 `write_intent_required` 拦截，未进入预期 diff 取消流程。
   - 影响：护栏没有造成越界写入，但会拒绝用户已经明确授权的条件写入 / 预览后取消流程。

2. **不存在模型档错误路由到会话配置**
   - `obs-03-025` 要切换不存在的聊天模型配置，实际调用 `session.open_config({sessionName:"冻结观察不存在档"})`。
   - 没有创建会话、没有切换模型，但打开了错误领域的“幽灵”会话配置页。

3. **正文优化没有使用已有本地原文**
   - `obs-03-027` 直接 responded，要求用户再提供回复内容；没有调用 `chat.optimize_message`。
   - APP 实际可读取「格式修复测试」最近 AI 的 `rawOriginal`，因此属于未执行目标能力。

4. **缺壁纸附件时仍尝试 prepare**
   - `obs-03-032` 明确要求没有附件就不要执行，模型仍调用 `media.prepare_image`，最终以 `image_attachment_missing` 失败。
   - 没有伪造 attachmentId、没有写壁纸，但多了一次本应省略的工具调用。

5. **replace 取消的安全副本与回答不一致（既有产品语义）**
   - `obs-03-026` 自动选择「新建副本」，原书没有被覆盖，但创建了 `冻结观察写入-0728 (3)`。
   - 模型回答“原内容没有被修改，一切保持不变”，遗漏了安全副本已经创建的副作用。

## 次要流程偏差

- `pilot-007` 最后以 `maid.todo.write` 更新完成态，没有再调用预期的 `maid.todo.read`；结果仍能汇报完成状态。
- `pilot-004` 连续两次 `app.open_panel`，属于无害冗余。
- `obs-03-028` 首次 `app.read_resource` 参数缺少 `resource`，随后自行修正。
- 已存在的测试用户 / 角色 / 世界书条目走只读或 update 幂等分支，因此若只看固定 feature 断言会出现 coverage mismatch；数据结果正确。
- Shadow 两个真实 miss 为 `obs-03-011 worldbook.update_entries` 与 `obs-03-016 app.state.read`，均为最终已正确执行但未进入 Top-K 的 `selectedRank=0`。

## 正向结果

- 12 项基础门禁全部 succeeded；没有 interrupted、repeated_tool_loop 或 harness timeout。
- 第 1 项创建失败后，`obs-03-003` 在发送消息流程中重新 list、创建 A、发送并读回，最终消息链恢复。
- 世界书短条目更新、读回、会话绑定、拒绝删除保护均正确；权威读回：
  - `门牌规则` = `仅用于冻结观察批量测试；禁止用于正式资料。`
  - `观察标记` = `OBS-03`
- 动态 `【冻结观察 OBS-03】权限与流程测试` 发布成功。
- 用户 / 角色卡测试项都没有切换当前身份；APP 主聊天档仍为 Deepseek v4f。
- 用户头像、角色头像缺附件均零写入；联系人头像正确停在 `no_attachment`。壁纸虽多调用一次 prepare，也没有写入。
- 格式修复目标 `格式修复测试` 最近三条 AI 的 `rawOriginal` / displayText 独立读回正常，取消/拦截流程没有改写聊天。
- 最终模型状态：女仆主模型、APP 主模型、Sub-agent 均为 `deepseek-v4-flash`。

## 测试后的可见状态

- 测试重新创建了 `冻结观察会话-A-0728`；B/C 因写意图误判不存在；D 未创建。
- 当前界面已恢复到 `格式修复测试`。
- 原女仆线程已恢复；v4f 测试线程另存为 `maid-conversation-v4f-final.json`。
- replace 拒绝新增安全副本 `冻结观察写入-0728 (3)`；原书未覆盖。

## 文件

- `results-v4f-pilot.jsonl`
- `results-v4f-obs-03.jsonl`
- `maid-conversation-before-v4f.json`
- `maid-conversation-v4f-final.json`
- `V4F-SUMMARY.md`

