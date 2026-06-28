import assert from 'node:assert/strict';

import { createAppSessionAgentTools } from '../../src/scripts/agent/tools/app-session-tools.js';

const getTool = (tools, name) => tools.find(tool => tool.name === name);

const createHarness = () => {
  const contacts = new Map();
  const messages = new Map();
  let current = 'default';
  const entered = [];
  const configs = [];
  const refreshed = [];
  const active = [];
  const contactsStore = {
    listContacts: () => Array.from(contacts.values()),
    getContact: id => contacts.get(id) || null,
    upsertContact: contact => {
      contacts.set(contact.id, { ...contact });
      return contacts.get(contact.id);
    },
  };
  const chatStore = {
    getCurrent: () => current,
    switchSession: id => {
      current = id;
    },
    appendMessage: (message, id = current) => {
      const list = messages.get(id) || [];
      list.push({ ...message });
      messages.set(id, list);
    },
  };
  const tools = createAppSessionAgentTools({
    contactsStore,
    chatStore,
    enterChatRoom: async (id, title) => {
      entered.push([id, title]);
      return { blocked: false };
    },
    refreshChatAndContacts: options => refreshed.push(options),
    setActiveSession: id => active.push(id),
    showSessionConfig: options => configs.push(options),
    renderSessionNameHtml: (id, contact) => contact?.name || id,
    now: () => 1000,
  });
  return { contacts, messages, entered, configs, refreshed, active, tools, chatStore };
};

{
  const h = createHarness();
  const result = await getTool(h.tools, 'session.create').execute({ name: 'A', open: true });
  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.equal(result.sessionId, 'A');
  assert.equal(h.contacts.get('A').isUserCreated, true);
  assert.equal(h.chatStore.getCurrent(), 'A');
  assert.deepEqual(h.active, ['A', 'A']);
  assert.deepEqual(h.entered, [['A', 'A']]);
  assert.equal(h.messages.get('A')[0].content, '你创建了聊天室「A」');
  console.log('ok - session.create creates a contact, switches active session, and opens chat');
}

{
  const h = createHarness();
  h.contacts.set('A', { id: 'A', name: 'A', isGroup: false });
  const result = await getTool(h.tools, 'session.create').execute({ name: 'A' });
  assert.equal(result.created, false);
  assert.equal(result.existing, true);
  assert.deepEqual(h.entered, [['A', 'A']]);
  console.log('ok - session.create reuses an existing contact instead of duplicating it');
}

{
  const h = createHarness();
  h.contacts.set('B', { id: 'B', name: 'Beta', isGroup: false });
  const open = await getTool(h.tools, 'session.open').execute({ sessionId: 'Beta' });
  assert.equal(open.ok, true);
  assert.equal(open.sessionId, 'B');
  const config = await getTool(h.tools, 'session.open_config').execute({ sessionId: 'Beta' });
  assert.equal(config.opened, true);
  assert.deepEqual(h.configs, [{ sessionId: 'B' }]);
  console.log('ok - session tools resolve display names for opening sessions and config');
}
