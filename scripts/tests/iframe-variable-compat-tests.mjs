import assert from 'node:assert/strict';
import {
  buildMvuCompatWindowContext,
  deleteMvuCompatScopedVariable,
  flattenMvuCompatVariables,
  getMvuCompatScopedVariables,
  mergeMvuCompatScopedVariables,
  normalizeMvuCompatVars,
  normalizeMvuCompatOptionType,
  pickMvuCompatSeedVars,
  replaceMvuCompatScopedVariables,
} from '../../src/scripts/ui/chat/iframe-variable-compat.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('normalizeMvuCompatVars preserves stat/global/local aliases', () => {
  const result = normalizeMvuCompatVars({
    variables: { hp: 12 },
    global_variables: { season: 'winter' },
    local_variables: { 'hero.hp': 12 },
  });
  assert.deepEqual(result.stat_data, { hp: 12 });
  assert.deepEqual(result.variables, { hp: 12 });
  assert.deepEqual(result.status_current_variables, { hp: 12 });
  assert.deepEqual(result.global_variables, { season: 'winter' });
  assert.deepEqual(result.local_variables, { 'hero.hp': 12 });
});

test('pickMvuCompatSeedVars returns only compat-facing roots', () => {
  const result = pickMvuCompatSeedVars({
    hp: 12,
    variables: { hp: 12 },
    global_variables: { season: 'winter' },
    local_variables: { 'hero.hp': 12 },
  });
  assert.deepEqual(Object.keys(result).sort(), [
    'global_variables',
    'local_variables',
    'stat_data',
    'status_current_variables',
    'variables',
  ]);
});

test('buildMvuCompatWindowContext projects normalized vars into context payload', () => {
  const context = buildMvuCompatWindowContext({
    vars: {
      stat_data: { hp: 12 },
      global_variables: { season: 'winter' },
      local_variables: { 'hero.hp': 12 },
    },
    chat: [{ id: 'm1' }],
    currentMessageId: 'm1',
  });
  assert.deepEqual(context, {
    chat: [{ id: 'm1' }],
    messages: [{ id: 'm1' }],
    currentMessageId: 'm1',
    variables: { hp: 12 },
    stat_data: { hp: 12 },
    status_current_variables: { hp: 12 },
    global_variables: { season: 'winter' },
    local_variables: { 'hero.hp': 12 },
  });
});

test('getMvuCompatScopedVariables defaults to message scope and supports global scope', () => {
  const vars = {
    stat_data: { hp: 12 },
    global_variables: { season: 'winter' },
    local_variables: { hero: { hp: 12 } },
  };
  assert.equal(normalizeMvuCompatOptionType(), 'message');
  assert.deepEqual(getMvuCompatScopedVariables(vars), { hp: 12 });
  assert.deepEqual(getMvuCompatScopedVariables(vars, { type: 'global' }), { season: 'winter' });
  assert.deepEqual(getMvuCompatScopedVariables(vars, { type: 'local' }), { hero: { hp: 12 } });
});

test('mergeMvuCompatScopedVariables merges nested objects and replaces arrays', () => {
  const vars = mergeMvuCompatScopedVariables({
    stat_data: {
      hero: { hp: 12, tags: ['a', 'b'] },
    },
    global_variables: { season: 'winter' },
    local_variables: {},
  }, {
    hero: { hp: 18, tags: ['c'] },
    ally: { hp: 7 },
  }, { type: 'message' });
  assert.deepEqual(vars.stat_data, {
    hero: { hp: 18, tags: ['c'] },
    ally: { hp: 7 },
  });
  assert.deepEqual(vars.global_variables, { season: 'winter' });
});

test('replaceMvuCompatScopedVariables only replaces the targeted scope root', () => {
  const vars = replaceMvuCompatScopedVariables({
    stat_data: { hp: 12 },
    global_variables: { season: 'winter' },
    local_variables: { hp: 3 },
  }, { season: 'spring' }, { type: 'global' });
  assert.deepEqual(vars.global_variables, { season: 'spring' });
  assert.deepEqual(vars.stat_data, { hp: 12 });
  assert.deepEqual(vars.local_variables, { hp: 3 });
});

test('deleteMvuCompatScopedVariable removes nested paths within the selected scope', () => {
  const vars = deleteMvuCompatScopedVariable({
    stat_data: { hero: { hp: 12, mp: 5 } },
    global_variables: { season: 'winter' },
    local_variables: {},
  }, 'hero.hp', { type: 'message' });
  assert.deepEqual(vars.stat_data, { hero: { mp: 5 } });
});

test('flattenMvuCompatVariables preserves dotted leaves and empty containers', () => {
  assert.deepEqual(flattenMvuCompatVariables({
    hero: { hp: 12, inventory: [] },
    flags: {},
  }), {
    'hero.hp': 12,
    'hero.inventory': [],
    flags: {},
  });
});

test('bare getVariables and insertOrAssignVariables semantics stay on the base/message scope', () => {
  const initial = {
    stat_data: { Npc_Settings: '{"mode":"old"}' },
    global_variables: { season: 'winter' },
    local_variables: { Npc_Settings: '{"mode":"old"}' },
  };
  const merged = mergeMvuCompatScopedVariables(initial, {
    Npc_Settings: '{"mode":"new"}',
  });
  assert.deepEqual(getMvuCompatScopedVariables(merged), {
    Npc_Settings: '{"mode":"new"}',
  });
  assert.deepEqual(getMvuCompatScopedVariables(merged, { type: 'chat' }), {
    Npc_Settings: '{"mode":"new"}',
  });
  assert.deepEqual(getMvuCompatScopedVariables(merged, { type: 'global' }), {
    season: 'winter',
  });
});

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(err);
  }
}

if (failed > 0) {
  process.exit(1);
}
