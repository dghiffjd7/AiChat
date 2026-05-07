import assert from 'node:assert/strict';

import { createTypingIndicatorUiRuntime } from '../../src/scripts/ui/chat/typing-indicator-ui-utils.js';

const createClassList = () => {
  const set = new Set();
  return {
    add: (...tokens) => tokens.forEach(token => set.add(token)),
    remove: (...tokens) => tokens.forEach(token => set.delete(token)),
    contains: token => set.has(token),
  };
};

const createElement = () => ({
  classList: createClassList(),
  style: {},
  offsetHeight: 48,
  removed: false,
  remove() {
    this.removed = true;
  },
  cloneNode() {
    return {
      className: 'typing-indicator-wrap',
      removed: false,
      removeAttribute(name) {
        this.removedAttribute = name;
      },
      remove() {
        this.removed = true;
      },
    };
  },
});

const createTimerHarness = () => {
  let nextId = 1;
  const timers = new Map();
  return {
    schedule(handler, delay) {
      const id = nextId += 1;
      timers.set(id, { handler, delay });
      return id;
    },
    clear(id) {
      timers.delete(id);
    },
    run(id) {
      const entry = timers.get(id);
      if (!entry) return;
      timers.delete(id);
      entry.handler();
    },
  };
};

{
  const timers = createTimerHarness();
  const runtime = createTypingIndicatorUiRuntime({
    schedule: timers.schedule,
    clearSchedule: timers.clear,
  });
  let cycle = 11;
  let think = 12;
  let resume = 13;
  runtime.clearTypingTimers({
    getCycleTimer: () => cycle,
    setCycleTimer: value => {
      cycle = value;
    },
    getThinkTimer: () => think,
    setThinkTimer: value => {
      think = value;
    },
    getResumeTimer: () => resume,
    setResumeTimer: value => {
      resume = value;
    },
  });
  assert.equal(cycle, null);
  assert.equal(think, null);
  assert.equal(resume, null);
  console.log('ok - clearTypingTimers resets cycle think and resume timers');
}

{
  const timers = createTimerHarness();
  const runtime = createTypingIndicatorUiRuntime({
    schedule: timers.schedule,
    clearSchedule: timers.clear,
  });
  const typingEl = createElement();
  runtime.applyThinkPause({ typingEl });
  assert.equal(typingEl.classList.contains('typing-think-pause'), true);
  runtime.removeThinkPause({
    typingEl,
    typingNaturalHeight: 42,
  });
  assert.equal(typingEl.classList.contains('typing-think-pause'), false);
  assert.equal(typingEl.style.height, '42px');
  timers.run(2);
  assert.equal(typingEl.style.height, '');
  console.log('ok - think pause helpers toggle class and restore height after delay');
}

{
  const runtime = createTypingIndicatorUiRuntime();
  const host = {
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  };
  const sourceWrap = createElement();
  const currentFloating = createElement();
  let nextFloating = currentFloating;
  const clone = runtime.showFloatingTyping({
    scrollEl: { parentElement: host },
    sourceWrap,
    floatingTypingEl: currentFloating,
    setFloatingTypingEl: value => {
      nextFloating = value;
    },
  });
  assert.equal(currentFloating.removed, true);
  assert.equal(host.children[0], clone);
  assert.equal(clone.className, 'typing-indicator-floating');
  assert.equal(nextFloating, clone);
  console.log('ok - showFloatingTyping replaces previous clone and appends floating typing shell');
}

{
  const runtime = createTypingIndicatorUiRuntime();
  const typingEl = createElement();
  const floatingEl = createElement();
  let nextTyping = typingEl;
  let nextFloating = floatingEl;
  let removed = 0;
  const changed = runtime.removeTypingElement({
    typingEl,
    floatingTypingEl: floatingEl,
    setTypingEl: value => {
      nextTyping = value;
    },
    setFloatingTypingEl: value => {
      nextFloating = value;
    },
    onRemoved: () => {
      removed += 1;
    },
  });
  assert.equal(changed, true);
  assert.equal(typingEl.removed, true);
  assert.equal(floatingEl.removed, true);
  assert.equal(nextTyping, null);
  assert.equal(nextFloating, null);
  assert.equal(removed, 1);
  console.log('ok - removeTypingElement clears live and floating typing DOM together');
}
