import assert from 'node:assert/strict';

import {
  arePersonaScopedStoresReady,
  buildPersonaScopedStorageKey,
  canEnterPersonaScopedSession,
  getOwnRpSessionIdForScope,
  hasPersonaScopedSession,
  isForeignRpSessionForScope,
  resolvePersonaScopedCurrentSession,
} from '../../src/scripts/ui/persona-scope-runtime-utils.js';

{
  assert.equal(buildPersonaScopedStorageKey('phone_ui_state_v1', ''), 'phone_ui_state_v1__default');
  assert.equal(buildPersonaScopedStorageKey('phone_ui_state_v1', 'persona/a'), 'phone_ui_state_v1__persona_a');
  assert.equal(getOwnRpSessionIdForScope(''), 'rp:default');
  assert.equal(getOwnRpSessionIdForScope('persona_1'), 'rp:persona_1');
  console.log('ok - persona scoped storage keys use a stable default bucket');
}

{
  assert.equal(isForeignRpSessionForScope('rp:persona_2', 'persona_1'), true);
  assert.equal(isForeignRpSessionForScope('rp:persona_1', 'persona_1'), false);
  assert.equal(isForeignRpSessionForScope('plain-room', 'persona_1'), false);
  console.log('ok - foreign RP sessions are detected relative to active persona scope');
}

{
  const chatStore = { hasSession: id => id === 'room-a' || id === 'rp:persona_1' };
  const contactsStore = { getContact: id => (id === 'room-contact' ? { id } : null) };
  assert.equal(hasPersonaScopedSession({ sessionId: 'room-a', scopeId: 'persona_1', chatStore, contactsStore }), true);
  assert.equal(hasPersonaScopedSession({ sessionId: 'room-contact', scopeId: 'persona_1', chatStore, contactsStore }), true);
  assert.equal(hasPersonaScopedSession({ sessionId: 'rp:persona_2', scopeId: 'persona_1', chatStore, contactsStore }), false);
  console.log('ok - known-session checks reject foreign RP ids before store lookup');
}

{
  const current = { value: 'rp:persona_2' };
  const chatStore = {
    getCurrent: () => current.value,
    hasSession: id => id === current.value,
  };
  const contactsStore = { getContact: () => null };
  assert.deepEqual(resolvePersonaScopedCurrentSession({ scopeId: 'persona_1', chatStore, contactsStore }), {
    sessionId: '',
    known: false,
    foreignRp: true,
    source: 'foreign-rp',
  });
  current.value = 'room-a';
  assert.deepEqual(resolvePersonaScopedCurrentSession({ scopeId: 'persona_1', chatStore, contactsStore }), {
    sessionId: 'room-a',
    known: true,
    foreignRp: false,
    source: 'chat',
  });
  console.log('ok - current session resolution returns only safe current ids');
}

{
  const chatStore = {
    getCurrent: () => 'rp:persona_1',
    hasSession: id => id === 'rp:persona_1',
  };
  const contactsStore = { getContact: () => null };
  assert.deepEqual(resolvePersonaScopedCurrentSession({
    scopeId: 'persona_1',
    chatStore,
    contactsStore,
    allowRpSession: false,
  }), {
    sessionId: '',
    known: false,
    foreignRp: false,
    source: 'rp-excluded',
  });
  console.log('ok - social session resolution excludes the active persona creative-writing room');
}

{
  const chatStore = { scopeId: 'default', hasSession: id => id === '海伦娜' };
  const contactsStore = { scopeId: 'default', getContact: id => (id === '海伦娜' ? { id } : null) };
  assert.equal(arePersonaScopedStoresReady({ scopeId: 'persona_1', chatStore, contactsStore }), false);
  assert.deepEqual(canEnterPersonaScopedSession({
    sessionId: '海伦娜',
    scopeId: 'persona_1',
    chatStore,
    contactsStore,
  }), {
    allowed: false,
    reason: 'scope-mismatch',
  });

  chatStore.scopeId = 'persona_1';
  contactsStore.scopeId = 'persona_1';
  assert.deepEqual(canEnterPersonaScopedSession({
    sessionId: '海伦娜',
    scopeId: 'persona_1',
    chatStore: { ...chatStore, hasSession: () => false },
    contactsStore: { ...contactsStore, getContact: () => null },
  }), {
    allowed: false,
    reason: 'unknown-session',
  });
  assert.deepEqual(canEnterPersonaScopedSession({
    sessionId: '海伦娜',
    scopeId: 'persona_1',
    chatStore,
    contactsStore,
  }), {
    allowed: true,
    reason: 'known-session',
  });
  console.log('ok - persona scoped enter guard blocks stale DOM sessions during scope switches');
}
