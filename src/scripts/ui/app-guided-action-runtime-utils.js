import { findAppFeature } from '../agent/app-feature-catalog.js';

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const list = value => (Array.isArray(value) ? value : [value])
  .map(item => trim(item))
  .filter(Boolean);

const GUIDE_STEP_SELECTOR_CANDIDATES = Object.freeze({
  '顶部 +': [
    '[data-maid-guide-target="top-plus-entry"]',
    '.qq-message-topbar .topbar-plus-btn',
    '#plus-button',
  ],
  '好友列表': [
    '[data-maid-guide-target="quick-add-friend"]',
    '#quick-menu button[data-action="add-friend"]',
  ],
  '聊天列表': [
    '[data-maid-guide-target="chat-list"]',
    '#chat-list',
    '#chat-list .chat-list-item',
  ],
  '点击联系人或群组': [
    '#chat-list .chat-list-item',
    '.contact-item',
  ],
  '聊天室': [
    '#chat-room',
  ],
  '输入框': [
    '#composer-input',
  ],
  '发送': [
    '#send-button',
  ],
  '设置': [
    '[data-maid-guide-target="settings-entry"]',
    '.qq-message-topbar .user-settings-btn',
  ],
  'API / 模型配置': [
    '[data-maid-guide-target="settings-api-config"]',
    '#settings-menu button[data-action="config"]',
  ],
  '服务商': [
    '[data-maid-guide-target="config-provider-select"]',
    '#config-provider-btn',
    '#config-provider',
  ],
  'API Key': [
    '[data-maid-guide-target="config-api-key-input"]',
    '#config-apikey',
  ],
  '模型': [
    '[data-maid-guide-target="config-model-select"]',
    '#config-model',
  ],
  '保存配置': [
    '[data-maid-guide-target="config-save-btn"]',
    '#config-save',
  ],
  'Agent Center': [
    '[data-maid-guide-target="settings-agent-center"]',
    '#settings-menu button[data-action="agent-center"]',
  ],
  '世界书': [
    '[data-maid-guide-target="chatroom-world"]',
    '[data-maid-guide-target="settings-world-global"]',
    '#chatroom-menu button[data-action="world"]',
    '#rp-chatroom-menu button[data-action="world"]',
    '#settings-menu button[data-action="world-global"]',
  ],
  '变量': [
    '[data-maid-guide-target="chatroom-vars"]',
    '#chatroom-menu button[data-action="vars"]',
    '#rp-chatroom-menu button[data-action="vars"]',
  ],
  '正则 / 后处理': [
    '[data-maid-guide-target="chatroom-regex"]',
    '#chatroom-menu button[data-action="regex"]',
    '#rp-chatroom-menu button[data-action="regex"]',
  ],
  '聊天室标题': [
    '[data-maid-guide-target="chat-title-entry"]',
    '#current-chat-title',
  ],
  '头像/用户入口': [
    '[data-maid-guide-target="avatar-user-entry"]',
    '.qq-message-topbar .user-avatar-btn',
  ],
  '头像/角色入口': [
    '[data-maid-guide-target="avatar-user-entry"]',
    '.qq-message-topbar .user-avatar-btn',
  ],
  '用户': [
    '[data-maid-guide-target="persona-switcher-tab-user"]',
    '#persona-switcher-menu button[data-action="switcher-tab"][data-tab="user"]',
  ],
  '角色卡': [
    '[data-maid-guide-target="persona-switcher-tab-character"]',
    '#persona-switcher-menu button[data-action="switcher-tab"][data-tab="character"]',
  ],
  '管理用户': [
    '[data-maid-guide-target="manage-users"]',
    '#persona-switcher-menu button[data-action="manage-users"]',
  ],
  '管理角色卡': [
    '[data-maid-guide-target="manage-cards"]',
    '#persona-switcher-menu button[data-action="manage-cards"]',
  ],
  '聊天室右上角菜单': [
    '[data-maid-guide-target="chatroom-menu-entry"]',
    '#chat-menu-btn',
  ],
  '会话配置': [
    '[data-maid-guide-target="chat-title-session-config"]',
    '[data-maid-guide-target="settings-session-config"]',
    '#chat-title-menu button[data-action="session-config"]',
    '#settings-menu button[data-action="session-config"]',
  ],
  '新建': [
    '[data-maid-guide-target="create-user"]',
    '[data-maid-guide-target="create-persona"]',
    '#create-user-btn',
    '#create-persona-btn',
  ],
  '选择用户': [
    '#persona-switcher-menu [data-user-id]',
  ],
  '选择角色卡': [
    '#persona-switcher-menu [data-persona-id]',
  ],
});

const GUIDE_CHAT_LIST_ENTRY_LABELS = new Set([
  '顶部 +',
  '好友列表',
  '聊天列表',
  '点击联系人或群组',
  '设置',
  '头像/用户入口',
  '头像/角色入口',
]);

const GUIDE_CHAT_ROOM_ENTRY_LABELS = new Set([
  '聊天室',
  '聊天室标题',
  '聊天室右上角菜单',
  '输入框',
  '发送',
  '会话配置',
]);

const readFirstText = (source = {}, keys = []) => {
  for (const key of keys) {
    const value = trim(source?.[key]);
    if (value) return value;
  }
  return '';
};

const getGuideFirstStep = (guide = {}) => {
  if (Array.isArray(guide?.stepDetails) && guide.stepDetails.length) return guide.stepDetails[0];
  const label = Array.isArray(guide?.steps) ? trim(guide.steps[0]) : '';
  return label ? { index: 0, label, selectors: [] } : null;
};

export const prepareGuidedActionEntryNavigation = async ({
  guide = {},
  meta = {},
  isTargetVisible = null,
  isChatRoomVisible = null,
  hideMenus = null,
  exitChatRoom = null,
  switchPage = null,
  resolveSessionTarget = null,
  getCurrentSessionId = null,
  enterChatRoom = null,
} = {}) => {
  const step = getGuideFirstStep(guide);
  const label = trim(step?.label || step);
  if (!label) return { navigated: false, route: '', reason: 'missing_step' };

  try {
    if (typeof isTargetVisible === 'function' && await isTargetVisible(guide, step)) {
      return { navigated: false, route: '', reason: 'target_visible' };
    }

    if (GUIDE_CHAT_LIST_ENTRY_LABELS.has(label)) {
      await hideMenus?.();
      if (isChatRoomVisible?.()) await exitChatRoom?.({ animate: false, source: 'maid-guide' });
      await switchPage?.('chat', { animate: false });
      return { navigated: true, route: 'chat_list', reason: 'navigated' };
    }

    if (GUIDE_CHAT_ROOM_ENTRY_LABELS.has(label)) {
      const plan = isPlainObject(meta?.plan) ? meta.plan : {};
      const args = isPlainObject(plan?.args) ? plan.args : {};
      const context = isPlainObject(meta?.context) ? meta.context : {};
      const sessionArgKeys = ['sessionId', 'sessionName', 'target', 'chatName'];
      if (trim(plan.toolName) === 'session.open_config' || trim(plan.featureId) === 'session.config.open') {
        sessionArgKeys.push('name');
      }
      const explicitQuery = readFirstText(args, sessionArgKeys);
      const contextQuery = readFirstText(context, ['sessionId', 'sessionName', 'target', 'chatName']);
      const query = explicitQuery || contextQuery || trim(getCurrentSessionId?.());
      if (!query) return { navigated: false, route: 'chat_room', reason: 'missing_session_id' };
      if (typeof resolveSessionTarget !== 'function') {
        return { navigated: false, route: 'chat_room', reason: 'navigation_unavailable' };
      }
      const resolved = await resolveSessionTarget(query, { explicit: Boolean(explicitQuery) });
      const sessionId = trim(typeof resolved === 'string' ? resolved : (resolved?.id || resolved?.sessionId));
      if (!sessionId) return { navigated: false, route: 'chat_room', reason: 'session_not_found' };
      const sessionName = trim(resolved?.name || resolved?.sessionName, sessionId);
      await hideMenus?.();
      await switchPage?.('chat', { animate: false });
      const entered = await enterChatRoom?.(sessionId, sessionName);
      if (entered?.blocked === true) {
        return {
          navigated: false,
          route: 'chat_room',
          reason: trim(entered?.reason, 'room_entry_blocked'),
          sessionId,
        };
      }
      return { navigated: true, route: 'chat_room', reason: 'navigated', sessionId };
    }

    return { navigated: false, route: '', reason: 'entry_not_required' };
  } catch (error) {
    return {
      navigated: false,
      route: '',
      reason: 'navigation_failed',
      errorMessage: trim(error?.message || error),
    };
  }
};

export const isGuidedActionOutputOk = (output = {}) => {
  if (output?.status && output.status !== 'succeeded') return false;
  const result = output !== null &&
    output !== undefined &&
    Object.prototype.hasOwnProperty.call(Object(output), 'result')
    ? output.result
    : output;
  if (isPlainObject(result) && result.ok === false) return false;
  return true;
};

export const buildGuidedActionGuide = (feature = {}) => {
  const guideId = trim(feature.firstRunGuide);
  if (!guideId) return null;
  const title = trim(feature.title || feature.id, '这个功能');
  const steps = list(feature.uiPath);
  const stepDetails = steps.map((label, index) => ({
    index,
    label,
    selectors: GUIDE_STEP_SELECTOR_CANDIDATES[label] || [],
  }));
  return {
    guideId,
    featureId: trim(feature.id),
    title,
    steps,
    stepDetails,
    pathText: steps.join(' -> '),
    message: steps.length
      ? `首次引导：${title}的 APP 路径是「${steps.join(' -> ')}」。`
      : `首次引导：${title}没有固定界面路径，我会直接帮你执行。`,
  };
};

export const createAppGuidedActionRuntime = ({
  guideStore = null,
  getFeature = findAppFeature,
  showGuide = null,
} = {}) => {
  const resolveFeature = (plan = {}) => {
    const featureId = trim(plan?.featureId);
    if (!featureId || typeof getFeature !== 'function') return null;
    return getFeature(featureId);
  };

  const isGuideCompleted = (guideId = '') => {
    const id = trim(guideId);
    if (!id) return true;
    return guideStore?.isCompleted?.(id) === true;
  };

  const run = async ({ plan = {}, context = {}, execute = null } = {}) => {
    if (typeof execute !== 'function') {
      throw new Error('guided action execute function is required');
    }
    const feature = resolveFeature(plan);
    const guide = feature ? buildGuidedActionGuide(feature) : null;
    const shouldGuide = Boolean(guide?.guideId && plan?.skipGuide !== true && !isGuideCompleted(guide.guideId));
    if (shouldGuide && typeof showGuide === 'function') {
      await showGuide(clone(guide), { plan: clone(plan), context: clone(context) });
    }
    const output = await execute();
    if (shouldGuide && isGuidedActionOutputOk(output)) {
      guideStore?.markCompleted?.(guide.guideId, {
        featureId: guide.featureId,
        title: guide.title,
      });
    }
    return {
      output,
      guided: shouldGuide,
      guide: shouldGuide ? guide : null,
      message: shouldGuide
        ? `${guide.message} 以后我会直接执行这个动作。`
        : '',
    };
  };

  return {
    run,
    isGuideCompleted,
    resetGuide: guideId => guideStore?.resetGuide?.(guideId) === true,
    resetAll: () => guideStore?.resetAll?.() === true,
  };
};
