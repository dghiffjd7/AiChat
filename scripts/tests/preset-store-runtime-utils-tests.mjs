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
