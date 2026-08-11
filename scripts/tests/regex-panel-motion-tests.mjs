import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const previousDocument = globalThis.document;
const previousWindow = globalThis.window;
const previousLocalStorage = globalThis.localStorage;
const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
const previousMatchMedia = globalThis.matchMedia;

const createClassList = () => {
  const values = new Set();
  return {
    add: (...names) => names.forEach(name => values.add(name)),
    remove: (...names) => names.forEach(name => values.delete(name)),
    toggle: (name, force) => {
      if (force) values.add(name);
      else values.delete(name);
    },
    contains: name => values.has(name),
  };
};

globalThis.document = { body: { dataset: { reducedMotion: 'on' } } };
globalThis.window = { appBridge: {} };
globalThis.localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
};
globalThis.requestAnimationFrame = callback => {
  callback();
  return 1;
};
globalThis.matchMedia = () => ({ matches: false });

const { RegexPanel } = await import('../../src/scripts/ui/regex-panel.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const regexPanelSource = await readFile(path.join(root, 'src/scripts/ui/regex-panel.js'), 'utf8');
const bridgeSource = await readFile(path.join(root, 'src/scripts/ui/bridge.js'), 'utf8');
const panel = new RegexPanel({
  store: { ready: Promise.resolve() },
  presetStore: { ready: Promise.resolve(), list: () => [] },
});

const tabButtons = ['global', 'character', 'preset'].map(tab => ({
  dataset: { tab },
  classList: createClassList(),
  attributes: {},
  tabIndex: 0,
  setAttribute(name, value) { this.attributes[name] = value; },
}));
const tabStyle = {
  values: {},
  setProperty(name, value) { this.values[name] = value; },
};
const tabs = { dataset: {}, style: tabStyle, isConnected: true };
let activeView = { classList: createClassList(), dataset: {} };
const body = {
  attributes: {},
  get firstElementChild() { return activeView; },
  setAttribute(name, value) { this.attributes[name] = value; },
  removeAttribute(name) { delete this.attributes[name]; },
  replaceChildren(...nodes) { activeView = nodes[0] || null; },
};
panel.element = {
  querySelector(selector) {
    if (selector === '.regex-tabs') return tabs;
    if (selector === '#regex-body') return body;
    return null;
  },
  querySelectorAll(selector) {
    return selector === '.regex-tab' ? tabButtons : [];
  },
};

panel.activeTab = 'character';
panel.setActiveTabStyles({ animate: true });
assert.equal(tabStyle.values['--regex-tab-index'], '1');
assert.deepEqual(tabButtons.map(button => button.attributes['aria-selected']), ['false', 'true', 'false']);
assert.deepEqual(tabButtons.map(button => button.tabIndex), [-1, 0, -1]);

const nextView = { classList: createClassList(), dataset: {} };
panel.renderActiveTabView = () => nextView;
panel.markEditorDirty();
assert.equal(panel.hasUnsavedChanges(), true);
await panel.setActiveTab('preset');
assert.equal(panel.activeTab, 'preset');
assert.equal(tabStyle.values['--regex-tab-index'], '2');
assert.equal(activeView, nextView);
assert.equal(body.attributes['aria-busy'], undefined);
assert.equal(panel.hasUnsavedChanges(), false);
console.log('ok - regex scope tabs move the shared indicator and replace the active view');

const firstRow = { dataset: { setId: 'first' }, offsetTop: 0, offsetHeight: 58 };
const secondRow = { dataset: { setId: 'second' }, offsetTop: 58, offsetHeight: 62 };
const setlist = { querySelectorAll: () => [firstRow, secondRow] };
const indicator = { dataset: {}, hidden: true, isConnected: true, style: {} };
panel.syncScopedSetIndicator(setlist, indicator, 'first');
assert.equal(indicator.hidden, false);
assert.equal(indicator.style.height, '38px');
assert.equal(indicator.style.transform, 'translate3d(0, 10px, 0)');
panel.syncScopedSetIndicator(setlist, indicator, 'second', { animate: true });
assert.equal(indicator.dataset.motionReady, 'true');
assert.equal(indicator.style.height, '42px');
assert.equal(indicator.style.transform, 'translate3d(0, 68px, 0)');
console.log('ok - regex collection indicator keeps a stable spring path between rows');

const oldEditor = { classList: createClassList(), remove() {} };
const newEditor = { classList: createClassList(), remove() {} };
let editorChildren = [oldEditor];
const editor = {
  get children() { return editorChildren; },
  get lastElementChild() { return editorChildren.at(-1) || null; },
  replaceChildren(...nodes) { editorChildren = nodes; },
  appendChild(node) { editorChildren.push(node); },
};
panel.renderScopedEditor = () => newEditor;
panel.markEditorDirty();
await panel.transitionScopedEditor(editor, { id: 'second' }, 'world');
assert.deepEqual(editorChildren, [newEditor]);
assert.equal(newEditor.classList.contains('regex-editor-view'), true);
assert.equal(panel.hasUnsavedChanges(), false);
console.log('ok - reduced-motion collection switches replace content without stale views');

const tabSwitchSource = regexPanelSource.match(/async setActiveTab\(nextTab\) \{[\s\S]*?\n    showStatus\(/)?.[0] || '';
assert.match(tabSwitchSource, /await Promise\.all\(/, 'tab enter and leave animations should overlap instead of waiting serially');
assert.match(regexPanelSource, /listLocalSetSummaries\?\.\(\)/, 'collection lists should use lightweight summaries when available');
const regexContextSource = bridgeSource.match(/  getRegexContext\(options = \{\}\) \{[\s\S]*?\n  async syncPresetRegexBindings\(/)?.[0] || '';
assert.doesNotMatch(regexContextSource, /presets\?\.getState/, 'regex context should not deep-clone the complete preset store');
assert.match(regexContextSource, /presets\?\.getEnabled/, 'regex context should read enabled flags through the targeted preset API');
console.log('ok - regex tab switching avoids serial motion and full-store snapshots');

if (previousDocument === undefined) delete globalThis.document;
else globalThis.document = previousDocument;
if (previousWindow === undefined) delete globalThis.window;
else globalThis.window = previousWindow;
if (previousLocalStorage === undefined) delete globalThis.localStorage;
else globalThis.localStorage = previousLocalStorage;
if (previousRequestAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
else globalThis.requestAnimationFrame = previousRequestAnimationFrame;
if (previousMatchMedia === undefined) delete globalThis.matchMedia;
else globalThis.matchMedia = previousMatchMedia;
