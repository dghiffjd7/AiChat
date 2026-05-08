import assert from 'node:assert/strict';

import {
  allowScriptOnce,
  createScriptRuntimeAdapter,
  dispatchScriptEvent,
  getScriptRuntime,
  getScriptStore,
  restartScriptWorker,
  syncScripts,
  waitForScriptStoreReady,
} from '../../src/scripts/ui/script-runtime-utils.js';

{
  const store = { id: 'explicit-store' };
  const runtime = { id: 'explicit-runtime' };
  const bridge = {
    getScriptStore: () => store,
    getScriptRuntime: () => runtime,
  };
  assert.equal(getScriptStore(bridge), store);
  assert.equal(getScriptRuntime(bridge), runtime);
  console.log('ok - script runtime helpers prefer explicit bridge getters');
}

{
  const store = { id: 'legacy-store' };
  const runtime = { id: 'legacy-runtime' };
  const bridge = {
    scriptStore: store,
    scriptRuntime: runtime,
  };
  assert.equal(getScriptStore(bridge), store);
  assert.equal(getScriptRuntime(bridge), runtime);
  console.log('ok - script runtime helpers keep legacy field fallback');
}

{
  const calls = [];
  const bridge = {
    restartScriptWorker: reason => calls.push(['restart-contract', reason]),
    allowScriptOnce: (sessionId, ids) => calls.push(['once-contract', sessionId, ids]),
    syncScripts: payload => calls.push(['sync-contract', payload]),
    dispatchScriptEvent: (eventName, payload, options) => calls.push(['event-contract', eventName, payload, options]),
  };
  restartScriptWorker(bridge, 'reload');
  allowScriptOnce(bridge, 's1', ['a', 'b']);
  syncScripts(bridge, { sessionId: 's1' });
  dispatchScriptEvent(bridge, 'message.before_render', { id: 'm1' }, { allowMutate: false });
  assert.deepEqual(calls, [
    ['restart-contract', 'reload'],
    ['once-contract', 's1', ['a', 'b']],
    ['sync-contract', { sessionId: 's1' }],
    ['event-contract', 'message.before_render', { id: 'm1' }, { allowMutate: false }],
  ]);
  console.log('ok - script runtime helpers delegate to explicit bridge methods');
}

{
  const calls = [];
  const bridge = {
    scriptRuntime: {
      restartWorker: reason => calls.push(['restart-runtime', reason]),
      allowOnce: (sessionId, ids) => calls.push(['once-runtime', sessionId, ids]),
      syncScripts: payload => calls.push(['sync-runtime', payload]),
      dispatchEvent: (eventName, payload, options) => calls.push(['event-runtime', eventName, payload, options]),
    },
  };
  restartScriptWorker(bridge, 'reload');
  allowScriptOnce(bridge, 's1', ['x']);
  syncScripts(bridge, { sessionId: 's1' });
  dispatchScriptEvent(bridge, 'message.after_render', { id: 'm2' }, {});
  assert.deepEqual(calls, [
    ['restart-runtime', 'reload'],
    ['once-runtime', 's1', ['x']],
    ['sync-runtime', { sessionId: 's1' }],
    ['event-runtime', 'message.after_render', { id: 'm2' }, {}],
  ]);
  console.log('ok - script runtime helpers fall back to legacy runtime methods');
}

{
  let readyResolved = false;
  const store = {
    ready: Promise.resolve().then(() => {
      readyResolved = true;
    }),
  };
  const bridge = { getScriptStore: () => store };
  assert.equal(await waitForScriptStoreReady(bridge), store);
  assert.equal(readyResolved, true);
  console.log('ok - waitForScriptStoreReady awaits store readiness');
}

{
  const store = { id: 'adapter-store' };
  const runtime = { id: 'adapter-runtime' };
  const bridge = {
    getScriptStore: () => store,
    getScriptRuntime: () => runtime,
    restartScriptWorker: reason => `restart:${reason}`,
  };
  const adapter = createScriptRuntimeAdapter(bridge);
  assert.equal(adapter.store, store);
  assert.equal(adapter.runtime, runtime);
  assert.equal(adapter.restartWorker('reload'), 'restart:reload');
  console.log('ok - createScriptRuntimeAdapter exposes script store and runtime methods');
}
