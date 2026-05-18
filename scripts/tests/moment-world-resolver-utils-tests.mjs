import assert from 'node:assert/strict';

import {
  buildMomentStructuredMentions,
  limitMomentWorldEntriesByBudget,
  resolveMomentSessionWorldBudgetTokens,
  resolveMomentWorldStrongSources,
} from '../../src/scripts/ui/chat/moment-world-resolver-utils.js';

{
  const mentions = buildMomentStructuredMentions({
    text: '今天和 @小爱 约了 @Room',
    selectedMentions: [
      { id: 'contact:alice', name: 'Alice', type: 'contact' },
      { id: 'contact:stale', name: 'Stale', type: 'contact' },
    ],
    contacts: [
      { id: 'contact:alice', name: 'Alice', aliases: ['小爱'] },
      { id: 'group:room', name: 'Room', isGroup: true },
      { id: 'rp:persona_1', name: '角色房间' },
    ],
  });
  assert.deepEqual(mentions, [
    { id: 'contact:alice', name: 'Alice', type: 'contact' },
    { id: 'group:room', name: 'Room', type: 'group' },
  ]);
  console.log('ok - buildMomentStructuredMentions resolves selected and typed @ targets without stale mentions');
}

{
  const worldIdsBySession = new Map([
    ['contact:alice', ['world:alice']],
    ['contact:bob', ['world:bob']],
    ['group:room', ['world:room']],
    ['contact:empty', []],
  ]);
  const result = resolveMomentWorldStrongSources({
    text: 'Alice 和 Bob 都出现在这条动态里',
    mentions: [{ id: 'group:room', name: 'Room', type: 'group' }],
    contacts: [
      { id: 'contact:alice', name: 'Alice' },
      { id: 'contact:bob', name: 'Bob' },
      { id: 'group:room', name: 'Room', isGroup: true },
      { id: 'contact:empty', name: 'Empty' },
    ],
    targetSessionId: 'contact:bob',
    targetName: 'Bob',
    mode: 'comment',
    maxSources: 3,
    getWorldIdsForSession: sid => worldIdsBySession.get(sid) || [],
  });
  assert.deepEqual(result.selectedSources.map(item => item.sessionId), [
    'group:room',
    'contact:alice',
    'contact:bob',
  ]);
  const bob = result.candidates.find(item => item.sessionId === 'contact:bob');
  assert.ok(bob.reasons.includes('exact_name'));
  assert.ok(bob.reasons.includes('comment_author'));
  console.log('ok - resolveMomentWorldStrongSources prioritizes mentions exact names and comment target worlds');
}

{
  const budget = resolveMomentSessionWorldBudgetTokens(6000);
  assert.equal(budget, 1800);
  assert.equal(resolveMomentSessionWorldBudgetTokens(null), 1600);

  const limited = limitMomentWorldEntriesByBudget([
    { content: 'abcdefgh', _entryId: 'a' },
    { content: 'abcdefgh', _entryId: 'b' },
    { content: 'xx', _entryId: 'c' },
  ], { budgetTokens: 2 });
  assert.deepEqual(limited.entries.map(item => item._entryId), ['a']);
  assert.deepEqual(limited.trimmedEntries.map(item => item._entryId), ['b', 'c']);
  assert.equal(limited.usedTokens, 2);
  assert.equal(limited.overflowed, true);
  console.log('ok - moment session world budget keeps entries within dynamic slice');
}
