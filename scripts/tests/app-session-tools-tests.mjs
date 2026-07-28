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
  assert.deepEqual(h.active, ['A']);
  assert.deepEqual(h.entered, [['A', 'A']]);
  assert.equal(h.messages.get('A')[0].content, '你创建了聊天室「A」');
  console.log('ok - session.create creates a contact, switches active session, and opens chat');
}

{
  const h = createHarness();
  const result = await getTool(h.tools, 'session.create').execute({ names: ['精灵女王', '暗夜女王'], open: true });
  assert.equal(result.ok, true);
  assert.equal(result.count, 2);
  assert.equal(result.createdCount, 2);
  assert.deepEqual(result.sessionIds, ['精灵女王', '暗夜女王']);
  assert.equal(h.contacts.has('精灵女王'), true);
  assert.equal(h.contacts.has('暗夜女王'), true);
  assert.equal(h.chatStore.getCurrent(), '精灵女王');
  assert.deepEqual(h.entered, [['精灵女王', '精灵女王']]);
  assert.equal(result.openedSessionId, '精灵女王');
  assert.equal(h.messages.get('精灵女王')[0].content, '你创建了聊天室「精灵女王」');
  assert.equal(h.messages.get('暗夜女王')[0].content, '你创建了聊天室「暗夜女王」');
  console.log('ok - session.create creates multiple chats and reveals only the primary result');
}

{
  const h = createHarness();
  const result = await getTool(h.tools, 'session.create').execute({ names: ['精灵女王', '暗夜女王'], open: false });
  assert.equal(result.ok, true);
  assert.equal(result.createdCount, 2);
  assert.equal(h.chatStore.getCurrent(), 'default');
  assert.deepEqual(h.active, []);
  assert.deepEqual(h.entered, []);
  console.log('ok - background session.create never changes the active or visible session');
}

{
  const h = createHarness();
  h.contacts.set('A', { id: 'A', name: 'A', isGroup: false });
  const result = await getTool(h.tools, 'session.create').execute({ name: 'A' });
  assert.equal(result.created, false);
  assert.equal(result.existing, true);
  assert.equal(h.chatStore.getCurrent(), 'default');
  assert.deepEqual(h.entered, []);
  console.log('ok - session.create reuses an existing contact without navigating by default');
}

{
  const h = createHarness();
  h.contacts.set('B', { id: 'B', name: 'Beta', isGroup: false });
  const open = await getTool(h.tools, 'session.open').execute({ sessionId: 'Beta' });
  assert.equal(open.ok, true);
  assert.equal(open.sessionId, 'B');
  const config = await getTool(h.tools, 'session.open_config').execute({ target: 'Beta' });
  assert.equal(config.opened, true);
  assert.deepEqual(h.configs, [{ sessionId: 'B' }]);
  // 会话配置面板以 chatStore 会话为权威来源；rp 与历史会话可以合法地没有联系人
  h.chatStore.listSessions = () => ['B', 'rp:hero', 'legacy-room'];
  const rpConfig = await getTool(h.tools, 'session.open_config').execute({ sessionId: 'rp:hero' });
  assert.equal(rpConfig.opened, true);
  const legacyConfig = await getTool(h.tools, 'session.open_config').execute({ sessionId: 'legacy-room' });
  assert.equal(legacyConfig.opened, true);
  assert.deepEqual(h.configs, [
    { sessionId: 'B' },
    { sessionId: 'rp:hero' },
    { sessionId: 'legacy-room' },
  ]);
  // v4f obs-03-025：显式指定不存在的目标不得打开“幽灵”会话配置页
  const ghost = await getTool(h.tools, 'session.open_config').execute({ sessionName: '冻结观察不存在档' });
  assert.equal(ghost.ok, false);
  assert.equal(ghost.reason, 'session_not_found');
  assert.equal(h.configs.length, 3, '幽灵目标不应触发面板打开');
  console.log('ok - session tools resolve display names for opening sessions and config');
}
