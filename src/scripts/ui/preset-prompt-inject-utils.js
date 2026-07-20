/* 预设「注入选择条」纯逻辑：chip 定义、状态快照、点击语义、注入卡与预览标志。
   语义（2026-07-16 澄清）：chip 只管「预览与区块列表的展示」，不动任何功能开关——
   加入项按 openai 预设存本地展示态；私聊/群聊是预览场景单选（实际发送按会话类型自动二选一）；
   点亮项若底层功能未启用则挂 ! 警示，点击弹启用界面。本模块不做 IO。 */

import { SYSPROMPT_AGENT_PROMPT_MAPPINGS } from '../storage/agent-center-settings-store.js';

const findMapping = (agentId, promptId) =>
  SYSPROMPT_AGENT_PROMPT_MAPPINGS.find(m => m.agentId === agentId && m.promptId === promptId) || null;

/* chip 顺序即显示顺序；scenario 标记私聊/群聊场景（预览场景单选对）。
   聊天记录不设 chip：预设面板从通用设定打开、无会话历史语境，预览固定折叠为占位 */
export const PRESET_INJECT_ITEMS = Object.freeze([
  { id: 'memory', label: '记忆表格', kind: 'memory' },
  { id: 'dialogue', label: '私聊', kind: 'sysprompt', agentId: 'dialogue_agent', promptId: 'dialogue', scenario: 'private' },
  { id: 'group', label: '群聊', kind: 'sysprompt', agentId: 'group_agent', promptId: 'group', scenario: 'group' },
  { id: 'image', label: '图片', kind: 'sysprompt', agentId: 'image_director', promptId: 'auto-image-prompt' },
  { id: 'moment', label: '动态发布', kind: 'sysprompt', agentId: 'moment_agent', promptId: 'moment' },
]);

/* 可加入展示态的非场景项（scenario 项走 previewScenario 单选） */
export const PRESET_INJECT_ADDABLE_IDS = Object.freeze(['memory', 'image', 'moment']);

export const getInjectItem = (itemId) => PRESET_INJECT_ITEMS.find(item => item.id === itemId) || null;

const readSyspromptItemConfig = (sysp = {}, item = {}) => {
  const mapping = findMapping(item.agentId, item.promptId);
  if (!mapping) return { enabled: false, rules: '', position: 0, depth: 0, role: 0 };
  const defaults = mapping.defaults || {};
  const num = (value, fallback) => (Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback);
  return {
    enabled: Boolean(sysp?.[mapping.enabledKey]),
    rules: typeof sysp?.[mapping.rulesKey] === 'string' ? sysp[mapping.rulesKey] : '',
    position: num(sysp?.[mapping.positionKey], num(defaults.position, 0)),
    depth: Math.max(0, num(sysp?.[mapping.depthKey], num(defaults.depth, 0))),
    role: num(sysp?.[mapping.roleKey], num(defaults.role, 0)),
  };
};

/* 记忆表格在聊天场景是否会实际注入（对齐 getMemoryStorageMode('chat') 的判定） */
export const isMemoryChatInjectActive = (settingsState = {}) => (
  settingsState.memoryEnabled !== false
  && String(settingsState.memoryStorageMode || 'table').toLowerCase() === 'table'
  && settingsState.memoryTableEnabledChat !== false
);

/* 记忆功能的通用设定级阻断（chip 启用弹窗无法直接开的部分）；'' 表示只差聊天位开关 */
export const describeMemoryChipBlocker = (settingsState = {}) => {
  if (settingsState.memoryEnabled === false) return '记忆功能已在通用设定关闭，请先在通用设定开启';
  if (String(settingsState.memoryStorageMode || 'table').toLowerCase() !== 'table') {
    return '当前记忆模式为摘要，表格记忆提示词不参与组装（可在通用设定切换）';
  }
  return '';
};

/* 各项底层功能是否启用（决定 ! 警示与启用弹窗） */
export const isInjectFeatureEnabled = (itemId, { sysp = {}, settingsState = {} } = {}) => {
  if (itemId === 'memory') return isMemoryChatInjectActive(settingsState);
  if (itemId === 'image') return settingsState.autoImagePromptEnabled === true && sysp.auto_image_prompt_enabled !== false;
  if (itemId === 'moment') return Boolean(sysp.moment_create_enabled);
  if (itemId === 'dialogue') return sysp.dialogue_enabled !== false;
  if (itemId === 'group') return sysp.group_enabled !== false;
  return true;
};

export const describeInjectFeatureBlocker = (itemId, { sysp = {}, settingsState = {} } = {}) => {
  if (isInjectFeatureEnabled(itemId, { sysp, settingsState })) return '';
  if (itemId === 'memory') return describeMemoryChipBlocker(settingsState) || '记忆表格（聊天）未开启';
  if (itemId === 'image') {
    return settingsState.autoImagePromptEnabled !== true
      ? '自动生图总开关未开启，实际发送不会注入'
      : '生图提示词已被停用，实际发送不会注入';
  }
  if (itemId === 'moment') return '动态发布决策未启用，实际发送不会注入';
  if (itemId === 'dialogue') return '私聊格式提示词已被停用，实际发送不会注入';
  return '群聊格式提示词已被停用，实际发送不会注入';
};

/* 动态发布是否处于焦点预览：点亮时其他项隐藏、预览只组装发布决策（隔离查看，
   不代表真实发送——发布决策实际随普通私聊/群聊请求注入） */
export const isMomentSoloActive = (added = []) => added.includes('moment');

/* 快照 → chip 视图状态列表。on = 展示态加入（scenario 项 = 当前预览场景）；
   warn = 加入但功能未启用；hidden = 动态发布焦点预览时其他项隐藏 */
export const buildPresetInjectChipStates = ({
  sysp = {},
  settingsState = {},
  added = [],
  previewScenario = '',
} = {}) => {
  const momentSolo = isMomentSoloActive(added);
  return PRESET_INJECT_ITEMS.map((item) => {
    const hidden = momentSolo && item.id !== 'moment';
    const on = item.scenario
      ? previewScenario === item.scenario
      : added.includes(item.id);
    const warnText = on && !hidden ? describeInjectFeatureBlocker(item.id, { sysp, settingsState }) : '';
    return { id: item.id, label: item.label, kind: item.kind, scenario: item.scenario || '', on, warnText, hidden };
  });
};

/* 点击语义（纯函数）——chip 本体点击永远是加入/移除（关闭优先），
   启用界面由 ! 角标单独触发（panel 层分流，不进本函数）：
   - 私聊/群聊：点当前场景→remove-scenario；点另一个→set-scenario（预览层择一）
   - 记忆/图片/动态发布：add / remove 展示态 */
export const applyInjectChipTap = ({
  itemId = '',
  chipStates = [],
  previewScenario = '',
} = {}) => {
  const item = getInjectItem(itemId);
  const state = chipStates.find(s => s.id === itemId) || null;
  if (!item || !state) return { action: 'none', nextScenario: previewScenario };
  if (item.scenario) {
    if (previewScenario === item.scenario) return { action: 'remove-scenario', nextScenario: '' };
    return { action: 'set-scenario', nextScenario: item.scenario };
  }
  if (!state.on) return { action: 'add', nextScenario: previewScenario };
  return { action: 'remove', nextScenario: previewScenario };
};

/* 展示态 → 预览组装标志。
   明确选了私聊/群聊才带聊天格式；仅加入记忆/图片时按私聊场景组装但不带聊天格式；
   动态发布焦点预览时只组装发布决策（其余全部抑制）。 */
export const buildPreviewInjectFlags = ({ added = [], previewScenario = '' } = {}) => {
  if (isMomentSoloActive(added)) {
    return {
      previewUiMode: 'chat',
      previewScenario: previewScenario || 'private',
      previewChatFormat: false,
      previewInjectMemory: false,
      previewInjectImage: false,
      previewInjectMomentCreate: true,
    };
  }
  const chatItemAdded = PRESET_INJECT_ADDABLE_IDS.some(id => added.includes(id));
  const effectiveScenario = previewScenario || (chatItemAdded ? 'private' : '');
  return {
    previewUiMode: effectiveScenario ? 'chat' : 'rp',
    previewScenario: effectiveScenario,
    previewChatFormat: Boolean(previewScenario),
    previewInjectMemory: added.includes('memory'),
    previewInjectImage: added.includes('image'),
    previewInjectMomentCreate: false,
  };
};

/* ST extension position → 卡片副标题描述 */
export const describeInjectPlacement = ({ position = 0, depth = 0, role = 0 } = {}) => {
  const pos = Number.isFinite(Number(position)) ? Math.trunc(Number(position)) : 0;
  const roleText = ['system', 'user', 'assistant'][Math.trunc(Number(role)) || 0] || 'system';
  let base;
  if (pos === -1) base = '不注入';
  else if (pos === 2) base = 'main 之前';
  else if (pos === 1) base = `聊天内 · 深度 ${Math.max(0, Math.trunc(Number(depth)) || 0)}`;
  else if (pos === 3) base = '聊天内 · 深度 1';
  else if (pos === 4) base = '最新输入前';
  else if (pos === 5) base = '最新输入后';
  else base = 'main 之后';
  return roleText === 'system' ? base : `${base} · ${roleText}`;
};

/* 与 Agent Center 记忆编辑器同一套位置选项/文案 */
export const MEMORY_POSITION_OPTIONS = Object.freeze([
  { value: '', label: '跟随通用设置' },
  { value: 'template', label: '模板默认' },
  { value: 'before_latest_user', label: '最新输入前' },
  { value: 'after_latest_user', label: '最新输入后' },
  { value: 'history_depth', label: '历史深度' },
  { value: 'before_chat', label: '聊天前' },
  { value: 'history_before', label: '历史前' },
  { value: 'history_after', label: '历史后' },
  { value: 'system_end', label: '系统末尾' },
  { value: 'system_end+before_chat', label: '系统末尾 + 聊天前' },
]);

/* 与 Agent Center 提示词编辑器同一套注入位置/角色选项 */
export const PROMPT_POSITION_OPTIONS = Object.freeze([
  { value: 0, label: 'IN_PROMPT' },
  { value: 1, label: 'IN_CHAT' },
  { value: 3, label: '聊天内 · 深度 1' },
  { value: 4, label: '最新输入前' },
  { value: 5, label: '最新输入后' },
  { value: 2, label: 'BEFORE_PROMPT' },
  { value: -1, label: 'NONE' },
]);

export const PROMPT_ROLE_OPTIONS = Object.freeze([
  { value: 0, label: 'SYSTEM' },
  { value: 1, label: 'USER' },
  { value: 2, label: 'ASSISTANT' },
]);

export const resolveSelectValueWithFallback = (selectedValue, originalValue = '') => {
  const selected = String(selectedValue ?? '');
  return selected === '' ? String(originalValue ?? '') : selected;
};

/* select 的空值同时承担「未匹配」与「跟随通用设置」两种含义；现值不在选项表时
   注入保值选项，空值即恒为用户主动选择，legacy 组合 token 也能显式改回空值。 */
export const withCurrentSelectOption = (options = [], currentValue = '') => {
  const value = String(currentValue ?? '');
  if (!value || options.some(option => String(option.value) === value)) return options;
  return [...options, { value, label: `保持当前（${value}）` }];
};

const MEMORY_POSITION_LABELS = Object.freeze({
  '': '跟随通用设置',
  template: '模板默认',
  before_latest_user: '最新输入前',
  after_latest_user: '最新输入后',
  history_depth: '历史深度',
  before_chat: '聊天前',
  history_before: '历史前',
  history_after: '历史后',
  system_end: '系统末尾',
});

export const describeMemoryPlacement = (positionToken = '', depth = 0) => {
  const tokens = String(positionToken || '').split('+').map(t => t.trim()).filter(Boolean);
  if (!tokens.length) return MEMORY_POSITION_LABELS[''];
  const label = tokens.map(t => MEMORY_POSITION_LABELS[t] || t).join(' + ');
  const d = Math.max(0, Math.trunc(Number(depth)) || 0);
  return tokens.includes('history_depth') ? `${label} ${d}` : label;
};

/* 注入卡在区块列表中的插入锚点 */
export const resolveInjectCardAnchor = (position = 0) => {
  const pos = Number.isFinite(Number(position)) ? Math.trunc(Number(position)) : 0;
  if (pos === 2) return 'before_main';
  if (pos === 0) return 'after_main';
  return 'history';
};

/* 展示态加入的项 → 区块列表注入卡定义（featureOff 用于副标题警示） */
export const buildInjectCardDefs = ({
  sysp = {},
  settingsState = {},
  added = [],
  previewScenario = '',
  memoryPlacement = null, // { guidePosition, guideDepth, dataPosition, dataDepth }
} = {}) => {
  const defs = [];
  const momentSolo = isMomentSoloActive(added);
  PRESET_INJECT_ITEMS.forEach((item) => {
    if (item.kind === 'preview') return;
    if (momentSolo && item.id !== 'moment') return; // 焦点预览只留动态发布卡
    const featureOff = !isInjectFeatureEnabled(item.id, { sysp, settingsState });
    if (item.kind === 'memory') {
      if (!added.includes('memory')) return;
      const mp = memoryPlacement || {};
      defs.push({
        itemId: 'memory',
        cardId: 'memory_guide',
        title: '记忆表格 · 写表指导',
        sub: describeMemoryPlacement(mp.guidePosition, mp.guideDepth),
        anchor: 'history',
        featureOff,
      });
      defs.push({
        itemId: 'memory',
        cardId: 'memory_data',
        title: '记忆表格 · 表格记忆',
        sub: describeMemoryPlacement(mp.dataPosition, mp.dataDepth),
        anchor: 'history',
        featureOff,
      });
      return;
    }
    if (item.scenario) {
      if (previewScenario !== item.scenario) return;
    } else if (!added.includes(item.id)) {
      return;
    }
    const cfg = readSyspromptItemConfig(sysp, item);
    defs.push({
      itemId: item.id,
      cardId: item.id,
      title: {
        dialogue: '私聊格式提示词',
        group: '群聊格式提示词',
        image: '自动生图提示词',
        moment: '动态发布决策提示词',
      }[item.id] || item.label,
      sub: describeInjectPlacement(cfg),
      anchor: resolveInjectCardAnchor(cfg.position),
      featureOff,
    });
  });
  return defs;
};

export const readInjectItemConfig = (sysp = {}, itemId = '') => {
  const item = getInjectItem(itemId);
  if (!item || item.kind !== 'sysprompt') return null;
  return readSyspromptItemConfig(sysp, item);
};
