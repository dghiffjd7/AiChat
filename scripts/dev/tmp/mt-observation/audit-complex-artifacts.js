(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const tools = stores.agentToolRegistry;
  const context = {
    operationIntentPolicy: { mode: 'read_only' },
    requestPermission: async () => ({ decision: 'allow' }),
  };
  const execute = async (name, args = {}) => {
    const output = await tools?.executeTool?.(name, args, context);
    return output?.result || output || null;
  };
  const labels = ['复杂压力V4F-0729', '复杂压力G35-0729'];
  const sessions = await execute('session.list', { limit: 100 });
  const users = await execute('app.read_resource', { resource: 'user' });
  const personas = await execute('app.read_resource', { resource: 'persona' });
  const state = await execute('app.get_current_state');
  const profiles = await registry.actions?.listAgentModelProfiles?.() || [];
  const maid = stores.maidSettingsStore;
  const maidProfileId = maid?.getBoundProfileId?.() || '';
  const maidProfile = profiles.find(item => item.id === maidProfileId) || null;
  const artifacts = [];
  for (const label of labels) {
    const worldbook = `${label}·资料`;
    const roomLan = `${label}·岚`;
    const roomXian = `${label}·弦`;
    const [
      worldbookState,
      lanBindings,
      xianBindings,
      lanFormat,
      xianFormat,
    ] = await Promise.all([
      execute('worldbook.read', { name: worldbook, includeContent: true, maxEntries: 20, maxContentLength: 6000 }),
      execute('worldbook.list', { sessionId: roomLan, limit: 100 }),
      execute('worldbook.list', { sessionId: roomXian, limit: 100 }),
      execute('chat.read_format_profile', { sessionName: roomLan }),
      execute('chat.read_format_profile', { sessionName: roomXian }),
    ]);
    artifacts.push({
      label,
      worldbook: {
        name: worldbookState?.name || worldbook,
        entryCount: worldbookState?.entryCount || 0,
        titles: (worldbookState?.entries || []).map(item => item.title),
      },
      rooms: (sessions?.contacts || []).filter(item => [roomLan, roomXian].includes(item.name)),
      bindings: {
        [roomLan]: (lanBindings?.worldbooks || [])
          .filter(item => item.boundToCurrentSession)
          .map(item => item.id),
        [roomXian]: (xianBindings?.worldbooks || [])
          .filter(item => item.boundToCurrentSession)
          .map(item => item.id),
      },
      formats: {
        [roomLan]: lanFormat?.profile || null,
        [roomXian]: xianFormat?.profile || null,
      },
      users: (users?.items || []).filter(item => item.name === `${label}·用户`),
      personas: (personas?.items || []).filter(item => item.name === `${label}·角色`),
    });
  }
  return {
    ok: true,
    state,
    maid: {
      profileName: maidProfile?.name || '',
      provider: maidProfile?.provider || '',
      model: maid?.getBoundModelOverride?.() || maidProfile?.model || '',
    },
    conversation: {
      threadId: stores.maidConversationStore?.exportState?.()?.threadId || '',
      turns: stores.maidConversationStore?.exportState?.()?.turns?.length || 0,
      memoryRows: stores.maidConversationStore?.exportState?.()?.memoryRows?.length || 0,
    },
    artifacts,
  };
})()
