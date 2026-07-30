(async () => {
  const stores = window.appBridge?.debugUiRegistry?.stores || {};
  const registry = stores.agentToolRegistry;
  const context = {
    operationIntentPolicy: { mode: 'read_only' },
    requestPermission: async () => ({ decision: 'allow' }),
  };
  const execute = async (toolName, args = {}) => {
    try {
      const output = await registry?.executeTool?.(toolName, args, context);
      return output?.result || output || null;
    } catch (error) {
      return { ok: false, reason: String(error?.message || error) };
    }
  };
  const label = '记忆系统G35-0730';
  const worldbookName = `${label}·资料库`;
  const [sessions, users, personas, worldbooks, worldbook, state, regex] = await Promise.all([
    execute('session.list'),
    execute('app.read_resource', { resource: 'user', limit: 200 }),
    execute('app.read_resource', { resource: 'persona', limit: 200 }),
    execute('worldbook.list', { limit: 200 }),
    execute('worldbook.read', {
      name: worldbookName,
      includeContent: true,
      maxEntries: 20,
      maxContentLength: 12000,
    }),
    execute('app.get_current_state'),
    execute('app.read_resource', { resource: 'regex', limit: 200 }),
  ]);
  const startsWithLabel = item => String(item?.name || item?.id || '').startsWith(label);
  return {
    ok: true,
    state,
    sessions: {
      count: sessions?.count || 0,
      testItems: (sessions?.contacts || []).filter(startsWithLabel),
    },
    users: {
      count: users?.count || 0,
      activeId: users?.activeId || '',
      testItems: (users?.items || []).filter(startsWithLabel),
    },
    personas: {
      count: personas?.count || 0,
      activeId: personas?.activeId || '',
      testItems: (personas?.items || []).filter(startsWithLabel),
    },
    worldbooks: {
      count: worldbooks?.count || 0,
      testItems: (worldbooks?.worldbooks || []).filter(startsWithLabel),
      testWorldbook: worldbook,
    },
    regex: {
      ok: regex?.ok !== false,
      count: regex?.count ?? regex?.items?.length ?? 0,
      enabledCount: regex?.enabledCount ?? null,
    },
  };
})()
