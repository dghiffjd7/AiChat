import assert from 'node:assert/strict';

import { createSelectionModeUiRuntime } from '../../src/scripts/ui/chat/selection-mode-ui-utils.js';

const createClassList = () => {
  const set = new Set();
  return {
    add: (...tokens) => tokens.filter(Boolean).forEach(token => set.add(token)),
    remove: (...tokens) => tokens.forEach(token => set.delete(token)),
    contains: token => set.has(token),
  };
};

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = String(tagName || '').toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.dataset = {};
      this.className = '';
      this.classList = createClassList();
      this.style = {};
      this.textContent = '';
      this.type = '';
      this.disabled = false;
      this.attributes = {};
      this.listeners = new Map();
    }
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    }
    remove() {
      if (!this.parentNode) return;
      const index = this.parentNode.children.indexOf(this);
      if (index >= 0) this.parentNode.children.splice(index, 1);
      this.parentNode = null;
    }
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
    removeEventListener(type, handler) {
      if (this.listeners.get(type) === handler) this.listeners.delete(type);
    }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }
    emit(type, event = {}) {
      return this.listeners.get(type)?.(event);
    }
  }

  return {
    body: new FakeElement('body'),
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
};

const createFakeScrollEl = (wrappers) => ({
  querySelectorAll(selector) {
    if (selector === '[data-msg-id][data-role]') {
      return wrappers.filter(
        wrapper =>
          String(wrapper?.dataset?.msgId || '') !== ''
          && String(wrapper?.dataset?.role || '') !== '',
      );
    }
    if (selector === '[data-msg-id]') {
      return wrappers.filter(wrapper => String(wrapper?.dataset?.msgId || '') !== '');
    }
    if (selector === '[data-msg-id].chat-selectable') {
      return wrappers.filter(
        wrapper => String(wrapper?.dataset?.msgId || '') !== '' && wrapper.classList.contains('chat-selectable'),
      );
    }
    return [];
  },
  querySelector(selector) {
    const match = /^\[data-msg-id="(.+)"\](\[data-role\])?$/.exec(String(selector || ''));
    if (!match) return null;
    const [, id, requiresRole] = match;
    return wrappers.find(
      wrapper =>
        String(wrapper?.dataset?.msgId || '') === id
        && (!requiresRole || String(wrapper?.dataset?.role || '') !== ''),
    ) || null;
  },
});

{
  const documentLike = createFakeDocument();
  const exits = [];
  const deletes = [];
  const infos = [];
  let selected = new Set(['m1', 'm2']);
  const runtime = createSelectionModeUiRuntime({
    documentLike,
    getSelectionMode: () => true,
    getSelectedMessageIds: () => selected,
    onExitSelectionMode: () => exits.push('exit'),
    onDeleteSelected: ids => deletes.push(ids),
    onToggleMessageSelection: () => {},
    toastInfo: text => infos.push(text),
  });
  const bar = runtime.ensureSelectionBar(null);
  runtime.setSelectionBarVisible(bar, true, selected);
  assert.equal(documentLike.body.children[0], bar);
  assert.equal(bar.__chatappCountEl.textContent, '已选择 2 条');
  bar.__chatappDeleteEl.emit('click', { stopPropagation() {} });
  assert.deepEqual(deletes, [['m1', 'm2']]);
  assert.deepEqual(exits, ['exit']);
  selected = new Set();
  runtime.setSelectionBarVisible(bar, true, selected);
  bar.__chatappDeleteEl.emit('click', { stopPropagation() {} });
  assert.deepEqual(infos, ['请选择要删除的消息']);
  console.log('ok - selection mode bar reflects counts and forwards delete/cancel flows');
}

{
  const documentLike = createFakeDocument();
  const toggles = [];
  const selected = new Set(['m2']);
  const runtime = createSelectionModeUiRuntime({
    documentLike,
    getSelectionMode: () => true,
    getSelectedMessageIds: () => selected,
    onExitSelectionMode: () => {},
    onDeleteSelected: () => {},
    onToggleMessageSelection: msgId => toggles.push(msgId),
    toastInfo: () => {},
  });
  const wrapper = documentLike.createElement('div');
  wrapper.dataset.msgId = 'm2';
  wrapper.dataset.role = 'assistant';
  runtime.markWrapperSelectable(wrapper, 'm2');
  assert.equal(wrapper.classList.contains('chat-selectable'), true);
  assert.equal(wrapper.__chatappSelectDot.textContent, '✓');
  wrapper.emit('click', {
    preventDefault() {},
    stopPropagation() {},
  });
  assert.deepEqual(toggles, ['m2']);
  console.log('ok - markWrapperSelectable adds selection dot and forwards selection toggles');
}

{
  const documentLike = createFakeDocument();
  const runtime = createSelectionModeUiRuntime({
    documentLike,
    getSelectionMode: () => true,
    getSelectedMessageIds: () => new Set(),
    onExitSelectionMode: () => {},
    onDeleteSelected: () => {},
    onToggleMessageSelection: () => {},
    toastInfo: () => {},
  });
  const actionsRow = documentLike.createElement('div');
  actionsRow.dataset.msgId = 'm2';
  runtime.markWrapperSelectable(actionsRow, 'm2');
  assert.equal(actionsRow.classList.contains('chat-selectable'), false);
  assert.equal(actionsRow.__chatappSelectDot, undefined);
  console.log('ok - markWrapperSelectable rejects nested RP controls that share a message id but have no role');
}

{
  const documentLike = createFakeDocument();
  const selected = new Set();
  const runtime = createSelectionModeUiRuntime({
    documentLike,
    getSelectionMode: () => false,
    getSelectedMessageIds: () => selected,
    onExitSelectionMode: () => {},
    onDeleteSelected: () => {},
    onToggleMessageSelection: () => {
      throw new Error('should not toggle when selection mode is off');
    },
    toastInfo: () => {},
  });
  const wrapper = documentLike.createElement('div');
  wrapper.dataset.role = 'assistant';
  runtime.markWrapperSelectable(wrapper, 'm3');
  runtime.updateWrapperSelectionState(wrapper, 'm3', selected);
  assert.equal(wrapper.__chatappSelectDot.textContent, '');
  assert.equal(wrapper.style.paddingLeft, '30px');
  console.log('ok - updateWrapperSelectionState keeps unselected wrappers in neutral state');
}

{
  const documentLike = createFakeDocument();
  let selectionMode = false;
  let selected = new Set(['old']);
  const visibleCalls = [];
  const runtime = createSelectionModeUiRuntime({
    documentLike,
    getSelectionMode: () => selectionMode,
    getSelectedMessageIds: () => selected,
    onExitSelectionMode: () => {},
    onDeleteSelected: () => {},
    onToggleMessageSelection: () => {},
    toastInfo: () => {},
  });
  const wrappers = ['m1', 'm2'].map(id => {
    const wrapper = documentLike.createElement('div');
    wrapper.dataset.msgId = id;
    wrapper.dataset.role = 'assistant';
    return wrapper;
  });
  const actionsRow = documentLike.createElement('div');
  actionsRow.dataset.msgId = 'm2';
  const scrollEl = createFakeScrollEl([...wrappers, actionsRow]);
  runtime.enterSelectionMode({
    initialMsgId: 'm2',
    scrollEl,
    setSelectionMode: value => {
      selectionMode = value;
    },
    setSelectedMessageIds: value => {
      selected = value;
    },
    setSelectionBarVisible: visible => visibleCalls.push(visible),
    markWrapperSelectable: (wrapper, msgId) => runtime.markWrapperSelectable(wrapper, msgId),
  });
  assert.equal(selectionMode, true);
  assert.deepEqual([...selected], ['m2']);
  assert.deepEqual(visibleCalls, [true, true]);
  assert.equal(wrappers.every(wrapper => wrapper.classList.contains('chat-selectable')), true);
  assert.equal(actionsRow.classList.contains('chat-selectable'), false);
  console.log('ok - enterSelectionMode seeds selection state and marks existing wrappers selectable');
}

{
  const documentLike = createFakeDocument();
  let selectionMode = true;
  let selected = new Set(['m4']);
  const visibleCalls = [];
  const runtime = createSelectionModeUiRuntime({
    documentLike,
    getSelectionMode: () => selectionMode,
    getSelectedMessageIds: () => selected,
    onExitSelectionMode: () => {},
    onDeleteSelected: () => {},
    onToggleMessageSelection: () => {},
    toastInfo: () => {},
  });
  const wrappers = ['m4', 'm5'].map(id => {
    const wrapper = documentLike.createElement('div');
    wrapper.dataset.msgId = id;
    wrapper.dataset.role = 'assistant';
    runtime.markWrapperSelectable(wrapper, id);
    return wrapper;
  });
  const scrollEl = createFakeScrollEl(wrappers);
  runtime.exitSelectionMode({
    scrollEl,
    setSelectionMode: value => {
      selectionMode = value;
    },
    setSelectedMessageIds: value => {
      selected = value;
    },
    setSelectionBarVisible: visible => visibleCalls.push(visible),
  });
  assert.equal(selectionMode, false);
  assert.equal(selected.size, 0);
  assert.deepEqual(visibleCalls, [false]);
  assert.equal(wrappers.every(wrapper => !wrapper.classList.contains('chat-selectable')), true);
  assert.equal(wrappers.every(wrapper => wrapper.__chatappSelectClick == null), true);
  assert.equal(wrappers.every(wrapper => wrapper.__chatappSelectDot == null), true);
  console.log('ok - exitSelectionMode clears selectable wrappers and resets selection state');
}

{
  const documentLike = createFakeDocument();
  const selected = new Set();
  const visibleCalls = [];
  const runtime = createSelectionModeUiRuntime({
    documentLike,
    getSelectionMode: () => true,
    getSelectedMessageIds: () => selected,
    onExitSelectionMode: () => {},
    onDeleteSelected: () => {},
    onToggleMessageSelection: () => {},
    toastInfo: () => {},
  });
  const wrapper = documentLike.createElement('div');
  wrapper.dataset.msgId = 'm9';
  wrapper.dataset.role = 'assistant';
  runtime.markWrapperSelectable(wrapper, 'm9');
  const scrollEl = createFakeScrollEl([wrapper]);
  runtime.toggleMessageSelection({
    msgId: 'm9',
    selectedMessageIds: selected,
    scrollEl,
    updateWrapperSelectionState: (nextWrapper, msgId) =>
      runtime.updateWrapperSelectionState(nextWrapper, msgId, selected),
    setSelectionBarVisible: visible => visibleCalls.push(visible),
  });
  assert.equal(selected.has('m9'), true);
  assert.equal(wrapper.__chatappSelectDot.textContent, '✓');
  runtime.toggleMessageSelection({
    msgId: 'm9',
    selectedMessageIds: selected,
    scrollEl,
    updateWrapperSelectionState: (nextWrapper, msgId) =>
      runtime.updateWrapperSelectionState(nextWrapper, msgId, selected),
    setSelectionBarVisible: visible => visibleCalls.push(visible),
  });
  assert.equal(selected.has('m9'), false);
  assert.equal(wrapper.__chatappSelectDot.textContent, '');
  assert.deepEqual(visibleCalls, [true, true]);
  console.log('ok - toggleMessageSelection mutates selected ids and refreshes wrapper state');
}
