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
  return {
    guideId,
    featureId: trim(feature.id),
    title,
    steps,
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
