import assert from 'node:assert/strict';

import {
  createRegexStoreRuntimeAdapter,
  getRegexContext,
  getRegexLocalSet,
  getRegexSession,
  listRegexLocalSets,
  removeRegexLocalSet,
  syncPresetRegexBindings,
  syncWorldRegexBindings,
  upsertRegexLocalSet,
  waitForRegexStoreReady,
} from '../../src/scripts/ui/regex-store-runtime-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('regex store helpers prefer bridge contract methods', async () => {
  const calls = [];
  const bridge = {
    waitForRegexStoreReady: async () => true,
    getRegexContext: options => ({ sessionId: options.sessionId }),
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
    syncPresetRegexBindings: async () => {
      calls.push(['sync-preset']);
      return 'preset';
    },
    syncWorldRegexBindings: async () => {
      calls.push(['sync-world']);
      return 'world';
    },
  };
  assert.equal(await waitForRegexStoreReady(bridge), true);
  assert.deepEqual(getRegexContext(bridge, { sessionId: 's1' }), { sessionId: 's1' });
  assert.deepEqual(getRegexSession(bridge, 's1'), { id: 's1', enabled: true });
  assert.deepEqual(listRegexLocalSets(bridge), [{ id: 'set-1' }]);
  assert.deepEqual(getRegexLocalSet(bridge, 'set-1'), { id: 'set-1', name: 'Set' });
  assert.equal(await upsertRegexLocalSet(bridge, { name: 'New' }), 'set-2');
  assert.equal(await removeRegexLocalSet(bridge, 'set-1'), true);
  assert.equal(await syncPresetRegexBindings(bridge), 'preset');
  assert.equal(await syncWorldRegexBindings(bridge), 'world');
  assert.deepEqual(calls, [
    ['upsert', { name: 'New' }],
    ['remove', 'set-1'],
    ['sync-preset'],
    ['sync-world'],
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

test('regex context helper tolerates missing contract', () => {
  assert.deepEqual(getRegexContext({}), {});
});

test('regex sync helpers tolerate missing contract', async () => {
  assert.equal(await syncPresetRegexBindings({}), null);
  assert.equal(await syncWorldRegexBindings({}), null);
});

test('regex store activates selected preset and preserves preset-before-world priority after recovery', async () => {
  const previousLocalStorage = globalThis.localStorage;
  const previousInvoke = globalThis.__TAURI_INVOKE__;
  const kv = new Map();
  const local = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return local.has(key) ? local.get(key) : null;
    },
    setItem(key, value) {
      local.set(key, String(value));
    },
    removeItem(key) {
      local.delete(key);
    },
  };
  globalThis.__TAURI_INVOKE__ = async (cmd, args = {}) => {
    if (cmd === 'load_kv') return kv.get(args.name) || null;
    if (cmd === 'save_kv') {
      kv.set(args.name, JSON.parse(JSON.stringify(args.data)));
      return true;
    }
    throw new Error(`unexpected command: ${cmd}`);
  };

  try {
    const { RegexStore, regex_placement } = await import('../../src/scripts/storage/regex-store.js');
    const store = new RegexStore();
    await store.ready;
    await store.upsertLocalSet({
      name: 'Recovered character regex',
      enabled: true,
      bind: {
        type: 'world',
        worldId: 'world-a',
      },
      rules: [{
        scriptName: 'Expand character panel',
        findRegex: '/lucklyjkop/g',
        replaceString: '<character-panel>',
        placement: [regex_placement.AI_OUTPUT],
      }],
    });
    const id = await store.upsertLocalSet({
      name: 'Shared preset regex',
      enabled: true,
      bind: {
        type: 'preset',
        presetType: 'openai',
        presetIds: ['preset-a', 'preset-b'],
      },
      rules: [{
        scriptName: 'Replace',
        findRegex: '/lucklyjkop/g',
        replaceString: 'cleaned',
        placement: [regex_placement.AI_OUTPUT],
      }],
    });

    const stored = store.getLocalSet(id);
    assert.equal(stored.bind.presetId, 'preset-a');
    assert.deepEqual(stored.bind.presetIds, ['preset-a', 'preset-b']);
    assert.equal(store.computeActiveRules({ activePresets: { openai: 'preset-b' } }).length, 1);
    assert.equal(store.computeActiveRules({ activePresets: { openai: 'preset-c' } }).length, 0);
    const recoveredContext = {
      activePresets: { openai: 'preset-b' },
      worldId: 'world-a',
    };
    assert.deepEqual(
      store.computeActiveRules(recoveredContext).map(rule => rule.scriptName),
      ['Replace', 'Expand character panel'],
    );
    assert.equal(
      store.apply('lucklyjkop', recoveredContext, regex_placement.AI_OUTPUT),
      'cleaned',
    );

    const snakeCaseId = await store.upsertLocalSet({
      name: 'TavernHelper character regex',
      enabled: true,
      bind: { type: 'world', worldId: 'world-helper' },
      rules: [{
        id: 'helper-rule',
        script_name: 'Helper character rule',
        enabled: true,
        find_regex: '/helper/g',
        replace_string: 'normalized',
        trim_strings: ['  exact  '],
        source: { ai_output: true, reasoning: true },
        destination: { display: true, prompt: false },
        run_on_edit: true,
        min_depth: 0,
        max_depth: 2,
      }],
    });
    const snakeCaseRule = store.getLocalSet(snakeCaseId).rules[0];
    assert.equal(snakeCaseRule.scriptName, 'Helper character rule');
    assert.equal(snakeCaseRule.findRegex, '/helper/g');
    assert.equal(snakeCaseRule.replaceString, 'normalized');
    assert.deepEqual(snakeCaseRule.trimStrings, ['  exact  ']);
    assert.deepEqual(snakeCaseRule.placement, [regex_placement.AI_OUTPUT, regex_placement.REASONING]);
    assert.equal(snakeCaseRule.markdownOnly, true);
    assert.equal(snakeCaseRule.runOnEdit, true);
    assert.equal(snakeCaseRule.minDepth, 0);
    assert.equal(snakeCaseRule.maxDepth, 2);

    await store.syncPresetBindings({ openai: 'preset-b' });
    assert.equal(store.getLocalSet(id).enabled, true);
    await store.syncPresetBindings({ openai: 'preset-c' });
    assert.equal(store.getLocalSet(id).enabled, false);
  } finally {
    if (previousInvoke === undefined) delete globalThis.__TAURI_INVOKE__;
    else globalThis.__TAURI_INVOKE__ = previousInvoke;
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
  }
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
