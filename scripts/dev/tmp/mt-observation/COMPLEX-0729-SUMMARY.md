# 女仆复杂跨资源双模型观察总结

时间：2026-07-29 11:42 CST

## 范围与冻结配置

- 本轮只做探索测试、业务判定与根因记录，不按失败逐项修改产品代码。
- 两种主模型分别使用独立空白女仆线程与独立测试资源前缀：
  - `Deepseek / deepseek-v4-flash` → `复杂压力V4F-0729`
  - `pioneer / custom` + `gemini-3.5-flash` override → `复杂压力G35-0729`
- APP 主聊天档与 Sub-agent「快手 flash」始终为 `deepseek-v4-flash`。
- 未调用 5.6-sol 或 Opus 4.6；如后续需要复核，它们仍只允许从 `pioneer` 配置调用。
- 路由全程为 `maid-capability-retriever-v3 / shadow`。挂具只自动点击“允许一次”和明确需要的 Sub-agent 许可，没有点击“始终允许”。
- 两个模型运行同构的 16 项复杂任务，覆盖关联资源、多步读写、Sub-agent、人物识别、批量建房/绑定、跨房消息、格式画像、局部更新、reveal、部分失败、幂等、用户/角色卡隔离、联网取材及群组/预设能力缺口。

## 原始状态与业务判定

| 主模型 | 原始状态 | Shadow 命中 | 完整通过 | 有限通过 | 未通过 |
| --- | --- | ---: | ---: | ---: | ---: |
| Deepseek V4 Flash | 12 succeeded / 2 responded / 1 failed / 1 interrupted | 50 / 53（94.34%） | 10 | 3 | 3 |
| Pioneer Gemini 3.5 Flash | 12 succeeded / 1 responded / 1 failed / 2 interrupted | 58 / 62（93.55%） | 11 | 2 | 3 |
| 合计 | 32 项 | **108 / 115（93.91%）** | **21** | **5** | **6** |

业务判定不直接照抄顶层状态：

- `complex-010` 的顶层 `failed` 是故意混入不存在会话后的预期 `partial failure`；两模型都正确报告 0 succeeded / 2 skipped / 1 failed，不算业务失败。
- “有限通过”表示核心结果正确，但缺少用户明确要求的状态验证，或安全说明正确却未显式调用要求的能力查询。
- V4F 未通过：关联审计循环中断、幂等任务误导航、预设 CRUD 只回复“先查一下”却没有执行或给结论。
- Gemini 未通过：关联审计达到步数上限、幂等任务误导航、联网搜索达到步数上限且没有最终条件式结论。

## Provider 实际 usage

| 主模型 | recorded runs | prompt | completion | total | model calls | tool calls | 16 项总时长 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Deepseek V4 Flash | 14 | 745,183 | 60,362 | 805,545 | 69 | 62 | 656,341 ms |
| Pioneer Gemini 3.5 Flash | 15 | 883,561 | 44,973 | 928,534 | 75 | 68 | 458,311 ms |

- V4F 的群组/预设两项直接 `responded`，没有 AgentRun usage；Gemini 的预设项实际跑了工具，因此总表不是完全等样本。
- 排除 Gemini 独有的预设 run 后，同一 14 个 recorded tasks 为 886,111 tokens / 72 model calls / 66 tool calls / 388,810 ms。相对 V4F：token 约多 10.0%，模型调用多 3，工具调用多 4，但 provider latency 约少 36.5%。
- 两轮所有 Run 都是指定主模型，`degraded=false`，没有 fallback；长正文 Sub-agent 明确使用 `deepseek-v4-flash`。

## 独立根因与重要发现

### 1. 并列否定被误判为 reveal，真实改变当前聊天室

两模型在幂等任务中都输出了：

```json
{"toolName":"session.create","args":{"names":["...·岚","...·弦"],"open":true}}
```

原请求是“不要逐房重复绑定或打开页面”。Windows 纯函数复现：

- `不要打开页面。` → `background`
- `不要逐房重复绑定或打开页面。` → `reveal`
- 完整幂等原句 → `reveal`

根因已定位到 `classifyMaidPresentationIntent()` 的正则否定范围：background 只识别连续的“不要打开”，没有覆盖“不要 A 或 B”；后续 reveal 正则看见“打开页面”便误判。执行层随后按 reveal 强制把 `session.create.open` 改成 true。两个批次最终都切到第一个测试房，最终审计正确揭露；不是 `session.create(open:false)` 的工具实现回归，也不是单一模型偶发。

本轮只记录，未修补。

### 2. 三角色关联资源审计在两模型上都无法收尾

- V4F：先正确读 3 份 associations 与 2 本世界书，随后给 `app.read_resource` 错加 `open:false`，修参后又连续三次重复读取“海贼王”，触发 `repeated_tool_loop`。
- Gemini：正确读 3 份 associations，但重复读取“清月师尊”世界书/角色关联，10 个工具步骤后 `max_steps_reached`。
- 两轮该任务所有实际选择均在 Shadow Top-K 内，因此不是 Retriever miss；主因是多目标读取的任务推进、已完成项记忆与终止策略。现有轻量 associations 已避免大字段爆窗，但一次需要 3 个角色 + 3 本世界书时仍容易产生重复调用。

### 3. 新增 7 个 raw miss，收敛为 3 个真实召回模式

1. **复合幂等任务的 `session.create` ×2（两模型同题）**  
   Planner 首步候选被 worldbook 绑定/读取和历史上下文占满；原句明确包含 `session.create(names[])`，实际选择合法但候选 rank=0。属于复合子意图召回缺口。
2. **同一任务中的 `user.create` + `persona.create` ×4（两模型各两项）**  
   在先读清单、再依次创建两类资源时，当前 observation/previous capability 让一个创建能力挤掉另一个；属于顺序多子目标下 sibling capability 未被保留。
3. **Gemini 人物建房任务的 `worldbook.read` ×1**  
   Gemini 先执行 `session.list`，下一步候选没有保留原始目标中的 worldbook 读取；V4F 因先读世界书没有复现。属于执行顺序相关的 query/sticky 缺口。

七项都不是模型虚构工具、策略正确排除或高风险过滤，均需作为真正 recall miss 保留。当前没有为它们改 alias、评分或 query builder。

### 4. schema 自修复有效，但仍产生额外调用

- V4F 给 `worldbook.generate_entries` 错加不允许的 `mode:"append"`，第一次 invalid_args 后正确移除并成功；世界书最终只有一条“共同事件”，没有重复写入。
- Gemini 给 `user.create` 错传 `active:false`，随后改为合法参数并成功；用户最终只有一项且未切换。
- Gemini 的 Sub-agent 只生成一次；V4F 日志中两次 generate 调用是“一次 schema 失败 + 一次真实生成”，不是双写。

### 5. 部分失败契约有效，V4F 对 compensation 的解释不够精确

- 两模型都准确区分 `already_bound`、`session_not_found`、`duplicate_target`，只把不存在目标放入 retry args，也没有创建缺失房间。
- 工具没有执行任何新写入，因此 `compensation=null`。Gemini 正确说“目前无可用补偿范围”；V4F 把“先创建缺失聊天室再重试”放在“可用补偿范围”下，实际那是 retry 前置动作，不是对已写入项的补偿。

### 6. 其它流程差异

- V4F 跨房写入正确发送/读回，但没有执行最后的 APP 状态读取，却口头声称仍在原房；当时事实确实未变，但属于未验证结论。Gemini 完整执行了状态读取。
- 两模型的人物建房任务都使用 `open:false` 并正确创建两房，但都省略了最后的状态工具验证。
- V4F 幂等任务在批量绑定后又重复执行 `session.create + session.list`；Gemini 没有重复。
- 最终审计中 V4F 在完成五项必需读取后又重复世界书、会话和一份格式画像；Gemini 重复世界书和会话。两者都有收尾冗余。
- 联网取材：V4F 搜索三次仍不足两条官方来源，按条件安全停止且零写入；Gemini 搜索/研究八次后达到步数上限，零写入但未给最终结论。
- 群组能力缺口：两模型都没有创建第三个单聊或盲点 UI，直接说明缺少群组创建与成员编辑工具；但都没有显式调用用户要求的能力查询工具。
- 预设 CRUD：Gemini 读取预设并查询目录后正确说明无正式写工具；V4F 只回复将要查询，任务未完成。

## 正向结果与权威产物核对

两个资源前缀均已只读核对：

- 世界书各 5 个条目，恰为：调查员岚、机械师弦、灰港、共同事件、联络暗号；没有“远程调试参考”半成品。
- 各有两个单聊，名称唯一；每房只绑定对应测试世界书。
- 两房格式画像分别为 `<lan>...</lan>` 与 `<xian>...</xian>`，sources 正确。
- 各有一个 inactive 测试用户和一个 inactive 测试角色卡；当前用户/角色卡未被切换。
- 没有建立测试群组或预设副本，也没有改动正式世界书、正式预设或正式身份。
- `worldbook.bind_sessions` 的 preview → 一次实际执行、逐项 verified、幂等 already_bound、部分失败 retry/compensation 数据都经真实 APP 链验证。
- 灰港单条更新没有影响其他条目；跨房消息以 `triggerReply:false/open:false` 正确写入并读回。

## Shadow 样本变化

测试前 v3：

- 261 valid / 250 hit / 11 raw miss
- 136 runs / 125 covered

测试后 v3：

- **376 valid / 358 hit / 18 raw miss**
- **165 runs / 149 covered**
- 距 500 还差 **124**

按模型：

- `deepseek/deepseek-v4-flash`：96/90 → **149/140**（本轮 +53/+50，3 miss）
- `custom/gemini-3.5-flash`：113/111 → **175/169**（本轮 +62/+58，4 miss）
- `custom/gpt-5.6-sol` 保持 52/49，证明本轮没有调用高模型。

本轮暴露了 7 个未修真实 miss 和一个确定的呈现分类 bug，因此不能因样本接近 500 而进入 Canary；最早日期仍不早于 2026-08-11。

## 恢复状态与文件

- 原女仆线程已恢复：`maid_default`，120 turns / 240 memory rows。
- 女仆主模型恢复为 `Deepseek / deepseek-v4-flash`；APP 主聊天档与 Sub-agent 仍为 V4F。
- 当前界面恢复到「格式修复测试」；dev 继续运行。
- 两批测试产物保留供 UI/Agent Center 检查，尚未清理。

主要文件：

- `results-complex-v4f-0729.jsonl`
- `results-complex-g35-0729.jsonl`
- `maid-conversation-complex-v4f-20260729.json`
- `maid-conversation-complex-g35-20260729.json`
- `maid-conversation-before-complex-20260729.json`
- `task-bank.mjs`
- `run-batch.mjs`
- `COMPLEX-0729-SUMMARY.md`
