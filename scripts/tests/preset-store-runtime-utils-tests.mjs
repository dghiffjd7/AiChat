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
