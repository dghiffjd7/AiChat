import assert from 'node:assert/strict';

import {
  buildAssistantTimelineForMemoryRepair,
  buildMemoryTimelineAutoRepairStateKey,
  buildMemoryTimelineRepairPlan,
  isMemoryTimelineAutoRepairDone,
  markMemoryTimelineAutoRepairDone,
  matchMemoryTimelineRowToAssistant,
  normalizeMemoryTimelineAutoRepairState,
} from '../../src/scripts/memory/memory-timeline-repair-utils.js';

{
  const key = buildMemoryTimelineAutoRepairStateKey({
    scopeId: 'default',
    sessionId: 'group:1',
    version: 'v-test',
  });
  assert.equal(key, 'default::group:1::v-test');
  const state = markMemoryTimelineAutoRepairDone({
    state: { entries: { old: { status: 'done' } } },
    key,
    version: 'v-test',
    changed: 2,
    checked: 5,
    now: 123,
  });
  assert.equal(isMemoryTimelineAutoRepairDone(state, key), true);
  assert.deepEqual(normalizeMemoryTimelineAutoRepairState(state)[key], {
    status: 'done',
    at: 123,
    changed: 2,
    checked: 5,
    version: 'v-test',
  });
  console.log('ok - memory timeline auto repair state keys persist versioned session completion');
}

{
  const timeline = buildAssistantTimelineForMemoryRepair({
    messages: [
      { id: 'u1', role: 'user', timestamp: 1000 },
      { id: 'a1', role: 'assistant', timestamp: 1100 },
      { id: 'a2', role: 'assistant', status: 'pending', timestamp: 1200 },
      { id: 'a3', role: 'assistant', meta: { isGreeting: true }, timestamp: 1300 },
      { id: 'a4', role: 'assistant', timestamp: 1400 },
      { id: 'u2', role: 'user', timestamp: 1500 },
      { id: 'a5', role: 'assistant', timestamp: 1600 },
    ],
  });
  assert.deepEqual(timeline.map(item => [item.id, item.floor, item.assistantFloor]), [
    ['a1', 1, 1],
    ['a4', 1, 2],
    ['a5', 2, 3],
  ]);
  console.log('ok - buildAssistantTimelineForMemoryRepair maps assistants to user turns');
}

{
  const match = matchMemoryTimelineRowToAssistant({
    row: { id: 'mem_1770000002300_0', row_data: { time: '第99轮' } },
    assistantTimeline: [
      { id: 'a1', floor: 1, timestamp: 1770000001000 },
      { id: 'a2', floor: 2, timestamp: 1770000002000 },
    ],
  });
  assert.equal(match.id, 'a2');
  assert.equal(match.floor, 2);
  console.log('ok - matchMemoryTimelineRowToAssistant picks nearest previous assistant by row id timestamp');
}

{
  const plan = buildMemoryTimelineRepairPlan({
    tables: [
      { id: 'group_summary', scope: 'group' },
      { id: 'profile', scope: 'contact' },
    ],
    messages: [
      { id: '1770000000900-u', role: 'user', timestamp: 1770000000900 },
      { id: '1770000001000-a', role: 'assistant', timestamp: 1770000001000 },
      { id: '1770000001900-u', role: 'user', timestamp: 1770000001900 },
      { id: '1770000002000-b', role: 'assistant', timestamp: 1770000002000 },
      { id: '1770000002900-u', role: 'user', timestamp: 1770000002900 },
      { id: '1770000003000-c', role: 'assistant', timestamp: 1770000003000 },
    ],
    rows: [
      {
        id: 'mem_1770000003050_0',
        table_id: 'group_summary',
        row_data: { summary: 'new', time: '第640轮' },
        sort_order: 640,
      },
      {
        id: 'mem_1770000002050_0',
        table_id: 'group_summary',
        row_data: { summary: 'ok', time: '第2轮' },
        sort_order: 2,
      },
      {
        id: 'mem_1770000003060_0',
        table_id: 'profile',
        row_data: { name: 'ignored' },
      },
    ],
  });
  assert.equal(plan.checked, 2);
  assert.equal(plan.assistantCount, 3);
  assert.equal(plan.turnCount, 3);
  assert.equal(plan.repairable.length, 1);
  assert.deepEqual(plan.repairable[0], {
    rowId: 'mem_1770000003050_0',
    tableId: 'group_summary',
    currentRound: 640,
    currentSortOrder: 640,
    expectedRound: 3,
    assistantMessageId: '1770000003000-c',
    distanceMs: 50,
    rowTimestamp: 1770000003050,
    rowData: { summary: 'new', time: '第3轮' },
    sortOrder: 3,
  });
  assert.equal(plan.unrepairable.length, 0);
  console.log('ok - buildMemoryTimelineRepairPlan repairs mismatched timeline rows only');
}

{
  const plan = buildMemoryTimelineRepairPlan({
    tables: [{ id: 'group_summary', scope: 'group' }],
    messages: [
      { id: '1770000000000-u1', role: 'user', timestamp: 1770000000000 },
      { id: '1770000001000-a1', role: 'assistant', timestamp: 1770000001000 },
      { id: '1770000002000-u2', role: 'user', timestamp: 1770000002000 },
      { id: '1770000008000-a2', role: 'assistant', timestamp: 1770000008000 },
    ],
    rows: [
      {
        id: 'mem_1770000003000_0',
        table_id: 'group_summary',
        row_data: { summary: 'new', time: '第2轮' },
        sort_order: 2,
      },
    ],
  });
  assert.equal(plan.checked, 1);
  assert.equal(plan.repairable.length, 0);
  assert.equal(plan.unrepairable.length, 0);
  console.log('ok - buildMemoryTimelineRepairPlan trusts canonical round when timestamp is slightly early');
}
