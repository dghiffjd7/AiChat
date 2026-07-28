# 女仆工具 / 流程冻结观察总结

时间：2026-07-28 17:30 CST

## 范围与冻结配置

- 共 212 项：pilot 12 项，obs-01～obs-05 各 40 项。
- 女仆主模型：`gemini-3.5-flash`。
- APP 当前聊天模型：`deepseek-v4-flash`。
- 长正文 Sub-agent：`deepseek-v4-flash`（「快手 flash」）。
- 能力路由：`shadow`，测试期间没有做产品针对性修复。
- 所有批次由 Windows PowerShell 启动；确认窗只自动选择「允许一次」，没有选择「始终允许」。

## 原始结果

| 批次 | 任务 | succeeded | responded | interrupted | failed | timeout | Shadow 命中 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| pilot | 12 | 11 | 1 | 0 | 0 | 0 | 14 / 16 |
| obs-01 | 40 | 33 | 3 | 2 | 1 | 1 | 41 / 48 |
| obs-02 | 40 | 34 | 3 | 2 | 1 | 0 | 28 / 45 |
| obs-03 | 40 | 31 | 5 | 1 | 3 | 0 | 44 / 68 |
| obs-04 | 40 | 29 | 1 | 5 | 5 | 0 | 73 / 97 |
| obs-05 | 40 | 34 | 3 | 2 | 1 | 0 | 20 / 45 |

- 原始状态合计：172 succeeded、16 responded、12 interrupted、11 failed、1 harness timeout。
- `obs-01-036` 是首次用户功能引导等待交互造成的挂具超时；点「跳过引导」后产品 run 成功，但重复读取 user 资源 5 次。恢复记录另含 3 / 3 Shadow 命中。
- 因此本轮 Shadow 实际增量为 **322 有效 / 223 命中（69.3%）**。
- 最终 APP 权威统计：**500 snapshots（已到存储上限）/ 462 有效 / 335 命中（72.5%）**；500 有效门槛进度 **92.4%**。
- 本轮分阶段：planner **114 / 195（58.5%）**，react **109 / 127（85.8%）**。首轮候选召回明显弱于 ReAct 中段。

原始状态不是验收通过率：11 个 failed 中有 6 个是预期的安全失败 / 无操作（拒绝删除、目标不存在、无需优化等）；相反，succeeded 中也存在只读请求触发写工具等语义问题。

## 成本与规模

- 194 个有 usage 的 run，342 个工具步骤。
- Token 合计 **15,008,635**：prompt 14,626,043，completion 382,592；平均约 77,364 tokens / metered run。
- 各任务 duration 加总约 82.4 分钟（并非墙钟时间）。
- 高频工具：`app.read_resource` 84 次、`maid.todo.write` 36 次、`worldbook.read` 33 次、`session.list` 25 次、`app.open_panel` 24 次。
- 单任务最高成本：
  - `obs-04-010`：345,303 tokens，三资源读取扩张为 11 步后中断。
  - `obs-04-011`：331,153 tokens，persona/user 比较扩张为 9 步后中断。
  - `obs-03-028`：275,875 tokens，格式修复反复导航、读取、重试后仍失败。

## 关键发现

### P0

1. **只读意图触发写入**
   - `obs-03-016` 只要求查询「冻结观察会话-A-0728」的绑定。
   - 实际链路：`worldbook.list → app.read_resource → worldbook.bind_session → worldbook.list → app.read_resource`。
   - 结果擅自把「冻结观察SubAgent测试-0728」追加绑定到该会话。数据写入已发生，不能只按 succeeded 判断通过。

2. **格式修复拿得到 rawOriginal，仍拿不到轮次元数据**
   - `obs-03-028`、`obs-04-032` 都返回 `turn_metadata_unavailable`。
   - 同一流程中的 `app.read_resource(resource=chat)` 已能读到目标消息的 `rawOriginal` 与 messageId。
   - 现有 protocol-delivery / 历史消息缺少格式修复工具要求的完整 turn metadata，导致无法生成补丁。

### P1

3. **11 次 `repeated_tool_loop`**
   - persona：3 次稳定复现（每次 4 次相同读取后中断）。
   - user：2 次稳定复现（每次 3 次相同读取后中断）；另有一次恢复任务读取 5 次才成功。
   - 也出现在 state、todo.read、多资源、UI click 等任务，说明不只由大 payload 触发。

4. **persona/user 资源 payload 放大上下文**
   - 默认返回头像 base64、描述和完整档案；模型只需总数/名称时仍收到大对象。
   - 这两类任务高频进入 100k～145k tokens，并诱发继续读取。

5. **多步骤任务过度使用 todo**
   - 本轮 `maid.todo.write` 36 次。
   - 两三步只读任务也会在每步前后更新 todo；有时重复相同 todo 直到 loop guard 中断。
   - `obs-04-037` 已取得 Agent Center 的 `活动` ref，仍未调用 `ui.click_element`，反而重复 todo 写入。

6. **Shadow 首轮召回不足**
   - 本轮 planner 仅 58.5%，react 为 85.8%。
   - 大量正确工具最终执行成功，但不在 Shadow 候选集内，记录为 `selectedRank=0`。
   - miss 主要集中在 `worldbook.read`、`app.read_resource`、`session.list`、`maid.todo.write`、配置与状态读取。

### P2 / 外部依赖

7. **文本网页搜索 0 / 3**
   - 三次均以 DuckDuckGo 空结果结束，通常重复 `web.research → web.search`。
   - 同期图片搜索 4 / 4、`web.fetch_url(https://example.com)` 1 / 1 成功，故障集中在文本搜索结果源。

8. **首次教学会等待真实用户动作**
   - 挂具最初只识别旧文案，未匹配「帮主人来」，造成两次阻塞。
   - 临时挂具已补「帮主人来 / assist-click / 收入囊中」与非教学任务自动「跳过引导」；没有修改产品逻辑。

9. **创建会话有瞬时导航副作用**
   - 批量 `session.create` 会依次把新会话设为当前会话；模型随后用 `session.open` 恢复原会话。
   - 最终状态正确，但“创建但不要进入”无法做到全过程不进入。

10. **replace 拒绝的既定语义是安全副本**
    - `obs-03-026` 取消覆盖后按产品策略创建「冻结观察写入-0728 (2)」，原书未被覆盖。
    - 这是安全 fallback，不应误记为“完全无写入”；测试定义后续应明确区分。

## 正向结果

- 5 次成功的 `worldbook.generate_entries` 委派全部为：
  - `delegated:true`
  - `modelUsed:"deepseek-v4-flash"`
  - `subAgentName:"快手 flash"`
- 长正文单条、追加、一次两条均成功并由 `worldbook.read` 验证；短正文明确禁用 Sub-agent 时正确走 `worldbook.create`。
- 自动授权均为「允许一次」，没有「始终允许」记录。
- 删除拒绝后条目保留；不存在配置 / 会话 / 世界书不会模糊改到相似目标；不存在会话的消息不会落到当前房间。
- 四种缺附件头像 / 壁纸请求全部零工具澄清，没有伪造 attachmentId。
- 正文优化有一次成功生成 diff 并取消，结果 `applied:false / userDecision:"cancelled"`。
- 无工具、含糊目标、冲突约束、只查能力说明等边界任务整体稳定。

## 测试产物（保留供检查）

- 会话：`冻结观察会话-A-0728`、`B-0728`、`C-0728`、`D-0728`。
- 用户 / 角色卡：`冻结观察用户-0728`、`冻结观察角色-0728`；均未切换为当前项。
- 世界书：
  - `冻结观察SubAgent测试-0728`
  - `冻结观察写入-0728`
  - `冻结观察写入-0728 (2)`（取消 replace 后的安全副本）
  - `冻结观察SubAgent-A-0728`
  - `冻结观察SubAgent-B-0728`
- 动态：`【冻结观察 OBS-03】权限与流程测试`，未生成评论。
- `冻结观察会话-A-0728` 保存了 `<obs>...</obs>` 测试格式画像。
- 待办已清空；当前会话已恢复为 `格式修复测试`，聊天模型仍为 `Deepseek / deepseek-v4-flash`。

## 建议的修复顺序（本轮未实施）

1. 加入 read-only 意图到 write-tool 的运行时护栏，先阻止 `obs-03-016` 类越界写入。
2. 让格式修复能从最新 AI message / rawOriginal 恢复完整轮次，或在缺 turn metadata 时提供明确兼容路径。
3. persona/user 默认提供紧凑投影（id/name/active/count），头像与描述改为显式 include 才返回。
4. 对已成功且结果足以回答的只读工具增加确定性收尾，降低重复 ReAct 与 todo 自循环。
5. 修复 UI ref 点击的 feature/tool 对齐与 `app.visible_panel_summary.read` 幻觉 feature。
6. 基于本轮 planner miss 做召回改进，再补至少 38 个有效样本；当前命中率下不建议从 Shadow 晋升。
7. 单独排查文本搜索 provider，避免把外部空结果和能力路由问题混为一类。

## 文件

- `results-pilot.jsonl`
- `results-obs-01.jsonl` ～ `results-obs-05.jsonl`
- `task-bank.mjs`
- `run-batch.mjs`
- `analyze-results.mjs`

以上都位于本目录，保持未提交。
