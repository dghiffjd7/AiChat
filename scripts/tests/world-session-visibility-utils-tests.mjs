import assert from 'node:assert/strict';

import { resolveVisibleSessionWorldIds } from '../../src/scripts/ui/world-session-visibility-utils.js';

const normalizeWorldIds = value => (
  Array.isArray(value)
    ? value.map(item => String(item || '').trim()).filter(Boolean)
    : [String(value || '').trim()].filter(Boolean)
);

{
  const worldSessionMap = {
    'chat:a': ['private-a'],
    'chat:b': ['private-b', 'shared'],
    'group:g': ['group-direct-must-not-apply'],
    'rp:persona-a': ['writing-only'],
  };

  assert.deepEqual(resolveVisibleSessionWorldIds({
    uiMode: 'chat',
    sessionId: 'chat:a',
    worldSessionMap,
    normalizeWorldIds,
  }), ['private-a']);

  assert.deepEqual(resolveVisibleSessionWorldIds({
    uiMode: 'chat',
    sessionId: 'group:g',
    isGroupChat: true,
    groupMemberIds: ['chat:a', 'chat:b'],
    worldSessionMap,
    normalizeWorldIds,
  }), ['private-a', 'private-b', 'shared']);

  assert.deepEqual(resolveVisibleSessionWorldIds({
    uiMode: 'rp',
    sessionId: 'rp:persona-a',
    worldSessionMap,
    normalizeWorldIds,
  }), ['writing-only']);

  assert.deepEqual(resolveVisibleSessionWorldIds({
    uiMode: 'chat',
    sessionId: 'chat:a',
    worldSessionMap,
    normalizeWorldIds,
  }), ['private-a'], '创意写作专属世界书不得泄漏到普通私聊');
  console.log('ok - session world visibility isolates private, group and RP-only bindings');
}

console.log('world-session-visibility-utils-tests passed');
