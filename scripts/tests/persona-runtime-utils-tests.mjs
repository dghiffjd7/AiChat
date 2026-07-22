import assert from 'node:assert/strict';

import {
  PERSONA_SWITCHER_TAB_STORAGE_KEY,
  cleanupPersonaScopedData,
  deletePersonaCard,
  getCurrentCharacterId,
  normalizePersonaSwitcherTab,
  readPersonaSwitcherTab,
  resolvePersonaSwitcherEntryPresentation,
  resolveRpSessionPersonaAvatar,
  writePersonaSwitcherTab,
} from '../../src/scripts/ui/persona-runtime-utils.js';

const createStorage = () => {
  const values = new Map();
  return {
    values,
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
};

{
  assert.equal(PERSONA_SWITCHER_TAB_STORAGE_KEY, 'persona_switcher_tab_v2');
  assert.equal(normalizePersonaSwitcherTab('character'), 'character');
  assert.equal(normalizePersonaSwitcherTab(' CHARACTER '), 'character');
  assert.equal(normalizePersonaSwitcherTab('user'), 'user');
  assert.equal(normalizePersonaSwitcherTab('bad'), 'user');
  console.log('ok - persona switcher tab helpers preserve legacy key and normalization');
}

{
  const user = { name: '阿兰', avatar: 'user.png' };
  const character = { name: '清月师尊', avatar: 'character.webp' };
  assert.deepEqual(
    resolvePersonaSwitcherEntryPresentation({ tab: 'user', user, character, fallbackAvatar: 'fallback.png' }),
    {
      tab: 'user',
      kindLabel: '用户',
      name: '阿兰',
      avatar: 'user.png',
    },
  );
  assert.deepEqual(
    resolvePersonaSwitcherEntryPresentation({ tab: 'character', user, character, fallbackAvatar: 'fallback.png' }),
    {
      tab: 'character',
      kindLabel: '角色卡',
      name: '清月师尊',
      avatar: 'character.webp',
    },
  );
  console.log('ok - persona switcher entry follows the visible user or character tab');
}

{
  assert.deepEqual(
    resolvePersonaSwitcherEntryPresentation({
      tab: 'character',
      user: { name: '阿兰', avatar: 'user.png' },
      character: { name: '', avatar: '' },
      fallbackAvatar: 'fallback.png',
    }),
    {
      tab: 'character',
      kindLabel: '角色卡',
      name: '角色卡',
      avatar: 'fallback.png',
    },
  );
  console.log('ok - persona switcher entry keeps character fallbacks separate from the user avatar');
}

{
  const personas = new Map([
    ['persona-a', { id: 'persona-a', avatar: 'character-a.webp' }],
    ['persona-empty', { id: 'persona-empty', avatar: '' }],
  ]);
  const getPersona = id => personas.get(id) || null;
  assert.equal(
    resolveRpSessionPersonaAvatar({ sessionId: 'rp:persona-a', getPersona }),
    'character-a.webp',
  );
  assert.equal(
    resolveRpSessionPersonaAvatar({ sessionId: 'rp:persona-empty', getPersona }),
    '',
  );
  assert.equal(
    resolveRpSessionPersonaAvatar({ sessionId: 'contact-a', getPersona }),
    '',
  );
  console.log('ok - rp assistant avatar resolves only from the matching character card');
}

{
  assert.equal(
    resolveRpSessionPersonaAvatar({
      sessionId: 'rp:persona-a',
      getPersona() { throw new Error('read failed'); },
    }),
    '',
  );
  console.log('ok - rp assistant avatar resolution tolerates missing character data');
}

{
  const storage = createStorage();
  assert.equal(writePersonaSwitcherTab('character', { storage }), true);
  assert.equal(storage.values.get(PERSONA_SWITCHER_TAB_STORAGE_KEY), 'character');
  assert.equal(readPersonaSwitcherTab({ storage }), 'character');
  assert.equal(writePersonaSwitcherTab('bad', { storage }), true);
  assert.equal(storage.values.get(PERSONA_SWITCHER_TAB_STORAGE_KEY), 'user');
  assert.equal(readPersonaSwitcherTab({ storage }), 'user');
  console.log('ok - persona switcher tab storage helpers preserve read write fallback');
}

{
  const storage = {
    getItem() { throw new Error('read failed'); },
    setItem() { throw new Error('write failed'); },
  };
  assert.equal(readPersonaSwitcherTab({ storage }), 'user');
  assert.equal(writePersonaSwitcherTab('character', { storage }), false);
  console.log('ok - persona switcher tab storage helpers tolerate storage failures');
}

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
