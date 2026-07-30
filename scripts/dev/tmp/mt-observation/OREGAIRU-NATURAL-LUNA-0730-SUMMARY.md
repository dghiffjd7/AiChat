# 《俺ガイル》自然用户复杂建卡观察（2026-07-30）

## 结论

本轮证明女仆能够从一条自然、复合的用户需求中完成大部分后台资源建设，但尚不能把它当作“从零到可直接开聊”的可靠一键流程。核心数据写入多数成功；群聊、跨 Run 续作、事实检索与最终验收仍有确定性缺口。

观察期间未修改产品代码，也未清理失败路径留下的测试资源。

## 测试输入与配置

- 6 条连续自然用户对话，不使用工具名或机械测试话术。
- 目标：用户身份、主角色卡、世界观／人物世界书、四个私聊、头像、壁纸、侍奉部群聊及最终打开主要界面。
- 女仆主配置：Pioneer / `gpt-5.6-luna`。
- 实际 5 个 AgentRun 中 4 个使用 Luna，1 个续作 Run 降级为 Deepseek `deepseek-v4-flash`。
- 独立记忆提取配置：Deepseek / `deepseek-v4-flash`，允许的主模型 fallback 本轮未触发。

## 结果矩阵

| 目标 | 结果 | 实际状态 |
| --- | --- | --- |
| 用户身份 | 部分成功 | 「桐谷澪」已建立、描述完整，但无头像且未激活 |
| 主角色卡 | 部分成功 | 「总武高·桐谷澪企划」已建立并有头像，但未激活、无世界书 association |
| 世界观世界书 | 成功但需校对 | 4 条，绑定到五个现有会话 |
| 重要人物世界书 | 成功但需校对 | 4 条，绑定到五个现有会话 |
| 四个主要人物私聊 | 成功 | 八幡、雪乃、结衣、平塚静均存在 |
| 四个联系人头像 | 成功 | 4/4 已持久化 |
| 四个私聊壁纸 | 成功但规格偏差 | 4/4 已持久化，均为 1024×1024 而非要求的横向 |
| 用户头像 | 失败 | `user.avatar.set` 功能白名单没有 `media.generate_image` |
| 侍奉部群聊 | 失败 | 只生成同名普通私聊，`isGroup=false`、0 成员 |
| 打开主要角色卡／群聊 | 失败 | UI 仍停在原会话、原角色卡和原用户 |
| 跨轮继续 | 不可靠 | todo 不跨 Run；重建计划产生重复空角色卡并误改不存在的世界书条目 |

## 遗留资源

- 有效角色卡：`总武高·桐谷澪企划`
- 重复空白角色卡：`总武高·桐谷澪`
- 有效用户：`桐谷澪`
- 普通私聊：`比企谷八幡`、`雪之下雪乃`、`由比滨结衣`、`平塚静`
- 错误类型的普通私聊：`侍奉部`
- 世界书：`总武高与侍奉部世界观`、`总武高重要人物资料`

不要在没有用户确认时自动删除重复角色卡或同名普通聊天室。

## 运行数字

- 自然对话：6
- AgentRun：5
- 模型调用：72
- 工具调用：59
- Prompt token：947,831
- Completion token：26,776
- 总 token：974,607
- Shadow：63 snapshot / 56 valid / 49 hit / 7 raw miss（87.50%）

四个头像需要 8 个动作，四张壁纸也需要 8 个动作；两轮都在第 8 步完成所有写入，却因没有第 9 步留给验证／回复而被标记为 `interrupted/max_steps_reached`。

## Shadow miss 归因

7 条 raw miss 均可解释：

1. `maid.todo.write`：长复合任务需要规划，但 planner Top-8 未保留 todo。
2. `web.research`（`web.search` capability）：用户明确允许查资料，实际选择有效但候选缺失。
3. `user.create`：明确创建用户身份，实际成功但能力未进当步 Top-8。
4. `worldbook.generate_entries`（`worldbook.create` capability）：创建第二本世界书时的有效 sibling 工具未进 Top-8。
5. `session.create`：批量建私聊的有效后续动作未进 Top-8。
6. `session.list`：建房后的实际存在性验证未进 Top-8。
7. `worldbook.update_entries`：跨 Run 恢复时模型找错世界书并选择错误操作，最终 `no_matching_entries`；这条不应通过扩大候选修饰命中率。

因此为 6 个可复现的候选覆盖缺口 + 1 个模型／恢复流程错误，0 条未归因。

## 内容质量观察

- 两次 APP 内 web research 都返回与作品无关的结果，世界书实际主要依赖模型先验。
- 世界书没有清晰区分“原作事实”“用户指定设定”“模型创作扩写”，多处生活习惯、事件、台词与外貌细节缺少来源。
- 同一用户角色在卡片中为深棕中长发／灰绿眼，生图提示却改成黑蓝发／琥珀眼；跨工具没有共享冻结的视觉规格。
- 用户要求“不要硬编原作资料”没有形成可验证的来源约束或最终事实校对关卡。

## 记忆提取验证

- 新 extraction batch：1
- 状态：completed，attempts=1
- 模型：Deepseek `deepseek-v4-flash`
- 使用量：917 prompt + 49 completion = 966 token
- 提取：0 条 semantic memory
- fallback：未使用

这批输入是一次性资源操作，而非稳定偏好／决定，0 条结果合理；独立提取模型设置已在真实任务结束链中生效。

## 建议修复顺序

1. 增加真正的群聊创建／成员配置能力，并为“打开建群入口”提供明确 UI 导航工具。
2. 让跨 Run 续作持有持久的任务快照与成功账本；执行前按稳定 ID 复验，防重复创建。
3. 给动作预算预留验证和最终回复，不能让“刚好完成 N 个动作”被记成失败。
4. 补齐 `user.avatar.set → media.generate_image` 的目录白名单与参数提示。
5. 研究结果增加来源有效性检查，并将 canon / 用户设定 / 创作扩写分层写入。
6. 冻结并复用视觉规格；壁纸生成或准备链应验证横竖比。
7. 用户明确要求查看时，完成后激活主要用户／角色卡并打开目标界面；若能力不存在，应在建错同名普通会话前停止。

## 证据文件

- `oregairu-natural-before-20260730.json`
- `oregairu-natural-audit-20260730.json`
- `results-oregairu-natural-luna-0730.jsonl`
- `results-oregairu-natural-luna-followup-0730.jsonl`
- `results-oregairu-natural-luna-images-0730.jsonl`
- `results-oregairu-natural-luna-contact-avatars-0730.jsonl`
- `results-oregairu-natural-luna-wallpapers-0730.jsonl`
- `results-oregairu-natural-luna-group-entry-0730.jsonl`
