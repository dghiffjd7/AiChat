# OpenCode `glm-5.2` FC 验收与精确内建发布（2026-08-15）

## 结论

- OpenCode Go `/models` 返回 26 个模型，并精确包含 `glm-5.2`。
- 最小 transport 探针 `2/2`；首轮 APP surface 探针 `3/3`。两组共 `5/5`，均只有一个正确工具调用、没有额外正文。
- 新增唯一题目信号后的严格零写入 cohort 为 `30/30`：私聊、群聊、动态各 `10/10`，结构与题意正确率 `100%`，观察到 fallback `0/30`、持久写入 `0`。
- 取消及 fallback 边界通过：真实原生取消已确认请求中止且 `0 fallback`；确定性夹具确认提交前只允许一次文本 fallback，提交后禁止 fallback。
- 候选期临时真实私聊和发布后内建真实私聊均通过。发布后请求直接命中 `verified_seed`，只发送 1 次 FC 请求、产生 1 个终态工具调用、`0 fallback`；流式 token、首个工具参数增量、输出时长、TPS 与 response id 均完整，临时会话、联系人和记忆行清理为零残留。
- `glm-5.2` 已写入 revision 2 的 bundled 能力目录，发布范围严格限定为 `opencode + https://opencode.ai/zen/go/v1 + glm-5.2 + Chat Completions`。`glm-5.1` 等其他 OpenCode 模型不会继承该证据。

## 实测数据

| 层级 | 场景 | 结果 | 平均 / P50 / P95 | Token |
|---|---|---:|---:|---:|
| Transport | 流式具名工具 + 非流式 `required` | `2/2` | 1,208 / 1,429 ms（逐项） | 536 |
| APP surface 基础 | 私聊 + 群聊 + 动态 | `3/3` | 1,347 / 1,301 / 1,725 ms（逐项） | 1,782 |
| 严格 cohort | 私聊 10 + 群聊 10 + 动态 10 | `30/30` | 1,719 / 1,645 / 2,276 ms | 18,836 |
| 取消边界 | 原生 `http_abort_request` | `1/1` | — | 未计入成功样本 |
| 候选真实会话 | 内存规则、临时私聊 | `1/1` | 1,890 ms | 字段完整 |
| 发布后真实会话 | bundled `verified_seed`、临时私聊 | `1/1` | 1,836 ms | 字段完整 |

严格 cohort 的分 surface 结果：

| Surface | 严格成功 | 平均时延 | P95 | Token |
|---|---:|---:|---:|---:|
| 私聊 | `10/10` | 1,578 ms | 2,236 ms | 4,849 |
| 群聊 | `10/10` | 1,642 ms | 2,276 ms | 7,058 |
| 动态 | `10/10` | 1,937 ms | 2,754 ms | 6,929 |

已完成的正常响应共 37 次，另有 1 次专用取消请求。可汇总的 transport/surface 样本 token 为 21,154；真实会话只核验诊断字段与单次所有权，不在本报告保留回复正文或工具参数。

## 语义与安全门槛

- 零写入测试不再只看 JSON Schema。每题带唯一 fixture token，并同时核对事件种类、数量、冻结目标、群聊说话者、动态作者、唯一工具调用和零额外正文；“结构合法但答非所问”会以 `semantic_contract_failed` 立即停止后续请求。
- 所有候选脚本均先验证精确模型目录，失败即停；不保存本地规则，不创建聊天、动态、记忆、变量或世界书数据，也不保留 API key、模型正文或工具参数。
- 真实会话使用唯一临时联系人和会话；测试结束后恢复原运行时、FC 开关、活动会话与本地规则，并检查零残留。
- 发布门控仍 fail-closed：只有 bundled 能力记录同时声明 `basicToolCall` 与 `uniqueTerminalTool` 才能启用 OpenCode FC，不能用服务商名称或相似模型名放宽整条渠道。

## 实现与复验

- `src/scripts/agent/chat-fc-capability-catalog.js`：新增精确 `glm-5.2` bundled 记录，目录 revision 升为 2。
- `src/scripts/agent/provider-fc-transport.js`：OpenCode release 改为读取精确能力记录，不维护第二份容易漂移的模型名单。
- `src/scripts/agent/chat-fc-zero-write-compat-test.js`：加入唯一信号与 surface 语义验证。
- `scripts/dev/opencode-k5-candidate-cohort.js`：30 次严格零写入 cohort。
- `scripts/dev/opencode-k5-candidate-boundary-smoke.js`：真实取消及提交前/后 fallback 边界。
- `scripts/dev/provider-h4-real-session-gray.js`：先查询 bundled release；已发布模型不再注入候选本地规则。

Windows PowerShell 验证均通过：

- `npm run pretest:agent`
- `npm run test:chat-generation`
- `npm run test:all`
