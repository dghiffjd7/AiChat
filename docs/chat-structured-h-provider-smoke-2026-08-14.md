# 聊天结构化通道 H.1–H.3 多 Provider 小样本报告

- 日期：2026-08-14
- 环境：Windows 11、Tauri dev WebView、CDP 9222
- 目标：以最少真实请求确认各官渠的原生函数调用与工具结果续轮合同。探针不执行业务工具、不写聊天资料，也不保存回复正文或工具参数。

## 结论

- H.3 已完成：OpenAI Responses、Anthropic `tool_result`、Gemini `functionResponse` 均能携带各自要求的完整原生历史完成一次工具结果续轮。
- 最终真实验证为 **3/3 Provider 场景通过**；每个场景包含一次工具调用请求与一次工具结果续接，共 6 次成功的小请求。这表示本次覆盖的三个固定场景全部成功，不代表长期模型可靠率为 100%。定位过程中另有受限重试，不计入该成功率，也没有运行大样本题集。
- 三个场景的 `persistentWrites` 均为 0；探针结果只返回形状、计数、耗时与 usage 元数据，没有保留正文和工具参数。
- 阶段 H 整体仍未完成：各 Provider 的阶段 E/F 受控题集、真实会话灰度与正式默认决策属于 H.4。

## H.1–H.2 首轮能力探针

| 配置 / 通道 | 结果 | 观察 |
|---|---:|---|
| `oai` / OpenAI 官渠 | 通过 | 早期 Chat Completions 探针确认 `gpt-5.6-sol` 的采样/推理参数必须按模型能力收敛；正式官渠终端 FC 现已迁到 Responses。 |
| `Claude` / Anthropic 官渠 | 通过 | Messages 返回唯一 `tool_use`，无额外正文。 |
| 默认 Gemini / Google 官渠 | 通过 | 原生 `functionCall` 返回唯一工具调用、无额外正文。 |
| `gg公益站` / Custom OpenAI-compatible | 未通过 FC | 两次极小探针请求本身成功，但均返回 `finish_reason:stop`、空正文且没有 `tool_calls/function_call`，因此继续 fail-closed 回退文本协议。该结果只代表该端点与当时模型。 |

## H.3 原生续轮实测

| Provider / 模型 | 首轮原生合同 | 工具结果续轮 | 结果与证据 | 总耗时 |
|---|---|---|---|---:|
| OpenAI / `gpt-5.6-sol` | Responses `function_call`；初始 usage 179 input + 19 output | 重放完整 `response.output`，追加 `function_call_output`；`store:false` | 成功，最终文本精确为 `OK`，2 个历史 turn | 3,453 ms |
| Anthropic / `claude-opus-4-8` | Messages `tool_use`；初始 usage 598 input + 31 output | 重放完整 assistant content，下一条 user content 紧接 `tool_result` | 成功，最终文本精确为 `OK`，2 个历史 turn | 4,868 ms |
| Gemini / `gemini-3.6-flash` | 原生 `functionCall`，首轮含 thought signature | 原样重放 model parts 与 thought signature，追加 `functionResponse` | 成功，最终文本精确为 `OK`；Provider 未返回可用 usage | 9,558 ms |

实测同时确认并修正了三个确定根因：内部 request id 含 `:` 不符合原生请求约束；Claude 新模型不再接受旧采样参数；Anthropic 流式普通 text/thinking block 的 `content_block_stop` 会被误识别成空工具调用。修复后才执行上表最终验证，之后不再消耗付费额度。

## 已实现范围

- OpenAI 官方端点的终端 FC 使用 Responses：扁平 function tools、串行工具调用、`store:false`，续轮保留 reasoning/function output 后再提交 `function_call_output`。
- Anthropic 保存并重放完整 assistant `tool_use`/thinking/text content；`tool_result` 与对应 assistant turn 相邻，历史和原始工具 schema 一并送回 Provider。
- Gemini 保存并重放精确 model parts、thought signature 与历史，再提交原生 `functionResponse`。
- 原生 continuation context 使用运行时私有载体，不进入 pending 持久资料或诊断 JSON；权限暂停/恢复仍可继续原生续轮。
- 混合工具调用中只要有一项未获授权，整次原生 turn 均 fail-closed，避免把残缺结果送回模型。
- 女仆、APP 私聊与 batch 聊天共用同一传输规划器；只有核验过的官方 host 可进入对应原生通道，OpenRouter、Custom、代理和畸形 Base URL 不会借 Provider 名称误入。

## 本地回归

| 测试 | 结果 |
|---|---:|
| Responses 请求/解析、三家 continuation fixture、历史与签名保留 | 通过 |
| 权限暂停/恢复、私有 continuation context、混合授权 fail-closed | 通过 |
| 女仆、私聊与 batch 请求规划及 fallback | 通过 |
| `npm run test:agent` | 通过 |
| `npm run test:chat-generation` | 通过 |
| `npm run test:chat-context` | 通过 |
| `npm run test:cancel` | 通过 |
| 最终 Windows PowerShell `npm run test:all` | 通过（exit 0） |

## H.4 进行中

- OpenAI 与 Anthropic 已完成各 8 项零写入受控题及各 1 次临时真实会话，最终均通过；OpenAI Responses 的真实 SSE 工具参数预览也已接通。
- Gemini 实测定位并修正 `const`/`oneOf` schema 缺口；修复后官渠复验受 HTTP 429 配额限制，仍待补测。
- 三家均仍缺独立观察期与正式默认决策，内部开关继续保持默认关闭。
- OpenRouter/Custom 的能力仍按端点实测，不承诺统一支持。

详细数据见 [H.4 Provider 受控灰测报告](./chat-structured-h4-provider-cohort-2026-08-14.md)。

## 官方合同参考

- [OpenAI Function Calling](https://developers.openai.com/api/docs/guides/function-calling)
- [OpenAI Conversation State](https://developers.openai.com/api/docs/guides/conversation-state)
- [OpenAI Reasoning](https://developers.openai.com/api/docs/guides/reasoning)
- [Anthropic Handle tool calls](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls)
- [Gemini Function Calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Gemini Thinking](https://ai.google.dev/gemini-api/docs/thinking)
