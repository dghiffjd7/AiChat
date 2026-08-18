(async () => {
  const store = window.appBridge.getPresetStore();
  const state = store.getState();
  const builtinId = String(state?.builtinActive?.sysprompt || '');
  const activeId = String(state?.active?.sysprompt || '');
  const bucket = state?.bindings?.byType?.sysprompt || {};
  const sessionId = String(window.appBridge?.activeSessionId || '');
  const resolved = store.getResolvedActive('sysprompt', { sessionId, uiMode: 'chat' });
  const pick = p => (p ? {
    intro: [p.phone_format_intro_position, p.phone_format_intro_depth],
    chat: [p.phone_format_chat_position, p.phone_format_chat_depth],
    moment: [p.phone_format_moment_position, p.phone_format_moment_depth],
    footer: [p.phone_format_footer_position, p.phone_format_footer_depth],
  } : null);
  return {
    sessionId,
    builtinId,
    activeId,
    sessionBindings: bucket.sessions || {},
    modeBindings: bucket.modes || {},
    resolvedId: String(resolved?.presetId || ''),
    resolvedSource: String(resolved?.source || ''),
    resolvedPositions: pick(resolved?.preset),
    activePositions: pick(state?.presets?.sysprompt?.[activeId] || null),
    builtinPositions: pick(state?.presets?.sysprompt?.[builtinId] || null),
    presetIds: Object.keys(state?.presets?.sysprompt || {}),
  };
})()
