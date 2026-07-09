(() => {
  const reg = window.appBridge?.debugUiRegistry;
  const contacts = reg?.stores?.contactsStore;
  const list = contacts?.listContacts?.() || [];
  return {
    count: list.length,
    names: list.map(c => c?.name).slice(0, 15),
    remById: !!contacts?.getContact?.('雷姆'),
    remByName: list.some(c => /雷姆/.test(c?.name || '')),
  };
})()
