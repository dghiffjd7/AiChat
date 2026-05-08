import assert from 'node:assert/strict';
import { buildVariableContext, parseTypedValue } from '../../src/scripts/variables/world-condition-core.js';
import {
  buildVariableBrowserDraftImpl,
  buildVariableBrowserSelectionPayloadImpl,
  deleteVariableBrowserDraftImpl,
  getSessionVariableRecordsImpl,
  saveVariableBrowserDraftImpl,
} from '../../src/scripts/ui/world-editor/world-variable-picker.js';
import {
  buildWorldConditionVariableRuntimeContext,
  ensureWorldVariableInStore,
  getWorldVariableOptions,
  resolveWorldVariableSessionContext,
} from '../../src/scripts/ui/world-editor/world-variable-session-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const createWindowMock = (chatStore, extras = {}) => {
  const {
    appBridge: appBridgeExtras = {},
    toastr: toastrExtras = {},
    ...windowExtras
  } = extras || {};
  globalThis.window = {
    appBridge: {
      chatStore,
      getActiveSessionId: () => 'sess-1',
      isSharedVariableSession: () => false,
      ...appBridgeExtras,
    },
    toastr: {
      warning: () => {},
      success: () => {},
      ...toastrExtras,
    },
    ...windowExtras,
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

test('world-condition selection returns auto-create payload using schema default', () => {
  const context = {
    formatVariableBrowserValue(value) {
      return value === undefined ? '未设置' : String(value);
    },
  };
  const draft = buildVariableBrowserDraftImpl.call(context, {
    id: 'session:favor',
    name: 'favor',
    type: 'number',
    source: 'session',
    currentValue: 12,
    defaultValue: 0,
  });
  const payload = buildVariableBrowserSelectionPayloadImpl(draft, { parseTypedValue });
  assert.deepEqual(payload, {
    name: 'favor',
    type: 'number',
    defaultValue: 0,
  });
});

test('world-condition selection falls back to typed empty default when schema is missing', () => {
  const context = {
    formatVariableBrowserValue(value, type) {
      return value === undefined ? '未设置' : (type === 'boolean' ? String(value) : String(value));
    },
  };
  const draft = buildVariableBrowserDraftImpl.call(context, {
    id: 'global:sharedTitle',
    name: 'sharedTitle',
    type: 'string',
    source: 'global',
    currentValue: 'captain',
    defaultValue: undefined,
  });
  const payload = buildVariableBrowserSelectionPayloadImpl(draft, { parseTypedValue });
  assert.deepEqual(payload, {
    name: 'sharedTitle',
    type: 'string',
    defaultValue: '',
  });
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

test('world variable options use shared globals while still including session schemas', () => {
  const chatStore = {
    getCurrent: () => 'sess-1',
    listVariables: () => ({ localOnly: 1 }),
    listGlobalVariables: () => ({ sharedFlag: true }),
    listVariableSchemas: () => ({ schemaOnly: { type: 'number', default: 0 } }),
  };
  createWindowMock(chatStore, {
    appBridge: {
      isSharedVariableSession: () => true,
    },
  });
  const options = getWorldVariableOptions(resolveWorldVariableSessionContext());
  assert.deepEqual(options.map(item => item.value), ['schemaOnly', 'sharedFlag']);
});

test('ensure world variable store writes schema and preserves existing shared global value', () => {
  const calls = [];
  const chatStore = {
    getCurrent: () => 'sess-1',
    setVariableSchema: (name, schema, sid) => calls.push(['schema', name, schema, sid]),
    getGlobalVariable: () => 7,
    setGlobalVariable: (name, value) => calls.push(['global', name, value]),
    getVariable: () => undefined,
    setVariable: (name, value, sid) => calls.push(['session', name, value, sid]),
    getInitialVariable: () => undefined,
    setInitialVariable: (name, value, sid) => calls.push(['initial', name, value, sid]),
  };
  createWindowMock(chatStore, {
    appBridge: {
      isSharedVariableSession: () => true,
    },
  });
  const saved = ensureWorldVariableInStore({
    ...resolveWorldVariableSessionContext(),
    name: 'score',
    type: 'number',
    defaultValue: 0,
  });
  assert.equal(saved, true);
  assert.deepEqual(calls, [['schema', 'score', { type: 'number', default: 0 }, 'sess-1']]);
});

test('shared variable runtime context keeps local variables inspectable', () => {
  const chatStore = {
    getCurrent: () => 'sess-1',
    listVariables: () => ({ localOnly: 2 }),
    listGlobalVariables: () => ({ sharedScore: 9 }),
  };
  createWindowMock(chatStore, {
    appBridge: {
      isSharedVariableSession: () => true,
    },
  });
  const runtimeContext = buildWorldConditionVariableRuntimeContext({
    ...resolveWorldVariableSessionContext(),
    buildVariableContext,
  });
  assert.equal(runtimeContext.resolvePathValue('sharedScore'), 9);
  assert.deepEqual(runtimeContext.variableContext.local_variables, { localOnly: 2 });
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
