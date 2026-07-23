import assert from 'node:assert/strict';

import { createMessageHeaderUiRuntime } from '../../src/scripts/ui/chat/message-header-ui-utils.js';

const createClassList = (owner) => {
  const set = new Set();
  const sync = () => {
    owner._className = [...set].join(' ');
  };
  return {
    add: (...tokens) => {
      tokens.filter(Boolean).forEach(token => set.add(token));
      sync();
    },
    remove: (...tokens) => {
      tokens.forEach(token => set.delete(token));
      sync();
    },
    contains: token => set.has(token),
    setFromString: (value) => {
      set.clear();
      String(value || '')
        .split(/\s+/)
        .filter(Boolean)
        .forEach(token => set.add(token));
      sync();
    },
  };
};

const matchesSelector = (element, selector) => {
  const parts = String(selector || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  return parts.some((part) => {
    if (part.startsWith('.')) {
      return String(element.className || '')
        .split(/\s+/)
        .includes(part.slice(1));
    }
    return String(element.tagName || '').toLowerCase() === part.toLowerCase();
  });
};

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = String(tagName || '').toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.dataset = {};
      this.style = {};
      this.textContent = '';
      this.type = '';
      this.value = '';
      this.disabled = false;
      this.src = '';
      this.alt = '';
      this.open = false;
      this.attributes = {};
      this.listeners = new Map();
      this._className = '';
      this.classList = createClassList(this);
      Object.defineProperty(this, 'className', {
        get: () => this._className,
        set: value => this.classList.setFromString(value),
      });
      let innerHtml = '';
      Object.defineProperty(this, 'innerHTML', {
        get: () => innerHtml,
        set: (value) => {
          innerHtml = String(value || '');
          this.children.forEach((child) => {
            child.parentNode = null;
          });
          this.children = [];
        },
      });
      Object.defineProperty(this, 'parentElement', {
        get: () => this.parentNode,
      });
    }
    appendChild(child) {
      child.parentNode?.removeChild?.(child);
      this.children.push(child);
      child.parentNode = this;
      return child;
    }
    insertBefore(child, reference) {
      if (!reference) return this.appendChild(child);
      const referenceIndex = this.children.indexOf(reference);
      if (referenceIndex < 0) return this.appendChild(child);
      child.parentNode?.removeChild?.(child);
      this.children.splice(referenceIndex, 0, child);
      child.parentNode = this;
      return child;
    }
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index < 0) return child;
      this.children.splice(index, 1);
      child.parentNode = null;
      return child;
    }
    remove() {
      this.parentNode?.removeChild?.(this);
    }
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }
    querySelector(selector) {
      for (const child of this.children) {
        if (matchesSelector(child, selector)) return child;
        const nested = child.querySelector?.(selector);
        if (nested) return nested;
      }
      return null;
    }
    closest(selector) {
      let current = this;
      while (current) {
        if (matchesSelector(current, selector)) return current;
        current = current.parentNode;
      }
      return null;
    }
    emit(type, event = {}) {
      return this.listeners.get(type)?.(event);
    }
  }

  return {
    body: { dataset: {} },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
};

const createRuntime = (overrides = {}) => {
  const documentLike = overrides.documentLike || createFakeDocument();
  const warningCalls = overrides.warningCalls || [];
  const actionCalls = overrides.actionCalls || [];
  const scrollCalls = overrides.scrollCalls || [];
  const greetingCalls = overrides.greetingCalls || [];
  const greetingSheetCalls = overrides.greetingSheetCalls || [];
  const bridge =
    overrides.bridge || {
      activeSessionId: 'session-rp',
      getRpGreetingState: () => ({
        sessionId: 'session-rp',
        activeId: 'greeting-1',
        greetings: [
          { id: 'greeting-1', title: '默认开场白' },
          { id: 'greeting-2', title: '备用开场白' },
        ],
      }),
      setRpGreeting: (...args) => greetingCalls.push(args),
    };
  return {
    documentLike,
    warningCalls,
    actionCalls,
    scrollCalls,
    greetingCalls,
    greetingSheetCalls,
    runtime: createMessageHeaderUiRuntime({
      documentLike,
      appSettings: overrides.appSettings || {
        get: () => ({
          reasoningAutoExpand: true,
        }),
      },
      createCustomSelectWrapper: overrides.createCustomSelectWrapper || ((select) => {
        const wrap = documentLike.createElement('div');
        const button = documentLike.createElement('button');
        wrap.appendChild(button);
        wrap.appendChild(select);
        return wrap;
      }),
      bindCustomSelectButton: overrides.bindCustomSelectButton || (({ buttonEl, fallback }) => {
        if (buttonEl) buttonEl.boundFallback = fallback;
      }),
      normalizeReplyTarget: overrides.normalizeReplyTarget || (value => (value ? { ...value } : null)),
      getDefaultReplyAvatar: overrides.getDefaultReplyAvatar || (() => 'reply-fallback.png'),
      getBridge: overrides.getBridge || (() => bridge),
      getUiMode: overrides.getUiMode || (() => documentLike.body.dataset.uiMode || ''),
      openRpGreetingSheet: overrides.openRpGreetingSheet || (() => greetingSheetCalls.push('open')),
      onAction: overrides.onAction || (async (...args) => {
        actionCalls.push(args);
        return false;
      }),
      scrollToMessage: overrides.scrollToMessage || ((...args) => {
        scrollCalls.push(args);
        return false;
      }),
      resolveMessageSessionId: overrides.resolveMessageSessionId || (() => 'session-fallback'),
      warningToast: overrides.warningToast || (text => warningCalls.push(text)),
    }),
  };
};

{
  const { runtime, documentLike } = createRuntime();
  const message = {
    meta: {
      reasoningDisplay: ' display ',
      reasoningLabel: '思考过程',
    },
  };
  assert.equal(runtime.getReasoningText(message), 'display');
  const target = { meta: {} };
  runtime.applyReasoningUiState(target, { meta: { reasoningCollapsed: true } });
  assert.equal(target.meta.reasoningCollapsed, true);
  const expandedTarget = { meta: { reasoningExpanded: true, reasoningCollapsed: false } };
  runtime.applyReasoningUiState(expandedTarget, { meta: { reasoningCollapsed: true, reasoningExpanded: false } });
  assert.equal(expandedTarget.meta.reasoningCollapsed, true);
  assert.equal(expandedTarget.meta.reasoningExpanded, false);
  const details = runtime.buildReasoningElement(message);
  assert.equal(details.open, true);
  const wrapper = documentLike.createElement('div');
  wrapper.className = 'QQ_chat_charmsg';
  wrapper.__chatappMessage = { meta: {} };
  wrapper.appendChild(details);
  details.open = false;
  details.emit('toggle');
  assert.equal(wrapper.__chatappMessage.meta.reasoningCollapsed, true);
  assert.equal(wrapper.__chatappMessage.meta.reasoningExpanded, false);
  console.log('ok - message header reasoning helpers preserve and update reasoning UI state');
}

{
  const { runtime } = createRuntime();
  const message = {
    meta: {
      reasoningDisplay: '第一行<br>第二行&lt;br /&gt;第三行&amp;lt;br&amp;gt;第四行',
    },
  };
  assert.equal(runtime.getReasoningText(message), '第一行\n第二行\n第三行\n第四行');
  const details = runtime.buildReasoningElement(message);
  assert.equal(details.children[1].textContent, '第一行\n第二行\n第三行\n第四行');
  console.log('ok - message header reasoning text treats escaped br markers as line breaks');
}

{
  const { runtime, documentLike, greetingSheetCalls } = createRuntime();
  documentLike.body.dataset.uiMode = 'rp';
  const el = runtime.buildGreetingSwitch({
    sessionId: 'session-rp',
    meta: { isGreeting: true },
  });
  assert.equal(el.className, 'rp-greeting-switch rp-greeting-card-header');
  assert.equal(el.querySelector('.rp-greeting-card-seal').textContent, '序');
  assert.equal(el.querySelector('.rp-greeting-card-kicker').textContent, '序　幕');
  assert.equal(el.querySelector('.rp-greeting-card-title').textContent, '默认开场白');
  const button = el.querySelector('.rp-greeting-card-change');
  assert.equal(button.textContent, '更换');
  button.emit('click', {
    preventDefault() {},
    stopPropagation() {},
  });
  assert.deepEqual(greetingSheetCalls, ['open']);
  console.log('ok - buildGreetingSwitch renders the opening-card masthead and opens the full greeting sheet');
}

{
  const { runtime, actionCalls, scrollCalls, warningCalls, documentLike } = createRuntime();
  documentLike.body.dataset.uiMode = 'rp';
  const message = {
    sessionId: 'session-main',
    meta: {
      isGreeting: true,
      reasoning: 'first chain',
      replyTo: {
        id: 'target-msg',
        author: 'Alice',
        content: '原始消息',
      },
    },
  };
  const bubble = documentLike.createElement('div');
  const content = runtime.prepareTextContainer(bubble, message);
  assert.equal(content.className, 'chat-message-content');
  assert.equal(bubble.children.length, 5);
  assert.equal(bubble.children[1].className, 'rp-greeting-switch rp-greeting-card-header');
  assert.equal(bubble.children[2].className, 'chat-reasoning');
  assert.equal(bubble.children[3], content);
  assert.equal(bubble.children[4].className, 'rp-greeting-card-footer');
  assert.equal(bubble.children[4].textContent, '—— 幕 启 ——');
  const replyButton = bubble.children[0];
  await replyButton.emit('click', {
    preventDefault() {},
    stopPropagation() {},
  });
  assert.equal(actionCalls[0][0], 'jump-reply-target');
  assert.equal(actionCalls[0][2].sessionId, 'session-main');
  assert.deepEqual(scrollCalls, [['target-msg', { keyword: '原始消息', kind: 'anchor' }]]);
  assert.deepEqual(warningCalls, ['未找到被回复的消息']);
  console.log('ok - prepareTextContainer preserves header order and reply preview fallback flow');
}

{
  const { runtime, documentLike } = createRuntime();
  const message = {
    meta: {
      reasoning: 'first chain',
    },
  };
  const bubble = documentLike.createElement('div');
  const firstContent = runtime.prepareTextContainer(bubble, message);
  const firstReasoning = bubble.children[0];
  firstContent.textContent = 'rendered body';
  const secondContent = runtime.prepareTextContainer(bubble, {
    meta: {
      reasoning: 'updated chain',
    },
  });
  assert.equal(secondContent, firstContent);
  assert.equal(secondContent.textContent, 'rendered body');
  assert.equal(bubble.children.length, 2);
  assert.equal(bubble.children[0], firstReasoning);
  assert.equal(firstReasoning.open, true);
  assert.equal(firstReasoning.children[1].textContent, 'updated chain');
  assert.equal(bubble.children[1], firstContent);
  firstReasoning.open = false;
  runtime.prepareTextContainer(bubble, {
    meta: {
      reasoning: 'closing should survive the next stream frame',
      reasoningExpanded: true,
    },
  });
  assert.equal(firstReasoning.open, false);
  console.log('ok - prepareTextContainer keeps the reasoning disclosure stable while streaming updates its text');
}

{
  const { runtime, documentLike } = createRuntime({
    appSettings: {
      get: () => ({
        reasoningAutoExpand: false,
      }),
    },
  });
  const bubble = documentLike.createElement('div');
  const result = runtime.prepareTextContainer(bubble, { meta: {} });
  assert.equal(result, bubble);
  assert.equal(bubble.children.length, 0);
  console.log('ok - prepareTextContainer leaves plain bubbles unchanged');
}
