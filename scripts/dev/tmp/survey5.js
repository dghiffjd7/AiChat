(async () => {
  const stores = window.appBridge?.debugUiRegistry?.stores || {};
  const ss = stores.scriptStore;
  await ss?.load?.();
  const scopes = ss.listScopes();
  const summarize = (item) => {
    const code = String(item?.content || item?.code || '');
    return {
      name: String(item?.name || '').slice(0, 40), enabled: item?.enabled, authorized: item?.authorized,
      size: code.length,
      dom: /getElementById|document\.|querySelector/i.test(code),
      net: /fetch\(|XMLHttpRequest|WebSocket|axios/i.test(code),
      st: /triggerSlash|SillyTavern|TavernHelper|getvar|setvar|eventOn|tavern_events/i.test(code),
    };
  };
  const result = { global: (ss.getScripts('global') || []).map(summarize), character: {}, preset: {} };
  for (const id of scopes.character || []) result.character[id.slice(0, 24)] = (ss.getScripts('character', id) || []).map(summarize);
  for (const id of scopes.preset || []) result.preset[id.slice(0, 24)] = (ss.getScripts('preset', id) || []).map(summarize);
  return result;
})()
