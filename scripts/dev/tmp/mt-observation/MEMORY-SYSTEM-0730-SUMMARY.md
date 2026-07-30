# 女仆记忆机制系统观察（2026-07-30）

## 范围与隔离

- 模型 A：Deepseek `deepseek-v4-flash`；模型 B：Pioneer `gemini-3.5-flash`。
- 每个模型 27 项，合计 54 项；覆盖偏好记忆、跨窗回忆、资源读写、批量建房／绑定／删除、格式画像、正则只读、生图复用、部分失败恢复与清理审计。
- 两轮各使用独立 maid conversation thread 与 semantic scope。结束后已恢复正式 `maid_default` 对话、语义 scope、模型绑定与原 UI 会话。
- 本轮先观察，不依据失败项修改产品代码。原始逐条结果为同目录四个 `results-memory-system-*.jsonl`。

## 数字汇总

| 模型 | 任务状态 | AgentRun | 模型调用 | 工具调用 | Prompt token | Completion token | 总 token | Shadow valid / hit |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Deepseek V4 Flash | 21 succeeded / 5 interrupted / 1 failed | 20 | 84 | 70 | 1,133,827 | 85,512 | 1,219,339 | 62 / 52（83.87%） |
| Pioneer Gemini 3.5 Flash | 21 succeeded / 4 interrupted / 2 responded | 24 | 104 | 92 | 1,418,090 | 69,455 | 1,487,545 | 84 / 72（85.71%） |
| 合计 | 54 项 | 44 | 188 | 162 | 2,551,917 | 154,967 | 2,706,884 | 146 / 124（84.93%） |

`succeeded` 只是运行时顶层状态，不等于业务断言通过；以下结论以工具链与最终资源状态复核为准。

## Shadow miss 冻结归因

- `146 valid / 124 hit` 中的 22 个 raw miss 已在任何目录、retriever 与 worldbook 资源变更前逐条复核，**0 条无法解释**；完整证据表见同目录 `SHADOW-MISS-ATTRIBUTION-0730.md`。
- 分组为：16 条请求对齐的真实召回缺口、1 条真实状态触发的恢复型缺口、1 条非必要 preflight、1 条 no-tool 约束下的模型违规、3 条确定性删除失败后的诊断游走。
- 最明确的共同根因是 `stripNegatedActions()` 把“分别”里的“别”当禁止词，从该字一直删除到下一标点，吞掉消息写入和三域 preview 的正向意图；两次只读清理审计则被“清理后／已不存在”误召回的删除能力污染 Top-K，共产生 6 条跨模型 read/list miss。
- 22 条历史 raw miss 不倒扣。后续只对 17 条有效请求／状态对齐缺口做窄语义闭环；preflight、no-tool 违规和失败后诊断不会通过扩大目录来“修数字”。

## 记忆机制观察

### Deepseek V4 Flash

- 27 turn 后：14 已压缩、13 active、5 protected；产生 12 个 legacy row／12 个 extraction batch，全部 completed。
- 首批正确提取两条 explicit 偏好：`response.style` 与 `presentation.default`；最终回忆由正式语义记忆命中，legacy fallback 已关闭。
- 重复表达未复制同 key，但另生成近义的 `workflow.confirmation`，暴露跨 key 语义重叠。
- 最终上下文 5,669 粗估 token：history 3,970、working 1,485、semantic 204、legacy 0。

### Pioneer Gemini 3.5 Flash

- 27 turn 后：16 已压缩、11 active、4 protected；产生 5 个 legacy row／5 个 extraction batch。
- 自然语言语义提取持续返回 invalid JSON：两个批次仍 pending，attempts 分别为 5 与 2；没有生成 preference/decision。
- 两次偏好回忆文字虽然正确，来源是 `semantic_sparse` 下的 legacy fallback，不是语义表提取成功。
- 4 条语义记录均为确定性 `resource_state`；其中 `worldbook.delete_entries` 被错误投影为整本世界书 stale。
- 最终上下文 8,098 粗估 token：history 3,877、working 1,280、semantic 75、legacy 2,847。

## 已定位问题

1. **P0：提取失败会重复消耗。** pending 批次在每次新压缩时全部重试，没有退避、下次可重试时间或自动上限。
2. **P0：保护轮次导致碎片化压缩。** `continuable`／未验证 observation 写入 `compactionProtection` 后没有解除生命周期；超过阈值时可能每轮只压缩少量旧 turn，并频繁产生 legacy row 与模型提取。
3. **P0：世界书删除存在双存储不一致。** `saveWorldInfo()` 一边通过 `worldStore` 写内存缓存＋整库 Tauri KV，一边通过 `save_world_info` 写原生 `worldinfo/<id>.json`；`deleteWorldInfo()` 只清前一边，没有对应原生文件删除命令。删除后列表基于前端索引看不见，但 `getWorldInfo()` 会从原生 JSON 兜底读回，故 `worldbook.delete_many` 正确返回 `verification_failed`。而 `get_world_info` 在文件不存在时还返回 truthy 的 `{}`，修复时必须一并规范“真正不存在”的判定。G35 测试书目前正处于“列表不可见、精确读取仍存在”的孤儿状态。
4. **P1：子资源删除误标父资源 stale。** 提取器仅按工具名中的 `.delete` 判断删除；`worldbook.delete_entries` 因而错误把整本书标 stale。
5. **P2：跨 key 近义偏好重复。** `presentation.default` 与 `workflow.confirmation` 可吸收同一句“默认后台”。
6. **提取模型不可独立选择。** `maid_memory_extract` 当前固定沿用女仆主档；无自动便宜档、无独立模型设置，extractor 也不使用 fallback client。

## 任务流程观察

- G35 在建房、身份创建、世界书批量更新、缺失房恢复、生图复用等长链上整体完成度较高，但调用数和总 token 比 V4F 分别高 23.8% 与 22.0%。
- 两模型都有“顶层 succeeded、业务未完成”的假成功：V4F 有世界书更新零工具、格式画像只处理一项、清理审计误报；G35 有重复删除与清理审计中断。
- 删除确认脚本只对三个精确任务 ID 点击“允许一次＋确认删除”，未启用始终允许，也未对其他弹窗做坐标盲点。
- 正则运行态仍为 15 个集合；正式当前用户、角色卡、RP 会话与女仆正式记忆均未改变。
- dev 日志显示整库 `worldinfo_store` 的 localStorage 镜像因总体配额不足被跳过；内存缓存与 Tauri KV 写入仍继续。它不是本次孤儿的直接根因，但意味着世界书持久化已经不能依赖 localStorage 作为第二份恢复来源。
- 测试聊天室与测试角色卡已清理；两个测试用户因当前无正式批量删除工具而保留 inactive。V4F 测试世界书因模型未实际调用删除仍正常存在；G35 测试世界书是上述双存储孤儿，待实现层修复后再清理。

## 建议顺序

1. 保持 `get_world_info` 既有缺失语义，新增独立 native delete／exists 契约，修复世界书 delete lifecycle，并补“删除后 list/read/exists 均不存在”的专项测试；先只读盘点 `worldinfo/` 中索引之外文件，再以显式孤儿清理路径处理。
2. 给记忆提取加有界重试／退避，并给 `compactionProtection` 增加解除生命周期。
3. 修正 `delete_entries` 的资源状态投影，再处理跨 key 近义重复。
4. 增加可选的记忆提取模型设置；默认继续跟随女仆主模型，不自动降级。
5. 然后实施记忆管理 UI 归档／恢复、`maid.memory.list`、`maid.memory.archive`。
