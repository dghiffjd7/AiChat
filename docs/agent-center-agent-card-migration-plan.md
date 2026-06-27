# Agent Center 卡片化与提示词迁移计划

## 背景

当前 Agent Center 已经有基础的 Agent 功能入口，但生图、记忆表格、血缘图、执行泳道等能力还分散在不同运行链或资源入口中。部分 Agent 相关提示词目前仍由 preset panel 的“聊天提示词”或 OpenAI preset 区块管理。

目标是把这些 Agent 能力统一收拢到 Agent Center，以翻面卡片的方式展示和管理。迁移完成后，preset panel 不再显示被迁走的 Agent 相关提示词入口，也不保留占位符或跳转提示。

## 总目标

1. Agent Center 成为 Agent 功能、提示词、触发策略、权限、运行状态的主要管理入口。
2. 生图、记忆表格、血缘图、执行泳道等能力以统一卡片模型呈现。
3. 卡片支持正反面：
   - 正面展示名称、短介绍、状态、快速启用/禁用入口。
   - 反面展示详细说明、设置项、提示词、触发方式、运行记录或相关资源。
4. Agent 相关提示词从 preset panel 的 UI 中移走。
5. 旧用户数据通过一次性迁移和兼容 fallback 保留，不因迁移而丢失。

## 非目标

1. 不在第一阶段重写发送链或 prompt builder 的核心逻辑。
2. 不在根因未定位时用迁移或重构掩盖现有 bug。
3. 不直接删除旧 preset 字段；旧字段先保留为迁移来源和兼容 fallback。
4. 不把所有 preset 概念都移入 Agent Center。模型参数、基础系统提示词、上下文格式等仍按现有 preset 体系保留，除非后续另立迁移计划。

## 当前相关位置

### Agent Center

- `src/scripts/ui/agent-center-panel.js`
  - 当前 Agent Center UI 渲染、事件处理、资源入口。
- `src/scripts/ui/agent-center-view-model.js`
  - 当前 Agent Center view model。
- `src/scripts/ui/agent-center-resource-contract.js`
  - 当前资源入口，包括提示词、记忆中心、世界书、变量、图片模板等。
- `src/scripts/agent/agent-feature-settings.js`
  - 当前真正的 Agent 功能列表。

### 现有 Agent / runtime

- `src/scripts/agent/image-director-agent.js`
  - 生图 Agent runtime。
- `src/scripts/ui/chat/memory-update-runtime.js`
  - 记忆更新 runtime。
- `src/scripts/agent/lineage-agent-runtime.js`
  - 血缘图 runtime。
- `src/scripts/ui/chat/creative-execution-lane-runtime-utils.js`
  - 执行泳道 runtime utils。
- `src/scripts/agent/contact-profiler-agent.js`
  - 联系人画像相关 Agent。
- `src/scripts/agent/worldbook-audit-agent.js`
  - 世界书审计相关 Agent。

### 现有 preset 提示词

- `src/scripts/storage/preset-store.js`
  - 默认提示词、字段补全、旧字段迁移。
- `src/scripts/ui/preset-panel.js`
  - 当前 preset panel 编辑 UI。
- `src/scripts/ui/bridge.js`
  - 发送链中读取 sysprompt/openai preset 并注入提示词。
- `src/scripts/ui/app.js`
  - 记忆表格注入配置读取。
- `src/scripts/ui/experience-pack-transfer.js`
  - 体验包导入导出时收集 preset 数据。

## 需要迁移的数据

### sysprompt preset 中的聊天提示词字段

这些字段当前在 preset panel 的“聊天提示词”区块展示，并被发送链读取：

| 目标 Agent / 功能 | 旧字段 |
| --- | --- |
| 手机格式 / 输出格式 Agent | `phone_format_intro_enabled`, `phone_format_intro_rules`, `phone_format_chat_enabled`, `phone_format_chat_rules`, `phone_format_moment_enabled`, `phone_format_moment_rules`, `phone_format_footer_enabled`, `phone_format_footer_rules` |
| 私聊协议 Agent | `dialogue_enabled`, `dialogue_position`, `dialogue_depth`, `dialogue_role`, `dialogue_rules` |
| 群聊协议 Agent | `group_enabled`, `group_position`, `group_depth`, `group_role`, `group_rules` |
| 动态发布 Agent | `moment_create_enabled`, `moment_create_position`, `moment_create_depth`, `moment_create_role`, `moment_create_rules` |
| 动态评论 Agent | `moment_comment_enabled`, `moment_comment_position`, `moment_comment_depth`, `moment_comment_role`, `moment_comment_rules` |
| 发布后评论 Agent | `moment_publish_comment_enabled`, `moment_publish_comment_position`, `moment_publish_comment_depth`, `moment_publish_comment_role`, `moment_publish_comment_rules` |
| 生图 Agent | `auto_image_prompt_enabled`, `auto_image_prompt_position`, `auto_image_prompt_depth`, `auto_image_prompt_role`, `auto_image_prompt_rules` |
| 摘要 Agent | `summary_enabled`, `summary_position`, `summary_rules` |

### openai preset 中的记忆表格字段

这些字段影响记忆表格注入位置：

| 目标 Agent / 功能 | 旧字段 |
| --- | --- |
| 记忆表格 Agent | `memory_data_position`, `memory_data_depth`, `memory_guide_position`, `memory_guide_depth` |

## 新数据结构建议

新增 Agent Center 专属设置 store。命名可在实现时确认，例如：

- `agent-center-settings-store.js`
- `agent-settings-store.js`
- `agent-prompt-settings-store.js`

建议数据结构：

```js
{
  version: 1,
  migrations: {
    presetPromptV1: {
      completed: true,
      migratedAt: 1710000000000
    }
  },
  profiles: {
    "sysprompt:<presetId>": {
      image_director: {
        enabled: true,
        rules: "",
        position: 4,
        depth: 0,
        role: 0,
        migratedFrom: {
          type: "sysprompt",
          presetId: "<presetId>"
        }
      },
      summary_agent: {
        enabled: true,
        rules: "",
        position: 1
      }
    },
    "openai:<presetId>": {
      memory_table_agent: {
        dataPosition: "before_latest_user",
        dataDepth: 0,
        guidePosition: "",
        guideDepth: 0,
        migratedFrom: {
          type: "openai",
          presetId: "<presetId>"
        }
      }
    }
  },
  global: {
    execution_lane_agent: {
      enabled: true
    },
    lineage_agent: {
      enabled: true
    }
  }
}
```

设计重点：

1. 保留 `profiles`，不要只做单一全局配置。旧用户可能有多套 sysprompt/openai preset，每套提示词不同。
2. profile key 需要包含 preset 类型和 preset id，避免 sysprompt/openai id 撞名。
3. Agent runtime 读取时应根据当前 session/mode 解析到的 active preset id 找对应 profile。
4. 没有 profile 时，允许从旧 preset 字段 lazy migrate。

## 迁移策略

### 原则

1. 不只迁“检测为自定义”的字段，而是迁移所有 Agent 相关字段。
2. 迁移所有 preset，不只迁当前激活 preset。
3. 新 store 优先，旧 preset 字段只做 fallback。
4. 旧字段暂时不删除，只从 preset panel UI 移除。
5. 导入旧体验包或旧角色包后，如果包含旧字段，应自动迁入 Agent Center store。

### 一次性迁移流程

1. 应用启动或 preset store 初始化完成后，检查 Agent Center store 的 `migrations.presetPromptV1.completed`。
2. 如果未完成：
   - 扫描所有 sysprompt preset。
   - 扫描所有 openai preset。
   - 将相关字段完整复制到 Agent Center store 的 `profiles`。
   - 写入迁移版本和时间。
3. 迁移过程中不修改旧 preset 字段。
4. 迁移完成后，运行链读取 Agent Center store。

### lazy migrate / fallback

运行时读取顺序：

```text
Agent Center profile
-> 如果不存在，从当前 resolved preset 的旧字段即时迁移
-> 如果仍不存在，使用默认值
```

这样可以覆盖：

1. 用户从旧版本升级但一次性迁移未执行。
2. 用户导入旧体验包后新增了旧字段。
3. 某个 preset 是迁移后才创建或导入的。

## UI 计划

### Agent 卡片模型

新增统一 Agent card view model，建议字段：

```js
{
  id: "image_director",
  title: "生图 Agent",
  summary: "根据对话自动整理生图标签和提示词。",
  detail: "负责判断是否需要生成图片，并生成适合图片模型的提示词。",
  category: "creative",
  implemented: true,
  enabled: true,
  accent: "image",
  promptRefs: [
    {
      profileType: "sysprompt",
      agentId: "image_director",
      field: "rules"
    }
  ],
  settingRefs: [],
  runtimeKinds: ["image_director_generation", "image_generation"],
  resourceRefs: ["image_templates"]
}
```

### 初始卡片范围

第一批建议包含：

1. 生图 Agent
   - 管理自动标签生图提示词。
   - 关联图片参数模板入口。
   - 显示最近生图任务状态。
2. 记忆表格 Agent
   - 管理记忆表格注入位置、深度、guide 位置。
   - 关联记忆中心入口。
   - 显示最近记忆更新任务状态。
3. 血缘图 Agent
   - 管理上下文血缘图可视化开关。
   - 显示最近 lineage layout 运行状态。
4. 执行泳道 Agent
   - 管理创作过程泳道展示。
   - 显示当前会话是否可用。
5. 回复格式检查
   - 沿用现有 `reply_check` 功能，改成新卡片样式。
6. 写入预览
   - 沿用现有 `write_preview` 功能，改成新卡片样式。
7. 摘要 Agent
   - 管理摘要提示词和启用状态。
8. 动态 Agent
   - 管理动态发布、动态评论、发布后评论相关提示词。
9. 私聊 / 群聊协议 Agent
   - 视产品归类决定是否首批迁移；如果 preset panel 要清空聊天提示词区块，则需要纳入。
10. 手机格式 Agent
   - 视产品归类决定是否首批迁移；如果 preset panel 不再显示手机格式提示词，则需要纳入。

### 卡片交互

建议交互：

1. 卡片正面显示：
   - Agent 名称。
   - 一句话介绍。
   - 状态标签。
   - 快速启用/禁用按钮。
   - 小型运行状态或最近任务。
2. 卡片背面显示：
   - 详细说明。
   - 可配置项。
   - 提示词编辑区。
   - 相关资源入口。
   - 最近运行记录。
3. 快速开关只绑定到明确的开关按钮或状态按钮。
4. 卡片主体点击用于翻面或展开详情。
5. 长按可以作为辅助快捷操作，但不能是唯一入口。
6. 键盘和触屏都要可用。

### 视觉原则

1. 参考世界书翻面卡片的交互感觉，但 Agent Center 使用独立 CSS，避免样式互相影响。
2. 每个 Agent 可使用轻量图标、色条、徽章或标题排版做区分。
3. 不使用过重的艺术字，不牺牲可读性。
4. 卡片内部不再嵌套卡片；反面用区块、行、分隔线组织。
5. 移动端保证按钮、文本、输入框不重叠。

## preset panel 调整

迁移完成后，preset panel 中不再显示被迁走的 Agent 相关区块。

需要删除或隐藏：

1. `renderChatPromptsEditor` 中被迁移的提示词区块。
2. `collectSectionData('chatprompts')` 中对应 UI 字段的保存逻辑。
3. OpenAI preset UI 中属于记忆表格 Agent 的注入位置设置，如果该功能迁入 Agent Center。

注意：

1. 不保留占位符。
2. 不显示“已移至 Agent Center”提示。
3. 不保留跳转卡片。
4. 旧字段仍可存在于数据里，但 UI 不展示。

## 运行链调整

### 生图 Agent

读取来源从：

```text
sysprompt.auto_image_prompt_*
```

调整为：

```text
Agent Center image_director profile
-> sysprompt.auto_image_prompt_* fallback
-> default
```

### 摘要 Agent

读取来源从：

```text
sysprompt.summary_*
```

调整为：

```text
Agent Center summary_agent profile
-> sysprompt.summary_* fallback
-> default
```

### 记忆表格 Agent

读取来源从：

```text
openai.memory_data_*
openai.memory_guide_*
```

调整为：

```text
Agent Center memory_table_agent profile
-> openai.memory_data_* / memory_guide_* fallback
-> app settings fallback
-> default
```

### 动态 / 私聊 / 群聊 / 手机格式

如果迁入 Agent Center，则按同样规则：

```text
Agent Center agent profile
-> sysprompt old fields fallback
-> default
```

## 导入导出计划

### 导出

体验包、角色包或房间包导出时，需要包含 Agent Center 设置。

建议新增独立 section：

```js
{
  agentCenterSettings: {
    version: 1,
    profiles: {},
    global: {}
  }
}
```

同时可以暂时继续导出旧 preset 字段，以兼容旧版本应用。

### 导入

导入时处理顺序：

1. 如果包内有 `agentCenterSettings`，优先导入新结构。
2. 如果包内只有旧 preset 字段，导入 preset 后触发 lazy migrate。
3. 如果新旧都有，以新结构为准。
4. 避免重复迁移覆盖用户已经编辑过的新 Agent Center 设置。

## 测试计划

### 单元 / 脚本测试

需要覆盖：

1. Agent Center view model
   - 新卡片列表数量和基础字段。
   - 生图、记忆、血缘、泳道等卡片是否生成。
2. Agent Center panel
   - 卡片正反面 HTML。
   - 快速开关按钮。
   - 翻面按钮。
   - 提示词编辑控件。
3. 迁移工具
   - 单个 sysprompt preset 迁移。
   - 多个 sysprompt preset 迁移。
   - openai memory 字段迁移。
   - 已迁移时不会重复覆盖。
   - lazy migrate 能从旧字段补齐。
4. 运行链读取
   - 新 Agent Center 设置优先。
   - 新设置不存在时 fallback 到旧 preset。
   - 新旧都不存在时使用默认值。
5. preset panel
   - 被迁走的区块不再渲染。
   - 未迁走的 preset 设置仍可正常保存。
6. 导入导出
   - 新结构能导出。
   - 新结构能导入。
   - 只有旧 preset 字段的包能自动迁移。

### 影响范围测试

涉及 `app.js`、发送链、session、bridge、导入导出时，需要跑影响范围测试。

建议至少执行：

```bash
node scripts/tests/agent-center-view-model-tests.mjs
node scripts/tests/agent-center-panel-tests.mjs
node scripts/tests/dev-chat-format-raworiginal-cdp-smoke.mjs
npm run typecheck
```

如果需要 dev smoke，按项目约定在 Windows PowerShell 执行：

```powershell
npm run dev
```

## 分阶段实施

### Phase 1: Agent Catalog 与翻面卡片 UI

目标：

1. 新增统一 Agent card catalog/view model。
2. Agent Center 使用翻面卡片展示现有和新增 Agent。
3. 不改变提示词存储和运行链。

验收：

1. Agent Center 能看到生图、记忆表格、血缘图、执行泳道等卡片。
2. 现有 `reply_check`、`write_preview` 功能仍可启用/禁用。
3. 卡片翻面、移动端布局、键盘访问可用。
4. 现有 Agent Center 测试更新并通过。

### Phase 2: Agent Center 设置 store 与一次性迁移

目标：

1. 新增 Agent Center 设置 store。
2. 实现 sysprompt/openai preset 旧字段完整迁移。
3. 实现 migration version 标记。
4. 实现 lazy migrate。

验收：

1. 多个旧 preset 的提示词都能迁到 Agent Center。
2. 迁移后旧字段仍保留。
3. 重复启动不会覆盖新编辑的 Agent Center 设置。
4. 新增迁移测试通过。

### Phase 3: Agent Center 提示词编辑

目标：

1. 卡片背面支持编辑对应 Agent 提示词和设置。
2. 保存写入新 Agent Center store。
3. UI 上不再依赖 preset panel。

验收：

1. 生图、摘要、记忆表格等 Agent 能在卡片背面编辑。
2. 保存后重启仍保持。
3. 不同 preset profile 的差异可以保留。

### Phase 4: 运行链读取新 store

目标：

1. `bridge.js` 中的 Agent 相关提示词读取改为新 store 优先。
2. `app.js` 中记忆表格注入设置读取改为新 store 优先。
3. 保留旧 preset fallback。

验收：

1. 新 store 中的生图提示词实际参与注入。
2. 新 store 中的摘要提示词实际参与注入。
3. 新 store 中的记忆表格位置实际生效。
4. 删除新 store 对应 profile 后，旧 preset fallback 仍能工作。

### Phase 5: preset panel 移除旧 UI

目标：

1. 从 preset panel 删除被迁走的 Agent 相关编辑区块。
2. 不显示占位符。
3. 不显示跳转提示。

验收：

1. preset panel 不再展示已迁移提示词。
2. 非 Agent preset 设置仍正常展示和保存。
3. 旧数据仍不会因 UI 删除而被清空。

### Phase 6: 导入导出支持

目标：

1. 导出包包含 Agent Center 设置。
2. 导入新结构时恢复 Agent Center 设置。
3. 导入旧结构时触发 lazy migrate。

验收：

1. 新版本导出的包导入后 Agent 设置完整。
2. 旧版本包导入后 Agent 相关提示词能出现在 Agent Center。
3. 新旧结构同时存在时不覆盖用户更新过的新设置。

## 风险与处理

### 风险：多 preset 差异被压成一份全局配置

处理：

使用 `profiles` 按 `presetType:presetId` 存储，不直接迁成全局配置。

### 风险：旧字段 UI 删除后保存 preset 时清空旧字段

处理：

修改 `collectSectionData` 时只删除 UI 采集，不要主动 `delete` 或覆盖旧字段为空。

### 风险：运行链读取新旧来源不一致

处理：

建立统一 resolver，例如：

```js
resolveAgentPromptProfile(agentId, {
  syspromptPreset,
  openaiPreset,
  sessionId,
  uiMode
})
```

运行链只通过 resolver 获取配置，避免各处手写 fallback。

### 风险：导入旧包后没有触发迁移

处理：

导入完成 preset 后调用 lazy migrate，或在下次读取 Agent profile 时自动补迁。

### 风险：一次性迁移覆盖用户已编辑的新设置

处理：

迁移只在目标 profile 不存在时写入。若 profile 已存在，只补缺失字段，不覆盖非空用户值。

### 风险：提示词字段默认值历史变动导致“是否自定义”误判

处理：

不依赖是否自定义，完整迁移字段。

## 最终完成标准

1. Agent Center 以翻面卡片统一展示 Agent。
2. 生图、记忆表格、血缘图、执行泳道等能力在 Agent Center 中可见、可配置。
3. Agent 相关提示词从 preset panel UI 中移除。
4. 旧用户自定义提示词、启用状态、注入位置、深度、角色不会丢失。
5. 多 preset 差异可以保留。
6. 导入旧包后能迁移旧提示词。
7. 新运行链优先读取 Agent Center store。
8. 旧 preset 字段仅作为兼容 fallback，不再作为用户可见编辑入口。
