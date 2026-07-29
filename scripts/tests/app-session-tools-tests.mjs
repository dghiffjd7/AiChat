import assert from 'node:assert/strict';

import {
  AGENT_PERMISSION_DECISIONS,
  createAgentPermissionEvaluator,
} from '../../src/scripts/agent/agent-permissions.js';
import { createAgentToolRegistry } from '../../src/scripts/agent/agent-tool-registry.js';
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

{
  const contacts = new Map([
    ['room-current', { id: 'room-current', name: '当前测试房', avatar: 'data:image/png;base64,CURRENT' }],
    ['room-delete', { id: 'room-delete', name: '待删测试房', avatar: 'data:image/png;base64,DELETE' }],
    ['rp:persona-a', { id: 'rp:persona-a', name: '隐藏创意写作房', avatar: 'data:image/png;base64,RP' }],
  ]);
  const deleted = [];
  const confirmations = [];
  const tools = createAppSessionAgentTools({
    contactsStore: {
      listContacts: () => Array.from(contacts.values()),
      getContact: id => contacts.get(id) || null,
    },
    chatStore: {
      getCurrent: () => 'room-current',
      listSessions: () => Array.from(contacts.keys()),
    },
    deleteSession: async id => {
      deleted.push(id);
      contacts.delete(id);
      return { ok: true, deleted: true, sessionId: id };
    },
    now: () => 1234,
  });
  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.allow,
    }),
    logger: { warn() {} },
  });
  registry.registerMany(tools);

  const visibleSessions = await registry.executeTool('session.list', {}, {
    operationIntentPolicy: { mode: 'read_only' },
  });
  assert.deepEqual(
    visibleSessions.result.contacts.map(contact => contact.id),
    ['room-current', 'room-delete'],
    'RP sessions must stay outside the visible normal-session candidate domain',
  );

  const output = await registry.executeTool('session.delete_many', {
    sessions: ['room-current', 'room-delete', 'rp:persona-a', 'missing-room'],
  }, {
    operationIntentPolicy: { mode: 'write_allowed' },
    requestToolConfirmation: request => {
      confirmations.push(request);
      return true;
    },
  });

  assert.equal(output.status, 'succeeded');
  assert.deepEqual(deleted, ['room-delete']);
  assert.equal(confirmations.length, 1);
  assert.equal(confirmations[0].allowAlways, false);
  assert.deepEqual(
    confirmations[0].details.items.map(item => [item.id, item.label, item.status]),
    [
      ['room-current', '当前测试房', 'protected'],
      ['room-delete', '待删测试房', 'planned'],
      ['rp:persona-a', '隐藏创意写作房', 'protected'],
      ['missing-room', 'missing-room', 'missing'],
    ],
  );
  assert.match(confirmations[0].details.items[1].avatar, /^data:image/);
  assert.equal(JSON.stringify(output.result).includes('data:image'), false, 'avatars must stay in confirmation UI only');
  assert.equal(output.result.succeededCount, 1);
  assert.equal(output.result.skippedCount, 3);
  assert.equal(output.result.results.find(item => item.sessionId === 'room-current').reason, 'current_session_protected');
  assert.equal(output.result.results.find(item => item.sessionId === 'rp:persona-a').reason, 'rp_session_excluded');
  assert.deepEqual(output.result.audit, {
    kind: 'session.delete_many',
    deletedAt: 1234,
    items: [{ id: 'room-delete', name: '待删测试房' }],
  });
  console.log('ok - session.delete_many confirms once, protects current/RP sessions, and keeps avatars UI-only');
}

{
  const contacts = new Map([
    ['room-race', { id: 'room-race', name: '确认期间手动删除' }],
  ]);
  let deleteCalls = 0;
  const tools = createAppSessionAgentTools({
    contactsStore: {
      listContacts: () => Array.from(contacts.values()),
      getContact: id => contacts.get(id) || null,
    },
    chatStore: {
      getCurrent: () => 'other-room',
      listSessions: () => Array.from(contacts.keys()),
    },
    deleteSession: async () => {
      deleteCalls += 1;
      return { ok: true, deleted: true };
    },
  });
  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.allow,
    }),
    logger: { warn() {} },
  });
  registry.registerMany(tools);

  const output = await registry.executeTool('session.delete_many', {
    sessions: ['room-race'],
  }, {
    operationIntentPolicy: { mode: 'write_allowed' },
    requestToolConfirmation: () => {
      contacts.delete('room-race');
      return true;
    },
  });
  assert.equal(output.result.ok, true);
  assert.equal(output.result.succeededCount, 0);
  assert.equal(output.result.skippedCount, 1);
  assert.equal(output.result.results[0].reason, 'already_absent');
  assert.equal(deleteCalls, 0);
  console.log('ok - session.delete_many rechecks frozen ids and treats TOCTOU disappearance as skipped');
}

console.log('app-session-tools-tests passed');
