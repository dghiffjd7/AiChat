import assert from 'node:assert/strict';

import {
  createRegexStoreRuntimeAdapter,
  getRegexLocalSet,
  getRegexSession,
  listRegexLocalSets,
  removeRegexLocalSet,
  upsertRegexLocalSet,
  waitForRegexStoreReady,
} from '../../src/scripts/ui/regex-store-runtime-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('regex store helpers prefer bridge contract methods', async () => {
  const calls = [];
  const bridge = {
    waitForRegexStoreReady: async () => true,
    getRegexSession: id => ({ id, enabled: true }),
    listRegexLocalSets: () => [{ id: 'set-1' }],
    getRegexLocalSet: id => ({ id, name: 'Set' }),
    upsertRegexLocalSet: async set => {
      calls.push(['upsert', set]);
      return 'set-2';
    },
    removeRegexLocalSet: async id => {
      calls.push(['remove', id]);
      return true;
    },
  };
  assert.equal(await waitForRegexStoreReady(bridge), true);
  assert.deepEqual(getRegexSession(bridge, 's1'), { id: 's1', enabled: true });
  assert.deepEqual(listRegexLocalSets(bridge), [{ id: 'set-1' }]);
  assert.deepEqual(getRegexLocalSet(bridge, 'set-1'), { id: 'set-1', name: 'Set' });
  assert.equal(await upsertRegexLocalSet(bridge, { name: 'New' }), 'set-2');
  assert.equal(await removeRegexLocalSet(bridge, 'set-1'), true);
  assert.deepEqual(calls, [
    ['upsert', { name: 'New' }],
    ['remove', 'set-1'],
  ]);
});

test('regex adapter keeps legacy store-compatible surface', async () => {
  const calls = [];
  const store = {
    ready: Promise.resolve('ready'),
    getSession: id => ({ id }),
    listLocalSets: () => [{ id: 'set-1' }],
    getLocalSet: id => ({ id }),
    upsertLocalSet: async set => {
      calls.push(['upsert', set]);
      return 'set-2';
    },
    removeLocalSet: async id => {
      calls.push(['remove', id]);
      return true;
    },
  };
  const adapter = createRegexStoreRuntimeAdapter({ regex: store });
  assert.equal(await adapter.ready, 'ready');
  assert.deepEqual(adapter.getSession('s1'), { id: 's1' });
  assert.deepEqual(adapter.listLocalSets(), [{ id: 'set-1' }]);
  assert.deepEqual(adapter.getLocalSet('set-1'), { id: 'set-1' });
  assert.equal(await adapter.upsertLocalSet({ name: 'New' }), 'set-2');
  assert.equal(await adapter.removeLocalSet('set-1'), true);
  assert.deepEqual(calls, [
    ['upsert', { name: 'New' }],
    ['remove', 'set-1'],
  ]);
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
