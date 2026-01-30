# 插件系统（Phase7 文档）

## 1. 插件结构

```
my-plugin/
  manifest.json
  index.js
```

- `manifest.json`：插件元数据
- `index.js`：入口脚本，需 `module.exports = function(api) { ... }`

## 2. manifest 字段

必须：
- `id`：唯一 ID（建议反向域名）
- `name`
- `version`（语义化版本）
- `apiVersion`（当前为 `1`）
- `main`（入口脚本路径）
- `permissions`（权限列表）

可选：
- `description`、`author`、`mode`（safe/power/legacy）

## 3. 权限说明

- `chat.read` / `chat.write`
- `worldbook.read` / `worldbook.write`（需要 power）
- `storage`
- `network`（需要 power）
- `prompt.modify`（需要 power）
- `ui.inject`
- `variables.read` / `variables.write`
- `system.settings`（需要 power）

> 高危权限必须 `mode: "power"`，否则无法安装/启用。

## 4. 事件与 API

常用事件：
- `message.before_send`
- `message.after_send`
- `message.after_receive`
- `message.before_render`
- `message.after_render`
- `variable.changed`
- `command.parsed`
- `session.changed`
- `prompt.before_build` / `prompt.after_build`

API（示例）：
- `api.storage.get/set/remove/keys`
- `api.variables.get/getAll/set/patch/watch`
- `api.chat.getMessages/getMessage/updateMessage/sendMessage`
- `api.ui.registerSidebar/registerChatCard/openModal`

## 5. 兼容层（Legacy）

可用全局函数：
- `eventOn / eventEmit / eventRemove`
- `getVariables / setVariables / updateVariablesWith`
- `getChatMessages / setChatMessage / setChatMessages`
- `SillyTavern.extensionSettings`

Legacy 事件别名示例：
- `message_received` -> `message.after_receive`
- `message_sent` -> `message.after_send`

## 6. Phase7 示例插件与验证

示例插件目录：
- `/mnt/d/my/phone/test-plugin-phase7/hello-world`
- `/mnt/d/my/phone/test-plugin-phase7/ui-inject`
- `/mnt/d/my/phone/test-plugin-phase7/legacy-compat`

验证要点：
1) **hello-world**
   - 发送消息后自动追加 `[phase7]`
   - 收到回复后 `phase7_counter` 自增并写入存储

2) **ui-inject**
   - 侧边栏可打开，卡片出现在输入框下方
   - 自动弹出一次插件弹窗

3) **legacy-compat**
   - 收到回复后 `legacy_counter` 自增
   - 回复消息 meta 被写入 `legacyTouched: true`
   - `SillyTavern.extensionSettings.phase7LegacyLoaded` 为 `true`

