(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const maid = stores.maidSettingsStore;
  const profiles = await registry.actions?.listAgentModelProfiles?.() || [];
  const boundProfileId = maid?.getBoundProfileId?.() || '';
  const boundProfile = profiles.find(item => item.id === boundProfileId) || null;
  const memoryExtraction = maid?.getMemoryExtractionSettings?.() || null;
  const memoryProfile = profiles.find(item => item.id === memoryExtraction?.profileId) || null;
  const relevantToolNames = (registry.actions?.listAgentTools?.() || [])
    .map(item => String(item?.name || '').trim())
    .filter(name => /^(?:app\.resource|contact|group|media|persona|session|user|web|worldbook)\./.test(name))
    .sort();
  await Promise.all([
    stores.personaStore?.ready,
    stores.userStore?.ready,
    stores.contactsStore?.ready,
    stores.chatStore?.ready,
  ].filter(Boolean));
  const personas = stores.personaStore?.getAll?.() || [];
  const users = stores.userStore?.getAll?.() || [];
  const contacts = stores.contactsStore?.listContacts?.() || [];
  const sessionIds = await stores.chatStore?.listSessions?.() || [];
  const worldbookOutput = await stores.agentToolRegistry?.executeTool?.('worldbook.list', {
    includeGlobal: true,
    limit: 200,
  }, {
    operationIntentPolicy: { mode: 'read_only' },
    requestPermission: async () => ({ decision: 'allow' }),
  });
  return {
    ok: true,
    readyState: document.readyState,
    storeKeys: Object.keys(stores).sort(),
    actionKeys: Object.keys(registry.actions || {}).sort(),
    maid: {
      boundProfileId,
      boundProfileName: boundProfile?.name || '',
      boundProvider: boundProfile?.provider || '',
      modelOverride: maid?.getBoundModelOverride?.() || '',
      effectiveModel: maid?.getBoundModelOverride?.() || boundProfile?.model || '',
    },
    memoryExtraction: {
      mode: memoryExtraction?.mode || '',
      profileId: memoryExtraction?.profileId || '',
      profileName: memoryProfile?.name || '',
      profileProvider: memoryProfile?.provider || '',
      modelOverride: memoryExtraction?.modelOverride || '',
      effectiveModel: memoryExtraction?.modelOverride || memoryProfile?.model || '',
      fallbackToMain: memoryExtraction?.fallbackToMain === true,
    },
    routing: stores.maidCapabilityRoutingRuntime?.getConfig?.() || null,
    activeRunIds: (stores.agentRunStore?.listRuns?.({ limit: 100 }) || [])
      .filter(item => item.status === 'running')
      .map(item => item.id),
    relevantToolNames,
    resources: {
      personas: personas.map(item => ({
        id: item.id,
        name: item.name,
        active: item.id === stores.personaStore?.getActive?.()?.id,
        hasAvatar: Boolean(item.avatar),
        descriptionLength: String(item.description || '').length,
      })),
      users: users.map(item => ({
        id: item.id,
        name: item.name,
        active: item.id === stores.userStore?.getActive?.()?.id,
        hasAvatar: Boolean(item.avatar),
        descriptionLength: String(item.description || '').length,
      })),
      contacts: contacts.map(item => ({
        id: item.id,
        name: item.name,
        isGroup: item.isGroup === true || String(item.id || '').startsWith('group:'),
        members: item.members || item.memberIds || [],
        hasAvatar: Boolean(item.avatar),
        hasWallpaper: Boolean(stores.chatStore?.getSessionSettings?.(item.id)?.wallpaper),
      })),
      sessionIds,
      worldbooks: worldbookOutput?.result?.worldbooks || [],
    },
  };
})()
