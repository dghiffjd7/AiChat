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
    argsHint: 'sessionId/sessionName/target/chatName/name 可指定聊天室；省略时打开当前会话配置',
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
    tools: ['media.prepare_image', 'contact.set_avatar', 'web.search_images', 'media.fetch_image'],
    argsHint: 'contact.set_avatar: target/sessionId/sessionName/chatName/name 可指定联系人或聊天室；attachmentId 可指定本次附图，省略时使用第一张图；不要把 base64 写入 args；目标已有头像时必须由用户点击确认后才会覆盖。用户没发图但要求联网找图时：先 web.search_images 搜索——动漫角色传 tags 用 booru 标签格式（如 rem_(re:zero)、tifa_lockhart）并设 style:anime；壁纸设 purpose:wallpaper；真人/写实设 style:photo。然后 media.fetch_image 下载所选 imageUrl 得到 attachmentId，再设置',
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
    tools: ['media.prepare_image', 'session.set_wallpaper', 'web.search_images', 'media.fetch_image'],
    argsHint: 'session.set_wallpaper: target/sessionId/sessionName/chatName/name 可指定聊天室；attachmentId 可指定本次附图，省略时使用第一张图；opacity 可选；不要把 base64 写入 args；目标已有壁纸时必须由用户点击确认后才会覆盖。用户没发图但要求联网找图时：先 web.search_images 搜索——动漫角色传 tags 用 booru 标签格式（如 rem_(re:zero)、tifa_lockhart）并设 style:anime；壁纸设 purpose:wallpaper；真人/写实设 style:photo。然后 media.fetch_image 下载所选 imageUrl 得到 attachmentId，再设置',
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
    summary: '创建世界书或向现有世界书追加条目，并可绑定到指定角色卡；默认不覆盖旧条目。长正文条目优先用 worldbook.generate_entries 只传大纲。',
    uiPath: ['聊天室右上角菜单', '世界书', '新建/编辑条目', '保存', '绑定角色卡'],
    tools: ['worldbook.create', 'worldbook.generate_entries'],
    argsHint: 'worldbook.create: entries[] 必填（含完整 content）；name 可省略，缺省时使用当前角色卡世界书；mode 默认 append 保留旧条目；create_new 强制新建副本；replace 只有用户点击确认后才会覆盖。生成较长条目正文（约 100 字以上）时优先用 worldbook.generate_entries：只传 name 和 entries[]（每项 title+outline 要点大纲+length 目标字数+keys 可选），正文由 sub-agent 模型（<sub_agents> 中按能力选 subAgentId，无配置则主模型）生成后自动追加写入，不要自己在 JSON 里写长正文',
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
    id: 'chat.image.generate',
    title: '生成图片发到聊天室',
    aliases: ['生成图片', '生图', '画一张', '画图', '给我画', 'AI画图', '生成一张图', '生成图片发给', '用这张图生成', '参考这张图生成', '图生图'],
    summary: '用当前配置的生图模型按提示词生成图片，可引用本次女仆输入中的图片，并以用户身份发到指定聊天室。',
    uiPath: ['聊天室', '输入框', '+', '生成图片'],
    tools: ['chat.generate_image'],
    argsHint: 'prompt 必填：完整的图片描述（主体外观、动作、风格），描述要具体；sessionId/sessionName/target 指定聊天室（缺省当前）；negativePrompt 可选；referenceImages 可选，填写本次女仆附图的 ID、名称或序号数组（如 [1]），不要传 base64。生成可能耗时超过 1 分钟，耐心等待工具返回；成功后图片会直接出现在聊天室里，不需要再调用 chat.send_message 发送图片。',
    panel: 'chat',
    riskLevel: 'medium',
    writes: true,
    confirmation: 'allow_once',
    firstRunGuide: '',
    directAction: 'chat.generate_image',
    // 工具结果即权威（generated/sessionId），无需读回验证。
    verification: null,
  },
  {
    id: 'moments.publish',
    title: '发布动态',
    aliases: ['发动态', '发布动态', '帮我发条动态', '发个动态', '发一条动态', '发朋友圈', '发说说', '替我发动态'],
    summary: '以用户身份在动态页发布一条动态；发布后角色们可自动前来评论。',
    uiPath: ['动态', '发布动态'],
    tools: ['moments.publish'],
    argsHint: 'content 必填：动态正文（以用户口吻撰写，不要写成女仆的口吻；文内可用 @联系人名 提及联系人）；generateComments 默认 true 会让角色们自动评论（调用模型），用户明确说不要评论时传 false。发布成功即完成，不需要跳转页面或再次确认。',
    panel: '',
    riskLevel: 'medium',
    writes: true,
    confirmation: 'allow_once',
    firstRunGuide: '',
    directAction: 'moments.publish',
    // 工具结果即权威（persist 返回 momentId），无需读回验证。
    verification: null,
  },
  {
    id: 'chat.format.profile',
    title: '会话格式画像',
    aliases: ['格式画像', '记住这个格式', '这个卡是什么格式', '查看格式规范', '这个角色卡的输出格式', '保存格式规范'],
    summary: '查看或保存会话的自定义格式规范缓存（从正则/世界书/角色卡调查所得）；保存后修复该会话格式时自动使用，无需重新调查。',
    uiPath: [],
    tools: ['chat.read_format_profile', 'chat.save_format_profile'],
    argsHint: 'chat.read_format_profile: sessionId/sessionName/target 可选（缺省当前会话）；chat.save_format_profile: guide 必填（提炼后的格式规范文本，含必需标签/结构/示例），sources[] 可选记录来源（type: regex/worldbook/persona/preset，ref: 名称）',
    panel: '',
    riskLevel: 'low',
    writes: false,
    confirmation: 'none',
    firstRunGuide: '',
    directAction: 'chat.read_format_profile',
  },
  {
    id: 'chat.message.optimize',
    title: '优化回复正文',
    aliases: ['优化正文', '润色一下', '润色这条回复', '写得更简洁', '精简这条回复', '帮我精简', '太啰嗦了', '改得自然一点', '删掉重复的句子', '优化表达', '重写得流畅一些'],
    summary: '按用户指示优化 AI 回复的文字表达（精简、润色、去重复、调整叙述风格），主要用于创意写作正文；只改表达不改剧情事实；写回前用户会在行级 diff 预览中确认。',
    uiPath: [],
    tools: ['chat.optimize_message'],
    argsHint: 'chat.optimize_message: instruction 必填——把用户的优化要求原样或概括传入（如「删掉重复句子」「更简洁」「增强画面感」）；messageId 可选（缺省优化最近一条 AI 回复）；sessionId/sessionName/target 可选。格式坏了要用 chat.repair_message_format 而不是本工具',
    panel: '',
    riskLevel: 'medium',
    writes: true,
    confirmation: 'allow_once',
    firstRunGuide: '',
    directAction: 'chat.optimize_message',
    // 写回前必经行级 diff 用户确认，工具返回 applied 即权威。
    verification: null,
  },
  {
    id: 'chat.format.repair',
    title: '修复回复格式',
    aliases: ['掉格式了', '格式坏了', '修复格式', '格式修复', '回复格式不对', '格式错了', '修一下格式', '渲染坏了', '这条回复格式有问题'],
    summary: '把格式错误的 AI 回复修成正确格式；写回前用户会在行级 diff 预览中确认。内建格式可直接修复；自定义格式先查找格式定义再修复。',
    uiPath: ['长按 AI 回复', '检查格式'],
    tools: ['chat.repair_message_format', 'app.read_resource', 'chat.read_format_profile', 'chat.save_format_profile'],
    argsHint: 'chat.repair_message_format: messageId 可选（缺省修最近一条 AI 回复）；sessionId/sessionName/target 可选；内建格式（聊天/动态/生图标签）无需 formatHint 直接调用。自定义格式（重前端角色卡等）：先 chat.read_format_profile 查会话格式画像——有则直接调用修复（引擎会自动使用画像）；没有才用 app.read_resource 按 preset（格式提醒）-> regex（渲染正则的匹配模式即格式规范）-> worldbook/persona（输出格式段落）顺序查找，把找到的规范作为 formatHint 传入并用 chat.save_format_profile 保存画像供下次直接使用；全部找不到时如实告知用户并请其补充，不要编造格式',
    panel: '',
    riskLevel: 'medium',
    writes: true,
    confirmation: 'allow_once',
    firstRunGuide: '',
    directAction: 'chat.repair_message_format',
    // 写回前必经行级 diff 用户确认，工具返回 applied 即权威。
    verification: null,
  },
  {
    id: 'config.model.switch',
    title: '切换模型渠道',
    aliases: ['换渠道', '切换渠道', '换模型渠道', '切换模型', '换生图渠道', '切生图模型', '用NAI', '换回byteplus', '渠道列表', '有哪些渠道'],
    summary: '查看并切换已保存的模型渠道档：聊天文本模型（scope=chat）或生图模型（scope=image）的活跃配置。',
    uiPath: ['设置', 'API / 模型配置', '连线设置档'],
    tools: ['config.list_profiles', 'config.switch_profile'],
    argsHint: 'scope 必填：chat=聊天文本模型，image=生图模型（用户说"生图/画图渠道"就是 image）。先 config.list_profiles 查看有哪些档和当前活跃；config.switch_profile 传 profileName 或 profileId（模糊名会自动匹配，多个候选时会返回 candidates，此时向用户确认再切）；切换影响之后的所有请求，已是活跃档时返回 alreadyActive。',
    panel: 'config',
    riskLevel: 'medium',
    writes: true,
    confirmation: 'allow_once',
    firstRunGuide: '',
    directAction: 'config.list_profiles',
    // 工具结果即权威（switched/from/to），无需读回验证。
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
    id: 'maid.onboarding',
    title: '女仆新手引导',
    aliases: ['女仆新手任务', '新手引导', '带我上手', '教我配置API', '带我添加好友', '第一次聊天教学', '认识女仆和Agent Center'],
    summary: '启动零 AI 依赖的内建分步教学，可带用户配置 API、添加好友、完成第一次对话或认识女仆与 Agent Center。',
    uiPath: ['女仆指令条', '新手任务'],
    tools: ['guide.start_flow'],
    argsHint: 'flowId 必填，只能是 setup-api、add-friend、first-chat、meet-maid 之一；用户想学习这些功能时优先启动教学，不要代替用户完成步骤',
    panel: '',
    riskLevel: 'low',
    writes: false,
    confirmation: 'none',
    firstRunGuide: '',
    directAction: 'guide.start_flow',
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
    id: 'app.ui.capture_region',
    title: '查看选区截图',
    aliases: [
      '截图选区',
      '截取选区',
      '看看这里的画面',
      '看看这里为什么错位',
      '看看圈选的图片是什么',
      '选区图片内容',
      '这里配色好看吗',
      '比较圈选区域的布局',
      '区域文字被遮住',
      '视觉检查',
      '检查遮挡',
      '检查配色',
      '检查布局',
    ],
    summary: '截取用户用圈选按钮明确选择的 APP 区域，并把截图仅注入本轮女仆视觉上下文，用于检查图片、布局、颜色、错位或遮挡。',
    uiPath: ['女仆输入框', '圈选', '拖拽选择区域'],
    tools: ['ui.capture_region'],
    argsHint: 'regionId 必填，只能使用 <user_selection> 中给出的区域ID；语义文字足够时不要截图，涉及图片、布局、颜色、错位或遮挡时再调用；成功结果 imageInjected:true 表示下一轮已能直接看图，不要重复截图同一区域',
    panel: '',
    riskLevel: 'low',
    writes: false,
    confirmation: 'none',
    firstRunGuide: '',
    directAction: 'ui.capture_region',
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
    id: 'app.ui.click',
    title: '界面点击操作',
    aliases: ['帮我点', '点击按钮', '点一下', '界面操作', '自动点击'],
    summary: '按结构化引用点击当前可见界面的按钮（先 app.ui.inspect 获取 ref/label）；点击后自动返回最新界面摘要供核对；删除/覆盖/发送类按钮会请求用户确认。',
    uiPath: [],
    tools: ['ui.click_element', 'app.ui.inspect'],
    argsHint: 'ui.click_element: 先 app.ui.inspect 拿到按钮的 ref（如 agent-center:btn-3）或唯一 label，传 ref 优先（label 重复时会要求改用 ref）；点击结果的 after 字段是点击后的界面摘要，用它核对状态变化；危险按钮（删除/覆盖/清空/发送等）会弹确认，用户拒绝时如实停止',
    panel: '',
    riskLevel: 'medium',
    writes: true,
    confirmation: 'allow_once',
    firstRunGuide: '',
    directAction: 'app.ui.inspect',
    verification: null,
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
    summary: '在用户询问当前、外部或公开网络信息时搜索网页或图片，并可读取指定网页正文或自动阅读前几条来源；不要用于读取 APP 私有数据。',
    uiPath: [],
    tools: ['web.search', 'web.fetch_url', 'web.research', 'web.search_images'],
    argsHint: 'web.search: query 必填，limit/provider 可选；web.fetch_url: url 必填；web.research: query 必填，会搜索并读取前几条来源，回答时应给出来源链接或来源名称；web.search_images: query 必填（建议用英文/角色全名效果更好），返回图片 imageUrl 列表，配合 media.fetch_image 下载后可用于头像/壁纸',
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

export const searchAppFeatures = (query = '', { limit = 5, features = APP_FEATURE_DEFINITIONS } = {}) => {
  return searchFeatureList(features, query, { limit });
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

// YAML 列表呈现（层次分明），供女仆设定面板与知识注入使用。
const knowledgeYamlText = (value = '') => {
  const text = trim(value);
  if (!text) return "''";
  return /[:#\[\]{}\n"']/g.test(text) ? JSON.stringify(text) : text;
};

export const buildAppFeatureKnowledgeText = (features = listAppFeatures()) => (
  (Array.isArray(features) ? features : [])
    .map(feature => [
      `- id: ${knowledgeYamlText(feature.id)}`,
      `  title: ${knowledgeYamlText(feature.title)}`,
      trim(feature.summary) ? `  summary: ${knowledgeYamlText(feature.summary)}` : '',
      list(feature.uiPath).length ? `  path: ${knowledgeYamlText(list(feature.uiPath).join(' -> '))}` : '',
      list(feature.tools).length ? `  tools: [${list(feature.tools).map(knowledgeYamlText).join(', ')}]` : '',
      feature.argsHint ? `  args: ${knowledgeYamlText(feature.argsHint)}` : '',
    ].filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n')
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
