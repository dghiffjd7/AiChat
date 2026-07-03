export const AGENT_TOOL_SAFETY_ALLOW_STORAGE_KEY = 'agent_tool_safety_allow_rules_v1';

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const readStorage = (storage = globalThis?.localStorage) => {
  try {
    return storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function'
      ? storage
      : null;
  } catch {
    return null;
  }
};

const toTimestamp = (value, fallbackNow = Date.now) => {
  const fallback = () => {
    try {
      const next = typeof fallbackNow === 'function' ? fallbackNow() : fallbackNow;
      const numeric = Number(next);
      return Number.isFinite(numeric) && numeric > 0 ? numeric : Date.now();
    } catch {
      return Date.now();
    }
  };
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback();
};

export const buildAgentToolSafetyAllowKey = (request = {}) => {
  const source = isPlainObject(request) ? request : {};
  return [
    trim(source.toolName),
    trim(source.kind),
    trim(source.operationType),
  ].filter(Boolean).join('|');
};

const normalizeRule = (rule = {}, now = Date.now) => {
  const source = isPlainObject(rule) ? rule : {};
  const key = trim(source.key) || buildAgentToolSafetyAllowKey(source);
  if (!key) return null;
  return {
    key,
    toolName: trim(source.toolName),
    kind: trim(source.kind),
    operationType: trim(source.operationType),
    title: trim(source.title),
    source: trim(source.source),
    riskLevel: trim(source.riskLevel),
    createdAt: toTimestamp(source.createdAt, now),
    updatedAt: toTimestamp(source.updatedAt || source.createdAt, now),
  };
};

const normalizeRules = (value = {}, now = Date.now) => {
  const source = Array.isArray(value)
    ? value
    : (Array.isArray(value?.rules) ? value.rules : []);
  const rules = [];
  const seen = new Set();
  source.forEach((entry) => {
    const rule = normalizeRule(entry, now);
    if (!rule || seen.has(rule.key)) return;
    seen.add(rule.key);
    rules.push(rule);
  });
  return rules;
};

export const createAgentToolSafetyAllowStore = ({
  storage = globalThis?.localStorage,
  key = AGENT_TOOL_SAFETY_ALLOW_STORAGE_KEY,
  now = Date.now,
} = {}) => {
  const targetStorage = readStorage(storage);
  let memoryRules = [];

  const load = () => {
    if (!targetStorage) return memoryRules;
    try {
      const raw = targetStorage.getItem(key);
      if (!raw) {
        memoryRules = [];
        return memoryRules;
      }
      memoryRules = normalizeRules(JSON.parse(raw), now);
      return memoryRules;
    } catch {
      memoryRules = [];
      return memoryRules;
    }
  };

  const save = (rules = []) => {
    memoryRules = normalizeRules(rules, now);
    if (!targetStorage) return;
    try {
      targetStorage.setItem(key, JSON.stringify({
        version: 1,
        rules: memoryRules,
      }));
    } catch {
      // Keep the in-memory rules for the current session when storage is unavailable.
    }
  };

  load();

  const list = () => load().map(rule => ({ ...rule }));

  const isAllowed = (request = {}) => {
    const allowKey = buildAgentToolSafetyAllowKey(request);
    if (!allowKey) return false;
    return load().some(rule => rule.key === allowKey);
  };

  const allowAlways = (request = {}) => {
    const source = isPlainObject(request) ? request : {};
    const allowKey = buildAgentToolSafetyAllowKey(source);
    if (!allowKey) return null;
    const existingRules = load();
    const existing = existingRules.find(rule => rule.key === allowKey);
    const timestamp = toTimestamp(null, now);
    const nextRule = normalizeRule({
      ...existing,
      key: allowKey,
      toolName: trim(source.toolName || existing?.toolName),
      kind: trim(source.kind || existing?.kind),
      operationType: trim(source.operationType || existing?.operationType),
      title: trim(source.title || existing?.title),
      source: trim(source.source || existing?.source),
      riskLevel: trim(source.riskLevel || existing?.riskLevel),
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    }, now);
    const nextRules = existing
      ? existingRules.map(rule => (rule.key === allowKey ? nextRule : rule))
      : [...existingRules, nextRule];
    save(nextRules);
    return nextRule ? { ...nextRule } : null;
  };

  const revoke = (ruleKey = '') => {
    const target = trim(ruleKey);
    if (!target) return false;
    const existingRules = load();
    const nextRules = existingRules.filter(rule => rule.key !== target);
    if (nextRules.length === existingRules.length) return false;
    save(nextRules);
    return true;
  };

  const clear = () => {
    memoryRules = [];
    if (!targetStorage) return;
    try {
      if (typeof targetStorage.removeItem === 'function') {
        targetStorage.removeItem(key);
      } else {
        targetStorage.setItem(key, JSON.stringify({ version: 1, rules: [] }));
      }
    } catch {
      save([]);
    }
  };

  return {
    key,
    buildKey: buildAgentToolSafetyAllowKey,
    isAllowed,
    allowAlways,
    list,
    revoke,
    clear,
  };
};
