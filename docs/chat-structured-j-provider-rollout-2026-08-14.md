# 聊天结构化通道 Stage J 简要测试报告

- 日期：2026-08-14
- 环境：Windows 11、Tauri dev WebView、CDP 9222
- 数据边界：受控题不执行业务工具、不保留模型正文或工具参数；真实会话只使用临时联系人/会话并在结束后清理。

## 结论

| Provider | 精确组合 | 最终结果 | 发布状态 |
|---|---|---:|---|
| OpenCode | 官方 Go Chat Completions + `glm-5.3` | 8/8 零写入题；真实临时会话通过 | 已放量 |
| MakerSuite | 官方 GenerateContent + `gemini-3.7-flash` + Gemini-flat schema | 8/8 零写入题；真实临时会话通过 | 已放量 |
| OpenRouter | `google/gemini-3.7-flash` + `google-ai-studio/flex` | 最终完整手机 cohort 4/4；真实临时会话通过 | 已放量 |
| Ollama | 本机 `0.32.5` | 服务在线，但已安装模型 0 个 | 能力接入完成；FC 不放量 |

“全部通过”只表示固定受控题与临时会话全部满足合同，不代表长期自然对话成功率为 100%。OpenRouter 首轮完整 cohort 为 3/4，私聊关键词有一次语义偏离；定向复验 1/1、完整重跑 4/4。该偏离没有产生业务写入。

## 关键定位

- Gemini 完整 batch 的 HTTP 400 来自数字 `rowIndex enum` 不符合 Gemini Schema 的字符串 enum 合同。只修改 Provider schema 视图后，记忆表、变量和完整 batch 通过；本地严格 IR 没有放宽。
- OpenRouter 第一次真实会话稳定返回 404，是 `require_parameters:true` 与继承的 `frequency_penalty/presence_penalty/n` 组合导致固定路由无可用端点。只从 OpenRouter FC 继承参数中移除这三个非必要字段后，同链路为 1 次 FC、0 fallback，token、首参数增量、输出时长、TPS 与 response id 均完整。
- OpenRouter 免费候选在路由、schema 上限或复杂语义题上未达门槛，没有进入白名单；Kimi K3 未用于本轮测试。
- Ollama 已使用 `/api/version`、`/api/tags`、`/api/show` 建立 Base URL + version + model + digest 能力身份；离线、缺模型、无 tools 或身份变化均回到文本 primary。本轮不自动下载模型。

## 回归

- Windows `npm run test:chat-generation`：通过。
- Windows `npm run test:chat-ui`：通过。
- Windows `npm run test:agent`：通过。
- Windows `npm run test:cancel`：通过。
- Windows `npm run test:all`：通过，最终静默复核 `exit 0`。
- Windows dev/CDP：APP 可载入；Gemini/OpenRouter 真实传输与临时会话通过；所有临时会话、联系人和记忆行清理通过。

## 剩余门槛

J.6 只差 Ollama 本地模型放量验收。需由用户明确选择并安装一个带 `tools` 能力的模型，再运行私聊、batch 零写入 cohort 与最小真实会话；通过后才把该精确 version/model/digest 加入白名单。现阶段 Ollama 普通文字聊天行为不变，结构化聊天稳定使用文本 primary。
