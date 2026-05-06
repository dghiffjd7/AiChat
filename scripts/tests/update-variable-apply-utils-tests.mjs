import assert from 'node:assert/strict';

import { applyUpdateVariableCommandsWithStore } from '../../src/scripts/ui/chat/update-variable-apply-utils.js';
import {
  deleteValueAtPath,
  getValueAtPath,
  resolveExistingVariablePath,
  setValueAtPath,
} from '../../src/scripts/variables/variable-path-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const getAt = (obj, path) => getValueAtPath(obj, path, { allowDirectKey: false });
const setAt = (obj, path, value, options = {}) => setValueAtPath(obj, path, value, options);
const deleteAt = (obj, path) => deleteValueAtPath(obj, path);
const resolveExistingPath = (obj, path, options = {}) => resolveExistingVariablePath(obj, path, options);

test('applyUpdateVariableCommandsWithStore writes changed values and emits MVU events', () => {
  const setCalls = [];
  const emitCalls = [];
  const loggerLines = [];
  const changed = applyUpdateVariableCommandsWithStore({
    sessionId: 's1',
    commands: [{ type: 'set', path: ['hp'], value: 10 }],
    listVars: { hp: 1 },
    getAt,
    setAt,
    deleteAt,
    resolveExistingPath,
    setVar(key, value, sid) {
      setCalls.push([key, value, sid]);
    },
    shouldEmitStarted: true,
    shouldEmitEnded: true,
    emitStarted(sid, updates, options) {
      emitCalls.push(['start', sid, updates, options]);
    },
    emitEnded(sid, options) {
      emitCalls.push(['end', sid, options]);
    },
    logger: {
      info(message) {
        loggerLines.push(message);
      },
      warn() {},
    },
  });
  assert.equal(changed, true);
  assert.deepEqual(setCalls, [['hp', 10, 's1']]);
  assert.deepEqual(emitCalls, [
    ['start', 's1', { hp: 10 }, { useGlobal: false }],
    ['end', 's1', { useGlobal: false }],
  ]);
  assert.equal(loggerLines.some(line => line.includes('changed-keys hp')), true);
});

test('applyUpdateVariableCommandsWithStore deletes removed values and logs skips', () => {
  const deleteCalls = [];
  const warnings = [];
  const changed = applyUpdateVariableCommandsWithStore({
    sessionId: 's2',
    commands: [
      { type: 'delete', path: ['hp'] },
      { type: 'delete', path: ['missing'] },
    ],
    listVars: { hp: 5 },
    getAt,
    setAt,
    deleteAt,
    resolveExistingPath,
    setVar() {
      throw new Error('setVar should not be used');
    },
    deleteVar(key, sid) {
      deleteCalls.push([key, sid]);
    },
    logger: {
      info() {},
      warn(message) {
        warnings.push(message);
      },
    },
  });
  assert.equal(changed, true);
  assert.deepEqual(deleteCalls, [['hp', 's2']]);
  assert.equal(warnings.some(line => line.includes('skipped-detail')), true);
});

test('applyUpdateVariableCommandsWithStore guards invalid inputs', () => {
  assert.equal(
    applyUpdateVariableCommandsWithStore({
      sessionId: '',
      commands: [{ type: 'set', path: ['hp'], value: 1 }],
      setVar() {},
      getAt,
      setAt,
      deleteAt,
      resolveExistingPath,
    }),
    false,
  );
  assert.equal(
    applyUpdateVariableCommandsWithStore({
      sessionId: 's3',
      commands: [{ type: 'set', path: ['hp'], value: 1 }],
      listVars: {},
      getAt,
      setAt,
      deleteAt,
      resolveExistingPath,
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
