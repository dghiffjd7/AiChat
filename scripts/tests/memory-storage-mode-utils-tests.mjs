import assert from 'node:assert/strict';

import {
  applyMemoryStorageMode,
  deriveMemoryStorageMode,
} from '../../src/scripts/ui/memory-storage-mode-utils.js';

{
  assert.equal(deriveMemoryStorageMode({ memoryEnabled: false, memoryStorageMode: 'table' }), 'off');
  assert.equal(deriveMemoryStorageMode({ memoryEnabled: true, memoryStorageMode: 'summary' }), 'summary');
  assert.equal(deriveMemoryStorageMode({ memoryEnabled: true, memoryStorageMode: 'table' }), 'table');
  assert.equal(deriveMemoryStorageMode({}), 'table');
  assert.equal(deriveMemoryStorageMode({ memoryEnabled: true, memoryStorageMode: 'legacy' }), 'summary');
  console.log('ok - memory storage mode derives a stable off/summary/table UI state');
}

{
  let current = { memoryEnabled: true, memoryStorageMode: 'table', untouched: 1 };
  const updates = [];
  const events = [];
  const settings = {
    get: () => ({ ...current }),
    update: (patch) => {
      updates.push({ ...patch });
      current = { ...current, ...patch };
      return { ...current };
    },
  };
  const dispatchEvent = event => events.push({ type: event.type, detail: event.detail });

  applyMemoryStorageMode({ mode: 'off', appSettings: settings, dispatchEvent });
  assert.deepEqual(updates.shift(), { memoryEnabled: false });
  assert.equal(deriveMemoryStorageMode(current), 'off');
  assert.deepEqual(events.splice(0), [
    { type: 'memory-storage-mode-changed', detail: { mode: 'off' } },
    { type: 'app-settings-changed', detail: { key: 'memoryEnabled', value: false } },
    { type: 'app-settings-changed', detail: { key: 'memoryStorageMode', value: 'table' } },
  ]);

  applyMemoryStorageMode({ mode: 'summary', appSettings: settings, dispatchEvent });
  assert.deepEqual(updates.shift(), { memoryEnabled: true, memoryStorageMode: 'summary' });
  assert.equal(deriveMemoryStorageMode(current), 'summary');
  assert.deepEqual(events.splice(0), [
    { type: 'memory-storage-mode-changed', detail: { mode: 'summary' } },
    { type: 'app-settings-changed', detail: { key: 'memoryEnabled', value: true } },
    { type: 'app-settings-changed', detail: { key: 'memoryStorageMode', value: 'summary' } },
  ]);

  applyMemoryStorageMode({ mode: 'table', appSettings: settings, dispatchEvent });
  assert.deepEqual(updates.shift(), { memoryEnabled: true, memoryStorageMode: 'table' });
  assert.equal(deriveMemoryStorageMode(current), 'table');
  assert.deepEqual(events.splice(0), [
    { type: 'memory-storage-mode-changed', detail: { mode: 'table' } },
    { type: 'app-settings-changed', detail: { key: 'memoryEnabled', value: true } },
    { type: 'app-settings-changed', detail: { key: 'memoryStorageMode', value: 'table' } },
  ]);
  console.log('ok - memory storage mode applies existing fields and dispatches one unified event triplet');
}
