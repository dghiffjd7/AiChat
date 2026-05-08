import assert from 'node:assert/strict';

import { createDebugPanelDom } from '../../src/scripts/ui/debug-panel-dom-utils.js';

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.style = { cssText: '' };
      this.id = '';
      this.textContent = '';
      this.type = '';
      this.title = '';
      this.placeholder = '';
      this.value = '';
      this.listeners = {};
      this.parentNode = null;
      this.onclick = null;
      this.focusCalls = 0;
    }
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    addEventListener(type, handler) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(handler);
    }
    focus() {
      this.focusCalls += 1;
    }
  }
  const body = new FakeElement('body');
  return {
    body,
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
};

{
  const calls = [];
  const documentRef = createFakeDocument();
  const dom = createDebugPanelDom({
    documentRef,
    onShowCustomBundle: () => calls.push(['bundle']),
    onShowStorageMigration: () => calls.push(['migration']),
    onShowBridgeContracts: () => calls.push(['bridge']),
    onShowTraceTimeline: () => calls.push(['trace']),
    onShowErrorLogs: () => calls.push(['errors']),
    onClearLogs: ({ filterInput }) => calls.push(['clear', filterInput]),
    onCopyLogs: () => calls.push(['copy']),
    onFilterChange: (value, { filterInput }) => calls.push(['filter', value, filterInput]),
    onClearFilter: ({ filterInput }) => calls.push(['clear-filter', filterInput]),
    onToggle: () => calls.push(['toggle']),
  });

  dom.customBundleInspectBtn.onclick();
  dom.storageMigrationInspectBtn.onclick();
  dom.bridgeContractInspectBtn.onclick();
  dom.traceTimelineInspectBtn.onclick();
  dom.errorLogBtn.onclick();
  dom.clearLogBtn.onclick();
  dom.copyLogBtn.onclick();
  dom.filterInput.listeners.input[0]({ target: { value: 'warn' } });
  dom.filterClearBtn.onclick();
  dom.toggleBtn.onclick();

  assert.equal(documentRef.body.children.length, 2);
  assert.equal(dom.panel.id, 'debug-panel');
  assert.equal(dom.toggleBtn.id, 'debug-toggle');
  assert.equal(dom.filterInput.placeholder, '筛选日志...');
  assert.deepEqual(
    calls.map((entry) => entry[0]),
    ['bundle', 'migration', 'bridge', 'trace', 'errors', 'clear', 'copy', 'filter', 'clear-filter', 'toggle'],
  );
  assert.equal(calls[5][1], dom.filterInput);
  assert.equal(calls[7][1], 'warn');
  assert.equal(calls[7][2], dom.filterInput);
  assert.equal(calls[8][1], dom.filterInput);
  console.log('ok - createDebugPanelDom builds diagnostics shell and wires button and filter callbacks');
}
