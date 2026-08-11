import assert from 'node:assert/strict';

import {
  createPresetStoreRuntimeAdapter,
  getPresetStore,
} from '../../src/scripts/ui/preset-store-runtime-utils.js';

{
  const presetStore = { id: 'preset-contract' };
  const bridge = {
    presets: { id: 'preset-field' },
    getPresetStore: () => presetStore,
  };
  assert.equal(getPresetStore(bridge), presetStore);
  assert.equal(createPresetStoreRuntimeAdapter(bridge), presetStore);
  console.log('ok - preset store runtime adapter prefers explicit contract getter');
}

{
  const presetStore = { id: 'preset-field' };
  const bridge = { presets: presetStore };
  assert.equal(getPresetStore(bridge), presetStore);
  console.log('ok - preset store runtime adapter keeps legacy field fallback');
}

{
  const previousWindow = globalThis.window;
  const presetStore = { id: 'preset-window' };
  try {
    globalThis.window = {
      appBridge: {
        getPresetStore: () => presetStore,
      },
    };
    assert.equal(getPresetStore(), presetStore);
  } finally {
    if (typeof previousWindow === 'undefined') {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
  console.log('ok - preset store runtime adapter resolves default window bridge');
}

{
  assert.equal(getPresetStore(null), null);
  assert.equal(createPresetStoreRuntimeAdapter(null), null);
  console.log('ok - preset store runtime adapter tolerates missing bridge');
}

{
  // setActive 对不存在的预设 ID 必须显式失败（返回 null），不能静默 no-op
  const previousWindow = globalThis.window;
  const previousLocalStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    globalThis.window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
      __TAURI__: undefined,
    };
    const { PresetStore } = await import('../../src/scripts/storage/preset-store.js');
    const store = new PresetStore();
    await store.ready;
    const missing = await store.setActive('openai', 'preset-does-not-exist');
    assert.equal(missing, null, 'unknown preset id must return null');
    const created = await store.upsert('openai', { name: '存在的预设', data: { name: '存在的预设' } });
    const switched = await store.setActive('openai', created);
    assert.equal(Boolean(switched), true, 'valid preset id must switch');
    assert.equal(store.getActiveId('openai'), created);
    await store.upsert('openai', {
      id: created,
      name: '存在的预设',
      data: {
        ...store.getActive('openai'),
        request_reasoning: true,
        reasoning_effort: 'ultra_low',
      },
    });
    assert.equal(store.getActive('openai').reasoning_effort, 'ultra_low');
    console.log('ok - preset store setActive fails explicitly on unknown id and switches on valid id');
  } finally {
    globalThis.window = previousWindow;
    globalThis.localStorage = previousLocalStorage;
  }
}

{
  const previousTauri = globalThis.__TAURI__;
  const previousFetch = globalThis.fetch;
  const previousWindow = globalThis.window;
  const previousLocalStorage = globalThis.localStorage;
  const saved = [];
  const itemKeys = {
    first: 'prompt_preset_store_v2_item_context_15976ig_first',
    second: 'prompt_preset_store_v2_item_context_131lkwu_second',
  };
  const itemData = {
    first: { name: '第一份', story_string: 'first' },
    second: { name: '第二份', story_string: 'second' },
  };
  const index = {
    version: 2,
    active: { context: 'first' },
    enabled: { context: true },
    bindings: {},
    items: {
      sysprompt: {},
      context: {
        first: { key: itemKeys.first, name: '第一份', updatedAt: 1 },
        second: { key: itemKeys.second, name: '第二份', updatedAt: 1 },
      },
      instruct: {},
      openai: {},
      reasoning: {},
    },
    savedAt: 1,
  };
  try {
    globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    globalThis.window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    };
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ types: {} }) });
    globalThis.__TAURI__ = {
      core: {
        invoke: async (command, args = {}) => {
          if (command === 'load_kv') {
            if (args.name === 'prompt_preset_store_v2_index') return structuredClone(index);
            if (args.name === itemKeys.first) {
              return { version: 2, type: 'context', id: 'first', data: structuredClone(itemData.first) };
            }
            if (args.name === itemKeys.second) {
              return { version: 2, type: 'context', id: 'second', data: structuredClone(itemData.second) };
            }
            return null;
          }
          if (command === 'save_kv') {
            saved.push({ name: args.name, data: structuredClone(args.data) });
            return true;
          }
          throw new Error(`unexpected command: ${command}`);
        },
      },
    };

    const { PresetStore } = await import('../../src/scripts/storage/preset-store.js');
    const store = new PresetStore();
    await store.ready;
    saved.length = 0;

    await store.upsertMany([
      { storeType: 'context', presetId: 'first', name: '第一份', data: itemData.first },
      { storeType: 'context', presetId: 'second', name: '第二份', data: { ...itemData.second, story_string: 'changed' } },
    ]);

    assert.deepEqual(
      saved.map(call => call.name),
      [itemKeys.second, 'prompt_preset_store_v2_index'],
      'one batch should write only changed item shards plus one index',
    );
    assert.equal(store.getActive('context').story_string, 'first');
    assert.equal(store.list('context').find(item => item.id === 'second')?.story_string, 'changed');
    console.log('ok - preset store batches edits and skips unchanged loaded shards');
  } finally {
    if (typeof previousTauri === 'undefined') delete globalThis.__TAURI__;
    else globalThis.__TAURI__ = previousTauri;
    globalThis.fetch = previousFetch;
    globalThis.window = previousWindow;
    globalThis.localStorage = previousLocalStorage;
  }
}
