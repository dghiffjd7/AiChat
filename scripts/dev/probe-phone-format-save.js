(async () => {
  const store = window.appBridge.getPresetStore();
  await store.ready;
  const id = 'Neutral - Chat';
  const before = store.getState().presets.sysprompt[id];
  if (!before) return { error: 'preset not found' };
  const data = JSON.parse(JSON.stringify(before));
  data.phone_format_chat_position = 'history_depth';
  data.phone_format_chat_depth = 3;
  await store.upsert('sysprompt', { id, name: data.name || id, data });
  const after = store.getState().presets.sysprompt[id];
  const persisted = [after.phone_format_chat_position, after.phone_format_chat_depth];
  const resolvedAfter = store.getResolvedActive('sysprompt', { sessionId: 'probe', uiMode: 'chat' });
  const resolvedPersisted = [
    resolvedAfter?.preset?.phone_format_chat_position,
    resolvedAfter?.preset?.phone_format_chat_depth,
  ];
  const restore = JSON.parse(JSON.stringify(before));
  await store.upsert('sysprompt', { id, name: restore.name || id, data: restore });
  const restored = store.getState().presets.sysprompt[id];
  return {
    persisted,
    resolvedPersisted,
    restoredPosition: [restored.phone_format_chat_position, restored.phone_format_chat_depth],
  };
})()
