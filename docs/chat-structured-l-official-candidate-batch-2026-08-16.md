# 官渠候选模型批量放量（2026-08-16）

## 结论

- 使用 `scripts/dev/provider-l-official-candidate-cohort.js`（每模型 10 轮 × 私聊/群聊/动态评论 3 surface = 30 次零写入真实调用，任一轮失败即止损）对四个官渠共 22 个候选模型批测。
- **17 个模型达标（严格题意 ≥95%）并写入 bundled 目录（revision 4 → 5，条目 10 → 27）**；5 个未达标，保持 probation/JSON/文本既有路由。
- 批测中定位并修复一个真实参数缺陷：Claude 5 系（opus-5/sonnet-5）官方已弃用 `temperature`，带参即 400。修复为将两型号加入 `isAnthropicAlwaysAdaptiveThinkingModel`（与 fable-5 同名单，采样受限不发 temperature/top_p/top_k），一次真实探针确认修复后重跑通过。
- 所有请求零业务写入、不保留正文；`npm run test:all` 全量通过，运行中 APP 重载后新种子实时命中、未达标模型保持不匹配。

## 达标入册（17）

| 渠道 | 模型 | 严格通过 | 平均 / P95 时延 |
|---|---|---:|---:|
| DeepSeek 官方 | deepseek-v4-pro | 30/30 | 1,332 / 1,504 ms |
| OpenAI 官方 | gpt-5.6-terra | 30/30 | 1,724 / 2,477 ms |
| OpenAI 官方 | gpt-5.6-luna | 30/30 | 1,936 / 3,136 ms |
| OpenAI 官方 | gpt-5.4 | 30/30 | 1,317 / 1,688 ms |
| OpenAI 官方 | gpt-5.4-mini | 30/30 | 1,072 / 1,437 ms |
| OpenAI 官方 | gpt-5.4-nano | 30/30 | 1,106 / 1,809 ms |
| Anthropic 官方 | claude-opus-5 | 30/30 | 2,589 / 3,547 ms |
| Anthropic 官方 | claude-sonnet-5 | 30/31（96.8%） | 1,961 / 2,189 ms |
| Anthropic 官方 | claude-fable-5 | 30/30 | 2,536 / 2,843 ms |
| Anthropic 官方 | claude-opus-4-7 | 30/30 | 2,263 / 2,760 ms |
| Anthropic 官方 | claude-sonnet-4-6 | 30/30 | 2,498 / 3,380 ms |
| Anthropic 官方 | claude-haiku-4-5-20251001 | 30/30 | 1,334 / 1,501 ms |
| MakerSuite | gemini-3.6-flash | 30/30 | 2,809 / 4,351 ms |
| MakerSuite | gemini-3.5-flash | 30/30 | 2,759 / 3,600 ms |
| MakerSuite | gemini-3.1-flash-lite | 30/30 | 976 / 1,189 ms |
| MakerSuite | gemini-3-flash-preview | 31/32（96.9%） | ~2,000 / 3,013 ms |
| MakerSuite | gemini-2.5-flash | 30/30 | 2,154 / 2,759 ms |

## 未达标（5，保持既有下层路由）

| 模型 | 结果 | 失败模式 |
|---|---|---|
| gpt-5.5 | 27/29（93.1%） | 两次 `finishReason: incomplete` 输出截断 → 参数 JSON 不完整；均为确定性合同失败 |
| gemini-3.5-flash-lite | 5/7（71%） | 群聊 `invalid_phone_reply_ir` 复发，模型行为不稳定 |
| gemini-3.1-pro-preview | 3/4（75%） | Gemini 服务端 `MALFORMED_FUNCTION_CALL`，且平均时延 7.7s |
| gemini-2.5-pro | 0/1 | generateContent 端点 HTTP 404（模型列表可见但不可调用） |
| gemini-2.5-flash-lite | 0/1 | 同上 HTTP 404 |

## 证据边界

- 本批证据为 `provider-l-official-candidate-cohort-v1` 零写入 cohort；**未逐模型重复「临时真实会话」**——四个 transport 家族的真实会话/事务/流式验收已在 H.4、J.7、G.5 按家族完成，事务层与模型无关。目录 evidence 字段如实省略 `realSessionPassed`，未伪造。
- claude-sonnet-5 与 gemini-3-flash-preview 各含一次真实合同失败（IR 领域校验不过），已按 `strictSurfaceSamplesAttempted` 如实入册；生产中该类失败会触发一次提交前文本 fallback，属既有安全边界内。
- 消耗概况：DeepSeek ~22K token；OpenAI 六模型合计 ~83K；Anthropic 六模型合计 ~212K prompt+completion；MakerSuite 七次有效 cohort 合计 ~86K。均为短夹具请求。

## 代码变更

- `src/scripts/agent/chat-fc-capability-catalog.js`：新增 17 条 bundled 条目，revision 5。
- `src/scripts/api/model-capabilities.js`：claude-opus-5 / claude-sonnet-5 加入 always-adaptive 名单（真实 400 证据）。
- `scripts/tests/chat-fc-capability-catalog-tests.mjs`：断言更新至 revision 5 / 27 条目并覆盖全部新组合。
- 新增 `scripts/dev/provider-l-official-candidate-cohort.js`（K.7 模式泛化，四官渠模型参数化）。
