import assert from 'node:assert/strict';

import {
  createMvuVariableRecoveryAction,
  isMvuRecoveryValueMissing,
  recoverMvuVariablesFromConversion,
} from '../../src/scripts/variables/mvu-variable-recovery-utils.js';

const createRecoveryStore = ({
  variables = {},
  globalVariables = {},
  schemas = {},
  rules = [],
  stageSchema = null,
} = {}) => {
  const state = {
    variables: { ...variables },
    globalVariables: { ...globalVariables },
    initialVariables: {},
    schemas: Object.fromEntries(
      Object.entries(schemas).map(([key, value]) => [key, { ...value }]),
    ),
    rules: [...rules],
    stageSchema,
  };
  return {
    state,
    getCurrent: () => 'rp:hero',
    listVariables: () => ({ ...state.variables }),
    listGlobalVariables: () => ({ ...state.globalVariables }),
    getVariableSchema: key => state.schemas[key] || null,
    setVariableSchema(key, schema) {
      state.schemas[key] = { ...schema };
      return true;
    },
    setVariable(key, value) {
      state.variables[key] = value;
      return true;
    },
    setGlobalVariable(key, value) {
      state.globalVariables[key] = value;
      return true;
    },
    setInitialVariable(key, value) {
      state.initialVariables[key] = value;
      return true;
    },
    setVariableRules(rules) {
      state.rules = rules;
      return true;
    },
    setStageSchema(schema) {
      state.stageSchema = schema;
      return true;
    },
  };
};

{
  assert.equal(isMvuRecoveryValueMissing(undefined), true);
  assert.equal(isMvuRecoveryValueMissing(null), true);
  assert.equal(isMvuRecoveryValueMissing(''), true);
  assert.equal(isMvuRecoveryValueMissing('   '), true);
  assert.equal(isMvuRecoveryValueMissing(0), false);
  assert.equal(isMvuRecoveryValueMissing(false), false);
  assert.equal(isMvuRecoveryValueMissing([]), false);
  assert.equal(isMvuRecoveryValueMissing({}), false);
  console.log('ok - MVU recovery missing-value policy preserves zero false and empty containers');
}

{
  const store = createRecoveryStore({
    variables: {
      hp: 99,
      alive: false,
      nickname: ' ',
      note: null,
      inventory: [],
      flags: {},
    },
    schemas: {
      hp: {
        type: 'number',
        default: 1,
        ui: { display: 'ring', color: '#123456' },
      },
    },
    rules: [{ id: 'player-rule' }],
    stageSchema: { stages: [{ id: 'player-stage' }] },
  });
  const conversion = {
    variables: {
      hp: 10,
      alive: true,
      nickname: '少侠',
      note: '开场',
      inventory: ['木剑'],
      flags: { met: true },
      missing: 7,
    },
    schemas: {
      hp: { type: 'number', default: 10, ui: { display: 'progress' } },
      alive: { type: 'boolean', default: true },
      nickname: { type: 'string', default: '少侠' },
      note: { type: 'string', default: '开场' },
      inventory: { type: 'array', default: ['木剑'] },
      flags: { type: 'object', default: { met: true } },
      missing: { type: 'number', default: 7 },
    },
    rules: [{ id: 'rule-1' }],
    stageSchema: { stages: [{ id: 'start' }] },
  };

  const result = recoverMvuVariablesFromConversion({
    chatStore: store,
    sessionId: 'rp:hero',
    conversion,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.filledKeys, ['nickname', 'note', 'missing']);
  assert.deepEqual(store.state.variables, {
    hp: 99,
    alive: false,
    nickname: '少侠',
    note: '开场',
    inventory: [],
    flags: {},
    missing: 7,
  });
  assert.deepEqual(store.state.initialVariables, conversion.variables);
  assert.equal(store.state.schemas.hp.default, 10);
  assert.deepEqual(store.state.schemas.hp.ui, { display: 'ring', color: '#123456' });
  assert.deepEqual(store.state.rules, [{ id: 'player-rule' }]);
  assert.deepEqual(store.state.stageSchema, { stages: [{ id: 'player-stage' }] });
  console.log('ok - MVU recovery fills only missing current values without replacing player rules or stages');
}

{
  const store = createRecoveryStore({
    globalVariables: {
      hp: 0,
      title: '',
    },
  });
  const action = createMvuVariableRecoveryAction({
    chatStore: store,
    personaStore: {
      get: id => ({
        id,
        source: { type: 'character_card' },
        originalCard: null,
      }),
      getActive: () => ({ id: 'wrong' }),
    },
    loadPersonaCard: async id => ({
      data: {
        name: id,
        extensions: {
          mvu: {
            stat_data: {
              hp: 12,
              title: '剑修',
            },
          },
        },
      },
    }),
    isSharedVariableSession: () => true,
  });

  const result = await action({ sessionId: 'rp:hero' });

  assert.equal(result.ok, true);
  assert.equal(result.personaId, 'hero');
  assert.deepEqual(result.filledKeys, ['title']);
  assert.deepEqual(store.state.globalVariables, { hp: 0, title: '剑修' });
  assert.deepEqual(store.state.initialVariables, { hp: 12, title: '剑修' });
  console.log('ok - MVU recovery action resolves the RP card and respects shared variable scope');
}

{
  const store = createRecoveryStore();
  const action = createMvuVariableRecoveryAction({
    chatStore: store,
    personaStore: {
      get: () => ({ id: 'hero', source: { type: 'manual' } }),
    },
    loadPersonaCard: async () => {
      throw new Error('should not load');
    },
  });
  const result = await action({ sessionId: 'rp:hero' });
  assert.deepEqual(result, {
    ok: false,
    code: 'not_character_card',
    sessionId: 'rp:hero',
    personaId: 'hero',
  });
  console.log('ok - MVU recovery action rejects sessions without a source character card');
}
