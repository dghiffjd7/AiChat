import assert from 'node:assert/strict';

import {
  cleanupPersonaScopedData,
  deletePersonaCard,
  getCurrentCharacterId,
} from '../../src/scripts/ui/persona-runtime-utils.js';

{
  const calls = [];
  const bridge = {
    getCurrentCharacterId: () => 'character:active',
    deletePersonaCard: async id => calls.push(['delete', id]),
    cleanupPersonaScopedData: async (keepIds, deleteIds) => {
      calls.push(['cleanup', keepIds, deleteIds]);
      return { deletedScopes: deleteIds };
    },
  };
  assert.equal(getCurrentCharacterId(bridge), 'character:active');
  await deletePersonaCard(bridge, 'p1');
  const result = await cleanupPersonaScopedData(bridge, ['p2'], ['p1']);
  assert.deepEqual(calls, [
    ['delete', 'p1'],
    ['cleanup', ['p2'], ['p1']],
  ]);
  assert.deepEqual(result, { deletedScopes: ['p1'] });
  console.log('ok - persona runtime helpers delegate to explicit bridge methods');
}

{
  const calls = [];
  const bridge = {
    currentCharacterId: 'legacy-character',
    deletePersonaCard: async id => calls.push(['legacy-delete', id]),
    cleanupPersonaScopedData: async (keepIds, deleteIds) => {
      calls.push(['legacy-cleanup', keepIds, deleteIds]);
      return { deletedScopes: deleteIds };
    },
  };
  assert.equal(getCurrentCharacterId(bridge), 'legacy-character');
  await deletePersonaCard(bridge, 'p3');
  const result = await cleanupPersonaScopedData(bridge, [], ['p3']);
  assert.deepEqual(calls, [
    ['legacy-delete', 'p3'],
    ['legacy-cleanup', [], ['p3']],
  ]);
  assert.deepEqual(result, { deletedScopes: ['p3'] });
  console.log('ok - persona runtime helpers keep legacy method fallback');
}

{
  assert.equal(await deletePersonaCard(null, 'missing'), undefined);
  assert.equal(await cleanupPersonaScopedData(null, [], []), undefined);
  console.log('ok - persona runtime helpers tolerate missing bridge');
}
