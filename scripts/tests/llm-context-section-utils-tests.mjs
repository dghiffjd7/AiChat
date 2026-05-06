import assert from 'node:assert/strict';

import {
  buildLlmCharacterContext,
  buildLlmGroupContext,
  buildLlmSessionContext,
  buildLlmUserContext,
} from '../../src/scripts/ui/chat/llm-context-section-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('buildLlmUserContext maps prompt user and persona fields', () => {
  assert.deepEqual(
    buildLlmUserContext({
      promptUserName: '我',
      activeUser: {
        description: 'desc',
        position: 'before_char',
        depth: 2,
        role: 'system',
      },
    }),
    {
      name: '我',
      persona: 'desc',
      personaPosition: 'before_char',
      personaDepth: 2,
      personaRole: 'system',
    },
  );
});

test('buildLlmCharacterContext maps character name and persona description', () => {
  assert.deepEqual(
    buildLlmCharacterContext({
      characterName: '角色',
      activePersona: { description: 'char desc' },
    }),
    {
      name: '角色',
      description: 'char desc',
    },
  );
});

test('buildLlmSessionContext preserves session metadata and settings object', () => {
  const settings = { model: 'x' };
  assert.deepEqual(
    buildLlmSessionContext({
      sessionId: 'group:1',
      isGroupChat: true,
      characterName: '群聊',
      sessionSettings: settings,
    }),
    {
      id: 'group:1',
      isGroup: true,
      name: '群聊',
      settings,
    },
  );
});

test('buildLlmGroupContext returns null for private chat and maps member names for groups', () => {
  assert.equal(buildLlmGroupContext({ isGroupChat: false }), null);
  assert.deepEqual(
    buildLlmGroupContext({
      isGroupChat: true,
      sessionId: 'group:1',
      characterName: '群聊',
      groupMembers: ['a', 'b'],
      getContactName: id => (id === 'a' ? 'Alice' : ''),
    }),
    {
      id: 'group:1',
      name: '群聊',
      members: ['a', 'b'],
      memberNames: ['Alice', 'b'],
    },
  );
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
