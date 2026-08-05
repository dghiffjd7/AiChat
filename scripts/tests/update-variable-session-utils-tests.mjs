import assert from 'node:assert/strict';

import {
  hasStatusPlaceholderDisplayRule,
  isStatusPlaceholderDisplaySession,
  isTavernMvuVariableSession,
} from '../../src/scripts/ui/chat/update-variable-session-utils.js';

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

test('status placeholder display detection follows active character-card display regex instead of MVU schema conversion', () => {
  const statusDisplayRule = {
    findRegex: '/<StatusPlaceHolderImpl\\/>/g',
    placement: [2],
    disabled: false,
    markdownOnly: true,
    promptOnly: false,
  };
  assert.equal(hasStatusPlaceholderDisplayRule([statusDisplayRule]), true);
  assert.equal(hasStatusPlaceholderDisplayRule([{ ...statusDisplayRule, disabled: true }]), false);
  assert.equal(hasStatusPlaceholderDisplayRule([{ ...statusDisplayRule, markdownOnly: false, promptOnly: true }]), false);
  assert.equal(hasStatusPlaceholderDisplayRule([{ ...statusDisplayRule, placement: [1] }]), false);

  const getEffectivePersona = sid => sid === 'card'
    ? { source: { type: 'character_card', mvuConverted: false, mvuSource: 'none' } }
    : { source: { type: 'manual' } };
  const listActiveRegexRules = sid => sid === 'card' ? [statusDisplayRule] : [];
  assert.equal(isStatusPlaceholderDisplaySession('card', {
    getEffectivePersona,
    listActiveRegexRules,
  }), true);
  assert.equal(isStatusPlaceholderDisplaySession('card', {
    getEffectivePersona,
    listActiveRegexRules: () => [],
  }), false);
  assert.equal(isStatusPlaceholderDisplaySession('manual', {
    getEffectivePersona,
    listActiveRegexRules,
  }), false);
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
