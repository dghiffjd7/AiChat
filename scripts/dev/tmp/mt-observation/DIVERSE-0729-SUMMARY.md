# 女仆扩面复杂任务双模型观察总结

时间：2026-07-29 13:07 CST  
修复闭环更新：2026-07-29 14:22 CST

## 14:22 修复闭环更新

13:07 的原始观察、失败现场和逐题判定继续保留不改写；随后已按根因依序完成：

- `worldbook.delete_entries` 在 `dedupeByTitle:true` 混用非空 `entries/deletes` 时，于确认及写入前返回 `ambiguous_delete_mode`；合法的 `titles + dedupe + keep:first` 保持原行为。
- scoped navigation 补“不得”，原三房创建措辞保持 `open:false`；`chat.send_message` concept matcher 补齐“各写/写入一条用户消息”，Planner 与读回后的 ReAct 均持续召回。
- 对可精确解析的三房后台消息加入发送→读回→最终状态剩余账本；preview/apply 只在明确的正向两阶段写请求推进，“只预览”永不 apply；显式“最后读取 APP 状态”成为不可被 early final 跳过的义务。
- 最终跨资源审计按世界书、sessions、user、persona、逐房格式画像与 state 结构化消账。generic `app.read_resource(worldbook)` 只在返回同名 worldbook 和 `entries[]` 时等价完成目标；Candidate 模式的确定性剩余步骤使用经过权限/schema 复验的单能力 child snapshot，且不进入 recall 样本。

真实回归保留三组记录：

| 批次 | 结果 | 关键路径 |
| --- | --- | --- |
| `fix-closure-v4f-0729` | 前 3 题成功；原最终审计在 generic worldbook read 后因旧精确账本不认语义覆盖而 10 步中断，作为失败证据保留 | 后台三房创建；preview→apply→state；3 send→3 read→state |
| `fix-closure-audit-v4f-r2-0729` | 成功，18.055s | worldbook→sessions→user→persona→3 profiles→state，8 项各一次 |
| `fix-closure-g35-0729` | 4/4 成功 | 同构四题全部完成；审计 5.658s，8 项各一次 |

Gemini 的 preview/apply 题在成功写入后读取了两次 APP state；无重复写入或业务副作用，先作为弱模型观察项保留，不为一次无害读操作扩大通用护栏。

本次闭环真实运行给 retriever v3 新增 **41 valid / 41 hit / 0 miss**，权威累计为 **543 valid / 522 hit / 21 历史 raw miss（200 Runs / 181 全覆盖）**；分模型 Gemini 252/244、V4F 239/229、Pioneer 5.6 52/49。历史 raw miss 不倒扣，累计 recall 96.13%，观察窗最早到 2026-08-11，所以仍保持 Shadow，不进入 Canary。

最终恢复核对：`maid_default` 为 120 turns / 240 memory rows，主聊天档、女仆与「快手 flash」均为 Deepseek V4F；通过正式 `exitRpMode` 流程清理残留 RP 外壳后，APP 为 `activePage=chat / uiMode=chat / sessionId=格式修复测试`，PID 17248、`Responding=true`。

原始记录：

- `results-fix-closure-v4f-0729.jsonl`
- `results-fix-closure-audit-v4f-r2-0729.jsonl`
- `results-fix-closure-g35-0729.jsonl`

## 范围与冻结配置

- 本轮目标是用不同于前批的复杂跨资源任务补足 retriever v3 Shadow 有效样本，并观察弱模型在批量操作、部分失败恢复和长链收尾上的真实表现；运行期间不按失败逐项修改产品代码。
- 两种主模型分别使用独立空白女仆线程与独立测试资源前缀：
  - `Deepseek / deepseek-v4-flash` → `扩面压力V4F-0729`
  - `pioneer / custom` + `gemini-3.5-flash` override → `扩面压力G35-0729`
- APP 主聊天档与 Sub-agent「快手 flash」保持 `deepseek-v4-flash`；本轮任务没有触发 Sub-agent，也没有调用 5.6-sol 或 Opus 4.6。
- 路由全程为 `maid-capability-retriever-v3 / shadow`，Canary 比例为 0。
- 两个模型各运行同构 11 项：五源基线、用户/角色卡条件创建、三房批量创建、含受控重复项的世界书建立、去重删除与两条批量更新、三房 preview/apply 绑定、三房后台消息与读回、三份格式画像、部分失败精确恢复、远程图片复用链及最终跨资源审计。

## 原始状态与业务判定

| 主模型 | 原始状态 | Shadow 命中 | 完整/安全通过 | 有限通过 | 未通过 |
| --- | --- | ---: | ---: | ---: | ---: |
| Deepseek V4 Flash | 7 succeeded / 3 interrupted / 1 failed | 43 / 44（97.73%） | 3 | 2 | 6 |
| Pioneer Gemini 3.5 Flash | 7 succeeded / 3 interrupted / 1 failed | 53 / 55（96.36%） | 7 | 2 | 2 |
| 合计 | 22 项 | **96 / 99（96.97%）** | **10** | **4** | **8** |

业务判定不直接照抄顶层状态：

- 两模型的图片链顶层均为 `failed`，但原因是所有真实图源都未返回有效图片；模型按原请求在搜索失败后停止，没有编造 URL/attachmentId，也没有继续写头像或壁纸，记为条件式安全通过。
- V4F 完整/安全通过：世界书受控建档、三份格式画像、图片失败安全停止；有限通过：三房绑定核心 preview/apply 成功但漏读 APP 状态、部分失败恢复最终生效但重复执行且说明失真。
- V4F 未通过：五源基线工具/feature 错配被安全拒绝；身份条件创建在读完用户后输出失控并触发长度截断；批量建房错误打开房间后读清单循环；去重把两条临时草稿全删；三房消息只完成第一房；最终审计达到步数上限。
- Gemini 完整/安全通过：五源基线、身份条件创建、世界书建档、去重更新、格式画像、部分失败恢复与图片失败安全停止；有限通过：三房创建曾错误导航但自行恢复、三房消息及读回已完成但漏掉最后状态与最终回答。
- Gemini 未通过：三房绑定连续三次停留在 `preview:true` 而未 apply；最终审计重复整段读取并达到步数上限。

## Provider 实际 usage

| 主模型 | recorded runs | prompt | completion | total | model calls | tool calls | 11 项总时长 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Deepseek V4 Flash | 11 | 651,883 | 81,620 | 733,503 | 56 | 48 | 783,651 ms |
| Pioneer Gemini 3.5 Flash | 11 | 749,219 | 41,022 | 790,241 | 63 | 60 | 374,169 ms |

- 同构 11 项中，Gemini 总 token 比 V4F 多 7.74%，模型调用多 12.5%，工具调用多 25.0%；但 provider latency 少 54.18%，任务总时长少 52.25%。
- 所有 Run 都使用指定主模型，`degraded=false`，没有 fallback。
- V4F 身份条件创建单题以 `finishReason=length` 结束，消耗 29,694 tokens；顶层虽标为 succeeded，实际只读了一次用户清单，最终文本是重复的内部格式指令，不是有效回答。

## 逐题结果摘要

| 题目 | V4F | Gemini |
| --- | --- | --- |
| 五源后台基线 | feature/tool 错配后 `tool_not_allowed`，安全中止 | 五源全部读取并正确汇总 |
| 用户/角色卡条件创建 | 只读用户后输出失控，未创建 | 一次非法 `active:false` 后自修复；各创建一项且 inactive |
| 三房批量创建 | 三房创建成功，但 `open:true` 且重复 list 中断 | 三房创建成功；曾 `open:true`，随后修参返回正式房 |
| 世界书受控建档 | 6 条正确写入 | 6 条正确写入 |
| 去重 + 两条更新 | 错删两条草稿，最终仅 4 条 | 保留草稿-A，最终 5 条正确 |
| 三房批量绑定 | preview/apply 均成功，漏状态读取 | 重复 preview 三次，未 apply |
| 三房消息矩阵 | 仅观测站写入并读回 | 三房均写入并读回，漏状态/最终回答 |
| 三份格式画像 | 全部正确 | 全部正确 |
| 部分失败精确恢复 | 缺失房创建、精确 retry 成功；之后重复原批次且汇报失真 | 精确识别、建房、retry、状态核对一次完成 |
| 远程图片复用 | 图源失败后零写入 | 图源失败后零写入 |
| 最终只读审计 | 重复世界书读取，max steps | 重复五源读取前缀，max steps |

## 已确认根因与重要发现

### 1. `不得` 没有进入呈现语义的否定词集合

三房批量创建原句明确写了“`open:false，不得逐房创建或进入`”，但两模型最终执行参数都变成 `open:true`。这不是两个模型恰好同时忽略参数：

- `MAID_SCOPED_NEGATED_NAVIGATION_PATTERN` 支持“不要、别、无需、不用、禁止、避免、不可、不能”，没有“不得”。
- background 没命中后，reveal 正则命中“进入”，执行策略再把 `session.create.open` 强制成 true。
- V4F 因而留在测试观测站，直到批次结束后由挂具恢复；Gemini 发现当前房变化后自行调用 `session.open`，第一次参数错误、第二次成功恢复。

这是确定性的呈现分类缺口，且已在两个模型上交叉复现；后续应先补原句级分类/执行回归，再做最小修复。

### 2. 去重工具接受“显式删除 + dedupe”组合，产生并集删除

V4F 对去重题调用：

```json
{
  "name": "扩面压力V4F-0729·档案库",
  "entries": ["临时草稿"],
  "dedupeByTitle": true,
  "keep": "first"
}
```

工具先把 `entries:["临时草稿"]` 匹配到第一条并加入删除计划，再由 dedupe 逻辑把第二条重复项加入同一删除计划，因此两条都被删除。Gemini 使用目录建议的 `titles:["临时草稿"] + dedupeByTitle:true + keep:first`，只删除一条。

目录提示已经区分两套参数，但删除工具仍接受这个具有破坏性的混合组合。后续应把它当成执行层安全契约问题：对 `dedupeByTitle:true` 与 `entries/deletes` 同时出现时拒绝或明确唯一语义，不能只依赖模型永远拼对参数。

### 3. 多目标任务仍缺“剩余目标”级推进与确定性收尾

- V4F 最终审计用不同的 `includeContent/maxEntries/maxContentLength` 组合重复读取同一本世界书；现有成功读取账本以“工具名 + 参数 JSON”作为精确键，无法识别这些读取已被更完整结果语义覆盖。
- Gemini 最终审计重复 `worldbook → sessions → user → persona → profile` 前缀，只把格式画像从 A 推进到 B，随后耗尽 10 步。
- V4F 三房消息在完成 A 后直接 final“继续发送第二条”，没有真正调用后续工具；Gemini 完成三次发送和三次读回后，仍因最后状态工具超出推荐步数而无最终回答。
- Gemini 三房绑定把相同 `preview:true` 连续执行三次，说明模型没有把“预览成功 → 同参 apply”表示成可靠的阶段迁移。

此前新增的读取账本解决了“早期 observation 被滚动窗口挤出”的特定问题，但它仍是提示级、精确参数级记录；弱模型可以忽略，也没有表示多个 sibling 目标及 preview/apply 的确定性剩余状态。后续修复应优先抽象可验证的剩余目标/阶段，而不是继续给最终提示叠加自然语言。

### 4. 新增 3 个 raw miss：2 个真召回模式 + 1 个模型自加 detour

1. **`chat.send_message` ×2（两模型同题）**  
   三房发送任务在 Planner/恢复决策中各有一次实际选择 rank=0；相邻决策曾把发送能力放在 Top-1/Top-2，但读回或重新规划后未保留尚未完成的 sibling send 子目标。这是“重复同类目标的剩余子目标未留在 query/candidate”真召回模式。
2. **Gemini `app.resource.read` ×1**  
   三房绑定题没有要求先调用通用资源读取；候选已经包含 `worldbook.bind_sessions` Top-1、`worldbook.read` Top-3 等充分能力，模型额外选择了 `app.read_resource(worldbook)`。这项 raw miss 应保留，但归因为模型自加 preflight/detour，不是显式用户子目标的 Retriever 漏召回。

累计 raw miss 不因归因或后续修复倒扣。两条 `chat.send_message` 仍需原句测试与真实回归闭环；`app.resource.read` 不宜为了模型多余动作扩大全局候选。

### 5. 安全拒绝与外部失败均按预期工作

- V4F 五源基线第二步把 `featureId=session.list` 与 `toolName=app.read_resource` 错配；运行时白名单返回 `tool_not_allowed`，没有按错误 feature 越权执行。它是模型结构化决策错误，不是 Shadow miss。
- 两模型图片搜索得到完全一致的真实 provider 结果：Safebooru/Openverse 无结果、Danbooru/DuckDuckGo HTTP 403、Bing 图片疑似限流并返回无关页面。两者均停在 `web.search_images`，没有进入 `media.fetch_image` 或资产写入。这只能证明当前查询/图源失败时的安全收口，不能据此判断下载、头像或壁纸后半链路。

## 最终资源核对

### V4F 前缀

- 4 个单聊名称均唯一；四房最终都绑定对应测试世界书。
- 只有观测站收到测试消息，档案室/检查站未收到。
- 三份格式画像均正确。
- 测试用户和测试角色卡均未创建。
- 世界书只有 4 条永久项；站长/档案员正文更新正确，但本应保留的一个“临时草稿”被删除。
- 没有头像或壁纸写入。

### Gemini 前缀

- 4 个单聊名称均唯一。
- 观测站和中继站已绑定对应世界书；档案室、检查站因 preview 循环仍未绑定。
- 三个主要测试房均收到并保留了正确用户消息。
- 三份格式画像均正确。
- 测试用户与测试角色卡各一项、均 inactive。
- 世界书为正确的 5 条，保留“临时草稿/草稿-A”一条；站长/档案员正文更新正确。
- 没有头像或壁纸写入。

这些资源按“观察产物”保留，未做事后补齐，便于在 APP 和 Agent Center 中检查真实失败状态。

## Shadow 样本变化

测试前 v3：

- 403 valid / 385 hit / 18 raw miss
- 169 runs / 153 covered

测试后 v3：

- **502 valid / 481 hit / 21 raw miss**
- **191 runs / 172 covered**
- 本轮 **+99 valid / +96 hit / +3 raw miss**

按模型累计：

- `deepseek/deepseek-v4-flash`：**214 valid / 204 hit / 10 miss，90 runs / 81 covered**
- `custom/gemini-3.5-flash`：**236 valid / 228 hit / 8 miss，82 runs / 75 covered**
- `custom/gpt-5.6-sol`：保持 **52 valid / 49 hit / 3 miss，19 runs / 16 covered**

样本数量首次达到 500，但当前 raw recall 仅 **95.82%**，且新增两条未闭环的真实发送子目标 miss。7–14 天观察窗最早仍到 2026-08-11；因此这次只完成“数量门槛”，不能切 Canary，更不能标记 Phase A 完成。

## 建议的下一步

1. 先以原始失败参数补测试并让 `worldbook.delete_entries` 对显式删除 selector + dedupe 混用 fail closed，避免 `keep:first` 的保留项被并集删除。
2. 补“不得逐房创建或进入”的呈现分类与 `session.create.open:false` 执行回归。
3. 以同一三房消息原句闭环两条 `chat.send_message` sibling 召回 miss；不要为 Gemini 自加的通用资源预读扩大候选。
4. 再单独设计有界的剩余目标/阶段状态和确定性收尾，覆盖语义等价读取、preview→apply、部分完成与最终状态验证。
5. 上述问题修复并回归后再继续积累干净 Shadow 样本。当前数量已达标，不建议现在立刻换第三个模型继续堆量。

## 恢复状态与文件

- 原女仆线程已恢复：`maid_default`，120 turns / 240 memory rows。
- 女仆主模型已恢复为 `Deepseek / deepseek-v4-flash`；APP 主聊天档与 Sub-agent 仍为 V4F。
- 当前界面已恢复到「格式修复测试」；当前用户为「我」，当前角色卡为「女仆能力测试」。
- Windows dev 进程 `tauri-chat-app.exe` PID 17248 继续运行。

主要临时文件：

- `results-diverse-v4f-0729.jsonl`
- `results-diverse-g35-0729.jsonl`
- `maid-conversation-before-diverse-v4f-0729.json`
- `maid-conversation-before-diverse-g35-0729.json`
- `inspect-diverse-test-state.js`
- `task-bank.mjs`
- `DIVERSE-0729-SUMMARY.md`
