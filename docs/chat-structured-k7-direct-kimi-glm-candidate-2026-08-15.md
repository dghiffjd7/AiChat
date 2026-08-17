# K.7 直连 Kimi / 智谱 GLM 原生 FC 验收简报

日期：2026-08-15

## 结论

| 精确组合 | Transport | 严格 surface cohort | 临时真实会话 | 发布结果 |
| --- | ---: | ---: | ---: | --- |
| Kimi 全球直连 `https://api.moonshot.ai/v1` + `kimi-k3` | 2/2 | 未通过失败即停门槛 | 未执行 | 不加入白名单，继续文本 primary |
| 智谱官方直连 `https://open.bigmodel.cn/api/paas/v4` + `glm-5.2` | 2/2 | 30/30（私聊、群聊、动态各 10/10） | 1/1 | 加入 bundled revision 4 |

所有 cohort 均为零业务写入测试，不保留回复正文、工具参数或 API key。联网关闭；失败后没有继续消耗该模型额度。

## Kimi K3

- 最小流式与非流式工具探针均能产生唯一、合法的 `tool_calls`，说明端点、鉴权和基本工具传输可用。
- 默认 thinking 的首轮严格 cohort 在动态题耗尽 700 completion tokens 后仍没有工具调用。
- FC 请求改为 `thinking: {type: "disabled"}` 后，首个私聊/群聊/动态三题组为 3/3；下一轮私聊仍出现失败，隔离重跑同一题时模型返回普通正文而不是工具调用（`no_tool_call`）。
- Kimi 官方兼容说明只提供 `tool_choice: auto/none/null`，没有可用的 `required` 强制出口；因此不能把偶尔成功当成稳定终态保证。本轮不发布 `kimi-k3`，Kimi 中国站、其他模型及代理端点也不会继承能力。

## 智谱 GLM 5.2

- 最小 transport：2/2，通过流式参数增量及非流式多工具选择。
- 严格 cohort：30/30，结构、目标、speaker/comment author、唯一工具与无正文泄漏全部正确；0 次 fallback、0 次持久写入。
- 前 6 次使用 3,805 tokens；后 24 次使用 15,195 tokens；合计 19,000 tokens。两阶段加权平均时延约 4,891 ms。
- 生产发送链临时真实会话：1 次 provider 请求、1 个终态工具、0 fallback；`provider_fc` 生效，usage、首增量、输出耗时、TPS 与 response id 均有记录。临时联系人、会话和记忆清理完成。
- 白名单仅匹配 `provider=zhipu + official_zhipu_chat_completions + model=glm-5.2`；其他 GLM 型号、反向代理或自定义端点保持 fail-closed。

## 回归验证

Windows PowerShell 已通过：

- `npm run test:chat-generation`
- `npm run test:chat-ui`
- `npm run test:agent`
- `npm run test:cancel`
- `npm run test:all`

同时通过 FC capability catalog、provider transport、Kimi/智谱 provider、私聊/batch fallback、取消与零写入专项测试。

官方约束参考：

- [Kimi Tool Use](https://platform.kimi.com/docs/api/tool-use)
- [Kimi OpenAI SDK 迁移说明](https://platform.kimi.com/docs/guide/migrating-from-openai-to-kimi)
- [智谱 Function Calling](https://docs.bigmodel.cn/cn/guide/capabilities/function-calling)
- [GLM-5.2 模型说明](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.2)
