import assert from 'node:assert/strict';

import {
  ensureDebugUiRegistry,
  getDebugUiRegistry,
} from '../../src/scripts/ui/debug-ui-registry-utils.js';

{
  const appBridge = {};
  const registry = ensureDebugUiRegistry(appBridge);
  assert.deepEqual(registry, { panels: {}, stores: {}, actions: {} });
  registry.stores.sample = { ok: true };
  const next = ensureDebugUiRegistry(appBridge);
  assert.equal(next.stores.sample.ok, true);
  console.log('ok - ensureDebugUiRegistry creates and normalizes debug registry buckets');
}

{
  assert.equal(getDebugUiRegistry(null), null);
  assert.equal(getDebugUiRegistry({}), null);
  const registry = getDebugUiRegistry({
    debugUiRegistry: { panels: { a: 1 }, stores: {}, actions: {} },
  });
  assert.deepEqual(registry, { panels: { a: 1 }, stores: {}, actions: {} });
  console.log('ok - getDebugUiRegistry safely returns existing diagnostics registry or null');
}
