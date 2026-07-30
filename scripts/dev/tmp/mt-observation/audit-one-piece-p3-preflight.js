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

  const runReadTool = async (name, args) => {
    const output = await toolRegistry?.executeTool?.(name, args, {
      operationIntentPolicy: { mode: 'read_only' },
      requestPermission: async () => ({ decision: 'allow' }),
    });
    return output?.result || output || null;
  };

  const activePersona = stores.personaStore?.getActive?.() || null;
  const activeUser = stores.userStore?.getActive?.() || null;
  const target = (stores.personaStore?.getAll?.() || [])
    .find(item => String(item?.name || '').trim() === '海贼王') || null;
  const source = target?.source && typeof target.source === 'object' ? target.source : {};
  const worldbookId = String(source.worldbookId || '').trim();
  const worldbook = worldbookId
    ? await runReadTool('worldbook.read', {
        name: worldbookId,
        includeContent: false,
        maxEntries: 200,
      })
    : null;

  return {
    readyState: document.readyState,
    before: {
      activePersona: {
        id: String(activePersona?.id || ''),
        name: String(activePersona?.name || ''),
      },
      activeUser: {
        id: String(activeUser?.id || ''),
        name: String(activeUser?.name || ''),
      },
      currentSessionId: String(stores.chatStore?.getCurrent?.() || ''),
    },
    target: target
      ? {
          id: String(target.id || ''),
          name: String(target.name || ''),
          sourceType: String(source.type || ''),
          characterName: String(source.characterName || ''),
          worldbookId,
          worldbookEnabled: source.worldbookEnabled !== false,
          regexSetId: String(source.regexSetId || ''),
          systemPresetId: String(source.systemPresetId || ''),
        }
      : null,
    worldbook: worldbook
      ? {
          ok: worldbook.ok !== false,
          reason: String(worldbook.reason || ''),
          id: String(worldbook.id || ''),
          entryCount: Number(worldbook.entryCount || 0),
          entries: (worldbook.entries || []).map(entry => ({
            id: String(entry.id || ''),
            title: String(entry.title || ''),
            keys: Array.isArray(entry.keys) ? entry.keys.slice(0, 8) : [],
            enabled: entry.enabled !== false,
          })),
        }
      : null,
  };
})()
