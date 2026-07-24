import { getValueAtPath } from './variable-path-utils.js';

export const cloneMvuVariableValue = (value) => {
  if (Array.isArray(value)) return value.map(item => cloneMvuVariableValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneMvuVariableValue(item)]),
    );
  }
  return value;
};

export const applyMvuSchemaDefaultsToStore = ({
  chatStore = null,
  sessionId = '',
  useGlobal = false,
} = {}) => {
  const sid = String(sessionId || '').trim();
  if (!chatStore || !sid) {
    return { ok: false, applied: false, keys: [], useGlobal: Boolean(useGlobal) };
  }

  const schemas = chatStore.listVariableSchemas?.(sid) || {};
  const variables = useGlobal
    ? (chatStore.listGlobalVariables?.() || {})
    : (chatStore.listVariables?.(sid) || {});
  const updates = [];

  Object.entries(schemas).forEach(([name, schema]) => {
    const key = String(name || '').trim();
    if (!key || !schema || schema.default === undefined) return;
    if (getValueAtPath(variables, key) !== undefined) return;
    updates.push([key, schema.default]);
  });

  updates.forEach(([key, defaultValue]) => {
    const currentValue = cloneMvuVariableValue(defaultValue);
    if (useGlobal) {
      chatStore.setGlobalVariable?.(key, currentValue);
      return;
    }
    chatStore.setVariable?.(key, currentValue, sid);
    if (chatStore.getInitialVariable?.(key, sid) === undefined) {
      chatStore.setInitialVariable?.(key, cloneMvuVariableValue(defaultValue), sid);
    }
  });

  return {
    ok: true,
    applied: updates.length > 0,
    keys: updates.map(([key]) => key),
    useGlobal: Boolean(useGlobal),
  };
};
