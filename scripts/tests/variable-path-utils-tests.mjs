import assert from 'node:assert/strict';
import {
  buildMacroVariableContext,
  buildVariableContext,
  decodeJsonPointer,
  deleteValueAtPath,
  getValueAtPath,
  normalizeVariablePathInput,
  normalizeVariablePathParts,
  resolveExistingVariablePath,
  setValueAtPath,
  stripKnownVariableRootPrefix,
  toVariablePath,
} from '../../src/scripts/variables/variable-path-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('normalizeVariablePathInput keeps quoted dotted keys atomic', () => {
  assert.equal(normalizeVariablePathInput('"世界状态.存量"'), '["世界状态.存量"]');
  assert.equal(normalizeVariablePathInput('stat_data.hero.hp'), 'hero.hp');
  assert.equal(normalizeVariablePathInput('status_current_variables["hero.hp"]'), '["hero.hp"]');
});

test('toVariablePath parses dot and bracket notation consistently', () => {
  assert.deepEqual(toVariablePath('hero.stats[0].hp'), ['hero', 'stats', 0, 'hp']);
  assert.deepEqual(toVariablePath('["世界状态.存量"]'), ['世界状态.存量']);
  assert.deepEqual(normalizeVariablePathParts(['hero', '0', 'hp']), ['hero', 0, 'hp']);
});

test('json pointer helpers strip known variable roots', () => {
  const raw = decodeJsonPointer('/variables/hero/stats/0/hp');
  assert.deepEqual(raw, ['variables', 'hero', 'stats', '0', 'hp']);
  assert.deepEqual(stripKnownVariableRootPrefix(raw), ['hero', 'stats', '0', 'hp']);
  assert.deepEqual(normalizeVariablePathParts(stripKnownVariableRootPrefix(raw)), ['hero', 'stats', 0, 'hp']);
});

test('get/set/delete helpers read and mutate nested values', () => {
  const root = {};
  assert.equal(setValueAtPath(root, 'hero.stats[0].hp', 12, { create: true }).ok, true);
  assert.equal(getValueAtPath(root, 'hero.stats[0].hp'), 12);
  assert.equal(deleteValueAtPath(root, 'hero.stats[0].hp').ok, true);
  assert.equal(getValueAtPath(root, 'hero.stats[0].hp'), undefined);
});

test('resolveExistingVariablePath supports flat-key fallback by leaf and tail', () => {
  const root = {
    '玩家状态.存量': 3,
    hp: 12,
  };
  assert.deepEqual(resolveExistingVariablePath(root, ['世界状态', '存量'], { allowLeaf: true }), ['玩家状态.存量']);
  assert.deepEqual(resolveExistingVariablePath(root, ['hp'], { allowLeaf: true }), ['hp']);
});

test('buildVariableContext exposes nested, global, and explicit local vars consistently', () => {
  const context = buildVariableContext({
    baseVars: { 'hero.hp': 12, mood: 'calm' },
    globalVars: { season: 'winter' },
    localVars: { 'hero.hp': 7, temp: 'session-only' },
  });
  assert.equal(context.resolvePathValue('hero.hp'), 12);
  assert.equal(context.resolvePathValue('stat_data.hero.hp'), 12);
  assert.equal(context.resolvePathValue('global_variables.season'), 'winter');
  assert.equal(context.resolvePathValue('local_variables.temp'), 'session-only');
  assert.equal(context.resolvePathValue('local_variables.hero.hp'), 7);
  assert.equal(context.variableContext.local_variables.temp, 'session-only');
  assert.equal(context.variableContext.variables.hero.hp, 12);
});

test('buildMacroVariableContext can keep top-level vars aligned with the chosen base scope', () => {
  const sharedMacroVars = buildMacroVariableContext({
    baseVars: { hp: 9, 'hero.hp': 9 },
    globalVars: { hp: 9, 'hero.hp': 9 },
    localVars: { hp: 1, 'hero.hp': 1, temp: 'session-only' },
    topLevelMode: 'base',
  });
  assert.equal(sharedMacroVars.hp, 9);
  assert.equal(sharedMacroVars['hero.hp'], 9);
  assert.equal(sharedMacroVars.local_variables.hp, 1);
  assert.equal(sharedMacroVars.local_variables.hero.hp, 1);

  const mergedMacroVars = buildMacroVariableContext({
    baseVars: { hp: 1 },
    globalVars: { hp: 9, season: 'winter' },
    localVars: { hp: 1, mood: 'calm' },
    topLevelMode: 'merged',
  });
  assert.equal(mergedMacroVars.hp, 1);
  assert.equal(mergedMacroVars.season, 'winter');
  assert.equal(mergedMacroVars.mood, 'calm');
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
