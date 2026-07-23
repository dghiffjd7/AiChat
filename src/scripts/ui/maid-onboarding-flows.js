const clicked = target => (event, payload) => event === 'target-click' && payload?.target === target;

export const MAID_ONBOARDING_TARGET_SELECTORS = Object.freeze({
  'settings-entry': [
    '[data-maid-guide-target="settings-entry"]',
    '.qq-message-topbar .user-settings-btn',
  ],
  'settings-api-config': [
    '[data-maid-guide-target="settings-api-config"]',
    '#settings-menu button[data-action="config"]',
  ],
  'config-provider-select': [
    '[data-maid-guide-target="config-provider-select"]',
    '#config-provider-btn',
    '#config-provider',
  ],
  'config-connection-fields': [
    '[data-maid-guide-target="config-connection-fields"]',
    '#config-main-page',
  ],
  'config-api-key-input': [
    '[data-maid-guide-target="config-api-key-input"]',
    '#config-apikey',
  ],
  'config-model-select': [
    '[data-maid-guide-target="config-model-select"]',
    '#config-model',
  ],
  'config-save-btn': [
    '[data-maid-guide-target="config-save-btn"]',
    '#config-save',
  ],
  'top-plus-entry': [
    '[data-maid-guide-target="top-plus-entry"]',
    '.qq-message-topbar .topbar-plus-btn',
    '#plus-button',
  ],
  'quick-add-friend': [
    '[data-maid-guide-target="quick-add-friend"]',
    '#quick-menu button[data-action="add-friend"]',
  ],
  'add-friend-search-input': [
    '[data-maid-guide-target="add-friend-search-input"]',
    '#session-name',
  ],
  'add-friend-recommendation': [
    '[data-maid-guide-target="add-friend-recommendation"]',
    '.session-recommend-row',
  ],
  'add-friend-confirm': [
    '[data-maid-guide-target="add-friend-confirm"]',
    '.session-add-confirm-action.is-confirm',
  ],
  'chat-list-entry': [
    '[data-maid-guide-target="chat-list-entry"]',
    '#chat-list .chat-list-item',
    '.contact-item',
  ],
  'chat-input': [
    '[data-maid-guide-target="chat-input"]',
    '#composer-input',
  ],
  'chat-send': [
    '[data-maid-guide-target="chat-send"]',
    '#send-button',
  ],
  'chat-body': [
    '[data-maid-guide-target="chat-body"]',
    '#chat-messages',
    '.msgcontent',
  ],
  'maid-ball': ['#mode-switch'],
  'maid-command-input': ['.maid-command-input-field'],
  'maid-command-settings': ['.maid-command-input-settings'],
  'settings-agent-center': [
    '[data-maid-guide-target="settings-agent-center"]',
    '#settings-menu button[data-action="agent-center"]',
  ],
  'agent-center-entry': [
    '[data-maid-guide-target="settings-agent-center"]',
    '[data-maid-guide-target="agent-center-entry"]',
    '.agent-status-chip',
  ],
  'agent-center-card': [
    '[data-maid-guide-target="agent-center-card"]',
    '[data-agent-card-open]',
  ],
  'agent-center-detail-close': [
    '[data-maid-guide-target="agent-center-detail-close"]',
    '[data-agent-float-close]',
  ],
  'agent-center-close': [
    '[data-maid-guide-target="agent-center-close"]',
    '.agent-center-overlay [data-action="close"]',
  ],
});

export const MAID_ONBOARDING_FLOWS = Object.freeze([
  {
    id: 'setup-api',
    title: '给女仆接上大脑',
    goal: '保存一份可用的聊天 API 配置',
    reward: '初次接线',
    doneText: 'API 接线教学 · 完成',
    steps: [
      {
        action: 'observe',
        text: '欢迎回来，主人～女仆要先接上一份 API 配置才能真正替你做事。跟着聚光灯走，大约两分钟就能完成。',
        primaryLabel: '开始接线',
      },
      {
        target: 'settings-entry',
        placement: 'bottom',
        action: 'click',
        text: '先点开右上角的设置入口，我会替主人守住其他按钮。',
        hint: '点击高亮的设置按钮',
        fallback: { kind: 'open-settings-menu' },
        canAdvance: clicked('settings-entry'),
      },
      {
        target: 'settings-api-config',
        placement: 'left',
        action: 'click',
        text: '找到「API 设定」，打开连线配置面板。',
        hint: '点击 API 设定',
        fallback: { kind: 'open-api-config' },
        canAdvance: clicked('settings-api-config'),
      },
      {
        target: 'config-connection-fields',
        placement: 'right',
        action: 'type',
        text: '选择服务商后，在这里贴上 API Key，再确认模型名称。Key 只留在本机配置里，引导事件不会读取它的内容。',
        hint: '选择服务商并填写 API Key',
        fallback: { kind: 'focus-target', target: 'config-api-key-input' },
        canAdvance: (event, payload) => event === 'config-credentials-ready' && payload?.hasKey === true && payload?.hasModel === true,
      },
      {
        target: 'config-save-btn',
        placement: 'top',
        action: 'wait-event',
        text: '最后按下保存。只有配置真的保存成功，我才会把这堂课记为完成。',
        hint: '保存可用配置',
        canAdvance: (event, payload) => event === 'config-profile-saved' && Number(payload?.profileCount || 0) > 0,
      },
    ],
  },
  {
    id: 'add-friend',
    title: '添加第一位好友',
    goal: '从推荐列表添加一位角色好友',
    reward: '初次相遇',
    doneText: '添加好友教学 · 完成',
    steps: [
      {
        action: 'observe',
        text: '我们来认识第一位朋友：打开添加好友，挑一位推荐角色，再确认添加。',
        primaryLabel: '去认识朋友',
      },
      {
        target: 'top-plus-entry',
        placement: 'bottom',
        action: 'click',
        text: '先点顶部的「+」打开快捷菜单。',
        hint: '点击高亮的加号',
        fallback: { kind: 'open-quick-menu' },
        canAdvance: clicked('top-plus-entry'),
      },
      {
        target: 'quick-add-friend',
        placement: 'left',
        action: 'click',
        text: '选择「添加好友」。',
        hint: '点击添加好友',
        fallback: { kind: 'open-add-friend' },
        canAdvance: clicked('quick-add-friend'),
      },
      {
        target: 'add-friend-search-input',
        placement: 'bottom',
        action: 'click',
        text: '点一下名称输入框，推荐角色会从这里展开。',
        hint: '点击输入框查看推荐',
        fallback: { kind: 'focus-target' },
        canAdvance: clicked('add-friend-search-input'),
      },
      {
        target: 'add-friend-recommendation',
        placement: 'right',
        action: 'click',
        text: '挑一位喜欢的角色。之后也可以随时回来继续添加。',
        hint: '点击任意推荐角色',
        fallback: { kind: 'click-target' },
        canAdvance: clicked('add-friend-recommendation'),
      },
      {
        target: 'add-friend-confirm',
        placement: 'top',
        action: 'wait-event',
        text: '确认后会建立联系人、聊天室与对应世界书。完成写入后我会自动继续。',
        hint: '确认添加好友',
        fallback: { kind: 'click-target' },
        canAdvance: (event, payload) => event === 'friend-added' && Boolean(payload?.sessionId),
      },
    ],
  },
  {
    id: 'first-chat',
    title: '第一次对话',
    goal: '发送消息并收到第一条 AI 回复',
    reward: '聊落成花',
    doneText: '第一次对话 · 完成',
    steps: [
      {
        action: 'observe',
        text: 'API 已经接好啦。现在进入一个聊天室、发句话，再等角色回复。',
        primaryLabel: '开始聊天',
      },
      {
        target: 'chat-list-entry',
        placement: 'right',
        action: 'wait-event',
        text: '从联系人列表进入任意一个私聊或群聊。',
        hint: '选择一间聊天室',
        canAdvance: (event, payload) => (
          (event === 'chat-room-entered' && Boolean(payload?.sessionId)) ||
          (event === 'session-changed' && Boolean(payload?.id))
        ),
      },
      {
        target: 'chat-input',
        placement: 'top',
        action: 'type',
        text: '在输入框写一句想说的话。',
        hint: '输入任意内容',
        fallback: { kind: 'focus-target' },
        canAdvance: (event, payload) => event === 'chat-composer-input' && Number(payload?.length || 0) > 0,
      },
      {
        target: 'chat-send',
        placement: 'top',
        action: 'wait-event',
        text: '按发送，把第一句话交给角色。',
        hint: '发送消息',
        canAdvance: (event, payload) => event === 'chat-message-sent' && Boolean(payload?.sessionId),
      },
      {
        target: 'chat-body',
        placement: 'top',
        action: 'wait-event',
        text: '角色正在回复。收到完整的 AI 消息后，这堂课就完成了。',
        hint: '等待 AI 回复',
        canAdvance: (event, payload) => event === 'chat-message-received' && payload?.role === 'assistant',
      },
    ],
  },
  {
    id: 'meet-maid',
    title: '认识女仆与 Agent Center',
    goal: '打开女仆指令条并认识 Agent Center',
    reward: '工位巡视员',
    doneText: '女仆与 Agent Center · 完成',
    steps: [
      {
        action: 'observe',
        text: '最后来认识女仆的工作台：从悬浮球打开指令条，再看看 Agent Center 里的小帮手。',
        primaryLabel: '出发',
      },
      {
        target: 'maid-ball',
        placement: 'bottom',
        action: 'wait-event',
        text: '长按这颗悬浮球打开女仆指令条。电脑上按住片刻，手机上也是长按。',
        hint: '长按女仆悬浮球',
        fallback: { kind: 'open-maid-command' },
        canAdvance: event => event === 'maid-command-opened',
      },
      {
        target: 'maid-command-input',
        placement: 'bottom',
        action: 'observe',
        text: '这就是女仆指令条。右侧齿轮只负责女仆自己的设定；Agent Center 有独立入口。',
        primaryLabel: '去看 Agent Center',
      },
      {
        target: 'agent-center-entry',
        placement: 'bottom',
        action: 'click',
        text: '从设置菜单进入 Agent Center；在聊天室或动态页，也可以直接点右上角的「A」。',
        hint: '打开 Agent Center',
        fallback: { kind: 'open-agent-center' },
        canAdvance: (event, payload) => (
          event === 'agent-center-opened'
          || (
            event === 'target-click'
            && ['settings-agent-center', 'agent-center-entry'].includes(payload?.target)
          )
        ),
      },
      {
        target: 'agent-center-card',
        placement: 'bottom',
        action: 'click',
        text: '这些卡片就是不同的小帮手。点开任意卡片，可以查看说明与配置。',
        hint: '点击任意 Agent 卡片',
        fallback: { kind: 'click-target' },
        canAdvance: clicked('agent-center-card'),
      },
      {
        target: 'agent-center-detail-close',
        placement: 'left',
        action: 'click',
        text: '卡片详情会从右侧展开。看完后先关闭详情，回到 Agent 列表。',
        hint: '关闭卡片详情',
        fallback: { kind: 'click-target' },
        canAdvance: clicked('agent-center-detail-close'),
      },
      {
        target: 'agent-center-close',
        placement: 'left',
        action: 'click',
        text: '点右上角关闭 Agent Center，巡视就完成了。',
        hint: '关闭 Agent Center',
        fallback: { kind: 'close-agent-center' },
        canAdvance: (event, payload) => (
          event === 'agent-center-closed'
          || (event === 'target-click' && payload?.target === 'agent-center-close')
        ),
      },
    ],
  },
]);

const FLOW_BY_ID = new Map(MAID_ONBOARDING_FLOWS.map(flow => [flow.id, flow]));

export const getMaidOnboardingFlow = flowId => FLOW_BY_ID.get(String(flowId || '').trim()) || null;

export const ONBOARDING_TASKS = Object.freeze([
  {
    id: 'task-setup-api',
    flowId: 'setup-api',
    label: '给女仆接上大脑',
    description: '保存一份可用的聊天 API 配置',
    reward: '初次接线',
    icon: 'plug',
  },
  {
    id: 'task-add-friend',
    flowId: 'add-friend',
    label: '添加第一位好友',
    description: '从推荐列表认识一位角色',
    reward: '初次相遇',
    icon: 'user-plus',
  },
  {
    id: 'task-first-chat',
    flowId: 'first-chat',
    label: '第一次对话',
    description: '发送消息并收到角色回复',
    reward: '聊落成花',
    icon: 'message',
    requires: 'setup-api',
  },
  {
    id: 'task-meet-maid',
    flowId: 'meet-maid',
    label: '认识女仆与 Agent Center',
    description: '巡视女仆工作台与 Agent 小帮手',
    reward: '工位巡视员',
    icon: 'sparkles',
  },
]);
