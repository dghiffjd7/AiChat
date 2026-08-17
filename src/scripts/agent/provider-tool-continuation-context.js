const contexts = new WeakMap();

const isObject = value => Boolean(value && typeof value === 'object');

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

export const attachProviderToolContinuationContext = (target, context = null) => {
  if (!isObject(target) || !isObject(context)) return target;
  contexts.set(target, clone(context));
  return target;
};

export const readProviderToolContinuationContext = (target) => {
  if (!isObject(target)) return null;
  const context = contexts.get(target);
  return context ? clone(context) : null;
};

export const copyProviderToolContinuationContext = (source, target) => {
  const context = readProviderToolContinuationContext(source);
  return context ? attachProviderToolContinuationContext(target, context) : target;
};
