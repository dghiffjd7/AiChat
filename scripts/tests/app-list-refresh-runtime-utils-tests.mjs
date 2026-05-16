import assert from 'node:assert/strict';

import {
  createChatAndContactsRefreshRuntime,
  refreshChatAndContactsListNow,
} from '../../src/scripts/ui/app-list-refresh-runtime-utils.js';

{
  const calls = [];
  const ok = refreshChatAndContactsListNow({
    chatScopeId: 'scope-a',
    contactsScopeId: 'scope-a',
    listSessions: () => ['chat:1', 'rp:1', 'chat:2'],
    isRpSessionId: (sessionId) => sessionId.startsWith('rp:'),
    ensureContactsFromSessions: (sessions, options) => calls.push(['ensure', sessions, options]),
    defaultAvatar: 'avatar-default',
    renderChatList: () => calls.push(['chat-list']),
    renderGroupsList: () => calls.push(['groups']),
    renderContactsUngrouped: () => calls.push(['contacts']),
    contactsSearchTerm: 'alice',
    applyContactsSearchFilter: () => calls.push(['filter']),
    updateChatContentSearchVisibility: () => calls.push(['search-visibility']),
  });

  assert.equal(ok, true);
  assert.deepEqual(calls, [
    ['ensure', ['chat:1', 'chat:2'], { defaultAvatar: 'avatar-default', includeGroups: false }],
    ['chat-list'],
    ['groups'],
    ['contacts'],
    ['filter'],
    ['search-visibility'],
  ]);
  console.log('ok - refreshChatAndContactsListNow renders filtered social sessions and reapplies search state');
}

{
  const calls = [];
  const ok = refreshChatAndContactsListNow({
    chatScopeId: 'scope-a',
    contactsScopeId: 'scope-a',
    listSessions: () => ['empty-room', 'active-room', 'rp:1'],
    isRpSessionId: (sessionId) => sessionId.startsWith('rp:'),
    shouldSyncSessionToContacts: (sessionId) => sessionId === 'active-room',
    ensureContactsFromSessions: (sessions, options) => calls.push(['ensure', sessions, options]),
    renderChatList: () => calls.push(['chat-list']),
    renderGroupsList: () => calls.push(['groups']),
    renderContactsUngrouped: () => calls.push(['contacts']),
  });

  assert.equal(ok, true);
  assert.deepEqual(calls[0], ['ensure', ['active-room'], { defaultAvatar: '', includeGroups: false }]);
  console.log('ok - refreshChatAndContactsListNow avoids auto-creating contacts for empty sessions');
}

{
  const calls = [];
  const ok = refreshChatAndContactsListNow({
    chatScopeId: 'scope-a',
    contactsScopeId: 'scope-b',
    logger: { debug: (...args) => calls.push(args) },
  });
  assert.equal(ok, false);
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /scope mismatch/);
  console.log('ok - refreshChatAndContactsListNow skips rendering when chat and contacts scopes diverge');
}

{
  const calls = [];
  const scheduled = [];
  const canceled = [];
  const runtime = createChatAndContactsRefreshRuntime({
    refreshNow: () => calls.push('refresh'),
    requestAnimationFrameFn: (runner) => {
      scheduled.push(runner);
      return 'raf-1';
    },
    cancelAnimationFrameFn: (handle) => canceled.push(handle),
  });

  const handle = runtime.refresh();
  const duplicate = runtime.refresh();
  assert.equal(handle, 'raf-1');
  assert.equal(duplicate, undefined);
  assert.equal(calls.length, 0);
  scheduled.shift()();
  assert.deepEqual(calls, ['refresh']);

  runtime.refresh();
  runtime.refresh({ immediate: true });
  assert.deepEqual(canceled, ['raf-1']);
  assert.deepEqual(calls, ['refresh', 'refresh']);
  console.log('ok - createChatAndContactsRefreshRuntime coalesces queued refreshes and flushes immediately on demand');
}

{
  const calls = [];
  const timers = [];
  const runtime = createChatAndContactsRefreshRuntime({
    refreshNow: () => calls.push('refresh'),
    setTimeoutFn: (runner, delay) => {
      timers.push([runner, delay]);
      return 'timeout-1';
    },
    clearTimeoutFn: (handle) => calls.push(['clear-timeout', handle]),
  });

  const handle = runtime.refresh();
  assert.equal(handle, 'timeout-1');
  assert.deepEqual(timers[0][1], 16);
  timers[0][0]();
  assert.deepEqual(calls, ['refresh']);
  console.log('ok - createChatAndContactsRefreshRuntime falls back to timeout scheduling without RAF');
}
