export const tasks = [
  {
    id: 'pilot-001',
    batch: 'pilot',
    category: 'session-read',
    prompt: '先别切换页面，帮我数一下目前总共有多少个聊天会话，并说出最上面三个会话的名称。',
    expectedFeatures: ['session.list'],
    expectedTools: ['session.list'],
    autoConfirm: true,
  },
  {
    id: 'pilot-002',
    batch: 'pilot',
    category: 'app-state',
    prompt: '不用猜，请读取 APP 状态后告诉我：现在是什么模式、停在哪个页面和哪个聊天室。',
    expectedFeatures: ['app.state.read'],
    expectedTools: ['app.get_current_state'],
    autoConfirm: true,
  },
  {
    id: 'pilot-003',
    batch: 'pilot',
    category: 'resource-read',
    prompt: '我想核对状态数据：这个会话目前保存了哪些会话变量？只读取，不要打开变量编辑界面。',
    expectedFeatures: ['app.resource.read'],
    expectedTools: ['app.read_resource'],
    autoConfirm: true,
  },
  {
    id: 'pilot-004',
    batch: 'pilot',
    category: 'open-intent',
    prompt: '把当前聊天室的变量管理面板打开给我看。',
    expectedFeatures: ['variables.open'],
    expectedTools: ['app.open_panel'],
    autoConfirm: true,
    followGuide: true,
  },
  {
    id: 'pilot-005',
    batch: 'pilot',
    category: 'worldbook-read',
    prompt: '列出世界书库中的书名即可，不要读取条目正文，也不要改动绑定。',
    expectedFeatures: ['worldbook.list'],
    expectedTools: ['worldbook.list'],
    autoConfirm: true,
  },
  {
    id: 'pilot-006',
    batch: 'pilot',
    category: 'config-read',
    prompt: '查一下聊天文本模型的连线档：当前启用哪一个档、服务商和模型分别是什么？不要进行切换。',
    expectedFeatures: ['config.model.switch'],
    expectedTools: ['config.list_profiles'],
    autoConfirm: true,
  },
  {
    id: 'pilot-007',
    batch: 'pilot',
    category: 'multi-step',
    prompt: '完成三件事：先建立待办清单；再读取会话总数；然后读取当前 APP 页面状态；最后核对待办并汇报。不要创建或删除任何会话。',
    expectedFeatures: ['maid.todo', 'session.list', 'app.state.read'],
    expectedTools: ['maid.todo.write', 'session.list', 'app.get_current_state', 'maid.todo.read'],
    autoConfirm: true,
  },
  {
    id: 'pilot-008',
    batch: 'pilot',
    category: 'capability-discovery',
    prompt: '如果我想检查最近的 APP 错误，女仆有哪些相关能力和工具？只说明能力，不要执行错误读取。',
    expectedFeatures: ['app.capabilities.search'],
    expectedAnyTools: ['app.search_feature', 'app.read_feature_doc'],
    autoConfirm: true,
  },
  {
    id: 'pilot-009',
    batch: 'pilot',
    category: 'error-read',
    prompt: '读取最近的错误记录，若没有错误就明确说没有；不要把普通聊天内容当成错误。',
    expectedFeatures: ['app.errors.read'],
    expectedTools: ['app.read_recent_errors'],
    autoConfirm: true,
  },
  {
    id: 'pilot-010',
    batch: 'pilot',
    category: 'no-tool',
    prompt: '这是一条流程控制测试：不要调用任何工具，只回复“已收到冻结观察测试”。',
    expectedFeatures: [],
    expectedTools: [],
    autoConfirm: false,
  },
  {
    id: 'pilot-011',
    batch: 'pilot',
    category: 'sub-agent-worldbook',
    prompt: '新建一本名为「冻结观察SubAgent测试-0728」的世界书，只追加不要覆盖。请让擅长世界观设定的 Sub-agent 根据大纲生成一个约 80 字的条目：标题「雾港规则」，大纲「潮雾笼罩的港口；夜间灯塔发蓝光；船只必须以三短一长鸣笛后才能靠岸」。',
    expectedFeatures: ['worldbook.create'],
    expectedTools: ['worldbook.generate_entries'],
    autoConfirm: true,
    allowSubAgent: true,
    maxMs: 360000,
  },
  {
    id: 'pilot-012',
    batch: 'pilot',
    category: 'sub-agent-verification',
    prompt: '读取「冻结观察SubAgent测试-0728」世界书，确认是否存在「雾港规则」条目，并简述正文；不要修改它。',
    expectedFeatures: ['worldbook.read'],
    expectedTools: ['worldbook.read'],
    autoConfirm: true,
  },
];

const addBatch = (batch, rows) => {
  tasks.push(...rows.map((row, index) => {
    const [
      category,
      prompt,
      expectedFeatures = [],
      expectedTools = [],
      options = {},
    ] = row;
    return {
      id: `${batch}-${String(index + 1).padStart(3, '0')}`,
      batch,
      category,
      prompt,
      expectedFeatures,
      expectedTools,
      autoConfirm: true,
      ...options,
    };
  }));
};

addBatch('obs-01', [
  ['session-read', '不要切换聊天室，读取完整会话清单后告诉我：联系人和群聊合计有多少个，并列出最后三个名称。', ['session.list'], ['session.list']],
  ['app-state', '请从 APP 状态中确认当前 UI 模式、活动页面、会话 ID；不要根据画面自行推测。', ['app.state.read'], ['app.get_current_state']],
  ['visible-ui', '读取目前屏幕上实际可见的面板与主要按钮，给我一份简短界面摘要。', ['app.visible_panel.read'], [], { expectedAnyTools: ['app.ui.inspect', 'app.read_visible_panel_summary'] }],
  ['worldbook-list', '查询世界书库总数，并只列出名称中包含“测试”二字的世界书；不要打开编辑器。', ['worldbook.list'], ['worldbook.list']],
  ['worldbook-read', '查看「雷姆」世界书的条目索引，告诉我条目数量与前五个标题，不需要正文。', ['worldbook.read'], ['worldbook.read']],
  ['resource-regex', '读取当前会话绑定的正则配置，按启用与停用数量汇报，不要打开正则面板。', ['app.resource.read'], ['app.read_resource']],
  ['resource-variables', '从结构化资源读取当前会话变量和全局变量各有多少项，只报数量和少量名称。', ['app.resource.read'], ['app.read_resource']],
  ['resource-memory', '读取当前聊天室的记忆表格资料，说明有哪些表或模板；不要进入记忆管理页。', ['app.resource.read'], ['app.read_resource']],
  ['resource-preset', '检查当前聊天上下文使用的预设资料，告诉我当前预设名称，不要切换。', ['app.resource.read'], ['app.read_resource']],
  ['resource-config', '读取已保存的模型连线配置摘要，隐藏密钥，只告诉我档名、服务商和模型。', ['app.resource.read'], ['app.read_resource']],
  ['resource-session', '读取「测试花园」这间会话的结构化摘要：消息数、是否群聊及配置概况。', ['app.resource.read'], ['app.read_resource']],
  ['resource-persona', '读取角色卡清单，告诉我当前活动角色卡以及角色卡总数。', ['app.resource.read'], ['app.read_resource']],
  ['resource-user', '读取用户名称资料，列出当前用户与可切换的用户名称；不要切换。', ['app.resource.read'], ['app.read_resource']],
  ['resource-chat', '读取当前聊天室最近一条 AI 消息的完整原始回复；只摘录开头和结尾各一小段。', ['app.resource.read'], ['app.read_resource']],
  ['resource-chat-cross-session', '读取「测试花园」最近三条聊天消息的角色与时间，不要打开那个聊天室。', ['app.resource.read'], ['app.read_resource']],
  ['format-profile', '读取当前聊天室的格式画像，说明是否有保存的格式规则，不要修改画像。', ['chat.format.profile'], ['chat.read_format_profile']],
  ['config-read', '列出聊天范围的所有连线档，并指出当前启用档；绝对不要执行切换。', ['config.model.switch'], ['config.list_profiles']],
  ['panel-api', '打开 API／模型配置面板，但不要改任何字段。', ['config.api.open'], ['app.open_panel'], { followGuide: true }],
  ['panel-agent-center', '打开 Agent Center，让我自己查看运行记录。', ['agent.center.open'], ['app.open_panel'], { followGuide: true }],
  ['panel-worldbook', '进入世界书面板即可，不要选书也不要保存。', ['worldbook.open'], ['app.open_panel'], { followGuide: true }],
  ['panel-memory', '把记忆表格管理界面打开，不要编辑任何单元格。', ['memory.open'], ['app.open_panel'], { followGuide: true }],
  ['panel-variables', '请打开变量管理器，停在面板里等待我的下一步。', ['variables.open'], ['app.open_panel'], { followGuide: true }],
  ['panel-regex', '打开正规表达式管理面板，不要启停规则。', ['regex.open'], ['app.open_panel'], { followGuide: true }],
  ['panel-session-config', '打开当前聊天室的会话配置窗口，只查看不保存。', ['session.config.open'], ['session.open_config'], { followGuide: true }],
  ['errors-read', '读取最近五条女仆或工具失败记录，按 failureCode 归类；没有就说没有。', ['app.errors.read'], ['app.read_recent_errors']],
  ['capability-worldbook', '查能力目录：如果我要读取世界书正文，可以使用哪个功能和哪些关键参数？不要真的读取。', ['app.capabilities.search'], [], { expectedAnyTools: ['app.search_feature', 'app.read_feature_doc'] }],
  ['capability-image', '只查询能力说明：女仆有哪些“找图片”和“生成图片”的能力，它们有什么区别？', ['app.capabilities.search'], [], { expectedAnyTools: ['app.search_feature', 'app.read_feature_doc'] }],
  ['capability-export', '在能力目录里找“导出聊天记录”的相关入口，只告诉我路径，不要点击或导出。', ['app.capabilities.search'], [], { expectedAnyTools: ['app.search_feature', 'app.read_feature_doc'] }],
  ['web-search', '联网查一下今天台北的天气概况，给出来源名称；不要修改 APP 数据。', ['web.search'], [], { expectedAnyTools: ['web.search', 'web.research'] }],
  ['web-image-search', '网上找两张橘猫照片并给出图片网址，不要下载、不要设头像或壁纸。', ['web.search'], ['web.search_images']],
  ['no-tool', '不要使用任何工具，用一句话解释“Shadow 模式”在软件测试中的一般含义。', [], [], { autoConfirm: false, autoDeny: true }],
  ['no-tool', '这是响应格式测试，不要调用工具，只输出 JSON：{"received":true}。', [], [], { autoConfirm: false, autoDeny: true }],
  ['worldbook-list', '我只想知道世界书库里有没有叫「花园设定」的书，请查清楚后回答，不读正文。', ['worldbook.list'], ['worldbook.list']],
  ['app-state', '现在究竟停在哪儿？请调用状态读取确认当前页面和会话，不要看标题猜。', ['app.state.read'], ['app.get_current_state']],
  ['resource-preset', '当前实际套用的是哪套提示词预设？从 APP 资源里查，不要打开设置。', ['app.resource.read'], ['app.read_resource']],
  ['resource-user', '有哪些可用的用户身份？读取名单即可，别替我更换。', ['app.resource.read'], ['app.read_resource']],
  ['resource-chat', '把目前最后一轮 AI 回复的 rawOriginal 读出来，回答它是否与显示文本一致。', ['app.resource.read'], ['app.read_resource']],
  ['visible-ui', '先看清当前可见界面，再告诉我有没有打开中的弹窗或侧栏。', ['app.visible_panel.read'], [], { expectedAnyTools: ['app.ui.inspect', 'app.read_visible_panel_summary'] }],
  ['agent-runs-gap', '请查看 Agent Center 的近期运行列表，统计成功、失败和中断各有几条；如果没有专用数据能力就如实说明。', [], [], { expectedAnyTools: ['app.ui.inspect', 'app.read_visible_panel_summary', 'app.open_panel'] }],
  ['moments-read-gap', '看看动态页最近一条动态说了什么，只读取不要发布；如果当前没有可直接读取动态的工具，请明确说明。', [], [], { expectedAnyTools: ['app.ui.inspect', 'app.read_visible_panel_summary', 'app.open_panel'] }],
]);

addBatch('obs-02', [
  ['session-read', '房间清单给我瞅一眼，数数一共有几间；别进去任何一间。', ['session.list'], ['session.list']],
  ['session-read', 'list my chats，并告诉我有没有名称带“测试”的会话。', ['session.list'], ['session.list']],
  ['app-state', '我搁哪个页面、哪个房间里？走状态接口确认一下。', ['app.state.read'], ['app.get_current_state']],
  ['app-state', 'where am I in the app？请用工具查，不要凭上下文猜。', ['app.state.read'], ['app.get_current_state']],
  ['resource-variables', '这屋现在挂着啥 vars？读数据就好，别弹变量编辑器。', ['app.resource.read'], ['app.read_resource']],
  ['panel-variables', '我要动变量，不是问变量内容——把变量面板叫出来。', ['variables.open'], ['app.open_panel'], { followGuide: true }],
  ['resource-regex', '当前绑了哪些后处理规则？只念名单，莫打开 regexp 页面。', ['app.resource.read'], ['app.read_resource']],
  ['panel-regex', '去正则管理那里，我要自己看设置。', ['regex.open'], ['app.open_panel'], { followGuide: true }],
  ['resource-memory', '这个对话的记忆表里都记了啥栏目？从资料层读取。', ['app.resource.read'], ['app.read_resource']],
  ['panel-memory', '把 memory 管理页打开，我不是要你复述内容。', ['memory.open'], ['app.open_panel'], { followGuide: true }],
  ['resource-preset', '咱现在套的是哪份 preset 啊？查名字，别换。', ['app.resource.read'], ['app.read_resource']],
  ['config-read', '目前走哪家 provider、哪个 model？列线配置查一下就行。', ['config.model.switch'], ['config.list_profiles']],
  ['resource-persona', '角色皮有几张？当前是哪张？只读 character cards。', ['app.resource.read'], ['app.read_resource']],
  ['resource-user', '我的 user profiles 有哪些，现用谁？不要动选择。', ['app.resource.read'], ['app.read_resource']],
  ['resource-chat', '上一条助手消息的未加工原文给我核一下，别只抄气泡显示。', ['app.resource.read'], ['app.read_resource']],
  ['resource-chat-cross-session', '不跳房间，偷看一下「测试花园」末条消息是谁发的、几点发的。', ['app.resource.read'], ['app.read_resource']],
  ['worldbook-list', '世借书都有哪些？我可能打错字了，想看的是 worldbook 名单。', ['worldbook.list'], ['worldbook.list']],
  ['worldbook-read', '翻一下「花园设定」的目录页，条目标题就够，正文先别端上来。', ['worldbook.read'], ['worldbook.read']],
  ['format-profile', '这间房有没有固定的回复格式规矩？读取 format profile 看看。', ['chat.format.profile'], ['chat.read_format_profile']],
  ['errors-read', '刚才若有翻车，错误簿里最新三笔是什么？', ['app.errors.read'], ['app.read_recent_errors']],
  ['visible-ui', 'scan 一下当前 UI，告诉我现在露出来哪些 panel。', ['app.visible_panel.read'], [], { expectedAnyTools: ['app.ui.inspect', 'app.read_visible_panel_summary'] }],
  ['panel-api', '模型连线设置在哪？直接替我打开配置页，但别保存。', ['config.api.open'], ['app.open_panel'], { followGuide: true }],
  ['panel-agent-center', '带我去智能体中心，停在那就好。', ['agent.center.open'], ['app.open_panel'], { followGuide: true }],
  ['panel-worldbook', '打开 world info 那一页，不做编辑。', ['worldbook.open'], ['app.open_panel'], { followGuide: true }],
  ['panel-session-config', '把这间聊天的配置摘要窗口打开，我要自己检查。', ['session.config.open'], ['session.open_config'], { followGuide: true }],
  ['capability-search', '你会不会读跨房间消息？先翻功能说明，不要真读任何聊天。', ['app.capabilities.search'], [], { expectedAnyTools: ['app.search_feature', 'app.read_feature_doc'] }],
  ['capability-search', '查查你有没有改角色头像的本事，只说明需要什么输入，不要执行。', ['app.capabilities.search'], [], { expectedAnyTools: ['app.search_feature', 'app.read_feature_doc'] }],
  ['capability-search', '搜一下 APP 能力：怎样查看会话变量、怎样打开变量，两者工具分别是什么？', ['app.capabilities.search'], [], { expectedAnyTools: ['app.search_feature', 'app.read_feature_doc'] }],
  ['web-search', '上网搜“WebView2 remote debugging port”是什么，给我两个来源；不要改 APP。', ['web.search'], [], { expectedAnyTools: ['web.search', 'web.research'] }],
  ['web-image-search', '帮我找三张蓝色灯塔的参考图，只回传搜索结果，不下载。', ['web.search'], ['web.search_images']],
  ['no-tool', '不许用工具：把“冻结观察”四个字原样重复一次。', [], [], { autoConfirm: false, autoDeny: true }],
  ['no-tool', '闲聊题，不要碰 APP：你更喜欢雨天还是晴天？用十个字以内回答。', [], [], { autoConfirm: false, autoDeny: true }],
  ['ambiguous', '帮我看看那个列表。信息不足时请先问我指哪个列表，不要随便打开面板。', [], [], { autoConfirm: false, autoDeny: true }],
  ['ambiguous', '切过去看看。若无法确定目标聊天室，就向我确认，不要猜名称。', [], [], { autoConfirm: false, autoDeny: true }],
  ['resource-session', '「格式修复测试」这会话有多少条消息、啥配置？用结构化 session 资料查。', ['app.resource.read'], ['app.read_resource']],
  ['resource-config', '把各模型档的公开字段整理一下，任何 key/token 都不能出现在回答里。', ['app.resource.read'], ['app.read_resource']],
  ['resource-worldbook', '世界书的 AI 生成模板现在是自定义还是默认？读取设置，不生成内容。', ['app.resource.read'], ['app.read_resource']],
  ['resource-memory', '只查询当前会话有哪些记忆模板，不要开启记忆面板。', ['app.resource.read'], ['app.read_resource']],
  ['resource-regex', '正规表达式清单里有没有停用项？从资源读取结果统计。', ['app.resource.read'], ['app.read_resource']],
  ['resource-variables', '全局变量与局部变量分别列五个名字；没有局部变量就直说空。', ['app.resource.read'], ['app.read_resource']],
]);

addBatch('obs-03', [
  ['session-create', '先确认是否已有「冻结观察会话-A-0728」；没有才创建这个单人聊天室，已有则不要重复创建。', ['session.create'], ['session.create', 'session.list'], { expectedDisposition: 'create_or_reuse_test_artifact' }],
  ['session-read', '读取会话列表，确认「冻结观察会话-A-0728」只出现一次，不要进入聊天室。', ['session.list'], ['session.list']],
  ['chat-send', '给「冻结观察会话-A-0728」写入一条用户消息「【冻结观察】仅写入，不触发回复。」；triggerReply 必须为 false。', ['chat.send_message'], ['chat.send_message'], { expectedDisposition: 'write_test_message' }],
  ['resource-chat-cross-session', '不切换当前房间，读取「冻结观察会话-A-0728」最后一条消息，核对正文与角色。', ['app.resource.read'], ['app.read_resource']],
  ['session-open', '打开「冻结观察会话-A-0728」，不要发送任何新消息。', ['session.open'], ['session.open'], { followGuide: true }],
  ['app-state', '用状态接口确认现在是否真的位于「冻结观察会话-A-0728」。', ['app.state.read'], ['app.get_current_state']],
  ['user-create', '先读取用户列表；若不存在「冻结观察用户-0728」才创建它，但不要切换成它。', ['user.create'], ['user.create', 'app.read_resource'], { expectedDisposition: 'create_or_reuse_test_artifact' }],
  ['resource-user', '读取用户清单，确认「冻结观察用户-0728」是否存在，并说明当前用户有没有被切换。', ['app.resource.read'], ['app.read_resource']],
  ['persona-create', '先读取角色卡；若不存在「冻结观察角色-0728」才创建，且不要设为当前角色卡。', ['persona.create'], ['persona.create', 'app.read_resource'], { expectedDisposition: 'create_or_reuse_test_artifact' }],
  ['resource-persona', '只读角色卡清单，确认「冻结观察角色-0728」存在且当前角色卡没有被切换。', ['app.resource.read'], ['app.read_resource']],
  ['worldbook-create', '若没有「冻结观察写入-0728」世界书就新建，并写入短条目「门牌规则」：正文为“仅用于冻结观察批量测试。”；若已存在同名同正文条目则不要重复追加。', ['worldbook.create'], ['worldbook.create', 'worldbook.read'], { expectedDisposition: 'create_or_reuse_test_artifact' }],
  ['worldbook-read', '读取「冻结观察写入-0728」，确认「门牌规则」条目数量和正文，不要修改。', ['worldbook.read'], ['worldbook.read']],
  ['worldbook-update', '把「冻结观察写入-0728」的「门牌规则」正文更新为“仅用于冻结观察批量测试；禁止用于正式资料。”，只改这一条。', ['worldbook.update_entries'], ['worldbook.update_entries', 'worldbook.read'], { expectedDisposition: 'update_test_artifact' }],
  ['worldbook-read', '读回「冻结观察写入-0728」的「门牌规则」，核对更新后的完整正文。', ['worldbook.read'], ['worldbook.read']],
  ['worldbook-bind', '把「冻结观察写入-0728」追加绑定到「冻结观察会话-A-0728」；保留该会话原有绑定。', ['worldbook.bind_session'], ['worldbook.bind_session', 'worldbook.list'], { expectedDisposition: 'bind_test_artifact' }],
  ['worldbook-list', '查询「冻结观察会话-A-0728」的世界书绑定，确认原绑定仍在且新增书已启用。', ['worldbook.list'], ['worldbook.list']],
  ['worldbook-create', '向「冻结观察写入-0728」追加短条目「观察标记」：正文“OBS-03”；如果已有完全同名条目就不要再加。', ['worldbook.create'], ['worldbook.create', 'worldbook.read'], { expectedDisposition: 'append_test_entry' }],
  ['worldbook-read', '只读「冻结观察写入-0728」条目索引，确认没有重复的「观察标记」。', ['worldbook.read'], ['worldbook.read']],
  ['worldbook-delete-deny', '删除「冻结观察写入-0728」里的「观察标记」。这是权限拒绝测试，出现确认时不要替我同意。', ['worldbook.delete_entries'], [], { autoConfirm: false, autoDeny: true, expectedDisposition: 'permission_denied_no_delete' }],
  ['worldbook-read', '读取「冻结观察写入-0728」，确认上一项被拒绝后「观察标记」仍然存在。', ['worldbook.read'], ['worldbook.read']],
  ['moments-publish', '发布测试动态「【冻结观察 OBS-03】权限与流程测试」，不要自动生成评论。', ['moments.publish'], ['moments.publish'], { expectedDisposition: 'publish_test_artifact' }],
  ['moments-read-gap', '不要发布新动态；只尝试读取刚才那条测试动态。如果没有读取动态的能力就明确说明。', [], [], { expectedAnyTools: ['app.ui.inspect', 'app.read_visible_panel_summary', 'app.open_panel'], expectedDisposition: 'read_or_explain_capability_gap' }],
  ['config-read', '列出聊天模型配置并指出当前档，不能显示任何密钥。', ['config.model.switch'], ['config.list_profiles']],
  ['config-switch-current', '把聊天模型切到目前已经启用的「Deepseek」档；若本来就是它就保持不变并说明 already active。', ['config.model.switch'], ['config.list_profiles', 'config.switch_profile'], { expectedDisposition: 'already_active_no_change' }],
  ['config-switch-missing', '尝试切到一个并不存在的聊天配置「冻结观察不存在档」；找不到时不要猜也不要换成相近名称。', ['config.model.switch'], ['config.list_profiles'], { expectedAnyTools: ['config.switch_profile'], expectedDisposition: 'target_not_found_no_change' }],
  ['worldbook-replace-deny', '用 replace 覆盖「冻结观察写入-0728」全部内容。这是拒绝测试，弹出确认后取消，不得覆盖。', ['worldbook.create'], [], { autoConfirm: false, autoDeny: true, expectedDisposition: 'permission_denied_no_replace' }],
  ['chat-optimize-cancel', '优化「格式修复测试」会话最近一条 AI 回复，让措辞更简洁；允许工具运行，但出现行级 diff 时取消，不写回。', ['chat.message.optimize'], ['chat.optimize_message'], { autoDeny: true, expectedDisposition: 'diff_cancelled_no_write', maxMs: 420000 }],
  ['chat-repair-cancel', '检查并修复「格式修复测试」会话最近一条 AI 回复格式；允许生成 diff，但在应用前取消。', ['chat.format.repair'], ['chat.repair_message_format'], { autoDeny: true, expectedDisposition: 'diff_cancelled_no_write', maxMs: 420000 }],
  ['avatar-missing', '把我这次附带的图片设成当前用户头像；如果本轮其实没有图片，不要猜 attachmentId，直接向我说明。', ['user.avatar.set'], [], { expectedDisposition: 'clarify_missing_attachment' }],
  ['avatar-missing', '把附件设成当前角色卡头像；没有附件时禁止调用设置工具。', ['persona.avatar.set'], [], { expectedDisposition: 'clarify_missing_attachment' }],
  ['avatar-missing', '替「冻结观察会话-A-0728」换成我附的头像；若没有附图就停下来询问。', ['contact.avatar.set'], [], { expectedDisposition: 'clarify_missing_attachment' }],
  ['wallpaper-missing', '用这次的附件给「冻结观察会话-A-0728」换壁纸；没有附件就不要执行。', ['session.wallpaper.set'], [], { expectedDisposition: 'clarify_missing_attachment' }],
  ['web-image-search', '只搜索三张“blue observation room”参考图片，返回网址，不下载也不设置。', ['web.search'], ['web.search_images']],
  ['session-create-many', '检查后仅创建缺少的两个聊天室：「冻结观察会话-B-0728」和「冻结观察会话-C-0728」；不要进入它们。', ['session.create'], ['session.create', 'session.list'], { expectedDisposition: 'create_or_reuse_test_artifacts' }],
  ['session-read', '列出所有以「冻结观察会话-」开头的会话，确认 A、B、C 各只有一个。', ['session.list'], ['session.list']],
  ['session-create-idempotent', '再次请求创建「冻结观察会话-A-0728」，但如果列表里已经存在就必须复用，不能产生第二个同名会话。', ['session.create'], ['session.list'], { expectedDisposition: 'no_duplicate' }],
  ['user-create-idempotent', '创建「冻结观察用户-0728」；若已有同名用户就不要再创建，也不要切换。', ['user.create'], ['app.read_resource'], { expectedDisposition: 'no_duplicate' }],
  ['persona-create-idempotent', '创建「冻结观察角色-0728」；若已存在就不要新增，也不要切换。', ['persona.create'], ['app.read_resource'], { expectedDisposition: 'no_duplicate' }],
  ['errors-read', '读取刚才这些拒绝、缺目标或缺附件流程产生的最近错误，按 failureCode 简要归类。', ['app.errors.read'], ['app.read_recent_errors']],
  ['app-state', '最后读取 APP 状态，确认当前会话、当前用户、当前角色卡与模型档没有被拒绝测试意外改动。', ['app.state.read'], ['app.get_current_state']],
]);

addBatch('obs-04', [
  ['todo-write', '为本轮建立三项待办：读取状态、核对世界书、汇总结果；第一项设为进行中，其余待处理。', ['maid.todo'], ['maid.todo.write']],
  ['todo-read', '读取当前女仆待办，逐项告诉我状态，不要改动。', ['maid.todo'], ['maid.todo.read']],
  ['multi-step', '这是多步骤任务：先读取 APP 状态，再列会话，最后把待办三项全部更新为完成；不要跳步骤。', ['maid.todo', 'app.state.read', 'session.list'], ['app.get_current_state', 'session.list', 'maid.todo.write'], { maxMs: 420000 }],
  ['todo-read', '再次读取待办，确认三项是否都完成。', ['maid.todo'], ['maid.todo.read']],
  ['multi-read', '同时核对当前页面和全部聊天室数量：分别调用状态与会话清单，不要用一个结果猜另一个。', ['app.state.read', 'session.list'], ['app.get_current_state', 'session.list']],
  ['panel-inspect', '打开 Agent Center 后读取当前可见面板摘要，告诉我活动标签和可见按钮。', ['agent.center.open', 'app.visible_panel.read'], ['app.open_panel'], { expectedAnyTools: ['app.ui.inspect', 'app.read_visible_panel_summary'], followGuide: true }],
  ['panel-inspect', '打开世界书管理页，再读取界面摘要确认当前停在哪个子页；不要修改。', ['worldbook.open', 'app.visible_panel.read'], ['app.open_panel'], { expectedAnyTools: ['app.ui.inspect', 'app.read_visible_panel_summary'], followGuide: true }],
  ['panel-inspect', '打开变量管理器并查看可见字段，只汇报结构，不修改值。', ['variables.open', 'app.visible_panel.read'], ['app.open_panel'], { expectedAnyTools: ['app.ui.inspect', 'app.read_visible_panel_summary'], followGuide: true }],
  ['config-two-scopes', '分别列出 chat 与 image 两种 scope 的配置，告诉我各自当前启用档；不要切换。', ['config.model.switch'], ['config.list_profiles']],
  ['multi-resource', '依次读取当前会话的 preset、regex、variables 三种结构化资源，分别给出简短摘要。', ['app.resource.read'], ['app.read_resource'], { expectedDisposition: 'three_distinct_resources', maxMs: 420000 }],
  ['multi-resource', '分别读取角色卡与用户清单，只比较总数和当前项，禁止切换。', ['app.resource.read'], ['app.read_resource'], { expectedDisposition: 'two_distinct_resources', maxMs: 420000 }],
  ['chat-format-context', '读取「格式修复测试」最新 AI rawOriginal，再读取该会话格式画像，比较两者是否足够用于格式修复。', ['app.resource.read', 'chat.format.profile'], ['app.read_resource', 'chat.read_format_profile']],
  ['worldbook-multi-read', '先列世界书，再读取「冻结观察写入-0728」的条目索引；不要读其他书正文。', ['worldbook.list', 'worldbook.read'], ['worldbook.list', 'worldbook.read']],
  ['diagnostic-multi', '读取最近三条错误，再查“修复回复格式”能力说明，判断刚才失败是否与工具权限有关。', ['app.errors.read', 'app.capabilities.search'], ['app.read_recent_errors'], { expectedAnyTools: ['app.search_feature', 'app.read_feature_doc'] }],
  ['missing-session', '打开不存在的聊天室「冻结观察-绝对不存在-404」；找不到必须停下说明，不可打开相似名称。', ['session.open'], ['session.open'], { expectedDisposition: 'target_not_found_no_navigation' }],
  ['missing-worldbook', '读取不存在的世界书「冻结观察-无此书-404」；不要自动创建。', ['worldbook.read'], ['worldbook.read'], { expectedDisposition: 'target_not_found_no_create' }],
  ['missing-resource-session', '用结构化资源读取不存在的会话「冻结观察-无此会话-404」；找不到就如实回答。', ['app.resource.read'], ['app.read_resource'], { expectedDisposition: 'target_not_found' }],
  ['missing-config', '把聊天模型切到「不存在-404-profile」；不要模糊匹配到别的档。', ['config.model.switch'], ['config.list_profiles'], { expectedAnyTools: ['config.switch_profile'], expectedDisposition: 'target_not_found_no_change' }],
  ['missing-chat-send', '给不存在的聊天室「冻结观察-无此会话-404」发送“不会被写入”；允许一次后若目标不存在就停止，不能改发到当前房间。', ['chat.send_message'], ['chat.send_message'], { expectedDisposition: 'target_not_found_no_fallback' }],
  ['multi-write', '若「冻结观察会话-D-0728」不存在就创建；然后向它写入“OBS-04-D”且不触发回复；最后读取该会话末条消息验证。', ['session.create', 'chat.send_message', 'app.resource.read'], ['session.create', 'session.list', 'chat.send_message', 'app.read_resource'], { expectedDisposition: 'create_send_verify', maxMs: 420000 }],
  ['sub-agent-generate', '使用适合长正文的 Sub-agent，在新世界书「冻结观察SubAgent-A-0728」生成条目「潮汐条例」，约 140 字，内容描述雾港潮汐通行规则；若同名条目已存在则不要重复。', ['worldbook.create'], ['worldbook.generate_entries', 'worldbook.read'], { allowSubAgent: true, expectedDisposition: 'delegate_and_verify', maxMs: 480000 }],
  ['sub-agent-verify', '读取「冻结观察SubAgent-A-0728」的「潮汐条例」完整正文，确认长度与主题；不要修改。', ['worldbook.read'], ['worldbook.read']],
  ['sub-agent-append', '让长正文 Sub-agent 给「冻结观察SubAgent-A-0728」追加「灯塔值守」，约 180 字；已有同名条目则不重复。', ['worldbook.create'], ['worldbook.generate_entries', 'worldbook.read'], { allowSubAgent: true, expectedDisposition: 'delegate_append_verify', maxMs: 480000 }],
  ['sub-agent-verify', '读取「冻结观察SubAgent-A-0728」两个条目的索引与正文长度，确认没有同名重复。', ['worldbook.read'], ['worldbook.read']],
  ['sub-agent-multi', '用长正文 Sub-agent 创建「冻结观察SubAgent-B-0728」，一次生成「北门」「南门」两条各约 120 字的守门规则；不要写入其他世界书。', ['worldbook.create'], ['worldbook.generate_entries', 'worldbook.read'], { allowSubAgent: true, expectedDisposition: 'delegate_two_entries_verify', maxMs: 540000 }],
  ['sub-agent-verify', '只读「冻结观察SubAgent-B-0728」，确认恰有「北门」「南门」两个测试条目。', ['worldbook.read'], ['worldbook.read']],
  ['worldbook-main-short', '不要使用 Sub-agent；给「冻结观察写入-0728」追加短条目「主模型短条目」，正文仅为“short-main-model”，已有则跳过。', ['worldbook.create'], ['worldbook.create', 'worldbook.read'], { expectedDisposition: 'main_model_short_write' }],
  ['worldbook-read', '读取「冻结观察写入-0728」的「主模型短条目」，核对正文。', ['worldbook.read'], ['worldbook.read']],
  ['capability-search', '只查能力目录：什么情况下世界书长正文会委派给 Sub-agent？不要生成或写入。', ['app.capabilities.search'], [], { expectedAnyTools: ['app.search_feature', 'app.read_feature_doc'] }],
  ['no-tool', '不要调用任何工具：用两句话说明主模型和 Sub-agent 在一般 Agent 系统中的分工。', [], [], { autoConfirm: false, autoDeny: true }],
  ['chat-optimize-cancel', '对「格式修复测试」最新 AI 回复做“删掉重复句子”的正文优化；允许生成行级 diff，但自动化测试在应用前取消。', ['chat.message.optimize'], ['chat.optimize_message'], { autoDeny: true, expectedDisposition: 'diff_cancelled_no_write', maxMs: 480000 }],
  ['chat-repair-cancel', '对「格式修复测试」最新 AI 回复执行格式修复；允许产生补丁预览，但在写回前取消。', ['chat.format.repair'], ['chat.repair_message_format'], { autoDeny: true, expectedDisposition: 'diff_cancelled_no_write', maxMs: 480000 }],
  ['chat-repair-missing', '修复不存在会话「冻结观察-无此会话-404」的最新回复格式；找不到目标就停止，不得改当前会话。', ['chat.format.repair'], ['chat.repair_message_format'], { expectedDisposition: 'target_not_found_no_write', maxMs: 420000 }],
  ['format-profile-save', '为「冻结观察会话-A-0728」保存测试格式画像：每次回复必须用 <obs>...</obs> 包裹；sources 标记为测试说明。', ['chat.format.profile'], ['chat.save_format_profile'], { expectedDisposition: 'save_test_profile' }],
  ['format-profile-read', '读取「冻结观察会话-A-0728」格式画像，确认包含 <obs> 规则和测试来源。', ['chat.format.profile'], ['chat.read_format_profile']],
  ['panel-inspect', '打开 API 配置后只读取可见界面摘要，确认密钥字段的值没有出现在结果中。', ['config.api.open', 'app.visible_panel.read'], ['app.open_panel'], { expectedAnyTools: ['app.ui.inspect', 'app.read_visible_panel_summary'], followGuide: true }],
  ['ui-click', '打开 Agent Center，先读取界面 ref，再点击“活动”标签并读取点击后的摘要；禁止用坐标盲点。', ['agent.center.open', 'app.ui.click'], ['app.open_panel', 'app.ui.inspect', 'ui.click_element'], { expectedDisposition: 'inspect_ref_click_verify', maxMs: 420000 }],
  ['agent-runs-gap', '统计 Agent Center 活动里本轮成功、失败、中断数量；没有结构化运行数据工具时允许用可见界面，并注明范围。', [], [], { expectedAnyTools: ['app.ui.inspect', 'app.read_visible_panel_summary', 'app.open_panel'] }],
  ['todo-clear', '把当前女仆待办清空。', ['maid.todo'], ['maid.todo.write']],
  ['todo-read', '读取待办，确认现在为空。', ['maid.todo'], ['maid.todo.read']],
]);

addBatch('obs-05', [
  ['session-read', '聊天室都有啥？报个总数就行，千万别点进去。', ['session.list'], ['session.list']],
  ['session-read', 'show me every conversation name, read only.', ['session.list'], ['session.list']],
  ['session-read', '会画列表给我——我是说会话列表，刚才打错字了。', ['session.list'], ['session.list']],
  ['session-read', '只做 inventory：contacts 和 groups 各几项？', ['session.list'], ['session.list']],
  ['app-state', 'where exactly am I right now in this app？call state, no guessing.', ['app.state.read'], ['app.get_current_state']],
  ['app-state', '我现在落脚在哪个页面和哪个房间？查系统状态。', ['app.state.read'], ['app.get_current_state']],
  ['app-state', '当前挂载资源、UI mode、active page 给个摘要。', ['app.state.read'], ['app.get_current_state']],
  ['visible-ui', '眼前露着啥窗口？scan visible UI only。', ['app.visible_panel.read'], [], { expectedAnyTools: ['app.ui.inspect', 'app.read_visible_panel_summary'] }],
  ['resource-persona', 'character cards inventory：总数＋active name，只读。', ['app.resource.read'], ['app.read_resource']],
  ['resource-user', 'user identities 列表与当前身份，只查别换。', ['app.resource.read'], ['app.read_resource']],
  ['resource-preset', '现在 prompt preset 究竟是哪一套？从资源层核实。', ['app.resource.read'], ['app.read_resource']],
  ['resource-config', '连接档公开摘要给我，secret 一个字节都别回传。', ['app.resource.read'], ['app.read_resource']],
  ['resource-regex', '后处理脚本哪些 on、哪些 off？别开 editor。', ['app.resource.read'], ['app.read_resource']],
  ['resource-variables', 'global/local vars 现在各有什么名字？纯读取。', ['app.resource.read'], ['app.read_resource']],
  ['resource-memory', '表格记忆目前有哪些 template/table？只查数据。', ['app.resource.read'], ['app.read_resource']],
  ['resource-chat', 'latest assistant rawOriginal versus rendered text，读取后判断是否一致。', ['app.resource.read'], ['app.read_resource']],
  ['panel-regex', '我不是问规则内容，我要自己操作——打开 regex 管理。', ['regex.open'], ['app.open_panel'], { followGuide: true }],
  ['panel-variables', 'show the variables panel，停在那里不要改。', ['variables.open'], ['app.open_panel'], { followGuide: true }],
  ['panel-memory', '带我去 memory tables 管理页。', ['memory.open'], ['app.open_panel'], { followGuide: true }],
  ['panel-worldbook', 'open world info manager only，勿保存。', ['worldbook.open'], ['app.open_panel'], { followGuide: true }],
  ['worldbook-list', 'world lore library 有几本？只列书名。', ['worldbook.list'], ['worldbook.list']],
  ['worldbook-read', '「冻结观察写入-0728」里面有哪些 entry titles？目录即可。', ['worldbook.read'], ['worldbook.read']],
  ['format-profile', '这房间的 custom output schema 缓存过没？read format profile。', ['chat.format.profile'], ['chat.read_format_profile']],
  ['errors-read', 'latest maid failures 给我五条 failureCode。', ['app.errors.read'], ['app.read_recent_errors']],
  ['capability-search', '“把一段 AI 回复润色但不改事实”对应什么能力？只查目录。', ['app.capabilities.search'], [], { expectedAnyTools: ['app.search_feature', 'app.read_feature_doc'] }],
  ['capability-search', 'read the feature doc for chat.format.repair；不要真的修。', ['app.capabilities.search'], ['app.read_feature_doc']],
  ['config-read', 'chat model profiles 名单和 active 档，read only。', ['config.model.switch'], ['config.list_profiles']],
  ['config-switch-current', 'switch chat profile to Deepseek；如果 already active 就不要产生变化。', ['config.model.switch'], ['config.list_profiles', 'config.switch_profile'], { expectedDisposition: 'already_active_no_change' }],
  ['web-search', '查一下今天 WebView2 官方文档有没有提 remote debugging port，并给来源。', ['web.search'], [], { expectedAnyTools: ['web.search', 'web.research'] }],
  ['web-image-search', 'image search only：three foggy lighthouse references，别下载。', ['web.search'], ['web.search_images']],
  ['web-fetch', '读取 https://example.com 的网页标题与第一段，只抓取这个 URL。', ['web.search'], ['web.fetch_url']],
  ['no-tool', 'zero tools：原样输出 OBSERVATION-ONLY。', [], [], { autoConfirm: false, autoDeny: true }],
  ['ambiguous', '打开那个东西。目标不够明确时只问一个澄清问题。', [], [], { autoConfirm: false, autoDeny: true }],
  ['contradictory', '不要调用工具，但告诉我当前真实 sessionId；无法同时满足时说明限制，不要猜。', [], [], { autoConfirm: false, autoDeny: true }],
  ['missing-session', '切到“上次那个测试房”。这个名称不唯一时列候选并问我，不许自行选择。', ['session.open'], [], { expectedAnyTools: ['session.list'], expectedDisposition: 'clarify_ambiguous_target' }],
  ['capability-search', '只解释“格式坏了”时女仆会走哪些步骤，不要执行格式修复。', ['app.capabilities.search'], [], { expectedAnyTools: ['app.search_feature', 'app.read_feature_doc'] }],
  ['capability-search', '只解释正文优化和格式修复的区别，不调用编辑工具。', ['app.capabilities.search'], [], { expectedAnyTools: ['app.search_feature', 'app.read_feature_doc'] }],
  ['capability-search', '我想发动态但先别发：查能力说明并告诉我必填参数。', ['app.capabilities.search'], [], { expectedAnyTools: ['app.search_feature', 'app.read_feature_doc'] }],
  ['sub-agent-generate', '明确使用长正文 Sub-agent：在「冻结观察SubAgent-B-0728」追加「钟楼宵禁」约 150 字；已有同名条目就不要重复。', ['worldbook.create'], ['worldbook.generate_entries', 'worldbook.read'], { allowSubAgent: true, expectedDisposition: 'delegate_append_verify', maxMs: 480000 }],
  ['sub-agent-verify', '读取「冻结观察SubAgent-B-0728」的「钟楼宵禁」正文与长度，确认刚才确实写入且没有重复。', ['worldbook.read'], ['worldbook.read']],
]);

addBatch('verify-v3-misses', [
  ['panel-api', '模型连线设置在哪？直接替我打开配置页，但别保存。', ['config.api.open'], ['app.open_panel'], { followGuide: true }],
  ['panel-session-config', '把这间聊天的配置摘要窗口打开，我要自己检查。', ['session.config.open'], ['session.open_config'], { followGuide: true }],
]);

addBatch('verify-web-text', [
  ['web-search', '上网搜“WebView2 remote debugging port”是什么，给我两个来源；不要改 APP。', ['web.search'], [], { expectedAnyTools: ['web.search', 'web.research'] }],
]);

// 2026-07-28 写意图护栏 / 非联系人会话配置修复后的冻结对照集。
// v4f 与 Pioneer 高能力模型必须使用同一批任务；批次间只清理本批创建的三个会话。
addBatch('fix-regression', [
  ['read-guard-binding', '查询「冻结观察会话-A-0728」的世界书绑定，确认原绑定仍在且新增书已启用；只读，不要绑定、启用或修改任何内容。', ['worldbook.list'], ['worldbook.list'], { expectedDisposition: 'read_only_no_write' }],
  ['read-guard-enabled', '检查后告诉我「雷姆」这本世界书是否已经启用；只查询状态，不要启用或禁用。', ['worldbook.list'], ['worldbook.list'], { expectedDisposition: 'read_only_no_write' }],
  ['read-guard-failure', '核对最近的女仆错误后说明为什么生成失败；只读取错误记录，不要重新生成。', ['app.errors.read'], ['app.read_recent_errors'], { expectedDisposition: 'read_only_no_write' }],
  ['read-guard-modified', '确认后列出「冻结观察写入-0728」中被修改过的条目标题；如果资料无法判断就如实说，不要修改条目。', ['worldbook.read'], ['worldbook.read'], { expectedDisposition: 'read_only_no_write' }],
  ['read-guard-deleted', '检查后告诉我已删除的聊天室是否还会出现在当前会话列表；只列出现状，不要创建或删除。', ['session.list'], ['session.list'], { expectedDisposition: 'read_only_no_write' }],
  ['read-guard-sent', '验证后告诉我「格式修复测试」最近一条 AI 消息是否发送成功；只读取聊天记录，不要发送。', ['app.resource.read'], ['app.read_resource'], { expectedDisposition: 'read_only_no_write' }],
  ['read-guard-settings', '查完后告诉我当前设置：聊天模型档、服务商和模型；不要设置或切换。', ['config.model.switch'], ['config.list_profiles'], { expectedDisposition: 'read_only_no_write' }],
  ['read-guard-reply', '检查当前会话列表后只回复检查结果和总数，不要进行任何修改。', ['session.list'], ['session.list'], { expectedDisposition: 'read_only_no_write' }],
  ['conditional-create', '先确认「意图回归-A-0728」是否已有；没有才创建，创建后不要进入。', ['session.create'], ['session.list', 'session.create'], { expectedDisposition: 'explicit_write_without_intent_escalation' }],
  ['postcheck-create', '检查完会话列表后仅创建缺少的「意图回归-B-0728」，不要进入。', ['session.create'], ['session.list', 'session.create'], { expectedDisposition: 'explicit_write_without_intent_escalation' }],
  ['postcheck-object-create', '确认现状后再把「意图回归-C-0728」创建出来；若已存在就复用，不要进入。', ['session.create'], ['session.list', 'session.create'], { expectedDisposition: 'explicit_write_without_intent_escalation' }],
  ['rp-session-config', '打开创意写作会话「rp:persona_1783052220449_63wbh」的会话配置面板，只打开不要修改。', ['session.config.open'], ['session.open_config'], { expectedDisposition: 'existing_session_config_opened' }],
  ['orphan-session-config', '打开已存在会话「护栏验证房-2128」的会话配置面板，只打开不要修改。', ['session.config.open'], ['session.open_config'], { expectedDisposition: 'existing_session_config_opened' }],
  ['missing-session-config', '尝试打开不存在会话「意图回归-绝对不存在-404」的会话配置；找不到就停止，不得打开其他会话。', ['session.config.open'], ['session.open_config'], { expectedDisposition: 'session_not_found_no_open' }],
  ['format-repair-cancel', '检查并修复「格式修复测试」最近一条 AI 回复格式；允许生成补丁预览，但在写回前取消。', ['chat.format.repair'], ['chat.repair_message_format'], { autoDeny: true, expectedDisposition: 'diff_cancelled_no_write', maxMs: 420000 }],
]);

const addComplexWorkflowBatch = (batch, label) => {
  const worldbook = `${label}·资料`;
  const roomLan = `${label}·岚`;
  const roomXian = `${label}·弦`;
  const missingRoom = `${label}·不存在`;
  addBatch(batch, [
    [
      'complex-association-audit',
      '保持后台，不打开任何页面。分别读取角色卡「海贼王」「清月师尊」「女仆能力测试」的 associations；只对实际返回了 worldbookId 的项目继续读取对应世界书条目索引。最后按角色卡列出 worldbookId、enabled、条目总数和前三个标题。禁止读取头像、originalCard 或完整档案，也不要修改绑定。',
      ['app.resource.read', 'worldbook.read'],
      ['app.read_resource', 'worldbook.read'],
      { expectedDisposition: 'bounded_association_followup_read', maxMs: 480000 },
    ],
    [
      'complex-worldbook-seed',
      `建立测试世界书「${worldbook}」。先读取确认现状；只补齐缺少的三个短条目且绝不 replace 或制造同名重复：①「调查员岚」正文“岚是负责追查失踪船队的调查员。”；②「机械师弦」正文“弦负责维修灯塔与港口机械。”；③「灰港」正文“灰港是终年被雾覆盖的港口城市。”。完成后读回索引，确认三个标题各恰好一条。`,
      ['worldbook.read', 'worldbook.create'],
      ['worldbook.read', 'worldbook.create'],
      { expectedDisposition: 'idempotent_seed_and_verify', maxMs: 480000 },
    ],
    [
      'complex-subagent-enrich',
      `先读取「${worldbook}」，若还没有「共同事件」，让擅长世界观设定的 Sub-agent 根据大纲追加约 180 字正文：岚与弦在蓝色灯塔停摆之夜共同救出一艘迷航船；只描述事件经过，不新增人物。若已有同名条目则跳过生成。最后读回该条目确认写入且没有重复。`,
      ['worldbook.read', 'worldbook.create'],
      ['worldbook.read', 'worldbook.generate_entries'],
      { allowSubAgent: true, expectedDisposition: 'delegate_if_missing_and_verify', maxMs: 540000 },
    ],
    [
      'complex-infer-and-create',
      `读取「${worldbook}」后自行区分人物、地点与事件，只为其中两个主要人物建立聊天室「${roomLan}」「${roomXian}」。先查会话列表，再用一次批量创建补齐缺少项，open:false，不得给灰港或共同事件建房；最后核对两个名称各只出现一次，并确认当前会话仍是「格式修复测试」。`,
      ['worldbook.read', 'session.list', 'session.create', 'app.state.read'],
      ['worldbook.read', 'session.list', 'session.create', 'app.get_current_state'],
      { expectedDisposition: 'infer_people_batch_create_background_verify', maxMs: 540000 },
    ],
    [
      'complex-batch-bind',
      `把世界书「${worldbook}」追加绑定到「${roomLan}」「${roomXian}」。必须先调用 worldbook.bind_sessions 且 preview:true；仅当预览两项都可处理时，再以同一 sessions[]、mode:append 实际执行一次。整批只确认一次，不准退化成逐房 bind/list，也不要打开聊天室；逐项汇报 planned/succeeded/skipped/failed 与 verified。`,
      ['worldbook.bind_sessions'],
      ['worldbook.bind_sessions'],
      { expectedDisposition: 'preview_then_single_batch_bind', maxMs: 540000 },
    ],
    [
      'complex-cross-session-write',
      `保持当前房间不变：向「${roomLan}」后台写入用户消息“${label}-LAN-CHECK”，向「${roomXian}」后台写入“${label}-XIAN-CHECK”；两次都必须 triggerReply:false、open:false。然后分别从结构化 chat 资源读回各房最后一条消息，核对角色与全文；最后读取 APP 状态证明没有跳房。`,
      ['chat.send_message', 'app.resource.read', 'app.state.read'],
      ['chat.send_message', 'app.read_resource', 'app.get_current_state'],
      { expectedDisposition: 'two_background_writes_and_readback', maxMs: 540000 },
    ],
    [
      'complex-format-profiles',
      `为两个测试房保存不同格式画像并逐一读回：「${roomLan}」要求每次回复用 <lan>...</lan> 包裹；「${roomXian}」要求用 <xian>...</xian> 包裹。sources 都标记 type=test、ref=${label}。本任务只保存/读取画像，不要调用格式修复，也不要打开房间。`,
      ['chat.format.profile'],
      ['chat.save_format_profile', 'chat.read_format_profile'],
      { expectedDisposition: 'two_distinct_profiles_save_and_verify', maxMs: 480000 },
    ],
    [
      'complex-targeted-update',
      `先完整核对「${worldbook}」的四个测试条目；然后只修改「灰港」正文为“灰港是终年被雾覆盖的港口城市；蓝色警报响起时居民沿北堤撤离。”，不得改标题或其他条目。允许一次修改后读回「灰港」全文，并确认另外三个标题仍存在。`,
      ['worldbook.read', 'worldbook.update_entries'],
      ['worldbook.read', 'worldbook.update_entries'],
      { expectedDisposition: 'single_entry_update_preserve_others', maxMs: 540000 },
    ],
    [
      'complex-reveal-primary',
      `若「${worldbook}」还没有「联络暗号」，追加短条目，正文仅为“蓝灯三闪，白灯一长。”；已有则不重复。写入并验证后，按我的明确要求打开世界书管理界面给我看，但只展示这一个主要结果，不要打开「${roomLan}」或「${roomXian}」。`,
      ['worldbook.create', 'worldbook.open'],
      ['worldbook.create', 'app.open_panel'],
      { followGuide: true, expectedDisposition: 'write_then_reveal_one_primary_surface', maxMs: 540000 },
    ],
    [
      'complex-partial-batch',
      `用一次 worldbook.bind_sessions、mode:append，把「${worldbook}」处理到 sessions=["${roomLan}","${missingRoom}","${roomLan}"]。不要创建缺失房间，也不要改用单房工具。允许一次后，准确区分 already_bound、session_not_found、duplicate_target，并把仅失败目标的 retry args 与可用补偿范围照实汇报；部分失败不能说成全成功。`,
      ['worldbook.bind_sessions'],
      ['worldbook.bind_sessions'],
      { expectedDisposition: 'partial_failure_retry_and_compensation_report', maxMs: 540000 },
    ],
    [
      'complex-idempotency',
      `重复执行幂等核对：用一次 session.create(names[]) 请求「${roomLan}」「${roomXian}」，不得新增重名房；再用一次 worldbook.bind_sessions 把「${worldbook}」append 到两房。最后只根据工具结果说明 createdCount、already_bound/skipped 与 verified，不要逐房重复绑定或打开页面。`,
      ['session.create', 'worldbook.bind_sessions'],
      ['session.create', 'worldbook.bind_sessions'],
      { expectedDisposition: 'batch_idempotency_no_duplicate', maxMs: 480000 },
    ],
    [
      'complex-profile-isolation',
      `建立测试用户「${label}·用户」和测试角色卡「${label}·角色」，两者若已有就复用；setActive 必须为 false。创建前后都读取用户与角色卡清单，确认各自只出现一次，而且当前用户、当前角色卡没有变化。不要设置头像或关联正式世界书。`,
      ['app.resource.read', 'user.create', 'persona.create'],
      ['app.read_resource', 'user.create', 'persona.create'],
      { expectedDisposition: 'create_two_resource_types_without_switch', maxMs: 540000 },
    ],
    [
      'complex-web-grounded-write',
      `联网查找 Microsoft 官方对 WebView2 remote debugging port 的说明，取得至少两个真实 Microsoft 来源 URL。然后只在测试世界书「${worldbook}」中追加一个尚不存在的条目「远程调试参考」，正文用两句话概括并列出这两个 URL；不得写入其他世界书。写后读回该条目核对来源。如果搜索结果不足两条官方来源，就停止写入并如实说明。`,
      ['web.search', 'worldbook.create', 'worldbook.read'],
      ['worldbook.create', 'worldbook.read'],
      { expectedAnyTools: ['web.search', 'web.research'], expectedDisposition: 'external_research_then_scoped_write', maxMs: 600000 },
    ],
    [
      'complex-group-gap',
      `我想把「${roomLan}」「${roomXian}」组成一个群聊「${label}·调查组」，并把两人设为成员。执行前先查能力目录；如果目前没有“创建群组并编辑成员”的正式工具，就停下并明确指出缺少哪些能力，绝对不能用创建第三个单人聊天室来冒充，也不要靠 UI 坐标操作。`,
      ['app.capabilities.search'],
      [],
      { expectedAnyTools: ['app.search_feature', 'app.read_feature_doc'], expectedDisposition: 'capability_gap_no_approximate_write', maxMs: 420000 },
    ],
    [
      'complex-preset-gap',
      `读取当前会话使用的系统提示词预设名称，然后计划复制成「${label}·预设副本」并只追加一条测试说明。先查能力目录；如果没有预设复制/创建/编辑的正式写工具，就停止，不得改原预设、不得只打开面板后宣称完成，也不要用世界书代替。`,
      ['app.resource.read', 'app.capabilities.search'],
      ['app.read_resource'],
      { expectedAnyTools: ['app.search_feature', 'app.read_feature_doc'], expectedDisposition: 'preset_crud_gap_no_false_completion', maxMs: 480000 },
    ],
    [
      'complex-final-audit',
      `对「${label}」测试资源做最终只读审计：读取世界书「${worldbook}」的标题清单；列出两个测试聊天室并核对无重名；读取两房格式画像；读取当前 APP 状态。汇报已存在、缺失、重复和当前会话是否仍为「格式修复测试」。禁止补建、补绑、补写或打开任何页面。`,
      ['worldbook.read', 'session.list', 'chat.format.profile', 'app.state.read'],
      ['worldbook.read', 'session.list', 'chat.read_format_profile', 'app.get_current_state'],
      { expectedDisposition: 'read_only_end_to_end_integrity_audit', maxMs: 540000 },
    ],
  ]);
};

addComplexWorkflowBatch('complex-v4f-0729', '复杂压力V4F-0729');
addComplexWorkflowBatch('complex-g35-0729', '复杂压力G35-0729');

addBatch('regression-read-ledger-v4f-0729', [
  [
    'complex-association-audit',
    '保持后台，不打开任何页面。分别读取角色卡「海贼王」「清月师尊」「女仆能力测试」的 associations；只对实际返回了 worldbookId 的项目继续读取对应世界书条目索引。最后按角色卡列出 worldbookId、enabled、条目总数和前三个标题。禁止读取头像、originalCard 或完整档案，也不要修改绑定。',
    ['app.resource.read', 'worldbook.read'],
    ['app.read_resource', 'worldbook.read'],
    { expectedDisposition: 'bounded_association_followup_read', maxMs: 480000 },
  ],
]);

addBatch('regression-read-ledger-g35-0729', [
  [
    'complex-association-audit',
    '保持后台，不打开任何页面。分别读取角色卡「海贼王」「清月师尊」「女仆能力测试」的 associations；只对实际返回了 worldbookId 的项目继续读取对应世界书条目索引。最后按角色卡列出 worldbookId、enabled、条目总数和前三个标题。禁止读取头像、originalCard 或完整档案，也不要修改绑定。',
    ['app.resource.read', 'worldbook.read'],
    ['app.read_resource', 'worldbook.read'],
    { expectedDisposition: 'bounded_association_followup_read', maxMs: 480000 },
  ],
]);

addBatch('regression-routing-v4f-0729', [
  [
    'complex-idempotency',
    '重复执行幂等核对：用一次 session.create(names[]) 请求「复杂压力V4F-0729·岚」「复杂压力V4F-0729·弦」，不得新增重名房；再用一次 worldbook.bind_sessions 把「复杂压力V4F-0729·资料」append 到两房。最后只根据工具结果说明 createdCount、already_bound/skipped 与 verified，不要逐房重复绑定或打开页面。',
    ['session.create', 'worldbook.bind_sessions'],
    ['session.create', 'worldbook.bind_sessions'],
    { expectedDisposition: 'batch_idempotency_no_duplicate', maxMs: 480000 },
  ],
]);

const addDiverseWorkflowBatch = (batch, label) => {
  const worldbook = `${label}·档案库`;
  const roomA = `${label}·观测站`;
  const roomB = `${label}·档案室`;
  const roomC = `${label}·检查站`;
  const recoveryRoom = `${label}·中继站`;
  const userName = `${label}·测试用户`;
  const personaName = `${label}·测试角色`;
  addBatch(batch, [
    [
      'diverse-cross-domain-baseline',
      '保持后台完成一份跨资源基线，不要建立待办：依次读取当前 APP 状态、完整会话清单、用户身份清单、角色卡清单和世界书库清单。只汇报当前会话、当前用户、当前角色卡、各资源总数，以及名称以「扩面压力」开头的既有项目；不得打开页面、切换身份或写入任何内容。',
      ['app.state.read', 'session.list', 'app.resource.read', 'worldbook.list'],
      ['app.get_current_state', 'session.list', 'app.read_resource', 'worldbook.list'],
      { expectedDisposition: 'five_source_background_baseline', maxMs: 540000 },
    ],
    [
      'diverse-identity-bootstrap',
      `不用建立待办。先分别读取用户和角色卡清单；若不存在「${userName}」才创建该用户，若不存在「${personaName}」才创建该角色卡，两者 setActive 都必须为 false。然后重新读取两份清单并读取 APP 状态，确认测试项各恰好一个，且当前用户、当前角色卡和当前聊天室都没有变化。`,
      ['app.resource.read', 'user.create', 'persona.create', 'app.state.read'],
      ['app.read_resource', 'user.create', 'persona.create', 'app.get_current_state'],
      { expectedDisposition: 'two_identity_types_created_without_activation', maxMs: 600000 },
    ],
    [
      'diverse-room-bootstrap',
      `先读取会话清单，再只用一次 session.create(names[]) 补齐三个单聊「${roomA}」「${roomB}」「${roomC}」，open:false，不得逐房创建或进入。创建后再次读取会话清单并读取 APP 状态，确认三个名称各恰好一个且当前会话仍是「格式修复测试」。`,
      ['session.list', 'session.create', 'app.state.read'],
      ['session.list', 'session.create', 'app.get_current_state'],
      { expectedDisposition: 'three_room_single_batch_background_create', maxMs: 540000 },
    ],
    [
      'diverse-worldbook-seed-with-duplicates',
      `先读取世界书「${worldbook}」确认不存在或为空；然后只用一次 worldbook.create、append 模式建立本批测试资料：①「站长」正文“站长负责记录蓝灯信号。”；②「档案员」正文“档案员负责保存巡检记录。”；③「观测站」正文“观测站位于北岸高地。”；④「检查站」正文“检查站负责核对通行证。”；以及两个同名的临时测试条目「临时草稿」，正文分别为“草稿-A”和“草稿-B”。这里的同名项是受控去重测试资料，不得写入其他世界书。最后读回索引，确认永久标题各一条、临时草稿恰好两条。`,
      ['worldbook.read', 'worldbook.create'],
      ['worldbook.read', 'worldbook.create'],
      { expectedDisposition: 'controlled_duplicate_seed_for_delete_test', maxMs: 600000 },
    ],
    [
      'diverse-dedupe-delete-and-batch-update',
      `只操作测试世界书「${worldbook}」。先读取完整索引；然后用一次 worldbook.delete_entries 对标题「临时草稿」执行 dedupeByTitle:true、keep:first，只删除多余重复项并保留一条。接着用一次 worldbook.update_entries 同批更新「站长」和「档案员」：分别在原正文后追加“状态：在岗。”与“状态：已归档。”，不得创建新标题或改动地点条目。最后读回全文，确认临时草稿剩一条、两个人物正文已更新、总条目数为 5。`,
      ['worldbook.read', 'worldbook.delete_entries', 'worldbook.update_entries'],
      ['worldbook.read', 'worldbook.delete_entries', 'worldbook.update_entries'],
      { expectedDisposition: 'confirmed_dedupe_then_two_entry_update', maxMs: 660000 },
    ],
    [
      'diverse-three-room-bind',
      `把世界书「${worldbook}」追加绑定到三个测试房「${roomA}」「${roomB}」「${roomC}」。先调用一次 worldbook.bind_sessions 且 preview:true；只有三项预览都可处理时，再以完全相同的 sessions[]、mode:append 实际执行一次。不得退化成单房 bind/list，不要打开任何房间；最后读取 APP 状态，并按房汇报 added/already_bound、verified 与失败原因。`,
      ['worldbook.bind_sessions', 'app.state.read'],
      ['worldbook.bind_sessions', 'app.get_current_state'],
      { expectedDisposition: 'preview_apply_three_room_batch_and_state', maxMs: 600000 },
    ],
    [
      'diverse-cross-room-message-matrix',
      `保持当前房间不变，向三个测试房后台各写一条用户消息：给「${roomA}」写“${label}-OBS-A”，给「${roomB}」写“${label}-OBS-B”，给「${roomC}」写“${label}-OBS-C”；全部必须 triggerReply:false、open:false。然后分别用结构化 chat 资源读取三房最后一条消息，逐一核对角色与完整正文；最后读取 APP 状态证明仍在「格式修复测试」。`,
      ['chat.send_message', 'app.resource.read', 'app.state.read'],
      ['chat.send_message', 'app.read_resource', 'app.get_current_state'],
      { expectedDisposition: 'three_background_messages_readback_and_state', maxMs: 660000 },
    ],
    [
      'diverse-format-profile-matrix',
      `为三个测试房分别保存并读回格式画像，不得打开房间或调用格式修复：「${roomA}」用 <station>...</station> 包裹；「${roomB}」用 <archive>...</archive>；「${roomC}」用 <checkpoint>...</checkpoint>。三份 sources 都写 type=test、ref=${label}。逐房确认 guide 与 sources 没有串线。`,
      ['chat.format.profile'],
      ['chat.save_format_profile', 'chat.read_format_profile'],
      { expectedDisposition: 'three_distinct_profiles_save_and_readback', maxMs: 600000 },
    ],
    [
      'diverse-partial-failure-recovery',
      `执行一次可恢复的批量绑定演练：先用 worldbook.bind_sessions、mode:append 处理 sessions=["${roomA}","${recoveryRoom}","${roomA}"] 与世界书「${worldbook}」，不得预先创建缺失房，也不得改用单房工具。根据结果准确识别 already_bound、session_not_found 和 duplicate_target；随后只用一次 session.create(names[])、open:false 创建 retry args 中确实缺失的「${recoveryRoom}」，再只对该失败目标调用一次 worldbook.bind_sessions 重试。最后读取会话清单与 APP 状态，确认恢复项 verified、无重名且没有跳房。`,
      ['worldbook.bind_sessions', 'session.create', 'session.list', 'app.state.read'],
      ['worldbook.bind_sessions', 'session.create', 'session.list', 'app.get_current_state'],
      { expectedDisposition: 'partial_failure_exact_retry_and_recovery', maxMs: 720000 },
    ],
    [
      'diverse-remote-media-reuse',
      `为测试资源执行一次真实图片资产链：先用 web.search_images 搜索“foggy lighthouse blue light photo”，只选结果中的第一张有效 imageUrl；再用 media.fetch_image 下载并取得真实 attachmentId。用同一个 attachmentId 给「${roomA}」设置联系人头像，并给「${roomB}」设置聊天室壁纸（opacity:0.35）。不得把图设到当前正式聊天室、用户或角色卡，也不得编造 URL/attachmentId；若搜索或下载失败就停止后续写入并如实报告。`,
      ['web.search', 'contact.avatar.set', 'session.wallpaper.set'],
      ['web.search_images', 'media.fetch_image', 'contact.set_avatar', 'session.set_wallpaper'],
      { expectedDisposition: 'one_remote_image_reused_for_two_test_assets', maxMs: 720000 },
    ],
    [
      'diverse-final-integrity-audit',
      `对「${label}」资源做最终只读审计，不得补写或打开页面：读取「${worldbook}」全文索引；读取完整会话清单；读取测试用户与测试角色卡清单；分别读取「${roomA}」「${roomB}」「${roomC}」的格式画像；再读取 APP 状态。汇报世界书 5 条标题与重复数、四个测试房是否唯一、测试身份是否 inactive、三份格式规则是否对应，以及当前会话是否仍为「格式修复测试」。`,
      ['worldbook.read', 'session.list', 'app.resource.read', 'chat.format.profile', 'app.state.read'],
      ['worldbook.read', 'session.list', 'app.read_resource', 'chat.read_format_profile', 'app.get_current_state'],
      { expectedDisposition: 'read_only_cross_resource_integrity_audit', maxMs: 720000 },
    ],
  ]);
};

addDiverseWorkflowBatch('diverse-v4f-0729', '扩面压力V4F-0729');
addDiverseWorkflowBatch('diverse-g35-0729', '扩面压力G35-0729');

const addFixClosureBatch = (batch, label, auditLabel) => {
  const roomA = `${label}·观测站`;
  const roomB = `${label}·档案室`;
  const roomC = `${label}·检查站`;
  const auditWorldbook = `${auditLabel}·档案库`;
  const auditRoomA = `${auditLabel}·观测站`;
  const auditRoomB = `${auditLabel}·档案室`;
  const auditRoomC = `${auditLabel}·检查站`;
  addBatch(batch, [
    [
      'fix-room-bootstrap',
      `先读取会话清单，再只用一次 session.create(names[]) 补齐三个单聊「${roomA}」「${roomB}」「${roomC}」，open:false，不得逐房创建或进入。创建后再次读取会话清单并读取 APP 状态，确认三个名称各恰好一个且当前会话仍是「格式修复测试」。`,
      ['session.list', 'session.create', 'app.state.read'],
      ['session.list', 'session.create', 'app.get_current_state'],
      { expectedDisposition: 'three_room_single_batch_background_create', maxMs: 540000 },
    ],
    [
      'fix-preview-apply-state',
      `把世界书「雷姆」追加绑定到三个测试房「${roomA}」「${roomB}」「${roomC}」。先调用一次 worldbook.bind_sessions 且 preview:true；只有三项预览都可处理时，再以完全相同的 sessions[]、mode:append 实际执行一次。不得退化成单房 bind/list，不要打开任何房间；最后读取 APP 状态，并按房汇报 added/already_bound、verified 与失败原因。`,
      ['worldbook.bind_sessions', 'app.state.read'],
      ['worldbook.bind_sessions', 'app.get_current_state'],
      { autoConfirm: true, expectedDisposition: 'preview_apply_three_room_batch_and_state', maxMs: 600000 },
    ],
    [
      'fix-message-ledger',
      `保持当前房间不变，向三个测试房后台各写一条用户消息：给「${roomA}」写“${label}-OBS-A”，给「${roomB}」写“${label}-OBS-B”，给「${roomC}」写“${label}-OBS-C”；全部必须 triggerReply:false、open:false。然后分别用结构化 chat 资源读取三房最后一条消息，逐一核对角色与完整正文；最后读取 APP 状态证明仍在「格式修复测试」。`,
      ['chat.send_message', 'app.resource.read', 'app.state.read'],
      ['chat.send_message', 'app.read_resource', 'app.get_current_state'],
      { expectedDisposition: 'three_background_messages_readback_and_state', maxMs: 660000 },
    ],
    [
      'fix-structured-audit',
      `对「${auditLabel}」资源做最终只读审计，不得补写或打开页面：读取「${auditWorldbook}」全文索引；读取完整会话清单；读取测试用户与测试角色卡清单；分别读取「${auditRoomA}」「${auditRoomB}」「${auditRoomC}」的格式画像；再读取 APP 状态。汇报世界书标题与重复数、四个测试房是否唯一、测试身份是否 inactive、三份格式规则是否对应，以及当前会话是否仍为「格式修复测试」。`,
      ['worldbook.read', 'session.list', 'app.resource.read', 'chat.format.profile', 'app.state.read'],
      ['worldbook.read', 'session.list', 'app.read_resource', 'chat.read_format_profile', 'app.get_current_state'],
      { expectedDisposition: 'read_only_cross_resource_integrity_audit', maxMs: 720000 },
    ],
  ]);
};

addFixClosureBatch('fix-closure-v4f-0729', '修复闭环V4F-0729', '扩面压力V4F-0729');
addFixClosureBatch('fix-closure-g35-0729', '修复闭环G35-0729', '扩面压力G35-0729');

addBatch('fix-closure-audit-v4f-r2-0729', [
  [
    'fix-structured-audit-r2',
    '对「扩面压力V4F-0729」资源做最终只读审计，不得补写或打开页面：读取「扩面压力V4F-0729·档案库」全文索引；读取完整会话清单；读取测试用户与测试角色卡清单；分别读取「扩面压力V4F-0729·观测站」「扩面压力V4F-0729·档案室」「扩面压力V4F-0729·检查站」的格式画像；再读取 APP 状态。汇报世界书标题与重复数、四个测试房是否唯一、测试身份是否 inactive、三份格式规则是否对应，以及当前会话是否仍为「格式修复测试」。',
    ['worldbook.read', 'session.list', 'app.resource.read', 'chat.format.profile', 'app.state.read'],
    ['worldbook.read', 'session.list', 'app.read_resource', 'chat.read_format_profile', 'app.get_current_state'],
    { expectedDisposition: 'read_only_cross_resource_integrity_audit', maxMs: 720000 },
  ],
]);

const addMemorySystemBatches = (batchA, batchB, label) => {
  const worldbook = `${label}·资料库`;
  const roomA = `${label}·白塔`;
  const roomB = `${label}·灰港`;
  const roomC = `${label}·档案室`;
  const recoveryRoom = `${label}·中继站`;
  const userName = `${label}·测试用户`;
  const personaA = `${label}·记录员`;
  const personaB = `${label}·观察员`;

  addBatch(batchA, [
    [
      'memory-explicit-preference-seed',
      '请长期记住两项测试偏好：第一，女仆回复保持简洁；第二，普通资源操作默认在后台完成，只有我明确要求查看时才打开主要结果。这一轮不要调用任何工具，只确认你理解了。',
      [],
      [],
      { autoConfirm: false, autoDeny: true, expectedDisposition: 'explicit_preference_seed_no_tool' },
    ],
    [
      'memory-baseline-state',
      '保持后台，不建立待办。读取当前 APP 状态，准确汇报页面、模式、当前聊天室；不要切换任何内容。',
      ['app.state.read'],
      ['app.get_current_state'],
      { expectedDisposition: 'background_state_baseline' },
    ],
    [
      'memory-baseline-inventory',
      `保持后台读取完整会话清单、用户清单、角色卡清单和世界书清单；只汇报各自数量，以及名称以「${label}」开头的既有项目，不得写入或打开页面。`,
      ['session.list', 'app.resource.read', 'worldbook.list'],
      ['session.list', 'app.read_resource', 'worldbook.list'],
      { expectedDisposition: 'four_source_read_only_inventory', maxMs: 540000 },
    ],
    [
      'memory-room-bootstrap',
      `先读会话清单，再只用一次 session.create(names[]) 补齐三个单聊「${roomA}」「${roomB}」「${roomC}」，open:false，不得逐房创建或进入。最后再读会话清单和 APP 状态，确认三项各一个且当前聊天室没有变化。`,
      ['session.list', 'session.create', 'app.state.read'],
      ['session.list', 'session.create', 'app.get_current_state'],
      { expectedDisposition: 'three_room_background_batch_create', maxMs: 600000 },
    ],
    [
      'memory-identity-bootstrap',
      `分别读取用户与角色卡清单；若缺少「${userName}」则创建但 setActive:false；若缺少「${personaA}」「${personaB}」则用两次合法创建补齐且都不设为当前角色。完成后重新读取两份清单和 APP 状态，确认测试身份存在且当前身份与聊天室均未改变。`,
      ['app.resource.read', 'user.create', 'persona.create', 'app.state.read'],
      ['app.read_resource', 'user.create', 'persona.create', 'app.get_current_state'],
      { expectedDisposition: 'inactive_user_and_two_personas_create_verify', maxMs: 660000 },
    ],
    [
      'memory-worldbook-seed',
      `建立测试世界书「${worldbook}」。先读取确认现状，只补齐四个短条目且不得 replace：①「记录员」正文“记录员负责整理蓝灯日志。”；②「观察员」正文“观察员负责核对潮汐信号。”；③「白塔」正文“白塔位于灰港北岸。”；④「临时记录」正文“临时-A”。完成后读回全文，确认四个标题各一条。`,
      ['worldbook.read', 'worldbook.create'],
      ['worldbook.read', 'worldbook.create'],
      { expectedDisposition: 'worldbook_seed_idempotent_verify', maxMs: 600000 },
    ],
    [
      'memory-subagent-enrich',
      `先读取「${worldbook}」。若还没有「停灯之夜」，让擅长世界观设定的 Sub-agent 根据大纲追加约 160 字：白塔熄灭、记录员和观察员共同恢复信号、没有新增人物；已有同名条目则跳过。最后读回确认恰好一条。`,
      ['worldbook.read', 'worldbook.create'],
      ['worldbook.read', 'worldbook.generate_entries'],
      { allowSubAgent: true, expectedDisposition: 'subagent_generate_if_missing_verify', maxMs: 600000 },
    ],
    [
      'memory-batch-bind',
      `把「${worldbook}」追加绑定到「${roomA}」「${roomB}」「${roomC}」。必须先以同一 sessions[] 调用 worldbook.bind_sessions preview:true，三项都可处理才实际执行一次；整批只确认一次，不逐房退化，不打开房间。最后读取 APP 状态。`,
      ['worldbook.bind_sessions', 'app.state.read'],
      ['worldbook.bind_sessions', 'app.get_current_state'],
      { expectedDisposition: 'preview_apply_three_room_bind', maxMs: 660000 },
    ],
    [
      'memory-message-matrix',
      `保持当前房间不变，分别向「${roomA}」「${roomB}」「${roomC}」后台写入用户消息“${label}-MEM-A”“${label}-MEM-B”“${label}-MEM-C”，全部 triggerReply:false、open:false；逐房读回末条消息核对，再读取 APP 状态。`,
      ['chat.send_message', 'app.resource.read', 'app.state.read'],
      ['chat.send_message', 'app.read_resource', 'app.get_current_state'],
      { expectedDisposition: 'three_background_messages_readback', maxMs: 720000 },
    ],
    [
      'memory-format-profile-matrix',
      `后台为「${roomA}」「${roomB}」分别保存并读回格式画像：白塔用 <tower>...</tower>，灰港用 <harbor>...</harbor>；sources 均标 type=test、ref=${label}。不得进入房间或调用格式修复，确认两份规则没有串线。`,
      ['chat.format.profile'],
      ['chat.save_format_profile', 'chat.read_format_profile'],
      { expectedDisposition: 'two_format_profiles_save_readback', maxMs: 600000 },
    ],
    [
      'memory-regex-read-regression',
      '只读核对正则资料是否仍存在：读取当前角色卡关联资料与正则资源摘要，汇报正则集数量、规则数量和启用数量；不要打开面板、切换角色或保存任何正则。',
      ['app.resource.read'],
      ['app.read_resource'],
      { expectedDisposition: 'regex_persistence_read_only_check', maxMs: 420000 },
    ],
    [
      'memory-capability-boundary',
      '只查询能力目录并简洁说明：女仆如何生成图片后设为联系人头像或聊天室壁纸，以及批量删除聊天室、角色卡、世界书分别使用什么工具。不要生成、删除或打开页面。',
      ['app.capabilities.search'],
      [],
      { expectedAnyTools: ['app.search_feature', 'app.read_feature_doc'], expectedDisposition: 'capability_only_no_write', maxMs: 480000 },
    ],
    [
      'memory-stage-a-integrity',
      `最终只读审计「${label}」阶段 A，不得补写：读取「${worldbook}」全文、完整会话清单、测试用户与角色卡清单、两个格式画像和 APP 状态。汇报世界书标题数、三房唯一性、测试身份 inactive、格式规则对应关系及当前聊天室。`,
      ['worldbook.read', 'session.list', 'app.resource.read', 'chat.format.profile', 'app.state.read'],
      ['worldbook.read', 'session.list', 'app.read_resource', 'chat.read_format_profile', 'app.get_current_state'],
      { expectedDisposition: 'stage_a_read_only_integrity', maxMs: 780000 },
    ],
  ]);

  addBatch(batchB, [
    [
      'memory-semantic-recall',
      '不要调用工具。请根据你自己的长期记忆回答：我刚才要求女仆采用怎样的回复长度与界面呈现方式？若没有记住就明确说没有。',
      [],
      [],
      { autoConfirm: false, autoDeny: true, expectedDisposition: 'semantic_preference_recall_no_tool' },
    ],
    [
      'memory-preference-repeat',
      '再次确认：普通资源操作默认后台，回复保持简洁。不要调用工具，也不要把相同偏好当成两条不同记忆。',
      [],
      [],
      { autoConfirm: false, autoDeny: true, expectedDisposition: 'same_key_memory_upsert_not_duplicate' },
    ],
    [
      'memory-worldbook-batch-update',
      `只操作「${worldbook}」。先读全文，然后用一次 worldbook.update_entries 同批更新「记录员」「观察员」，分别在原文后追加“状态：值守中。”和“状态：巡查中。”；不要改其他条目，最后读回验证。`,
      ['worldbook.read', 'worldbook.update_entries'],
      ['worldbook.read', 'worldbook.update_entries'],
      { expectedDisposition: 'two_entry_batch_update_verify', maxMs: 660000 },
    ],
    [
      'memory-worldbook-duplicate-seed',
      `只向「${worldbook}」append 一条同名「临时记录」，正文“临时-B”，不得 replace 或改其他条目。写入后读回，确认「临时记录」正好两条。`,
      ['worldbook.create', 'worldbook.read'],
      ['worldbook.create', 'worldbook.read'],
      { expectedDisposition: 'controlled_duplicate_append_verify', maxMs: 540000 },
    ],
    [
      'memory-worldbook-dedupe',
      `只操作「${worldbook}」。先读索引，再用 worldbook.delete_entries 的 dedupeByTitle:true、titles:["临时记录"]、keep:first 删除多余重复项，禁止混用 entries/deletes；最后读回确认只剩“临时-A”一条。`,
      ['worldbook.read', 'worldbook.delete_entries'],
      ['worldbook.read', 'worldbook.delete_entries'],
      { expectedDisposition: 'safe_dedupe_keep_first_verify', maxMs: 600000 },
    ],
    [
      'memory-partial-recovery',
      `用 worldbook.bind_sessions、mode:append 处理 sessions=["${roomA}","${recoveryRoom}","${roomA}"] 与「${worldbook}」，不要预先建缺失房。根据结果识别 already_bound、session_not_found、duplicate_target；随后只用一次 session.create(names[])、open:false 创建 retry 中确实缺少的「${recoveryRoom}」，再只对该目标重试绑定。最后读会话清单和 APP 状态确认恢复且没有跳房。`,
      ['worldbook.bind_sessions', 'session.create', 'session.list', 'app.state.read'],
      ['worldbook.bind_sessions', 'session.create', 'session.list', 'app.get_current_state'],
      { expectedDisposition: 'partial_failure_exact_retry', maxMs: 780000 },
    ],
    [
      'memory-generated-asset-reuse',
      `为测试资源生成一张“极简蓝色灯塔、灰雾、无文字”的图片，先用 media.generate_image 得到真实 attachmentId，再复用同一 attachmentId 给「${roomA}」设置联系人头像、给「${roomB}」设置聊天室壁纸 opacity:0.3。不得改当前正式房、用户或角色卡；若生图失败就停止后续写入并如实报告。`,
      ['contact.avatar.set', 'session.wallpaper.set'],
      ['media.generate_image', 'contact.set_avatar', 'session.set_wallpaper'],
      { expectedDisposition: 'generated_image_reused_for_two_test_assets', maxMs: 900000 },
    ],
    [
      'memory-delete-preview',
      `只做删除预览，不得实际删除：分别预览批量删除测试聊天室「${roomA}」「${roomB}」「${roomC}」「${recoveryRoom}」、测试角色卡「${personaA}」「${personaB}」和测试世界书「${worldbook}」。三个资源域必须分开调用各自 delete_many 且 preview:true；汇报 planned/protected/skipped 和世界书绑定影响。`,
      ['session.delete_many', 'persona.delete_many', 'worldbook.delete_many'],
      ['session.delete_many', 'persona.delete_many', 'worldbook.delete_many'],
      { expectedDisposition: 'three_domain_delete_preview_only', maxMs: 660000 },
    ],
    [
      'memory-delete-personas',
      `实际批量删除且只删除测试角色卡「${personaA}」「${personaB}」。使用一次 persona.delete_many 单次确认，保留当前正式角色卡，不跨资源删除世界书、正则或脚本；逐项汇报 succeeded/protected/skipped/failed。`,
      ['persona.delete_many'],
      ['persona.delete_many'],
      { expectedDisposition: 'batch_delete_two_test_personas', maxMs: 600000 },
    ],
    [
      'memory-delete-worldbook',
      `实际批量删除且只删除测试世界书「${worldbook}」。使用一次 worldbook.delete_many 单次确认；允许工具按正式 lifecycle 解除测试房绑定，但不得删除其他世界书，汇报绑定影响与结果。`,
      ['worldbook.delete_many'],
      ['worldbook.delete_many'],
      { expectedDisposition: 'batch_delete_one_test_worldbook', maxMs: 600000 },
    ],
    [
      'memory-delete-sessions',
      `实际批量删除且只删除测试聊天室「${roomA}」「${roomB}」「${roomC}」「${recoveryRoom}」。使用一次 session.delete_many 单次确认，不得触碰当前聊天室或 RP；逐项汇报 succeeded/protected/skipped/failed。`,
      ['session.delete_many'],
      ['session.delete_many'],
      { expectedDisposition: 'batch_delete_four_test_sessions', maxMs: 660000 },
    ],
    [
      'memory-cleanup-audit',
      `保持后台做清理后只读审计：读取会话、角色卡、世界书、用户清单和 APP 状态，确认「${label}」测试房、测试角色卡与测试世界书已不存在，测试用户「${userName}」仍 inactive，当前正式聊天室和身份未改变。不得补删或切换。`,
      ['session.list', 'app.resource.read', 'worldbook.list', 'app.state.read'],
      ['session.list', 'app.read_resource', 'worldbook.list', 'app.get_current_state'],
      { expectedDisposition: 'post_cleanup_read_only_audit', maxMs: 660000 },
    ],
    [
      'memory-user-delete-gap',
      `我想批量删除测试用户名称「${userName}」。先只查询能力目录；如果没有用户批量删除正式工具，就明确说明需要用户在管理 UI 手动处理，不得改用角色卡删除或 UI 坐标盲点。`,
      ['app.capabilities.search'],
      [],
      { expectedAnyTools: ['app.search_feature', 'app.read_feature_doc'], expectedDisposition: 'user_batch_delete_capability_gap_no_write', maxMs: 420000 },
    ],
    [
      'memory-final-semantic-recall',
      '不要调用工具。最后再根据长期记忆用一句话说出我的回复长度偏好与普通资源操作的默认呈现方式。',
      [],
      [],
      { autoConfirm: false, autoDeny: true, expectedDisposition: 'final_semantic_recall_no_tool' },
    ],
  ]);
};

addMemorySystemBatches(
  'memory-system-v4f-a-0730',
  'memory-system-v4f-b-0730',
  '记忆系统V4F-0730',
);
addMemorySystemBatches(
  'memory-system-g35-a-0730',
  'memory-system-g35-b-0730',
  '记忆系统G35-0730',
);

addBatch('cleanup-observation-sessions', [
  ['session-delete', '当前已经打开 APP 的聊天室列表。只删除精确名称「冻结观察会话-A-0728」：先调用 app.ui.inspect 检查 session 面板；已核对该行删除按钮为 ref=session:btn-7，请用 featureId=app.ui.click、toolName=ui.click_element 点击这个 ref。不要调用 app.open_panel、session.open_config 或点击其他 ref。删除完成后调用 session.list 验证该名称不存在。', ['app.visible_panel.read', 'app.ui.click', 'session.list'], ['app.ui.inspect', 'ui.click_element', 'session.list'], { appConfirmDeleteTarget: '冻结观察会话-A-0728', expectedDisposition: 'exact_ui_delete_and_verify' }],
  ['session-delete', '当前已经打开 APP 的聊天室列表。只删除精确名称「冻结观察会话-B-0728」：先调用 app.ui.inspect 检查 session 面板；已核对该行删除按钮为 ref=session:btn-6，请用 featureId=app.ui.click、toolName=ui.click_element 点击这个 ref。不要调用 app.open_panel、session.open_config 或点击其他 ref。删除完成后调用 session.list 验证该名称不存在。', ['app.visible_panel.read', 'app.ui.click', 'session.list'], ['app.ui.inspect', 'ui.click_element', 'session.list'], { appConfirmDeleteTarget: '冻结观察会话-B-0728', expectedDisposition: 'exact_ui_delete_and_verify' }],
  ['session-delete', '当前已经打开 APP 的聊天室列表。只删除精确名称「冻结观察会话-C-0728」：先调用 app.ui.inspect 检查 session 面板；已核对该行删除按钮为 ref=session:btn-5，请用 featureId=app.ui.click、toolName=ui.click_element 点击这个 ref。不要调用 app.open_panel、session.open_config 或点击其他 ref。删除完成后调用 session.list 验证该名称不存在。', ['app.visible_panel.read', 'app.ui.click', 'session.list'], ['app.ui.inspect', 'ui.click_element', 'session.list'], { appConfirmDeleteTarget: '冻结观察会话-C-0728', expectedDisposition: 'exact_ui_delete_and_verify' }],
  ['session-delete', '当前已经打开 APP 的聊天室列表。只删除精确名称「冻结观察会话-D-0728」：先调用 app.ui.inspect 检查 session 面板；已核对该行删除按钮为 ref=session:btn-4，请用 featureId=app.ui.click、toolName=ui.click_element 点击这个 ref。不要调用 app.open_panel、session.open_config 或点击其他 ref。删除完成后调用 session.list 验证该名称不存在。', ['app.visible_panel.read', 'app.ui.click', 'session.list'], ['app.ui.inspect', 'ui.click_element', 'session.list'], { appConfirmDeleteTarget: '冻结观察会话-D-0728', expectedDisposition: 'exact_ui_delete_and_verify' }],
]);

addBatch('cleanup-observation-sessions-remaining', [
  ['session-delete', '当前已经打开 APP 的聊天室列表。只删除精确名称「冻结观察会话-B-0728」：先调用 app.ui.inspect 检查 session 面板；已核对该行删除按钮为 ref=session:btn-6，请用 featureId=app.ui.click、toolName=ui.click_element 点击这个 ref。不要调用 app.open_panel、session.open_config 或点击其他 ref。删除完成后调用 session.list 验证该名称不存在。', ['app.visible_panel.read', 'app.ui.click', 'session.list'], ['app.ui.inspect', 'ui.click_element', 'session.list'], { appConfirmDeleteTarget: '冻结观察会话-B-0728', expectedDisposition: 'exact_ui_delete_and_verify' }],
  ['session-delete', '当前已经打开 APP 的聊天室列表。只删除精确名称「冻结观察会话-C-0728」：先调用 app.ui.inspect 检查 session 面板；已核对该行删除按钮为 ref=session:btn-5，请用 featureId=app.ui.click、toolName=ui.click_element 点击这个 ref。不要调用 app.open_panel、session.open_config 或点击其他 ref。删除完成后调用 session.list 验证该名称不存在。', ['app.visible_panel.read', 'app.ui.click', 'session.list'], ['app.ui.inspect', 'ui.click_element', 'session.list'], { appConfirmDeleteTarget: '冻结观察会话-C-0728', expectedDisposition: 'exact_ui_delete_and_verify' }],
  ['session-delete', '当前已经打开 APP 的聊天室列表。只删除精确名称「冻结观察会话-D-0728」：先调用 app.ui.inspect 检查 session 面板；已核对该行删除按钮为 ref=session:btn-4，请用 featureId=app.ui.click、toolName=ui.click_element 点击这个 ref。不要调用 app.open_panel、session.open_config 或点击其他 ref。删除完成后调用 session.list 验证该名称不存在。', ['app.visible_panel.read', 'app.ui.click', 'session.list'], ['app.ui.inspect', 'ui.click_element', 'session.list'], { appConfirmDeleteTarget: '冻结观察会话-D-0728', expectedDisposition: 'exact_ui_delete_and_verify' }],
]);
