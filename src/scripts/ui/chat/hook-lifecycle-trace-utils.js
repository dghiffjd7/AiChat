const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const normalizeText = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};
const normalizeDetails = (details) => {
  if (!isPlainObject(details)) return {};
  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined),
  );
};

export const buildHookLifecycleTraceEvent = ({
  phase = '',
  hookName = '',
  runtimeLabel = '',
  sessionId = '',
  messageId = '',
  status = 'info',
  summary = '',
  details = {},
} = {}) => ({
  category: 'plugin-hooks',
  source: 'hook-lifecycle',
  phase: normalizeText(phase, 'event'),
  hookName: normalizeText(hookName, ''),
  runtimeLabel: normalizeText(runtimeLabel, ''),
  sessionId: normalizeText(sessionId, ''),
  messageId: normalizeText(messageId, ''),
  status: normalizeText(status, 'info'),
  summary: normalizeText(summary, ''),
  details: normalizeDetails(details),
});

export const emitHookLifecycleTrace = (recordTraceEvent, event) => {
  if (typeof recordTraceEvent !== 'function') return;
  try {
    recordTraceEvent(buildHookLifecycleTraceEvent(event));
  } catch {}
};
