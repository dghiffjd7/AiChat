import assert from 'node:assert/strict';

import {
  applyJumpFocusState,
  clearJumpFocusState,
  resolveJumpFocusElements,
  shouldDismissJumpFocusOnScroll,
} from '../../src/scripts/ui/chat/jump-focus-ui-utils.js';

const createClassList = () => {
  const set = new Set();
  return {
    add: (...tokens) => tokens.forEach(token => set.add(token)),
    remove: (...tokens) => tokens.forEach(token => set.delete(token)),
    contains: token => set.has(token),
  };
};

const createWrapper = () => {
  const focusEl = {
    classList: createClassList(),
    querySelector(selector) {
      if (selector === '.chat-message-content') return this.textRoot;
      return null;
    },
    textRoot: { id: 'text-root' },
  };
  return {
    dataset: {},
    classList: createClassList(),
    querySelector(selector) {
      if (selector === '.QQ_chat_msgdiv') return focusEl;
      return null;
    },
    focusEl,
  };
};

{
  const wrapper = createWrapper();
  const { focusEl, textRoot } = resolveJumpFocusElements(wrapper);
  assert.equal(focusEl, wrapper.focusEl);
  assert.equal(textRoot, wrapper.focusEl.textRoot);
  console.log('ok - resolveJumpFocusElements prefers message bubble and nested text root');
}

{
  assert.equal(shouldDismissJumpFocusOnScroll({
    state: {
      dismissOnScroll: true,
      wrapper: {},
      ignoreScrollUntil: 200,
      scrollTop: 100,
    },
    currentTop: 120,
    now: 100,
  }), false);
  assert.equal(shouldDismissJumpFocusOnScroll({
    state: {
      dismissOnScroll: true,
      wrapper: {},
      ignoreScrollUntil: 100,
      scrollTop: 100,
    },
    currentTop: 103,
    now: 200,
  }), false);
  assert.equal(shouldDismissJumpFocusOnScroll({
    state: {
      dismissOnScroll: true,
      wrapper: {},
      ignoreScrollUntil: 100,
      scrollTop: 100,
    },
    currentTop: 108,
    now: 200,
  }), true);
  console.log('ok - shouldDismissJumpFocusOnScroll respects ignore window and movement threshold');
}

{
  const wrapper = createWrapper();
  const state = {
    wrapper,
    focusEl: wrapper.focusEl,
    textRoot: wrapper.focusEl.textRoot,
    timer: 9,
  };
  wrapper.classList.add('chat-jump-focus-line');
  wrapper.dataset.chatJumpKind = 'anchor';
  wrapper.focusEl.classList.add('chat-jump-focus-target');
  const cleared = [];
  const next = clearJumpFocusState(state, {
    clearTimer: timerId => {
      cleared.push(['timer', timerId]);
    },
    clearHighlights: root => {
      cleared.push(['root', root]);
    },
  });
  assert.equal(next, null);
  assert.equal(wrapper.classList.contains('chat-jump-focus-line'), false);
  assert.equal(wrapper.focusEl.classList.contains('chat-jump-focus-target'), false);
  assert.equal('chatJumpKind' in wrapper.dataset, false);
  assert.deepEqual(cleared[0], ['timer', 9]);
  console.log('ok - clearJumpFocusState clears timer classes dataset and highlights');
}

{
  const wrapper = createWrapper();
  let storedState = null;
  const timers = [];
  const applied = applyJumpFocusState(wrapper, {
    keyword: '关键字',
    kind: 'search',
    dismissOnScroll: false,
    autoClearMs: 500,
    clearExisting: () => {
      storedState = 'cleared';
    },
    resolveElements: value => resolveJumpFocusElements(value),
    highlightKeyword: (root, term) => {
      storedState = [root, term];
    },
    getScrollTop: () => 88,
    now: 1000,
    schedule: (handler, delay) => {
      timers.push([handler, delay]);
      return timers.length;
    },
    onAutoClear: value => {
      value.classList.remove('chat-jump-focus-line');
    },
    setState: value => {
      storedState = value;
    },
  });
  assert.equal(applied, true);
  assert.equal(wrapper.classList.contains('chat-jump-focus-line'), true);
  assert.equal(wrapper.focusEl.classList.contains('chat-jump-focus-target'), true);
  assert.equal(wrapper.dataset.chatJumpKind, 'search');
  assert.equal(storedState.dismissOnScroll, false);
  assert.equal(storedState.scrollTop, 88);
  assert.equal(storedState.ignoreScrollUntil, 1260);
  assert.equal(timers[0][1], 500);
  timers[0][0]();
  assert.equal(wrapper.classList.contains('chat-jump-focus-line'), false);
  console.log('ok - applyJumpFocusState applies classes stores state and auto-clear timer');
}
