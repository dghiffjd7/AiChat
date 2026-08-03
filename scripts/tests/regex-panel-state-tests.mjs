import assert from 'node:assert/strict';

const previousWindow = globalThis.window;
const previousCustomEvent = globalThis.CustomEvent;
const previousLocalStorage = globalThis.localStorage;

const clone = (value) => JSON.parse(JSON.stringify(value));

class FakeRegexStore {
  constructor(sets = []) {
    this.ready = Promise.resolve();
    this.sets = new Map(sets.map(setObj => [setObj.id, clone(setObj)]));
    this.upserts = [];
  }

  listLocalSets() {
    return Array.from(this.sets.values()).map(clone);
  }

  getLocalSet(id) {
    const setObj = this.sets.get(id);
    return setObj ? clone(setObj) : null;
  }

  async upsertLocalSet(next) {
    this.upserts.push(clone(next));
    const prev = this.sets.get(next.id) || {};
    const merged = {
      ...prev,
      ...clone(next),
      manualEnabled: next.enabled !== false,
      enabled: next.enabled !== false,
      updatedAt: Number(prev.updatedAt || 0) + 1,
    };
    this.sets.set(merged.id, merged);
    return merged.id;
  }
}

globalThis.CustomEvent = class CustomEvent {
  constructor(type) {
    this.type = type;
  }
};

globalThis.localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
};

globalThis.window = {
  appBridge: {},
  dispatchEvent() {},
};

const { RegexPanel } = await import('../../src/scripts/ui/regex-panel.js');

const makePanel = () => {
  const store = new FakeRegexStore([
    {
      id: 'inactive',
      name: 'Inactive',
      manualEnabled: true,
      bind: { type: 'world', worldId: 'other-world' },
      rules: [{ scriptName: 'A', placement: [1], disabled: false }],
      updatedAt: 300,
    },
    {
      id: 'disabled',
      name: 'Disabled',
      manualEnabled: false,
      bind: { type: 'world', worldId: 'active-world' },
      rules: [{ scriptName: 'B', placement: [2], disabled: false }],
      updatedAt: 400,
    },
    {
      id: 'unbound',
      name: 'Unbound',
      manualEnabled: true,
      bind: null,
      rules: [{ scriptName: 'C', placement: [1], disabled: false }],
      updatedAt: 500,
    },
    {
      id: 'active',
      name: 'Active',
      manualEnabled: true,
      bind: { type: 'world', worldId: 'active-world' },
      rules: [{ scriptName: 'D', placement: [1], disabled: false }],
      updatedAt: 100,
    },
  ]);
  const panel = new RegexPanel({ store, presetStore: { ready: Promise.resolve(), list: () => [] } });
  panel.getActiveRegexContext = () => ({ worldId: 'active-world' });
  panel.refreshAll = async () => {};
  panel.showStatus = () => {};
  return { panel, store };
};

{
  const { panel, store } = makePanel();
  const sortedIds = panel.sortLocalSetsForScope(store.listLocalSets()).map(setObj => setObj.id);
  assert.deepEqual(sortedIds, ['active', 'inactive', 'unbound', 'disabled']);
  assert.deepEqual(panel.getLocalSetStatusCounts(store.listLocalSets()), {
    all: 4,
    active: 1,
    inactive: 1,
    disabled: 1,
    unbound: 1,
  });
  console.log('ok - regex panel sorts currently effective sets before inactive sets');
}

{
  const { panel, store } = makePanel();
  panel.getBatchSelection('world').add('active');
  panel.getBatchSelection('world').add('inactive');
  await panel.applyBatchEnable('world', false);
  assert.equal(store.getLocalSet('active').manualEnabled, false);
  assert.equal(store.getLocalSet('inactive').manualEnabled, false);

  panel.getBatchSelection('world').clear();
  panel.getBatchSelection('world').add('unbound');
  panel.pickWorld = async () => ({ type: 'world', worldId: 'new-world' });
  await panel.applyBatchBind('world');
  assert.deepEqual(store.getLocalSet('unbound').bind, { type: 'world', worldId: 'new-world' });

  await panel.applyBatchUnbind('world');
  assert.equal(store.getLocalSet('unbound').bind, null);
  console.log('ok - regex panel batch actions update selected local sets');
}

{
  const { panel } = makePanel();
  const fields = new Map([
    ['.re-name', { value: 'Preserve trim strings' }],
    ['.re-find', { value: '/foo/g' }],
    ['.re-repl', { value: 'bar' }],
    ['.re-trim', { value: '  leading\ntrailing  \n' }],
    ['.re-disabled', { checked: false }],
    ['.re-md-only', { checked: true }],
    ['.re-prompt-only', { checked: false }],
    ['.re-run-on-edit', { checked: true }],
    ['.re-substitute', { value: '0' }],
    ['.re-min-depth', { value: '' }],
    ['.re-max-depth', { value: '' }],
  ]);
  const ruleElement = {
    dataset: { ruleId: 'trim-rule' },
    querySelector: selector => fields.get(selector) || null,
    querySelectorAll: selector => selector === '.re-place'
      ? [{ checked: true, value: '2' }]
      : [],
  };
  const rules = panel.collectRules({
    querySelectorAll: selector => selector === '.regex-rule:not([data-removing="true"])'
      ? [ruleElement]
      : [],
  });
  assert.deepEqual(rules[0].trimStrings, ['  leading', 'trailing  ']);
  console.log('ok - regex global editor preserves significant trim-string whitespace on save');
}

if (previousWindow === undefined) delete globalThis.window;
else globalThis.window = previousWindow;

if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
else globalThis.CustomEvent = previousCustomEvent;

if (previousLocalStorage === undefined) delete globalThis.localStorage;
else globalThis.localStorage = previousLocalStorage;
