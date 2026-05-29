import assert from 'node:assert/strict';

import {
  applyUpdateVariableCommandsToState,
  buildUpdateVariableCommandsPreview,
  buildVariableStateUpdates,
  collectChangedVariableKeys,
} from '../../src/scripts/ui/chat/update-variable-command-utils.js';
import {
  deleteValueAtPath,
  getValueAtPath,
  resolveExistingVariablePath,
  setValueAtPath,
} from '../../src/scripts/variables/variable-path-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('applyUpdateVariableCommandsToState applies set/add/delete and reports add debug payloads', () => {
  const debugPayloads = [];
  const result = applyUpdateVariableCommandsToState(
    {
      hp: [10, 'number'],
      energy: 5,
      expiresAt: '2026-01-01T00:00:00.000Z',
      removeMe: true,
    },
    [
      { type: 'set', path: ['hp'], value: '12' },
      { type: 'add', path: ['energy'], value: 3 },
      { type: 'add', path: ['expiresAt'], value: 1000 },
      { type: 'delete', path: ['removeMe'] },
    ],
    {
      getAt: (obj, path) => getValueAtPath(obj, path, { allowDirectKey: false }),
      setAt: (obj, path, value, options = {}) => setValueAtPath(obj, path, value, options),
      deleteAt: (obj, path) => deleteValueAtPath(obj, path),
      resolveExistingPath: (obj, path, options = {}) => resolveExistingVariablePath(obj, path, options),
      onAddDebug: payload => debugPayloads.push(payload),
    },
  );

  assert.equal(result.appliedCount, 4);
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(result.root, {
    hp: [12, 'number'],
    energy: 8,
    expiresAt: '2026-01-01T00:00:01.000Z',
  });
  assert.deepEqual(debugPayloads, [
    {
      path: ['energy'],
      resolvedPath: ['energy'],
      current: 5,
      delta: 3,
      next: 8,
    },
    {
      path: ['expiresAt'],
      resolvedPath: ['expiresAt'],
      current: '2026-01-01T00:00:00.000Z',
      delta: 1000,
      next: '2026-01-01T00:00:01.000Z',
    },
  ]);
});

test('applyUpdateVariableCommandsToState handles move/insert/remove and records skipped reasons', () => {
  const result = applyUpdateVariableCommandsToState(
    {
      bag: ['a', { id: 'x' }],
      profile: { name: 'old' },
      source: { value: 7 },
      obj: { a: 1, b: 2 },
    },
    [
      { type: 'insert', path: ['bag'], key: 1, value: 'b' },
      { type: 'remove', path: ['bag'], key: { id: 'x' } },
      { type: 'insert', path: ['profile'], key: null, value: { level: 2 } },
      { type: 'move', from: ['source', 'value'], to: ['target', 'value'] },
      { type: 'remove', path: ['obj'], key: 0 },
      { type: 'remove', path: ['bag'], key: 'missing' },
    ],
    {
      getAt: (obj, path) => getValueAtPath(obj, path, { allowDirectKey: false }),
      setAt: (obj, path, value, options = {}) => setValueAtPath(obj, path, value, options),
      deleteAt: (obj, path) => deleteValueAtPath(obj, path),
      resolveExistingPath: (obj, path, options = {}) => resolveExistingVariablePath(obj, path, options),
    },
  );

  assert.equal(result.appliedCount, 5);
  assert.deepEqual(result.root, {
    bag: ['a', 'b'],
    profile: { name: 'old', level: 2 },
    source: {},
    obj: { b: 2 },
    target: { value: 7 },
  });
  assert.deepEqual(result.skipped, ['remove@bag:remove array item not found']);
});

test('buildVariableStateUpdates and collectChangedVariableKeys summarize root diffs', () => {
  const original = { a: 1, b: 2, c: 3 };
  const root = { a: 1, b: 4, d: 5 };

  assert.deepEqual(
    buildVariableStateUpdates(original, root),
    {
      allKeys: ['a', 'b', 'c', 'd'],
      updates: {
        b: 4,
        c: undefined,
        d: 5,
      },
    },
  );
  assert.deepEqual(collectChangedVariableKeys(original, root, { limit: 12 }), ['b', 'c', 'd']);
});

test('buildUpdateVariableCommandsPreview returns diff without mutating source state', () => {
  const source = {
    hp: [10, 'number'],
    energy: 5,
    removeMe: true,
  };
  const preview = buildUpdateVariableCommandsPreview(
    source,
    [
      { type: 'set', path: ['hp'], value: '12' },
      { type: 'add', path: ['energy'], value: 3 },
      { type: 'delete', path: ['removeMe'] },
      { type: 'set', path: ['missing'], value: 1 },
    ],
    {
      getAt: (obj, path) => getValueAtPath(obj, path, { allowDirectKey: false }),
      setAt: (obj, path, value, options = {}) => setValueAtPath(obj, path, value, options),
      deleteAt: (obj, path) => deleteValueAtPath(obj, path),
      resolveExistingPath: (obj, path, options = {}) => resolveExistingVariablePath(obj, path, options),
    },
  );

  assert.equal(preview.appliedCount, 3);
  assert.deepEqual(preview.skipped, ['set@missing:set path not found']);
  assert.equal(preview.changed, 3);
  assert.equal(preview.invalid, false);
  assert.deepEqual(preview.entries.map(entry => [entry.key, entry.kind]), [
    ['hp', 'update'],
    ['energy', 'update'],
    ['removeMe', 'delete'],
  ]);
  assert.deepEqual(preview.entries[0].before, [10, 'number']);
  assert.deepEqual(preview.entries[0].after, [12, 'number']);
  assert.equal(preview.entries[2].after, undefined);
  assert.deepEqual(preview.rollbackSnapshot, {
    hp: [10, 'number'],
    energy: 5,
    removeMe: true,
  });
  assert.deepEqual(source, {
    hp: [10, 'number'],
    energy: 5,
    removeMe: true,
  });
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
