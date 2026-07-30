(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  await Promise.all([
    stores.personaStore?.ready,
    stores.contactsStore?.ready,
    stores.chatStore?.ready,
    stores.agentRunStore?.ready,
    stores.maidConversationStore?.ready,
  ].filter(Boolean));
  const read = async (toolName, args) => {
    const output = await stores.agentToolRegistry?.executeTool?.(toolName, args, {
      operationIntentPolicy: { mode: 'read_only' },
      requestPermission: async () => ({ decision: 'allow' }),
    });
    return output?.result || output || {};
  };
  const privateNames = [
    '蒙奇·D·路飞',
    '罗罗诺亚·索隆',
    '娜美',
    '乌索普',
    '山治',
    '托尼托尼·乔巴',
    '妮可·罗宾',
    '弗兰奇',
    '布鲁克',
    '甚平',
  ];
  const contacts = stores.contactsStore?.listContacts?.() || [];
  const group = contacts.find(item => item?.isGroup === true && item?.name === '草帽一伙') || null;
  const sessionEvidence = await read('app.read_resource', {
    resource: 'session',
    include: ['members', 'worldbooks'],
  });
  const evidenceByName = new Map(
    (sessionEvidence?.sessions || []).map(item => [String(item?.name || ''), item]),
  );
  const targetEvidence = [...privateNames, '草帽一伙']
    .map(name => evidenceByName.get(name))
    .filter(Boolean);
  const worldbooks = await read('worldbook.list', {});
  const worldbook = await read('worldbook.read', {
    name: '海贼王',
    includeContent: false,
    maxEntries: 200,
  });
  const consumedRuns = (stores.agentRunStore?.listRuns?.({ limit: 500 }) || [])
    .filter(item => (
      item?.metadata?.pendingWorkflow?.kind === 'imported_card_session_setup' &&
      item?.metadata?.pendingWorkflow?.state === 'consumed'
    ));
  const expectedMembers = [...privateNames].sort();
  const actualMembers = (group?.members || []).map(String).sort();
  const allInheritanceVerified = targetEvidence.length === 11 && targetEvidence.every(item => (
    Array.isArray(item?.worldbooks?.directWorldIds) &&
    item.worldbooks.directWorldIds.length === 0 &&
    item.worldbooks.roleWorldIds?.includes('海贼王') &&
    item.worldbooks.resolvedWorldIds?.includes('海贼王')
  ));
  const conversation = stores.maidConversationStore?.exportState?.() || {};
  return {
    ok: stores.personaStore?.getActive?.()?.name === '海贼王' &&
      privateNames.every(name => contacts.some(item => item?.isGroup !== true && item?.name === name)) &&
      Boolean(group) &&
      JSON.stringify(actualMembers) === JSON.stringify(expectedMembers) &&
      allInheritanceVerified &&
      Number(worldbooks?.count || 0) === 60 &&
      Number(worldbook?.entryCount || 0) === 97 &&
      consumedRuns.length >= 1 &&
      conversation?.threadId === 'maid_default' &&
      (conversation?.turns || []).length === 120,
    model: {
      profileId: stores.maidSettingsStore?.getBoundProfileId?.() || '',
      modelOverride: stores.maidSettingsStore?.getBoundModelOverride?.() || '',
    },
    activePersona: {
      id: String(stores.personaStore?.getActive?.()?.id || ''),
      name: String(stores.personaStore?.getActive?.()?.name || ''),
    },
    currentSessionId: String(stores.chatStore?.getCurrent?.() || ''),
    privateNames,
    group: group
      ? {
          id: String(group.id || ''),
          name: String(group.name || ''),
          members: (group.members || []).map(String),
        }
      : null,
    worldbook: {
      count: Number(worldbooks?.count || 0),
      id: String(worldbook?.id || ''),
      entryCount: Number(worldbook?.entryCount || 0),
      returnedEntryCount: Number(worldbook?.returnedEntryCount || 0),
    },
    targetWorldbookEvidence: targetEvidence.map(item => ({
      id: item.id,
      name: item.name,
      directWorldIds: item.worldbooks?.directWorldIds || [],
      roleWorldIds: item.worldbooks?.roleWorldIds || [],
      resolvedWorldIds: item.worldbooks?.resolvedWorldIds || [],
      memberCount: Number(item.memberCount || 0),
    })),
    consumedRunIds: consumedRuns.map(item => item.id),
    conversation: {
      threadId: String(conversation?.threadId || ''),
      turns: (conversation?.turns || []).length,
      memoryRows: (conversation?.memoryRows || []).length,
      contextTokens: Number(stores.maidConversationStore?.getContextSnapshot?.()?.tokenCount || 0),
    },
  };
})()
