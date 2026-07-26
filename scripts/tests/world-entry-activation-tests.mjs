import assert from 'node:assert/strict';
import {
  analyzeWorldEntryActivation,
  prepareWorldEntries,
} from '../../src/scripts/utils/world-entry-activation.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('prepareWorldEntries merges local and ref entries with stable source metadata', () => {
  const worlds = {
    ref_world: {
      entries: [
        { id: 'ref_a', group: 'beta, gamma', content: 'ref content' },
      ],
    },
  };
  const data = {
    localEntries: [
      { id: 'local_a', group: ['alpha'], content: 'local content' },
    ],
    refs: [
      { sourceId: 'ref_world', entryId: 'ref_a' },
    ],
  };

  const entries = prepareWorldEntries({
    worldId: 'main_world',
    data,
    loadWorld: (id) => worlds[id] || null,
  });

  assert.equal(entries.length, 2);
  assert.equal(entries[0]._sourceWorldId, 'main_world');
  assert.equal(entries[0]._refWorldId, '');
  assert.deepEqual(entries[0]._groups, ['alpha']);
  assert.equal(entries[1]._sourceWorldId, 'ref_world');
  assert.equal(entries[1]._refWorldId, 'main_world');
  assert.deepEqual(entries[1]._groups, ['beta', 'gamma']);
});

test('analyzeWorldEntryActivation tracks recursive activations with shared logic', () => {
  const baseEntries = prepareWorldEntries({
    worldId: 'world_recursive',
    data: {
      entries: [
        { id: 'direct', key: ['hero'], content: 'dragon trail' },
        { id: 'recursive', key: ['dragon'], content: 'hidden lair' },
      ],
    },
    loadWorld: () => null,
  });

  const activation = analyzeWorldEntryActivation({
    baseEntries,
    matchText: 'hero enters the forest',
    settings: {
      globalRecursiveScan: true,
    },
    targetEntryId: 'recursive',
  });

  assert.deepEqual(
    activation.activeEntries.map((entry) => entry._entryId),
    ['direct', 'recursive'],
  );
  assert.equal(activation.directExplain.passed, false);
  assert.deepEqual(activation.activationMeta.get('recursive'), {
    source: 'recursive',
    recursionStep: 1,
  });
});

test('analyzeWorldEntryActivation keeps before-group ids for filtered entries', () => {
  const baseEntries = prepareWorldEntries({
    worldId: 'world_group',
    data: {
      entries: [
        { id: 'low', key: ['hero'], content: 'low', group: 'same', groupWeight: 1 },
        { id: 'high', key: ['hero'], content: 'high', group: 'same', groupWeight: 2 },
      ],
    },
    loadWorld: () => null,
  });

  const activation = analyzeWorldEntryActivation({
    baseEntries,
    matchText: 'hero arrives',
    settings: {
      globalUseGroupScoring: true,
    },
    targetEntryId: 'low',
  });

  assert.equal(activation.directExplain.passed, true);
  assert.equal(activation.beforeGroupEntryIds.has('low'), true);
  assert.equal(
    activation.activeEntries.some((entry) => entry._entryId === 'low'),
    false,
  );
  assert.deepEqual(
    activation.activeEntries.map((entry) => entry._entryId),
    ['high'],
  );
});

test('analyzeWorldEntryActivation expands history to satisfy minActivations', () => {
  const baseEntries = prepareWorldEntries({
    worldId: 'world_depth',
    data: {
      entries: [
        { id: 'alpha', key: ['alpha'], content: 'A' },
        { id: 'beta', key: ['beta'], content: 'B' },
      ],
    },
    loadWorld: () => null,
  });

  const activation = analyzeWorldEntryActivation({
    baseEntries,
    matchText: '',
    matchContext: {
      userMessage: '',
      history: ['beta'],
      fullHistory: ['alpha', 'beta'],
      personaText: '',
      character: {},
    },
    settings: {
      minActivations: 2,
      maxDepthSetting: 2,
    },
  });

  assert.deepEqual(activation.effectiveMatchContext.history, ['alpha', 'beta']);
  assert.deepEqual(
    activation.activeEntries.map((entry) => entry._entryId),
    ['alpha', 'beta'],
  );
});

test('analyzeWorldEntryActivation matches green-light entries against group member names', () => {
  const baseEntries = prepareWorldEntries({
    worldId: 'world_group_members',
    data: {
      entries: [
        { id: 'member_alice', key: ['Alice'], content: 'member Alice lore' },
        { id: 'member_boris', key: ['Boris'], content: 'member Boris lore' },
      ],
    },
    loadWorld: () => null,
  });

  const activation = analyzeWorldEntryActivation({
    baseEntries,
    matchText: 'hello group',
    matchContext: {
      userMessage: 'hello group',
      history: [],
      fullHistory: [],
      groupMemberNames: ['Alice', 'Cara'],
      personaText: '',
      character: {},
    },
  });

  assert.deepEqual(
    activation.activeEntries.map((entry) => entry._entryId),
    ['member_alice'],
  );
});

test('entry-level variable gate runs before constant and excludes blocked entries from recursion and groups', () => {
  const baseEntries = prepareWorldEntries({
    worldId: 'world_entry_gate',
    data: {
      entries: [
        {
          id: 'blocked_constant',
          constant: true,
          content: 'dragon signal',
          when: { left: 'enabled', op: '==', right: true, rightType: 'boolean' },
          group: 'gate-group',
          groupWeight: 100,
        },
        {
          id: 'allowed_keyword',
          key: ['hero'],
          content: 'safe path',
          group: 'gate-group',
          groupWeight: 1,
        },
        {
          id: 'recursive_from_blocked',
          key: ['dragon'],
          content: 'should stay hidden',
        },
      ],
    },
    loadWorld: () => null,
  });

  const activation = analyzeWorldEntryActivation({
    baseEntries,
    matchText: 'hero arrives',
    settings: {
      globalRecursiveScan: true,
      globalUseGroupScoring: true,
    },
    targetEntryId: 'blocked_constant',
    evaluateEntryWhen: () => ({
      configured: true,
      passed: false,
      explanation: { result: false },
    }),
  });

  assert.equal(activation.directExplain.variableConditionConfigured, true);
  assert.equal(activation.directExplain.variableConditionPassed, false);
  assert.deepEqual(activation.directExplain.reasons, ['被条目级变量条件挡住']);
  assert.deepEqual(
    activation.activeEntries.map(entry => entry._entryId),
    ['allowed_keyword'],
  );
  assert.equal(activation.beforeGroupEntryIds.has('blocked_constant'), false);
  assert.equal(
    activation.activeEntries.some(entry => entry._entryId === 'recursive_from_blocked'),
    false,
  );
});

test('entry-level variable gate stays fail-closed on evaluator crash but surfaces the error', () => {
  const baseEntries = prepareWorldEntries({
    worldId: 'world_entry_gate_crash',
    data: {
      entries: [
        {
          id: 'crash_constant',
          constant: true,
          content: 'spoiler content',
          when: { left: 'enabled', op: '==', right: true, rightType: 'boolean' },
        },
      ],
    },
    loadWorld: () => null,
  });

  const activation = analyzeWorldEntryActivation({
    baseEntries,
    matchText: 'hero arrives',
    settings: {},
    targetEntryId: 'crash_constant',
    evaluateEntryWhen: () => {
      throw new Error('变量存储损坏');
    },
  });

  assert.equal(activation.directExplain.variableConditionPassed, false);
  assert.deepEqual(activation.directExplain.reasons, ['被条目级变量条件挡住']);
  assert.match(
    String(activation.directExplain.variableConditionExplanation || ''),
    /求值出错.*变量存储损坏/,
  );
  assert.equal(
    activation.activeEntries.some(entry => entry._entryId === 'crash_constant'),
    false,
  );
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

if (failed > 0) {
  process.exit(1);
}
