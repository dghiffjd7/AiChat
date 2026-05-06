export const resolveSessionMemoryScopeKey = ({
  isGroup = false,
  useSharedGlobalScope = false,
} = {}) => {
  if (useSharedGlobalScope) return 'global';
  return isGroup ? 'group' : 'contact';
};

export const buildMemoryScopeQuery = ({
  scopeKey = '',
  sessionId = '',
  templateId = '',
} = {}) => {
  const scope = String(scopeKey || '').trim().toLowerCase() || 'contact';
  const query = { scope };
  const template = String(templateId || '').trim();
  if (template) query.template_id = template;
  if (scope === 'group') query.group_id = sessionId;
  if (scope === 'contact') query.contact_id = sessionId;
  return query;
};

export const buildScopedMemoryRowFields = ({
  scopeKey = '',
  sessionId = '',
} = {}) => {
  const scope = String(scopeKey || '').trim().toLowerCase();
  if (scope === 'group') return { contact_id: null, group_id: sessionId };
  if (scope === 'contact') return { contact_id: sessionId, group_id: null };
  return { contact_id: null, group_id: null };
};

export const loadScopedMemories = async ({
  memoryTableStore = null,
  scopeKey = '',
  sessionId = '',
  templateId = '',
} = {}) => {
  if (!memoryTableStore?.getMemories) return [];
  try {
    const rows = await memoryTableStore.getMemories(
      buildMemoryScopeQuery({ scopeKey, sessionId, templateId }),
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
};
