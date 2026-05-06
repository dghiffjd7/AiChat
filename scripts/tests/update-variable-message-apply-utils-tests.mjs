import assert from 'node:assert/strict';

import { applyUpdateVariableFromAssistantMessage } from '../../src/scripts/ui/chat/update-variable-message-apply-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('applyUpdateVariableFromAssistantMessage parses commands applies changes and updates ui', () => {
  const calls = [];
  const result = applyUpdateVariableFromAssistantMessage({
    message: {
      id: 'm1',
      role: 'assistant',
      rawSource: 'hello<UpdateVariable>hp=10</UpdateVariable>',
      raw: 'hello<UpdateVariable>hp=10</UpdateVariable>',
      content: 'hello',
    },
    sessionId: 's1',
    isTavernMvuSession: false,
    extractBlocks: raw => ({ blocks: ['hp=10'], outsideText: 'hello' }),
    parseCommands: block => block === 'hp=10' ? [{ type: 'set', path: ['hp'], value: 10 }] : [],
    applyCommands(sessionId, commands, options) {
      calls.push(['apply', sessionId, commands, options]);
      return true;
    },
    resolveUseGlobalVariables(sessionId) {
      calls.push(['shared', sessionId]);
      return true;
    },
    transformStored(text) {
      calls.push(['stored', text]);
      return `stored:${text}`;
    },
    transformDisplay(text) {
      calls.push(['display', text]);
      return `display:${text}`;
    },
    forceRenderRich: true,
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

  assert.equal(result, true);
  assert.deepEqual(calls, [
    ['info', '[update-variable] parse messageId=m1 session=s1 blocks=1 commands=1'],
    ['info', '[update-variable] command-preview set(hp)=10'],
    ['shared', 's1'],
    ['apply', 's1', [{ type: 'set', path: ['hp'], value: 10 }], { useGlobal: true }],
    ['display', 'hello'],
    ['update', 'm1', {
      raw: 'hello',
      content: 'display:hello',
      rawSource: 'hello',
      meta: { renderRich: true },
    }, 's1'],
    ['active', 's1'],
    ['ui', 'm1', {
      id: 'm1',
      raw: 'hello',
      content: 'display:hello',
      rawSource: 'hello',
      meta: { renderRich: true },
    }],
  ]);
});

test('applyUpdateVariableFromAssistantMessage can persist placeholder-only tavern result without commands', () => {
  const calls = [];
  const result = applyUpdateVariableFromAssistantMessage({
    message: {
      id: 'm2',
      role: 'assistant',
      rawSource: 'hello',
      raw: 'hello',
      content: 'hello',
    },
    sessionId: 's2',
    isTavernMvuSession: true,
    extractBlocks: () => ({ blocks: [], outsideText: 'hello' }),
    parseCommands: () => [],
    transformDisplay: text => text,
    updateMessage(messageId, payload) {
      calls.push(['update', messageId, payload]);
      return null;
    },
    isSessionActive() {
      return false;
    },
    logger: {
      info(message) {
        calls.push(['info', message]);
      },
      warn() {},
    },
  });

  assert.equal(result, true);
  assert.deepEqual(calls, [
    ['update', 'm2', {
      raw: 'hello\n\n<StatusPlaceHolderImpl/>',
      content: 'hello\n\n<StatusPlaceHolderImpl/>',
      rawSource: 'hello\n\n<StatusPlaceHolderImpl/>',
    }],
    ['info', '[update-variable] placeholder-injected messageId=m2 session=s2 source=tavern-mvu'],
  ]);
});

test('applyUpdateVariableFromAssistantMessage ignores non assistant or empty payloads', () => {
  assert.equal(applyUpdateVariableFromAssistantMessage({ message: { role: 'user' } }), false);
  assert.equal(applyUpdateVariableFromAssistantMessage({
    message: { role: 'assistant', content: '' },
    sessionId: 's3',
    extractBlocks: () => ({ blocks: [], outsideText: '' }),
    parseCommands: () => [],
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

if (failed > 0) process.exit(1);
