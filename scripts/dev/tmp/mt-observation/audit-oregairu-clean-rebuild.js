(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const toolRegistry = stores.agentToolRegistry;
  const runReadTool = async (name, args) => {
    const output = await toolRegistry?.executeTool?.(name, args, {
      operationIntentPolicy: { mode: 'read_only' },
      requestPermission: async () => ({ decision: 'allow' }),
    });
    return output?.result || output || null;
  };
  await Promise.all([
    stores.personaStore?.ready,
    stores.userStore?.ready,
    stores.contactsStore?.ready,
    stores.chatStore?.ready,
  ].filter(Boolean));
  const targetWorldbooks = [
    '比企谷八幡·私聊资料',
    '雪之下雪乃·私聊资料',
    '由比滨结衣·私聊资料',
    '平塚静·私聊资料',
    '总武高·侍奉部创意写作资料',
  ];
  const targetSessions = ['比企谷八幡', '雪之下雪乃', '由比滨结衣', '平塚静'];
  const worldbooks = [];
  for (const name of targetWorldbooks) {
    const read = await runReadTool('worldbook.read', {
      name,
      includeContent: true,
      maxEntries: 20,
      maxContentLength: 8000,
    });
    worldbooks.push({
      name,
      ok: read?.ok !== false,
      reason: read?.reason || '',
      id: read?.id || '',
      entryCount: Number(read?.entryCount || 0),
      returnedEntryCount: Number(read?.returnedEntryCount || 0),
      entries: (read?.entries || []).map(entry => ({
        id: entry.id,
        title: entry.title,
        keys: entry.keys || [],
        content: entry.content || '',
      })),
    });
  }
  const sessions = [];
  for (const sessionId of targetSessions) {
    sessions.push({
      sessionId,
      exists: Boolean(stores.contactsStore?.getContact?.(sessionId)),
      directWorldIds: await window.appBridge?.getWorldIdsForSession?.(sessionId) || [],
      resolved: window.appBridge?.getResolvedWorldState?.(sessionId, { uiMode: 'chat' }) || null,
    });
  }
  const persona = stores.personaStore?.getActive?.() || null;
  const user = stores.userStore?.getActive?.() || null;
  const scopeId = String(persona?.id || '').trim();
  const rpSessionId = `rp:${scopeId || 'default'}`;
  let params = null;
  let paramsStore = null;
  try {
    const module = await import('/scripts/storage/image-generation-params-store.js');
    const store = module.getImageGenerationParamsStore?.();
    paramsStore = store;
    await store?.ready;
    params = {
      activeId: store?.getActiveId?.() || '',
      active: store?.getActive?.() || null,
    };
  } catch (error) {
    params = { error: String(error?.message || error) };
  }
  return {
    ok: true,
    activePersona: {
      id: persona?.id || '',
      name: persona?.name || '',
      source: persona?.source || {},
      hasAvatar: Boolean(persona?.avatar),
    },
    activeUser: {
      id: user?.id || '',
      name: user?.name || '',
      hasAvatar: Boolean(user?.avatar),
    },
    scopeId,
    currentSessionId: stores.chatStore?.getCurrent?.() || '',
    allSessionIds: await stores.chatStore?.listSessions?.() || [],
    orphanSessionDetails: (await stores.chatStore?.listSessions?.() || [])
      .filter(id => id !== rpSessionId && !stores.contactsStore?.getContact?.(id))
      .map(id => ({
        id,
        messageCount: Number(stores.chatStore?.getMessages?.(id)?.length || 0),
        settings: stores.chatStore?.getSessionSettings?.(id) || null,
        hasSession: Boolean(stores.chatStore?.hasSession?.(id)),
      })),
    contacts: (stores.contactsStore?.listContacts?.() || [])
      .filter(item => !String(item?.id || '').startsWith('rp:'))
      .map(item => ({
      id: item.id,
      name: item.name,
      isGroup: item.isGroup === true,
      members: item.members || [],
      hasAvatar: Boolean(item.avatar),
      hasWallpaper: Boolean(stores.chatStore?.getSessionSettings?.(item.id)?.wallpaper),
      wallpaper: stores.chatStore?.getSessionSettings?.(item.id)?.wallpaper || null,
      messageCount: Number(stores.chatStore?.getMessages?.(item.id)?.length || 0),
      })),
    rp: {
      sessionId: rpSessionId,
      exists: Boolean(stores.chatStore?.hasSession?.(rpSessionId)),
      directWorldIds: await window.appBridge?.getWorldIdsForSession?.(rpSessionId) || [],
      resolved: window.appBridge?.getResolvedWorldState?.(rpSessionId, { uiMode: 'rp' }) || null,
    },
    worldbooks,
    sessions,
    groupWorldResolution: (() => {
      const group = (stores.contactsStore?.listGroups?.() || [])
        .find(item => String(item?.name || '').trim() === '侍奉部');
      return group
        ? window.appBridge?.getResolvedWorldState?.(group.id, {
            uiMode: 'chat',
            isGroupChat: true,
            groupMemberIds: group.members || [],
          }) || null
        : null;
    })(),
    imageParams: params
      ? {
          ...params,
          presetIds: (() => {
            try {
              return paramsStore?.list?.().map(item => item.id) || [];
            } catch {
              return [];
            }
          })(),
        }
      : null,
  };
})()
