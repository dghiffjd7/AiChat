export const PROVIDER_TOOL_SESSION_GATE_SETTINGS_KEY = 'providerToolSessionGate';

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const list = value => (Array.isArray(value) ? value : [value])
  .map(item => trim(item))
  .filter(Boolean);

const timestamp = (now = Date.now) => Number(now?.() || Date.now()) || Date.now();

export const normalizeProviderToolSessionGate = (value = {}, {
  sessionId = '',
  allowedTools = [],
  now = Date.now,
} = {}) => {
  const src = isPlainObject(value) ? value : {};
  const tools = list(src.allowedTools).length ? list(src.allowedTools) : list(allowedTools);
  return {
    sessionId: trim(src.sessionId || sessionId),
    enabled: src.enabled === true,
    allowedTools: tools,
    modelContextPolicy: trim(src.modelContextPolicy, 'allowlist_only'),
    networkAllowed: src.networkAllowed === true,
    realRunnerAllowed: src.realRunnerAllowed === true,
    writesChat: false,
    source: trim(src.source, 'session_settings'),
    reason: trim(src.reason),
    updatedAt: Number(src.updatedAt || 0) || 0,
    createdAt: Number(src.createdAt || src.updatedAt || 0) || 0,
    nextRequiredAction: src.enabled === true
      ? 'permission rule still required per tool call'
      : 'enable this session gate before provider tool execution',
    rollback: 'disable providerToolSessionGate for this session',
    now: timestamp(now),
  };
};

export const readProviderToolSessionGate = ({
  chatStore = null,
  sessionId = '',
  allowedTools = [],
  now = Date.now,
} = {}) => {
  const sid = trim(sessionId || chatStore?.getCurrent?.());
  const settings = sid ? (chatStore?.getSessionSettings?.(sid) || {}) : {};
  return normalizeProviderToolSessionGate(settings?.[PROVIDER_TOOL_SESSION_GATE_SETTINGS_KEY], {
    sessionId: sid,
    allowedTools,
    now,
  });
};

export const writeProviderToolSessionGate = ({
  chatStore = null,
  sessionId = '',
  enabled = false,
  allowedTools = [],
  modelContextPolicy = 'allowlist_only',
  source = 'debug_panel',
  reason = '',
  now = Date.now,
} = {}) => {
  const sid = trim(sessionId || chatStore?.getCurrent?.());
  if (!sid || !chatStore?.getSessionSettings || !chatStore?.setSessionSettings) {
    return normalizeProviderToolSessionGate({
      enabled: false,
      source: 'unavailable',
      reason: 'chat store session settings unavailable',
    }, { sessionId: sid, allowedTools, now });
  }
  const settings = { ...(chatStore.getSessionSettings(sid) || {}) };
  const previous = normalizeProviderToolSessionGate(settings[PROVIDER_TOOL_SESSION_GATE_SETTINGS_KEY], {
    sessionId: sid,
    allowedTools,
    now,
  });
  const updatedAt = timestamp(now);
  const next = normalizeProviderToolSessionGate({
    ...previous,
    sessionId: sid,
    enabled: enabled === true,
    allowedTools: list(allowedTools).length ? list(allowedTools) : previous.allowedTools,
    modelContextPolicy,
    networkAllowed: false,
    realRunnerAllowed: false,
    writesChat: false,
    source,
    reason,
    createdAt: previous.createdAt || updatedAt,
    updatedAt,
  }, { sessionId: sid, allowedTools, now });
  settings[PROVIDER_TOOL_SESSION_GATE_SETTINGS_KEY] = {
    enabled: next.enabled,
    allowedTools: next.allowedTools,
    modelContextPolicy: next.modelContextPolicy,
    networkAllowed: false,
    realRunnerAllowed: false,
    writesChat: false,
    source: next.source,
    reason: next.reason,
    createdAt: next.createdAt,
    updatedAt: next.updatedAt,
  };
  chatStore.setSessionSettings(sid, settings);
  return next;
};
