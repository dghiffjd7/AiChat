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
