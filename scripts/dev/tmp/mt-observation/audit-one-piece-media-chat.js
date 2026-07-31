(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const invoke = globalThis.__TAURI__?.core?.invoke
    || globalThis.__TAURI__?.invoke
    || globalThis.__TAURI_INTERNALS__?.invoke;
  await Promise.all([
    stores.contactsStore?.ready,
    stores.chatStore?.ready,
    stores.personaStore?.ready,
  ].filter(Boolean));

  const targets = ['蒙奇·D·路飞', '娜美'];
  const sessions = [];
  for (const sessionId of targets) {
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
    const messages = stores.chatStore?.getMessages?.(sessionId) || [];
    const resolvedWorld = await window.appBridge?.getResolvedWorldState?.(sessionId) || {};
    sessions.push({
      id: sessionId,
      name: String(contact?.name || ''),
      avatar: {
        bytes: String(contact?.avatar || '').length,
        prefix: String(contact?.avatar || '').slice(0, 48),
      },
      wallpaper: settings?.wallpaper
        ? {
            path: wallpaperPath,
            opacity: settings.wallpaper.opacity,
            mime: String(settings.wallpaper.mime || ''),
            width: Number(settings.wallpaper.width || 0),
            height: Number(settings.wallpaper.height || 0),
            source: String(settings.wallpaper.source || ''),
          }
        : null,
      wallpaperPathExists,
      worldbooks: {
        directWorldIds: await window.appBridge?.getWorldIdsForSession?.(sessionId) || [],
        roleWorldIds: resolvedWorld?.roleWorldIds || [],
        resolvedWorldIds: resolvedWorld?.worldIds || [],
      },
      messageCount: messages.length,
      recentMessages: messages.slice(-6).map(item => ({
        id: String(item?.id || ''),
        role: String(item?.role || item?.type || ''),
        content: String(item?.content || item?.text || '').slice(0, 800),
        status: String(item?.status || ''),
      })),
    });
  }
  return {
    readyState: document.readyState,
    activePersona: {
      id: String(stores.personaStore?.getActive?.()?.id || ''),
      name: String(stores.personaStore?.getActive?.()?.name || ''),
    },
    currentSessionId: String(stores.chatStore?.getCurrent?.() || ''),
    model: {
      profileId: stores.maidSettingsStore?.getBoundProfileId?.() || '',
      modelOverride: stores.maidSettingsStore?.getBoundModelOverride?.() || '',
    },
    sessions,
  };
})()
