const ensureArray = value => (Array.isArray(value) ? value : []);

const normalizeRpGreetingRecord = (greeting = {}) => ({
  id: String(greeting?.id || '').trim(),
  title: String(greeting?.title || '').trim(),
  content: String(greeting?.content || '').trim(),
});

export const buildCustomBundleRpGreetingPayload = ({
  greetings = [],
  activeGreetingId = '',
} = {}) => ({
  greetings: ensureArray(greetings).map(normalizeRpGreetingRecord),
  activeGreetingId: String(activeGreetingId || '').trim(),
});

export const normalizeCustomBundleImportedRpGreetings = (payload = {}) => ({
  greetings: ensureArray(payload?.greetings)
    .map(normalizeRpGreetingRecord)
    .filter(greeting => greeting.content),
  activeId: String(payload?.activeGreetingId || '').trim(),
});
