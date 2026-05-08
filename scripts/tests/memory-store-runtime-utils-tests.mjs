import assert from 'node:assert/strict';

import {
  createMemoryStoreRuntimeAdapter,
  getMemoryTableStore,
  getMemoryTemplateStore,
} from '../../src/scripts/ui/memory-store-runtime-utils.js';

{
  const memoryTableStore = { id: 'table-contract' };
  const memoryTemplateStore = { id: 'template-contract' };
  const bridge = {
    memoryTableStore: { id: 'table-field' },
    memoryTemplateStore: { id: 'template-field' },
    getMemoryTableStore: () => memoryTableStore,
    getMemoryTemplateStore: () => memoryTemplateStore,
  };
  assert.equal(getMemoryTableStore(bridge), memoryTableStore);
  assert.equal(getMemoryTemplateStore(bridge), memoryTemplateStore);
  assert.deepEqual(createMemoryStoreRuntimeAdapter(bridge), {
    memoryTableStore,
    memoryTemplateStore,
  });
  console.log('ok - memory store runtime adapter prefers explicit contract getters');
}

{
  const memoryTableStore = { id: 'table-field' };
  const memoryTemplateStore = { id: 'template-field' };
  const bridge = {
    memoryTableStore,
    memoryTemplateStore,
  };
  assert.equal(getMemoryTableStore(bridge), memoryTableStore);
  assert.equal(getMemoryTemplateStore(bridge), memoryTemplateStore);
  console.log('ok - memory store runtime adapter keeps legacy field fallback');
}

{
  const previousWindow = globalThis.window;
  const memoryTableStore = { id: 'table-window' };
  const memoryTemplateStore = { id: 'template-window' };
  try {
    globalThis.window = {
      appBridge: {
        getMemoryTableStore: () => memoryTableStore,
        getMemoryTemplateStore: () => memoryTemplateStore,
      },
    };
    assert.equal(getMemoryTableStore(), memoryTableStore);
    assert.equal(getMemoryTemplateStore(), memoryTemplateStore);
  } finally {
    if (typeof previousWindow === 'undefined') {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
  console.log('ok - memory store runtime adapter resolves default window bridge');
}

{
  assert.equal(getMemoryTableStore(null), null);
  assert.equal(getMemoryTemplateStore(null), null);
  assert.deepEqual(createMemoryStoreRuntimeAdapter(null), {
    memoryTableStore: null,
    memoryTemplateStore: null,
  });
  console.log('ok - memory store runtime adapter tolerates missing bridge');
}
