export const UPDATE_VARIABLE_APPLY_FN_KEY = '__chatappApplyUpdateVariableFromMessage';

export const registerUpdateVariableApplyFn = (
  fn,
  {
    globalWindow = typeof window !== 'undefined' ? window : null,
    key = UPDATE_VARIABLE_APPLY_FN_KEY,
  } = {},
) => {
  if (!globalWindow || typeof key !== 'string' || !key) return false;
  globalWindow[key] = fn;
  return true;
};

export const resolveUpdateVariableApplyFn = (
  localFn,
  {
    globalWindow = typeof window !== 'undefined' ? window : null,
    key = UPDATE_VARIABLE_APPLY_FN_KEY,
  } = {},
) => {
  if (typeof localFn === 'function') return localFn;
  if (!globalWindow || typeof key !== 'string' || !key) return null;
  const globalFn = globalWindow[key];
  return typeof globalFn === 'function' ? globalFn : null;
};
