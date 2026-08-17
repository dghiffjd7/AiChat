# 聊天结构化通道 G.5 简易测试报告

- 日期：2026-08-14
- 环境：Windows 11 PowerShell、Tauri dev WebView、CDP 9222
- 目标：验证 `emit_phone_batch` 在内部灰度前的真实模型终态、失败回退和正式发送事务

## 结果摘要

| 测试层 | 结果 | 关键结论 |
|---|---:|---|
| 官方 DeepSeek V4 Flash 受控题集 | 24/24 | thinking 开/关各 12/12；均为唯一工具调用、目标正确、无额外正文、无 fallback |
| 确定性失败注入 | 7/7 | 非法终态只回退一次；Abort 不回退；开始持久提交后禁止回退 |
| 正式发送事务烟测 | 1/1 | 1 次 provider 请求原子提交 1 条用户消息与 2 条群成员回复，三条均恰好一次 |
| 可丢弃流式预览 UI 烟测 | 4/4 | 正常终态、终态失败回退、用户中止、重生成均先预览且不落库；预览终态后无残留 |
| 临时资料清理 | 通过 | 临时会话、联系人、记忆行、内部开关、bridge 方法及原会话指针全部恢复 |
| Windows 影响范围回归 | 通过 | `test:chat-generation`、`test:chat-ui`、`test:chat-moments`、`test:chat-memory`、`test:integration`、`test:cancel` 与 `test:all` 均以退出码 0 完成 |

真实模型题集覆盖群聊文字/贴图、私聊后发动态、图片提示词、表格新增与更新、完整有序副作用、动态单/双作者评论，以及评论后的私聊/群聊旁路。该组测试不写聊天资料，也不保存回复正文或工具参数。

## 性能

| 模式 | 样本 | 平均 | P50 | P95 | Prompt / Completion / Total tokens |
|---|---:|---:|---:|---:|---:|
| 合计 | 24 | 1,799 ms | 1,529 ms | 3,624 ms | 25,298 / 4,263 / 29,561 |
| thinking off | 12 | 1,312 ms | 1,154 ms | 2,099 ms | 12,139 / 1,342 / 13,481 |
| thinking on | 12 | 2,286 ms | 1,856 ms | 3,679 ms | 13,159 / 2,921 / 16,080 |

## 失败保护覆盖

- 无工具调用、未知表格、工具调用外夹带正文、多工具调用：完整拒绝结构化终态，并且只走一次传统协议 fallback。
- Abort：直接向上传播，不误发第二次请求。
- 已进入持久提交边界：禁止 fallback，避免重复副作用。
- 缺少冻结表格目标：在请求前以 `unsupported_side_effects` 回到传统协议，不向 provider 暴露结构化工具。

## 可丢弃流式预览

- 结构化请求在 APP 提供临时预览接收器且当前配置启用流式时，改由 provider `streamChat()` 消费工具参数 delta；未提供接收器的后台/旧调用保持原本非流式行为。
- 增量解析器只解码当前唯一工具中首个有序 item 的可见 `content`。JSON 字段名、目标 id、摘要、图片提示词、表格与变量副作用均不会进入预览；预览以 `textContent` 渲染，不执行 HTML、富文本或贴图替换。
- 预览气泡不进入 `chatStore`，也不写入可恢复的 stream partial cache。即使用户在生成中点击停止，底层控制器仍强制以 `keepPartial: false` 清除，因此不会把未验收内容保存成“已取消的半条回复”。
- Windows dev 的确定性流式 provider 共执行 4 次结构化请求与 1 次传统 fallback 请求：正常终态、失败回退、中止、重生成四种 UI 路径全部通过；四种路径在终态前的预览持久化计数均为 0，最终临时会话、联系人和预览 DOM 残留均为 0。
- 本地 provider 的首个预览延迟为 0–1 ms，只证明 UI/delta 管线没有额外等待，不能代表公网模型时延。真实 DeepSeek 首个有效预览 P50/P95 留待 G.5.4 灰度样本统计。

## 判断与下一步

正确性、目标冻结、恰好一次、回退安全与可丢弃预览门槛均已通过，可以进入 G.5.4 真实会话内部灰度。终态仍只会在完整参数通过校验后原子提交；流式期间新增的内容只是随时可整段删除的视觉预览。thinking on 的终态 P95 仍为 3.679 秒，因此正式默认决策不能只依据本地 UI 烟测。

下一步收集真实 DeepSeek 会话的首个有效预览 P50/P95、终态成功率、fallback 与用户中止残留，再决定是否正式默认；当前内部开关继续默认关闭。

## 可复跑入口

- `scripts/dev/chat-batch-structured-controlled-cohort.js`
- `scripts/dev/chat-batch-failure-injection-smoke.js`
- `scripts/dev/chat-batch-ui-transaction-smoke.js`
- `scripts/dev/chat-batch-stream-preview-ui-smoke.js`
