import assert from 'node:assert/strict';

import {
  createActiveSessionRuntime,
  createPendingFloatRuntime,
} from '../../src/scripts/ui/chat/session-activity-runtime-utils.js';

class FakeClassList {
  constructor() {
    this.tokens = new Set();
  }

  add(token) {
    this.tokens.add(token);
  }

  remove(token) {
    this.tokens.delete(token);
  }

  contains(token) {
    return this.tokens.has(token);
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.className = '';
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.textContent = '';
    this.type = '';
    let innerHtmlValue = '';
    Object.defineProperty(this, 'innerHTML', {
      get() {
        return innerHtmlValue;
      },
      set(value) {
        innerHtmlValue = String(value ?? '');
        if (!innerHtmlValue) this.children = [];
      },
    });
  }

  appendChild(child) {
    if (!child) return child;
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...nextChildren) {
    this.children = [];
    nextChildren.forEach((child) => this.appendChild(child));
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  trigger(type = 'click', event = {}) {
    const handlers = this.listeners.get(type) || [];
    handlers.forEach((handler) => handler({
      currentTarget: this,
      target: this,
      stopPropagation() {},
      ...event,
    }));
  }

  closest(selector) {
    if (selector === 'button') {
      return this.tagName === 'BUTTON' ? this : null;
    }
    if (selector === '[data-msg-id]') {
      return this.dataset.msgId ? this : null;
    }
    return null;
  }
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName);
  }
}

const createPendingFloatParts = () => {
  const wrap = new FakeElement('div');
  const titleEl = new FakeElement('div');
  const listEl = new FakeElement('div');
  wrap.appendChild(titleEl);
  wrap.appendChild(listEl);
  return {
    pendingFloat: {
      el: wrap,
      titleEl,
      listEl,
    },
    wrap,
    titleEl,
    listEl,
  };
};

{
  const calls = [];
  let visible = false;
  let currentSessionId = 's1';
  const runtime = createActiveSessionRuntime({
    isChatRoomVisible: () => visible,
    getCurrentSessionId: () => currentSessionId,
    markRead: (sessionId, messageId) => calls.push([sessionId, messageId]),
  });

  assert.equal(runtime.isSessionActive('s1'), false);
  visible = true;
  assert.equal(runtime.isSessionActive('s2'), false);
  assert.equal(runtime.isSessionActive('s1'), true);
  runtime.autoMarkReadIfActive('s2', 'm1');
  runtime.autoMarkReadIfActive('s1', 'm2');
  currentSessionId = 's2';
  runtime.autoMarkReadIfActive('s1', 'm3');
  assert.deepEqual(calls, [['s1', 'm2']]);
  console.log('ok - createActiveSessionRuntime gates active-session checks and mark-read updates');
}

{
  const { pendingFloat, wrap, titleEl, listEl } = createPendingFloatParts();
  const menu = new FakeElement('div');
  const documentRef = new FakeDocument();
  const toggleCalls = [];
  const pendingBySession = new Map([
    ['s1', [
      { id: 'm1', content: '第一条' },
      { id: 'm2', content: '第二条消息' },
      { id: 'm3', content: '第三条消息' },
      { id: 'm4', content: `第四条消息${'x'.repeat(48)}` },
    ]],
  ]);
  const runtime = createPendingFloatRuntime({
    pendingFloat,
    pendingFloatMenu: menu,
    documentRef,
    getCurrentSessionId: () => 's1',
    getPendingMessages: (sessionId) => pendingBySession.get(sessionId) || [],
    isChatRoomVisible: () => true,
    toggleSheetAt: (...args) => toggleCalls.push(args),
  });

  runtime.bindPendingFloatSelection();
  runtime.updatePendingFloat('s1');
  assert.equal(titleEl.textContent, '待发送 4 条');
  assert.equal(listEl.children.length, 4);
  assert.equal(listEl.children[0].dataset.msgId, 'm2');
  assert.equal(listEl.children[2].textContent.endsWith('…'), true);
  assert.equal(listEl.children[3].textContent, '还有 1 条');
  assert.equal(wrap.classList.contains('is-active'), true);

  wrap.trigger('click', { target: listEl.children[1] });
  assert.equal(runtime.getActivePending()?.id, 'm3');
  assert.deepEqual(toggleCalls, [[menu, listEl.children[1], { alignRight: true, kind: 'pending-float' }]]);

  pendingBySession.set('s1', []);
  runtime.updatePendingFloat('s1');
  assert.equal(wrap.classList.contains('is-active'), false);
  assert.equal(runtime.getActivePending(), null);
  console.log('ok - createPendingFloatRuntime renders pending previews, opens menu, and clears state when empty');
}

{
  const { pendingFloat } = createPendingFloatParts();
  const menu = new FakeElement('div');
  const sendBtn = new FakeElement('button');
  sendBtn.dataset.action = 'send';
  const deleteBtn = new FakeElement('button');
  deleteBtn.dataset.action = 'delete';
  menu.appendChild(sendBtn);
  menu.appendChild(deleteBtn);
  const documentRef = new FakeDocument();
  const calls = [];
  const pendingBySession = new Map([
    ['s1', [{ id: 'p1', content: '待发消息', status: 'queued' }]],
  ]);
  const historyBySession = new Map([
    ['s1', []],
  ]);
  const runtime = createPendingFloatRuntime({
    pendingFloat,
    pendingFloatMenu: menu,
    documentRef,
    getCurrentSessionId: () => 's1',
    getPendingMessages: (sessionId) => pendingBySession.get(sessionId) || [],
    getMessages: (sessionId) => historyBySession.get(sessionId) || [],
    appendMessage: (message, sessionId) => {
      calls.push(['append', sessionId, message.id, message.status]);
      const next = [...(historyBySession.get(sessionId) || []), message];
      historyBySession.set(sessionId, next);
      return message;
    },
    addMessageDom: (message) => calls.push(['add-dom', message.id]),
    removePendingMessage: (messageId, sessionId) => {
      calls.push(['remove-pending', sessionId, messageId]);
      pendingBySession.set(sessionId, (pendingBySession.get(sessionId) || []).filter((message) => message.id !== messageId));
    },
    refreshChatAndContacts: () => calls.push(['refresh']),
    isSessionActive: () => true,
    isChatRoomVisible: () => true,
    hideMenus: () => calls.push(['hide']),
  });

  runtime.bindPendingFloatSelection();
  runtime.bindPendingFloatMenu();
  runtime.updatePendingFloat('s1');
  pendingFloat.el.trigger('click', { target: pendingFloat.listEl.children[0] });
  menu.trigger('click', { target: sendBtn });
  await Promise.resolve();

  assert.deepEqual(calls, [
    ['append', 's1', 'p1', 'pending'],
    ['add-dom', 'p1'],
    ['remove-pending', 's1', 'p1'],
    ['refresh'],
    ['hide'],
  ]);
  assert.equal(runtime.getActivePending(), null);
  console.log('ok - createPendingFloatRuntime sends selected pending messages through menu actions');
}

{
  const { pendingFloat } = createPendingFloatParts();
  const calls = [];
  const historyBySession = new Map([
    ['s1', [
      { id: 'h1', status: 'pending' },
      { id: 'h2', status: 'sent' },
      { id: 'h3', status: 'pending' },
    ]],
  ]);
  const pendingBySession = new Map([
    ['s1', [{ id: 'h3', status: 'pending' }]],
  ]);
  const runtime = createPendingFloatRuntime({
    pendingFloat,
    getCurrentSessionId: () => 's1',
    getPendingMessages: (sessionId) => pendingBySession.get(sessionId) || [],
    getMessages: (sessionId) => historyBySession.get(sessionId) || [],
    addPendingMessage: (message, sessionId) => calls.push(['queue', sessionId, message.id]),
    deleteMessage: (messageId, sessionId) => calls.push(['delete-history', sessionId, messageId]),
    removeMessageDom: (messageId) => calls.push(['remove-dom', messageId]),
    refreshChatAndContacts: () => calls.push(['refresh']),
    updateMessage: (messageId, patch, sessionId) => {
      calls.push(['update', sessionId, messageId, patch.status]);
      return { id: messageId, status: patch.status };
    },
    updateMessageDom: (messageId, message) => calls.push(['update-dom', messageId, message.status]),
    removePendingMessage: (messageId, sessionId) => calls.push(['remove-pending', sessionId, messageId]),
  });

  const moved = runtime.movePendingFromHistoryToQueue('s1');
  runtime.finalizePendingMessages('s1', [{ id: 'h1' }, { id: 'h3' }]);

  assert.deepEqual(moved.map((message) => message.id), ['h1', 'h3']);
  assert.deepEqual(calls, [
    ['queue', 's1', 'h1'],
    ['delete-history', 's1', 'h1'],
    ['remove-dom', 'h1'],
    ['delete-history', 's1', 'h3'],
    ['remove-dom', 'h3'],
    ['refresh'],
    ['update', 's1', 'h1', 'sent'],
    ['update-dom', 'h1', 'sent'],
    ['update', 's1', 'h3', 'sent'],
    ['update-dom', 'h3', 'sent'],
    ['remove-pending', 's1', 'h3'],
  ]);
  console.log('ok - createPendingFloatRuntime moves pending history into queue and finalizes confirmed sends');
}
