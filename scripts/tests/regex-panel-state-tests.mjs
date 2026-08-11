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
const { RegexStore } = await import('../../src/scripts/storage/regex-store.js');

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

{
  const { panel } = makePanel();
  const draftRules = [
    {
      id: 'lazy-a',
      scriptName: 'Never expanded A',
      findRegex: '/a/g',
      replaceString: 'A',
      trimStrings: [' keep '],
      placement: [1],
      disabled: false,
    },
    {
      id: 'lazy-b',
      scriptName: 'Never expanded B',
      findRegex: '/b/g',
      replaceString: 'B',
      placement: [2],
      disabled: true,
    },
  ];
  const rules = panel.collectRules({
    __regexRuleDrafts: draftRules,
    querySelectorAll: () => [],
  });
  assert.equal(rules.length, 2, 'unmounted lazy rule bodies must remain saveable');
  assert.equal(rules[0].findRegex, '/a/g');
  assert.equal(rules[0].trimStrings[0], ' keep ');
  assert.equal(rules[1].disabled, true);
  rules[0].trimStrings[0] = 'changed';
  assert.equal(draftRules[0].trimStrings[0], ' keep ', 'collected output must not mutate editor drafts');
  console.log('ok - regex editor saves JS drafts even when rule bodies were never mounted');
}

{
  const { panel } = makePanel();
  const rule = { scriptName: 'Cached', findRegex: '/a/g', replaceString: 'b', placement: [1] };
  const first = panel.normalizeRuleForView(rule);
  const second = panel.normalizeRuleForView(rule);
  assert.equal(first, second, 'one immutable rule snapshot should reuse its normalized view');
  console.log('ok - regex panel memoizes normalized rule snapshots during one render');
}

{
  const store = Object.create(RegexStore.prototype);
  store.state = {
    local: {
      order: ['large'],
      sets: {
        large: {
          id: 'large',
          name: 'Large set',
          manualEnabled: true,
          enabled: true,
          bind: { type: 'world', worldId: 'world-a' },
          updatedAt: 10,
          rules: [{
            id: 'rule-a',
            scriptName: 'Rule A',
            findRegex: '/very-large-pattern/g',
            replaceString: 'very-large-replacement',
            placement: [1, 2],
            disabled: false,
          }],
        },
      },
    },
  };
  const summaries = store.listLocalSetSummaries();
  assert.equal(summaries.length, 1);
  assert.equal('findRegex' in summaries[0].rules[0], false, 'list summaries must not clone large rule bodies');
  assert.deepEqual(summaries[0].rules[0], {
    scriptName: 'Rule A',
    placement: [1, 2],
    disabled: false,
  });
  summaries[0].bind.worldId = 'changed';
  summaries[0].rules[0].placement[0] = 9;
  assert.equal(store.state.local.sets.large.bind.worldId, 'world-a');
  assert.equal(store.state.local.sets.large.rules[0].placement[0], 1);
  console.log('ok - regex store exposes lightweight isolated collection summaries');
}

{
  const { readFile } = await import('node:fs/promises');
  const regexPanelSource = await readFile(
    new URL('../../src/scripts/ui/regex-panel.js', import.meta.url),
    'utf8',
  );
  // 点击集合行激活编辑器时必须重取 context，不得复用 renderScoped 闭包捕获的旧值
  assert.match(
    regexPanelSource,
    /transitionScopedEditor\(editor, this\.store\.getLocalSet\(activeId\), scope, this\.getActiveRegexContext\(\)\)/,
  );
  const renderRuleCardSource = regexPanelSource.match(/renderRuleCard\(rule,[\s\S]*?\n    animateRuleCardIn\(/)?.[0] || '';
  assert.match(renderRuleCardSource, /const mountBody = \(\) => \{/, 'collapsed cards should defer their heavy form body');
  assert.match(renderRuleCardSource, /if \(!collapsed\) mountBody\(\);/, 'expanding a card should mount its body on demand');
  assert.match(renderRuleCardSource, /card\.__regexRuleDraft = r;/, 'each card should retain a JS source-of-truth draft');
  console.log('ok - activating a regex set resolves a fresh active context for the editor');
}

if (previousWindow === undefined) delete globalThis.window;
else globalThis.window = previousWindow;

if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
else globalThis.CustomEvent = previousCustomEvent;

if (previousLocalStorage === undefined) delete globalThis.localStorage;
else globalThis.localStorage = previousLocalStorage;
