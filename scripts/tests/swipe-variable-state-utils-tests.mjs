import assert from 'node:assert/strict';

import {
  applySwipeBranchVariableState,
  attachAssistantVariableStateToMeta,
  captureAssistantVariableState,
  persistSwipeBranchVariableState,
} from '../../src/scripts/ui/chat/swipe-variable-state-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('captureAssistantVariableState builds snapshot + clones update entry', async () => {
  const state = await captureAssistantVariableState({
    sessionId: 's1',
    buildSnapshot: async () => ({ scope: 'session', variables: { hp: 10 } }),
    getVariableUpdateEntry: () => ({ changed: { hp: 10 } }),
    cloneSnapshot: v => JSON.parse(JSON.stringify(v)),
    cloneEntry: v => JSON.parse(JSON.stringify(v)),
  });
  assert.deepEqual(state.variableSnapshot, { scope: 'session', variables: { hp: 10 } });
  assert.deepEqual(state.variableUpdateEntry, { changed: { hp: 10 } });
});

test('captureAssistantVariableState returns null when no snapshot', async () => {
  assert.equal(await captureAssistantVariableState({ buildSnapshot: async () => null }), null);
  assert.equal(await captureAssistantVariableState({ buildSnapshot: null }), null);
});

test('attachAssistantVariableStateToMeta writes meta.variableSnapshot only when present', () => {
  const meta = { renderRich: true };
  attachAssistantVariableStateToMeta({ meta, variableState: { variableSnapshot: { variables: { a: 1 } }, variableUpdateEntry: { x: 1 } } });
  assert.deepEqual(meta.variableSnapshot, { variables: { a: 1 } });
  assert.deepEqual(meta.variableUpdateEntry, { x: 1 });
  const meta2 = { renderRich: true };
  attachAssistantVariableStateToMeta({ meta: meta2, variableState: null });
  assert.equal(meta2.variableSnapshot, undefined);
});

test('persistSwipeBranchVariableState writes snapshot onto the target branch (skips draft)', async () => {
  const branches = [{ swipeIndex: 0 }, { swipeIndex: 1, draft: true }];
  const ok = await persistSwipeBranchVariableState({
    branches, index: 0, sessionId: 's1',
    buildSnapshot: async () => ({ variables: { hp: 3 } }),
    getVariableUpdateEntry: () => ({ set: 'hp' }),
    cloneEntry: v => v,
  });
  assert.equal(ok, true);
  assert.deepEqual(branches[0].variableSnapshot, { variables: { hp: 3 } });
  assert.deepEqual(branches[0].variableUpdateEntry, { set: 'hp' });
  // draft 分支不写
  const draftSkip = await persistSwipeBranchVariableState({ branches, index: 1, sessionId: 's1', buildSnapshot: async () => ({ variables: {} }) });
  assert.equal(draftSkip, false);
  assert.equal(branches[1].variableSnapshot, undefined);
});

test('applySwipeBranchVariableState restores branch snapshot to session', async () => {
  const applied = [];
  const entries = [];
  const ok = await applySwipeBranchVariableState({
    sessionId: 's1',
    branch: { variableSnapshot: { variables: { hp: 7 } }, variableUpdateEntry: { e: 1 } },
    applySnapshot: async (sid, snap) => { applied.push([sid, snap]); return true; },
    setVariableUpdateEntry: (sid, entry) => entries.push([sid, entry]),
    cloneEntry: v => v,
  });
  assert.equal(ok, true);
  assert.deepEqual(applied, [['s1', { variables: { hp: 7 } }]]);
  assert.deepEqual(entries, [['s1', { e: 1 }]]);
  // 无快照 → 不 apply
  assert.equal(await applySwipeBranchVariableState({ branch: {}, applySnapshot: async () => true }), false);
});

let failed = 0;
for (const t of tests) {
  try { await t.fn(); console.log(`ok - ${t.name}`); }
  catch (err) { failed += 1; console.error(`not ok - ${t.name}`); console.error(err); }
}
if (failed > 0) process.exit(1);
