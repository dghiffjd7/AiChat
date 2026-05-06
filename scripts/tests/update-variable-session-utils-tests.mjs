import assert from 'node:assert/strict';

import { isTavernMvuVariableSession } from '../../src/scripts/ui/chat/update-variable-session-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('isTavernMvuVariableSession requires character card source plus variable schema', () => {
  const getEffectivePersona = (sid) => {
    if (sid === 'ok') {
      return {
        source: {
          type: 'character_card',
          mvuConverted: true,
          mvuSource: 'zod',
        },
      };
    }
    if (sid === 'no-schema') {
      return {
        source: {
          type: 'character_card',
          mvuConverted: true,
          mvuSource: 'zod',
        },
      };
    }
    if (sid === 'wrong-type') {
      return {
        source: {
          type: 'preset',
          mvuConverted: true,
        },
      };
    }
    return null;
  };
  const listVariableSchemas = (sid) => (sid === 'ok' ? { hp: {} } : {});

  assert.equal(isTavernMvuVariableSession('ok', { getEffectivePersona, listVariableSchemas }), true);
  assert.equal(isTavernMvuVariableSession('no-schema', { getEffectivePersona, listVariableSchemas }), false);
  assert.equal(isTavernMvuVariableSession('wrong-type', { getEffectivePersona, listVariableSchemas }), false);
  assert.equal(isTavernMvuVariableSession('', { getEffectivePersona, listVariableSchemas }), false);
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
