(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const invoke = globalThis.__TAURI__?.core?.invoke
    || globalThis.__TAURI__?.invoke
    || globalThis.__TAURI_INTERNALS__?.invoke;
  const sessionIds = [
    '比企谷八幡',
    '雪之下雪乃',
    '由比滨结衣',
    '平塚静',
    'group:1785395748527-c7407b',
  ];
  const sessions = [];
  for (const sessionId of sessionIds) {
    const settings = stores.chatStore?.getSessionSettings?.(sessionId) || {};
    const path = String(settings?.wallpaper?.path || '').trim();
    let pathExists = null;
    let pathError = '';
    if (path && typeof invoke === 'function') {
      try {
        pathExists = await invoke('wallpaper_path_exists', { path });
      } catch (error) {
        pathError = String(error?.message || error);
      }
    }
    sessions.push({
      sessionId,
      hasSession: Boolean(stores.chatStore?.hasSession?.(sessionId)),
      wallpaper: settings?.wallpaper || null,
      pathExists,
      pathError,
    });
  }
  const room = document.querySelector('#chat-room');
  const layer = room?.querySelector('.chat-wallpaper-layer');
  const image = layer?.querySelector('.chat-wallpaper-image');
  const roomStyle = room ? getComputedStyle(room) : null;
  const layerStyle = layer ? getComputedStyle(layer) : null;
  const imageStyle = image ? getComputedStyle(image) : null;
  return {
    readyState: document.readyState,
    currentSessionId: stores.chatStore?.getCurrent?.() || '',
    uiMode: registry.uiState?.uiMode || window.appBridge?.getUiMode?.() || '',
    sessions,
    dom: {
      roomExists: Boolean(room),
      roomClass: room?.className || '',
      roomDisplay: roomStyle?.display || '',
      roomVisibility: roomStyle?.visibility || '',
      layerExists: Boolean(layer),
      layerClass: layer?.className || '',
      layerDisplay: layerStyle?.display || '',
      layerVisibility: layerStyle?.visibility || '',
      layerOpacity: layerStyle?.opacity || '',
      imageSrc: image?.src || '',
      imageComplete: image?.complete === true,
      imageNaturalWidth: Number(image?.naturalWidth || 0),
      imageNaturalHeight: Number(image?.naturalHeight || 0),
      imageDisplay: imageStyle?.display || '',
      imageVisibility: imageStyle?.visibility || '',
      imageOpacity: imageStyle?.opacity || '',
    },
  };
})()
