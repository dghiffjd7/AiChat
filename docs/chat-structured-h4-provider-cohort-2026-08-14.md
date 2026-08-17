# 聊天结构化通道 H.4 Provider 受控灰测报告

- 日期：2026-08-14
- 环境：Windows 11、Tauri dev WebView、CDP 9222
- 范围：OpenAI、Anthropic、Gemini 官渠的女仆 FC、APP 手机批次 FC、可丢弃流式预览与临时真实会话发送链
- 数据边界：受控题集不执行业务工具、不写聊天资料，也不保留模型正文或工具参数；真实会话烟测只写唯一临时联系人/会话并在结束后删除。

## 当前结论

- DeepSeek `deepseek-v4-flash`：补充 4/4 临时真实私聊通过，其中最后 1 次在默认放量代码生效后执行；唯一工具调用、可丢弃预览、终态校验、canonical raw 与原子提交均正常，未触发文本 fallback。
- OpenAI `gpt-5.6-sol`：8/8 零写入受控题通过；累计 4/4 临时真实私聊通过，验收项与 DeepSeek 相同。
- Anthropic `claude-opus-4-8`：8/8 零写入受控题通过；累计 4/4 临时真实私聊通过，验收项与 DeepSeek 相同。
- Gemini `gemini-3.6-flash`：真实测试定位并修正了 `const` 与 `oneOf` 的 Provider schema 缺口；确定性回归通过，但修复后的唯一最小 batch 复验仍以 `provider_request_failed` 结束。按发布决定延期，不再追加请求。
- Custom/OpenAI-compatible 端点继续 fail-closed；不以 `gg公益站` 绕过官渠合同与端点核验。
- 本版发布范围已完成：聊天 FC 默认只对核验过的 DeepSeek、OpenAI、Anthropic 官渠启用；Gemini 与 Custom/代理端点继续使用文本 primary。通用“传统模型输出协议（兼容模式）”仍可让已放量官渠整体切回旧路径。

## 零写入受控题

每家上限 8 次：女仆 4 题（只读、嵌套写入规划、危险删除规划、资料不足澄清）与手机协议 4 题（私聊特殊消息、群聊多说话人、动态加侧聊、有序副作用）。全过程 `persistentWrites=0`、`businessToolsExecuted=0`。

| Provider | 总通过 | 女仆 | 手机批次 | 流式预览 | 平均 / P95 | 首预览 P50 / P95 | Usage |
|---|---:|---:|---:|---:|---:|---:|---:|
| OpenAI | 8/8 | 4/4 | 4/4 | 4/4 | 2,117 / 3,186 ms | 1,483 / 3,142 ms | 4,893 input + 478 output = 5,371 |
| Anthropic | 8/8 | 4/4 | 4/4 | 4/4 | 3,116 / 5,336 ms | 2,916 / 5,320 ms | 12,391 input + 938 output；Provider 未给可合并 total |
| Gemini | 未形成修复后终态样本 | 先前 4/4 | 先前 phone 失败用于定位 schema | 待复验 | — | — | Provider 未给可用 usage |

这只是固定小样本全部通过，不代表长期成功率为 100%。OpenAI 上表受控队列的 5,371 token 按当日官方单价约 0.039 美元；受限诊断与临时会话请求未纳入该 usage 合计，也没有扩大到原计划中高成本的大题集。

## 临时真实会话

| Provider | 请求与提交 | 预览 | 时延 | 清理 |
|---|---|---|---:|---|
| DeepSeek | 4 次 FC、0 fallback；每次用户与助手消息各提交一次 | 每次出现后完整移除 | 首预览中位 4,508 ms（2,994–5,160）；总计中位 5,060 ms（3,498–5,930） | 每次会话、联系人、记忆行 0 残留；设置与原会话恢复 |
| OpenAI | 累计 4 次 FC、0 fallback；每次用户与助手消息各提交一次 | 每次出现后完整移除 | 首预览中位 2,760 ms（2,570–3,450）；总计中位 3,052 ms（2,964–3,842） | 每次会话、联系人、记忆行 0 残留；设置与原会话恢复 |
| Anthropic | 累计 4 次 FC、0 fallback；每次用户与助手消息各提交一次 | 每次出现后完整移除 | 首预览中位 3,845 ms（3,349–4,006）；总计中位 4,329 ms（3,783–4,482） | 每次会话、联系人、记忆行 0 残留；设置与原会话恢复 |

本轮新增三家官渠真实会话合计 10/10 通过。这是固定短句的小样本，只支持本版受限放量，不代表长期成功率为 100%；后续继续按 Provider 观察 fallback、取消残留与真实语义体验。

第一次 OpenAI 临时会话灰测在提交前以 `item.artist.unexpected` 安全拒绝结构化终态；随后触发的旧协议 fallback 也没有交付助手消息，因此该轮不计通过，但没有半成品提交或资料残留。根因是旧私聊 schema 将 `artist` 暴露给所有消息类型，模型为 `text` 生成了非空 `artist`。修复后 schema 改为按 `type` 的互斥分支，`artist` 只存在于且必填于 `music` 分支；同题探针与完整会话重跑均通过。真实 fallback 的长期交付率仍纳入后续观察期。

## 本轮修正

- OpenAI 官方 Responses 改为真实 SSE 流式：转发 `response.function_call_arguments.*` 工具事件、文字与 reasoning delta、usage 与来源；Tauri 原生流解析覆盖任意 chunk 边界、请求 ID 清洗和中止。
- Gemini schema 编译将 JSON Schema `const` 转为单值 `enum`，并将 Gemini 不支持的 `oneOf` 转为官方 Schema 支持的 `anyOf`。
- 私聊消息 schema 按 `type` 建立互斥分支，避免文字、语音等消息被模型填入音乐专属字段；本地严格 validator 未放宽。
- H.4 题集与真实会话脚本只输出结构、计数、时延和错误码；修正统计中 `null` 被误算为 0 的问题。

## 回归

- `provider-fc-transport-tests.mjs`
- `phone-reply-ir-tests.mjs`
- `private-chat-provider-fc-tests.mjs`
- `phone-batch-provider-fc-tests.mjs`
- Windows PowerShell `npm run test:all`：通过，exit 0。

## 后续门槛

1. DeepSeek、OpenAI、Anthropic 放量后继续按 Provider 统计 fallback、取消残留、P50/P95 与真实语义体验；出现重复副作用或持久化异常时立即关闭聊天 FC 主开关。
2. Gemini 保持 `provider_rollout_deferred`，服务稳定后可单独补 1 次 batch 与 1 次临时私聊，不阻塞当前发布。
3. Custom、代理和未核验端点保持文本 primary；不得只凭模型名称绕过端点核验。

## 官方合同参考

- [OpenAI Function Calling](https://developers.openai.com/api/docs/guides/function-calling)
- [OpenAI GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
- [Gemini GenerateContent Function Calling](https://ai.google.dev/gemini-api/docs/generate-content/function-calling)
- [Gemini Schema](https://ai.google.dev/api/caching?hl=zh-CN#Schema)
