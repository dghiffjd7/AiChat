(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const tools = stores.agentToolRegistry;
  const context = {
    operationIntentPolicy: { mode: 'read_only' },
    requestPermission: async () => ({ decision: 'allow' }),
  };
  const execute = async (name, args = {}) => {
    try {
      const output = await tools?.executeTool?.(name, args, context);
      return output?.result || output || null;
    } catch (error) {
      return { ok: false, reason: String(error?.message || error) };
    }
  };
  const labels = ['扩面压力V4F-0729', '扩面压力G35-0729'];
  const [sessions, users, personas, state] = await Promise.all([
    execute('session.list'),
    execute('app.read_resource', { resource: 'user', limit: 200 }),
    execute('app.read_resource', { resource: 'persona', limit: 200 }),
    execute('app.get_current_state'),
  ]);
  const artifacts = [];
  for (const label of labels) {
    const roomNames = [
      `${label}·观测站`,
      `${label}·档案室`,
      `${label}·检查站`,
      `${label}·中继站`,
    ];
    const worldbookName = `${label}·档案库`;
    const [
      worldbook,
      roomDetails,
      bindings,
      profiles,
    ] = await Promise.all([
      execute('worldbook.read', {
        name: worldbookName,
        includeContent: true,
        maxEntries: 30,
        maxContentLength: 12000,
      }),
      Promise.all(roomNames.map(name => execute('app.read_resource', {
        resource: 'session',
        sessionName: name,
      }))),
      Promise.all(roomNames.map(name => execute('worldbook.list', {
        sessionId: name,
        limit: 200,
      }))),
      Promise.all(roomNames.slice(0, 3).map(name => execute('chat.read_format_profile', {
        sessionName: name,
      }))),
    ]);
    artifacts.push({
      label,
      worldbook: {
        ok: worldbook?.ok !== false,
        name: worldbook?.name || worldbookName,
        entryCount: Number(worldbook?.entryCount || 0),
        entries: (worldbook?.entries || []).map(item => ({
          title: item?.title || '',
          content: item?.content || '',
        })),
      },
      rooms: (sessions?.contacts || []).filter(item => roomNames.includes(item.name)),
      roomDetails: roomDetails.map((result, index) => ({
        name: roomNames[index],
        session: result?.sessions?.[0] || null,
      })),
      bindings: bindings.map((result, index) => ({
        name: roomNames[index],
        worldbooks: (result?.worldbooks || [])
          .filter(item => item.boundToCurrentSession)
          .map(item => item.id),
      })),
      profiles: profiles.map((result, index) => ({
        name: roomNames[index],
        profile: result?.profile || null,
      })),
      users: (users?.items || []).filter(item => item.name === `${label}·测试用户`),
      personas: (personas?.items || []).filter(item => item.name === `${label}·测试角色`),
    });
  }
  const retrievalStats = stores.capabilityRetrievalStore?.getStats?.() || {};
  const aggregates = (Array.isArray(retrievalStats.aggregates) ? retrievalStats.aggregates : [])
    .filter(item => (
      item?.retrieverVersion === 'maid-capability-retriever-v3'
      && item?.mode === 'shadow'
      && item?.effectiveMode === 'shadow'
    ));
  const sum = key => aggregates.reduce((total, item) => total + Number(item?.[key] || 0), 0);
  const profilesList = await registry.actions?.listAgentModelProfiles?.() || [];
  const maid = stores.maidSettingsStore;
  const boundProfile = profilesList.find(item => item.id === maid?.getBoundProfileId?.()) || null;
  const conversation = stores.maidConversationStore?.exportState?.() || {};
  return {
    ok: true,
    state,
    activeUser: (users?.items || []).find(item => item.active) || null,
    activePersona: (personas?.items || []).find(item => item.active) || null,
    maid: {
      profileName: boundProfile?.name || '',
      provider: boundProfile?.provider || '',
      model: maid?.getBoundModelOverride?.() || boundProfile?.model || '',
    },
    conversation: {
      threadId: conversation.threadId || '',
      turns: conversation.turns?.length || 0,
      memoryRows: conversation.memoryRows?.length || 0,
    },
    shadowV3: {
      validSelectionCount: sum('validSelectionCount'),
      hitCount: sum('hitCount'),
      missCount: sum('missCount'),
      runCount: sum('runCount'),
      runCoveredCount: sum('runCoveredCount'),
    },
    artifacts,
  };
})()
