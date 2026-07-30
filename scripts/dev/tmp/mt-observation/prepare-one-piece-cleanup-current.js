(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  await Promise.all([
    stores.personaStore?.ready,
    stores.contactsStore?.ready,
    stores.chatStore?.ready,
  ].filter(Boolean));

  const persona = (stores.personaStore?.getAll?.() || [])
    .find(item => String(item?.name || '').trim() === '海贼王') || null;
  if (!persona) return { ok: false, reason: 'one_piece_persona_not_found' };
  if (String(stores.personaStore?.getActive?.()?.id || '') !== String(persona.id || '')) {
    const switched = await window.appBridge?.switchPersona?.(persona.id);
    if (!switched) return { ok: false, reason: 'one_piece_persona_switch_failed' };
  }

  const before = {
    personaId: String(stores.personaStore?.getActive?.()?.id || ''),
    currentSessionId: String(stores.chatStore?.getCurrent?.() || ''),
    contacts: (stores.contactsStore?.listContacts?.() || []).map(item => ({
      id: String(item?.id || ''),
      name: String(item?.name || ''),
      isGroup: item?.isGroup === true,
    })),
  };
  registry.actions?.exitChatRoom?.({ animate: false });
  stores.chatStore?.setCurrent?.('');
  window.appBridge?.setActiveSession?.('');
  const after = {
    personaId: String(stores.personaStore?.getActive?.()?.id || ''),
    currentSessionId: String(stores.chatStore?.getCurrent?.() || ''),
    contactCount: (stores.contactsStore?.listContacts?.() || []).length,
  };
  return {
    ok: after.personaId === String(persona.id || '')
      && after.currentSessionId === ''
      && after.contactCount === before.contacts.length,
    before,
    after,
  };
})()
