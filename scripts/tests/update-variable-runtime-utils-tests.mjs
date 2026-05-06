import assert from 'node:assert/strict';

import {
  deleteValueAtPath,
  getValueAtPath,
  resolveExistingVariablePath,
  setValueAtPath,
} from '../../src/scripts/variables/variable-path-utils.js';
import {
  createUpdateVariableCommandApplier,
  createUpdateVariableMessageApplier,
} from '../../src/scripts/ui/chat/update-variable-runtime-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('createUpdateVariableCommandApplier routes local and global writes through chatStore', () => {
  const calls = [];
  const chatStore = {
    listVariables() {
      return { hp: 1 };
    },
    listGlobalVariables() {
      return { gp: 2 };
    },
    setVariable(key, value, sid) {
      calls.push(['set-local', key, value, sid]);
    },
    setGlobalVariable(key, value, sid) {
      calls.push(['set-global', key, value, sid]);
    },
  };
  const applyCommands = createUpdateVariableCommandApplier({
    chatStore,
    getAt: (obj, path) => getValueAtPath(obj, path, { allowDirectKey: false }),
    setAt: (obj, path, value, options = {}) => setValueAtPath(obj, path, value, options),
    deleteAt: (obj, path) => deleteValueAtPath(obj, path),
    resolveExistingPath: (obj, path, options = {}) => resolveExistingVariablePath(obj, path, options),
    shouldEmitMvuEvent: name => name === 'mag_variable_update_started',
    emitStarted(sid, updates, options) {
      calls.push(['start', sid, updates, options]);
    },
    emitEnded(sid, options) {
      calls.push(['end', sid, options]);
    },
    logger: { info() {}, warn() {} },
  });

  assert.equal(
    applyCommands('s1', [{ type: 'set', path: ['hp'], value: 3 }], { useGlobal: false }),
    true,
  );
  assert.equal(
    applyCommands('s2', [{ type: 'set', path: ['gp'], value: 5 }], { useGlobal: true }),
    true,
  );
  assert.deepEqual(calls, [
    ['start', 's1', { hp: 3 }, { useGlobal: false }],
    ['set-local', 'hp', 3, 's1'],
    ['start', 's2', { gp: 5 }, { useGlobal: true }],
    ['set-global', 'gp', 5, 's2'],
  ]);
});

test('createUpdateVariableMessageApplier builds tavern placeholder flow from runtime deps', () => {
  const calls = [];
  const applyMessage = createUpdateVariableMessageApplier({
    getEffectivePersona() {
      return { source: { type: 'character_card', mvuSource: 'tavern' } };
    },
    listVariableSchemas() {
      return { hp: { type: 'number' } };
    },
    extractBlocks: () => ({ blocks: [], outsideText: 'hello' }),
    parseCommands: () => [],
    applyCommands() {
      calls.push(['apply']);
      return true;
    },
    resolveUseGlobalVariables(sessionId) {
      calls.push(['shared', sessionId]);
      return true;
    },
    transformDisplay: text => text,
    resolveForceRenderRich: sessionId => {
      calls.push(['rich', sessionId]);
      return true;
    },
    updateMessage(messageId, payload, sessionId) {
      calls.push(['update', messageId, payload, sessionId]);
      return { id: messageId, ...payload };
    },
    isSessionActive() {
      return false;
    },
    updateUiMessage() {
      calls.push(['ui']);
    },
    logger: { info() {}, warn() {} },
  });

  const changed = applyMessage({
    id: 'm1',
    role: 'assistant',
    rawSource: 'hello',
    raw: 'hello',
    content: 'hello',
  }, 's1');

  assert.equal(changed, true);
  assert.deepEqual(calls, [
    ['rich', 's1'],
    ['shared', 's1'],
    ['update', 'm1', {
      raw: 'hello\n\n<StatusPlaceHolderImpl/>',
      content: 'hello\n\n<StatusPlaceHolderImpl/>',
      rawSource: 'hello\n\n<StatusPlaceHolderImpl/>',
      meta: { renderRich: true },
    }, 's1'],
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

if (failed > 0) process.exit(1);
