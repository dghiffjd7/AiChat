(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const toolRegistry = stores.agentToolRegistry;
  await Promise.all([
    stores.personaStore?.ready,
    stores.contactsStore?.ready,
    stores.chatStore?.ready,
  ].filter(Boolean));

  const runReadTool = async (name, args) => {
    const output = await toolRegistry?.executeTool?.(name, args, {
      operationIntentPolicy: { mode: 'read_only' },
      requestPermission: async () => ({ decision: 'allow' }),
    });
    return output?.result || output || {};
  };
  const targets = [
    '路飞', '索隆', '娜美', '乌索普', '山治',
    '乔巴', '罗宾', '弗兰奇', '布鲁克', '甚平',
    '草帽一伙',
  ];
  const persona = (stores.personaStore?.getAll?.() || [])
    .find(item => String(item?.name || '').trim() === '海贼王') || null;
  const source = persona?.source && typeof persona.source === 'object'
    ? persona.source
    : {};
  const contacts = (stores.contactsStore?.listContacts?.() || []).map(item => ({
    id: String(item?.id || ''),
    name: String(item?.name || ''),
    isGroup: item?.isGroup === true,
  }));
  const rawSessionIds = (stores.chatStore?.listSessions?.() || []).map(String);
  const worldbooks = await runReadTool('worldbook.list', {});
  const worldbook = await runReadTool('worldbook.read', {
    name: '海贼王',
    includeContent: false,
    maxEntries: 200,
  });
  const regex = await runReadTool('app.read_resource', {
    resource: 'regex',
    id: String(source.regexSetId || ''),
  });
  const targetPresence = targets.map(name => ({
    name,
    inContacts: contacts.some(item => item.name === name || item.id === name),
    inRawSessions: rawSessionIds.includes(name)
      || (name === '草帽一伙' && rawSessionIds.some(id => id.startsWith('group:'))),
  }));
  return {
    ok: Boolean(persona)
      && targetPresence.every(item => !item.inContacts && !item.inRawSessions)
      && String(source.worldbookId || '') === '海贼王'
      && source.worldbookEnabled !== false
      && Number(worldbook.entryCount || 0) === 97
      && (regex.sets || []).some(item => String(item?.id || '') === String(source.regexSetId || '')),
    activePersona: {
      id: String(stores.personaStore?.getActive?.()?.id || ''),
      name: String(stores.personaStore?.getActive?.()?.name || ''),
    },
    currentSessionId: String(stores.chatStore?.getCurrent?.() || ''),
    persona: persona
      ? {
          id: String(persona.id || ''),
          name: String(persona.name || ''),
          sourceType: String(source.type || ''),
          worldbookId: String(source.worldbookId || ''),
          worldbookEnabled: source.worldbookEnabled !== false,
          regexSetId: String(source.regexSetId || ''),
          originalCardStored: source.originalCardStored === true,
        }
      : null,
    visibleContacts: contacts,
    rawSessionIds,
    targetPresence,
    worldbookCount: Number(worldbooks.count || 0),
    worldbook: {
      id: String(worldbook.id || ''),
      entryCount: Number(worldbook.entryCount || 0),
      returnedEntryCount: Number(worldbook.returnedEntryCount || 0),
    },
    regex: {
      requestedId: String(source.regexSetId || ''),
      matchedIds: (regex.sets || []).map(item => String(item?.id || '')),
    },
  };
})()
