# 開發進度追蹤（必更新）(必须使用当下时间记录)

## 2026-01-20 17:26
- AI 生成贴图弹窗：新增“精灵图/动图”分页模式，表单输入汇总为用户输入并接入提示词生成/补全流程。
- 模式切换：模板/最终提示词按模式保存与还原，按钮文案与标题随模式更新。
- 切割预设：精灵图模式默认 6×6（行/列/边距/间距）并沿用既有切割逻辑。
- 修改：
  - `src/scripts/ui/app.js`
  - `src/assets/css/qq-legacy.css`

## 2026-01-20 17:52
- 精灵图/贴图生成结果分离：生成图与切割结果按模式独立持久化，切换模式不再互相污染。
- 切割设置缓存分离：每个模式使用独立的切割参数缓存与选择索引。
- 修改：
  - `src/scripts/ui/app.js`

## 2026-01-20 18:31
- 提示词模板：补充“不要数字/序号/标签”约束，避免生成分格编号。
- 动图预览：切割结果上方新增动画预览与帧速控制，随选择自动更新并持久化设置。
- 修改：
  - `src/scripts/ui/app.js`
  - `src/assets/css/qq-legacy.css`

## 2026-01-20 22:47
- 动图保存：精灵图模式在“保存到贴图包”直接合成 GIF 并保存为单一贴图。
- GIF 编码：前端生成 GIF（统一画布、透明索引、循环播放）并按帧速控制输出速度。
- 修改：
  - `src/scripts/ui/app.js`

## 2026-01-20 22:56
- 动图帧对齐：切割时额外保留完整帧图用于 GIF 合成，避免保存后画面被截断。
- GIF 透明修正：开启透明标记，优化透明背景显示。
- 修改：
  - `src/scripts/ui/app.js`

## 2026-01-20 23:07
- GIF 合成修复：使用图片 natural 尺寸进行帧对齐，避免保存后仅剩顶部可见。
- 修改：
  - `src/scripts/ui/app.js`

## 2026-01-20 23:21
- 附件流式保存：新增 attachment 流式写入，避免超大 GIF 保存截断。
- GIF 透明阈值：降低透明阈值，保留半透明像素避免画面缺失。
- 修改：
  - `src/scripts/ui/app.js`
  - `src-tauri/src/commands.rs`
  - `src-tauri/src/lib.rs`

## 2026-01-20 23:26
- 动图保存改为强制流式写入，并下调 base64 分块大小，减少保存后画面被截断的风险。
- 流式保存失败回退时补充尺寸校验，异常时自动尝试流式补救。
- 修改：
  - `src/scripts/ui/app.js`

## 2026-01-20 23:57
- 动图保存改为写入逐帧序列（PNG 帧 + fps），避免 GIF 文件截断导致显示不完整。
- 贴图渲染支持帧序列动画：贴图面板、输入预览、聊天气泡自动播放。
- 贴图包格式扩展：新增 frames/fps 字段并同步删除帧文件。
- 修改：
  - `src/scripts/ui/app.js`
  - `src/scripts/ui/chat/chat-ui.js`
  - `src/scripts/storage/sticker-pack-store.js`
  - `src/scripts/utils/media-assets.js`

## 2026-01-21 01:15
- 修复贴图分页：自定义贴图渲染改用独立 fps 夹取函数，避免引用 AI 预览常量导致分页渲染中断。
- 修改：
  - `src/scripts/ui/app.js`

## 2026-01-21 01:32
- 动图保存：仅在用户提供关键词时写入关键词；未填写则保持空，右上角提示并阻止发送。
- 修改：
  - `src/scripts/ui/app.js`

## 2026-01-21 11:21
- 动图预览/聊天播放修复：按关键词回溯贴图包帧序列，避免解析不到帧导致静态显示。
- 聊天动图懒加载：仅在可见时播放，移出视口自动停播以降低内存占用。
- 修改：
  - `src/scripts/ui/app.js`
  - `src/scripts/ui/chat/chat-ui.js`

## 2026-01-21 11:29
- 聊天室遮挡修复：进入聊天室时通过 class 强制隐藏顶部消息栏与底部导航，避免残留显示。
- 修改：
  - `src/scripts/ui/app.js`
  - `src/assets/css/main.css`

## 2026-01-21 11:36
- 贴图预览修复：关键词规范化改为本地实现，避免作用域缺失导致输入框预览不显示。
- 修改：
  - `src/scripts/ui/app.js`

## 2026-01-20 09:20
- 贴图 AI 切割预览：参数调整改为 idle + 延时触发，避免频繁重切导致卡顿。
- 贴图 AI 自动切割：根据白底/黑线分隔自动推断行列/边距/间距，并据角落色差动态设定容差，选图后自动套用。
- 修改：
  - `src/scripts/ui/app.js`

## 2026-01-20 09:33
- 贴图 AI 切割：新增“自动推断”按钮，可手动触发推断；切割参数按大图来源缓存并持久化。
- 修改：
  - `src/scripts/ui/app.js`

## 2026-01-20 09:46
- 贴图 AI 自动推断：提升采样分辨率并在原图上微调网格参数，生成后仍会自动触发一次。
- 修改：
  - `src/scripts/ui/app.js`

## 2026-01-20 14:23
- 贴图保存：关键词与默认贴图/自定义贴图重复时自动加序号避免冲突。
- 完整提示词：新增“继续”按钮，带草稿再次请求补全。
- 修改：
  - `src/scripts/ui/app.js`
  - `src/assets/css/qq-legacy.css`

## 20261.  21:55
- 贴图 AI 生成：切割参数加说明；提示词输入框支持放大编辑与自动保存。
- 修改：
  - `src/scripts/ui/app.js`
  - `src/assets/css/qq-legacy.css`

## 2026-01-19 17:44
- 贴图 AI 生成：生成/切割预览持久化到本地，重启仍可查看；切割贴图保存时可从本地预览路径回读。
- 修改：
  - `src/scripts/ui/app.js`

## 2026-01-19 16:50
- 贴图 AI 生成：切割列表输入视为关键词并保存到贴图包；关闭弹窗后保留生成/切割预览，直到下次生成。
- 修改：
  - `src/scripts/ui/app.js`

## 2026-01-19 16:26
- 贴图 AI 切割预览：调整切割参数或切换源图时自动刷新预览，避免重复并发。
- 修改：
  - `src/scripts/ui/app.js`

## 2026-01-19 09:18
- 贴图包自定义：新增贴图包存储、分页/图标上传、删除贴图/贴图包、AI 可用开关、关键词编辑与缺失提示逻辑调整。
- 贴图交互：缺失关键词点击会提示补全并阻止发送；输入框贴图预览支持删除并同步移除 token。
- 贴图加载修复：自定义贴图本地路径统一 convertFileSrc 解析，补充 fallback；贴图加载失败记录与调试输出。
- Debug 增强：通用调试面板新增“贴图调试”按钮并输出贴图状态与路径。
- 贴图提示词注入：AI 注入仅包含启用贴图包关键词（默认/自定义）。
- 修改：
  - `src/scripts/storage/sticker-pack-store.js`
  - `src/scripts/utils/media-assets.js`
  - `src/scripts/utils/sticker-debug.js`
  - `src/scripts/ui/app.js`
  - `src/scripts/ui/bridge.js`
  - `src/scripts/ui/config-panel.js`
  - `src/scripts/ui/debug-panel.js`
  - `src/assets/css/qq-legacy.css`

## 2026-01-17 15:44
- Android 资料包导出：补强 MediaStore 导出后回传实际下载路径并触发媒体扫描，避免导出后找不到文件。
- 修改：
  - `src-tauri/src/commands.rs`

## 2026-01-17 23:10
- Dev/Release 分离：新增 dev 配置覆盖包名，避免 Android 调试包与 release 安装冲突。
- 修改：
  - `src-tauri/tauri.conf.dev.json`

## 2026-01-17 23:16
- Android debug 安装隔离：debug build 加上 applicationIdSuffix 与版本后缀，避免与 release 包名冲突。
- 修改：
  - `src-tauri/gen/android/app/build.gradle.kts`

## 2026-01-17 02:12
- Persona 调试日志：调试面板新增日志筛选输入；Persona 切换与 Chat/Contacts store 加入范围日志与 session/联系人新增日志。
- ChatStore v2 队列：异步写入改用捕获的 v2 实例，避免 Persona 切换时写入跨 scope。
- 修改：
  - `src/scripts/ui/debug-panel.js`
  - `src/scripts/ui/app.js`
  - `src/scripts/storage/chat-store.js`
  - `src/scripts/storage/contacts-store.js`

## 2026-01-17 01:33
- Persona 切换时防止旧会话异步加载写入新 scope：聊天存储增加 scope 校验并在延迟持久化中锁定 storeKey。
- 修改：
  - `src/scripts/storage/chat-store.js`

## 2026-01-17 01:47
- 修复 Persona 联系人/会话混入：持久化数据写入 scopeId 标记，加载时校验不匹配则忽略。
- 修改：
  - `src/scripts/storage/chat-store.js`
  - `src/scripts/storage/contacts-store.js`

## 2026-01-17 01:23
- Persona 切换时防止异步 hydrate 覆盖新 scope：为联系人/会话/分组/动态/动态摘要 store 增加 scope token 校验。
- 修改：
  - `src/scripts/storage/chat-store.js`
  - `src/scripts/storage/contacts-store.js`
  - `src/scripts/storage/group-store.js`
  - `src/scripts/storage/moments-store.js`
  - `src/scripts/storage/moment-summary-store.js`

## 2026-01-17 01:07
- 新 Persona 不再自动生成 default 聊天室：空会话时 currentId 为空、相关方法对空会话直接返回；变量面板无会话时不再回落 default。
- 修改：
  - `src/scripts/storage/chat-store.js`
  - `src/scripts/ui/variable-panel.js`

## 2026-01-17 00:53
- 修复 default 聊天室删除后仍会回来的问题：删除当前会话时自动切到其它会话（若存在）。
- 修改：
  - `src/scripts/storage/chat-store.js`

## 2026-01-17 00:43
- Persona 切换：避免新 Persona 继续继承旧数据（联系人/会话/动态摘要等），修复新建 Persona 出现旧联系人无头像问题。
- 修改：
  - `src/scripts/storage/chat-store.js`
  - `src/scripts/storage/group-store.js`
  - `src/scripts/storage/moments-store.js`
  - `src/scripts/storage/moment-summary-store.js`

## 2026-01-15 21:35
- 未分组联系人区域常驻显示；为空时显示占位并支持拖拽回未分组。
- 修改：
  - `src/scripts/ui/contact-group-renderer.js`

## 2026-01-15 21:31
- 分组拖拽优化：仅高亮当前悬停分组，支持拖拽悬停自动展开并可投放到不同层级。
- 修改：
  - `src/scripts/ui/contact-drag-manager.js`

## 2026-01-15 21:22
- 联系人分组：长按分组名称弹出联系人选择清单，支持批量加入该分组。
- 联系人分组：新增嵌套/层级分组支持，分组可设置上级并在列表中呈现层级。
- 修改：
  - `src/scripts/storage/group-store.js`
  - `src/scripts/ui/contact-group-renderer.js`
  - `src/scripts/ui/group-panel.js`
  - `src/scripts/ui/app.js`

## 2026-01-15 21:04
- 记忆表格模式：开启新聊天改为按钮选择（保留摘要/清空全部/取消）。
- 记忆表格与存档绑定：清空后开启新聊天仅影响新存档，切回历史存档会恢复表格内容。
- 修改：
  - `src/scripts/storage/chat-store.js`
  - `src/scripts/ui/contact-settings-panel.js`
  - `src/scripts/ui/group-chat-panels.js`

## 2026-01-15 20:14
- 附件发送补强：Enter 可缓存仅附件的待发送气泡；发送时不再因“发送到这里”而忽略附件。
- 修改：
  - `src/scripts/ui/app.js`

## 2026-01-15 19:32
- 附件过期清理：全局扫描改为闲时分批处理，降低卡顿风险；应用运行超过 24 小时后会触发定时扫描。
- 修改：
  - `src/scripts/ui/app.js`

## 2026-01-15 19:27
- 附件过期清理：启动时全局扫描所有会话，过期图片标记失效并删除本地文件。
- Prompt 构建：过期图片不再进入请求内容。
- 修改：
  - `src/scripts/ui/app.js`

## 2026-01-15 10:25
- 资料迁移：新增一键打包/导入资料包（聊天记录、联系人、壁纸、记忆表格等），导出为 ZIP 并支持覆盖导入。
- 导入前关闭记忆表格 DB 连接，避免 Windows 文件占用导致导入失败。
- 通用设定新增资料迁移入口与状态提示，导入后提示重启。
- 修改：
  - `src-tauri/Cargo.toml`
  - `src-tauri/src/commands.rs`
  - `src-tauri/src/lib.rs`
  - `src-tauri/src/memory_db.rs`
  - `src/scripts/ui/general-settings-panel.js`

## 2026-01-15 10:33
- 资料包排除 API 配置与 keyring 文件，避免迁移敏感资讯。
- 资料迁移 UI 文案补充安全提醒，导入提示覆盖所有资料。
- 导出时同步写入 app_settings，以便迁移 UI 偏好。
- 修改：
  - `src-tauri/src/commands.rs`
  - `src/scripts/ui/general-settings-panel.js`

## 2026-01-15 11:04
- 导入资料包改为容错模式：单个文件失败会跳过并继续导入，统计跳过数量。
- 导入完成提示增加跳过项数量提示。
- 修改：
  - `src-tauri/src/commands.rs`
  - `src/scripts/ui/general-settings-panel.js`

## 2026-01-15 11:18
- 世界书管理隐藏内置「手机-格式」，避免与自动注入逻辑混淆。
- 群聊成员绑定列表同步隐藏内置世界书选项。
- 修改：
  - `src/scripts/ui/world-panel.js`

## 2026-01-15 12:42
- 桌面端联系人拖拽改为 pointer 方案，移动端仍走原 HTML5 拖拽。
- 贴图面板打开时修正聊天输入栏高度计算，避免出现大块空白。
- 修改：
  - `src/scripts/ui/contact-drag-manager.js`
  - `src/scripts/ui/app.js`

## 2026-01-15 00:56
- 聊天室底部留白微调：消息列表底部预留缩减（输入框间距更紧）。
- 壁纸持久化补强：新增原图流式分块写入、修正保存参数命名、失败提示带错误信息。
- 壁纸清理：清除壁纸/删除联系人同步删除本地文件；通用设定新增“清理壁纸残留”入口。
- 壁纸预览：无壁纸时隐藏预览气泡，上传后再显示。
- 修改：
  - `src/assets/css/qq-legacy.css`
  - `src/scripts/ui/app.js`
  - `src/scripts/ui/general-settings-panel.js`
  - `src/scripts/ui/session-panel.js`
  - `src-tauri/src/commands.rs`
  - `src-tauri/src/lib.rs`

## 2026-01-15 17:53
- 聊天附件：图片/文档先进入输入框上方预览，发送按钮才真正发请求；仅附件也可触发请求。
- 图片持久化：新增附件保存到 AppData，消息记录保存路径与过期时间（默认 7 天），过期自动清理。
- Prompt 预览：图片/语音改为占位符显示（含 gif），不再展示 base64 长串。
- 修改：
  - `src/assets/css/qq-legacy.css`
  - `src/scripts/ui/app.js`
  - `src/scripts/ui/bridge.js`
  - `src/scripts/ui/chat/chat-ui.js`
  - `src/scripts/ui/media-picker.js`
  - `src-tauri/src/commands.rs`
  - `src-tauri/src/lib.rs`

## 2026-01-15 18:25
- 修复本次 Prompt 异常：增加异常保护并回退显示，避免无响应。
- 修改：
  - `src/scripts/ui/app.js`

## 2026-01-14 20:09
- 聊天室底部留白对齐修正：消息列表改为使用输入栏位置计算的底部内边距，避免多余空白。
- 面板开合时同步更新底部偏移，贴图预览仍单独加高。
- 修改：
  - `src/assets/css/qq-legacy.css`
  - `src/scripts/ui/app.js`

## 2026-01-14 20:20
- 聊天室底部偏移计算减去安全区差值，避免在 Android 底部手势栏下重复预留导致空白。
- 修改：
  - `src/scripts/ui/app.js`

## 2026-01-14 20:41
- 聊天室底部留白计算改为使用消息列表与输入栏的实际相对位置，避免误差导致空白。
- 壁纸保存失败时标记为临时，不再将超大 data URL 写入聊天存档以免清空历史。
- 修改：
  - `src/scripts/ui/app.js`
  - `src/scripts/storage/chat-store.js`

## 2026-01-14 21:00
- 聊天室底部间距加入动态校正（检测最后一条消息与输入栏的实际间距并修正）。
- 壁纸上传改为先压缩再保存，提升持久化成功率。
- 修改：
  - `src/scripts/ui/app.js`

## 2026-01-14 16:31
- 聊天设置：气泡/字体颜色改为仅作用当前聊天室（CSS 变量 + 会话切换应用）。
- 聊天壁纸：新增拖拽/上传框，提供预览比例、拖拽裁切、缩放、旋转与重置/清除。
- 壁纸本地化：新增 Tauri 命令写入 AppData 壁纸文件并按需加载显示。
- 修改：
  - `src/index.html`
  - `src/assets/css/qq-legacy.css`
  - `src/scripts/ui/app.js`
  - `src-tauri/src/commands.rs`
  - `src-tauri/src/lib.rs`

## 2026-01-14 16:35
- 聊天设置新增“应用范围”（当前/全部）选项，气泡/字体可一键同步到全部会话。
- 修改：
  - `src/index.html`
  - `src/assets/css/qq-legacy.css`
  - `src/scripts/ui/app.js`

## 2026-01-14 16:53
- 聊天设置：新增恢复默认按钮；全局默认色存储并用于新会话继承。
- 壁纸显示：顶部渐变遮罩层级提升，避免状态栏区域透出壁纸。
- 壁纸屏保：聊天页无操作 2 分钟仅显示壁纸，点击/操作恢复。
- 修改：
  - `src/index.html`
  - `src/assets/css/qq-legacy.css`
  - `src/scripts/ui/app.js`
  - `src/scripts/storage/app-settings.js`
  - `src/scripts/storage/chat-store.js`

## 2026-01-06 10:11
- Phase 7：记忆表格 AI 自动提取（<tableEdit> JSON 指令 + 自动写表）。
- Prompt 注入新增记忆表格编辑规则，行索引/表索引指引；记忆注入支持行编号与表 ID 标注。
- 自动写表解析：前端抽取 <tableEdit>、解析 JSON 操作并执行批量新增/更新/删除；表格面板监听自动刷新。
- 通用设定新增“AI 自动写入记忆表格”开关（仅表格模式生效）。
- 修改：
  - `src/scripts/storage/app-settings.js`
  - `src/scripts/ui/general-settings-panel.js`
  - `src/scripts/ui/app.js`
  - `src/scripts/ui/memory-table-editor.js`
  - `src/scripts/ui/bridge.js`

## 2026-01-06 14:29
- 记忆表格：编辑处新增提示词模板编辑与发送预览（注入位置/包裹可调）。
- 记忆表格：自动写表支持“同请求/独立请求”模式，独立请求可选 API 配置。
- 独立写表：新增记忆更新请求（使用当前表格提示词 + 最近聊天记录），解析 <tableEdit> 写入。
- 配置层：支持读取指定配置档运行时参数。
- 记忆表格：支持查看最近写表原始输出；独立写表可配置上下文条数。
- 修改：
  - `src/scripts/storage/app-settings.js`
  - `src/scripts/storage/config.js`
  - `src/scripts/ui/general-settings-panel.js`
  - `src/scripts/ui/memory-table-editor.js`
  - `src/scripts/ui/app.js`
  - `src/scripts/ui/bridge.js`

## 2026-01-06 16:58
- 记忆更新上下文改为“轮数”配置（用户+助手），通用设定文案同步。
- 写表记录新增“请求提示词”存档与查看入口，支持同请求/独立请求回溯。
- 修改：
  - `src/scripts/storage/app-settings.js`
  - `src/scripts/ui/general-settings-panel.js`
  - `src/scripts/ui/memory-table-editor.js`
  - `src/scripts/ui/app.js`

## 2026-01-05 09:54
- 修复记忆表格搜索输入失焦问题：工具栏独立渲染，搜索与批量操作不再重建 DOM。
- 修改：
  - `src/scripts/ui/memory-table-editor.js`

## 2026-01-05 09:44
- Phase 3：记忆表格支持搜索、批量操作（启用/禁用/删除）、行状态标识与最大行数限制提示。
- 聊天室记忆表格默认隐藏全局表格，批量模式下禁用单行操作。
- 修改：
  - `src/scripts/ui/memory-table-editor.js`

## 2026-01-03 00:06
- Phase 3：聊天室面板内记忆表格 UI（联系人/群聊）落地，支持表格分组展示、增删改、启用/置顶/优先级。
- 设置菜单新增“记忆表格”入口，提供模板导入/导出与默认模板切换面板。
- 修改/新增：
  - `src/scripts/ui/memory-table-editor.js`
  - `src/scripts/ui/contact-settings-panel.js`
  - `src/scripts/ui/group-chat-panels.js`
  - `src/scripts/ui/memory-template-panel.js`
  - `src/scripts/storage/memory-template-store.js`
  - `src/scripts/ui/app.js`
  - `src/index.html`
  - `src-tauri/src/memory_db.rs`

## 2026-01-02 23:50
- 记忆表格：联系人面板改为 flex 以支持滚动；聊天面板不再显示全局表格，改由“记忆表格管理”面板编辑全局表格。
- 默认模板调整：新增“角色档案”表格；用户档案保留为全局。
- 修改：
  - `src/scripts/ui/contact-settings-panel.js`
  - `src/scripts/ui/group-chat-panels.js`
  - `src/scripts/ui/memory-table-editor.js`
  - `src/scripts/ui/memory-template-panel.js`
  - `src/scripts/storage/memory-template-store.js`
  - `src/scripts/memory/default-template.js`
  - `src/scripts/ui/app.js`

## 2026-01-02 23:08
- Phase 2：默认记忆模板落地（模板结构 + 首次启动写入 templates 表）。
- 新增模板 CRUD 命令与前端模板 Store，Persona 切换时同步写入默认模板。
- 修改/新增：
  - `src-tauri/src/memory_db.rs`
  - `src-tauri/src/commands.rs`
  - `src-tauri/src/lib.rs`
  - `src/scripts/memory/default-template.js`
  - `src/scripts/storage/memory-template-store.js`
  - `src/scripts/ui/app.js`
  - `src/scripts/ui/bridge.js`

## 2026-01-02 22:52
- 修复 Memory DB 编译错误：补足 Manager trait 引入、AppHandle 获取、事务提交借用冲突处理。
- 修改：
  - `src-tauri/src/memory_db.rs`
  - `src-tauri/src/lib.rs`

## 2026-01-02 22:42
- Debug 面板新增“Memory DB 烟测”按钮，便于 Android 端快速验证 SQLite 读写初始化。
- 修改：
  - `src/scripts/ui/debug-panel.js`

## 2026-01-02 22:24
- 记忆表格：Persona 改为分库（`memories__{scope}.db`），切换 Persona 同步切换 DB。
- 前端 MemoryTableStore 支持 scope，并在 Persona 切换时同步。
- 修改：
  - `src-tauri/src/memory_db.rs`
  - `src-tauri/src/commands.rs`
  - `src/scripts/storage/memory-table-store.js`
  - `src/scripts/ui/app.js`

## 2026-01-02 20:47
- 记忆表格 Phase 0/1：SQLite schema + MemoryDb（初始化、WAL/外键、CRUD、批量/事务）落地。
- Tauri 命令注册与前端 MemoryTableStore 接口完成，桥接层挂载。
- 模板 Schema 辅助文件建立（后续模板/渲染使用）。
- 修改/新增：
  - `src-tauri/Cargo.toml`
  - `src-tauri/src/lib.rs`
  - `src-tauri/src/commands.rs`
  - `src-tauri/src/memory_db.rs`
  - `src-tauri/src/memory_schema.sql`
  - `src/scripts/storage/memory-table-store.js`
  - `src/scripts/ui/app.js`
  - `src/scripts/ui/bridge.js`
  - `src/scripts/memory/template-schema.js`

## 2026-01-02 19:47
- 通用设定新增：Persona 绑定联系人/聊天记录开关（默认开启），切换 Persona 自动切换联系人/历史/动态/摘要。
- 通用设定新增：记忆存储方式（摘要 / 记忆表格）切换；表格模式关闭摘要注入与摘要生成。
- 摘要页面适配：好友/群聊设置根据记忆模式切换显示摘要区或记忆表格占位提示。
- 存储隔离：Chat/Contacts/Groups/Moments/动态摘要按 Persona scope 分库，兼容旧未分 Persona 数据回填，世界书会话映射同步隔离。
- 修改/新增：
  - `src/scripts/storage/store-scope.js`
  - `src/scripts/storage/app-settings.js`
  - `src/scripts/storage/chat-store.js`
  - `src/scripts/storage/contacts-store.js`
  - `src/scripts/storage/group-store.js`
  - `src/scripts/storage/moments-store.js`
  - `src/scripts/storage/moment-summary-store.js`
  - `src/scripts/ui/app.js`
  - `src/scripts/ui/bridge.js`
  - `src/scripts/ui/general-settings-panel.js`
  - `src/scripts/ui/contact-settings-panel.js`
  - `src/scripts/ui/group-chat-panels.js`

## 2026-01-02 13:05
- 聊天提示词：按位置拆分注入（IN_PROMPT/BEFORE_PROMPT/SYSTEM_DEPTH_1/IN_CHAT），SYSTEM_DEPTH_1 在 history 后追加。
- 世界书 position：非 OpenAI context 模板含 description/scenario/examples 时，按占位符前后插入；缺失时回退包裹 story_string。
- worldInfo prompt-only 正则：非 OpenAI 路径也应用。
- 修改：
  - `src/scripts/ui/bridge.js`

## 2026-01-02 12:05
- 世界书 @Depth 条目：非 OpenAI prompt 也注入 history，避免仅 OpenAI 生效。
- 修改：
  - `src/scripts/ui/bridge.js`

## 2026-01-02 11:26
- 世界书注入位置：按 position 分桶并插入到 prompt 标记（char/scenario/examples），@Depth 条目注入历史。
- worldInfo marker 仍保留用于默认条目与 chat_guide。
- 修改：
  - `src/scripts/ui/bridge.js`

## 2026-01-02 11:15
- 世界书匹配：补齐 ST 风格触发逻辑（scanDepth、选择性逻辑、二级关键词、全词匹配、概率）。
- 世界书仍在 worldInfo marker 注入，未变更 position/depth 的插入位置。
- 修改：
  - `src/scripts/ui/bridge.js`

## 2026-01-02 10:55
- 对话解析：群聊/私聊标签不符合标准格式时，回退为“匹配现有群/联系人名”后再解析。
- 修改：
  - `src/scripts/ui/chat/dialogue-stream-parser.js`
  - `src/scripts/ui/app.js`

## 2026-01-02 10:46
- 缓存消息浮层：点击“发送”改为仅放回聊天室缓存，不直接发请求。
- 待发送浮层：整体样式更透明。
- 修改：
  - `src/scripts/ui/app.js`
  - `src/assets/css/qq-legacy.css`

## 2026-01-02 10:32
- 缓存消息发送：统一修正 sent 状态并清理 pending 队列，避免蓝点计数残留。
- 缓存消息发送：点击发送后立即刷新 pending 计数，避免发送中蓝点仍显示旧值。
- 修改：
  - `src/scripts/ui/app.js`

## 2025-12-30 17:02
- 创意写作：复制改为优先使用输出正则后的纯文本，避免复制到美化后的显示内容。
- 创意写作：chat_history 改为只发送最近三条消息，并使用输出/输入正则后的纯文本。
- 修改：
  - `src/scripts/ui/app.js`

## 2025-12-30 17:15
- 创意写作：chat_history 维持原有聊天消息注入逻辑，仅在限定历史长度内保留最新三条创意写作回复。
- 修改：
  - `src/scripts/ui/app.js`

## 2025-12-30 18:16
- 富文本 iframe：当首段是 html fenced code 且后续仅文本时，将文本合并进 iframe，避免出现“iframe 空白 + 正文在外层”的分离现象。
- 修改：
  - `src/scripts/ui/chat/rich-text-renderer.js`

## 2025-12-30 09:58
- 富文本 iframe：允许脚本时改走 host + document.write 直写原始 HTML，避免 release 下 blob 脚本不执行导致高度/长按失效。
- host 收到允许脚本时不再 DOMParser 重排，改为直写保留脚本顺序。
- 修改：
  - `src/scripts/ui/chat/rich-text-renderer.js`
  - `src/iframe-host.js`

## 2025-12-30 11:04
- 富文本脚本模式：iframe sandbox 增加 same-origin 以兼容脚本执行与同源访问。
- CSP 放宽脚本/样式/媒体来源（含 http/data/blob 与 unsafe-eval），适配自定义 HTML 资源。
- Android release 允许 cleartext，避免 http 资源被系统阻断。
- 风险提醒文案加重，强调同源数据与外部资源风险。
- 修改：
  - `src/scripts/ui/chat/rich-text-renderer.js`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/gen/android/app/build.gradle.kts`
  - `src/scripts/ui/general-settings-panel.js`

## 2025-12-30 11:47
- 富文本脚本模式改为直接 srcdoc/blob 渲染，移除 host 中转，避免 release 下 host 脚本/桥接被拦截。
- 脚本模式不再设置 iframe sandbox（对齐 ST 方案），并注入 base href 以支持相对资源。
- 修改：
  - `src/scripts/ui/chat/rich-text-renderer.js`

## 2025-12-30 11:57
- 富文本脚本模式对齐 ST：桥接脚本改为 blob 外链注入，避免 inline 脚本被 WebView 阻断。
- iframe 增加 data 标记，脚本从 DOM 读取 id；父页面同源观察 iframe 内容自动测高。
- 修改：
  - `src/scripts/ui/chat/rich-text-renderer.js`

## 2025-12-30 12:15
- 富文本长按菜单：iframe 桥接补充按压时间门槛与捕获阶段监听，避免轻触触发。
- iframe 事件不再触发外层长按计时，仅在收到 longpress 时弹出菜单。
- 修改：
  - `src/scripts/ui/chat/rich-text-renderer.js`
  - `src/scripts/ui/chat/chat-ui.js`

## 2025-12-30 12:54
- 关闭流式小点时隐藏打字气泡与提示，避免仅停动画仍显示空泡。
- 流式占位气泡标记为 typing placeholder，首段文本到来时移除。
- 修改：
  - `src/scripts/ui/chat/chat-ui.js`
  - `src/assets/css/main.css`

## 2025-12-29 00:12
- 通用设定新增「富文本 iframe 执行脚本」开关，启用时弹出风险警告。
- 富文本 iframe 主机支持按开关执行脚本（默认安全模式不执行）。
- 允许富文本在启用脚本后加载 https 样式资源，并放开 CSP 的 https 样式/脚本/字体来源。
- 启用脚本时改用 blob iframe 直渲染 HTML（保留原始样式/脚本），避免 host 解析影响美化。
- 修改：
  - `src/scripts/storage/app-settings.js`
  - `src/scripts/ui/general-settings-panel.js`
  - `src/scripts/ui/chat/rich-text-renderer.js`
  - `src/iframe-host.js`
  - `src-tauri/tauri.conf.json`

## 架構簡表
- 前端殼：`src/index.html` + `assets/css/qq-legacy.css`（原版QQ樣式） + `assets/css/main.css`
- 交互邏輯：`src/scripts/ui/app.js`（整體協調）、`src/scripts/ui/chat/chat-ui.js`（渲染/輸入/打字）、`src/scripts/ui/config-panel.js`
- 橋接層：`src/scripts/ui/bridge.js`
- 客戶端與配置：`src/scripts/api/*`、`src/scripts/storage/config.js`、`src/scripts/storage/chat.js`
- 資產：`src/assets/**`（CSS/圖片等），`src/lib/**`（第三方）

## 變更日誌
- 2025-12-28 22:48
  - 狀態欄漸變加深並拉到純白收尾（聊天室與列表頁頂欄）。
  - 修改：`src/assets/css/main.css`
  - 修改：`src/assets/css/qq-legacy.css`
- 2025-12-28 22:45
  - 聊天室狀態欄漸變區縮短（僅保留極小下延），降低頂部深色區高度。
  - 修改：`src/assets/css/qq-legacy.css`
- 2025-12-28 22:37
  - 非聊天室頂欄：安全區域改為獨立漸變覆蓋層，恢復淡色分割線。
  - 修改：`src/assets/css/main.css`
- 2025-12-28 22:32
  - 聊天室狀態欄遮罩下延，覆蓋頂部 padding 導致的白色縫隙。
  - 修改：`src/assets/css/qq-legacy.css`
- 2025-12-28 22:27
  - 修正聊天室頂欄：恢復原高度，安全區以獨立覆蓋層呈現，避免標題區變高且狀態欄仍為白色。
  - 修改：`src/assets/css/qq-legacy.css`
- 2025-12-28 22:12
  - 顶部状态栏可见性：顶部栏与聊天室顶栏加入渐变底色并补足 safe-area 顶部间距。
  - 通用设定：新增“流式小点动画”开关，关闭后小点静止显示。
  - 发送按钮：发送中/流式期间保持禁用，避免重复发送。
  - 世界书：新建条目默认蓝灯（常驻）。
  - 修改：`src/assets/css/main.css`
  - 修改：`src/assets/css/qq-legacy.css`
  - 修改：`src/scripts/storage/app-settings.js`
  - 修改：`src/scripts/ui/general-settings-panel.js`
  - 修改：`src/scripts/ui/app.js`
  - 修改：`src/scripts/ui/chat/chat-ui.js`
  - 修改：`src/scripts/ui/world-editor.js`
- 2025-12-27 03:43
  - 创意写作：保存正则前的原始文本并在渲染时按当前正则重新生成显示，避免切换预设导致块状缺失。
  - Persona 头像：本地图片上传时先压缩，再持久化保存，减少重开恢复默认的问题。
  - 修改：`src/scripts/ui/app.js`
  - 修改：`src/scripts/storage/chat-store.js`
  - 修改：`src/scripts/ui/persona-panel.js`
- 2025-12-27 03:16
  - 创意写作 HTML 预览：移除全局 pre-wrap 以避免模板缩进换行撑高 iframe，折叠/展开时去掉空白文本节点并刷新高度。
  - 修改：`src/scripts/ui/chat/rich-text-renderer.js`
- 2025-12-27 02:36
  - 富文本预览：强制顶部对齐并压缩过大 margin/padding，减少“思考卡片”上下空白。
  - 修改：`src/scripts/ui/chat/rich-text-renderer.js`
- 2025-12-27 02:29
  - 富文本预览高度计算改为基于实际内容块，减少“居中导致的大空白”。
  - 修改：`src/scripts/ui/chat/rich-text-renderer.js`
- 2025-12-27 02:23
  - 创意写作富文本适配：限制超高区块，细化缩放阈值并在展开/折叠时重新布局。
  - 修改：`src/scripts/ui/chat/rich-text-renderer.js`
- 2025-12-27 02:12
  - 创意写作富文本：HTML 预览保留自然换行，避免段落挤成一团；<br> 在文本片段中自动还原。
  - 修改：`src/scripts/ui/chat/chat-ui.js`
  - 修改：`src/scripts/ui/chat/rich-text-renderer.js`
- 2025-12-26 10:12
  - 创意写作：不再特殊处理 <content>，完整回复统一走正则与自然换行。
  - 修改：`src/scripts/ui/app.js`
- 2025-12-26 09:44
  - 创意写作：气泡显示完整回复（移除 <content> 包裹但保留上下文），全量文本统一换行与正则处理。
  - 修改：`src/scripts/ui/app.js`
- 2025-12-26 00:04
  - 创意写作：<content> 正文抽取后再做换行与正则处理，确保分段显示正确。
  - 创意写作：摘要继续解析并写入列表，chat_history 仅用摘要/大总结替代完整长文。
  - 会话预览：创意写作气泡优先显示摘要，联系人/聊天列表同步更新。
  - 修改：`src/scripts/ui/app.js`
  - 修改：`src/scripts/ui/bridge.js`
- 2025-12-25 23:42
  - 修复创意写作渲染空白：统一换行函数移到全局可见范围，避免运行时引用错误。
  - 修改：`src/scripts/ui/app.js`
- 2025-12-25 23:36
  - 创意写作模式：换行保留，`<br>` 自动还原为真实分段，避免文字挤成一团。
  - 修改：`src/scripts/ui/app.js`
- 2025-12-25 23:32
  - 创意写作模式：关闭手机线上格式世界书（<线上格式>）注入，避免聊天格式提示词混入。
  - 修改：`src/scripts/ui/bridge.js`
  - 修改：`src/scripts/ui/app.js`
- 2025-12-25 23:28
  - 创意写作模式：等待动画改用与聊天一致的小气泡；富文本渲染启用（代码块/HTML 预览）。
  - 修改：`src/scripts/ui/app.js`
  - 修改：`src/scripts/ui/chat/chat-ui.js`
- 2025-12-25 23:16
  - 发送按钮图标显示修复：不再覆盖按钮内容文本；长按模式浮层横排修正。
  - 修改：`src/scripts/ui/chat/chat-ui.js`
  - 修改：`src/assets/css/qq-legacy.css`
  - 修改：`src/scripts/ui/app.js`
- 2025-12-25 23:15
  - 发送按钮图标化细节修复：隐藏文字、长按模式浮层改为横排显示并避开图标、创意模式颜色高亮生效。
  - 修改：`src/assets/css/qq-legacy.css`
  - 修改：`src/scripts/ui/app.js`
- 2025-12-25 23:02
  - 发送按钮改为箭头图标，长按呼出模式切换（创意写作/聊天对话），创意写作模式启用输出正则并禁用线上格式提示词。
  - 新增资源：`src/assets/external/send-icon.png`
  - 修改：`src/index.html`
  - 修改：`src/assets/css/qq-legacy.css`
  - 修改：`src/scripts/ui/app.js`
  - 修改：`src/scripts/ui/chat/chat-ui.js`
- 2025-12-25 20:41
  - 默认头像统一为羽毛图标（含聊天/联系人/群聊/设置/列表等默认回退）。
  - 新增资源：`src/assets/external/feather-default.png`
  - 修改：`src/index.html`
  - 修改：`src/scripts/ui/app.js`
  - 修改：`src/scripts/ui/chat/chat-ui.js`
  - 修改：`src/scripts/ui/contact-group-renderer.js`
  - 修改：`src/scripts/ui/contact-settings-panel.js`
  - 修改：`src/scripts/ui/group-chat-panels.js`
  - 修改：`src/scripts/ui/persona-panel.js`
  - 修改：`src/scripts/ui/session-panel.js`
  - 修改：`src/scripts/ui/world-panel.js`
- 2025-12-25 20:21
  - 新好友头像按钮加宽，避免添加好友时头像选择区过窄。
  - 重新生成：支持重生成最新一轮 AI 回覆，批量删除该轮所有 AI 气泡并移除对应摘要后重发请求；修复 llmContext 未定义报错，并避免重复应用输入正则。
  - 修改：`scripts/ui/session-panel.js`
  - 修改：`src/scripts/ui/app.js`
  - 修改：`src/scripts/ui/bridge.js`
  - 修改：`src/scripts/storage/chat-store.js`
- 2025-12-25 19:54
  - 解析補強：當 <content> 完整但 MiPhone 在其外部時，先去除 </think>/<thinking>，再抽取 MiPhone 區塊解析。
  - 修改：`src/scripts/ui/app.js`
- 2025-12-25 17:10
  - chat_history 換行回復：AI 回覆中的換行在送入歷史時會轉回 `<br>`，避免掉格式顯示在提示詞內。
  - 修改：`src/scripts/ui/bridge.js`
- 2025-12-25 13:04
  - AI 回覆清理：解析後若每條回覆末尾帶 `--HH:MM`（掉格式的占位符）會自動移除；保留正確的數字時間戳。
  - 修改：`src/scripts/ui/app.js`
- 2025-12-25 10:53
  - release.ps1 构建失败保护：android:build 退出码非 0 时直接中止签名流程。
- 2025-12-25 10:51
  - release.ps1 构建兼容：支持 `app-universal-release-unsigned.apk` 作为输入并继续签名流程。
- 2025-12-25 10:32
  - release.ps1 兼容性：调整为 UTF-8 BOM + CRLF，避免 PowerShell 解析报错。
- 2025-12-24 15:41
  - 图标视觉调整：放大羽毛主体并统一背景色调，生成适配桌面与 Android 的新图标资源。
  - 生成参数默认值：最大上下文 128k、temperature 1、top_p 0.98、top_k 64、最大输出 8192。
- 2025-12-24 15:17
  - 应用图标更新：替换 Tauri 桌面图标（PNG/ICO/ICNS）并同步 Android 生成图标资源为新图。
- 2025-12-24 15:17
  - 贴图资源替换：用 `maid` 文件夹 69 张贴图替换内置贴图，重新生成 `manifest.json` 并同步 Tauri 资源目录。
  - 表情包提示词更新：内置世界书表情包列表与示例同步新关键词。
- 2025-12-24 10:42
  - 通用设定面板：头像下拉新增「⚙ 设定」，API 设定图标改为 🔌，并新增 Debug 按钮显示开关（默认隐藏）。
  - 调试按钮策略：Debug 面板默认不自动弹出，仅在启用开关时显示右下角按钮。
  - 动态评论解析：moment_start 内的评论行允许带时间等附加字段，避免评论被忽略。
- 2025-12-24 02:45
  - Android 调试包隔离：debug 使用 applicationIdSuffix `.dev`，可与 release 共存。
  - 修改：`src-tauri/gen/android/app/build.gradle.kts`
- 2025-12-24 02:12
  - 发布页模板：新增 GitHub Pages 下载页模板，按钮直链 Releases 最新 APK。
  - 自动发布脚本：新增 `scripts/release.ps1`，支持打包、签名与发布 Release。
- 2025-12-24 02:03
  - 清理文档：删除已归档的调试/构建/测试类 Markdown 文件。
- 2025-12-24 01:53
  - 發布文檔收斂：README 改為 APK 下載與安裝指引，其餘調試/安裝類文檔歸檔。
  - 授權更新：新增 `LICENSE`（AGPL-3.0）。
- 2025-12-23 19:59
  - 动态评论贴图尺寸：评论区贴图缩小为聊天贴图大小的一半。
  - AI 回覆净化：解析后的回复会移除 `<!-- -->` 注释标签及其内容。
  - 修改：`src/assets/css/main.css`
  - 修改：`src/scripts/ui/app.js`
- 2025-12-23 19:49
  - 动态贴图渲染：动态正文与评论中的 `[bqb-关键词]` 会直接渲染为贴图并自动换行显示。
  - 修改：`src/scripts/ui/moments-panel.js`
  - 修改：`src/assets/css/main.css`
- 2025-12-23 14:25
  - 动态评论解析回退增强：首次失败后裁剪 </think>/</thinking> 前内容再解析，仍失败则抽取 moment_reply_* 片段重试，并补充调试日志与摘要写入。
  - 历史/动态评论贴图回写：动态、群聊、历史输入中的 sticker 资源会回写为 [bqb-关键词] 以保持提示词一致。
- 2025-12-23 14:28
  - 动态评论调试信息完善：输出 moment_reply 目标匹配/写入失败的具体字段，并在 moment_id 不存在时回退到当前动态。
- 2025-12-23 15:17
  - 新增动态摘要存储与面板：独立存储动态摘要/大总结，右上角动态菜单新增“动态摘要”入口。
  - 动态摘要注入与大总结：每次请求注入最新动态摘要（含大总结）；总字数超 1000 自动触发动态大总结。
- 2025-12-23 15:27
  - 大总结增量：触发大总结时把旧大总结与最新摘要一并送入 prompt，避免新大总结丢失历史信息。
- 2025-12-23 15:43
  - 对话去重增强：对话协议解析后过滤开头重复的用户回声（包含合并发送的多条消息）。
- 2025-12-10
  - 建立進度追蹤文件，要求後續每次代碼更新同步記錄。
  - 重構 UI 殼：新增 `assets/css/chat.css`、改寫 `src/index.html`，引入模組化聊天界面。
  - 新增聊天 UI 模組：`src/scripts/ui/chat/chat-ui.js`（消息渲染、打字指示器、自適應輸入）。
  - 新增應用入口：`src/scripts/ui/app.js`，統一初始化橋接、配置面板入口、流式/非流式發送、歷史預載。
  - 更新 `MIGRATION_PLAN.md`：添加當前進度快照與下一步建議。
- 2025-12-10（續）
  - 加入消息解析器 `src/scripts/ui/chat/message-parser.js`，支持特例消息標記：[img-]、[yy-]、[music-]、[zz-]、[bqb-]。
  - 擴展聊天渲染：`chat-ui.js` 支持圖片、語音卡、音樂卡、轉帳提示、表情包徽標，流式完成後會用解析結果重渲染。
  - 新增卡片樣式：`assets/css/cards.css`，並在 `index.html` 引入。
  - 更新 `app.js`：流式/非流式流程都使用解析後的類型化消息。
- 2025-12-10 13:21
  - 添加資產提取/下載工具：`scripts/utils/extract-assets.js` 生成 `asset-manifest.json`、`asset-summary.txt`；`scripts/utils/download-assets.js` 用於批量下載（需網絡）。
  - 生成了初步資產清單（31 個 URL）。
  - 新增 `WORLDINFO_NOTES.md`：整理 ST 世界書格式、目標簡化格式與導入策略（僅參考，不改 ST 源）。
- 2025-12-10 13:23
  - 新增世界書存取與轉換：`src/scripts/storage/worldinfo.js`（localStorage 緩存，提供 ST JSON -> 簡化格式轉換）。
  - 更新 `bridge.js`：增加 worldStore；get/saveWorldInfo 先用本地存儲，後端命令存在則同步；新增 `window.importSTWorld` 兼容導入。
- 2025-12-10 13:25
  - 新增世界書面板 `src/scripts/ui/world-panel.js`：列出本地世界書、支持貼入 ST JSON 導入（使用 `convertSTWorld`）、可從頭部「世界书」按鈕打開。
  - 更新 `index.html`（新增世界书按鈕）、`app.js`（掛載世界書面板）、`bridge.js`（listWorlds/setCurrentWorld）。
- 2025-12-10 13:28
  - 世界書面板增強：列表項新增「啟用」（設置當前世界書並提示）與「導出」（優先複製到剪貼簿，退化為下載 JSON）。
- 2025-12-10 13:35
  - 資產下載（需網路）：`node scripts/utils/download-assets.js` 成功拉取約 21 個文件到 `src/assets/external`；大量 sharkpan/catbox 資源仍有 404/命名過長/占位符導致失敗，保留 `asset-manifest.json` 作為待補清單。
- 2025-12-10 13:36
  - 引入已下載背景示例：`main.css` 增加 `bg-legacy` 並在 `index.html` body 掛上，引用 `src/assets/external/sharkpan.xyz-f-eWhZ-00017-2763077315.png`。
- 2025-12-10 13:39
  - UI 提升：聊天氣泡加入頭像/名稱/時間區塊；`chat-ui.js` 支持 avatar/name 元資料，`app.js` 為 user/assistant 指定本地下載的頭像。
  - 新增卡片樣式文件引用：`assets/css/legacy-card.css`（預留本地圖集展示），`index.html` 引入。
- 2025-12-10 13:44
  - 聊天 composer 升級：增加快捷操作占位按鈕（圖片/音樂/轉帳/表情），樣式更新。
  - 氣泡佈局保留頭像/名稱結構並增加 messageBuffer 以備後續多會話存儲。
- 2025-12-10 13:45
  - 增加前端會話存儲：`src/scripts/storage/chat-store.js`（localStorage），支援消息追加與草稿保存。
  - `app.js` 接入 ChatStore，啟動時預載歷史/草稿；發送時同步寫入存儲；輸入變更即時保存草稿。
  - `chat-ui.js` 提供 `setInputText` / `onInputChange` 以便草稿同步。
- 2025-12-10 13:47
  - 會話標籤顯示：`index.html` 顯示當前 session id，`chat-ui.js` 暴露 `setSessionLabel`。
  - ChatStore 接入現有 UI，為後續多會話/群聊切換奠定基礎（目前單 session，草稿/歷史不丟失）。
- 2025-12-10 13:48
  - 新增會話面板：`src/scripts/ui/session-panel.js` 可列出/新建/切換會話，並刷新歷史/草稿、標記當前 session。
  - `index.html` 增加「會話」按鈕，`chat-ui.js` 支持 session button handler，`app.js` 掛載 SessionPanel。
- 2025-12-10 13:50
  - 會話面板增強：顯示最近消息摘要，支持重命名與刪除會話；切換時清空當前列表並載入目標會話歷史/草稿。
  - `chat-ui.js` 新增 `clearMessages`；ChatStore 增加 `delete`/`rename`/`getLastMessage`。
- 2025-12-10 13:53
  - 世界書應用：`bridge.js` 在構建消息時自動附加當前世界書的內容（按 priority 排序），由 `setCurrentWorld` 控制。
- 2025-12-10 13:55
  - 聊天訊息顯示補充：meta 支持時間、徽章樣式；user/assistant 消息自動帶當前時間。
  - SessionPanel 增強：摘要顯示、重命名/刪除行為，切換時清空並重載歷史/草稿。
- 2025-12-10 13:57
  - 會話列表排序/摘要：按最後消息時間降序，顯示簡短摘要與時間；SessionPanel UI 更新。
  - Session badge：為標題添加 session 標籤 ID，預留群聊/標識擴展。
- 2025-12-10 13:58
  - Composer 佈局調整：縱向排列快捷操作+輸入/發送；chat-scroll 啟用平滑滾動。
- 2025-12-10 14:00
  - 消息解析增強：支持 inline <img>、純 URL 的圖片/視頻後綴判定；badge/時間在 meta 顯示。
  - 氣泡 meta 可顯示 badge，為群聊/狀態標籤預留。
- 2025-12-10 14:02
  - 會話列表細節：按最後消息時間排序；UI 保持摘要/時間顯示，預留群聊/標籤。
- 2025-12-10 14:05
  - SessionPanel 補充「清空當前」按鈕，便於重置會話；排序依最後消息時間；摘要/時間繼續顯示。
- 2025-12-10 14:10
  - 快捷操作落地：圖片/音樂/轉帳/表情按鈕可輸入內容並作為用戶消息插入（帶時間、頭像）。
  - 為後續媒體卡片行為打基礎（當前使用 prompt 輸入 URL/文本）。
- 2025-12-10 14:13
  - 圖片預覽：消息中的圖片可點擊放大（lightbox）；預設預覽樣式添加。
  - 歷史回放支持 type/name/avatar/time/meta/badge，確保渲染一致。
- 2025-12-10 14:14
  - 音樂卡片初步：播放/暫停按鈕（若有 URL 即可播放，無 URL 提示失敗）。
  - 解析器支持 music 標記及 meta.artist，用於卡片展示。
- 2025-12-10 14:16
  - 轉帳卡片：展示金額並提供「確認收款」按鈕（UI 互動占位）。
- 2025-12-10 14:18
  - 表情選擇器：新增 `StickerPicker`（預置表情列表），與快捷「表情」按鈕打通，插入 sticker 類消息。
- 2025-12-10 14:19
  - 會話列表再優化：按最後消息時間排序，摘要+時間展示，並加入群聊標記（基於 ID 前綴）。
- 2025-12-10 14:24
  - Slash 命令占位：新增 `command-runner.js`，支持 /clear（清空當前會話）、/session（開啟會話面板）、/world（開啟世界書面板）。
- 2025-12-10 14:27
  - 快捷操作細節：圖片輸入提示支持 file/https；音樂卡片允許填寫音源 URL；會話時間顯示用本地化 HH:MM。
- 2025-12-10 14:27
  - 音樂卡片：播放/暫停基於 meta.url 判斷，無地址時提示；解析保留。
- 2025-12-10 14:29
  - 小清理：SessionPanel/快捷操作提示微調（無功能變化）。
- 2025-12-10 14:31
  - 鍵盤/底部適配：chat-scroll 增加 safe-bottom padding，兼容鍵盤。
  - 清空提示文案更新，提醒不可恢復。
- 2025-12-10 14:33
  - 媒體選取占位：新增 `MediaPicker`，圖片快捷操作走 URL 輸入回調；結構上預留 file 選取接口。
  - 圖片插入、表情插入均經 handler 統一寫入會話。
- 2025-12-10 14:36
  - 世界書指示器：新增 `WorldInfoIndicator`，掛載到標題顯示當前世界書（初始“未啟用”）。
  - 打開世界書面板時同步刷新指示器。
- 2025-12-10 14:36
  - worldinfo 切換事件：`setCurrentWorld` 會派發 `worldinfo-changed`，`app.js` 監聽更新指示器。
- 2025-12-10 14:37
  - Slash 命令擴充：新增 /export（導出當前會話到剪貼簿）、/rename（重命名當前會話並同步 UI）。命令解析支持參數。
  - Session change 事件：重命名後觸發 session-changed，UI 同步歷史/草稿與標籤。
- 2025-12-10 14:38
  - 命令新增：/worldset <id> 直接切換當前世界書。
- 2025-12-10 14:39
  - 命令新增：/exportworld 導出當前世界書 JSON 到剪貼簿。
- 2025-12-10 14:49
  - 會話列表摘要顯示更多字符（32），時間格式本地化；群聊標記保留。
  - 消息容器 min-width 修正，避免 meta/badge 擠壓。
- 2025-12-10 14:51
  - 世界書命令：新增 /worldlist（列出已存世界書），初始化時刷新世界書指示器；/worldset 持續可用。
- 2025-12-10 14:53
  - 世界書面板：啟用時派發 worldinfo-changed，同步指示器。
  - 音樂卡片：播放中更新按鈕文案並顯示 URL（如有），暫停時重置。
- 2025-12-10 14:56
  - 世界書面板新增「導出當前」按鈕，可複製/下載當前世界書；啟用時仍同步指示器。
  - 命令補充：/worldlist、/worldset、/exportworld；世界書操作有 UI + 命令雙入口。
- 2025-12-10 15:06
  - 標題區支持換行（flex-wrap），避免指示器/徽章擠壓。
- 2025-12-10 15:11
  - 表情選擇器升級：增加「最近」分組（localStorage 保存），雙欄呈現最近/全部。
  - 媒體快捷操作：支持本地圖片/音頻文件（Data URL 形式插入）；音樂快捷操作可選文件或 URL。
- 2025-12-10 15:11
  - 世界書面板：增加「輸入框切換」按鈕，可直接用名稱框切換；啟用/切換會派發 worldinfo-changed。
- 2025-12-10 15:16
  - 命令新增：/help 列出所有命令；命令集覆蓋 worldlist/worldset/exportworld/export/rename/clear/session/world 等。
- 2025-12-10 15:19
  - 兼容處理：標題指示器掛載時檢查元素存在，避免空指針；chat meta 样式保持。
- 2025-12-10 15:27
  - 音樂卡片微調：播放/暫停狀態更新（播放中文案、重置）；快速操作去掉占位註解。
- 2025-12-10 13:16
  - 添加資產提取腳本 `scripts/utils/extract-assets.js`，解析 `手机流式.html` 中外部 URL，生成 `asset-manifest.json` 與 `asset-summary.txt` 以準備資產本地化。
- 2025-12-10 15:40
  - MIGRATION_PLAN 新增「實施順序（帶 PS）」段落，固化工作順序與風險提示，便於後續按序推進。
- 2025-12-10 15:40
  - 音樂卡片加入狀態/進度顯示（播放中/暫停/播放完畢 + 00:00/總長度），轉帳卡片增加狀態行與收款時間標記。
  - 會話面板強化：當前會話高亮並標記「當前」，切換行為改為只發佈 `session-changed` 事件避免重複渲染。
  - 世界書面板顯示當前世界書、列表高亮當前並禁用啟用按鈕，啟用/輸入切換後自動刷新列表。
- 2025-12-10 19:32
  - 消息解析補充：識別以音頻後綴結尾的 URL（mp3/wav/ogg/m4a），自動渲染為音頻卡片；兼容 ST 口徑的 `[yy-]` 之外的直鏈音頻。
- 2025-12-10 22:43
  - 配置面板打磨：可顯示/隱藏 API Key，必填校驗 Base URL / API Key / 模型，保存/測試按鈕加入 loading 狀態並復用 appBridge 配置，避免誤操作；標題增加生效提示。
- 2025-12-10 22:44
  - 媒體健壯性：圖片失敗時提示並標記為破圖；音樂卡片對播放錯誤給出提示並重置狀態。
- 2025-12-10 22:45
  - 鍵盤/弱網體驗：輸入框聚焦自動滾動到底；新增全局錯誤 Banner 用於未配置 API 或發送失敗提示；發送報錯時會同時 toaster + banner 提示。
- 2025-12-10 22:56
  - 穩定性小補：忽略空消息渲染；語音 audio 加載錯誤給出提示。
- 2025-12-10 23:00
  - 網絡狀態提示：監聽 online/offline，離線時顯示錯誤 Banner，恢復時提示已連接，避免弱網無感。
- 2025-12-10 23:08
  - 發送保護：離線時禁用發送並提示；恢復網絡自動恢復發送按鈕；離線狀態下阻止發送流程，減少錯誤。
- 2025-12-10 23:10
  - 媒體/流式防護：破圖樣式標記；流式狀態標記，防止流式中途再次點擊發送；語音卡片加載錯誤提示（已補）。
- 2025-12-10 23:13
  - 錯誤提示可重試：全局 Banner 支持「重試」按鈕，發送失敗可一鍵重試；Banner 停留時間延長以便操作。
- 2025-12-10 23:15
  - 桥接層校驗：在生成前檢查在線狀態，離線直接報錯避免後端調用，與前端離線防護一致。
- 2025-12-10 23:19
  - 新增手機手動回歸清單 `TEST_CHECKLIST.md`，覆蓋消息/媒體、會話與世界書、配置校驗、網絡切換、鍵盤佈局等場景，便於真機驗證。
- 2025-12-11 01:44
  - 修復瀏覽器開發模式下的模組解析：去除 `@tauri-apps/api/core` 靜態導入，使用安全的 `safeInvoke`（檢查 `window.__TAURI__`），避免 dev server 報「Failed to resolve module specifier」。
- 2025-12-11 09:47
  - UI 還原原稿三頁結構：新增頂部導航（聊天/联系人/动态），左右為頭像與「＋」按鈕；世界書/配置/會話入口收納到頭像設定菜單；＋ 展開快捷菜單。
  - 新增頁面骨架：聊天頁保留現有聊天殼，联系人/动态頁先行占位；增補頂部/頁面/菜單樣式以貼近原 QQ 風布局。
- 2025-12-11 09:57
  - 導航位置還原到底部 Tab（聊天/联系人/动态），符合原手機流式布局；聊天頁左上頭像、右上「＋」保留。
  - 聊天列表入口：先顯示聊天列表，點擊項目進入會話並顯示聊天室；底部 Tab 切換恢復正常。
- 2025-12-11 09:58
  - 安全區適配：頂部/底部使用 safe-area 填充，避免與瀏海/狀態欄重疊；切換非聊天頁時自動回到聊天列表視圖，保持原版邏輯。
- 2025-12-11 10:02
  - 移除其餘 @tauri-apps/api/core 靜態導入，改為 safeInvoke，避免 Android dev 環境模組解析報錯；配置/聊天存儲均兼容非 Tauri 環境。
- 2025-12-11 10:04
  - 顶部安全区收紧约 3/4，避免过低；设置/快捷菜单定位到按钮旁，避免弹到右上角。
- 2025-12-11 10:05
  - 顶部再上移约一头像高度（调整 safe-area padding），以贴近手机状态栏下方的常规社交布局。
- 2025-12-11 10:06
  - 顶部继续上移约两个头像高度（减少 padding-top），进一步贴近状态栏位置。
- 2025-12-11 10:10
  - 顶部再上移（约三头像高度，clamp 保護），设置/快捷菜单增加标题与描述，布局改绝对定位并限定最小宽度，弹出贴近按钮。
- 2025-12-11 10:12
  - 再上移约半头像：仅保留顶部安全区并给 topbar 负 margin；头像菜单内「配置」改为「⚙ 设定」并继续触发配置面板。
- 2025-12-11 10:14
  - 顶部再上移（约两头像高度，负 margin 调整），贴近状态栏。
- 2025-12-11 10:17
  - 联系人/动态页顶端同步上移；弹出菜单改为 fixed 定位并跟随按钮位置（含滚动偏移），避免漂移。
- 2025-12-11 10:19
  - 弹出菜单位置贴近按钮（1px 距离）；配置面板填充改用面板作用域查询，修复「设定」点击报 null 的问题。
- 2025-12-11 10:21
  - 菜单进一步贴近按钮（取消额外距离）；配置面板在填充前若未创建将自动 createUI，避免元素为 null。
- 2025-12-11 10:23
  - 菜单定位函数化，按按钮 rect+scrollY 精确贴 1px；配置加载为空时回退默认，避免“provider 为 null”崩溃。
- 2025-12-19 11:51
  - 媒体本地化基础：新增 `media-assets.js` 管理内置/首启拷贝的图片/音频资源，支持别名与源 URL 映射。
  - Tauri 新增 `ensure_media_bundle`：首启从 `resources/media` 拷贝到 app data 并加载 manifest；CSP 放行 asset/tauri/file 资源。
  - 聊天/动态渲染接入：`message-parser` 解析 [img-]/[bqb-]/[yy-] 并解析到本地 URL；聊天表情包渲染为图片；动态列表与详情支持图片网格 + 音频播放器。
  - 新增媒体清单模板：`src/assets/media/manifest.json` 与 `src-tauri/resources/media/manifest.json`。
  - 动态样式补充：新增 `.moment-audios` 相关样式。
- 2025-12-19 13:03
  - 新增 23 张本地表情包资源到 `src/assets/media` 与 `src-tauri/resources/media`，并更新两份 `manifest.json`（文件名即关键词）。
- 2025-12-19 13:48
  - 扩充本地表情包资源到 47 张，已同步至 `src/assets/media` 与 `src-tauri/resources/media` 并更新 manifest。
- 2025-12-19 13:53
  - 更新内置世界书表情包列表，加入现有 47 个关键词供模型使用。
- 2025-12-19 14:04
  - 修正 Tauri 资源打包路径为 `src-tauri/resources/media/**`，并让首启拷贝逻辑兼容多种 bundle 目录结构。
- 2025-12-19 14:42
  - 资源打包路径回退为 `resources/media/**`（相对 `src-tauri`），避免 Android 构建时重复 `src-tauri/src-tauri`。
- 2025-12-19 14:46
  - 调整资源 glob 为 `resources/media/*`，避免 `**` 在构建时未匹配到文件。
- 2025-12-19 15:00
  - 表情包文件名统一改为 ASCII（`sticker_001.png` 等），保留中文关键词在 manifest 以供模型输出匹配。
- 2025-12-19 15:11
  - 表情包渲染尺寸下调（聊天气泡内 140px 上限），并为图片/语音/表情包加载失败提示做去重处理。
- 2025-12-11 10:25
  - 菜单上移约两头像高度（相对按钮偏移），进一步贴近按钮；配置面板加宽到 94% / 680px 以适配手机。
- 2025-12-11 10:27
  - 顶部高度恢复（topbar 负 margin -64）；配置面板进一步加宽至 96vw / 760px。
- 2025-12-11 10:33
  - 顶部再上移两头像高度（topbar 负 margin -128）。
- 2025-12-11 10:34
  - 顶部微调：上移幅度減少至 -96px，避免頭像/「＋」被遮擋。
- 2025-12-11 10:34
  - 去除頂部負 margin，改用 sticky top + safe-area；移除 body 額外頂部留白，避免被白色安全區遮擋。
- 2025-12-11 10:35
  - 為各頁增加 56px padding-top，給黏性 topbar 預留空間，避免頂部與第一條聊天重疊。
- 2025-12-11 10:36
  - 聊天列表單獨下移（margin-top: 64px），不再動整個頁面 padding，避免與頂部重疊。
- 2025-12-11 10:37
  - 再下移聊天列表到 72px，頂部高度保持不動，避免重疊。
- 2025-12-11 11:05
  - 配置面板：模型列表新增可点击模型芯片，移除重复下拉图标，确保完整列表可见；切换服务商时表单回到对应默认值，避免 API Key/Base URL 泄漏到其他 provider。
  - 配置校验：provider 白名单同步 UI 选项，修复 makersuite 保存报「无效 provider」的问题。
  - Vertex 提示：前端明确标注 Vertex 需后端签名，刷新/测试直接提示使用 Makersuite 或代理，避免误用 Service Account。
- 2025-12-11 11:12
  - 修复配置保存报错：ConfigManager 新增 set() 用于更新内存缓存，配置面板保存后不再触发 `window.appBridge.config.set is not a function`。
- 2025-12-11 11:40
  - 世界書入口調整：移出頭像菜單，置於聊天室右上「≡」下拉（世界書 / 聊天設置）；保留快捷描述。
  - 世界書按會話隔離：AppBridge 支持 per-session world 映射（本地持久化），切換會話會同步當前世界書並更新指示器；世界書面板顯示當前會話 ID。
- 2025-12-11 12:00
  - 新增 Tauri KV 落盤：通用 save_kv/load_kv 命令；ChatStore/世界書/會話-世界書映射均落盤到 app_data 目錄，清空瀏覽器緩存也不丟失。
  - 安全處理配置：保存到文件時不寫入 API Key（需手動再次填入），BaseURL/模型等仍可持久；localStorage 也不再存 API Key。
- 2025-12-11 12:10
  - 世界書導入改為 ST 原生體驗：支持選擇 JSON 文件或貼上內容，名稱自動取 JSON.name/文件名，無需手填；去掉名稱輸入/手動切換按鈕。
- 2025-12-12 12:05
  - 長按氣泡菜單：AI 消息支持重新生成/刪除，使用消息前最近的用戶內容重新生成並替換；用戶消息支持編輯/刪除（編輯不觸發重生成）。
  - 消息存儲：ChatStore 增加消息 ID、更新/刪除接口，長按操作同步更新存儲與 UI，預載帶上 id 確保替換一致。
- 2025-12-12 14:40
  - 聊天室頂欄視覺微調：調整灰色頂欄高度、首條消息間距；避免鍵盤彈出導致頂欄被推出視口（使用 `100dvh` + 限制整頁滾動）。
  - 「＋」選單調整：改為 添加好友/创建群组/新建分组（後兩者暫占位）。
  - 好友列表（原會話列表）改造：添加好友會建立獨立聊天室並寫入联系人；刪除會同步移除联系人/聊天記錄並清除會話世界書映射，確保世界書按聊天室隔離。
- 2025-12-12 15:10
  - 修復配置落盤：統一 Tauri invoke 兼容（`core.invoke` / `invoke`），確保連線設定檔與 Keyring 使用 `save_kv/load_kv` 真正寫入 app_data，重啟/清緩存後仍可恢復。
  - 視覺微調：縮小聊天室頂欄灰色覆蓋（狀態欄區域保持透明）、增加首條消息上邊距，並加高輸入框避免過扁。
- 2025-12-12 15:25
  - 修復聊天室輸入框高度被 JS 覆寫：僅對 `<textarea>` 啟用 autosize，避免把 `<input>` 壓扁。
  - 頂欄安全區修正：限制 `safe-area-inset-top` 最大值，避免出現過大的白色安全區與過扁灰色頂欄。
- 2025-12-11 10:45 - 原版設計完整還原
  - **重大重構**：提取原版 `手机流式.html` 的完整 CSS 設計並清晰化架構。
  - 新增 `src/assets/css/qq-legacy.css`：原版 QQ 風格樣式系統（16+ 模塊，CSS 變量系統）。
  - 消息氣泡顏色還原為黃棕色系：`rgba(198, 164, 108, 0.85)`（原版配色）。
  - 完整還原消息界面佈局：頭像+用戶名橫向排列，聊天列表項顯示預覽+時間右上角。
  - 完整還原聊天室界面：頂部 `‹ 會話名 ≡`、底部 🎙 + 輸入框 + 發送（黑底白字）。
  - 完整還原聯系人界面：頂部一致佈局、搜索框 "搜索联系人..."、分組顯示（群組+未分組聯系人）。
  - 完整還原動態界面：頂部 "動態" + 🔔 + ⚙、動態卡片（頭像+內容+圖片+互動數據+評論）。
- 2025-12-11 10:53 - 聊天列表/聊天室邏輯分離修復
  - 修復聊天室元素溢出到消息界面問題：`.QQ_chat_page` 改為 `position: fixed` + 多重隱藏規則。
  - 進入聊天室時自動隱藏消息界面頂部和底部導航欄（完全匹配原版行為）。
  - 退出聊天室時恢復顯示頂部和底部導航欄。
  - 聊天列表和聊天室使用 `.hidden` 類互斥顯示，確保不會同時出現。
- 2025-12-11 11:20 - 狀態欄透明與頂部空白修復
  - 移除 `body` 的 `padding-top`，改為在 `.topbar` 使用 `env(safe-area-inset-top)`。
  - 頂欄緊貼手機狀態欄下方，無多餘空白。
  - 頂欄背景改為半透明：`rgba(255, 255, 255, 0.95)`，不完全遮擋狀態欄。
  - 添加 `<meta name="theme-color" content="transparent">`，Android 狀態欄透明顯示。
  - `body` 背景設為 `transparent`，可透視手機時間/電量圖標。
- 2025-12-11 11:26 - 聊天室完整還原（匹配原版截圖）
  - 聊天室顶部样式：半透明灰色 `rgba(230, 230, 230, 0.85)` + 毛玻璃效果。
  - 返回按鈕：`‹`（28px，左對齊）。
  - 菜單按鈕：`≡`（28px，右對齊）。
  - 會話名稱居中顯示。
  - 輸入區完整還原：🎙 麥克風 + 圓角輸入框（白色背景+灰邊框）+ "發送"（黑底白字 `#1a1a1a`）。
  - 底部輸入區背景：半透明灰色 `rgba(240, 240, 240, 0.95)` + 安全區適配。
- 2025-12-11 14:53 - UI 細節調整與輸入框優化
  - 修復下拉菜單位置：頭像/「+」按鈕菜單現在出現在按鈕下方（4px 間隙），不再遮擋按鈕本身。
  - 「+」按鈕菜單改為右對齊，避免被手機邊框切掉部分內容。
  - 聊天室頂部優化：減少頂部灰色區域高度（padding 從 8px 降至 4px/2px），改用 min-height: 36px，匹配原版緊湊設計。
  - 輸入框尺寸調整：輸入框高度增至 40px，語音按鈕 36px，發送按鈕增大（10px 20px），字體/圓角相應調整，匹配原版設計。
- 2025-12-11 15:06 - 聊天設置功能實現
  - 移除臨時的下拉菜單，改為完整的聊天設置彈窗（模態窗口），匹配原版設計。
  - 新增聊天設置彈窗：包含氣泡顏色、字體顏色、聊天壁紙設置，並提供實時預覽。
  - 實現隨機配色功能：一鍵生成隨機氣泡和字體顏色組合。
  - 設置持久化：將設置保存到 localStorage，按會話獨立存儲，切換會話自動應用對應設置。
  - 新增 ChatStore 方法：`getSessionSettings`、`setSessionSettings`、`clearMessages`、`switchSession`。
  - 添加 CSS 樣式到 `qq-legacy.css`：完整的彈窗樣式系統（遮罩層、標題欄、內容區、按鈕等）。
  - 聊天室菜單按鈕（≡）點擊打開設置彈窗，替代原下拉菜單。

- 2025-12-11 16:17 - API 串接功能实现（支持多个 LLM 服务商）
  - 新增 Google Gemini provider：完整支持 Google AI Studio 和 Vertex AI。
    - 实现消息格式转换（OpenAI 格式 → Gemini 格式）
    - 支持流式和非流式生成
    - 支持系统指令（systemInstruction）
    - 安全设置配置（GEMINI_SAFETY）
    - 模型列表获取
    - 健康检查
  - 新增 Deepseek provider：基于 OpenAI 兼容 API。
    - 继承 OpenAIProvider，设置默认 baseUrl 和模型
    - 支持所有 OpenAI 兼容功能（流式、非流式、模型列表等）
  - 更新 LLMClient：支持 5 种服务商（OpenAI、Gemini、Deepseek、Anthropic、Custom）。
  - 更新配置面板：
    - 服务商下拉菜单新增 Google Gemini 和 Deepseek 选项
    - 不同服务商自动切换默认配置（baseUrl、model、帮助文本）
    - 支持实时切换并更新占位符
  - 技术细节：
    - Gemini API 使用不同的消息格式（contents + systemInstruction）
    - 支持 Google AI Studio（API Key in URL）和 Vertex AI（Authorization header）
    - Deepseek 完全兼容 OpenAI API 格式
  - 文件修改：
    - 新增：`src/scripts/api/providers/gemini.js`（~300行）
    - 新增：`src/scripts/api/providers/deepseek.js`（~50行）
    - 修改：`src/scripts/api/client.js`（导入新 providers）
    - 修改：`src/scripts/ui/config-panel.js`（更新服务商选项和默认配置）

- 2025-12-11 18:00 - API 配置增强与安全存储（分离 Vertex AI 和 AI Studio）
  - **重大重构**：参考 SillyTavern 的安全存储方案，实现 API 配置增强。
  - 分离 Google Gemini 服务商为两个独立选项：
    - **Google AI Studio (Makersuite)**：使用 API Key 在 URL 参数中认证
    - **Google Vertex AI**：支持两种认证模式
      - 快速模式：使用 API Key（Authorization: Bearer）
      - 完整模式：使用 Service Account JSON（OAuth2 + Bearer token）
  - 实现 API Key 安全存储与掩码显示：
    - 保存后显示为 `••••••••••••••••`，保护敏感信息
    - 用户聚焦输入框时自动清空，便于修改
    - 原始 Key 存储在 `dataset.originalKey`，提交时使用实际值
    - Service Account JSON 同样支持掩码显示
  - 自动填写 Base URL 和模型：
    - 选择服务商时自动填写对应的 Base URL 和默认模型
    - 智能判断：如果当前值为空或为其他服务商的默认值，才自动填写
    - 避免误覆盖用户自定义配置
  - Vertex AI 专属配置字段（条件显示）：
    - **Project ID**：GCP 项目 ID（必填）
    - **Region**：5 个常用区域选项（us-central1、us-east1、us-west1、europe-west1、asia-southeast1）
    - **Service Account JSON**：完整模式认证（可选，支持掩码显示/隐藏切换）
  - 配置面板 UI 优化：
    - 动态字段可见性：选择 Vertex AI 时显示专属字段，其他服务商隐藏
    - 帮助文本自动更新：根据选择的服务商显示不同的提示
    - 添加显示/隐藏按钮：API Key 和 Service Account JSON 均支持切换显示
  - 技术实现细节：
    - Service Account JSON 认证需要后端支持（浏览器无法签署 RS256 JWT）
    - 当前实现会抛出友好错误，提示用户使用 AI Studio 或设置后端代理
    - Vertex AI Express 模式（API Key）可在前端直接使用
  - 文件修改：
    - 新增：`src/scripts/api/providers/makersuite.js`（~220行，AI Studio 专用）
    - 新增：`src/scripts/api/providers/vertexai.js`（~300行，Vertex AI 专用）
    - 修改：`src/scripts/api/client.js`（添加 makersuite 和 vertexai providers）
    - 重大修改：`src/scripts/ui/config-panel.js`（新增 Vertex AI 字段、掩码逻辑、自动填写、字段可见性控制）
  - 未来改进方向：
    - 可考虑实现后端代理以支持完整的 Service Account JSON 认证
    - 可考虑使用更安全的加密存储方案（如 Web Crypto API）
    - 可考虑添加配置导入/导出功能

- 2025-12-11 18:30 - 模型列表自动获取功能（仿 SillyTavern）
  - **新功能**：实现类似 SillyTavern 的模型列表自动获取和选择功能。
  - 将模型输入框改为**可输入的下拉选单**：
    - 使用 HTML5 `<datalist>` 元素实现
    - 用户可以手动输入模型 ID
    - 也可以从获取的模型列表中选择
    - 兼顾灵活性和便利性
  - 添加"⟳ 刷新列表"按钮：
    - 位于模型字段标签右侧
    - 点击后自动从 API 获取可用模型列表
    - 显示加载状态和进度提示
  - 智能验证：
    - 刷新前检查必填字段（Base URL、API Key）
    - Vertex AI 需要额外检查 Project ID
    - 缺少必填字段时给出友好提示
  - 实时反馈：
    - 获取中显示"正在从服务器获取可用模型列表..."
    - 成功后显示"已加载 N 个模型（可输入或从列表选择）"
    - 失败时显示错误信息并提示重试
    - 3-5 秒后自动恢复原始提示文本
  - 调用各 Provider 的 `listModels()` 方法：
    - OpenAI: 从 `/v1/models` 端点获取
    - Makersuite: 从 Google AI Studio API 获取
    - Vertex AI: 从 Vertex AI models 端点获取
    - Deepseek: 从 `/v1/models` 端点获取并过滤
    - Anthropic: 返回预定义的 Claude 模型列表
  - 用户体验优化：
    - 按钮加载状态（禁用+文字变化）
    - 彩色状态提示（蓝色加载、绿色成功、红色失败）
    - 自动恢复提示文本避免混淆
    - 保留用户手动输入能力
  - 文件修改：
    - 修改：`src/scripts/ui/config-panel.js`（新增 refreshModels 方法、UI 更新）

- 2025-12-11 18:45 - Vertex AI 优化与模型输入框改进
  - **Vertex AI Project ID 自动提取**：
    - 从 Service Account JSON 中自动提取 `project_id` 字段
    - 移除 Project ID 输入框（不再需要手动填写）
    - 简化配置流程，减少用户输入错误
    - 更新帮助文本："Project ID 会自动从 JSON 中提取"
  - **模型输入框视觉优化**：
    - 添加下拉箭头图标 (▼)，更符合下拉选单视觉习惯
    - 使用 `position: relative` 容器实现图标叠加
    - 保持完整的输入和选择功能
    - 右侧预留空间避免文字与图标重叠
  - **Vertex AI 配置验证优化**：
    - 刷新模型列表时检查 Service Account JSON（而非 Project ID）
    - 更准确的错误提示
  - 技术实现：
    - `VertexAIProvider` 构造函数中解析 Service Account JSON
    - 自动提取 `project_id` 字段并赋值
    - 保留 fallback 到 `config.vertexaiProjectId`（向后兼容）
  - 文件修改：
    - 修改：`src/scripts/api/providers/vertexai.js`（自动提取 Project ID）
    - 修改：`src/scripts/ui/config-panel.js`（移除 Project ID 字段、添加下拉箭头）

- 2025-12-14 18:30 - 連線設定檔重啟不可用修復 + 聊天室頂欄/輸入框樣式微調
  - **修復**：重啟後仍存在連線設定檔/Key，但因解密判斷錯誤導致 `apiKey` 變空、被判定「未配置」。
    - Keyring 記錄新增 `alg`（`aesgcm` / `b64`），避免把 base64 明文誤當 AES-GCM 密文解密。
    - 解密加入舊資料遷移：先試 AES-GCM，失敗才以「可打印 ASCII」判斷是否為 base64 明文並回填 `alg`。
    - `ensureStores()` 改為一次性初始化（不再依賴 `cryptoKey` 是否為 truthy），避免在無 WebCrypto 時反覆重建狀態。
    - master key 增加 localStorage fallback（僅供非 Tauri / dev 模式）。
  - **UI 微調**：聊天室頂欄與輸入框在部分 WebView 高度計算不穩定。
    - 移除頂欄對 `env()/clamp()` 的依賴，改為穩定的 padding/min-height。
    - 輸入框高度加大，消息列表預留底部空間同步調整。
  - 文件修改：
    - 修改：`src/scripts/storage/config.js`（Keyring alg/解密遷移/初始化修復）
    - 修改：`src/assets/css/qq-legacy.css`（聊天室頂欄/輸入框/間距調整）

- 2025-12-14 18:55 - 修復配置面板「已填但仍提示請填寫」的取值/校驗問題
  - **修復**：保存/测试时改为从面板自身 DOM 取值，并在移动端先 `blur()` 以提交输入法组合文本，避免读到空值。
  - **优化**：保存时不再依赖运行时解密到的 `apiKey` 才允许保存；若已通过 🔑 保存过 Key 也允许保存。
  - **提示**：若保存后仍无法取得可用 Key，将提示「请用 🔑 重新保存 Key」并不自动关闭弹窗。
  - 文件修改：
    - 修改：`src/scripts/ui/config-panel.js`

- 2025-12-14 20:10 - 新增「预设（Preset）」入口与 ST 风格 prompt 预设（sysprompt/context/instruct）
  - **新功能**：头像下拉选单新增「🎛 预设」，提供 SillyTavern 风格的预设管理面板（选择/编辑/新建/重命名/删除）。
  - **内置默认预设**：打包 SillyTavern 的默认 `sysprompt` / `context` / `instruct` 预设（用于离线与移动端）。
  - **接入 prompt 构建**：
    - 启用 `sysprompt` 时，将其 `content` 注入到 `context.story_string` 的 `{{system}}` 变量（并支持 `{{char}}/{{user}}` 替换）。
    - 启用 `context` 时，根据 `story_string_position`（IN_PROMPT/IN_CHAT/BEFORE_PROMPT）决定注入位置。
    - `sysprompt.post_history` 参照 ST 作为「历史后指令」以 user message 形式追加（jailbreak-like）。
  - 文件修改：
    - 新增：`src/assets/presets/st-defaults.json`
    - 新增：`src/scripts/storage/preset-store.js`
    - 新增：`src/scripts/ui/preset-panel.js`
    - 修改：`src/index.html`（settings menu 增加 preset）
    - 修改：`src/scripts/ui/app.js`（接入 preset 面板入口；生成时传入 user/char/history 上下文）
    - 修改：`src/scripts/ui/bridge.js`（prompt 构建接入 preset）

- 2025-12-14 20:40 - 预设面板可滚动 + 生成参数（OpenAI Preset）接入
  - **UI 修复**：预设面板改为全屏安全边距布局，内容区 `flex:1` 可滚动，避免在手机上显示不完整。
  - **生成参数**：新增「生成参数」tab，内置 SillyTavern 的 `openai/Default.json`（完整字段可编辑）。
  - **实际生效**：发送请求时会按 provider 映射常用生成参数：
    - OpenAI/Deepseek/Custom：`temperature/top_p/max_tokens/presence_penalty/frequency_penalty/seed/n`
    - Gemini/Makersuite/VertexAI：映射为 `generationConfig` 所需的 `temperature/top_p/top_k/maxTokens`
    - Anthropic：映射为 `maxTokens/temperature/top_p/top_k`
  - 文件修改：
    - 修改：`src/scripts/ui/preset-panel.js`（可滚动布局 + tab）
    - 修改：`src/scripts/storage/preset-store.js`（新增 `openai` 类型）
    - 修改：`src/assets/presets/st-defaults.json`（新增 `openai.Default`）
    - 修改：`src/scripts/ui/bridge.js`（生成参数注入到请求 options）

- 2025-12-14 20:45 - 预设面板 ST 化（纯文本/表单）+ 隐藏 marker 模块内容
  - **UI 修复**：预设面板改为 `top/left/right/bottom` 固定布局并扩大顶部间距，解决手机上方被状态栏覆盖与无法滚动的问题。
  - **ST 风格编辑**：不再用 JSON 编辑器，改为与 ST 类似的表单：
    - `sysprompt`：`content` / `post_history` 纯文本编辑
    - `context`：`story_string` 纯文本 + 注入位置/深度/角色 + 常用开关
    - `instruct`：序列/开关（当前仅保存，后续可扩展为完整 instruct mode）
    - `openai`：常用生成参数输入框 + 仅展示可编辑 prompts（隐藏 `chatHistory/worldInfo/...` 等 marker）
  - **prompt 构建**：当启用 `openai` 预设时，优先使用其可编辑 prompts：
    - `main` 作为系统提示词来源（覆盖 sysprompt）
    - `nsfw` / `enhanceDefinitions` 作为附加 system prompts
    - `jailbreak` 作为 post-history 指令（user message 形式追加）
  - 文件修改：
    - 修改：`src/scripts/ui/preset-panel.js`
    - 修改：`src/scripts/ui/bridge.js`

- 2025-12-14 21:00 - 修复预设面板被顶栏/底栏遮挡导致“被切掉”
  - 将 `#preset-overlay/#preset-panel` 的 `z-index` 提升到高于 `.topbar`/`.bottom-nav`，使弹窗覆盖全屏不再被遮挡。
  - 文件修改：
    - 修改：`src/scripts/ui/preset-panel.js`

- 2025-12-14 21:01 - 预设面板顶部空白优化 + 导入/导出预设设定档
  - **UI 优化**：将 safe-area 处理从面板内部 padding 改为 `top/left/right/bottom` 的 `calc(... + env(safe-area-inset-*))`，去掉顶部多余白色空白。
  - **导入/导出**：
    - 支持导出当前预设（按当前 tab）为 JSON 文件
    - 支持导出全部预设设定档（包含所有类型、启用状态、当前选中项）
    - 支持导入单个预设 JSON（自动识别类型：sysprompt/context/instruct/openai）
    - 支持导入整套预设设定档（可选覆盖或合并）
  - **持久化**：导入后立即落盘，重启 app 自动加载上次保存的预设配置。
  - 文件修改：
    - 修改：`src/scripts/ui/preset-panel.js`
    - 修改：`src/scripts/storage/preset-store.js`

- 2025-12-14 21:05 - OpenAI 预设：区块式 Prompt Manager（拖拽排序/自定义区块）并按顺序构建提示词
  - **ST 风格区块**：在「生成参数」tab 以 `prompt_order` 渲染所有区块（含 marker），支持拖拽调整顺序、启用/禁用、并可新增自定义区块。
  - **导入可见**：导入带 `prompts/prompt_order` 的 ST OpenAI 预设后，会直接显示对应区块。
  - **构建方式**：生成时若启用 OpenAI 预设且存在 `prompt_order`，则按区块顺序拼接 messages，并在 `chatHistory` marker 位置插入历史消息。
  - **当前差异**：未实现 ST 的 token 预算裁剪/对话示例注入/系统消息压缩等高级逻辑（后续可逐步补齐）。
  - 文件修改：
    - 修改：`src/scripts/ui/preset-panel.js`
    - 修改：`src/scripts/ui/bridge.js`

- 2025-12-14 21:18 - 预设面板：新增「自定义」tab + 区块默认折叠 + 防止保存时清空区块
  - **自定义 Tab**：新增「自定义」tab 专门放 ST 的 Prompt Manager 区块（导入/新增的可编辑区块都在这里），「生成参数」tab 只保留常用生成参数。
  - **默认折叠**：区块默认折叠，点击区块头部展开/收起（marker 区块仅显示提示，不显示内容编辑）。
  - **导入体验**：导入 OpenAI 预设后自动切到「自定义」tab；从「自定义」导出会正确导出 OpenAI 预设。
  - **关键修复**：修复在「生成参数」tab 点击保存会把 `prompt_order` 清空导致区块“消失”的问题。
  - **显示修复**：弹窗高度改用 `100dvh`（带 `100vh` fallback），避免手机上方/下方被切掉。
  - 文件修改：
    - 修改：`src/scripts/ui/preset-panel.js`

- 2025-12-14 21:28 - 预设区块禁用灰化 + 预设绑定 API 连接配置（profile）
  - **区块灰化**：Prompt blocks 未启用时整体呈灰色，方便区分启用/禁用状态。
  - **绑定连接配置**：在「生成参数/自定义」保存预设时，会记录当前 API 连接 profile id；切换预设时自动切换到绑定的 profile 并更新 LLM client。
  - **启动加载**：App 初始化时若启用该预设且其绑定了 profile，会优先加载绑定的连接配置，避免重启后提示“未配置”。
  - 文件修改：
    - 修改：`src/scripts/ui/preset-panel.js`
    - 修改：`src/scripts/ui/bridge.js`

- 2025-12-14 21:50 - 正规表达式（正则）三种作用域：全局 / 局部（绑定预设/世界书）/ 聊天室
  - **入口**：
    - 点击头像菜单新增「正规表达式」：管理全局/局部正则
    - 聊天室右上角「三」菜单新增「正规表达式」：管理该聊天室独立正则
  - **作用域**：
    - 全局正则：始终生效
    - 局部正则：绑定到特定预设或世界书，切换到对应对象时自动生效
    - 聊天室正则：仅在当前会话生效
  - **生效时机**：输入（发送前）/输出（显示前）/两者可选；输入在 `AppBridge.generate()` 构建 messages 前处理，输出在非流式返回前与流式保存历史时处理（UI 流式结束时会同步刷新为处理后的结果）。
  - 文件修改：
    - 新增：`src/scripts/storage/regex-store.js`
    - 新增：`src/scripts/ui/regex-panel.js`
    - 新增：`src/scripts/ui/regex-session-panel.js`
    - 修改：`src/index.html`
    - 修改：`src/scripts/ui/app.js`
    - 修改：`src/scripts/ui/bridge.js`

- 2025-12-14 22:11 - 世界书全局作用域入口 + 导入时自动带入绑定正则
  - **全局世界书**：头像菜单新增「世界书」，打开的世界书为全局通用作用域（不影响聊天室内单独世界书管理）。
  - **Prompt 构建**：发送时会同时注入「全局世界书」与「当前会话世界书」（若两者都启用）。
  - **导入联动**：导入预设/世界书 JSON 若包含 `boundRegexSets`，会自动导入并绑定对应对象，同时启用。
  - 文件修改：
    - 修改：`src/index.html`
    - 修改：`src/scripts/ui/app.js`
    - 修改：`src/scripts/ui/bridge.js`
    - 修改：`src/scripts/ui/world-panel.js`
    - 修改：`src/scripts/ui/preset-panel.js`

- 2025-12-14 22:11 - 预设导入：兼容 ST 的 RegexBinding 自动导入
  - **问题修复**：部分 ST 预设将绑定正则存放在 `RegexBinding.regexes`（可能嵌在 `SPreset` 或塞在 `prompts[n].content` 的 JSON 字符串里），之前未识别导致导入后正则未同步。
  - **现在行为**：导入预设时若检测到 `RegexBinding.regexes`，会自动转换为局部正则集合并绑定到该预设，且默认启用（单条脚本遵循其 `disabled` 状态）。
  - 文件修改：
    - 修改：`src/scripts/ui/preset-panel.js`
    - 修改：`src/scripts/storage/regex-store.js`
    - 修改：`src/scripts/ui/regex-panel.js`
    - 修改：`src/scripts/ui/regex-session-panel.js`

- 2025-12-14 22:21 - 正则导入体验优化：规则默认折叠 + 导入确认 + 去重
  - **折叠**：全局/局部/聊天室正则规则与预设区块一致，默认折叠，点击标题展开编辑。
  - **导入确认**：导入预设/世界书若检测到绑定正则，会弹窗询问是否一并导入；取消则仅导入预设/世界书。
  - **去重**：导入时会跳过与现有正则“完全相同”的规则（按 `when/pattern/flags/replacement` 判定），避免重复导入。
  - 文件修改：
    - 修改：`src/scripts/ui/regex-panel.js`
    - 修改：`src/scripts/ui/regex-session-panel.js`
    - 修改：`src/scripts/ui/preset-panel.js`
    - 修改：`src/scripts/ui/world-panel.js`
    - 修改：`src/scripts/storage/regex-store.js`

- 2025-12-14 22:55 - UI 文案 + 预设生成参数补全
  - **头像菜单**：将「设定」改为「API设定」。
  - **生成参数**：新增最大上下文长度（拉条）与最大输出 token（`openai_max_context/openai_max_tokens`）。
  - 文件修改：
    - 修改：`src/index.html`
    - 修改：`src/scripts/ui/preset-panel.js`

- 2025-12-14 23:17 - 聊天体验：时间戳修复 + 好友头像/设置入口
  - **时间戳**：修复使用 `toLocaleTimeString().slice(0,5)` 导致「下午 7:4」被截断的问题，统一改为 `hour/minute` 格式化。
  - **添加好友头像**：添加好友时可选择头像（本地图片），保存到联系人资料并用于聊天列表/聊天头像。
  - **好友设置**：点击聊天室标题弹出下拉菜单，新增「设置」打开好友设置面板，可修改头像与显示名称（不改会话 ID）。
  - 文件修改：
    - 修改：`src/index.html`
    - 新增：`src/scripts/ui/contact-settings-panel.js`
    - 修改：`src/scripts/ui/app.js`
    - 修改：`src/scripts/ui/session-panel.js`
    - 修改：`src/scripts/ui/chat/chat-ui.js`

- 2025-12-14 23:36 - 头像存储稳定性 + GIF 支持 + 流式 UI 修复 + 世界书绑定正则生效
  - **头像压缩**：添加好友/好友设置选择头像时，非 GIF 图片会自动压缩（缩放+质量控制）后保存，减少 `exceeds quota` 发生概率。
  - **GIF 头像**：GIF 头像不做 canvas 转换，保留动图效果（依赖 `save_kv` 持久化，localStorage 仅尽力写入）。
  - **联系人存储健壮性**：联系人持久化改为优先 `save_kv`，localStorage 写入失败（配额不足）时不会阻断保存。
  - **正则作用域**：世界书绑定的局部正则在「全局世界书」启用时也能正确生效（regex ctx 增加 `worldIds`）。
  - **流式多余点修复**：流式发送不再同时渲染「打字指示器 + 空白流式气泡」，改为单一流式气泡内显示跳动动画，避免多出一个小点。
  - 文件修改：
    - 新增：`src/scripts/utils/image.js`
    - 修改：`src/scripts/storage/contacts-store.js`
    - 修改：`src/scripts/ui/session-panel.js`
    - 修改：`src/scripts/ui/contact-settings-panel.js`
    - 修改：`src/scripts/ui/bridge.js`
    - 修改：`src/scripts/storage/regex-store.js`
    - 修改：`src/scripts/ui/chat/chat-ui.js`
    - 修改：`src/scripts/ui/app.js`

- 2025-12-15 00:16 - 正则系统对齐 ST：预设绑定生效 + 完整选项 + 暂时性语义
  - **预设/世界书绑定正则生效**：切换到绑定对象时自动启用，并按 ST 逻辑作用于 AI 气泡显示与 prompt 构建。
  - **ST 完整字段**：支持 Affects(placement)、Disabled、Run On Edit、Min/Max Depth、Find Regex 宏替换（不替换/raw/escaped）、Trim Out、Ephemerality（仅影响显示/仅影响 prompt）。
  - **暂时性语义**：不勾选暂时性时视为“直接改存档内容”（保存到 `raw`）；勾选“仅影响显示”时只改 `content` 显示；勾选“仅影响 prompt”只在构建 prompt 时生效。
  - **自动重渲染**：修改正则/切换预设/切换世界书后，当前聊天室会基于 `raw` 自动重算显示文本；编辑用户消息时尊重 Run On Edit。
  - 文件修改：
    - 修改：`src/scripts/storage/regex-store.js`
    - 修改：`src/scripts/ui/bridge.js`
    - 修改：`src/scripts/ui/app.js`
    - 修改：`src/scripts/ui/preset-panel.js`
    - 修改：`src/scripts/ui/world-panel.js`
    - 修改：`src/scripts/ui/regex-panel.js`
    - 修改：`src/scripts/ui/regex-session-panel.js`

- 2025-12-15 00:22 - 修复移动端无法点击：避免 worldinfo-changed 事件递归
  - **问题**：worldinfo-changed 事件触发重渲染时再次调用 `setActiveSession()`，导致事件递归触发，页面卡死按钮无法点击。
  - **修复**：重渲染当前会话不再调用 `setActiveSession()`，仅重算显示并刷新列表。
  - 文件修改：
    - 修改：`src/scripts/ui/app.js`

- 2025-12-15 00:31 - 修复 Android 真机白屏/不可点击：regex-store.js 正则字面量语法错误
  - **问题**：`src/scripts/storage/regex-store.js` 中把 ST 的 `/(\/?)(.+)\1([a-z]*)/i` 误写成包含未转义 `/` 的形式，Android WebView 直接抛 `Invalid regular expression`，导致脚本中断、UI 按钮无法点击。
  - **修复**：对齐 ST 原实现（regexFromString + flags 校验 + 宏替换正则），并修正 `replace` 回调绑定写法，避免语法错误。
  - 文件修改：
    - 修改：`src/scripts/storage/regex-store.js`

- 2025-12-15 00:41 - 聊天气泡支持「酒馆助手」风格代码块渲染：HTML iframe 预览
  - **代码块渲染**：聊天文本支持解析 fenced code block（```lang），以安全方式渲染为代码卡片（可复制）。
  - **HTML 呈现**：当代码块为 HTML（或内容包含 `<body>...</body>`）时，提供沙盒 iframe 预览并自动自适应高度；若整段消息本身就是 HTML 文档也会自动按 HTML 代码块处理。
  - **流式兼容**：流式生成过程中保持纯文本更新，结束后再进行代码块/iframe 渲染，避免卡顿。
  - 文件修改：
    - 新增：`src/scripts/ui/chat/rich-text-renderer.js`
    - 修改：`src/scripts/ui/chat/chat-ui.js`

- 2025-12-15 00:49 - HTML 片段也可渲染（不再仅限 <body> 文档）
  - **问题**：部分正则会把 `<thinking>` 替换为 `<style>...` + `<details>/<div>` 的 HTML 片段（不包含 `<body>`），之前因仅识别 `<body>` 导致无法渲染。
  - **修复**：当整段消息明显是 HTML 片段（以 `<` 开头且含 style/details/div 等并有闭合标签）时，自动按 `html` 代码块处理并打开 iframe 预览。
  - 文件修改：
    - 修改：`src/scripts/ui/chat/rich-text-renderer.js`

- 2025-12-15 00:55 - iframe 预览自适配手机宽度（更美观，不易溢出）
  - **基础样式**：在 iframe 内注入 `max-width:100%`、图片/表格响应式、默认 padding 等样式，减少超出手机屏幕的问题。
  - **自动适配**：检测内容横向溢出时自动缩放（最低 0.78），仍溢出则允许横向滚动，尽量兼顾可读性与不超宽。
  - 文件修改：
    - 修改：`src/scripts/ui/chat/rich-text-renderer.js`

- 2025-12-15 01:02 - iframe 手机排版进一步贴近 ST：不再出现超长横向滚动 + 隐藏源码区块
  - **横向滚动**：改为移动端优先，强制避免长横向滚动；溢出时自动缩放到更低阈值（最低 0.55）并保持 `overflow-x:hidden`。
  - **隐藏源码**：HTML 预览默认只显示渲染结果，不再显示黑底源码；需要时可点「代码」切换查看。
  - 文件修改：
    - 修改：`src/scripts/ui/chat/rich-text-renderer.js`

- 2025-12-15 01:20 - 代码渲染区长按可呼出菜单：移除内嵌按钮，代码/复制移入长按菜单
  - **长按可点到 iframe**：HTML iframe 预览内的按压事件会转发到外层聊天 UI，长按渲染区域也能弹出消息菜单（不必再点气泡边缘）。
  - **移除内嵌工具条**：去掉代码块内的「预览/代码/复制」工具条与黑底源码重复显示；HTML 预览默认只显示渲染结果。
  - **菜单新增动作**：长按代码块时菜单增加「代码」「复制」，其中「代码」会打开全屏代码查看器（自动换行，避免超长横向滚动）。
  - 文件修改：
    - 修改：`src/scripts/ui/chat/rich-text-renderer.js`
    - 修改：`src/scripts/ui/chat/chat-ui.js`

- 2025-12-15 08:41 - 长按更稳定 + 代码编辑保存后即时套用正则并重渲染
  - **长按稳定性**：聊天气泡与 iframe 渲染区域禁用系统文字选取/长按菜单，并增加 contextmenu 转发与滑动取消阈值，减少“长按只选中文字”的情况。
  - **菜单消失**：点击 iframe 内区域也会像点击外部一样关闭菜单（通过 iframe down 事件转发实现）。
  - **原回复编辑**：长按代码块点「代码」会打开“原回复”编辑器（未套用正则），保存后会对内容重新套用正则并立即更新气泡/iframe 渲染。
  - 文件修改：
    - 修改：`src/assets/css/qq-legacy.css`
    - 修改：`src/scripts/ui/chat/rich-text-renderer.js`
    - 修改：`src/scripts/ui/chat/chat-ui.js`
    - 修改：`src/scripts/ui/app.js`

- 2025-12-15 09:13 - 切换到“对话模式”准备：停用创意写作输出链路 + 增加对话提示词入口与注入
  - **停用创意写作链路（保留注释）**：将 AI 输出的 display 正则替换与富文本/iframe 渲染逻辑注释掉并标记“创意写作模式”，当前改为纯文本显示，方便后续按 <content>/msg_start 协议解析分流。
  - **预设新增对话提示词**：在预设面板增加「对话提示词」tab（保存于 sysprompt 预设），可粘贴 `手机流式.html` 的规则提示词并独立启用。
  - **prompt 注入位置/深度**：对话提示词支持 ST 风格的注入位置（BEFORE_PROMPT / IN_PROMPT / IN_CHAT / NONE）与 IN_CHAT 深度/角色配置；构建 prompt 时按相同语义注入到消息列表中。
  - 文件修改：
    - 修改：`src/scripts/ui/app.js`
    - 修改：`src/scripts/ui/chat/chat-ui.js`
    - 修改：`src/scripts/ui/preset-panel.js`
    - 修改：`src/scripts/ui/bridge.js`

- 2025-12-15 09:31 - 搬运“私聊对话提示词”：默认启用并自动注入聊天室 prompt（移除群聊/动态/主动消息）
  - **默认私聊协议提示词**：把 `手机流式.html` 中私聊相关的输出协议/节奏约束整理为“对话提示词”，仅保留私聊（去掉群聊、动态、评论、主动发起等内容），并要求输出 `msg_start...msg_end` + `<{{user}}和{{char}}的私聊>` 格式。
  - **自动启用**：对话提示词在 sysprompt 预设中默认 `启用`，聊天发送时自动注入到 prompt（用户可在预设面板的「对话提示词」tab 中修改/关闭）。
  - **变量对齐**：对话宏 `{{user}}` 默认使用“我”，与当前聊天 UI 一致（后续可扩展为用户昵称）。
  - 文件修改：
    - 修改：`src/scripts/storage/preset-store.js`
    - 修改：`src/scripts/ui/app.js`

- 2025-12-15 09:58 - 实作对话模式“流式解析”雏形：只捕获完整有效标签并分条输出到聊天室
  - **简化解析器**：新增流式解析器，仅忽略 `<thinking>`，聚焦 `<content>`，并在捕获到完整的私聊标签 `<{{user}}和{{char}}的私聊>...</...>` 后再输出（不逐字显示原文）。
  - **分条气泡输出**：私聊标签内部按行解析（优先 `-` 开头），每一行作为一条独立气泡；支持 `[img-]`/`[yy-]`/`[music-]` 等特殊消息格式。
  - **流式体验**：在捕获到第一个完整有效标签前只显示“等待回复”动画；每次输出后继续显示等待动画直到流结束。
  - **提示词同步**：默认私聊对话提示词更新为 `<content> + 私聊标签 + - 行` 协议，并对旧版 `msg_start` 协议做自动迁移（仅当检测到旧规则且未包含 `<content>`）。
  - 文件修改：
    - 新增：`src/scripts/ui/chat/dialogue-stream-parser.js`
    - 修改：`src/scripts/ui/app.js`
    - 修改：`src/scripts/storage/preset-store.js`

- 2025-12-15 10:08 - 修复对话模式私聊分流误建同名会话：优先路由到当前会话/已存在联系人
  - **问题**：解析到 `<{{user}}和{{char}}的私聊>` 后把 `{{char}}` 当作会话 id，导致在当前会话 id 与显示名不同（或含空格差异）时误创建同名联系人/会话，并把回复写入新会话。
  - **修复**：对私聊标签的目标会话进行解析：若标签指向当前聊天对象（按当前会话的联系人名/id 比对）则写回当前会话；否则优先匹配已存在联系人（按 name 精确匹配）并复用其 id，避免重复创建。
  - 文件修改：
    - 修改：`src/scripts/ui/app.js`

- 2025-12-15 10:38 - 对话模式更严格 + 动态（Moments）基础实现
  - **更严格分流**：若私聊标签无法匹配“当前会话/已存在联系人”，不再自动新建同名会话，视为回覆格式错误并丢弃。
  - **动态存储/渲染**：新增动态存储 `MomentsStore` 并把 `moments-page` 的列表改为真实渲染（支持查看详情与本地添加评论）。
  - **动态解析**：对话流式解析器新增对 `moment_start...moment_end` 与 `moment_reply_start...moment_reply_end` 的识别（在 `<content>` 内），解析后写入动态列表；流式/非流式均可处理。
  - 文件修改：
    - 修改：`src/scripts/ui/app.js`
    - 修改：`src/scripts/ui/chat/dialogue-stream-parser.js`
    - 新增：`src/scripts/storage/moments-store.js`
    - 新增：`src/scripts/ui/moments-panel.js`
    - 修改：`src/index.html`

- 2025-12-15 10:44 - 搬运动态提示词并拆分提示词页签：私聊提示词 + 动态提示词（注入位置/深度可配）
  - **页签拆分**：将原“对话提示词”页签更名为「私聊提示词」，新增「动态提示词」页签。
  - **动态提示词搬运**：把 `手机流式.html` 的 QQ空间/动态格式介绍迁移为默认动态提示词，并适配到 `<content>` 内输出（moment_start/moment_reply_*）。
  - **注入语义对齐**：动态提示词与私聊提示词一样，支持 ST 风格注入位置（BEFORE_PROMPT/IN_PROMPT/IN_CHAT/NONE）与 IN_CHAT 深度/角色；默认深度为 0（与原文件“深度=0”一致），默认不启用，避免影响纯私聊聊天。
  - 文件修改：
    - 修改：`src/scripts/ui/preset-panel.js`
    - 修改：`src/scripts/storage/preset-store.js`
    - 修改：`src/scripts/ui/bridge.js`

- 2025-12-15 10:50 - 聊天提示词改为同一页签区块：私聊/动态共用 tab（默认折叠）+ 动态评论规则注释
  - **UI 调整**：将「私聊提示词」「动态提示词」合并为一个 tab「聊天提示词」，内部以两个区块呈现（样式对齐“自定义”区块，默认折叠，点击展开；禁用时整体灰化）。
  - **动态提示词调整**：将动态的“评论/评论回复”相关规则注释（后续再做评论系统），并对旧默认规则做自动迁移（不覆盖用户自定义）。
  - 文件修改：
    - 修改：`src/scripts/ui/preset-panel.js`
    - 修改：`src/scripts/storage/preset-store.js`

- 2025-12-15 11:08 - 动态提示词补齐动态发布决策（momentCreationTask）
  - **搬运 momentCreationTask**：将 `手机流式.html` 的 `momentCreationTask`（动态发布决策：时机/概率/性格/输出规则）加入默认动态提示词中，用于让模型决定何时输出 `moment_start...moment_end`。
  - **默认规则迁移**：若用户仍使用旧版默认动态提示词（不含动态发布决策段落），自动迁移为新版（不覆盖用户自定义内容）。
  - 文件修改：
    - 修改：`src/scripts/storage/preset-store.js`

- 2025-12-15 11:24 - 世界书管理支持“新增”世界书并按作用域自动绑定启用
  - **新增按钮**：世界书管理面板添加「新增」，可输入名称后创建空白世界书并立刻打开编辑器。
  - **会话/全局区分**：从聊天室右上角「三」打开的世界书管理，新增后自动绑定并启用到当前会话；从头像菜单打开的世界书管理（全局），新增后自动全局启用。
  - 文件修改：
    - 修改：`src/scripts/ui/world-panel.js`

- 2025-12-15 11:39 - 动态头像/评论交互对齐手机流式：按联系人头像渲染 + 评论折叠 + 三点菜单
  - **头像来源修复**：动态作者头像优先从联系人资料匹配（按 name/id 精确与去空格小写匹配），并支持「我/用户」回退到用户头像。
  - **评论折叠**：评论超过 8 条时默认折叠，仅显示最新 8 条；支持「展开查看更多评论 / 收起评论」。
  - **三点菜单**：动态右上角「⋯」弹出下拉菜单（删除/取消），交互与旧版 `手机流式.html` 接近。
  - 文件修改：
    - 修改：`src/scripts/ui/moments-panel.js`
    - 修改：`src/scripts/storage/moments-store.js`
    - 修改：`src/scripts/ui/app.js`
    - 修改：`src/assets/css/main.css`

- 2025-12-15 11:45 - 动态头像再修复：落盘 authorId 并渲染优先使用绑定联系人头像
  - **authorId 绑定**：动态写入 store 时根据作者名解析匹配联系人 id（支持模糊/子串），并落盘为 `authorId`，避免名称变更导致匹配失败。
  - **渲染优先级**：动态渲染时优先用 `authorId -> 联系人.avatar`，回退到按作者名匹配与默认头像。
  - 文件修改：
    - 修改：`src/scripts/ui/app.js`
    - 修改：`src/scripts/storage/moments-store.js`
    - 修改：`src/scripts/ui/moments-panel.js`

- 2025-12-15 11:59 - 动态头像三修：落盘 authorAvatar 快照 + 更强名称归一 + 自动回填旧动态
  - **authorAvatar 快照**：动态入库时会把匹配到的头像写入 `authorAvatar`，渲染优先使用该快照，避免任何名称匹配偏差。
  - **归一规则增强**：作者名归一仅保留字母/数字/CJK，过滤 emoji/符号，提升与联系人名称匹配成功率。
  - **旧动态回填**：渲染时若检测到旧动态缺少 `authorAvatar`，会按当前联系人信息回填一次并持久化。
  - 文件修改：
    - 修改：`src/scripts/ui/app.js`
    - 修改：`src/scripts/storage/moments-store.js`
    - 修改：`src/scripts/ui/moments-panel.js`

- 2025-12-15 12:10 - 对齐手机流式“发言人”头像绑定：动态作者占位符自动归一为当前聊天对象
  - **作者名归一**：当动态作者为“发言人/角色/角色名/作者”等占位符时，写入动态时自动替换为当前聊天对象名，避免后续头像匹配失败。
  - 文件修改：
    - 修改：`src/scripts/ui/app.js`

- 2025-12-15 12:53 - 聊天室加入“原始回复”查看：显示最新一轮完整模型输出
  - **入口**：聊天室右上角「三」菜单新增「🧾 原始回复」。
  - **存储**：每次生成后按会话保存最新一轮原始输出（流式/非流式均覆盖），并做长度上限截断以降低配额风险。
  - **面板**：新弹窗显示完整原始文本（可滚动），支持一键复制。
  - **稳定性**：ChatStore 写入 localStorage 增加 try/catch，避免配额异常导致前端崩溃/按钮失灵。
  - 文件修改：
    - 修改：`src/index.html`
    - 修改：`src/scripts/ui/app.js`
    - 修改：`src/scripts/storage/chat-store.js`

- 2025-12-15 13:02 - 动态头像兜底对齐“当前会话人格”：记录 originSessionId 并用于头像回退
  - **原因**：动态作者名可能与联系人记录不一致（别名/翻译/符号差异），导致仅靠作者名匹配失败而回退默认头像。
  - **修复**：动态写入时记录 `originSessionId`（本轮生成所在聊天室），渲染时若作者未匹配到联系人头像则回退使用 originSessionId 的联系人头像。
  - **旧数据回填**：渲染时若旧动态缺少 `originSessionId` 且已有 `authorId`，自动回填为 `authorId`。
  - 文件修改：
    - 修改：`src/scripts/ui/app.js`
    - 修改：`src/scripts/storage/moments-store.js`
    - 修改：`src/scripts/ui/moments-panel.js`

- 2025-12-15 13:29 - 修复动态重启丢失：加强磁盘持久化并避免写入巨大头像数据
  - **磁盘写入队列**：`save_kv` 改为串行队列写入并提供 `flush()`，避免短时间多次写入丢失/覆盖。
  - **生成后强制落盘**：在对话模式解析到动态后，生成结束会 `await momentsStore.flush()`，确保关闭 App 前已写入磁盘。
  - **减少体积**：动态条目不再持久化 `data:` 头像（base64/gif），避免 moments JSON 过大导致保存失败；渲染时继续从联系人头像获取。
  - 文件修改：
    - 修改：`src/scripts/storage/moments-store.js`
    - 修改：`src/scripts/ui/app.js`

- 2025-12-15 13:36 - 修复动态“评论”导致内容消失：MomentsStore.upsert 支持局部更新不覆盖原字段
  - **问题**：动态列表渲染时会做回填（originSessionId/authorAvatar 等），使用 `upsert({id,...})` 传入局部字段；旧实现会把未传字段默认写成空字符串，导致动态内容/作者等被覆盖为空。
  - **修复**：`upsert` 改为 patch-safe：仅当字段被显式提供时才覆盖，否则保留现有值；并在加载/写入前统一剔除 `data:` 头像以降低存储体积。
  - 文件修改：
    - 修改：`src/scripts/storage/moments-store.js`

- 2025-12-15 15:29 - 动态评论功能启用：提示词取消注释 + <br> 正确换行 + 用户评论触发 AI 回复
  - **提示词**：动态提示词恢复“评论行/评论回复”规则，支持 `moment_reply_start/moment_reply_end`。
  - **渲染**：动态正文与评论内容把 `<br>` 渲染为换行（仅允许 `<br>`，其余仍转义防注入）。
  - **用户评论 -> AI 回复**：在动态点「评论」发送后，会调用模型生成 `moment_reply_*`（发布者必须回复+至少1名其他联系人参与），并可选追加私聊块；解析后写入动态/聊天室存储并落盘。
  - **互动数模拟**：评论触发时会对浏览/点赞做小幅随机增量，模拟社交软件变化。
  - 文件修改：
    - 修改：`src/scripts/storage/preset-store.js`
    - 修改：`src/scripts/ui/moments-panel.js`
    - 修改：`src/scripts/ui/app.js`

- 2025-12-15 15:50 - 动态评论长按删除 + 浏览/点赞按联系人数量 N 缩放
  - **长按删除评论**：动态评论支持长按弹出菜单，删除单条评论（不影响其他评论）。
  - **初始数值约束**：动态发布时强制保证 `浏览 < N*10`、`点赞 < N*2`（N=联系人数量，忽略群聊），超出则自动归一到范围内。
  - **评论后增长**：每次评论/回复后按 N 规模随机增加浏览与点赞（浏览增长明显快于点赞），模拟真实社交软件。
  - 文件修改：
    - 修改：`src/scripts/storage/moments-store.js`
    - 修改：`src/scripts/ui/moments-panel.js`
    - 修改：`src/scripts/ui/app.js`

- 2025-12-15 20:03 - 修复私聊标签含空格导致不显示 + DeepSeek Failed to fetch
  - **私聊解析**：对话解析器不再按空格截断 tagName，支持如 `<我和Lara croft的私聊>` 这类包含空格的标签；并把消息中的 `<br>` 转为换行。
  - **DeepSeek / 自定义 URL**：放宽 CSP `connect-src` 支持任意 `https:`/`http:` 域名请求，解决 WebView fetch 被 CSP 拦截导致的 `Failed to fetch`。
  - 文件修改：
    - 修改：`src/scripts/ui/chat/dialogue-stream-parser.js`
    - 修改：`src-tauri/tauri.conf.json`

- 2025-12-15 20:21 - 修复 DeepSeek 仍 Failed to fetch：改用原生 HTTP 绕过 WebView CORS
  - **根因**：DeepSeek / OpenAI-compatible 多数端点不提供浏览器 CORS 头，WebView `fetch` 会直接失败；仅放宽 CSP 不足以解决。
  - **原生请求**：新增 Tauri 命令 `http_request`（Rust `reqwest`），前端在 Tauri 环境下优先通过 `invoke` 走原生网络栈。
  - **适配范围**：`OpenAIProvider`（含 DeepSeek / custom）发送与拉取模型列表都走原生 HTTP；非 Tauri 环境保持使用 `fetch`。
  - 文件修改：
    - 修改：`src-tauri/Cargo.toml`
    - 修改：`src-tauri/src/commands.rs`
    - 修改：`src-tauri/src/lib.rs`
    - 修改：`src/scripts/api/providers/openai.js`
    - 修改：`src/scripts/api/providers/deepseek.js`

- 2025-12-15 22:03 - 进一步修复仍走 fetch 导致 CORS：原生请求优先级提升 + custom provider 同步
  - **问题**：部分环境下 `__TAURI_INVOKE__` 探测不稳定，导致 OpenAI/DeepSeek 仍走 `fetch` 触发 CORS。
  - **修复**：统一用 `globalThis` 探测，并在 `request()` 内“先尝试 invoke，再回退 fetch”，避免误判。
  - **覆盖 custom**：`CustomProvider`（OpenAI-compatible 自建地址）也切换到同一套原生 HTTP 逻辑。
  - 文件修改：
    - 修改：`src/scripts/api/providers/openai.js`
    - 修改：`src/scripts/api/providers/custom.js`

- 2025-12-15 22:05 - Tauri 环境禁用 CORS 回退：invoke 失败直接报原生错误
  - **问题**：在 Tauri WebView 中，`fetch` 必然触发 CORS（DeepSeek 等），回退会掩盖真实原因。
  - **修复**：检测到 `tauri.localhost` / `__TAURI__` 时，`http_request` 调用失败将直接抛出错误（不再回退到 `fetch`），便于定位是“命令未注册/后端异常/权限问题”。
  - 文件修改：
    - 修改：`src/scripts/api/providers/openai.js`
    - 修改：`src/scripts/api/providers/custom.js`

- 2025-12-15 22:22 - 修复 DeepSeek 400 / Gemini 不显示：请求头与对话解析更健壮
  - **DeepSeek 400**：流式请求添加 `Accept: text/event-stream`；并对 OpenAI-compatible 参数做清洗（DeepSeek 不发送 `seed/n` 等易触发 400 的字段）；错误信息附带服务端返回细节。
  - **Gemini 不显示**：对话解析器匹配闭合标签改为容错（允许闭合标签 `</tag >` 等空白差异）；流式结束未解析到有效标签会提示“已丢弃，可在原始回复查看”。
  - **日志增强**：发送失败会额外打印 `{status, response}` 方便定位。
  - 文件修改：
    - 修改：`src/scripts/api/providers/openai.js`
    - 修改：`src/scripts/api/providers/custom.js`
    - 修改：`src/scripts/ui/chat/dialogue-stream-parser.js`
    - 修改：`src/scripts/ui/app.js`

- 2025-12-15 22:46 - 预设保存与 Prompt 验证：跨 tab 保存 + 本次 Prompt 预览
  - **跨 tab 保存**：预设面板切换 tab/预设时自动缓存草稿，点击「保存」会把所有 tab 的改动一并落盘，避免“只保存当前 tab 导致其他 tab 改动丢失”。
  - **Prompt 预览**：聊天室右上角「三」新增 `🧩 本次 Prompt`，可查看本次实际发送给模型的 messages（纯文本，含 role 分段），用于确认“格式要求/聊天协议提示词是否正确注入”。
  - **注入语义一致**：对话/动态提示词在 `IN_PROMPT/BEFORE_PROMPT` 也遵循可配置的 role（system/user/assistant），更贴近 ST 的扩展提示词语义。
  - 文件修改：
    - 修改：`src/index.html`
    - 修改：`src/scripts/ui/preset-panel.js`
    - 修改：`src/scripts/ui/bridge.js`
    - 修改：`src/scripts/ui/app.js`

- 2025-12-15 22:53 - 对话解析容错：允许缺失 <content> 包装仍可解析私聊/动态标签
  - **问题**：DeepSeek 偶尔不按提示词输出 `<content>` 包装，导致解析器一直等待 `<content>` 而不解析任何有效标签。
  - **修复**：检测到私聊标签或 `moment_start` 时自动进入解析模式（即使没有 `<content>`），仍按原规则提取私聊与动态内容。
  - 文件修改：
    - 修改：`src/scripts/ui/chat/dialogue-stream-parser.js`

- 2025-12-15 23:00 - 私聊路由容错：标签名无法匹配联系人时回退当前聊天室（不新建）
  - **问题**：模型可能输出别名/繁简体（如「貝法」vs 联系人「贝法」）导致精确匹配失败，私聊消息被当作格式错误丢弃。
  - **修复**：在“从聊天室发起生成”的私聊解析路由中，匹配失败不再丢弃，而是回退写入当前 session（仍不创建新聊天室）。
  - 文件修改：
    - 修改：`src/scripts/ui/app.js`

- 2025-12-15 23:08 - 修复 Tauri invoke 不可用导致存储警告 + 流式超时错误信息
  - **invoke 探测**：统一改用 `globalThis` + `__TAURI_INTERNALS__` 兼容检测，避免在 Android 端出现 `Tauri invoke not available` 导致 `save_kv`/`load_kv` 误判失败（动态/联系人/预设等存储都受影响）。
  - **超时报错**：将 Android WebView 的 `DOMException(AbortError)` 统一转为可读的“请求超时（60秒）”错误，避免日志出现 `[object DOMException]`。
  - 文件修改：
    - 修改：`src/scripts/storage/moments-store.js`
    - 修改：`src/scripts/storage/chat-store.js`
    - 修改：`src/scripts/storage/contacts-store.js`
    - 修改：`src/scripts/storage/config.js`
    - 修改：`src/scripts/storage/regex-store.js`
    - 修改：`src/scripts/storage/preset-store.js`
    - 修改：`src/scripts/storage/worldinfo.js`
    - 修改：`src/scripts/storage/chat.js`
    - 修改：`src/scripts/ui/bridge.js`

- 2025-12-15 23:12 - 支持调整请求超时（上限 5 分钟）
  - **配置面板**：新增「请求超时（秒）」字段（10–300 秒），保存到连接设定档并在发送请求时生效。
  - **错误提示**：超时中止时提示会显示当前配置的秒数（不再固定 60 秒）。
  - 文件修改：
    - 修改：`src/scripts/ui/config-panel.js`
    - 修改：`src/scripts/ui/bridge.js`

- 2025-12-16 00:10 - API 配置体验修复 + Vertex AI 按 ST 方式接入
  - **配置面板不再被切顶**：面板定位改为贴合安全区顶部，内容过长也不会把标题挤出屏幕。
  - **刷新模型不再误报缺 Key**：`刷新列表` 会复用已保存的 Key（遮罩状态下 `apiKey=null` 也能正常拉取模型）。
  - **Vertex AI**：使用 Service Account JSON 通过 WebCrypto 进行 RS256 签名生成 JWT，并通过原生 `http_request` 交换 OAuth2 token；后续调用 Vertex API 同样走原生请求，避免 WebView CORS（实现路径与 SillyTavern 的“后端签名+换 token”一致，只是签名在 WebCrypto 内完成）。
  - 文件修改：
    - 修改：`src/scripts/ui/config-panel.js`
    - 修改：`src/scripts/api/providers/vertexai.js`

- 2025-12-16 00:14 - 修复启动崩溃：config-panel 重复声明导致语法错误
  - **问题**：`populateForm()` 中重复声明 `const timeoutEl`，Android WebView 直接抛 `Uncaught SyntaxError` 导致页面无法加载。
  - **修复**：移除重复代码块。
  - 文件修改：
    - 修改：`src/scripts/ui/config-panel.js`

- 2025-12-16 00:23 - Vertex AI 改进：无需 API Key + 模型列表更完整（分页）
  - **无需 Key**：Vertex AI 使用 Service Account 即可工作；`保存/切换/刷新列表` 不再误判“Key 不可用”，并允许在无 Key 情况下初始化客户端。
  - **模型列表**：`publishers/google/models` 增加 `pageSize=100` + `nextPageToken` 分页抓取；失败时提供更接近 ST 的 10 项 fallback 列表。
  - 文件修改：
    - 修改：`src/scripts/ui/bridge.js`
    - 修改：`src/scripts/ui/config-panel.js`
    - 修改：`src/scripts/ui/preset-panel.js`
    - 修改：`src/scripts/api/providers/vertexai.js`

- 2025-12-16 00:37 - Vertex AI 模型拉全 + 404 自动回退 global + API 配置弹窗层级对齐
  - **模型列表**：移除分页抓取的人工页数上限，改为抓取所有分页；并额外合并 `locations/global` 的模型列表（去重后展示）。
  - **404 回退**：当指定 Region 请求模型返回 404 时，自动用 `locations/global` + `aiplatform.googleapis.com` 重试（用于如 `gemini-3-pro-preview` 这类只在 global 可用的模型）。
  - **UI 层级**：API 配置弹窗的 `z-index` 调整为与预设弹窗一致，避免被覆盖。
  - 文件修改：
    - 修改：`src/scripts/api/providers/vertexai.js`
    - 修改：`src/scripts/ui/config-panel.js`

- 2025-12-16 01:14 - 群组（群聊）基础功能：创建/设置/解析/提示词 + 世界书 A+B
  - **创建群组**：`＋ → 创建群组` 可选择群名/头像/成员并创建群聊入口，自动写入系统消息。
  - **群聊管理**：在群聊内点击标题弹出成员列表（可跳转到成员私聊）并进入群聊设置（名称/头像/成员）。
  - **群聊提示词**：在「预设 → 聊天提示词」新增「群聊提示词」区块（默认折叠），仅在群聊会话注入。
  - **解析群聊回覆**：支持解析 `<群聊:群名字>`（含 `<成员>`/`<聊天内容>`）并把消息分发到对应群聊；若未匹配到已存在群组则丢弃（不自动新建）。
  - **群聊世界书**：构建 prompt 时群聊世界书自动合并为群成员各自私聊世界书（A+B+...），与群成员选择同步。
  - 文件修改：
    - 新增：`src/scripts/ui/group-chat-panels.js`
    - 修改：`src/scripts/storage/contacts-store.js`
    - 修改：`src/scripts/ui/app.js`
    - 修改：`src/scripts/ui/bridge.js`
    - 修改：`src/scripts/ui/preset-panel.js`
    - 修改：`src/scripts/storage/preset-store.js`
    - 修改：`src/scripts/ui/chat/dialogue-stream-parser.js`
    - 修改：`src/scripts/ui/chat/chat-ui.js`
    - 修改：`src/assets/css/qq-legacy.css`
    - 修改：`src/index.html`

- 2025-12-16 10:21 - 群聊/联系人分离展示 + 群聊自动启用群员世界书
  - **联系人界面**：群聊单独显示在「群聊」区域，不参与联系人分组/未分组逻辑（与 `手机流式.html` 一致）。
  - **群聊世界书**：创建/编辑群聊后，若群员存在同名世界书（按成员 id/名称匹配），会自动绑定到对应私聊会话，确保群聊 prompt 合并时能自动启用（A+B+...）。
  - 文件修改：
    - 修改：`src/index.html`
    - 修改：`src/scripts/ui/app.js`
    - 修改：`src/scripts/ui/bridge.js`

- 2025-12-16 10:44 - 联系人页群聊可进入 + 群聊世界书改为“按成员绑定”显示/管理
  - **修复**：联系人页点击群聊现在可正常进入对应群聊会话。
  - **世界书面板（群聊）**：进入群聊后打开世界书，会显示每个成员当前绑定的世界书，并可对成员执行「绑定/更换/停用」；群聊世界书合并逻辑直接使用这些绑定（不依赖世界书名称与成员名称一致）。
  - 文件修改：
    - 修改：`src/scripts/ui/app.js`
    - 修改：`src/scripts/ui/world-panel.js`

- 2025-12-16 10:47 - 修复启动崩溃：WorldPanel 初始化时引用未定义变量
  - **问题**：`app.js` 中在 `contactsStore/chatStore` 初始化之前创建 `WorldPanel`，导致 `ReferenceError: Cannot access 'contactsStore' before initialization`。
  - **修复**：调整初始化顺序，先创建 store，再创建 `WorldPanel`。
  - 文件修改：
    - 修改：`src/scripts/ui/app.js`

- 2025-12-16 11:08 - 聊天提示词按场景拆分（私聊/群聊/动态评论）并与手机流式构建一致
  - **预设 → 聊天提示词**：将原“动态提示词”拆分为「动态发布决策提示词」与「动态评论回覆提示词」两块。
  - **场景注入规则**：
    - A 私聊：仅注入「私聊提示词」+「动态发布决策提示词」
    - B 群聊：仅注入「群聊提示词」+「动态发布决策提示词」
    - C 动态评论：仅注入「动态评论回覆提示词」
  - **动态评论生成**：评论任务不再在 `app.js` 内硬编码规则，改为通过 `task: moment_comment` 触发预设注入（只传数据）。
  - 文件修改：
    - 修改：`src/scripts/ui/bridge.js`
    - 修改：`src/scripts/ui/preset-panel.js`
    - 修改：`src/scripts/storage/preset-store.js`
    - 修改：`src/scripts/ui/app.js`

- 2025-12-16 11:33 - 补全“手机格式提示词”世界书条目并按原顺序注入
  - **内置世界书迁移**：从 `手机流式.html` 完整搬运 `手机-格式1-格式开头`、`手机-格式2-QQ聊天`、`手机-格式3-QQ空间`、`手机-格式999-格式结尾`、`手机-界面基本设置`（保留深度/关键词/顺序等元数据）。
  - **自动写入/更新**：App 启动时自动确保存在内置世界书 `手机-格式`（用于补齐缺失/不完整条目）。
  - **注入与排序**：世界书注入改为按 `order/priority` 升序拼接，并支持 `constant/disable/关键词` 的基础触发（无 matchText 时保持旧行为：全部启用条目可见）。
  - 文件修改：
    - 新增：`src/scripts/storage/builtin-worldbooks.js`
    - 修改：`src/scripts/ui/bridge.js`

- 2025-12-16 11:54 - 预设聊天提示词去重：保留场景判别，格式说明交给世界书
  - **决策**：场景判别（私聊/群聊/动态评论）继续由预设/应用侧注入负责；“手机格式提示词”（QQ聊天/QQ空间/收尾）统一由世界书 `手机-格式*` 提供。
  - **默认提示词精简**：将预设中的 `<QQ聊天格式介绍>` / `<QQ空间格式介绍>` 等重复格式说明从默认值中移除，仅保留风格与场景信息；旧版内容保留在源码注释中便于对照。
  - **迁移**：若用户仍使用旧默认提示词（包含 `<QQ聊天格式介绍>` 或 `<QQ空间格式介绍>` / `<content>` 约束），启动时会自动替换为精简版默认值（不影响已自定义内容）。
  - 文件修改：
    - 修改：`src/scripts/storage/preset-store.js`

- 2025-12-16 15:53 - 联系人页“搜索联系人…”按手机流式实现
  - **搜索交互**：支持输入防抖、清除按钮、焦点高亮、Esc 清空（参照 `手机流式.html` 的 `initContactSearch/filterContacts`）。
  - **过滤范围**：按“联系人名称 + 最后一条消息预览”匹配，分区（群聊/未分组联系人）无匹配时自动隐藏分区；清空搜索恢复。
  - **高亮**：匹配到的名称/预览会高亮显示，并在刷新联系人列表后保持过滤状态。
  - 文件修改：
    - 修改：`src/index.html`
    - 修改：`src/assets/css/main.css`
    - 修改：`src/scripts/ui/app.js`

- 2025-12-16 23:20 - 修复启动后连接配置回退：不再被“预设绑定连接”覆盖
  - **问题**：启动时 `AppBridge.init()` 会根据预设的 `boundProfileId` 强制切换连接，导致用户明明保存并正在使用 Deepseek，重启后又被切回旧的默认/其他配置。
  - **修复**：启动时不再用预设绑定覆盖“最后一次使用的连接配置”；预设绑定仅在用户切换预设时应用（由 `preset-panel` 触发）。
  - 文件修改：
    - 修改：`src/scripts/ui/bridge.js`
- 2025-12-16 17：45
  - 实现联系人分组完整功能：新增 group-store.js（分组存储）、group-panel.js（分组管理面板）、contact-drag-manager.js（拖拽管理）、contact-group-renderer.js（分组渲染）。
  - 新增 contact-groups.css 样式文件，支持分组折叠/展开、拖拽放置区高亮、拖拽状态反馈。
  - 修改 app.js：集成 GroupStore、ContactDragManager、GroupPanel、ContactGroupRenderer；修改 renderContactsUngrouped 使用分组渲染；连接快捷菜单「新建分组」按钮。
  - 修改 index.html：引入 contact-groups.css。
  - 功能完整度：✅ 创建分组、✅ 重命名分组、✅ 删除分组、✅ 折叠/展开、✅ 拖拽联系人到分组、✅ 拖拽到未分组区域、✅ 数据持久化（localStorage + Tauri KV）。
  - 新增文档：CONTACT_GROUPS_IMPLEMENTATION.md（详细实现说明、使用指南、测试建议）。
  - 参考原文件：手机流式.html 第 32729-33428 行分组功能实现。
- 2025-12-16 18：40（配置加载修复）
  - 修复 API 配置在重新打开 APP 时自动切换到错误配置的问题。
  - 问题原因：ensureStores() 在 activeProfileId 无效时，按插入顺序选择第一个配置，而不是按最后使用时间。
  - 修复方案：1) 确保 activeProfileId 字段存在（防止 undefined）；2) 按 updatedAt 降序选择最近使用的配置；3) 添加调试日志。
  - 修改文件：src/scripts/storage/config.js（ensureStores、load、save、setActiveProfile 方法）。
  - 新增文档：CONFIG_LOAD_FIX.md（详细说明问题、修复方案、验证步骤）。
  - 现在每次打开 APP 时，会自动加载最后一次保存/使用的配置，而不是第一个创建的配置。
- 2025-12-16 19：35（Android 配置调试工具）
  - 为 Android 设备添加屏幕调试面板，无需连接电脑即可查看日志。
  - 新增文件：src/scripts/ui/debug-panel.js（屏幕调试面板，右下角 DEBUG 按钮切换）。
  - 修改 src/scripts/utils/logger.js：所有 INFO/WARN/ERROR 日志同时输出到调试面板。
  - 修改 src/scripts/storage/config.js：增强持久化和加载日志，显示 activeProfileId 和配置数量。
  - 修改 src/scripts/ui/config-panel.js：添加「调试信息」按钮，显示当前配置状态和 localStorage 数据。
  - 调试面板功能：显示实时日志（最多20条）、支持显示配置状态、按时间戳显示、颜色区分日志级别。
  - persistProfiles 方法改进：显式保存 activeProfileId 和 profiles 字段，同时保存到 Tauri KV 和 localStorage。
  - 新增文档：DEBUG_CONFIG_ANDROID.md（详细的 Android 调试指南、使用方法、问题诊断步骤）。
- 2025-12-16 22：30（按钮布局优化和配置切换防护）
  - 修复 API 配置面板底部按钮布局不美观的问题。
  - 修改 src/scripts/ui/config-panel.js：将「调试信息」按钮改为小按钮独立放置在上方，主要操作按钮（测试连接、取消、保存）统一样式和大小，右对齐排列。
  - 按钮样式改进：统一 padding、border-radius、min-width，使用更柔和的颜色（#e2e8f0 边框、#f8fafc 背景）。
  - 修改 src/scripts/ui/debug-panel.js：APP 启动时自动显示调试面板 8 秒，让用户能看到配置加载日志；增加 maxLogs 到 30 条；增强 showConfigStatus 显示每个配置的最后修改时间。
  - 防止配置意外切换：添加 isRefreshingProfile 标志，防止刷新配置选择器时触发 onchange 事件导致配置被意外切换。
  - 增强日志：在配置选择器 onchange 中添加日志，记录用户手动切换配置的操作。

- 2025-12-16 23:10（Tauri KV 持久化增强 - Android fsync 和详细日志）
  - **问题发现**：通过用户截图确认根本原因 - 保存的 activeProfileId（profile-1765814569599-2f6ecb，Vertex）与重新打开后加载的 activeProfileId（profile-1765817736355-18596b，Deepseek）完全不同，说明 Tauri KV 存储没有正确持久化数据。
  - **修复方案**：
    - 修复：Android 文件系统同步 (`fsync`) 确保 activeProfileId 正确落盘。
- 2025-12-16 23:45（性能优化 - 解决 Android 输入卡顿）
  - **问题诊断**：手机端输入时严重卡顿，原因定位为 CSS `backdrop-filter` 导致的 GPU 过载，以及 `input` 事件触发高频同步 `localStorage` 写入。
  - **CSS 优化**：移除 `qq-legacy.css` 和 `main.css` 中所有 `backdrop-filter: blur(...)`，改用纯半透明背景，大幅降低 GPU 渲染压力。
  - **JS 优化**：在 `chat-ui.js` 的 `onInputChange` 中增加 500ms 防抖 (Debounce)，避免每输入一个字符就触发一次磁盘写入/序列化，释放主线程资源。
- 2025-12-17 00:30（功能增强 - 历史记录与世界书管理）
  - **输入框优化**：将单行 `input` 替换为多行 `textarea`，支持自动换行与高度自适应，并隐藏了滚动条以保持美观。
  - **消息交互**：长按菜单新增「复制」；「编辑」改为原地编辑（Inline Edit），体验更流畅。
  - **世界书管理**：列表项新增「删除」按钮，可直接删除已保存的世界书。
  - **聊天分支管理**：好友设置界面新增「聊天管理」区块，支持「开启新聊天」（自动存档当前记录）与「加载历史存档」，实现类似 ST 的多分支对话切换。
  - **新聊天逻辑优化**：
    - 「开启新聊天」时强制新建存档（即使当前已关联存档也作为快照保存），防止覆盖旧版本。
    - 存档命名自动追加时间戳后缀（防止混淆）。
    - 切换存档时自动保存当前编辑进度（更新现有存档或新建自动存档）。
    - 历史列表中高亮显示当前正在编辑的存档。
- 2025-12-17 01:15（核心逻辑 - 变量与宏引擎）
  - **Macro Engine**：实现 `src/scripts/utils/macro-engine.js`，支持多轮解析与常用指令（`setvar`、`getvar`、`incvar`、`random`、`dice` 等）。
  - **后端集成**：`ChatStore` 增加变量存储支持；`AppBridge` 集成宏引擎，并在构建 Prompt 时自动处理所有文本（规则、世界书、Prompt Blocks）。
  - **功能落地**：现在 Prompt 中的 `{{...}}` 将会被动态替换，支持类似 SillyTavern 的高级逻辑与状态记忆。
    - 为 `save_kv` 和 `load_kv` 命令添加详细的终端日志（eprintln），显示文件路径、数据大小、activeProfileId 和 profiles 数量。
  - **修改文件**：
    - `src-tauri/src/commands.rs` (save_kv 函数)：添加 fsync() 调用和日志输出
    - `src-tauri/src/commands.rs` (load_kv 函数)：添加详细的加载日志
  - **测试方法**：
    - 重新编译 Android APK：`npm run tauri android build`
    - 在终端运行 `npm run dev` 并在手机上打开 APP，观察终端输出的 [save_kv] 和 [load_kv] 日志
    - 保存配置时记录 activeProfileId，关闭 APP 后重新打开，确认加载的 activeProfileId 是否一致
  - **预期结果**：fsync() 确保数据立即写入磁盘，解决 Android 文件系统缓存导致的数据丢失问题。

- 2025-12-17 11：01（用户角色 Persona 完善 - 位置/宏/注入行为对齐 ST）
  - **Persona 数据结构增强**：`PersonaStore` 为每个 persona 增加 `position/depth/role`，对齐 ST 的 `persona_description_positions`（子集：IN_PROMPT=0 / AT_DEPTH=4 / NONE=9），并在加载时自动补齐旧数据字段。
  - **UI 补齐**：`PersonaPanel` 新增「注入设置」：插入位置（IN_PROMPT/AT_DEPTH/NONE）+（AT_DEPTH 下）深度与注入角色；并提示支持的宏（`{{user}}/{{char}}/{{time}}/{{date}}/{{getvar::}}` 等）。
  - **Prompt 生成对齐**：`AppBridge.buildMessages()` 仅在 persona 位置为 IN_PROMPT 时填充 `personaDescription` marker / `{{persona}}`；当为 AT_DEPTH 时按深度与角色插入到聊天历史（与 ST 行为一致）。
  - **宏替换增强**：`MacroEngine` 允许 `processTextMacros(text, { scenario/personality/... })` 这类传参直接生效（不必塞进 extraMacros），并兼容 `{ name: ... }` 结构（便于 user/char 传对象）。
  - **显示一致性**：用户发送消息的显示名从固定「我」改为当前 persona 名称，并将 persona 的 position/depth/role 一并传入生成上下文。
  - **修复“用户角色菜单无反应”**：`PersonaPanel` overlay 补齐 `position:fixed; inset:0` 遮罩样式（此前仅追加到 body 末尾，手机上看起来像没弹窗）。
  - **Persona 锁定（会话级）**：参考 ST “persona lock” 的最小子集，新增按会话锁定 persona：
    - `ChatStore` 增加 `personaLockId` 存储与 `get/set/clearPersonaLock()`。
    - `PersonaPanel` 顶部显示当前会话锁定状态，并支持一键解除；列表中新增 🔒 按钮可将某 persona 锁定到当前会话（再次点击可解除）。
  - **手机适配修复**：`PersonaPanel` 设为 `position: relative`，避免编辑视图 `position:absolute` 锚定到 viewport 导致返回按钮靠边难点/点不到；同时缩小弹窗尺寸并扩大返回按钮点击热区。
  - **localStorage 超额降级**：对 `ChatStore/ContactsStore/MomentsStore` 增加 QuotaExceededError 探测；一旦触发则停止写 localStorage（仅提示一次），继续使用 Tauri KV 持久化（解释“看到 storage 失败但重启没丢数据”的原因）。
  - **批量 Persona 锁定**：点击 Persona 列表的 🔒 打开“联系人/群组”选择弹窗，支持搜索、全选/全不选，统一保存绑定状态（批量绑定/解绑）。
  - **缓解断网/更新跳回默认**：
    - UI 状态保存/恢复：用 `sessionStorage` 记住当前页签/是否在聊天室/当前会话，页面重载后自动恢复。
    - 草稿保护：输入框实时镜像到 `sessionStorage`，避免热更新/意外重载丢最后几次输入。
    - invoke 延迟等待：`ChatStore/ContactsStore/MomentsStore` 在检测到 `__TAURI__` 存在但 invoke 尚未就绪时短暂等待，减少“只剩默认会话”的概率。

- 2025-12-17 11:50（宏/变量对齐 ST + 变量管理器）
  - **宏替换对齐**：增强 `MacroEngine`，支持 `<USER>/<CHAR>/<BOT>`、`{{lastUserMessage}}/{{lastCharMessage}}`、`{{lastMessageId}}`、`{{newline}}/{{trim}}`、`{{isodate}}/{{isotime}}`、`{{reverse:...}}`、`{{//注释}}` 等常用占位符。
  - **变量宏增强**：支持 `{{setvar::k::v}}/{{getvar::k}}/{{addvar::k::v}}/{{incvar::k}}/{{decvar::k}}`，并兼容全角分隔符 `：：`。
  - **变量管理器 UI**：聊天室菜单新增「🧮 变量管理器」，可查看/搜索/新增/编辑/删除/清空当前会话变量。

- 2025-12-17 12:22（用户/宏修复 + 消息收回）
  - **修复 `{{user}}` 替换**：`MacroEngine` 的基础变量查找改为大小写不敏感，兼容 `{{USER}}/{{Char}}` 等写法。
  - **避免 `{{lastUserMessage}}` 重复**：`AppBridge.buildMessages()` 检测 prompt blocks 是否已通过 `{{lastUserMessage}}` 注入当前输入，若已注入则不再额外追加末尾 user message。
  - **消息“收回”**：长按用户消息菜单新增「收回」，若该消息仍在等待 AI 回覆则会中断生成并撤回该消息；若已回覆则仅撤回该用户消息（不删除 AI 回覆）。
  - **可取消请求**：`AppBridge` 增加 `cancelCurrentGeneration()`，并将 `AbortSignal` 贯通到各 provider（OpenAI/Custom/Anthropic/Gemini/Makersuite/Vertex）；Tauri 原生 `http_request` 路径无法真正中断时至少停止 UI 处理与输出。

- 2025-12-17 12:38（世界书/预设占位符替换修复）
  - **根因**：世界书内容（`formatWorldPrompt()`）与 context preset 的 `story_string`（`renderStTemplate()`）之前未经过 `processTextMacros()`，且 `renderStTemplate` 对 `{{USER}}` 这类大小写不匹配会直接变成空字符串。
  - **修复**：`buildMessages()` 现在会对世界书拼接结果与 `story_string` 渲染结果再跑一次 `processTextMacros()`，并让 `renderStTemplate` 支持大小写不敏感变量、保留未知 `{{...}}` 以便交给 MacroEngine 继续替换。

- 2025-12-17 14:53（断网/热更新不跳回默认）
  - **UI 状态持久化**：`app.js` 的页面/会话/是否在聊天室状态从仅 `sessionStorage` 升级为 `sessionStorage + localStorage + Tauri KV`，并在首次渲染前优先恢复，避免闪回默认页/默认会话。
  - **延迟 hydrate 兜底**：`ChatStore/ContactsStore/MomentsStore` 将 `waitForInvoker` 延长到 5s，并在 invoke 尚未就绪时做最多 3 次递增重试；hydrate 成功会派发 `store-hydrated` 事件供 UI 无跳转刷新。

- 2025-12-17 15:54（诊断：跳回默认的日志）
  - **可过滤 logcat 标记**：`app.js` 增加 `[CHATAPP_UI]` 关键路径日志（save/restore UI state、switchPage、enter/exit chat、store-hydrated、pageshow/pagehide/visibilitychange、error/unhandledrejection），用于定位是否 WebView 重载或状态恢复时序问题。
  - **hydrate 重试可见**：`ChatStore/ContactsStore/MomentsStore` 在安排重试时输出 warn 日志（`* store hydrate retry scheduled (n/3)`）。

- 2025-12-17 16:17（logcat：JS→Rust 日志桥）
  - **原因**：Android 上 JS `console.log` 往往只在 WebView 远程调试里可见，不一定进入 logcat。
  - **实现**：新增 Tauri 命令 `log_js`，前端 `uiLog()` 会在 Tauri 环境下把 `[CHATAPP_UI]` 日志同步打印到 `RustStdoutStderr`（logcat 可见），并做长度截断防止刷屏。

- 2025-12-17 16:28（UI 层级 + Prompt 预览优化）
  - **头像菜单弹窗层级**：将 `SessionPanel/WorldPanel` 的 overlay/panel `z-index` 提升到与「用户角色」一致，避免被顶栏/其他浮层遮挡导致“点了没反应”。
  - **Prompt 预览**：移除 `--- #n role ---` 这种展示用分隔符，改为直接显示 `messages` JSON 数组（更贴近 ST 的调试视图，也避免误解为会占用 tokens 的真实请求内容）。

- 2025-12-17 16:42（批量删除 + Prompt 预览纯文本 + 历史发言者前缀）
  - **批量删除（仿 LINE）**：长按 AI 回覆选择「删除」将进入勾选模式，可点选/取消选中多条消息后一次删除（`ChatUI` 新增 selectionMode 与 `delete-selected` 动作）。
  - **Prompt 预览纯文本**：`本次 Prompt` 面板改为仅显示将发送的提示词文本内容（去掉 JSON 结构与编号，便于阅读）。
  - **历史消息防混淆**：发送给模型的 chat history 会自动加上 `角色名: 内容` / `用户名: 内容` 前缀（保留原 role，同时降低模型把谁说的搞混的概率）。

- 2025-12-17 17:17（History 控制 + 摘要 <summary>）
  - **History 回顾提示**：在 chat history 开头插入提示，强调“仅作前文回顾，不要复述历史内容”，并在提示与完整历史之间插入“该聊天室摘要回顾”（按存档绑定）。
  - **History 限制**：每次发送最多携带最近 50 条 user/assistant 历史消息，避免上下文过大分散注意力。
  - **摘要生成/解析/存储**：每次请求要求模型在末尾输出 `<summary>一句话</summary>`；回覆后会提取并从显示内容中移除，摘要将追加保存到当前聊天存档（切换存档摘要自动切换）。
  - **摘要展示**：好友设置（点击聊天室标题→设置）新增摘要列表，可点击复制、可清空。

- 2025-12-17 17:26（动态分页 + 摘要格式改为 details/summary）
  - **动态分页**：动态页默认仅渲染最新 5 条，底部提供「展开更多（+5）」按钮，每次点击再加载 5 条，避免列表过长影响性能与滑动体验。
  - **摘要格式升级**：摘要提示词改为要求输出 `<details><summary>摘要</summary>...</details>`（纯中文），并在前端解析该 block、从显示文本剔除后存入存档摘要列表。

- 2025-12-17 17:41（摘要提示词可见 + 聊天提示词位置调整）
  - **摘要提示词**：不再因“对话/群聊协议解析模式”自动禁用；无论是否解析标签，都会从原始回覆中提取 `<details><summary>摘要</summary>...</details>` 并写入当前存档摘要。
  - **聊天提示词（预设）**：不再塞到 prompt 开头；改为按“世界书格式”（`wi_format`）包装，并固定以 `system` 深度=1 注入到 chat history 附近，减少对开头 system prompt 的干扰。

- 2025-12-17 17:57（摘要提示词并入聊天提示词区块 + 避免落入<history>）
  - **系统深度=1（历史前）**：私聊/群聊提示词不再插入历史数组，改为独立 `system` 区块放在 chat history 之前，避免被当作历史内容或落入 `<history>` 包裹。
  - **摘要提示词管理**：摘要提示词迁移到「聊天提示词（对话模式）」区块内，可启用/禁用并编辑内容；注入顺序固定为“聊天提示词在上、摘要提示词在下”。

- 2025-12-17 18:07（chat_guide：聊天提示词紧跟 history）
  - **统一位置**：聊天提示词（私聊/群聊/动态/摘要）若启用，将紧跟 chat history 之后插入，并用 `<chat_guide>...</chat_guide>` 包裹（不混入 `<history>` 内）。

- 2025-12-17 18:23（协议解析：失败时去除 thinking 重试）
  - **备用逻辑**：对话/群聊/动态协议解析若第一次未解析到事件，会把完整 `<thinking>`/`<think>` 区块从原始回覆中剔除后再解析一次，用于修复“thinking 里复述格式时提前出现 `<content>` 导致误入 content”造成的解析失败。

- 2025-12-17 19:38（世界书编辑层级 + 群聊摘要 + 群人数显示）
  - **世界书编辑 z-index**：提高世界书编辑器弹窗层级，避免被世界书管理面板遮挡。
  - **摘要存储覆盖群聊**：协议解析时提取到摘要会写入所有实际落地的会话（当前会话 + 解析路由到的群聊/私聊会话）。
  - **群聊人数展示**：群聊名称追加 `(人数)`，例如 `群组a(3)`。

- 2025-12-17 19:44（群聊设置展示摘要）
  - **群聊摘要面板**：群聊设置界面新增“摘要”列表（点击复制/清空），与该群聊聊天存档绑定。

- 2025-12-17 19:58（协议解析：失败重试更容错）
  - **备用逻辑升级**：协议解析第一次失败时，不再要求完整 `<thinking>/<think>` 闭合块；若文本中存在 `</thinking>` 或 `</think>`，则删除其之前所有内容后再解析一次，避免 thinking 内提前出现 `<content>` 干扰解析起点。

- 2025-12-18 11:01（未读计数 + 群聊私聊摘要注入 + 摘要大总结）
  - **未读消息**：会话列表/联系人列表显示红色数字角标；进入会话时自动跳转到第一条未读消息并标记已读。
  - **群聊上下文增强**：群聊请求会附带每位成员与用户私聊的最近 2 条摘要（含准确时间/距今）与“注意信息差/私密性”提醒。
  - **摘要压缩**：当某会话摘要累计字数超过 1000 时，后台触发一次“大总结”；大总结单独存储/展示在摘要列表下方，并将普通摘要列表裁剪为最新 2 条，便于继续滚动积累。

- 2025-12-18 11:16（动态评论回复线程 + lastUserMessage 场景提醒）
  - **动态评论楼中楼**：动态评论支持“回复某条评论”；发送时携带 `replyTo`（comment_id/author），渲染为简单楼中楼结构（类似 FB），并扩展解析支持 `reply_to::/reply_to_author::`。
  - **动态评论提示词更新**：默认规则从“发布者必须回复”改为“高概率回复但可按情境与性格自行决定不回复”；当用户回复某条评论时，被回复角色高概率回复。
  - **动态评论上下文注入**：动态评论时自动注入目标角色私聊摘要（发布者/被回复者），规则与群聊成员注入一致（无大总结=3条；有大总结=大总结+2条）。
  - **lastUserMessage 注入**：动态评论/回复的用户输入通过 `{{lastUserMessage}}` 占位符注入（不再追加到 prompt 末尾）；每次请求会按场景自动在 lastUserMessage 后追加括号提醒（私聊/群聊/动态评论）。

- 2025-12-18 11:22（动态评论交互：点击作者回复 + 长按统一删除）
  - **回复入口调整**：动态评论楼中楼改为“点击该评论的角色名”即可进入回复（不再使用单独的回复按钮）。
  - **长按删除一致性**：修复部分评论行因缺少 comment_id 导致无法长按删除；并让动态列表与动态详情弹窗内的每条评论都支持长按/右键弹出删除菜单。

- 2025-12-18 11:39（Android 黑屏排查：硬件加速规避尝试）
  - **阶段性尝试**：为排查 Android 黑屏/崩溃，曾临时禁用硬件加速并强制 WebView 软件层渲染；后确认根因是 devUrl 网络不可达（电脑/手机不在同一网络），已恢复默认硬件加速路径。

- 2025-12-18 12:34（修复黑屏根因：devUrl 网络）
  - **根因**：电脑在公司网络、手机走 5G 导致无法访问 `devUrl`（如 `http://192.168.x.x:1430/`），表现为黑屏但 crash buffer 为空。
  - **解决**：让电脑与手机处于同一网络后可正常加载；恢复 Android 端默认硬件加速设置。

- 2025-12-18 12:40（动态评论回复 UI：防横向溢出）
  - **回复输入排版**：回复目标信息与输入框分成上下两行（换行显示），回复预览文本支持自动换行，避免内容过长导致横向溢出跑版。
  - **取消回复体验**：点击 `×` 后立即回到默认“发表评论”模式并聚焦输入框。

- 2025-12-18 12:44（动态评论回复 UI：修复竖排跑版）
  - **布局修复**：强制评论输入区域使用纵向布局（column），避免回复预览与输入框被同一行挤压导致字符竖排显示；超出宽度自动换行。

- 2025-12-18 12:59（宏系统：lastUserMessage 覆盖修复）
  - **修复**：补齐 `{{lastUserMessage}}` 的覆盖实现作用域，修复发送时出现 `overrideLastUserMessage is not defined` 的报错。

- 2025-12-18 13:05（聊天气泡：自动处理 <br> 换行）
  - **AI 回覆换行**：聊天气泡渲染会把 AI 输出里的 `<br>` / `&lt;br&gt;` 自动转为真实换行（同个气泡内显示），避免把 `<br>` 当作纯文本显示。

- 2025-12-18 13:08（未读计数：删除消息不再全变未读）
  - **修复**：删除消息时若刚好删到 `lastReadMessageId` 指针，会自动把已读指针回退到邻近消息，避免退出聊天室后未读计数从头计算导致“全变未读”。

- 2025-12-18 13:23（群聊/动态摘要注入：YAML 精简）
  - **Token 优化**：群聊成员私聊摘要回顾与目标私聊摘要回顾改为 YAML 分组格式（`user与角色:` + 列表），移除每条前缀“用户与…的私聊摘要（时间…）”，仅在最新一条摘要追加「距今…」。

- 2025-12-18 13:31（未读计数：前台聊天室自动已读）
  - **体验**：当用户正在该聊天室（聊天页打开且当前会话）时收到 AI 回覆，会立即标记为已读，不计入未读红点。

- 2025-12-18 13:43（动态评论：默认折叠为 3 条）
  - **折叠策略**：动态卡片默认只显示最近 3 条评论，其余折叠；点击“展开查看更多评论”后再显示全部。

- 2025-12-18 13:55（性能优化：减少重复渲染与滚动抖动）
  - **列表刷新节流**：`refreshChatAndContacts` 合并到下一帧执行，多次调用只刷新一次；无联系人搜索词时不再触发搜索过滤。
  - **历史预载批量渲染**：`ChatUI.preloadHistory` 使用 `DocumentFragment` 一次性 append，并只滚动一次，减少 layout thrash。
  - **流式回覆节流**：`startAssistantStream.update` 改为每帧更新一次 DOM+滚动，减少频繁 `scrollToBottom()` 引起的卡顿。

- 2025-12-18 14:42（摘要管理：手动大总结 + 批量编辑/删除）
  - **手动生成大总结**：好友设置/群聊设置的「大总结」旁新增按钮，可强制触发生成/刷新（即使摘要总字数未超过阈值）。
  - **摘要批量操作**：好友设置/群聊设置的「摘要」旁新增批量操作按钮，支持进入多选模式后批量删除、批量编辑（按行对应）。

- 2025-12-18 14:44（大总结手动触发：等待完成再刷新）
  - **交互修复**：手动触发大总结改为返回 Promise 并等待后台总结完成后再刷新摘要/大总结区域，避免“点了按钮但 UI 没更新”的错觉。

- 2025-12-18 14:56（大总结生成器初始化：全局可用）
  - **修复**：将大总结生成器从 `handleSend` 内部提升到应用初始化阶段，并暴露为 `window.appBridge.requestSummaryCompaction` / `globalThis.__chatappRequestSummaryCompaction`，修复设置页手动触发时报“未找到大总结生成器”。

- 2025-12-18 15:01（手动大总结：输出格式校验 + 解析失败提示）
  - **校验**：生成的大总结若不包含可识别结构（如 `【关键事件】` 与条目符号），视为解析失败，不写入大总结。
  - **提示**：手动触发生成后若解析失败，会弹出提醒说明失败并建议重试。

- 2025-12-18 15:05（大总结：<summary> 包裹 + 解析提取 + 编辑/删除）
  - **格式调整**：大总结提示词要求把正文放在 `<summary>...</summary>` 中输出，并提取标签内文本作为大总结内容存储。
  - **编辑/删除**：好友设置/群聊设置的大总结区域增加编辑按钮（✎）与删除按钮（🗑）。

- 2025-12-18 15:21（大总结生成：沿用完整上下文但禁用聊天提示词）
  - **上下文一致**：大总结请求改为复用正常构建 prompt 的逻辑（用户信息/世界书/预设等都生效），但通过 `meta.disableChatGuide` 去掉聊天提示词（`<chat_guide>`）。
  - **位置**：大总结专用 prompt 作为最后一条 user 消息追加，确保“放在提示词最下面”。

- 2025-12-18 15:28（大总结：查看原始回覆）
  - **原始回覆存储**：生成大总结时会保存模型原始回覆到 `compactedSummary.raw`，便于排查解析失败或调试输出。
  - **查看入口**：好友设置/群聊设置的大总结区新增「查看原始回覆」按钮（📄），点击弹窗展示本次大总结原始回覆并支持复制。

- 2025-12-18 15:34（大总结解析失败：仍保留原始回覆）
  - **改进**：即使解析失败（缺少 `<summary>` 或格式不符合），仍会把原始回覆写入 `compactedSummaryLastRaw`，供「查看原始回覆」按钮查看与排查。

- 2025-12-18 15:48（大总结提示词位置：紧跟 lastUserMessage）
  - **位置调整**：大总结请求在 prompt 中改为 `{{lastUserMessage}}`（固定为“请总结。”且不追加场景提醒）后换行紧接大总结提示词；不再把大总结提示词作为“最末尾 user message”追加。

- 2025-12-18 16:01（大总结提示词位置回调：放回最末尾）
  - **回调**：大总结提示词恢复为“提示词最下面”的最后一条 user message；并将 `{{lastUserMessage}}` 覆盖为“开始总结，勿输出聊天格式”（且不追加场景提醒）。

- 2025-12-18 16:33（预设导入完整性 + 群聊历史发言人修复）
  - **预设导入**：OpenAI 预设导入后若 `prompt_order` 不完整（或存在多个 `prompt_order` 块），会在加载时合并/补齐 `prompt_order[0].order`，确保区块不丢失且构建 prompt 时可用（对齐 ST 导出差异）。
  - **群聊历史发言人**：构建群聊 prompt 时，history 的 assistant 行会使用每条消息自身的 `name` 作为发言人前缀，而不是统一使用群聊名称。

- 2025-12-18 16:50（预设导入：对齐 ST prompt_order 选择）
  - **修复**：导入/保存 OpenAI 预设时会即时 normalize，支持 `prompts` 为对象 map（key=identifier）、`prompt_order` 为对象 map，以及 `order` 项为数字索引等变体，避免导入后区块缺失。
    - **对齐 ST**：UI/构建 prompt 时选择 `prompt_order` 优先使用 `character_id=100001`（SillyTavern PromptManager dummyId），回退到 `100000/第一个`，避免错误选择导致“区块少很多”。

- 2025-12-18 16:54（预设导入：仅使用 character_id=100001）
  - **调整**：OpenAI 预设导入/保存时只保留 `prompt_order.character_id=100001` 的区块顺序，不再合并/补齐其他 character_id 的 order，也不自动把未在该 order 中的 prompts 追加进去，避免出现“多余区块”。

- 2025-12-18 17:04（预设面板：保存不再跳回预设1 + 导入名带文件名）
  - **修复**：`PresetStore.upsert()` 更新已有预设时不再隐式改写 active 指针，避免“保存多个草稿后 active 被最后一次保存覆盖”导致 UI 自动跳回预设1。
  - **体验**：导入预设时默认名称改为导入文件名（优先使用 JSON 内的 `name`，否则用文件名去扩展名）。 

- 2025-12-18 17:36（正则：随预设切换 + 删除预设可连带删除 + 发送时一律生效）
  - **切换联动**：预设切换后自动同步正则启用状态：只启用当前 active 预设所绑定的正则集合，其他预设绑定集合自动停用（`RegexStore.syncPresetBindings`）。
  - **删除连带**：删除预设时若检测到绑定正则集合，会弹窗询问是否一并删除，确认后同时删除对应正则集合。
  - **发送生效**：发送 prompt 时会把启用的“用户输入正则”全部应用到 outgoing prompt（包含原本仅用于显示的 `markdownOnly` 规则）。

- 2025-12-18 17:52（用户输入正则：修复“最新输入被跳过导致正则不生效”）
  - **修复**：`{{lastUserMessage}}` 的“已注入则不追加 user 消息”判定收紧为仅当 **USER-role** 的 prompt block/extraPromptBlocks 使用该占位符时才生效，避免某些预设依赖 `USER_INPUT` 正则包裹最新输入却因未追加 user 消息而丢失输入内容。

- 2025-12-18 20:19（动态评论 prompt：移除 moment_id/comment_id + moment_reply 兼容无 moment_id）
  - **调整**：动态评论任务注入给模型的 `promptData` 不再包含 `moment_id`、`comment_id`、`user_comment_id`、`reply_to_comment_id` 等 ID 字段，减少噪音与泄漏。
  - **兼容**：`moment_reply` 解析允许缺省 `moment_id::`；在“动态评论”任务中用已知的当前动态 id 回填；在聊天协议解析中若缺失 momentId 则忽略该事件以免误写入。

- 2025-12-18 21:10（Android OOM：KV/请求负载限额与瘦身）
  - **ChatStore 持久化瘦身**：`chat_store_v1` 落盘会剔除超大 dataURL/原始回覆、并对消息/摘要/存档做上限裁剪，避免 `save_kv` 通过 JS<->native bridge 传输超大 payload 导致 WebView OOM。
  - **Prompt 历史硬上限**：构建 outgoing history 时按 `openai_max_context/openai_max_tokens` 推导字符预算并裁剪，避免生成请求体过大。
  - **OpenAI provider 兜底**：请求体过大时直接报错提示清理历史/注入内容，避免 native `http_request` 触发 OOM。
  - **load_kv 防护**：`load_kv` 遇到超大 JSON 文件（>10MiB）返回轻量 stub，允许前端启动后覆盖写回瘦身后的数据。

- 2025-12-18 21:35（聊天记录加载：仅渲染最新 + 上滑加载更早）
  - **UI 懒加载**：进入聊天室/启动预载时只渲染最近 90 条消息；滚动到顶部会自动 prepend 更早 90 条（避免一次性把长历史全部塞进 DOM/内存）。
  - **头像渲染对齐**：聊天消息不再持久化每条消息的 `avatar`（避免重复 base64 造成膨胀），改为渲染时从联系人资料/默认头像动态补齐。
  - 文件修改：
    - 修改：`src/scripts/ui/app.js`
    - 修改：`src/scripts/ui/chat/chat-ui.js`
    - 修改：`src/scripts/storage/chat-store.js`

- 2025-12-19 09：34（对话输出清洗 + 协议解析失败不回退原文）
  - **去重**：AI 回覆若开头重复了用户发言（形如 `{{user}}：...`），会在展示/入库前过滤掉这些前缀行。
  - **过滤 XML**：AI 回覆中出现的 XML/HTML 标签及其块内容会被剔除，避免把结构化标签误显示成正文。
  - **协议解析回退**：对话模式二次解析失败后不再把原始回覆整段塞进聊天室；原始回覆仍保留在「三 > 原始回复」查看。
  - 文件修改：
    - 修改：`src/scripts/ui/app.js`

- 2025-12-19 10:10（群聊协议解析：<br> 不再破坏 speaker/content/time）
  - **修复**：群聊对话协议解析不再在分段前把 `<br>` 直接替换为换行；改为用内部标记先提取 `speaker--content--HH:MM` 片段，避免 `<br>` 出现在内容中时把一条消息拆断，导致头像匹配失败/渲染异常（灰字/默认头像）。
  - 文件修改：
    - 修改：`src/scripts/ui/chat/dialogue-stream-parser.js`

- 2025-12-20 0：38（消息缓存发送模式：半透明气泡 + 蓝点提示）
  - **核心机制**：
    - **Enter 键缓存**：用户按 Enter 键时，消息以半透明气泡（opacity: 0.5）显示在聊天室中，标记为 `status: 'pending'`，不立即发送 API 请求。
    - **蓝点提示**：聊天列表与联系人列表显示蓝色数字徽章（`background: #199AFF`），标识该会话有多少条待发送消息（红点 = 未读，蓝点 = 待发送）。
    - **发送到这里**：长按 pending 气泡弹出菜单，选择"🚀 发送到这里"：
      - 点击第 1 条 pending → 仅发送第 1 条
      - 点击第 N 条 pending → 发送第 1 到第 N 条（合并为一个请求，换行分隔）
    - **智能合并**：多条 pending 消息发送时，在请求体中用 `\n` 合并为一条（避免 API 限流），但聊天室中保持独立气泡，发送成功后所有气泡变为不透明（`status: 'sent'`）。
    - **按聊天室隔离**：每个会话（群聊/私聊/动态）独立维护 pending 队列，切换会话时蓝点数量自动更新。
  - **视觉设计**：
    - pending 气泡：半透明 + 蓝色虚线边框 + "⏱️ 待发送"标签
    - sending 气泡：opacity 0.6（发送中）
    - sent 气泡：opacity 1.0（正常显示）
  - **交互优化**：
    - 有 pending 消息时，点击发送按钮会自动合并所有 pending 消息 + 输入框内容一起发送
    - AI 回复触发私聊时，原 pending 消息不受影响，仍显示为半透明可操作
  - **Bug 修复**：
    - 修复：退出聊天室再进入时 pending 消息变不透明（`decorateMessagesForDisplay` 未保留 `status` 字段）
    - 修复：有 pending 消息时点击发送按钮报错"未找到指定消息"（未处理输入框 + pending 混合场景）
    - 修复：多条 pending 消息被合并成一个大气泡（发送时误创建新 userMsg）
  - 文件修改：
    - 新增：`src/scripts/ui/pending-message-panel.js`（已删除，采用新方案）
    - 修改：`src/scripts/storage/chat-store.js`（扩展 session 结构，添加 `pending: []` 字段 + pending 消息管理方法）
    - 修改：`src/scripts/ui/chat/chat-ui.js`（新增 `onSendWithMode` 方法区分 Enter/发送按钮 + 长按菜单显示"发送到这里"）
    - 修改：`src/scripts/ui/app.js`（新增 `handleEnter` 缓存逻辑 + 修改 `handleSend` 支持 pending 合并发送 + 聊天列表/联系人列表显示蓝点）
    - 修改：`src/assets/css/qq-legacy.css`（新增 `.message-pending` 半透明样式 + 蓝色虚线边框 + "待发送"标签）
- 2025-12-20 00:44
  - 缓存消息修复：进入聊天室渲染历史时保留 `status`，发送按钮忽略事件参数避免误判 targetId，发送完成统一将 pending 标记为 sent。
- 2025-12-20 00:55
  - 缓存消息修复：非流式模式下发送成功会提前标记 `sendSucceeded`，确保 pending 最终变回不透明。
- 2025-12-20 01:01
  - 发送中消息改为不透明（sending 状态 opacity = 1），确保点发送后立即变为正常气泡。
- 2025-12-20 01:12
  - 缓存消息浮层：当 pending 不在消息尾部时（例如部分发送后 AI 回覆），在输入框上方显示待发送悬浮列表，可点击跳转到对应消息。
  - 修改：`src/scripts/ui/app.js`
  - 修改：`src/assets/css/qq-legacy.css`
- 2025-12-20 01:28
  - 缓存消息改为「浮层队列」：AI 回覆后将剩余 pending 从聊天记录移除并转入悬浮区，点击浮层可执行发送/删除。
  - 修复：发送 prompt 时历史记录不再包含 pending/sending 消息。
  - 修改：`src/scripts/ui/app.js`
- 2025-12-20 01:46
  - 贴图面板：输入框左侧改为「+」，点击后隐藏键盘并展示贴图选择区，点击贴图会插入 `[bqb-关键词]` 到输入框。
  - 发送/缓存贴图：用户输入的贴图 token 会以 sticker 气泡显示，pending 发送时使用 token 进入上下文。
  - 修改：`src/index.html`
  - 修改：`src/assets/css/qq-legacy.css`
  - 修改：`src/scripts/ui/app.js`
  - 修改：`src/scripts/utils/media-assets.js`
- 2025-12-20 02:05
  - 贴图输入预览：输入框内的 `[bqb-关键词]` 自动在输入框上方渲染小图预览（提示词保持不变）。
  - 动态菜单：动态页右上角 ⚙ 菜单增加「原始回复」，查看本次动态评论的完整 AI 原文。
  - 修改：`src/index.html`
  - 修改：`src/assets/css/qq-legacy.css`
  - 修改：`src/scripts/ui/app.js`
- 2025-12-20 02:18
  - 贴图混排渲染：气泡内出现 `[bqb-关键词]` 时会替换为贴图并自动换行，文本与贴图可混排显示。
  - 修改：`src/scripts/ui/chat/chat-ui.js`
  - 修改：`src/assets/css/qq-legacy.css`
- 2025-12-20 02:34
  - 对话解析兜底：解析失败时追加 MiPhone 标签去括号重试；缺失时间的 `speaker--content` 片段支持拆分成独立气泡。
  - 动态评论解析兜底：动态评论回覆未解析时同样追加去括号重试。
  - 修改：`src/scripts/ui/chat/dialogue-stream-parser.js`
  - 修改：`src/scripts/ui/app.js`
- 2025-12-20 02:48
  - 群聊解析补强：当缺失时间的多条 `speaker--content` 夹在有时间的片段之间，改为拆分成多条气泡；尾部缺失时间片段也会被补解析。
  - 修改：`src/scripts/ui/chat/dialogue-stream-parser.js`
- 2025-12-20 03:05
  - 群聊新增聊天管理：支持「开启新聊天」并展示/加载历史存档，逻辑与私聊一致。
  - 修改：`src/scripts/ui/group-chat-panels.js`
  - 修改：`src/scripts/ui/app.js`
- 2025-12-20 03:18
  - 群聊 AI 角色名为“系统/系统消息”时转为系统消息样式；群聊保存成员变更后立即刷新显示系统消息。
  - 修改：`src/scripts/ui/app.js`
  - 修改：`src/scripts/ui/group-chat-panels.js`
- 2025-12-22 20:02
  - 预设绑定正则：仅在对应预设启用时生效；切换预设会自动同步启用状态。
  - MiPhone 兜底解析：未命中 `<content>` 时优先匹配 `MiPhone_start/end` 再继续解析。
  - 修改：`src/scripts/ui/bridge.js`
  - 修改：`src/scripts/ui/chat/dialogue-stream-parser.js`
- 2025-12-22 20:30
  - Prompt 占位符补齐：OpenAI prompt block、角色描述与 scenario/personality 格式支持 {{user}}/{{char}}/{{group}}/{{members}} 等宏替换。
  - 修改：`src/scripts/ui/bridge.js`
- 2025-12-22 21:05
  - Prompt 结构调整：<chat_guide> 与世界书同位置注入；世界书不再重复；清理块之间多余空行。
  - 修改：`src/scripts/ui/bridge.js`
- 2025-12-27 20:45
  - 群聊提示词补充系统消息格式示例；系统消息解析支持邀请/移除成员并自动追加“加入群聊”系统提示。
  - 发送后清理待发送队列，修复缓存消息发送后蓝点残留。
  - 进入聊天室时若仍在生成回复，恢复显示等待动画。
  - 修改：`src/scripts/ui/app.js`
  - 修改：`src/scripts/ui/bridge.js`
- 2025-12-27 22:29
  - 未读分割线：进入聊天室定位到首条未读时插入灰色“以下为未读讯息”分割线，复进无新讯息则不显示。
  - 修改：`src/assets/css/qq-legacy.css`
  - 修改：`src/scripts/ui/app.js`
  - 修改：`src/scripts/ui/chat/chat-ui.js`
- 2025-12-28 00:33
  - 进入聊天室时优先定位未读分割线，不自动滚到底部，避免跳转失效。
  - 修改：`src/scripts/ui/app.js`
  - 修改：`src/scripts/ui/chat/chat-ui.js`

## 2025-12-31 11:20
- 富文本 iframe：兼容 SillyTavern 的 resizeIframe 消息，使用 event.source 定位对应 iframe 并更新高度。
- 修改：
  - `src/scripts/ui/chat/rich-text-renderer.js`

## 2025-12-31 12:07
- 推理格式（Reasoning）：新增预设类型与默认模板（对齐 ST），支持自动解析/展开/写回提示词等设置。
- 推理解析：AI 回复自动拆分 reasoning 与正文，推理套用 REASONING 正则并以折叠块显示。
- chat_history：可按设定将推理块写回 prompt（限制次数），其余聊天历史逻辑保持不变。
- 修改：
  - `src/assets/presets/st-defaults.json`
  - `src/scripts/storage/preset-store.js`
  - `src/scripts/storage/app-settings.js`
  - `src/scripts/ui/preset-panel.js`
  - `src/scripts/ui/bridge.js`
  - `src/scripts/ui/app.js`
  - `src/scripts/ui/chat/chat-ui.js`
  - `src/scripts/ui/regex-panel.js`
  - `src/assets/css/qq-legacy.css`

## 2025-12-31 13:22
- 通用设定新增“创意写作注入条数”，允许自定义 chat_history 中创意写作回复的注入数量（默认 3）。
- chat_history 在创意写作模式按该数值保留最新创意写作回复。
- 修改：
  - `src/scripts/storage/app-settings.js`
  - `src/scripts/ui/general-settings-panel.js`
  - `src/scripts/ui/app.js`

## 2025-12-31 14:47
- 通用设定新增“创意写作气泡加宽”开关，仅影响创意写作回复气泡的横向宽度。
- 创意写作回复气泡可占满聊天横轴（保留少量边距），不影响聊天模式布局。
- 修改：
  - `src/scripts/storage/app-settings.js`
  - `src/scripts/ui/general-settings-panel.js`
  - `src/scripts/ui/app.js`
  - `src/scripts/ui/chat/chat-ui.js`
  - `src/assets/css/qq-legacy.css`

## 2025-12-31 15:20
- 修复 creative 发送时报错：将推理解析助手函数提到顶层作用域，避免 extractReasoningFromContent 未定义。
- 修改：
  - `src/scripts/ui/app.js`

## 2025-12-31 17:31
  - 富文本 iframe：脚本模式未 ready 时回退到 host 加载，确保自定义脚本执行。
  - host 端保留 body 属性与 base，并补发 DOMContentLoaded/load 事件。
  - 修改：`src/scripts/ui/chat/rich-text-renderer.js`
  - 修改：`src/iframe-host.js`

## 2026-01-05
- Phase 4：记忆表格注入 prompt（预算截断 + wrapper + 位置控制）。
- 新增记忆检查器（调试入口）：展示注入/截断列表、Token 统计、Prompt 预览、刷新与复制。
- Phase 5A：记忆模式灰度开关（调试面板切换，默认摘要）。
- Phase 6A：模板导入导出补强（校验提示、导入确认、内置/导入分区）。
- Phase 5B：记忆模式切换 UI（通用设定入口 + 切换确认提示）。
- Phase 6B：记忆数据导入导出（范围选择、冲突处理、模板切换数据处理）。
- Phase 6B：导入去重与冲突确认（内容重复检测 + 预导入统计）。
- Phase 6B：冲突处理 UI（面板选择代替 prompt/confirm）。
- Phase 6B：模板切换迁移/清空流程改为面板选择。
- Phase 6B：模板导入覆盖/设默认改为面板确认。
- Phase 6B：导出范围与对象选择改为面板式 UI；导入支持保留原 ID/重命名；创建支持自定义 ID。
- Phase 6B：内容相似检测提示与跳过策略补齐。
- 修改：
  - `src/scripts/ui/bridge.js`
  - `src/scripts/ui/app.js`
  - `src/scripts/ui/debug-panel.js`
  - `src/scripts/ui/general-settings-panel.js`
  - `src/scripts/ui/memory-template-panel.js`
  - `src/scripts/memory/template-schema.js`

## 2026-01-08
- 记忆模板写入队列修复：补充超时重置与调试状态（pending/last command/reset），避免写入被挂起阻塞。
- 记忆模板管理刷新诊断：输出 ensure/get/force 超时与空列表原因，空模板时自动写入默认模板。
- 私聊角色档案“性格”必填改由系统判定；若为空在写表提示词里强制提示补齐（默认模板仍为 v1.0.0）。
- 修改：
  - `src/scripts/storage/memory-template-store.js`
  - `src/scripts/ui/memory-template-panel.js`
  - `src/scripts/ui/bridge.js`
  - `src/scripts/memory/default-template.js`

## 2026-01-12 17:10
- 贴图面板优化：点击“+”弹出行动面板，贴图入口独立；贴图面板支持分页/小点指示、左右滑动、最近使用/默认/新增分区，默认贴图图标使用 feather 图。
- 贴图滚动改为原生横向 scroll-snap，滑动有过渡感并能预览相邻页；修复旧 transform 造成的贴图空白问题。
- 记忆表格：摘要表注入限制为最新 10 条；新增私聊/群聊总体大纲表并全部注入；默认模板版本更新为 1.0.1。
- 记忆表格写表提示词补充：摘要/大纲仅允许 insert；新聊天“仅清空摘要”也会清理大纲。
- 记忆表格提示词预览改为沿用当前设置（max rows/tokens/位置/深度等），避免预算不一致导致预览空白。
- 修改：
  - `src/scripts/ui/app.js`
  - `src/scripts/ui/bridge.js`
  - `src/scripts/ui/contact-settings-panel.js`
  - `src/scripts/ui/group-chat-panels.js`
  - `src/scripts/ui/memory-table-editor.js`
  - `src/scripts/memory/memory-prompt-utils.js`
  - `src/scripts/memory/default-template.js`
  - `src/assets/css/qq-legacy.css`

## 2026-01-14 17:31
- 聊天设置：气泡/字体支持“当前/全局”应用；新增恢复默认按钮；新会话继承全局颜色。
- 壁纸设置：支持拖拽上传、预览裁剪（拖拽/缩放/旋转）；本地保存并按需加载；无操作 2 分钟进入仅壁纸屏保模式。
- 壁纸显示修正：顶部渐变区域遮挡壁纸。
- Persona：新增用户气泡颜色设置（默认 #E8F0FE）。
- 默认颜色调整（气泡 #c9c9c9、字体 #1F2937）；聊天设置弹窗加宽；气泡与头像间距加大。
- 表情包加载增加本地路径 fallback 与重试逻辑，降低桌面加载失败概率。
- 修改：
  - `src/index.html`
  - `src/assets/css/qq-legacy.css`
  - `src/scripts/ui/app.js`
  - `src/scripts/ui/chat/chat-ui.js`
  - `src/scripts/storage/app-settings.js`
  - `src/scripts/storage/chat-store.js`
  - `src/scripts/storage/persona-store.js`
  - `src/scripts/ui/persona-panel.js`
  - `src/scripts/utils/media-assets.js`
  - `src-tauri/src/commands.rs`
  - `src-tauri/src/lib.rs`

## 2026-01-16
- 分片聊天存储（chat_store_v2）：新增索引/分片读写与会话清理指令，前端写入/更新/删除与按需加载逻辑落地。
- ChatStore v2 迁移：旧 v1 会话迁移成分片，归档改为记录 messageCount，加载最近分片并支持滚动拉取更早消息。
- UI 接入：进入会话/恢复状态时异步加载最近分片，滚动到顶加载更早分片，存档加载改为 await。
- 修改：
  - `src-tauri/src/commands.rs`
  - `src-tauri/src/lib.rs`
  - `src/scripts/storage/chat-store.js`
  - `src/scripts/ui/app.js`
  - `src/scripts/ui/contact-settings-panel.js`
  - `src/scripts/ui/group-chat-panels.js`
