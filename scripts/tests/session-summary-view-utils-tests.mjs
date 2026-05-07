import assert from 'node:assert/strict';

import {
  renderSessionCompactedSummarySection,
  renderSessionSummariesSection,
} from '../../src/scripts/ui/session-summary-view-utils.js';

const previousWindow = globalThis.window;
const previousDocument = globalThis.document;

const createElement = (tagName = 'div') => ({
  tagName,
  style: { cssText: '' },
  innerHTML: '',
  children: [],
  listeners: {},
  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  },
  appendChild(child) {
    this.children.push(child);
    return child;
  },
});

const createContainer = () => ({
  innerHTML: '',
  children: [],
  appendChild(child) {
    this.children.push(child);
    return child;
  },
});

globalThis.document = {
  createElement(tagName) {
    return createElement(tagName);
  },
};

globalThis.window = {
  toastr: {
    success() {},
  },
};

{
  const calls = [];
  const selected = new Set(['a']);
  const ok = renderSessionSummariesSection({
    container: createContainer(),
    sessionId: 's1',
    chatStore: {
      getSummaries() {
        return [{ text: '一' }, { summary: '二' }];
      },
    },
    batchMode: true,
    selectedKeys: selected,
    onSelectionChange: (next, key) => calls.push(['select', [...next].sort(), key]),
    copyText: async (text) => calls.push(['copy', text]),
    normalRowStyle: 'padding:1px;',
  });
  assert.equal(ok, true);
  assert.deepEqual(calls, []);
  console.log('ok - renderSessionSummariesSection renders summary list with normalized items');
}

{
  const calls = [];
  const container = createContainer();
  renderSessionCompactedSummarySection({
    container,
    sessionId: 's1',
    chatStore: {
      getCompactedSummary() {
        return '总结';
      },
    },
    copyText: async (text) => calls.push(text),
  });
  assert.deepEqual(calls, []);
  console.log('ok - renderSessionCompactedSummarySection renders compacted summary wrapper');
}

if (previousWindow === undefined) delete globalThis.window;
else globalThis.window = previousWindow;

if (previousDocument === undefined) delete globalThis.document;
else globalThis.document = previousDocument;
