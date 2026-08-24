import assert from 'node:assert/strict';

import {
  applyMemoryTablePushEvent,
  rerenderCurrentSessionHistory,
} from '../../src/scripts/ui/app-session-refresh-runtime-utils.js';

{
  const calls = [];
  const ok = await rerenderCurrentSessionHistory({
    getCurrentSessionId: () => 's1',
    ensureRecentMessagesLoaded: async (sessionId) => {
      calls.push(['load', sessionId]);
      return [
        { id: 'm1' },
        { id: 'm2' },
        { id: 'm3' },
      ];
    },
    cancelInitialHistoryFill: (sessionId) => calls.push(['cancel', sessionId]),
    clearMessages: () => calls.push(['clear']),
    decorateMessagesForDisplay: (messages, options) => {
      calls.push(['decorate', messages.map((message) => message.id), options]);
      return messages.map((message) => ({ ...message, decorated: true }));
    },
    preloadHistory: (messages) => calls.push(['preload', messages.map((message) => message.id)]),
    setRenderState: (sessionId, state) => calls.push(['render-state', sessionId, state]),
    refreshChatAndContacts: () => calls.push(['refresh']),
    pageSize: 2,
  });

  assert.equal(ok, true);
  assert.deepEqual(calls, [
    ['load', 's1'],
    ['cancel', 's1'],
    ['clear'],
    ['decorate', ['m2', 'm3'], { sessionId: 's1' }],
    ['preload', ['m2', 'm3']],
    ['render-state', 's1', { start: 1 }],
    ['refresh'],
  ]);
  console.log('ok - rerenderCurrentSessionHistory reloads tail window and refreshes session shell');
}

{
  const ok = await rerenderCurrentSessionHistory({
    getCurrentSessionId: () => 's1',
    ensureRecentMessagesLoaded: async () => {
      throw new Error('boom');
    },
  });
  assert.equal(ok, false);
  console.log('ok - rerenderCurrentSessionHistory returns false when history reload fails');
}

{
  let currentSessionId = 'group:c';
  let releaseLoad;
  const loadGate = new Promise(resolve => { releaseLoad = resolve; });
  const calls = [];
  const pending = rerenderCurrentSessionHistory({
    getCurrentSessionId: () => currentSessionId,
    ensureRecentMessagesLoaded: async () => {
      await loadGate;
      return [{ id: 'group-message' }];
    },
    clearMessages: () => calls.push('clear'),
    preloadHistory: () => calls.push('preload'),
  });

  currentSessionId = 'rp:c';
  releaseLoad();
  assert.equal(await pending, false);
  assert.deepEqual(calls, []);
  console.log('ok - rerenderCurrentSessionHistory drops a load after the active session changes');
}

{
  let revision = 'session-a:0';
  let releaseLoad;
  const loadGate = new Promise(resolve => { releaseLoad = resolve; });
  const calls = [];
  const pending = rerenderCurrentSessionHistory({
    getCurrentSessionId: () => 'session-a',
    getHistoryRevision: () => revision,
    ensureRecentMessagesLoaded: async () => {
      await loadGate;
      return [{ id: 'old-message' }];
    },
    clearMessages: () => calls.push('clear'),
    preloadHistory: () => calls.push('preload'),
  });

  revision = 'session-a:1';
  releaseLoad();
  assert.equal(await pending, false);
  assert.deepEqual(calls, []);
  console.log('ok - rerenderCurrentSessionHistory drops a same-session load after history reset');
}

{
  const calls = [];
  const result = applyMemoryTablePushEvent({
    detail: { sessionId: 's1', content: '新增记忆' },
    getCurrentSessionId: () => 's1',
    getAssistantAvatarForSession: (sessionId) => `avatar:${sessionId}`,
    formatNowTime: () => '10:00',
    addMessage: (message) => calls.push(['add', message.content, message.avatar]),
    appendMessage: (message, sessionId) => {
      calls.push(['append', sessionId, message.content]);
      return { ...message, id: 'saved-1' };
    },
    autoMarkReadIfActive: (sessionId, messageId) => calls.push(['mark-read', sessionId, messageId]),
    refreshChatAndContacts: () => calls.push(['refresh']),
  });

  assert.deepEqual(result, {
    role: 'assistant',
    type: 'text',
    name: '助手',
    avatar: 'avatar:s1',
    time: '10:00',
    content: '新增记忆',
    meta: { renderRich: true, kind: 'memory-table-push' },
    id: 'saved-1',
  });
  assert.deepEqual(calls, [
    ['add', '新增记忆', 'avatar:s1'],
    ['append', 's1', '新增记忆'],
    ['mark-read', 's1', 'saved-1'],
    ['refresh'],
  ]);
  console.log('ok - applyMemoryTablePushEvent appends assistant memory pushes and marks them read when active');
}

{
  const calls = [];
  const result = applyMemoryTablePushEvent({
    detail: { sessionId: 's2', content: '新增记忆' },
    getCurrentSessionId: () => 's1',
    appendMessage: (message) => {
      calls.push(['append', message.content]);
      return message;
    },
    refreshChatAndContacts: () => calls.push(['refresh']),
  });
  assert.equal(result?.content, '新增记忆');
  assert.deepEqual(calls, [
    ['append', '新增记忆'],
    ['refresh'],
  ]);
  console.log('ok - applyMemoryTablePushEvent skips live DOM add when target session is not active');
}

{
  const result = applyMemoryTablePushEvent({
    detail: { sessionId: '', content: '' },
  });
  assert.equal(result, null);
  console.log('ok - applyMemoryTablePushEvent ignores incomplete event payloads');
}
