import assert from 'node:assert/strict';

const makeLocalStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
  };
};

const installGlobals = ({ invoke, localStorage = makeLocalStorage(), fetch } = {}) => {
  globalThis.localStorage = localStorage;
  globalThis.__TAURI_INTERNALS__ = { invoke };
  if (fetch) globalThis.fetch = fetch;
};

const makePresetDefaultsResponse = () => ({
  ok: true,
  json: async () => ({
    types: {
      sysprompt: { 'Neutral - Chat': { name: 'Neutral - Chat', prompts: [] } },
      context: { Default: { name: 'Default', prompts: [] } },
      instruct: { ChatML: { name: 'ChatML', prompts: [] } },
      openai: { Default: { name: 'Default' } },
      reasoning: { DeepSeek: { name: 'DeepSeek' } },
    },
  }),
});

{
  const calls = [];
  installGlobals({
    fetch: async () => makePresetDefaultsResponse(),
    invoke: async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') return { _tooLarge: true, size: 11 * 1024 * 1024 };
      if (cmd === 'save_kv') throw new Error('save_kv should not be called for too-large preset store during load');
      return null;
    },
  });

  const { PresetStore } = await import('../../src/scripts/storage/preset-store.js');
  const store = new PresetStore();
  await store.ready;

  assert.equal(calls.some(([cmd]) => cmd === 'save_kv'), false);
  assert.equal(store.getState().active.sysprompt, 'Neutral - Chat');
  console.log('ok - preset store does not overwrite disk when load_kv reports tooLarge');
}

{
  const calls = [];
  installGlobals({
    fetch: async () => makePresetDefaultsResponse(),
    invoke: async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') return {};
      if (cmd === 'save_kv') return true;
      return null;
    },
  });

  const { PresetStore } = await import('../../src/scripts/storage/preset-store.js');
  const store = new PresetStore();
  await store.ready;

  const saveNames = calls
    .filter(([cmd]) => cmd === 'save_kv')
    .map(([, args]) => args.name);
  assert.equal(saveNames.includes('prompt_preset_store_v1'), false);
  assert.equal(saveNames.includes('prompt_preset_store_v2_index'), true);
  assert.equal(saveNames.some(name => String(name).startsWith('prompt_preset_store_v2_item_sysprompt_')), true);
  console.log('ok - preset store persists sharded v2 records instead of legacy full snapshot');
}

{
  const calls = [];
  const itemKey = 'prompt_preset_store_v2_item_context_custom';
  const disk = {
    prompt_preset_store_v2_index: {
      version: 2,
      active: { context: 'ctx-custom' },
      enabled: { context: true },
      bindings: {},
      items: {
        context: {
          'ctx-custom': { key: itemKey, name: 'Custom Context' },
        },
      },
    },
    [itemKey]: {
      version: 2,
      type: 'context',
      id: 'ctx-custom',
      data: { name: 'Custom Context', prompts: [] },
    },
  };
  installGlobals({
    fetch: async () => makePresetDefaultsResponse(),
    invoke: async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') return disk[args.name] || {};
      if (cmd === 'save_kv') return true;
      return null;
    },
  });

  const { PresetStore } = await import('../../src/scripts/storage/preset-store.js');
  const store = new PresetStore();
  await store.ready;

  const legacyLoads = calls.filter(([cmd, args]) => cmd === 'load_kv' && args.name === 'prompt_preset_store_v1');
  assert.equal(legacyLoads.length, 0);
  assert.equal(store.getActive('context').name, 'Custom Context');
  console.log('ok - preset store loads sharded v2 index before legacy v1 store');
}

{
  const calls = [];
  installGlobals({
    invoke: async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') return { _tooLarge: true, size: 11 * 1024 * 1024 };
      if (cmd === 'save_kv') throw new Error('save_kv should not be called for too-large regex store during load');
      return null;
    },
  });

  const { RegexStore } = await import('../../src/scripts/storage/regex-store.js');
  const store = new RegexStore();
  await store.ready;

  assert.equal(calls.some(([cmd]) => cmd === 'save_kv'), false);
  assert.deepEqual(store.getState().local.order, []);
  console.log('ok - regex store does not overwrite disk when load_kv reports tooLarge');
}
