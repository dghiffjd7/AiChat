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

console.log('session-delete-runtime-utils-tests passed');
