(async () => {
  const bridge = window.appBridge;
  const sid = bridge.debugUiRegistry.stores.chatStore.getCurrent();
  const map = bridge.worldSessionMap;
  const info = { mapType: typeof map, keys: map && typeof map === 'object' ? Object.keys(map).slice(0, 6) : null };
  // 常见形态：worldSessionMap 是 { [sessionId]: [worldIds] } 或有 set 方法
  if (map && typeof map.set === 'function') {
    map.set(sid, ['《凡人修仙传V10.91》']);
    info.method = 'map.set';
  } else if (map && typeof map === 'object') {
    map[sid] = ['《凡人修仙传V10.91》'];
    info.method = 'assign';
  }
  bridge.currentWorldIds = ['《凡人修仙传V10.91》'];
  bridge.currentWorldId = '《凡人修仙传V10.91》';
  await new Promise(r => setTimeout(r, 500));
  info.after = await bridge.getWorldIdsForSession?.(sid);
  return info;
})()
