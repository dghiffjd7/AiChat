(() => {
  const bridge = window.appBridge;
  const chatStore = bridge.getChatStore?.() || window.chatStore;
  const contactsStore = bridge.getContactsStore?.() || window.contactsStore;
  const sessions = (chatStore.getSessionList?.() || chatStore.listSessions?.() || []).slice(0, 60);
  const rp = sessions.filter(s => /^rp[:_-]/i.test(String(s.id || s)) || s.isRp || /rp/i.test(String(s.mode || '')));
  const all = sessions.map(s => ({ id: String(s.id || s).slice(0, 40), name: String(s.name || '').slice(0, 25) }));
  return { rpCount: rp.length, rp: rp.map(s => String(s.id || s)).slice(0, 15), sample: all.slice(0, 25) };
})()
