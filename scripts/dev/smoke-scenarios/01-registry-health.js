(async () => {
  const reg = window.appBridge?.debugUiRegistry || {};
  const stores = Object.keys(reg.stores || {});
  const actions = Object.keys(reg.actions || {});
  const registry = reg.stores?.agentToolRegistry;
  const wantedTools = [
    'chat.repair_message_format',
    'chat.optimize_message',
    'maid.todo.write',
    'app.read_recent_errors',
    'app.ui.inspect',
    'app.read_resource',
    'session.create',
    'web.search_images',
    'media.fetch_image',
  ];
  const missingTools = wantedTools.filter(name => !registry?.get?.(name));
  const personas = reg.stores?.personaStore?.getAll?.() || [];
  const testCard = personas.some(p => String(p?.name || '').includes('女仆能力测试'));
  const pass = stores.length >= 20 && actions.length >= 80 && missingTools.length === 0 && testCard;
  return {
    pass,
    detail: {
      storeCount: stores.length,
      actionCount: actions.length,
      missingTools,
      testCardPresent: testCard,
    },
  };
})()
