import assert from 'node:assert/strict';
import { parseTypedValue } from '../../src/scripts/variables/world-condition-core.js';
import {
  buildVariableBrowserDraftImpl,
  deleteVariableBrowserDraftImpl,
  getSessionVariableRecordsImpl,
  saveVariableBrowserDraftImpl,
} from '../../src/scripts/ui/world-editor/world-variable-picker.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const createWindowMock = (chatStore, extras = {}) => {
  globalThis.window = {
    appBridge: {
      chatStore,
      activeSessionId: 'sess-1',
      isSharedVariableSession: () => false,
    },
    toastr: {
      warning: () => {},
      success: () => {},
    },
    ...extras,
  };
};

test('global variable records do not reuse session schemas', () => {
  const chatStore = {
    getCurrent: () => 'sess-1',
    listVariables: () => ({ localScore: 7 }),
    listGlobalVariables: () => ({ sharedFlag: true }),
    listInitialVariables: () => ({ localScore: 1 }),
    listVariableSchemas: () => ({
      sharedFlag: { type: 'string', default: 'bad' },
      localScore: { type: 'number', default: 0 },
      schemaOnly: { type: 'boolean', default: false },
    }),
  };
  createWindowMock(chatStore);
  const context = { variableBrowserState: { recentIds: [] } };
  const globalRecords = getSessionVariableRecordsImpl.call(context, { scope: 'global' });
  assert.equal(globalRecords.length, 1);
  assert.equal(globalRecords[0].name, 'sharedFlag');
  assert.equal(globalRecords[0].type, 'boolean');
  assert.equal(globalRecords[0].schema, null);
  assert.equal(globalRecords[0].defaultValue, undefined);
});

test('complex draft is read-only and unavailable for world condition picking', () => {
  const context = {
    formatVariableBrowserValue(value, type) {
      return value === undefined ? '未设置' : (type === 'object' ? JSON.stringify(value) : String(value));
    },
  };
  const draft = buildVariableBrowserDraftImpl.call(context, {
    id: 'global:payload',
    name: 'payload',
    type: 'object',
    source: 'global',
    currentValue: { hp: 1 },
  });
  assert.equal(draft.isEditableType, false);
  assert.equal(draft.canEditCurrentValue, false);
  assert.equal(draft.canEditSchema, false);
  assert.equal(draft.canUseInWorldEditor, false);
});

test('saving a global draft only updates global value and does not write schema', () => {
  const calls = [];
  const chatStore = {
    getCurrent: () => 'sess-1',
    setGlobalVariable: (name, value) => calls.push(['global', name, value]),
    setVariableSchema: () => calls.push(['schema']),
    setVariable: () => calls.push(['session']),
    setInitialVariable: () => calls.push(['initial']),
  };
  createWindowMock(chatStore);
  const context = {
    variableBrowserState: {
      draft: {
        name: 'sharedCount',
        type: 'number',
        source: 'global',
      },
    },
    variableBrowserCurrentEl: { value: '12' },
    variableBrowserDefaultEl: { value: '99' },
    variableBrowserInitialEl: { value: '5' },
    renderVariableBrowser: () => {},
  };
  const saved = saveVariableBrowserDraftImpl.call(context, { parseTypedValue });
  assert.equal(saved, true);
  assert.deepEqual(calls, [['global', 'sharedCount', 12]]);
});

test('deleting a global draft does not delete session schema', () => {
  const calls = [];
  const chatStore = {
    getCurrent: () => 'sess-1',
    deleteGlobalVariable: (name) => calls.push(['global', name]),
    deleteVariable: () => calls.push(['session']),
    deleteInitialVariable: () => calls.push(['initial']),
    deleteVariableSchema: () => calls.push(['schema']),
  };
  createWindowMock(chatStore);
  const context = {
    variableBrowserState: {
      draft: { id: 'global:sharedCount', name: 'sharedCount', source: 'global' },
      recentIds: ['global:sharedCount'],
      selectedId: 'global:sharedCount',
    },
    renderVariableBrowser: () => {},
  };
  const deleted = deleteVariableBrowserDraftImpl.call(context, { saveRecentVariableNames: () => {} });
  assert.equal(deleted, true);
  assert.deepEqual(calls, [['global', 'sharedCount']]);
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
