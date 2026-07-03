const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const normalizeToken = value => trim(value)
  .toLowerCase()
  .replace(/\s+/g, '');

const list = value => (Array.isArray(value) ? value : [value])
  .map(item => trim(item))
  .filter(Boolean);

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

export const APP_FEATURE_DEFINITIONS = Object.freeze([
  {
    id: 'session.create',
    title: '创建聊天室',
    aliases: ['创建聊天室', '新建聊天室', '添加好友', '创建联系人', '新建联系人', '开一个聊天室'],
    summary: '创建一个私聊联系人和对应聊天室。',
    uiPath: ['顶部 +', '好友列表', '输入新好友名称', '添加'],
    tools: ['session.create', 'session.list'],
    argsHint: 'name 创建单个聊天室；names[] 创建多个聊天室',
    panel: 'session',
    riskLevel: 'low',
    writes: true,
    confirmation: 'none_for_create',
    firstRunGuide: 'session.create.guide',
    directAction: 'session.create',
    verification: {
      tool: 'session.list',
      args: {},
      success: '新建聊天室出现在会话列表中',
    },
  },
  {
    id: 'session.open',
    title: '打开聊天室',
    aliases: ['打开聊天室', '进入聊天室', '切换聊天室', '打开会话', '切换会话'],
    summary: '切换到指定联系人或群组的聊天室。',
    uiPath: ['聊天列表', '点击联系人或群组'],
    tools: ['session.open'],
    panel: 'chat',
    riskLevel: 'low',
    writes: false,
    confirmation: 'none',
    firstRunGuide: 'session.open.guide',
    directAction: 'session.open',
  },
  {
    id: 'session.config.open',
    title: '打开会话配置',
    aliases: ['会话配置', '聊天室配置', '当前会话配置', '打开会话配置', '配置聊天室'],
    summary: '打开当前聊天室或指定聊天室的会话配置面板。',
    uiPath: ['聊天室标题', '会话配置'],
    tools: ['session.open_config'],
    panel: 'session-config',
    riskLevel: 'low',
    writes: false,
    confirmation: 'none',
    firstRunGuide: 'session.config.open.guide',
    directAction: 'session.open_config',
  },
  {
    id: 'persona.create',
    title: '创建角色卡',
    aliases: ['创建角色卡', '新建角色卡', '创建角色', '新建角色', '添加角色卡', '添加角色'],
    summary: '创建一个 APP 角色卡/角色档案，可作为当前角色启用。',
    uiPath: ['头像/角色入口', '角色卡', '管理角色卡', '新建'],
    tools: ['persona.create', 'app.read_resource'],
    panel: 'persona',
    riskLevel: 'medium',
    writes: true,
    confirmation: 'allow_once',
    firstRunGuide: 'persona.create.guide',
    directAction: 'persona.create',
    verification: {
      tool: 'app.read_resource',
      args: { resource: 'persona' },
      success: '角色卡列表包含新建的角色卡',
    },
  },
  {
    id: 'persona.switch',
    title: '切换角色卡',
    aliases: ['切换角色卡', '切换角色', '使用角色卡', '换成角色卡', '设为当前角色卡'],
    summary: '按名称或 id 切换当前 APP 角色卡。',
    uiPath: ['头像/角色入口', '角色卡', '选择角色卡'],
    tools: ['persona.switch', 'app.read_resource'],
    argsHint: 'target/name/personaId: 角色卡名称或 id',
    panel: 'persona',
    riskLevel: 'low',
    writes: true,
    confirmation: 'allow_once',
    firstRunGuide: 'persona.switch.guide',
    directAction: 'persona.switch',
    verification: {
      tool: 'app.read_resource',
      args: { resource: 'persona' },
      success: '当前角色卡已切换为目标角色卡',
    },
  },
  {
    id: 'persona.avatar.set',
    title: '设置角色卡头像',
    aliases: ['设置角色头像', '设置角色卡头像', '把图片设为角色头像', '把这张图设为角色头像', '用这张图当角色头像', '更换角色头像', '角色换头像', '换角色头像'],
    summary: '把本次女仆输入中附带的图片自动裁切压缩后设置为指定或当前角色卡头像。',
    uiPath: ['头像/角色入口', '角色卡', '编辑头像'],
    tools: ['media.prepare_image', 'persona.set_avatar'],
    argsHint: 'persona.set_avatar: target/personaId/name 可指定角色卡；attachmentId 可指定本次附图，省略时使用第一张图；不要把 base64 写入 args；目标已有头像时必须由用户点击确认后才会覆盖',
    panel: 'persona',
    riskLevel: 'medium',
    writes: true,
    confirmation: 'allow_once',
    firstRunGuide: '',
    directAction: 'persona.set_avatar',
    // 工具结果即权威（applied/sent），无需读回验证。
    verification: null,
  },
  {
    id: 'user.create',
    title: '创建用户名称',
    aliases: ['创建用户名称', '新建用户名称', '创建用户', '新建用户', '用户名称', '用户名'],
    summary: '创建一个用户档案/用户名称，可设为当前用户。',
    uiPath: ['头像/用户入口', '用户', '管理用户', '新建'],
    tools: ['user.create', 'app.read_resource'],
    panel: 'user',
    riskLevel: 'medium',
    writes: true,
    confirmation: 'allow_once',
    firstRunGuide: 'user.create.guide',
    directAction: 'user.create',
    verification: {
      tool: 'app.read_resource',
      args: { resource: 'user' },
      success: '用户列表包含新建的用户名称',
    },
  },
  {
    id: 'user.switch',
    title: '切换用户名称',
    aliases: ['切换用户名称', '切换用户', '使用用户', '换成用户', '设为当前用户'],
    summary: '按名称或 id 切换当前 APP 用户档案/用户名称。',
    uiPath: ['头像/用户入口', '用户', '选择用户'],
    tools: ['user.switch', 'app.read_resource'],
    argsHint: 'target/name/userId: 用户名称或 id',
    panel: 'user',
    riskLevel: 'low',
    writes: true,
    confirmation: 'allow_once',
    firstRunGuide: 'user.switch.guide',
    directAction: 'user.switch',
    verification: {
      tool: 'app.read_resource',
      args: { resource: 'user' },
      success: '当前用户已切换为目标用户',
    },
  },
  {
    id: 'user.avatar.set',
    title: '设置用户头像',
    aliases: ['设置用户头像', '把图片设为用户头像', '把这张图设为用户头像', '用这张图当我的头像', '更换用户头像', '更换我的头像'],
    summary: '把本次女仆输入中附带的图片自动裁切压缩后设置为指定或当前用户头像。',
    uiPath: ['头像/用户入口', '用户', '编辑头像'],
    tools: ['media.prepare_image', 'user.set_avatar'],
    argsHint: 'user.set_avatar: target/userId/name 可指定用户；attachmentId 可指定本次附图，省略时使用第一张图；不要把 base64 写入 args；目标已有头像时必须由用户点击确认后才会覆盖',
    panel: 'user',
    riskLevel: 'medium',
    writes: true,
    confirmation: 'allow_once',
    firstRunGuide: '',
    directAction: 'user.set_avatar',
    // 工具结果即权威（applied/sent），无需读回验证。
    verification: null,
  },
  {
    id: 'contact.avatar.set',
    title: '设置联系人头像',
    aliases: ['设置联系人头像', '设置聊天室头像', '把图片设为联系人头像', '把这张图设为联系人头像', '把图设为角色聊天头像', '更换好友头像'],
    summary: '把本次女仆输入中附带的图片自动裁切压缩后设置为指定或当前聊天室联系人头像。',
    uiPath: ['联系人/聊天室', '资料或设置', '头像'],
    tools: ['media.prepare_image', 'contact.set_avatar'],
    argsHint: 'contact.set_avatar: target/sessionId/sessionName/chatName/name 可指定联系人或聊天室；attachmentId 可指定本次附图，省略时使用第一张图；不要把 base64 写入 args；目标已有头像时必须由用户点击确认后才会覆盖',
    panel: 'session',
    riskLevel: 'medium',
    writes: true,
    confirmation: 'allow_once',
    firstRunGuide: '',
    directAction: 'contact.set_avatar',
    // 工具结果即权威（applied/sent），无需读回验证。
    verification: null,
  },
  {
    id: 'session.wallpaper.set',
    title: '设置聊天室壁纸',
    aliases: ['设置聊天室壁纸', '设置会话壁纸', '把图片设为壁纸', '把这张图设为壁纸', '用这张图当聊天背景', '更换聊天室背景'],
    summary: '把本次女仆输入中附带的图片自动缩放压缩后设置为指定或当前聊天室壁纸。',
    uiPath: ['聊天室标题', '会话配置', '壁纸'],
    tools: ['media.prepare_image', 'session.set_wallpaper'],
    argsHint: 'session.set_wallpaper: target/sessionId/sessionName/chatName/name 可指定聊天室；attachmentId 可指定本次附图，省略时使用第一张图；opacity 可选；不要把 base64 写入 args；目标已有壁纸时必须由用户点击确认后才会覆盖',
    panel: 'session-config',
    riskLevel: 'medium',
    writes: true,
    confirmation: 'allow_once',
    firstRunGuide: '',
    directAction: 'session.set_wallpaper',
    // 工具结果即权威（applied/sent），无需读回验证。
    verification: null,
  },
  {
    id: 'worldbook.create',
    title: '创建世界书',
    aliases: ['创建世界书', '新建世界书', '写世界书', '世界书条目', '绑定世界书'],
    summary: '创建世界书或向现有世界书追加条目，并可绑定到指定角色卡；默认不覆盖旧条目。',
    uiPath: ['聊天室右上角菜单', '世界书', '新建/编辑条目', '保存', '绑定角色卡'],
    tools: ['worldbook.create'],
    argsHint: 'entries[] 必填；name 可省略，缺省时使用当前角色卡世界书；mode 默认 append，会保留旧条目；create_new 强制新建副本；replace 只有用户点击确认后才会覆盖，否则自动新建副本；personaName/personaId/bindToPersona 可选',
    panel: 'worldbook',
    riskLevel: 'medium',
    writes: true,
    confirmation: 'allow_once',
    firstRunGuide: 'worldbook.create.guide',
    directAction: 'worldbook.create',
    verification: {
      tool: 'worldbook.read',
      argsFrom: { name: 'result.worldbookId|args.name|args.worldbookId|args.id' },
      requiredArgs: ['name'],
      success: '写入的条目出现在世界书中且条目数符合预期',
    },
  },
  {
    id: 'worldbook.update_entries',
    title: '修改世界书条目',
    aliases: ['修改世界书条目', '更新世界书条目', '替换世界书条目', '扩展世界书条目', '改写世界书内容', '把世界书条目替换成扩展版'],
    summary: '按条目更新现有世界书内容，不会替换未指定条目；修改已有条目前需要用户确认。',
    uiPath: ['聊天室右上角菜单', '世界书', '选择条目', '编辑', '保存'],
    tools: ['worldbook.update_entries', 'worldbook.read'],
    argsHint: 'worldbook.update_entries: name/worldbookId/id/sessionId 指定世界书；updates[] 每项用 entryId/entryTitle/title/query 定位条目，可写入 content/title/keys/secondaryKeys 等；修改已有内容会要求用户确认；长正文请分批更新 1-3 个条目，写完后用 worldbook.read 验证',
    panel: 'worldbook',
    riskLevel: 'medium',
    writes: true,
    confirmation: 'allow_once',
    firstRunGuide: '',
    directAction: 'worldbook.update_entries',
    verification: {
      tool: 'worldbook.read',
      argsFrom: { name: 'result.worldbookId|args.name|args.worldbookId|args.id' },
      requiredArgs: ['name'],
      success: '更新后的条目内容已读回确认',
    },
  },
  {
    id: 'worldbook.delete_entries',
    title: '删除世界书条目',
    aliases: ['删除世界书条目', '清理世界书重复条目', '去重世界书条目', '清理重复世界书', '删除重复条目', '删掉重复世界书条目'],
    summary: '按条目或按标题去重删除现有世界书内容；删除前必须由用户确认。',
    uiPath: ['聊天室右上角菜单', '世界书', '选择条目', '删除'],
    tools: ['worldbook.read', 'worldbook.delete_entries'],
    argsHint: 'worldbook.delete_entries: name/worldbookId/id/sessionId 指定世界书；entries/deletes 可按 entryId/entryTitle/title/query 删除；清理同名重复条目用 dedupeByTitle:true、duplicateTitles/titles 指定标题、keep:first/last 指定保留哪一条；删除前必须用户确认，删除后用 worldbook.read 验证',
    panel: 'worldbook',
    riskLevel: 'high',
    writes: true,
    confirmation: 'allow_once',
    firstRunGuide: '',
    directAction: 'worldbook.delete_entries',
    verification: {
      tool: 'worldbook.read',
      argsFrom: { name: 'result.worldbookId|args.name|args.worldbookId|args.id' },
      requiredArgs: ['name'],
      success: '被删除条目不再出现且剩余条目数符合预期',
    },
  },
  {
    id: 'worldbook.list',
    title: '查看世界书列表',
    aliases: ['查看世界书列表', '有哪些世界书', '列出世界书', '世界书库列表', '我的世界书列表'],
    summary: '读取已保存世界书列表，并标记当前会话或全局绑定。',
    uiPath: ['世界书', '世界书库'],
    tools: ['worldbook.list'],
    argsHint: 'sessionId 可指定会话；includeGlobal 默认 true；limit 控制返回数量',
    panel: 'worldbook',
    riskLevel: 'low',
    writes: false,
    confirmation: 'allow_once',
    firstRunGuide: '',
    directAction: 'worldbook.list',
  },
  {
    id: 'worldbook.bind_session',
    title: '绑定世界书到聊天室',
    aliases: ['绑定世界书到聊天室', '给聊天室绑定世界书', '启用聊天室世界书', '给会话启用世界书', '把世界书用于聊天室', '聊天室使用世界书'],
    summary: '把已有世界书追加启用到指定聊天室，不修改世界书条目，也不会删除其他绑定。',
    uiPath: ['聊天室右上角菜单', '世界书', '世界书库', '选择启用'],
    tools: ['worldbook.bind_session', 'worldbook.list', 'worldbook.read'],
    argsHint: 'worldbook.bind_session: worldbookId 必填；sessionId/sessionName/target/chatName 指定聊天室；mode 默认 append，会保留已有绑定；replace 才会替换绑定列表',
    panel: 'worldbook',
    riskLevel: 'medium',
    writes: true,
    confirmation: 'allow_once',
    firstRunGuide: '',
    directAction: 'worldbook.bind_session',
    verification: {
      tool: 'worldbook.list',
      argsFrom: { sessionId: 'args.sessionId|args.sessionName|result.sessionId' },
      success: '目标世界书出现在该聊天室的绑定列表中',
    },
  },
  {
    id: 'worldbook.read',
    title: '读取世界书内容',
    aliases: ['读取世界书', '查看世界书内容', '看我的世界书', '看当前世界书', '世界书里有什么'],
    summary: '读取指定或当前会话世界书的条目标题、关键词和内容摘要。',
    uiPath: ['世界书', '选择世界书', '查看条目'],
    tools: ['worldbook.read'],
    argsHint: 'name/worldbookId/id 指定世界书；省略时读取当前会话世界书；默认返回条目索引和短预览；需要正文时传 includeContent:true、entryId、entryTitle 或 query；maxEntries/maxContentLength 控制返回量',
    panel: 'worldbook',
    riskLevel: 'low',
    writes: false,
    confirmation: 'allow_once',
    firstRunGuide: '',
    directAction: 'worldbook.read',
  },
  {
    id: 'chat.send_message',
    title: '发送聊天消息',
    aliases: ['发送聊天消息', '发送消息', '发消息', '给聊天室发消息', '在聊天室发送', '发hi', '发晚上好'],
    summary: '向指定聊天室写入一条聊天消息，并可打开该聊天室。',
    uiPath: ['聊天室', '输入框', '发送'],
    tools: ['chat.send_message'],
    argsHint: 'sessionId/sessionName/target/chatName 指定聊天室；content/message/text 指定要发送的内容；role 默认 user；triggerReply 默认 true 会触发正常回复请求，false 仅写入消息',
    panel: 'chat',
    riskLevel: 'medium',
    writes: true,
    confirmation: 'allow_once',
    firstRunGuide: 'chat.send_message.guide',
    directAction: 'chat.send_message',
    // 工具结果即权威（applied/sent），无需读回验证。
    verification: null,
  },
  {
    id: 'config.api.open',
    title: '打开 API 配置',
    aliases: ['设置API', '配置API', '模型配置', '供应商配置', 'key设置', 'api key'],
    summary: '打开聊天模型和 API 配置界面。',
    uiPath: ['设置', 'API / 模型配置'],
    tools: ['app.open_panel'],
    panel: 'config',
    riskLevel: 'low',
    writes: false,
    confirmation: 'none',
    firstRunGuide: 'config.api.open.guide',
    directAction: 'app.open_panel',
  },
  {
    id: 'agent.center.open',
    title: '打开 Agent Center',
    aliases: ['agent center', 'agent中心', '智能体中心', '打开agent', '助手设置'],
    summary: '打开 Agent 能力、待处理、资源和安全中心。',
    uiPath: ['设置', 'Agent Center'],
    tools: ['app.open_panel'],
    panel: 'agent-center',
    riskLevel: 'low',
    writes: false,
    confirmation: 'none',
    firstRunGuide: 'agent.center.open.guide',
    directAction: 'app.open_panel',
  },
  {
    id: 'worldbook.open',
    title: '打开世界书',
    aliases: ['世界书', '打开世界书', '世界信息', 'worldbook', '世界设定'],
    summary: '打开当前会话世界书管理界面。',
    uiPath: ['聊天室右上角菜单', '世界书'],
    tools: ['app.open_panel'],
    panel: 'worldbook',
    riskLevel: 'low',
    writes: false,
    confirmation: 'none',
    firstRunGuide: 'worldbook.open.guide',
    directAction: 'app.open_panel',
  },
  {
    id: 'memory.open',
    title: '打开记忆',
    aliases: ['记忆', '记忆表格', '打开记忆', 'memory', '记忆管理'],
    summary: '打开记忆表格和模板管理界面。',
    uiPath: ['设置', '记忆'],
    tools: ['app.open_panel'],
    panel: 'memory',
    riskLevel: 'low',
    writes: false,
    confirmation: 'none',
    firstRunGuide: 'memory.open.guide',
    directAction: 'app.open_panel',
  },
  {
    id: 'variables.open',
    title: '打开变量',
    aliases: ['变量', '打开变量', '变量面板', 'mvu变量', '状态变量'],
    summary: '打开当前会话变量和全局变量界面。',
    uiPath: ['聊天室右上角菜单', '变量'],
    tools: ['app.open_panel'],
    panel: 'variables',
    riskLevel: 'low',
    writes: false,
    confirmation: 'none',
    firstRunGuide: 'variables.open.guide',
    directAction: 'app.open_panel',
  },
  {
    id: 'regex.open',
    title: '打开正则',
    aliases: ['正则', '正则规则', '后处理', 'regex', '打开正则'],
    summary: '打开正则和后处理规则管理界面。',
    uiPath: ['设置', '正则 / 后处理'],
    tools: ['app.open_panel'],
    panel: 'regex',
    riskLevel: 'low',
    writes: false,
    confirmation: 'none',
    firstRunGuide: 'regex.open.guide',
    directAction: 'app.open_panel',
  },
  {
    id: 'app.state.read',
    title: '查看当前 APP 状态',
    aliases: ['当前状态', '当前会话状态', '用了哪些资源', '当前资源', '状态摘要'],
    summary: '读取当前页面、UI 模式、会话和可见状态摘要。',
    uiPath: [],
    tools: ['app.get_current_state'],
    panel: '',
    riskLevel: 'low',
    writes: false,
    confirmation: 'none',
    firstRunGuide: '',
    directAction: 'app.get_current_state',
  },
  {
    id: 'app.visible_panel.read',
    title: '读取当前界面摘要',
    aliases: ['看当前界面', '看看页面上有什么', '读取界面信息', '界面摘要', '当前窗口内容'],
    summary: '读取当前可见面板或聊天界面的结构化摘要（文字、按钮及激活状态、表单字段填写情况），帮助女仆理解用户正在看的页面；API key/密码类字段只标记不返回值。',
    uiPath: [],
    tools: ['app.ui.inspect', 'app.read_visible_panel_summary'],
    panel: '',
    riskLevel: 'low',
    writes: false,
    confirmation: 'allow_once',
    firstRunGuide: '',
    directAction: 'app.ui.inspect',
  },
  {
    id: 'app.resource.read',
    title: '读取 APP 结构化资源',
    aliases: [
      '读取APP资源',
      '读取结构化信息',
      '读取聊天完整回复',
      '查看AI完整回复',
      '读取正则',
      '读取变量',
      '读取记忆',
      '读取预设',
      '读取配置',
      '读取世界书设置',
      '读取世界书生成模板',
      '世界书AI生成模板',
      '生成模板',
    ],
    summary: '读取聊天消息、世界书设置、正则、变量、记忆、预设、配置、会话、角色卡或用户等结构化 APP 数据。',
    uiPath: [],
    tools: ['app.read_resource'],
    argsHint: 'resource 指定 chat/worldbook/regex/variables/memory/preset/config/session/persona/user；worldbook 默认返回条目索引、全局设置与 AI 生成模板，需正文时传 includeContent:true、entryId、entryTitle 或 query；sessionId/sessionName/target/chatName/id/name/limit/include 可选；读取聊天时可用聊天室名称定位',
    panel: '',
    riskLevel: 'low',
    writes: false,
    confirmation: 'allow_once',
    firstRunGuide: '',
    directAction: 'app.read_resource',
  },
  {
    id: 'maid.todo',
    title: '女仆任务清单',
    aliases: ['任务清单', '任务进度', '待办清单', '进度怎么样', '做到哪一步了', '当前任务进度'],
    summary: '记录和查看当前女仆任务的待办清单与进度；复杂多步任务应先写清单，每完成一步更新状态。',
    uiPath: [],
    tools: ['maid.todo.write', 'maid.todo.read'],
    argsHint: 'maid.todo.write: todos[] 每项含 content 和 status(pending/in_progress/completed)，整体替换当前清单；maid.todo.read 无参数',
    panel: '',
    riskLevel: 'low',
    writes: false,
    confirmation: 'none',
    firstRunGuide: '',
    directAction: 'maid.todo.read',
  },
  {
    id: 'app.errors.read',
    title: '查看最近错误',
    aliases: ['最近错误', '刚才为什么失败', '为什么失败', '失败原因', '为什么出错', '报错了', '哪里出错了', '执行失败原因', '刚才工具为什么失败'],
    summary: '读取最近女仆任务失败记录和工具错误，用于解释刚才哪里出了问题。',
    uiPath: [],
    tools: ['app.read_recent_errors'],
    argsHint: 'limit 可选，控制返回的失败记录数量（默认 10）',
    panel: '',
    riskLevel: 'low',
    writes: false,
    confirmation: 'none',
    firstRunGuide: '',
    directAction: 'app.read_recent_errors',
  },
  {
    id: 'app.capabilities.search',
    title: '检索女仆能力',
    aliases: ['你能做什么', '有什么功能', '功能列表', '支持什么功能', '会做什么', '怎么用女仆', '能力列表'],
    summary: '按用户说法检索 APP 功能目录，返回候选能力和对应工具；对不确定的请求应先检索能力再决定工具。',
    uiPath: [],
    tools: ['app.search_feature', 'app.read_feature_doc'],
    argsHint: 'app.search_feature: query 必填、limit 可选，返回候选功能；app.read_feature_doc: featureId 必填，返回该功能的说明、工具、参数提示和风险等级',
    panel: '',
    riskLevel: 'low',
    writes: false,
    confirmation: 'none',
    firstRunGuide: '',
    directAction: 'app.search_feature',
  },
  {
    id: 'web.search',
    title: '联网搜索网页',
    aliases: ['联网搜索', '上网搜索', '搜索网页', '查最新消息', '查资料', '今天新闻', '最新资讯', '网页读取'],
    summary: '在用户询问当前、外部或公开网络信息时搜索网页，并可读取指定网页正文或自动阅读前几条来源；不要用于读取 APP 私有数据。',
    uiPath: [],
    tools: ['web.search', 'web.fetch_url', 'web.research'],
    argsHint: 'web.search: query 必填，limit/provider 可选；web.fetch_url: url 必填；web.research: query 必填，会搜索并读取前几条来源，回答时应给出来源链接或来源名称',
    panel: '',
    riskLevel: 'low',
    writes: false,
    confirmation: 'allow_once',
    firstRunGuide: '',
    directAction: 'web.search',
  },
]);

const buildBigramSet = (value = '') => {
  const grams = new Set();
  for (let i = 0; i < value.length - 1; i += 1) grams.add(value.slice(i, i + 2));
  return grams;
};

// 别名与用户说法之间常有插入词（如“世界书重复了帮我清理”对“清理重复世界书”），
// 子串匹配覆盖不到；按别名 bigram 覆盖率给部分分。为避免“删除世界书条目”这类别名
// 借宾语命中创建类请求，要求别名首个 bigram（通常是动词）命中，或覆盖率达到 0.75。
const scorePartialAliasMatch = (aliases = [], queryGrams = new Set()) => {
  let best = 0;
  aliases.forEach((alias) => {
    if (alias.length < 4) return;
    const aliasGrams = buildBigramSet(alias);
    if (aliasGrams.size < 2) return;
    let matched = 0;
    aliasGrams.forEach((gram) => {
      if (queryGrams.has(gram)) matched += 1;
    });
    const coverage = matched / aliasGrams.size;
    if (matched < 2 || coverage < 0.5) return;
    if (!queryGrams.has(alias.slice(0, 2)) && coverage < 0.75) return;
    best = Math.max(best, Math.min(78, 55 + matched * 5));
  });
  return best;
};

const scoreFeature = (feature = {}, query = '') => {
  const q = normalizeToken(query);
  if (!q) return 0;
  const id = normalizeToken(feature.id);
  const title = normalizeToken(feature.title);
  const aliases = list(feature.aliases).map(normalizeToken);
  if (id === q || title === q || aliases.includes(q)) return 100;
  if (id.includes(q) || title.includes(q)) return 80;
  if (aliases.some(alias => alias.includes(q) || q.includes(alias))) return 70;
  const partial = scorePartialAliasMatch(aliases, buildBigramSet(q));
  if (partial > 0) return partial;
  const haystack = normalizeToken([
    feature.id,
    feature.title,
    feature.summary,
    ...list(feature.aliases),
    ...list(feature.uiPath),
  ].join(' '));
  if (haystack.includes(q)) return 45;
  return 0;
};

const searchFeatureList = (features = APP_FEATURE_DEFINITIONS, query = '', { limit = 5 } = {}) => {
  const max = Math.max(1, Math.min(20, Math.trunc(Number(limit) || 5)));
  return (Array.isArray(features) ? features : [])
    .map(feature => ({ feature, score: scoreFeature(feature, query) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || trim(a.feature?.id).localeCompare(trim(b.feature?.id)))
    .slice(0, max)
    .map(item => ({ ...clone(item.feature), score: item.score }));
};

export const listAppFeatures = () => APP_FEATURE_DEFINITIONS.map(clone);

export const findAppFeature = (featureId = '') => {
  const id = trim(featureId);
  if (!id) return null;
  const normalized = normalizeToken(id);
  const found = APP_FEATURE_DEFINITIONS.find(feature =>
    feature.id === id ||
    normalizeToken(feature.id) === normalized ||
    normalizeToken(feature.title) === normalized ||
    list(feature.aliases).some(alias => normalizeToken(alias) === normalized)
  );
  return found ? clone(found) : null;
};

export const searchAppFeatures = (query = '', { limit = 5 } = {}) => {
  return searchFeatureList(APP_FEATURE_DEFINITIONS, query, { limit });
};

export const buildAppFeatureDoc = (featureId = '') => {
  const feature = findAppFeature(featureId);
  if (!feature) return null;
  return {
    ...feature,
    doc: [
      feature.summary,
      feature.uiPath?.length ? `界面路径：${feature.uiPath.join(' -> ')}` : '',
      feature.tools?.length ? `可用工具：${feature.tools.join(', ')}` : '',
      feature.argsHint ? `参数提示：${feature.argsHint}` : '',
      `风险等级：${feature.riskLevel || 'low'}`,
      feature.writes ? '会写入 APP 数据。' : '只读或只打开界面。',
      feature.confirmation && feature.confirmation !== 'none' ? `确认策略：${feature.confirmation}` : '',
      feature.verification?.tool
        ? `验证方式：执行后用 ${feature.verification.tool} 读回确认${feature.verification.success ? `（${feature.verification.success}）` : ''}`
        : '',
    ].filter(Boolean).join('\n'),
  };
};

export const buildAppFeatureKnowledgeText = (features = listAppFeatures()) => (
  (Array.isArray(features) ? features : [])
    .map(feature => [
      `${trim(feature.title, feature.id)} (${trim(feature.id)})`,
      trim(feature.summary),
      list(feature.uiPath).length ? `路径：${list(feature.uiPath).join(' -> ')}` : '',
      list(feature.tools).length ? `工具：${list(feature.tools).join(', ')}` : '',
      feature.argsHint ? `参数：${feature.argsHint}` : '',
    ].filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n\n')
);

export const buildAppFeatureSearchContextText = (query = '', {
  features = listAppFeatures(),
  limit = 5,
} = {}) => {
  const text = trim(query);
  const matches = searchFeatureList(features, text, { limit });
  return [
    `检索：${text ? '已执行' : '未执行'}`,
    `命中：${matches.length ? matches.map(item => item.title || item.id).join('、') : '无'}`,
    ...matches.map(feature => [
      `${trim(feature.title, feature.id)} (${trim(feature.id)})`,
      trim(feature.summary),
      list(feature.uiPath).length ? `路径：${list(feature.uiPath).join(' -> ')}` : '',
      list(feature.tools).length ? `工具：${list(feature.tools).join(', ')}` : '',
      feature.argsHint ? `参数：${feature.argsHint}` : '',
    ].filter(Boolean).join('\n')),
  ].filter(Boolean).join('\n');
};
