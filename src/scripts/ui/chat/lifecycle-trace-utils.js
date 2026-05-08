const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const normalizeLifecycleTraceText = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

export const normalizeLifecycleTraceDetails = (details = {}) => {
  if (!isPlainObject(details)) return {};
  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined),
  );
};

export const emitLifecycleTraceEvent = (recordTraceEvent, event) => {
  if (typeof recordTraceEvent !== 'function') return null;
  try {
    return recordTraceEvent(event);
  } catch {}
  return null;
};
