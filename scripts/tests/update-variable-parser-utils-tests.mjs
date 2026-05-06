import assert from 'node:assert/strict';

import { buildUpdateVariableParser } from '../../src/scripts/ui/chat/update-variable-parser-utils.js';

const parser = buildUpdateVariableParser();
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('buildUpdateVariableParser parses json_patch blocks and normalizes variable roots', () => {
  const commands = parser.parseCommands(`
    <json_patch>
    \`\`\`json
    [
      { op: 'replace', path: '/variables/hero/stats/0/hp', value: 18 },
      { op: 'add', path: '/variables/hero/items/1', value: { name: 'sword' } },
      { op: 'move', from: '/variables/hero/items/0', path: '/variables/hero/bag/0' }
    ]
    \`\`\`
    </json_patch>
  `);

  assert.deepEqual(commands, [
    { type: 'set', path: ['hero', 'stats', 0, 'hp'], value: 18, reason: 'json_patch' },
    { type: 'insert', path: ['hero', 'items'], key: 1, value: { name: 'sword' }, reason: 'json_patch' },
    { type: 'move', from: ['hero', 'items', 0], to: ['hero', 'bag', 0], reason: 'json_patch' },
  ]);
});

test('buildUpdateVariableParser parses inline commands with root aliases and nested values', () => {
  const commands = parser.parseCommands(`
    _.set(stat_data, "hero.hp", 12)
    _.insert(hero.items, "slot.a", { name: 'blade', tags: ['rare', 'sharp'] })
    _.remove(hero.items, 0)
    _.add(hero.energy, 3)
  `);

  assert.deepEqual(commands, [
    { type: 'set', path: ['hero.hp'], value: 12 },
    { type: 'insert', path: ['hero', 'items'], key: 'slot.a', value: { name: 'blade', tags: ['rare', 'sharp'] } },
    { type: 'remove', path: ['hero', 'items'], key: 0 },
    { type: 'add', path: ['hero', 'energy'], value: 3 },
  ]);
});

test('buildUpdateVariableParser strips analysis tags and falls back to raw json patch arrays', () => {
  const commands = parser.parseCommands(`
    <analysis>ignore this</analysis>
    [
      { op: 'delta', path: '/status_current_variables/mp', value: 5 },
      { op: 'remove', path: '/status_current_variables/buffs/0' }
    ]
  `);

  assert.deepEqual(commands, [
    { type: 'add', path: ['mp'], value: 5, reason: 'json_patch_raw' },
    { type: 'delete', path: ['buffs', 0], reason: 'json_patch_raw' },
  ]);
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
