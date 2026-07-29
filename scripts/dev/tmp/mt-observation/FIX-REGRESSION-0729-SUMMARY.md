# 女仆复杂测试根因修复与回归总结

时间：2026-07-29 12:19 CST

## 结论

11:42 复杂双模型观察确认的四类独立问题已按根因修复：

1. 并列否定中的「打开页面」被误判为 reveal。
2. `session.create`、user/persona sibling create、顺序相关 `worldbook.read` 三类 Retriever 真漏召回。
3. 三角色/三世界书读取在早期完整 observation 滚出窗口后重复读取。
4. 已成功并自动验证的幂等 `session.create` 被弱模型重复执行。

专项测试、完整 Agent/release/fast 门禁均通过；V4F 与 Pioneer Gemini 3.5 Flash 的关联审计同题均无重复地完成。当前仍保持 Shadow，不进入 Canary。

## 修复边界

### 呈现语义

- 根因是 `classifyMaidPresentationIntent()` 的 background 否定正则只覆盖连续的「不要打开」。
- 新规则只在同一分句内传播否定范围，并在标点或转折处停止。
- 原句「不要逐房重复绑定或打开页面」判为 background。
- 「不要重复绑定；完成后打开页面给我看」仍判为 reveal。
- 「不要忘了在完成后打开页面给我看」否定的是“忘记”，仍判为 reveal。
- background 下执行层继续把 `session.create.open` 固定为 `false`。

### Retriever v3

只补 concept 映射：

- session 名词支持英文 `session` / `sessions` 及显式 `session.create(names[])`。
- 同一创建目标可同时保留 `user.create` 与 `persona.create`。
- 「读取资料后区分人物、地点与事件」可召回 `worldbook.read`，即使模型先执行 `session.list`。

没有改全局评分、候选上限或 Retriever 算法版本，因此 v3 观察池不重置；旧 raw miss 也不删除。

### 多目标成功读取账本

原 ReAct 只保留最近 4 份完整 observation；更早步骤只剩不含目标和事实的工具摘要。现在额外提供有界账本：

- 保留成功读取的精确工具参数。
- persona associations 保留世界书/预设/正则引用。
- worldbook 只保留 `entryCount` 与前 3 个标题。
- 不复制世界书正文、头像、原卡或第 4 个及以后标题。
- 同参读取已完成、事实足够且没有相关中间写入时，提示模型推进下一目标或直接收尾。

### 幂等 `session.create` 护栏

仅在以下证据同时成立时复用既有结果：

- 同一 Run 已有相同目标集合的成功创建或复用结果。
- 后续自动 `session.list` 已确认所有联系人存在。

命中时不再执行第二次真实 create，也不追加第二次 verification；本地跳过步骤不计入工具调用数。目标不同、缺少验证或结果失败时不复用。

## 真实模型回归

### 三角色关联审计

同一原始任务分别在独立空白线程执行：

| 主模型 | 状态 | 实际工具链 | Shadow | 时长 | provider total tokens | model/tool calls |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| Deepseek `deepseek-v4-flash` | succeeded | 3× associations + 3× worldbook.read | 6/6 | 42.424s | 71,466 | 7 / 6 |
| `pioneer/custom` + `gemini-3.5-flash` | succeeded | 3× associations + 3× worldbook.read | 6/6 | 32.864s | 76,027 | 7 / 6 |

两者均无非法参数、无重复读取，最终正确汇总三份角色关联与世界书摘要。未调用 5.6-sol 或 Opus 4.6。

### 幂等路由任务

第一次 V4F 回归：

- 呈现修复生效：所有 create 均为 `open:false`，当前聊天室未变化。
- Retriever 修复生效：11 个有效选择 11/11 命中。
- 新暴露重复 create→自动 list 循环，达到最大步数；原始失败记录保留。

加入幂等护栏后的 V4F r2：

- 52.7s 内 succeeded。
- 实际步骤：`session.list → worldbook.list → worldbook.bind_sessions → session.create → session.list`。
- create 仅一次且 `open:false`。
- 两个绑定目标均为 `already_bound` 且 verified。
- Shadow 4/4；usage 为 53,355 tokens / 5 model calls / 5 tool calls。

r2 中模型改为先绑定后建房，没有动态触发重复 guard；guard 命中路径由专项红绿测试直接锁定：真实 create 一次、自动验证一次、后续 bind 正常执行。

## Shadow 当前值

截至 12:19：

| 模型 cohort | valid | hit | raw miss | runs / covered |
| --- | ---: | ---: | ---: | ---: |
| Deepseek V4F | 170 | 161 | 9 | 79 / 71 |
| Pioneer Gemini 3.5 Flash | 181 | 175 | 6 | 71 / 66 |
| Pioneer GPT-5.6 Sol | 52 | 49 | 3 | 19 / 16 |
| 合计 | **403** | **385** | **18** | **169 / 153** |

相对 11:42 为 +27 valid / +27 hit，距 500 还差 97。18 个 raw miss 是历史审计事实，不因修复而倒扣；达到 500 也不代表自动达标，还要检查修复后干净样本窗、各模型 cohort、既有 miss 闭环与最早 2026-08-11 的观察时间。

## 验证

Windows PowerShell：

- `node scripts/tests/maid-assistant-agent-tests.mjs`
- `node scripts/tests/maid-capability-routing-tests.mjs`
- `node scripts/tests/maid-model-planner-tests.mjs`
- `npm run test:agent`
- `npm run test:release`
- `npm run check:fast`

以上均通过；`git diff --check` 通过。工程没有 `typecheck` script。

## 状态恢复与原始记录

- 女仆主模型：Deepseek / `deepseek-v4-flash`
- 原线程：`maid_default`，120 turns / 240 memory rows
- 当前页面：chat / 「格式修复测试」
- 11:42 两组复杂测试资源只读复核保持不变
- dev 继续运行

原始记录：

- `results-regression-read-ledger-v4f-0729.jsonl`
- `results-regression-read-ledger-g35-0729.jsonl`
- `results-regression-routing-v4f-0729.jsonl`
- `results-regression-routing-v4f-0729-r2.jsonl`

这些文件与线程快照位于临时测试目录，保留供追溯，不建议作为产品源码提交。
