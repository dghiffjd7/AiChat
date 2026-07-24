import assert from 'node:assert/strict';

const memoryStorage = new Map();
globalThis.localStorage = {
  getItem: key => memoryStorage.get(String(key)) ?? null,
  setItem: (key, value) => {
    memoryStorage.set(String(key), String(value));
  },
  removeItem: key => {
    memoryStorage.delete(String(key));
  },
};
globalThis.document = { body: { dataset: {} } };
globalThis.window = globalThis;

const { ChatStore } = await import('../../src/scripts/storage/chat-store.js');
const {
  recoverMvuVariablesFromConversion,
} = await import('../../src/scripts/variables/mvu-variable-recovery-utils.js');
const store = new ChatStore({ scopeId: 'variable-schema-ring-test' });
await store.fullyReady;
store.state = {
  currentId: 'rp:ring-test',
  globalVariables: {},
  sessions: {},
};
store.currentId = 'rp:ring-test';

assert.equal(store.setVariableSchema('hp', {
  type: 'number',
  default: 42,
  range: { min: 0, max: 100 },
  ui: {
    display: 'ring',
    label: '生命',
    color: '#7c3aed',
    format: '{value}/100',
  },
}, 'rp:ring-test'), true);

assert.deepEqual(store.getVariableSchema('hp', 'rp:ring-test'), {
  id: 'hp',
  name: 'hp',
  type: 'number',
  default: 42,
  range: { min: 0, max: 100 },
  options: null,
  ui: {
    display: 'ring',
    label: '生命',
    color: '#7c3aed',
    icon: '',
    format: '{value}/100',
  },
});
console.log('ok - ChatStore persists the variable manager ring display type');

store.setVariable('raw_score', 150, 'rp:ring-test');
store.setVariable('note', '   ', 'rp:ring-test');
const recovered = recoverMvuVariablesFromConversion({
  chatStore: store,
  sessionId: 'rp:ring-test',
  conversion: {
    variables: {
      raw_score: 42,
      note: '开场',
    },
    schemas: {
      raw_score: {
        type: 'number',
        default: 42,
        range: { min: 0, max: 100 },
      },
      note: {
        type: 'string',
        default: '开场',
      },
    },
  },
});

assert.deepEqual(recovered.preservedKeys, ['raw_score']);
assert.deepEqual(recovered.filledKeys, ['note']);
assert.equal(store.getVariable('raw_score', 'rp:ring-test'), 150);
assert.equal(store.getVariable('note', 'rp:ring-test'), '开场');
console.log('ok - MVU recovery refreshes schemas in ChatStore without coercing preserved values');
