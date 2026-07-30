# 女仆记忆机制批次 Shadow miss 逐条归因（2026-07-30）

## 冻结口径

- 数据源：`results-memory-system-v4f-a-0730.jsonl`、`results-memory-system-v4f-b-0730.jsonl`、`results-memory-system-g35-a-0730.jsonl`、`results-memory-system-g35-b-0730.jsonl`。
- 冻结时 retriever 为 `maid-capability-retriever-v3`，合计 `146 valid / 124 hit / 22 raw miss`（84.93%）。
- 本表在修改 catalog、concept matcher、worldbook lifecycle 或测试资源前完成。raw miss 是不可倒扣的历史事实；后续只能用原句回归与新样本证明闭环。
- 结论：22 条均已找到可复核原因，**0 条无法解释**。其中 16 条是请求对齐的候选召回缺口，1 条是实际状态触发的恢复型缺口，1 条是非必要 preflight，1 条是明确 no-tool 约束下的模型违规，3 条是确定性失败后的诊断游走。

## 逐条记录

| # | Task / phase | 实际选择 | 归因 | 证据与后续处置 |
|---:|---|---|---|---|
| 1 | `g35-a-001` / planner | `app.state.read` | 模型违反 no-tool 约束 | 原句明确“这一轮不要调用任何工具”。候选只给了轻量聊天／控制能力是合理行为；不应为该调用补召回。应由 no-tool policy/规划器门禁阻止工具执行，并从“应召回能力”口径区分。 |
| 2 | `g35-a-005` / react | `persona.create` | 请求对齐：复合 sibling create 缺口 | 原句同时要求条件创建 user 与两张 persona；`user.create`、读取、todo、state 已入候选，执行到 persona 子目标时 `persona.create` 被挤出。需用原句锁定剩余 sibling。 |
| 3 | `g35-a-009` / planner | `chat.send_message` | 请求对齐：否定过滤误吞正向意图 | 原句有“分别…后台写入用户消息”。`stripNegatedActions()` 把“分别”的“别”识别成禁止词，从该字删到下一标点，正好吞掉“写入用户消息”；直接 matcher 本应命中。需修为词界／句首约束并加原句回归。 |
| 4 | `g35-b-007` / react | `session.wallpaper.set` | 请求对齐：媒体复用 sibling 缺口 | 同一 attachmentId 先设联系人头像、再设聊天室壁纸；执行完头像后只保留前一媒体能力，壁纸 sibling 被挤出。需保留显式未完成媒体目标。 |
| 5 | `g35-b-008` / react | `persona.delete_many` | 请求对齐：三域 preview sibling 缺口 | 原句明确三资源域分别 `delete_many + preview:true`。否定过滤把“分别”误当“别”，擦掉后续正向片段；执行到 persona 时候选缺失。需与 #3 共用词界修复并锁定三域 sibling。 |
| 6 | `g35-b-008` / planner | `session.delete_many` | 请求对齐：三域 preview sibling 缺口 | 同 #5；候选已有 worldbook/persona 删除，显式 session preview 被挤出。 |
| 7 | `g35-b-010` / react | `app.resource.read` | 失败后诊断游走 | `worldbook.delete_many` 已以相同目标多次 `verification_failed`；随后 generic resource read 不是用户目标所需的新动作。目录不应为它扩候选；应在确定性、可重复的 lifecycle 失败后停止重复与泛化诊断。 |
| 8 | `g35-b-010` / react | `app.errors.read` | 失败后诊断游走 | 同 #7；读取全局 recent errors 不能修复指定世界书的 delete verification，属于模型扩大排查范围。 |
| 9 | `g35-b-010` / react | `app.visible_panel.read` | 失败后诊断游走 | 同 #7；用户要求后台实际删除，检查可见 UI 与失败根因无关。 |
| 10 | `g35-b-012` / react | `worldbook.list` | 请求对齐：只读审计被写能力污染 | 原句明确“只读审计”“不得补删”，但 matcher 又从“清理后”“已不存在”召回 persona/session/worldbook 删除，挤出显式 worldbook list。需给 read-only audit 加写能力抑制，不能把结果状态词当删除意图。 |
| 11 | `g35-b-012` / react | `app.resource.read` | 请求对齐：只读审计被写能力污染 | 同 #10；显式 user/persona 清单读取在后续步骤被删除候选挤出。 |
| 12 | `g35-b-012` / react | `session.list` | 请求对齐：只读审计被写能力污染 | 同 #10；显式会话清单读取被删除候选挤出。 |
| 13 | `v4f-a-005` / react | `persona.create` | 请求对齐：复合 sibling create 缺口 | 与 #2 同构，且跨模型复现，排除单一模型偶发。 |
| 14 | `v4f-a-009` / react | `session.create` | 实际状态恢复型缺口 | 前置建房任务未完成，`session.list` 发现三个目标房不存在，模型为完成消息任务先补建房。它不是原始请求显式动作，但由真实状态触发且调用有效；后续应让 observation/剩余义务补入有界 prerequisite，而不是把 create 永久塞进所有发消息候选。 |
| 15 | `v4f-a-009` / planner | `maid.todo` | 请求对齐：复杂工作流识别不足 | 任务包含三次发送、三次读回与最终状态核对；现有 complex detector 只按少量分隔词计 clause，未识别枚举式多目标，导致模型采用 todo 时 rank=0。需收紧为明确多目标工作流，不泛化所有聊天。 |
| 16 | `v4f-b-007` / react | `session.wallpaper.set` | 请求对齐：媒体复用 sibling 缺口 | 与 #4 同构，且跨模型复现。 |
| 17 | `v4f-b-008` / react | `persona.delete_many` | 请求对齐：三域 preview sibling 缺口 | 与 #5 同构，且跨模型复现。 |
| 18 | `v4f-b-008` / react | `session.delete_many` | 请求对齐：三域 preview sibling 缺口 | 与 #6 同构；模型还重复执行了一次同参 session preview，重复执行问题与本条候选 miss 分开记录。 |
| 19 | `v4f-b-008` / react_recovery | `session.list` | 模型附加的非必要 preflight | 用户给了精确 session 名并只要求 preview；工具自身能解析并回报 planned/protected/skipped，额外 list 不影响安全也不是必要前置。目录不应为了这个 detour 扩大候选；保留为模型效率样本。 |
| 20 | `v4f-b-012` / react | `worldbook.list` | 请求对齐：只读审计被写能力污染 | 与 #10 同构，跨模型复现。 |
| 21 | `v4f-b-012` / react | `app.resource.read`（模型标成 `user.create` feature） | 请求对齐 + feature/tool 归属歧义 | 实际动作是读取用户清单，但 `app.read_resource` 也挂在 `user.create` feature 下，模型选择了非 canonical feature；同时 canonical read 候选在该步被删除候选挤出。先修 read-only 候选污染；后续另测 tool→feature canonicalization，不把它误算成真实创建意图。 |
| 22 | `v4f-b-012` / react | `session.list` | 请求对齐：只读审计被写能力污染 | 与 #10 同构，跨模型复现。 |

## 分组结论与修复边界

| 分组 | 数量 | 是否改 retriever/catalog | 闭环方式 |
|---|---:|---|---|
| 请求对齐的真实召回缺口 | 16 | 是，做窄语义修复 | “分别”词界、只读审计写能力抑制、显式 sibling/复杂多目标原句测试 |
| 实际状态恢复型缺口 | 1 | 是，但只从 observation/剩余义务动态补 | 缺房后才出现 `session.create`，正常有房时不得污染候选 |
| 非必要 preflight | 1 | 否 | 记录效率问题；不扩大候选 |
| no-tool 模型违规 | 1 | 否，不补召回 | no-tool policy/执行门禁专项测试 |
| 失败后诊断游走 | 3 | 否，不补召回 | lifecycle 根因修好；另以失败停止/重复抑制约束流程 |

## 对晋升口径的影响

- 本轮 22 个 raw miss 全部保留在 v3 历史池，不能因归因或修复倒扣。
- “零个无法解释的 miss”在本批次已满足；“真实缺口均闭环”尚未满足，须完成窄修复、原句测试和新的 Shadow 命中样本后再评估。
- worldbook 孤儿盘点与清理必须在本文件冻结后进行；清理结果不得反写或重算这些历史快照。
