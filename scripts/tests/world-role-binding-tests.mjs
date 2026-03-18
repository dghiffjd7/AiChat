import assert from 'node:assert/strict';
import {
  buildRoleWorldBindingsImpl,
  collectEnabledRoleWorldIds,
} from '../../src/scripts/ui/world-role-binding-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('active persona is kept even when it has no bound worldbook', () => {
  const bindings = buildRoleWorldBindingsImpl({
    personas: [
      { id: 'default', name: '我', source: {} },
      { id: 'hero', name: '勇者', source: { worldbookId: 'hero-book' } },
    ],
    activePersonaId: 'default',
    effectivePersonaId: 'default',
    includeAll: false,
    includeEmpty: true,
  });
  assert.deepEqual(bindings, [
    {
      personaId: 'default',
      personaName: '我',
      worldId: '',
      enabled: false,
      hasWorld: false,
      isActive: true,
    },
  ]);
});

test('includeAll returns active persona first and preserves enabled flag', () => {
  const bindings = buildRoleWorldBindingsImpl({
    personas: [
      { id: 'a', name: '甲', source: { worldbookId: 'book-a', worldbookEnabled: false } },
      { id: 'b', name: '乙', source: { worldbookId: 'book-b' } },
      { id: 'c', name: '丙', source: {} },
    ],
    activePersonaId: 'b',
    effectivePersonaId: 'b',
    includeAll: true,
    includeEmpty: false,
  });
  assert.deepEqual(bindings, [
    {
      personaId: 'b',
      personaName: '乙',
      worldId: 'book-b',
      enabled: true,
      hasWorld: true,
      isActive: true,
    },
    {
      personaId: 'a',
      personaName: '甲',
      worldId: 'book-a',
      enabled: false,
      hasWorld: true,
      isActive: false,
    },
  ]);
});

test('collectEnabledRoleWorldIds deduplicates and ignores disabled bindings', () => {
  const ids = collectEnabledRoleWorldIds([
    { worldId: 'book-a', enabled: true },
    { worldId: 'book-a', enabled: true },
    { worldId: 'book-b', enabled: false },
    { worldId: 'book-c', enabled: true },
  ]);
  assert.deepEqual(ids, ['book-a', 'book-c']);
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
