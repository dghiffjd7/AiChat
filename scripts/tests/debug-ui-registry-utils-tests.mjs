import assert from 'node:assert/strict';

import {
  ensureDebugUiRegistry,
  getDebugUiRegistry,
  patchDebugUiRegistry,
  recordDebugTraceEvent,
  registerDebugRuntimeContext,
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

{
  const appBridge = {};
  const patched = patchDebugUiRegistry(appBridge, (registry) => {
    registry.actions.sample = () => 'ok';
  });
  assert.equal(patched.actions.sample(), 'ok');
  assert.equal(patchDebugUiRegistry(appBridge, null), null);
  assert.equal(patchDebugUiRegistry(null, () => {
    throw new Error('should be swallowed');
  }), null);
  console.log('ok - patchDebugUiRegistry safely creates and mutates diagnostics registry');
}

{
  const existingAction = () => 'existing';
  const refreshAction = () => 'refresh';
  const traceTimeline = { record: () => 'trace' };
  const appBridge = {
    debugUiRegistry: {
      panels: { stale: true },
      stores: { stale: true },
      actions: { existingAction },
    },
  };
  const registry = registerDebugRuntimeContext(appBridge, {
    panels: { configPanel: { id: 'config' } },
    stores: { chatStore: { id: 'chat' } },
    actions: { refreshAction },
    traceTimeline,
  });
  assert.deepEqual(registry.panels, { configPanel: { id: 'config' } });
  assert.deepEqual(registry.stores, {
    chatStore: { id: 'chat' },
    traceTimeline,
  });
  assert.equal(registry.actions.existingAction(), 'existing');
  assert.equal(registry.actions.refreshAction(), 'refresh');
  assert.equal(registerDebugRuntimeContext(null, { panels: {} }), null);
  console.log('ok - registerDebugRuntimeContext replaces runtime panels/stores and preserves actions');
}

{
  const calls = [];
  const appBridge = {
    debugUiRegistry: {
      actions: {
        recordTraceEvent(event) {
          calls.push(event);
          return { recorded: event.phase };
        },
      },
    },
  };
  assert.deepEqual(recordDebugTraceEvent(appBridge, { phase: 'sample' }), { recorded: 'sample' });
  assert.deepEqual(calls, [{ phase: 'sample' }]);
  assert.equal(recordDebugTraceEvent({}, { phase: 'missing' }), null);
  assert.equal(recordDebugTraceEvent({
    debugUiRegistry: {
      actions: {
        recordTraceEvent() {
          throw new Error('failed');
        },
      },
    },
  }, { phase: 'boom' }), null);
  console.log('ok - recordDebugTraceEvent safely delegates optional trace recorder');
}
