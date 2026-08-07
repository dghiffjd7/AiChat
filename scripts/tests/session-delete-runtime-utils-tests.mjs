import assert from 'node:assert/strict';

import { removeSessionCore } from '../../src/scripts/ui/session-delete-runtime-utils.js';

{
  const calls = [];
  const contacts = new Map([['room-a', { id: 'room-a', name: '测试房 A' }]]);
  const sessions = new Set(['room-a', 'room-b']);
  const worldMap = {
    'room-a': ['derived-world', 'shared-world'],
    'room-b': ['shared-world'],
  };
  const appBridge = {
    getWorldIdsForSession: id => worldMap[id] || [],
    getWorldSessionMap: () => worldMap,
    getWorldInfo: async id => ({ id, source: 'world_entry' }),
    deleteWorldInfo: async id => calls.push(['delete-world', id]),
    deleteWorldSessionMapEntry: id => {
      calls.push(['delete-world-map', id]);
      delete worldMap[id];
      return true;
    },
    clearSessionTurnCheckpointState: async id => calls.push(['clear-checkpoint', id]),
  };
  const result = await removeSessionCore({
    sessionId: 'room-a',
    chatStore: {
      getSessionSettings: () => ({ wallpaper: { path: 'wallpapers/room-a.png' } }),
      listSessions: () => Array.from(sessions),
      delete: id => {
        calls.push(['delete-session', id]);
        sessions.delete(id);
      },
    },
    contactsStore: {
      getContact: id => contacts.get(id) || null,
      removeContact: id => {
        calls.push(['remove-contact', id]);
        contacts.delete(id);
      },
    },
    appBridge,
    invoke: async (command, payload) => calls.push([command, payload]),
    logger: { warn() {} },
  });

  assert.equal(result.ok, true);
  assert.equal(result.deleted, true);
  assert.deepEqual(result.deletedDerivedWorldbookIds, ['derived-world']);
  assert.deepEqual(calls, [
    ['delete_wallpaper', { sessionId: 'room-a', path: 'wallpapers/room-a.png' }],
    ['delete-world', 'derived-world'],
    ['delete-world-map', 'room-a'],
    ['delete-session', 'room-a'],
    ['clear-checkpoint', 'room-a'],
    ['remove-contact', 'room-a'],
  ]);
  assert.deepEqual(worldMap, { 'room-b': ['shared-world'] });
  assert.equal(contacts.has('room-a'), false);
  assert.equal(sessions.has('room-a'), false);
  console.log('ok - removeSessionCore performs the complete non-UI session cleanup chain');
}

{
  let mutated = false;
  const result = await removeSessionCore({
    sessionId: 'already-gone',
    chatStore: {
      listSessions: () => [],
      delete: () => { mutated = true; },
    },
    contactsStore: {
      getContact: () => null,
      removeContact: () => { mutated = true; },
    },
    appBridge: {},
    invoke: async () => { mutated = true; },
  });
  assert.equal(result.ok, true);
  assert.equal(result.deleted, false);
  assert.equal(result.reason, 'already_absent');
  assert.equal(mutated, false);
  console.log('ok - removeSessionCore treats an already absent session as an idempotent skip');
}

{
  const calls = [];
  let releaseGuard;
  const guardReady = new Promise(resolve => { releaseGuard = resolve; });
  const contacts = new Map([['room-busy', { id: 'room-busy' }]]);
  const sessions = new Set(['room-busy']);
  const pending = removeSessionCore({
    sessionId: 'room-busy',
    chatStore: {
      listSessions: () => Array.from(sessions),
      getSessionSettings: () => ({}),
      delete: id => {
        calls.push('delete-session');
        sessions.delete(id);
      },
    },
    contactsStore: {
      getContact: id => contacts.get(id) || null,
      removeContact: id => {
        calls.push('remove-contact');
        contacts.delete(id);
      },
    },
    appBridge: {},
    beforeDeleteSession: async () => {
      calls.push('guard-start');
      await guardReady;
      calls.push('guard-settled');
      return {
        ok: true,
        release: () => calls.push('guard-release'),
      };
    },
  });
  await Promise.resolve();
  assert.deepEqual(calls, ['guard-start']);
  releaseGuard();
  const result = await pending;
  assert.equal(result.deleted, true);
  assert.deepEqual(calls, [
    'guard-start',
    'guard-settled',
    'delete-session',
    'remove-contact',
    'guard-release',
  ]);
  console.log('ok - removeSessionCore waits for session work and holds the close guard through deletion');
}

{
  let mutated = false;
  const result = await removeSessionCore({
    sessionId: 'room-timeout',
    chatStore: {
      listSessions: () => ['room-timeout'],
      delete: () => { mutated = true; },
    },
    contactsStore: {
      getContact: () => ({ id: 'room-timeout' }),
      removeContact: () => { mutated = true; },
    },
    beforeDeleteSession: async () => ({
      ok: false,
      reason: 'session_async_work_timeout',
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'session_async_work_timeout');
  assert.equal(mutated, false);
  console.log('ok - removeSessionCore fails closed when session work cannot settle');
}

{
  const calls = [];
  const result = await removeSessionCore({
    sessionId: 'room-delete-fails',
    chatStore: {
      listSessions: () => ['room-delete-fails'],
      getSessionSettings: () => ({}),
      delete: () => { throw new Error('storage unavailable'); },
    },
    contactsStore: {
      getContact: () => ({ id: 'room-delete-fails' }),
      removeContact: () => calls.push('remove-contact'),
    },
    appBridge: {},
    beforeDeleteSession: async () => ({
      ok: true,
      release: () => calls.push('guard-release'),
    }),
    logger: { warn() {} },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'session_delete_failed');
  assert.deepEqual(calls, ['guard-release']);
  console.log('ok - removeSessionCore releases its held close guard when storage deletion fails');
}

{
  const memoryStorage = new Map();
  globalThis.localStorage = {
    getItem: key => memoryStorage.get(String(key)) ?? null,
    setItem: (key, value) => memoryStorage.set(String(key), String(value)),
    removeItem: key => memoryStorage.delete(String(key)),
  };
  globalThis.document = globalThis.document || { body: { dataset: {} } };
  globalThis.window = globalThis;
  const { ChatStore } = await import('../../src/scripts/storage/chat-store.js');
  const store = new ChatStore({ scopeId: 'deleted-session-read-test' });
  await store.fullyReady;
  store.state = { currentId: '', globalVariables: {}, sessions: {} };
  store.currentId = '';
  const sessionId = 'deleted-room';

  assert.equal(store.getLastReadMessageId(sessionId), '');
  assert.equal(store.getFirstUnreadMessageId(sessionId), '');
  assert.equal(store.getUnreadCount(sessionId), 0);
  assert.deepEqual(store.getPendingMessages(sessionId), []);
  assert.equal(store.getInitialVariable('missing', sessionId), undefined);
  assert.deepEqual(store.listInitialVariables(sessionId), {});
  assert.deepEqual(store.listVariables(sessionId), {});
  assert.equal(store.getVariableSchema('missing', sessionId), null);
  assert.deepEqual(store.listVariableSchemas(sessionId), {});
  assert.deepEqual(store.listVariableRules(sessionId), []);
  assert.equal(store.getStageSchema(sessionId), null);
  assert.equal(store.hasSession(sessionId), false);
  console.log('ok - read-only ChatStore getters do not recreate a deleted session');
}

console.log('session-delete-runtime-utils-tests passed');
