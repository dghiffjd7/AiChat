# Worldbook 原生目录孤儿审计（2026-07-30）

## 口径

- 审计位置：Windows dev 数据目录 `C:\Users\alan9\AppData\Roaming\com.chatapp.dev`。
- 索引来源：`worldinfo_store.json`；原生来源：`worldinfo/*.json`（只计直接子文件）。
- 先完成 22 个 Shadow miss 的冻结归因，再开始本审计。
- 删除前只比较索引、原生文件、当前 world-session 映射及可识别的 checkpoint 引用；未能证明是本轮测试残留的文件一律保留。

## 删除前盘点

- 索引世界书：55。
- 原生 JSON：61。
- 索引有、原生无：`手机-格式`（builtin，属于预期形态）。
- 原生有、索引无：7。

| ID | 大小 | 可识别来源／引用 | 处置 |
|---|---:|---|---|
| `记忆系统G35-0730·资料库` | 3,206 B | 本轮 G35 批次；日志证明 `worldbook.delete_many` 已从索引移除，但旧 lifecycle 未删除原生文件 | 可证明的测试孤儿，修复后删除 |
| `🕯️灯火摇曳之间` | 314,660 B | `character_card`，61 条；另发现 checkpoint 引用 | 保留 |
| `滨莲市` | 191,502 B | `character_card`，24 条 | 保留 |
| `创世回廊2.1` | 756,971 B | `character_card`，130 条 | 保留 |
| `房东模拟器Z5.20` | 81,106 B | `character_card`，17 条 | 保留 |
| `test` | 1,237 B | 来源不足 | 保留，待人工辨认 |
| `XX` | 8,207 B | 来源不足 | 保留，待人工辨认 |

当前 world-session 映射没有引用上述 7 本书；但“没有当前映射”不足以证明可删，尤其角色卡导入来源和 checkpoint 仍可能具有恢复价值。

## G35 可证明孤儿清理

- 时间：2026-07-30 12:08 CST。
- 路径：运行中 Windows dev APP 的 `appBridge.deleteWorldInfo()`，实际调用新增的原生 `delete_world_info`，没有直接操作文件系统。
- 删除前 `worldInfoExists=true`。
- 返回：`ok=true`、`nativeAvailable=true`、`nativeDeleted=true`。
- 删除后 `worldInfoExists=false`；PowerShell `Test-Path=false`。
- 原生 JSON 从 61 降为 60；native-only 从 7 降为 6。
- 删除后的 native-only 精确集合：`XX`、`test`、`创世回廊2.1`、`房东模拟器Z5.20`、`滨莲市`、`🕯️灯火摇曳之间`。
- 索引侧仍只有 builtin `手机-格式` 属于 indexed-only。

## 结论

新 lifecycle 已在真实 dev 数据上证明能同时清理索引与原生文件，并能用独立 exists 契约确认真正缺失；既有 `get_world_info` 的 `{}` 缺失语义未改变。历史目录没有做“索引外即删除”的批量清扫：只删除了证据闭环的 G35 测试孤儿，其余 6 项完整保留供后续恢复／人工确认。
