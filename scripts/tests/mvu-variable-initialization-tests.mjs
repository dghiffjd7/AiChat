import assert from 'node:assert/strict';

import { MVUConverter } from '../../src/scripts/import/mvu-converter.js';
import { writeImportedMvuConversion } from '../../src/scripts/import/mvu-session-write-utils.js';
import { applyMvuSchemaDefaultsToStore } from '../../src/scripts/variables/mvu-variable-defaults-utils.js';

const createStore = () => {
  const variables = {};
  const initialVariables = {};
  const schemas = {};
  let rules = [];
  let stageSchema = null;
  return {
    variables,
    initialVariables,
    schemas,
    getVariableSchema: key => schemas[key] || null,
    listVariableSchemas: () => ({ ...schemas }),
    setVariableSchema(key, schema) {
      schemas[key] = { ...schema };
      return true;
    },
    listVariables: () => ({ ...variables }),
    setVariable(key, value) {
      variables[key] = value;
      return true;
    },
    setGlobalVariable(key, value) {
      variables[key] = value;
      return true;
    },
    getInitialVariable: key => initialVariables[key],
    setInitialVariable(key, value) {
      initialVariables[key] = value;
      return true;
    },
    setVariableRules(next) {
      rules = next;
      return true;
    },
    setStageSchema(next) {
      stageSchema = next;
      return true;
    },
    clearVariables() {
      Object.keys(variables).forEach(key => delete variables[key]);
    },
    clearInitialVariables() {
      Object.keys(initialVariables).forEach(key => delete initialVariables[key]);
    },
    snapshot: () => ({
      variables: { ...variables },
      initialVariables: { ...initialVariables },
      schemas: { ...schemas },
      rules,
      stageSchema,
    }),
  };
};

{
  const store = createStore();
  const result = writeImportedMvuConversion({
    chatStore: store,
    sessionId: 'rp:hero',
    conversion: {
      variables: { hp: 0, alive: false, title: '' },
      schemas: {
        hp: { type: 'number', default: 0 },
        alive: { type: 'boolean', default: false },
        title: { type: 'string', default: '' },
      },
      rules: [{ id: 'rule-1' }],
      stageSchema: { stages: [] },
    },
  });

  assert.deepEqual(result, {
    ok: true,
    sessionId: 'rp:hero',
    variableCount: 3,
    schemaCount: 3,
  });
  assert.deepEqual(store.snapshot(), {
    variables: { hp: 0, alive: false, title: '' },
    initialVariables: { hp: 0, alive: false, title: '' },
    schemas: {
      hp: { type: 'number', default: 0 },
      alive: { type: 'boolean', default: false },
      title: { type: 'string', default: '' },
    },
    rules: [{ id: 'rule-1' }],
    stageSchema: { stages: [] },
  });
  console.log('ok - character-card MVU import writes schemas current values and initial values');
}

{
  const source = {
    health: 84,
    affinity: 12,
    alive: false,
    title: '剑修',
    nickname: '',
    mood: '平静',
    weather: '雨',
    tags: ['主角'],
    inventory: [],
    flags: {},
    counters: { victories: 2 },
    chapter: 3,
    note: null,
  };
  const conversion = MVUConverter.convert({
    data: {
      extensions: {
        mvu: { stat_data: source },
      },
    },
  });
  const store = createStore();
  writeImportedMvuConversion({
    chatStore: store,
    sessionId: 'rp:hero',
    conversion,
  });
  const expected = { ...store.snapshot().variables };
  assert.equal(Object.keys(expected).length, 13);

  store.clearVariables();
  store.clearInitialVariables();
  const restored = applyMvuSchemaDefaultsToStore({
    chatStore: store,
    sessionId: 'rp:hero',
  });

  assert.equal(restored.ok, true);
  assert.equal(restored.applied, true);
  assert.equal(restored.keys.length, 13);
  assert.deepEqual(store.snapshot().variables, expected);
  assert.deepEqual(store.snapshot().initialVariables, expected);
  console.log('ok - converted MVU variables survive current plus initial clear and schema-default restore');
}

{
  const store = createStore();
  store.setVariableSchema('hp', { type: 'number', default: 10 });
  store.setVariableSchema('alive', { type: 'boolean', default: true });
  store.setVariable('hp', 0);
  store.setVariable('alive', false);

  const restored = applyMvuSchemaDefaultsToStore({
    chatStore: store,
    sessionId: 'rp:hero',
  });

  assert.equal(restored.applied, false);
  assert.deepEqual(store.snapshot().variables, { hp: 0, alive: false });
  console.log('ok - schema default restore preserves defined zero and false values');
}
