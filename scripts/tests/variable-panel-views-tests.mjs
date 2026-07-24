import assert from 'node:assert/strict';

import {
  renderVariableListView,
  renderVariableSummaryCards,
  renderVariableTreeView,
} from '../../src/scripts/ui/variable-panel-views.js';
import { buildVariableListRows } from '../../src/scripts/ui/variable-panel-state-utils.js';
import {
  buildVariableSchemaDraft,
  formatVariableSchemaInputValue,
  inferVariableEditorType,
  mergeVariableSchemaDraft,
  parseVariableEditorValue,
} from '../../src/scripts/ui/variable-schema-editor.js';

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.style = {};
    this.className = '';
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this._textContent = '';
    this.title = '';
    this.open = false;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = children;
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  set textContent(value) {
    this._textContent = String(value ?? '');
  }

  get textContent() {
    return this._textContent + this.children.map(child => child?.textContent || '').join('');
  }
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName);
  }

  createDocumentFragment() {
    return new FakeElement('#fragment');
  }
}

const findByClass = (root, className) => {
  if (String(root?.className || '').split(/\s+/).includes(className)) return root;
  for (const child of root?.children || []) {
    const found = findByClass(child, className);
    if (found) return found;
  }
  return null;
};

{
  const documentRef = new FakeDocument();
  const listEl = new FakeElement('div');
  renderVariableListView({
    documentRef,
    listEl,
    rows: buildVariableListRows({ vars: { inventory: [] } }),
    hasSession: true,
  });
  assert.match(listEl.textContent, /array/);
  console.log('ok - variable list view infers untyped array values without collapsing them to object');
}

{
  const documentRef = new FakeDocument();
  const listEl = new FakeElement('div');
  const calls = [];
  const rows = buildVariableListRows({
    vars: { hp: 12, alive: false, mood: '熟悉' },
    schemas: {
      hp: { type: 'number', range: { min: 0, max: 20 } },
      alive: { type: 'boolean' },
      mood: { type: 'enum', options: ['陌生', '熟悉', '朋友'] },
    },
  });
  const result = renderVariableListView({
    documentRef,
    listEl,
    rows,
    hasSession: true,
    onConfigure: key => calls.push(['configure', key]),
    onEdit: (key, value) => calls.push(['edit', key, value]),
    onDelete: key => calls.push(['delete', key]),
    onCopy: key => calls.push(['copy', key]),
    onChangeValue: (key, value) => calls.push(['value', key, value]),
  });

  assert.deepEqual(result, { rendered: 3, empty: false });
  assert.equal(listEl.children.length, 3);
  assert.match(listEl.children[0].textContent, /alive/);
  assert.match(listEl.children[0].textContent, /false/);
  findByClass(listEl.children[0], 'var-edit').listeners.click();
  assert.deepEqual(calls, [['edit', 'alive', false]]);
  findByClass(listEl.children[1], 'variable-reference-chip').listeners.click({
    stopPropagation() {},
  });
  findByClass(listEl.children[2], 'variable-enum-cycle').listeners.click({
    stopPropagation() {},
  });
  assert.deepEqual(calls.slice(1), [
    ['copy', 'hp'],
    ['value', 'mood', '朋友'],
  ]);
  console.log('ok - variable list view renders rows and delegates actions');
}

{
  const documentRef = new FakeDocument();
  const listEl = new FakeElement('div');
  const result = renderVariableTreeView({
    documentRef,
    listEl,
    vars: { 'player.hp': 12, inventory: ['木剑'] },
    term: 'hp',
    hasSession: true,
  });
  assert.equal(result.rendered, 1);
  assert.match(listEl.textContent, /player/);
  assert.doesNotMatch(listEl.textContent, /inventory/);
  console.log('ok - variable tree view renders only matching branches');
}

{
  const documentRef = new FakeDocument();
  const cardsEl = new FakeElement('div');
  const result = renderVariableSummaryCards({
    documentRef,
    cardsEl,
    vars: { hp: 25, alive: false },
    schemas: {
      hp: {
        type: 'number',
        range: { min: 0, max: 100 },
        ui: { display: 'progress', label: '生命' },
      },
      alive: {
        type: 'boolean',
        ui: { display: 'badge', label: '存活' },
      },
    },
  });
  assert.equal(result.rendered, 2);
  assert.match(cardsEl.textContent, /生命/);
  assert.match(cardsEl.textContent, /false/);
  console.log('ok - variable summary views preserve progress and false badge values');
}

{
  assert.equal(inferVariableEditorType(12), 'number');
  assert.equal(inferVariableEditorType(false), 'boolean');
  assert.equal(inferVariableEditorType([]), 'array');
  assert.equal(inferVariableEditorType({ met: true }), 'object');
  assert.equal(inferVariableEditorType('ready'), 'string');
  assert.equal(formatVariableSchemaInputValue({ met: true }), '{"met":true}');
  assert.deepEqual(
    buildVariableSchemaDraft({
      key: 'hp',
      valueRaw: '12',
      type: 'number',
      defaultRaw: '10',
      minRaw: '0',
      maxRaw: '100',
      display: 'progress',
      color: '#123456',
      format: '{value}/100',
    }),
    {
      ok: true,
      key: 'hp',
      value: '12',
      schema: {
        id: 'hp',
        name: 'hp',
        type: 'number',
        default: 10,
        range: { min: 0, max: 100 },
        ui: {
          display: 'progress',
          color: '#123456',
          format: '{value}/100',
        },
      },
    },
  );
  assert.equal(buildVariableSchemaDraft({
    key: 'alive',
    type: 'boolean',
    defaultRaw: 'maybe',
  }).error, '默认值必须是 true/false');
  assert.deepEqual(parseVariableEditorValue('12.5', 'number'), {
    ok: true,
    value: 12.5,
  });
  assert.deepEqual(parseVariableEditorValue('{"met":true}', 'object'), {
    ok: true,
    value: { met: true },
  });
  assert.equal(parseVariableEditorValue('{bad', 'object').ok, false);
  assert.deepEqual(
    mergeVariableSchemaDraft(
      {
        source: 'mvu',
        description: 'kept',
        ui: { label: '生命', icon: 'heart' },
      },
      {
        id: 'hp',
        name: 'hp',
        type: 'number',
        range: { min: 0, max: 100 },
        ui: { display: 'ring', color: '#123456', format: '{value}/100' },
      },
    ),
    {
      source: 'mvu',
      description: 'kept',
      id: 'hp',
      name: 'hp',
      type: 'number',
      range: { min: 0, max: 100 },
      ui: {
        label: '生命',
        icon: 'heart',
        display: 'ring',
        color: '#123456',
        format: '{value}/100',
      },
    },
  );
  console.log('ok - variable schema editor builds validated drafts independently from DOM');
}
