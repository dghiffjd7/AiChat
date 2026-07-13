import assert from 'node:assert/strict';

globalThis.localStorage = globalThis.localStorage || {
  getItem: () => null,
  setItem: () => {},
};
globalThis.window = globalThis.window || {
  dispatchEvent: () => true,
};

const { ScriptStore } = await import('../../src/scripts/storage/script-store.js');

const makeStore = (state) => {
  const store = Object.create(ScriptStore.prototype);
  store.state = structuredClone(state);
  store.persistCount = 0;
  store.persistArgs = [];
  store.persist = async (options) => {
    store.persistCount += 1;
    store.persistArgs.push(options);
  };
  return store;
};

const emptyState = () => ({
  version: 2,
  global: { scripts: [], variables: {} },
  character: {},
  preset: {},
});

{
  const store = makeStore(emptyState());
  assert.deepEqual(store.getScripts('preset', 'missing'), []);
  assert.deepEqual(store.getScopeVariables('character', 'missing'), {});
  assert.equal(await store.toggleScript('preset', 'missing', 's1', true), false);
  assert.equal(await store.updateScript('preset', 'missing', 's1', { enabled: true }), false);
  assert.equal(await store.updateScriptData('preset', 'missing', 's1', { value: true }), false);
  assert.equal(await store.deleteScript('preset', 'missing', 's1'), false);
  assert.deepEqual(store.listScopes(), { character: [], preset: [] });
  console.log('ok - script store no-op reads and mutations do not create empty orphan buckets');
}

{
  const store = makeStore(emptyState());
  assert.equal(await store.setScopeVariables('preset', 'preset-1', { tagFixer: { enabled: true } }), true);
  assert.deepEqual(store.getScopeVariables('preset', 'preset-1'), { tagFixer: { enabled: true } });
  const snapshot = store.getScopeVariables('preset', 'preset-1');
  snapshot.tagFixer.enabled = false;
  assert.equal(store.getScopeVariables('preset', 'preset-1').tagFixer.enabled, true);
  assert.equal(store.persistCount, 1);
  assert.deepEqual(store.persistArgs, [{ notifyScriptsChanged: false }]);
  console.log('ok - script store persists isolated preset and character variable buckets');
}

{
  const store = makeStore({
    ...emptyState(),
    preset: {
      empty: { scripts: [], variables: {} },
      variablesOnly: { scripts: [], variables: { keep: true } },
      orphan: { scripts: [{ id: 's1', name: 'old' }], variables: { stale: true } },
    },
  });
  await store.setScripts('preset', 'empty', []);
  await store.setScripts('preset', 'variablesOnly', []);
  assert.equal(store.state.preset.empty, undefined);
  assert.deepEqual(store.state.preset.variablesOnly.variables, { keep: true });
  assert.equal(await store.removeScope('preset', 'orphan'), true);
  assert.equal(store.state.preset.orphan, undefined);
  assert.equal(await store.removeScope('preset', 'orphan'), false);
  assert.equal(store.persistArgs.at(-1), undefined);
  console.log('ok - script store prunes empty buckets and can remove an orphan scope atomically');
}
