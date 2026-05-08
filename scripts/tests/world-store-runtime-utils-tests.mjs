import assert from 'node:assert/strict';

import {
  hasStoredWorldInfo,
  listWorldIds,
  loadStoredWorldInfo,
  waitForWorldStoreReady,
} from '../../src/scripts/ui/world-store-runtime-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('world store helpers prefer bridge contract methods', async () => {
  const calls = [];
  const bridge = {
    waitForWorldStoreReady: async () => {
      calls.push('ready');
      return true;
    },
    loadStoredWorldInfo: id => ({ id, source: 'contract' }),
    hasStoredWorldInfo: id => id === 'world-1',
    listWorlds: async () => ['world-1'],
  };
  assert.equal(await waitForWorldStoreReady(bridge), true);
  assert.deepEqual(loadStoredWorldInfo(bridge, 'world-1'), { id: 'world-1', source: 'contract' });
  assert.equal(hasStoredWorldInfo(bridge, 'world-1'), true);
  assert.deepEqual(await listWorldIds(bridge), ['world-1']);
  assert.deepEqual(calls, ['ready']);
});

test('world store helpers keep legacy worldStore fallback behavior', async () => {
  let ready = false;
  const bridge = {
    worldStore: {
      ready: Promise.resolve().then(() => {
        ready = true;
      }),
      load: id => (id === 'world-1' ? { id, source: 'fallback' } : null),
      list: () => ['world-1', 'world-2'],
    },
  };
  await waitForWorldStoreReady(bridge);
  assert.equal(ready, true);
  assert.deepEqual(loadStoredWorldInfo(bridge, 'world-1'), { id: 'world-1', source: 'fallback' });
  assert.equal(hasStoredWorldInfo(bridge, 'world-1'), true);
  assert.equal(hasStoredWorldInfo(bridge, 'missing'), false);
  assert.deepEqual(await listWorldIds(bridge), ['world-1', 'world-2']);
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
