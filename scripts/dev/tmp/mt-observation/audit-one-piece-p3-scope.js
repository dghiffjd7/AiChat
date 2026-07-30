(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const toolRegistry = stores.agentToolRegistry;
  await Promise.all([
    stores.personaStore?.ready,
    stores.userStore?.ready,
    stores.contactsStore?.ready,
    stores.chatStore?.ready,
  ].filter(Boolean));

  const target = (stores.personaStore?.getAll?.() || [])
    .find(item => String(item?.name || '').trim() === '海贼王') || null;
  if (!target) return { ok: false, reason: 'one_piece_persona_not_found' };
  const switched = await window.appBridge?.switchPersona?.(target.id);
  if (!switched) return { ok: false, reason: 'one_piece_persona_switch_failed' };

  await Promise.all([
    stores.contactsStore?.ready,
    stores.chatStore?.ready,
  ].filter(Boolean));

  const worldbookListOutput = await toolRegistry?.executeTool?.('worldbook.list', {}, {
    operationIntentPolicy: { mode: 'read_only' },
    requestPermission: async () => ({ decision: 'allow' }),
  });
  const worldbookList = worldbookListOutput?.result || worldbookListOutput || {};
  const groupReadOutput = await toolRegistry?.executeTool?.('app.read_resource', {
    resource: 'session',
    name: '草帽一伙',
    include: ['members'],
  }, {
    operationIntentPolicy: { mode: 'read_only' },
    requestPermission: async () => ({ decision: 'allow' }),
  });
  const groupRead = groupReadOutput?.result || groupReadOutput || {};
  const contacts = stores.contactsStore?.listContacts?.() || [];
  const sessions = [];
  for (const contact of contacts) {
    const id = String(contact?.id || '').trim();
    if (!id) continue;
    const roleBindings = window.appBridge?.getRoleWorldBindings?.(id, {
      includeAll: false,
      includeEmpty: true,
    }) || [];
    sessions.push({
      id,
      name: String(contact?.name || ''),
      isGroup: contact?.isGroup === true,
      members: Array.isArray(contact?.members) ? [...contact.members] : [],
      directWorldIds: window.appBridge?.getWorldIdsForSession?.(id) || [],
      roleWorldBindings: Array.isArray(roleBindings)
        ? roleBindings.map(item => ({
            personaId: String(item?.personaId || ''),
            personaName: String(item?.personaName || ''),
            worldbookId: String(item?.worldId || ''),
            enabled: item?.enabled !== false,
            hasWorld: item?.hasWorld === true,
            isActive: item?.isActive === true,
          }))
        : roleBindings,
    });
  }

  return {
    ok: true,
    activePersona: {
      id: String(stores.personaStore?.getActive?.()?.id || ''),
      name: String(stores.personaStore?.getActive?.()?.name || ''),
    },
    currentSessionId: String(stores.chatStore?.getCurrent?.() || ''),
    worldbookCount: Number(worldbookList.count || worldbookList.worldbooks?.length || 0),
    worldbookNames: (worldbookList.worldbooks || []).map(item => String(item?.name || item?.id || '')),
    groupResourceRead: {
      returnedSessionCount: Array.isArray(groupRead.sessions) ? groupRead.sessions.length : 0,
      includedFields: Array.isArray(groupRead.includedFields) ? groupRead.includedFields : [],
      session: Array.isArray(groupRead.sessions) && groupRead.sessions[0]
        ? {
            id: String(groupRead.sessions[0].id || ''),
            name: String(groupRead.sessions[0].name || ''),
            isGroup: groupRead.sessions[0].isGroup === true,
            memberCount: Number(groupRead.sessions[0].memberCount || 0),
            members: (groupRead.sessions[0].members || []).map(item => ({
              id: String(item?.id || ''),
              name: String(item?.name || ''),
            })),
          }
        : null,
    },
    sessionCount: sessions.length,
    sessions,
  };
})()
