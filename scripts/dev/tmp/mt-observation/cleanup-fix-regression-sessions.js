(async () => {
  const targetIds = [
    '意图回归-A-0728',
    '意图回归-B-0728',
    '意图回归-C-0728',
  ];
  const registry = window.appBridge?.debugUiRegistry || {};
  const chatStore = registry.stores?.chatStore || window.appBridge?.getChatStore?.();
  const contactsStore = registry.stores?.contactsStore;
  if (!chatStore?.listSessions || !chatStore?.delete || !contactsStore?.removeContact) {
    return { ok: false, reason: 'session_store_runtime_missing' };
  }

  const snapshot = () => targetIds.map((id) => ({
    id,
    session: chatStore.listSessions().includes(id),
    contact: Boolean(contactsStore.getContact?.(id)),
  }));
  const before = snapshot();
  for (const target of before) {
    if (target.session) chatStore.delete(target.id);
    if (target.contact) contactsStore.removeContact(target.id);
  }
  const after = snapshot();
  const currentSessionId = String(chatStore.getCurrent?.() || '');
  window.dispatchEvent(new CustomEvent('session-changed', {
    detail: { id: currentSessionId },
  }));
  return {
    ok: after.every(target => !target.session && !target.contact),
    exactTargets: targetIds,
    removed: before.filter(target => target.session || target.contact).map(target => target.id),
    before,
    after,
    currentSessionId,
  };
})()
