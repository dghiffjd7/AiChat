(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const tools = stores.agentToolRegistry;
  const context = {
    operationIntentPolicy: { mode: 'read_only' },
    requestPermission: async () => ({ decision: 'allow' }),
  };
  const read = async (name, args = {}) => {
    const output = await tools?.executeTool?.(name, args, context);
    return output?.result || output || null;
  };
  const [sessions, sessionDetails, worldbook, users, personas, chatProfiles, imageProfiles, formatProfile] = await Promise.all([
    read('session.list', {}),
    read('app.read_resource', {
      resource: 'session',
      name: 'V4F-V2观测站-',
      include: ['worldbooks', 'members'],
      limit: 20,
    }),
    read('worldbook.read', {
      name: 'V4F-V2档案库-0731',
      includeContent: true,
      maxEntries: 50,
    }),
    read('app.read_resource', { resource: 'user', include: ['details'], limit: 200 }),
    read('app.read_resource', { resource: 'persona', include: ['details'], limit: 200 }),
    read('config.list_profiles', { scope: 'chat' }),
    read('config.list_profiles', { scope: 'image' }),
    read('chat.read_format_profile', { sessionId: 'V4F-V2观测站-A-0731' }),
  ]);
  const targetSessions = (sessions?.contacts || []).filter(item => (
    String(item?.name || item?.id || '').startsWith('V4F-V2观测站-')
  ));
  const messageAudit = {};
  for (const item of targetSessions) {
    const id = String(item?.id || item?.name || '');
    messageAudit[id] = (stores.chatStore?.getMessages?.(id) || []).map(message => ({
      id: String(message?.id || ''),
      role: String(message?.role || message?.type || ''),
      content: String(message?.content || message?.text || '').slice(0, 500),
    }));
  }
  const retrievalStats = stores.capabilityRetrievalStore?.getStats?.() || {};
  const aggregates = Array.isArray(retrievalStats.aggregates) ? retrievalStats.aggregates : [];
  const sum = key => aggregates.reduce((total, item) => total + Number(item?.[key] || 0), 0);
  return {
    ok: true,
    scope: {
      persona: stores.personaStore?.getActive?.() || null,
      user: stores.userStore?.getActive?.() || null,
      chatScopeId: stores.chatStore?.scopeId || '',
      currentSessionId: stores.chatStore?.getCurrent?.() || '',
    },
    sessions: targetSessions,
    sessionDetails,
    messages: messageAudit,
    worldbook,
    users: (users?.items || users?.users || []).filter(item => /V4F-V2/.test(String(item?.name || ''))),
    personas: (personas?.items || personas?.personas || []).filter(item => /V4F-V2/.test(String(item?.name || ''))),
    formatProfile,
    models: {
      chat: (chatProfiles?.profiles || []).find(profile => profile.active) || null,
      image: (imageProfiles?.profiles || []).find(profile => profile.active) || null,
      maid: {
        profileId: stores.maidSettingsStore?.getBoundProfileId?.() || '',
        modelOverride: stores.maidSettingsStore?.getBoundModelOverride?.() || '',
      },
    },
    shadow: {
      snapshotCount: Number(retrievalStats.snapshotCount || 0),
      validSelectionCount: sum('validSelectionCount'),
      hitCount: sum('hitCount'),
      missCount: sum('missCount'),
    },
  };
})()
