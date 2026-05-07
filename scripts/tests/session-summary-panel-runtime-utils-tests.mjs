import assert from 'node:assert/strict';

import {
  applySessionSummaryBatchMode,
  ensureSessionEditableSummaryModal,
  ensureSessionReadonlySummaryModal,
  openSessionEditableSummaryModal,
  resolveSessionSummaryInlineModalClasses,
} from '../../src/scripts/ui/session-summary-panel-runtime-utils.js';

{
  const result = resolveSessionSummaryInlineModalClasses({ variant: 'group' });
  assert.deepEqual(result, {
    overlayClass: 'app-themed-overlay group-inline-modal-overlay',
    panelClass: 'app-themed-panel group-inline-modal-panel',
  });
  console.log('ok - resolveSessionSummaryInlineModalClasses builds group inline modal classes');
}

{
  const calls = [];
  const modal = ensureSessionReadonlySummaryModal({
    variant: 'contact',
    copyText: async () => {},
    toastr: {},
    createModal: (options) => {
      calls.push(options);
      return { kind: 'readonly' };
    },
  });
  const reused = ensureSessionReadonlySummaryModal({
    currentModal: modal,
    variant: 'contact',
    createModal: () => {
      throw new Error('should not recreate readonly modal');
    },
  });
  assert.equal(modal.kind, 'readonly');
  assert.equal(reused, modal);
  assert.equal(calls[0].overlayClass, 'app-themed-overlay contact-inline-modal-overlay');
  assert.equal(calls[0].panelClass, 'app-themed-panel contact-inline-modal-panel');
  console.log('ok - ensureSessionReadonlySummaryModal creates once and reuses existing modal');
}

{
  const calls = [];
  const modal = ensureSessionEditableSummaryModal({
    variant: 'group',
    title: '编辑大总结',
    minHeight: '200px',
    createModal: (options) => {
      calls.push(options);
      return { kind: 'editable' };
    },
  });
  const reused = ensureSessionEditableSummaryModal({
    currentModal: modal,
    createModal: () => {
      throw new Error('should not recreate editable modal');
    },
  });
  assert.equal(modal.kind, 'editable');
  assert.equal(reused, modal);
  assert.equal(calls[0].overlayClass, 'app-themed-overlay group-inline-modal-overlay');
  assert.equal(calls[0].panelClass, 'app-themed-panel group-inline-modal-panel');
  console.log('ok - ensureSessionEditableSummaryModal creates once and reuses existing modal');
}

{
  const calls = [];
  const ok = openSessionEditableSummaryModal({
    modal: {
      setOnSave(handler) {
        calls.push(['setOnSave']);
        handler('next');
      },
      setValue(value) {
        calls.push(['setValue', value]);
      },
      show() {
        calls.push(['show']);
      },
      focus() {
        calls.push(['focus']);
      },
    },
    value: 'initial',
    onSave: (value) => {
      calls.push(['save', value]);
    },
    scheduleFocus: (handler) => handler(),
  });
  assert.equal(ok, true);
  assert.deepEqual(calls, [
    ['setOnSave'],
    ['save', 'next'],
    ['setValue', 'initial'],
    ['show'],
    ['focus'],
  ]);
  console.log('ok - openSessionEditableSummaryModal wires save callback and focuses modal');
}

{
  const batchBarEl = { style: { display: 'none' } };
  let selectedCleared = 0;
  let renderCount = 0;
  const enabled = applySessionSummaryBatchMode({
    enabled: true,
    batchBarEl,
    clearSelectedKeys: () => {
      selectedCleared += 1;
    },
    renderSummaries: () => {
      renderCount += 1;
    },
  });
  const disabled = applySessionSummaryBatchMode({
    enabled: false,
    batchBarEl,
    clearSelectedKeys: () => {
      selectedCleared += 1;
    },
    renderSummaries: () => {
      renderCount += 1;
    },
  });
  assert.equal(enabled, true);
  assert.equal(disabled, false);
  assert.equal(batchBarEl.style.display, 'none');
  assert.equal(selectedCleared, 1);
  assert.equal(renderCount, 2);
  console.log('ok - applySessionSummaryBatchMode toggles batch bar and clears selected keys only when disabling');
}
