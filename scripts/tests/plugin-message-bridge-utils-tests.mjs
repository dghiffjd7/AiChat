import assert from 'node:assert/strict';

import {
  buildPluginInjectedMessage,
  normalizePluginSendMessageOptions,
  runPluginSendMessageFlow,
} from '../../src/scripts/ui/chat/plugin-message-bridge-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('normalizePluginSendMessageOptions normalizes role silent and regex flags', () => {
  assert.deepEqual(normalizePluginSendMessageOptions(123, {
    role: 'ASSISTANT',
    silent: 1,
    skipInputRegex: true,
  }), {
    text: '123',
    role: 'assistant',
    silent: true,
    skipInputRegex: true,
    skipScripts: false,
    name: '',
    type: '',
    avatar: '',
    meta: null,
  });
});

test('buildPluginInjectedMessage preserves system assistant and user payload semantics', () => {
  const appBridge = {
    applyInputStoredRegex: text => `stored:${text}`,
    applyInputDisplayRegex: text => `display:${text}`,
  };
  assert.deepEqual(buildPluginInjectedMessage({
    text: 'hello',
    role: 'user',
    userName: '我',
    now: '10:00',
    appBridge,
    userAvatar: 'user.png',
  }).message, {
    role: 'user',
    type: 'text',
    content: 'display:stored:hello',
    raw: 'stored:hello',
    name: '我',
    avatar: 'user.png',
    time: '10:00',
  });
  assert.deepEqual(buildPluginInjectedMessage({
    text: 'sys',
    role: 'system',
    now: '10:01',
  }).message, {
    role: 'system',
    type: 'meta',
    content: 'sys',
    raw: 'sys',
    name: '系统',
    avatar: '',
    time: '10:01',
  });
  assert.deepEqual(buildPluginInjectedMessage({
    text: 'reply',
    role: 'assistant',
    now: '10:02',
    assistantAvatar: 'assistant.png',
    isRpSession: true,
  }).message, {
    role: 'assistant',
    type: 'text',
    content: 'reply',
    raw: 'reply',
    name: '助手',
    avatar: 'assistant.png',
    time: '10:02',
    meta: { renderRich: true },
  });
});

test('runPluginSendMessageFlow injects assistant messages and triggers after_receive', async () => {
  const calls = [];
  const chatStore = {
    getCurrent: () => 'session-a',
    appendMessage(message, sessionId) {
      calls.push(['append', sessionId, message]);
      return { ...message, id: 'assistant-1' };
    },
  };
  const saved = await runPluginSendMessageFlow({
    content: 'reply',
    options: { role: 'assistant' },
  }, {
    chatStore,
    ui: { addMessage: message => calls.push(['ui', message]) },
    appBridge: {},
    avatars: { user: 'user.png' },
    getActiveUserProfile: () => ({ name: '我' }),
    formatNowTime: () => '10:00',
    getAssistantAvatarForSession: () => 'assistant.png',
    isRpSessionId: () => true,
    isSessionActive: () => true,
    refreshChatAndContacts: () => calls.push(['refresh']),
    emitPluginAfterReceive: (message, sessionId) => calls.push(['after-receive', sessionId, message.id]),
  });

  assert.equal(saved.id, 'assistant-1');
  assert.deepEqual(calls.map(call => call[0]), ['ui', 'append', 'refresh', 'after-receive']);
  assert.equal(calls[0][1].meta.renderRich, true);
  assert.deepEqual(calls[3], ['after-receive', 'session-a', 'assistant-1']);
});

test('runPluginSendMessageFlow injects silent user messages and triggers after_send hooks', async () => {
  const calls = [];
  const chatStore = {
    getCurrent: () => 'session-a',
    appendMessage(message, sessionId) {
      calls.push(['append', sessionId, message]);
      return { ...message, id: 'user-1' };
    },
  };
  const saved = await runPluginSendMessageFlow({
    content: 'hello',
    options: { role: 'user', silent: true },
  }, {
    chatStore,
    ui: { addMessage: message => calls.push(['ui', message]) },
    appBridge: {
      applyInputStoredRegex: text => `stored:${text}`,
      applyInputDisplayRegex: text => `display:${text}`,
    },
    avatars: { user: 'user.png' },
    getActiveUserProfile: () => ({ name: '我' }),
    formatNowTime: () => '10:00',
    isSessionActive: () => false,
    refreshChatAndContacts: () => calls.push(['refresh']),
    dispatchAfterSendEvents: payload => calls.push(['after-send', payload.messages[0].id, payload.sessionId]),
  });

  assert.equal(saved.id, 'user-1');
  assert.deepEqual(calls.map(call => call[0]), ['append', 'refresh', 'after-send']);
  assert.equal(calls[0][2].content, 'display:stored:hello');
  assert.deepEqual(calls[2], ['after-send', 'user-1', 'session-a']);
});

test('runPluginSendMessageFlow delegates non-silent user messages to handleSend and returns latest user', async () => {
  const calls = [];
  const messages = [
    { id: 'assistant-old', role: 'assistant' },
    { id: 'user-latest', role: 'user' },
  ];
  const result = await runPluginSendMessageFlow({
    content: 'send me',
    options: { skipInputRegex: true },
  }, {
    chatStore: {
      getCurrent: () => 'session-a',
      getMessages: () => messages,
    },
    handleSend: async (event, options) => calls.push(['handleSend', event, options]),
  });

  assert.deepEqual(calls, [[
    'handleSend',
    null,
    { overrideText: 'send me', ignorePending: true, skipInputRegex: true },
  ]]);
  assert.deepEqual(result, { id: 'user-latest', role: 'user' });
});

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(err);
  }
}

if (failed > 0) process.exit(1);
