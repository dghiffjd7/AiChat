import assert from 'node:assert/strict';

import {
  createRpMessageActionsElement,
  createRpMessageActionsUiRuntime,
  dispatchRpMessageQuickAction,
} from '../../src/scripts/ui/chat/rp-message-actions-ui-utils.js';

const createClassList = (...initial) => {
  const classes = new Set(initial);
  return {
    add: (...tokens) => tokens.forEach(token => classes.add(token)),
    remove: (...tokens) => tokens.forEach(token => classes.delete(token)),
    contains: token => classes.has(token),
  };
};

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = String(tagName || '').toUpperCase();
      this.className = '';
      this.children = [];
      this.dataset = {};
      this.attributes = new Map();
      this.innerHTML = '';
    }
    appendChild(child) {
      this.children.push(child);
      child.parentElement = this;
      return child;
    }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }
  }
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
};

{
  const documentLike = createFakeDocument();
  const swipe = documentLike.createElement('div');
  const actions = createRpMessageActionsElement({
    documentLike,
    message: { id: 'm-actions' },
    createSwipeIndicatorElement: () => swipe,
  });
  assert.equal(actions.className, 'rp-message-actions');
  assert.equal(actions.dataset.msgId, 'm-actions');
  assert.equal(actions.children[0], swipe);
  const buttons = actions.children[1].children;
  assert.deepEqual(buttons.map(button => button.dataset.rpMessageAction), ['regenerate', 'speak', 'view-code', 'copy']);
  assert.equal(buttons.every(button => button.innerHTML.includes('<svg')), true);
  assert.deepEqual(
    buttons.map(button => button.attributes.get('aria-label')),
    ['重新生成', '朗读', '编辑原回复', '复制'],
  );
  console.log('ok - createRpMessageActionsElement builds swipe and svg action controls in the requested order');
}

{
  const documentLike = createFakeDocument();
  const actions = createRpMessageActionsElement({
    documentLike,
    message: { id: 'u-actions', role: 'user' },
    kind: 'user',
  });
  assert.equal(actions.className.includes('is-user'), true);
  assert.deepEqual(
    actions.children[0].children.map(button => button.dataset.rpMessageAction),
    ['copy', 'edit'],
  );
  console.log('ok - createRpMessageActionsElement builds the compact user copy/edit action pair');
}

{
  const calls = [];
  const message = { id: 'u-edit', role: 'user' };
  assert.equal(await dispatchRpMessageQuickAction({
    action: 'edit',
    message,
    startInlineEdit: nextMessage => calls.push(['edit', nextMessage.id]),
    actionHandler: (...args) => calls.push(['action', ...args]),
  }), true);
  assert.equal(await dispatchRpMessageQuickAction({
    action: 'copy',
    message,
    wrapper: { id: 'wrapper' },
    startInlineEdit: () => {},
    actionHandler: (...args) => calls.push(['action', ...args]),
  }), true);
  assert.deepEqual(calls, [
    ['edit', 'u-edit'],
    ['action', 'copy-text', message, { wrapper: { id: 'wrapper' } }],
  ]);
  console.log('ok - creative user pencil opens inline editing while copy reuses the shared action handler');
}

const createWrapper = (id, role = 'assistant') => ({
  classList: createClassList(
    role === 'user' ? 'QQ_chat_mymsg' : 'QQ_chat_charmsg',
    'has-rp-message-actions',
    ...(role === 'assistant' ? ['has-rp-message-chrome'] : []),
  ),
  __chatappMessage: { id, role },
});

const createActionTarget = (wrapper, action) => ({
  dataset: { rpMessageAction: action },
  disabled: false,
  closest(selector) {
    if (selector === '[data-rp-message-action]') return this;
    if (selector === '.has-rp-message-actions') return wrapper;
    return null;
  },
});

const createBubbleTarget = wrapper => {
  const bubble = {
    closest(selector) {
      return selector === '.has-rp-message-actions' ? wrapper : null;
    },
  };
  return {
    closest(selector) {
      if (selector === '[data-rp-message-action]') return null;
      if (selector === 'a, button, input, textarea, select, audio, video, [contenteditable="true"]') return null;
      if (selector === '.QQ_chat_msgdiv') return bubble;
      return null;
    },
  };
};

{
  const listeners = new Map();
  const scheduled = [];
  const cleared = [];
  const calls = [];
  const first = createWrapper('a1');
  const second = createWrapper('u2', 'user');
  const scrollEl = {
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type);
    },
  };
  const runtime = createRpMessageActionsUiRuntime({
    schedule(handler, delay) {
      const id = scheduled.length + 1;
      scheduled.push({ id, handler, delay });
      return id;
    },
    clearSchedule: id => cleared.push(id),
    isTouchLike: event => event?.pointerType === 'touch',
  });
  assert.equal(runtime.reveal({ classList: createClassList('QQ_chat_charmsg') }), false);
  const unbind = runtime.bind({
    scrollEl,
    onAction: (action, context) => calls.push([action, context.message.id, context.wrapper]),
  });
  const click = listeners.get('click');
  click({ target: createActionTarget(first, 'copy'), pointerType: 'mouse' });
  click({ target: createActionTarget(first, 'regenerate'), pointerType: 'mouse' });
  click({ target: createActionTarget(first, 'speak'), pointerType: 'mouse' });
  click({ target: createActionTarget(first, 'view-code'), pointerType: 'mouse' });
  assert.deepEqual(calls.map(([action, id]) => [action, id]), [
    ['copy', 'a1'],
    ['regenerate', 'a1'],
    ['speak', 'a1'],
    ['view-code', 'a1'],
  ]);

  click({ target: createBubbleTarget(first), pointerType: 'mouse' });
  assert.equal(first.classList.contains('is-rp-actions-visible'), false);
  click({ target: createBubbleTarget(first), pointerType: 'touch' });
  assert.equal(first.classList.contains('is-rp-actions-visible'), true);
  assert.equal(scheduled[0].delay, 5000);

  click({ target: createBubbleTarget(second), pointerType: 'touch' });
  assert.equal(first.classList.contains('is-rp-actions-visible'), false);
  assert.equal(second.classList.contains('is-rp-actions-visible'), true);
  assert.deepEqual(cleared, [1]);
  scheduled[1].handler();
  assert.equal(second.classList.contains('is-rp-actions-visible'), false);

  click({ target: createBubbleTarget(first), pointerType: 'touch' });
  unbind();
  assert.equal(listeners.has('click'), false);
  assert.equal(first.classList.contains('is-rp-actions-visible'), false);
  assert.deepEqual(cleared, [1, 3]);
  console.log('ok - delegated rp actions route existing behavior and touch reveal expires after five seconds');
}
