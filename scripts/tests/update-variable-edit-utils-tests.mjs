import assert from 'node:assert/strict';

import { applyUpdateVariableForMessageWithFallback } from '../../src/scripts/ui/chat/update-variable-edit-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('applyUpdateVariableForMessageWithFallback returns direct apply result when function succeeds', () => {
  const calls = [];
  const changed = applyUpdateVariableForMessageWithFallback({
    message: { id: 'm1', role: 'assistant', raw: 'x', content: 'x' },
    sessionId: 's1',
    applyUpdateVariable(message, sessionId) {
      calls.push(['apply', message.id, sessionId]);
      return true;
    },
    logger: { info() {}, warn() {} },
  });
  assert.equal(changed, true);
  assert.deepEqual(calls, [['apply', 'm1', 's1']]);
});

test('applyUpdateVariableForMessageWithFallback uses fallback strip and updates active ui', () => {
  const calls = [];
  const changed = applyUpdateVariableForMessageWithFallback({
    message: {
      id: 'm2',
      role: 'assistant',
      rawSource: 'hello<UpdateVariable>x</UpdateVariable>',
      raw: 'hello<UpdateVariable>x</UpdateVariable>',
      content: 'hello',
    },
    sessionId: 's2',
    applyUpdateVariable() {
      throw new Error('not ready');
    },
    getEffectivePersona() {
      return { source: { type: 'character_card', mvuSource: 'tavern' } };
    },
    listVariableSchemas() {
      return { hp: { type: 'number' } };
    },
    transformDisplay(text) {
      calls.push(['display', text]);
      return `display:${text}`;
    },
    updateMessage(messageId, payload, sessionId) {
      calls.push(['update', messageId, payload, sessionId]);
      return { id: messageId, ...payload };
    },
    isSessionActive(sessionId) {
      calls.push(['active', sessionId]);
      return true;
    },
    updateUiMessage(messageId, updated) {
      calls.push(['ui', messageId, updated]);
    },
    logger: {
      info(message) {
        calls.push(['info', message]);
      },
      warn(message) {
        calls.push(['warn', message]);
      },
    },
  });

  assert.equal(changed, false);
  assert.deepEqual(calls, [
    ['warn', 'edit-assistant-raw: update apply via function failed'],
    ['display', 'hello\n\n<StatusPlaceHolderImpl/>'],
    ['update', 'm2', {
      raw: 'hello\n\n<StatusPlaceHolderImpl/>',
      content: 'display:hello\n\n<StatusPlaceHolderImpl/>',
      rawSource: 'hello\n\n<StatusPlaceHolderImpl/>',
    }, 's2'],
    ['active', 's2'],
    ['ui', 'm2', {
      id: 'm2',
      raw: 'hello\n\n<StatusPlaceHolderImpl/>',
      content: 'display:hello\n\n<StatusPlaceHolderImpl/>',
      rawSource: 'hello\n\n<StatusPlaceHolderImpl/>',
    }],
    ['info', '[update-variable] apply function unavailable yet (fallback-strip-applied)'],
  ]);
});

test('applyUpdateVariableForMessageWithFallback no-ops when no raw text remains', () => {
  assert.equal(
    applyUpdateVariableForMessageWithFallback({
      message: { id: 'm3', role: 'assistant' },
      sessionId: 's3',
      logger: { info() {}, warn() {} },
    }),
    false,
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

if (failed > 0) process.exit(1);
