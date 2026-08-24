import assert from 'node:assert/strict';

const calls = [];
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  key: () => null,
  length: 0,
};
globalThis.window = {
  appBridge: {
    deletePersonaCard: async personaId => {
      calls.push(['delete-card', personaId]);
    },
  },
};

const { PersonaPanel } = await import('../../src/scripts/ui/persona-panel.js');

const personas = new Map([
  ['p1', { id: 'p1', name: '角色一', source: { worldbookId: 'world-a' } }],
  ['p2', { id: 'p2', name: '角色二' }],
  ['p3', { id: 'p3', name: '保留角色' }],
]);
const panel = {
  store: {
    get: id => personas.get(id) || null,
    getAll: () => Array.from(personas.values()),
    delete: async id => {
      if (personas.size <= 1 || !personas.has(id)) return false;
      calls.push(['store-delete', id]);
      personas.delete(id);
      return true;
    },
  },
  notifyPersonaChanged: async () => {
    calls.push(['notify']);
  },
  cleanupPersonaBindings: async (persona, options) => {
    calls.push(['bindings', persona.id, options.deleteWorld === true]);
  },
  cleanupPersonaData: async (persona, { remainingPersonas }) => {
    calls.push(['data', persona.id, remainingPersonas.map(item => item.id)]);
  },
};

{
  const result = await PersonaPanel.prototype.deleteCore.call(panel, 'p1', {
    deleteWorld: true,
  });
  assert.equal(result.deleted, true);
  assert.deepEqual(calls, [
    ['store-delete', 'p1'],
    ['notify'],
    ['delete-card', 'p1'],
    ['bindings', 'p1', true],
    ['data', 'p1', ['p2', 'p3']],
  ]);
  console.log('ok - persona delete core preserves the complete single-delete cleanup order');
}

{
  calls.length = 0;
  const result = await PersonaPanel.prototype.deleteCore.call(panel, 'p2', {
    cleanupBindings: false,
    notify: false,
  });
  assert.equal(result.deleted, true);
  assert.deepEqual(calls, [
    ['store-delete', 'p2'],
    ['delete-card', 'p2'],
    ['data', 'p2', ['p3']],
  ]);
  console.log('ok - persona batch deletion can preserve independent bindings while retaining owned-data cleanup');
}

{
  calls.length = 0;
  const result = await PersonaPanel.prototype.deleteCore.call(panel, 'missing');
  assert.deepEqual(result, {
    ok: true,
    deleted: false,
    reason: 'already_absent',
    personaId: 'missing',
  });
  assert.deepEqual(calls, []);
  console.log('ok - persona delete core is idempotent for already absent targets');
}

{
  assert.deepEqual(
    PersonaPanel.prototype.collectScopedLocalStorageCandidates.call(
      {},
      ['persona_keep'],
      ['persona_deleted', 'persona_keep'],
    ),
    ['persona_deleted'],
  );
  console.log('ok - persona deletion only targets explicitly deleted local scopes');
}

{
  const cleanupCalls = [];
  window.appBridge.getPresetStore = () => ({
    ready: Promise.resolve(),
    remove: async (type, id) => cleanupCalls.push(['preset', type, id]),
  });
  window.appBridge.getScriptStore = () => ({
    ready: Promise.resolve(),
    getScripts: () => [],
    getScopeVariables: () => ({}),
    removeScope: async (scope, id) => cleanupCalls.push(['script-scope', scope, id]),
  });

  await PersonaPanel.prototype.cleanupPersonaBindings.call({}, {
    id: 'persona-a',
    source: { systemPresetId: 'sysprompt-a' },
  }, {
    deletePreset: true,
    deleteWorld: false,
    deleteRegex: false,
    deleteScripts: false,
  });

  assert.deepEqual(cleanupCalls, [
    ['preset', 'sysprompt', 'sysprompt-a'],
    ['script-scope', 'character', 'persona-a'],
  ]);
  console.log('ok - persona deletion cleans the selected system preset and historical empty script scope');
}

console.log('persona-delete-core-tests passed');
