import assert from 'node:assert/strict';

import {
  closeSessionMemoryShareModal,
  finalizeSessionMemoryShareSave,
  mountSessionMemoryShareModal,
  openSessionMemoryShareManager,
  refreshSessionMemoryShareSummary,
  renderSessionMemoryShareManager,
} from '../../src/scripts/ui/session-memory-share-runtime-utils.js';

const createElement = (tagName = 'div') => ({
  tagName,
  style: { display: '', cssText: '' },
  textContent: '',
  innerHTML: '',
  value: '',
  checked: false,
  disabled: false,
  children: [],
  listeners: {},
  appendChild(child) {
    this.children.push(child);
    return child;
  },
  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  },
});

const createDocumentRef = () => ({
  createElement(tagName) {
    return createElement(tagName);
  },
});

{
  const summaryEl = createElement();
  const ok = await refreshSessionMemoryShareSummary({
    summaryEl,
    sessionId: 's1',
    resolveContext: async () => ({
      summarySourceText: '来源 A',
      entries: [
        { enabled: true, shortLabel: '大纲', actualCount: 2 },
        { enabled: false, shortLabel: '设定', actualCount: 1 },
      ],
    }),
  });
  assert.equal(ok, true);
  assert.equal(summaryEl.textContent, '来源 A；注入记忆：大纲2条');
  console.log('ok - refreshSessionMemoryShareSummary renders enabled memory-share summary text');
}

{
  const summaryEl = createElement();
  await refreshSessionMemoryShareSummary({
    summaryEl,
    sessionId: 's1',
    resolveContext: async () => ({
      summarySourceText: '来源 B',
      entries: [
        { enabled: false, shortLabel: '大纲', actualCount: 0 },
      ],
    }),
  });
  assert.equal(summaryEl.textContent, '来源 B；未启用跨模式记忆注入');
  console.log('ok - refreshSessionMemoryShareSummary renders disabled memory-share summary text');
}

{
  const documentRef = createDocumentRef();
  const hintEl = createElement();
  const sourceWrapEl = createElement();
  const sourceStaticEl = createElement();
  const sourceSelectEl = createElement('select');
  const sourceButtonEl = createElement('button');
  const rowsEl = createElement();
  const draft = {
    sessionId: 'rp:alpha',
    sourceId: 'chat:1',
    tableSettings: {},
  };
  let refreshPayload = null;
  let toggleHandler = null;
  let limitHandler = null;
  let toggleRef = null;
  let limitInputRef = null;

  const context = await renderSessionMemoryShareManager({
    draft,
    rowsEl,
    hintEl,
    sourceWrapEl,
    sourceStaticEl,
    sourceSelectEl,
    sourceButtonEl,
    isRpTarget: true,
    resolveContext: async () => ({
      entries: [
        { tableId: 'outline', shortLabel: '大纲', rowCount: 4, actualCount: 2, limit: 2, enabled: false },
      ],
    }),
    listSourceSessionIds: () => ['chat:1', 'group:2'],
    getSourceSessionLabel: (id) => (id === 'chat:1' ? '聊天 A' : '群聊 B'),
    getHintText: ({ isRpTarget }) => (isRpTarget ? 'RP 注入提示' : '普通提示'),
    refreshSourceButton: ({ sourceSelectEl, fallbackLabel }) => {
      refreshPayload = { value: sourceSelectEl.value, fallbackLabel };
    },
    normalizeLimit: (value, fallback) => {
      const parsed = Number.parseInt(String(value ?? ''), 10);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
    },
    documentRef,
    createEntryRow: ({ onToggle, onLimitInput }) => {
      toggleRef = { checked: true };
      limitInputRef = { disabled: false, value: '7' };
      toggleHandler = onToggle;
      limitHandler = onLimitInput;
      return { row: { kind: 'row' } };
    },
  });

  assert.equal(Array.isArray(context.entries), true);
  assert.equal(hintEl.textContent, 'RP 注入提示');
  assert.equal(sourceWrapEl.style.display, 'block');
  assert.equal(sourceStaticEl.style.display, 'none');
  assert.equal(sourceSelectEl.children.length, 3);
  assert.equal(sourceSelectEl.children[0].textContent, '所有聊天室（默认仅注入大纲）');
  assert.equal(sourceSelectEl.value, 'chat:1');
  assert.deepEqual(refreshPayload, {
    value: 'chat:1',
    fallbackLabel: '所有聊天室（默认仅注入大纲）',
  });
  assert.equal(rowsEl.children.length, 1);

  toggleHandler({ toggle: toggleRef, limitInput: limitInputRef });
  assert.equal(draft.tableSettings.outline.enabled, true);
  assert.equal(draft.tableSettings.outline.limit, 2);
  assert.equal(limitInputRef.disabled, false);

  limitHandler({ limitInput: limitInputRef });
  assert.equal(draft.tableSettings.outline.limit, 7);
  assert.equal(limitInputRef.value, '7');
  console.log('ok - renderSessionMemoryShareManager renders RP source options and mutates shared draft state');
}

{
  const rowsEl = createElement();
  const sourceWrapEl = createElement();
  const sourceStaticEl = createElement();
  const emptyState = { kind: 'empty' };
  const context = await renderSessionMemoryShareManager({
    draft: {
      sessionId: 'chat:1',
      tableSettings: {},
    },
    rowsEl,
    sourceWrapEl,
    sourceStaticEl,
    isRpTarget: false,
    resolveContext: async () => ({ entries: [] }),
    getSourceStaticLabel: () => '来源会话 A',
    showEmptyState: true,
    createEmptyState: () => emptyState,
  });
  assert.equal(Array.isArray(context.entries), true);
  assert.equal(sourceWrapEl.style.display, 'none');
  assert.equal(sourceStaticEl.style.display, 'block');
  assert.equal(sourceStaticEl.textContent, '来源创意写作会话：来源会话 A');
  assert.deepEqual(rowsEl.children, [emptyState]);
  console.log('ok - renderSessionMemoryShareManager renders static source label and empty state for non-RP mode');
}

{
  const bodyEl = createElement('body');
  const modal = {
    overlay: createElement('div'),
    panel: createElement('div'),
    closeButton: createElement('button'),
    cancelButton: createElement('button'),
    saveButton: createElement('button'),
  };
  const sourceSelectEl = createElement('select');
  const sourceButtonEl = createElement('button');
  let closeCount = 0;
  let saveCount = 0;
  let sourceChangeCount = 0;
  let bindPayload = null;

  const ok = mountSessionMemoryShareModal({
    modal,
    bodyEl,
    sourceSelectEl,
    sourceButtonEl,
    bindSourceButton: (payload) => {
      bindPayload = payload;
    },
    onClose: () => {
      closeCount += 1;
    },
    onSave: () => {
      saveCount += 1;
    },
    onSourceChange: () => {
      sourceChangeCount += 1;
    },
  });

  modal.overlay.listeners.click[0]();
  modal.closeButton.onclick();
  modal.cancelButton.onclick();
  sourceSelectEl.listeners.change[0]();
  modal.saveButton.listeners.click[0]();

  assert.equal(ok, true);
  assert.equal(bodyEl.children.length, 2);
  assert.equal(bindPayload.buttonEl, sourceButtonEl);
  assert.equal(bindPayload.selectEl, sourceSelectEl);
  assert.equal(bindPayload.fallback, '所有聊天室（默认仅注入大纲）');
  assert.equal(closeCount, 3);
  assert.equal(sourceChangeCount, 1);
  assert.equal(saveCount, 1);
  console.log('ok - mountSessionMemoryShareModal wires overlay close source-change and save handlers');
}

{
  const overlayEl = createElement();
  const panelEl = createElement();
  overlayEl.style.display = 'block';
  panelEl.style.display = 'flex';
  let beforeCloseCount = 0;
  let closedCount = 0;

  const ok = closeSessionMemoryShareModal({
    overlayEl,
    panelEl,
    beforeClose: () => {
      beforeCloseCount += 1;
    },
    onClosed: () => {
      closedCount += 1;
    },
  });

  assert.equal(ok, true);
  assert.equal(beforeCloseCount, 1);
  assert.equal(closedCount, 1);
  assert.equal(overlayEl.style.display, 'none');
  assert.equal(panelEl.style.display, 'none');
  console.log('ok - closeSessionMemoryShareModal hides overlay/panel and runs lifecycle hooks');
}

{
  const overlayEl = createElement();
  const panelEl = createElement();
  const calls = [];
  const draft = await openSessionMemoryShareManager({
    ensureModal: () => {
      calls.push('ensure');
    },
    buildDraft: () => {
      calls.push('build');
      return { sessionId: 's1' };
    },
    assignDraft: (value) => {
      calls.push(['assign', value]);
    },
    renderManager: () => {
      calls.push('render');
    },
    overlayEl,
    panelEl,
  });
  assert.deepEqual(draft, { sessionId: 's1' });
  assert.equal(overlayEl.style.display, 'block');
  assert.equal(panelEl.style.display, 'flex');
  assert.deepEqual(calls, ['ensure', 'build', ['assign', { sessionId: 's1' }], 'render']);
  console.log('ok - openSessionMemoryShareManager ensures modal assigns draft renders manager and shows panel');
}

{
  const calls = [];
  const ok = await finalizeSessionMemoryShareSave({
    closeManager: () => {
      calls.push('close');
    },
    refreshSummary: async () => {
      calls.push('refresh');
    },
    notifySuccess: () => {
      calls.push('success');
    },
  });
  assert.equal(ok, true);
  assert.deepEqual(calls, ['close', 'refresh', 'success']);
  console.log('ok - finalizeSessionMemoryShareSave closes manager refreshes summary and emits success');
}
