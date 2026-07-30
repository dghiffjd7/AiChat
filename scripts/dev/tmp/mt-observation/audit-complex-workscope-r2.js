(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const toolRegistry = stores.agentToolRegistry;
  const invoke = globalThis.__TAURI__?.core?.invoke
    || globalThis.__TAURI__?.invoke
    || globalThis.__TAURI_INTERNALS__?.invoke;
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
  const persona = stores.personaStore?.getActive?.() || null;
  const user = stores.userStore?.getActive?.() || null;
  const groupId = 'group:1785412902379-0a48da';
  const sessionIds = [
    '岑夏·星汐验收-R2-0730',
    '唐澄·星汐验收-R2-0730',
    groupId,
  ];
  const sessions = [];
  for (const sessionId of sessionIds) {
    const contact = stores.contactsStore?.getContact?.(sessionId) || null;
    const settings = stores.chatStore?.getSessionSettings?.(sessionId) || {};
    const wallpaperPath = String(settings?.wallpaper?.path || '').trim();
    let wallpaperPathExists = null;
    if (wallpaperPath && typeof invoke === 'function') {
      try {
        wallpaperPathExists = await invoke('wallpaper_path_exists', { path: wallpaperPath });
      } catch {
        wallpaperPathExists = false;
      }
    }
    sessions.push({
      id: sessionId,
      exists: Boolean(contact),
      name: contact?.name || '',
      isGroup: contact?.isGroup === true,
      members: contact?.members || [],
      avatarBytes: String(contact?.avatar || '').length,
      directWorldIds: await window.appBridge?.getWorldIdsForSession?.(sessionId) || [],
      wallpaper: settings?.wallpaper || null,
      wallpaperPathExists,
    });
  }

  const worldbookNames = [
    '岑夏·星汐验收-R2-0730',
    '唐澄·星汐验收-R2-0730',
    '星汐学园创作汇总·星汐验收-R2-0730',
    '星汐学园创作汇总·星汐验收-R2-0730 (2)',
  ];
  const worldbooks = [];
  for (const name of worldbookNames) {
    const read = await runReadTool('worldbook.read', {
      name,
      includeContent: false,
      maxEntries: 20,
    });
    worldbooks.push({
      requestedName: name,
      ok: read?.ok !== false,
      reason: read?.reason || '',
      id: read?.id || '',
      entryCount: Number(read?.entryCount || 0),
      titles: (read?.entries || []).map(entry => entry.title),
    });
  }

  const rpSessionId = `rp:${persona?.id || 'default'}`;
  const storageAudit = await window.appBridge?.auditWorldInfoStorage?.() || null;
  const emptyAggregate = window.appBridge?.loadStoredWorldInfo?.(
    '星汐学园创作汇总·星汐验收-R2-0730',
  ) || null;
  return {
    readyState: document.readyState,
    activePersona: {
      id: persona?.id || '',
      name: persona?.name || '',
    },
    activeUser: {
      id: user?.id || '',
      name: user?.name || '',
    },
    currentSessionId: stores.chatStore?.getCurrent?.() || '',
    scopedContactCount: (stores.contactsStore?.listContacts?.() || []).length,
    sessions,
    rp: {
      sessionId: rpSessionId,
      directWorldIds: await window.appBridge?.getWorldIdsForSession?.(rpSessionId) || [],
    },
    worldbooks,
    emptyAggregate: emptyAggregate
      ? {
          name: emptyAggregate.name || '',
          entryCount: Array.isArray(emptyAggregate.entries) ? emptyAggregate.entries.length : 0,
          createdAt: emptyAggregate.createdAt || 0,
          updatedAt: emptyAggregate.updatedAt || 0,
          updatedBy: emptyAggregate.updatedBy || '',
        }
      : null,
    storageAudit: storageAudit
      ? {
          nativeAvailable: storageAudit.nativeAvailable,
          indexedOnlyIds: (storageAudit.indexedOnlyIds || []).filter(id => id.includes('R2-0730')),
          nativeOnlyIds: (storageAudit.nativeOnlyIds || []).filter(id => id.includes('R2-0730')),
        }
      : null,
  };
})()
