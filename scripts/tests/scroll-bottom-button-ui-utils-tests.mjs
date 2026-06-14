import assert from 'node:assert/strict';

import {
  createScrollBottomButtonUiRuntime,
  getScrollDistanceFromBottom,
  getScrollDistanceFromTop,
  isNearBottom,
  resolveScrollBottomButtonThresholds,
  resolveScrollTopButtonThresholds,
} from '../../src/scripts/ui/chat/scroll-bottom-button-ui-utils.js';

const createClassList = () => {
  const set = new Set();
  return {
    add: (...tokens) => tokens.forEach(token => set.add(token)),
    remove: (...tokens) => tokens.forEach(token => set.delete(token)),
    contains: token => set.has(token),
  };
};

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = String(tagName || '').toUpperCase();
      this.children = [];
      this.parentElement = null;
      this.className = '';
      this.classList = createClassList();
      this.style = {};
      this.dataset = {};
      this.innerHTML = '';
      this.listeners = new Map();
    }
    appendChild(child) {
      this.children.push(child);
      child.parentElement = this;
      return child;
    }
    setAttribute() {}
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
    click() {
      this.listeners.get('click')?.();
    }
    remove() {
      this.removed = true;
    }
  }
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
};

{
  const scrollEl = {
    scrollHeight: 1200,
    clientHeight: 400,
    scrollTop: 620,
  };
  assert.equal(getScrollDistanceFromBottom(scrollEl), 180);
  assert.equal(getScrollDistanceFromTop(scrollEl), 620);
  assert.equal(isNearBottom(scrollEl, 200), true);
  assert.equal(isNearBottom(scrollEl, 100), false);
  assert.deepEqual(resolveScrollBottomButtonThresholds({ clientHeight: 500 }), {
    show: 290,
    hide: 90,
  });
  assert.deepEqual(resolveScrollTopButtonThresholds({ clientHeight: 500 }), {
    show: 290,
    hide: 90,
  });
  console.log('ok - scroll bottom helpers resolve distance near-bottom state and thresholds');
}

{
  const documentLike = createFakeDocument();
  const host = documentLike.createElement('div');
  let clicked = 0;
  const timers = [];
  const runtime = createScrollBottomButtonUiRuntime({
    documentLike,
    schedule: (handler, delay) => {
      timers.push([handler, delay]);
      return timers.length;
    },
  });
  const button = runtime.ensureButton({
    scrollEl: { parentElement: host },
    existingButtonEl: null,
    onClick: () => {
      clicked += 1;
    },
  });
  assert.equal(host.children[0], button);
  button.click();
  assert.equal(clicked, 1);
  runtime.showButton({ buttonEl: button, immediate: true });
  assert.equal(button.classList.contains('is-visible'), true);
  assert.equal(button.classList.contains('is-immediate'), true);
  timers[0][0]();
  assert.equal(button.classList.contains('is-immediate'), false);
  runtime.hideButton({ buttonEl: button, immediate: true });
  assert.equal(button.classList.contains('is-visible'), false);
  timers[1][0]();
  assert.equal(button.classList.contains('is-immediate'), false);
  console.log('ok - scroll bottom runtime mounts button and toggles immediate visible states');
}

{
  const documentLike = createFakeDocument();
  const host = documentLike.createElement('div');
  let clicked = 0;
  const runtime = createScrollBottomButtonUiRuntime({ documentLike, schedule: () => null });
  const button = runtime.ensureTopButton({
    scrollEl: { parentElement: host },
    existingButtonEl: null,
    onClick: () => {
      clicked += 1;
    },
  });
  assert.equal(button.className, 'chat-scroll-top-btn');
  assert.equal(host.children[0], button);
  button.click();
  assert.equal(clicked, 1);
  console.log('ok - scroll runtime mounts top button and wires click callback');
}

{
  const runtime = createScrollBottomButtonUiRuntime({
    documentLike: createFakeDocument(),
    schedule: () => null,
  });
  const button = createFakeDocument().createElement('button');
  runtime.refreshTopButton({
    scrollEl: {
      scrollHeight: 1200,
      clientHeight: 400,
      scrollTop: 260,
    },
    buttonEl: button,
    hideButton: options => runtime.hideButton({ buttonEl: button, ...options }),
    showButton: options => runtime.showButton({ buttonEl: button, ...options }),
  });
  assert.equal(button.classList.contains('is-visible'), true);
  runtime.refreshTopButton({
    scrollEl: {
      scrollHeight: 1200,
      clientHeight: 400,
      scrollTop: 20,
    },
    buttonEl: button,
    hideButton: options => runtime.hideButton({ buttonEl: button, ...options }),
    showButton: options => runtime.showButton({ buttonEl: button, ...options }),
  });
  assert.equal(button.classList.contains('is-visible'), false);
  console.log('ok - refreshTopButton toggles visibility by scroll distance from top');
}

{
  const documentLike = createFakeDocument();
  const runtime = createScrollBottomButtonUiRuntime({ documentLike, schedule: () => null });
  const button = documentLike.createElement('button');
  const floating = {
    removed: false,
    remove() {
      this.removed = true;
    },
  };
  let floated = 0;
  runtime.refreshButton({
    scrollEl: {
      scrollHeight: 1200,
      clientHeight: 400,
      scrollTop: 200,
    },
    buttonEl: button,
    immediate: false,
    typingEl: { id: 'typing' },
    floatingTypingEl: null,
    hideButton: options => runtime.hideButton({ buttonEl: button, ...options }),
    showButton: options => runtime.showButton({ buttonEl: button, ...options }),
    hideFloatingTyping: () => {},
    showFloatingTyping: () => {
      floated += 1;
    },
  });
  assert.equal(button.classList.contains('is-visible'), true);
  assert.equal(floated, 1);
  runtime.refreshButton({
    scrollEl: {
      scrollHeight: 1200,
      clientHeight: 400,
      scrollTop: 800,
    },
    buttonEl: button,
    immediate: true,
    typingEl: { id: 'typing' },
    floatingTypingEl: floating,
    hideButton: options => runtime.hideButton({ buttonEl: button, ...options }),
    showButton: options => runtime.showButton({ buttonEl: button, ...options }),
    hideFloatingTyping: value => value?.remove?.(),
    showFloatingTyping: () => {},
  });
  assert.equal(floating.removed, true);
  console.log('ok - refreshButton toggles button visibility and floating typing by scroll position');
}

{
  const runtime = createScrollBottomButtonUiRuntime({
    documentLike: createFakeDocument(),
    schedule: () => null,
  });
  const frameQueue = [];
  let refreshCalls = 0;
  let rafId = 0;
  let pendingImmediate = false;
  runtime.scheduleRefresh({
    immediate: false,
    getPendingImmediate: () => pendingImmediate,
    setPendingImmediate: value => {
      pendingImmediate = value;
    },
    getRafId: () => rafId,
    setRafId: value => {
      rafId = value;
    },
    scheduleFrame: handler => {
      frameQueue.push(handler);
      return frameQueue.length;
    },
    refresh: ({ immediate }) => {
      refreshCalls += immediate ? 10 : 1;
    },
  });
  runtime.scheduleRefresh({
    immediate: true,
    getPendingImmediate: () => pendingImmediate,
    setPendingImmediate: value => {
      pendingImmediate = value;
    },
    getRafId: () => rafId,
    setRafId: value => {
      rafId = value;
    },
    scheduleFrame: handler => {
      frameQueue.push(handler);
      return frameQueue.length;
    },
    refresh: ({ immediate }) => {
      refreshCalls += immediate ? 10 : 1;
    },
  });
  assert.equal(frameQueue.length, 1);
  frameQueue[0]();
  assert.equal(refreshCalls, 10);
  assert.equal(pendingImmediate, false);
  assert.equal(rafId, 0);
  console.log('ok - scheduleRefresh coalesces frames and preserves immediate refresh intent');
}
