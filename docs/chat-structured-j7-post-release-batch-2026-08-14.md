# 聊天 FC 已放量组合批量复验（2026-08-14）

## 结论

- 本轮排除 Ollama，只测试当前已放量的 6 个精确 provider / endpoint / model 组合。
- 标准化零写入 cohort 共 60 轮：FC 本地合同接受 `60/60`，严格题意正确 `60/60`，若进入生产链会触发的文本 fallback 为 `0/60`。
- 三个 surface 各 20 轮：私聊 `20/20`、群聊 `20/20`、动态评论 `20/20`。
- DeepSeek `deepseek-v4-flash` 单独 30 轮：私聊、群聊、动态各 `10/10`；用户请求 thinking 关 `15/15`、开 `15/15`。thinking 开启的样本均记录既定覆盖策略并以 Responses 强制终态成功，未再复现旧 Chat Completions 的 `no_tool_call → fallback`。
- 另走生产发送事务做 3 次 DeepSeek 临时真实私聊：`3/3` 为 `requestedMode=provider_fc`、`effectiveMode=provider_fc`，每次恰好 1 个 provider 请求、1 个终态工具、0 fallback；canonical raw、遥测、单次提交与清理均通过。

这是观测样本，不代表未来绝不 fallback。`60/60` 的 95% Wilson 区间下界约为 94.0%；DeepSeek `30/30` 的下界约为 88.6%。因此可以确认本轮没有复现既有故障，但仍应保留提交前安全 fallback 与诊断。

## 标准化 cohort

| 组合 | 样本 | FC 接受 | 严格题意 | fallback | 平均 / P95 |
|---|---:|---:|---:|---:|---:|
| DeepSeek `deepseek-v4-flash` | 30 | 30/30 | 30/30 | 0/30 | 1,266 / 1,677 ms |
| OpenAI `gpt-5.6-sol` | 6 | 6/6 | 6/6 | 0/6 | 5,769 / 22,632 ms |
| Anthropic `claude-opus-4-8` | 6 | 6/6 | 6/6 | 0/6 | 2,500 / 2,817 ms |
| OpenCode `glm-5.3` | 6 | 6/6 | 6/6 | 0/6 | 13,582 / 36,887 ms |
| MakerSuite `gemini-3.7-flash` | 6 | 6/6 | 6/6 | 0/6 | 1,912 / 3,060 ms |
| OpenRouter `google/gemini-3.7-flash` + `google-ai-studio/flex` | 6 | 6/6 | 6/6 | 0/6 | 2,237 / 3,419 ms |
| **合计** | **60** | **60/60** | **60/60** | **0/60** | — |

OpenAI 有一轮动态请求约 22.6 秒，OpenCode 有一轮私聊约 36.9 秒；两轮最终结构与语义均正确。这是时延离群点，不是 FC fallback。

## 口径与安全边界

- 每轮使用正式 `emit_phone_batch` provider schema、本地严格 IR/领域校验及精确 release seed。
- “FC 接受”要求唯一终态工具、参数可解析、严格 schema/领域校验通过、0 额外正文；“严格题意”再要求 surface、冻结 session target、消息类型/身份、顺序与校验词全部正确。
- cohort 不执行任何业务工具，不写聊天、动态、记忆或变量；只保留布尔检查、错误码、token 与时延，不保留模型正文或工具参数。
- 有效批测共 60 次模型调用；生产事务另 3 次。定位测试脚本时还做了 1 次 Claude 原配置对照请求。
- 初次 Claude 批测误把开发档的 `reverse_proxy` 强制改为 `direct`，6 次请求在模型前失败；原配置对照立即成功。修正测试脚本后正式 6 轮全部通过，前述无效配置样本不进入正确率分母，生产代码没有因此改动。
- 当前生产事务级补测只覆盖 DeepSeek 私聊；群聊与动态由同一正式 batch runtime 做零写入验证。若后续要量化真实 UI 事务时延，可另做临时群聊/动态资料的有界测试。
- 批测后在 Windows PowerShell 运行 `npm run test:chat-generation`，通过；dev WebView/CDP 保持在线，测试用页面全局与临时资料均已清理。

测试脚本：`scripts/dev/provider-chat-fc-batch-cohort.js`。
