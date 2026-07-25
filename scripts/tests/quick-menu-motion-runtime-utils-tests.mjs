import assert from 'node:assert/strict';

import { createQuickMenuMotionRuntime } from '../../src/scripts/ui/quick-menu-motion-runtime-utils.js';

const createClassList = (initial = []) => {
  const values = new Set(initial);
  return {
    add: (...tokens) => tokens.forEach(token => values.add(token)),
    remove: (...tokens) => tokens.forEach(token => values.delete(token)),
    contains: token => values.has(token),
    toggle: (token, force) => {
      if (force === true) values.add(token);
      else if (force === false) values.delete(token);
      else if (values.has(token)) values.delete(token);
      else values.add(token);
      return values.has(token);
    },
  };
};

const createTrigger = () => {
  const attrs = new Map();
  return {
    classList: createClassList(),
    setAttribute(name, value) {
      attrs.set(name, String(value));
    },
    getAttribute(name) {
      return attrs.get(name);
    },
  };
};

{
  const frames = [];
  const timers = [];
  const windowListeners = {};
  const menu = {
    classList: createClassList(['hidden']),
    setAttribute(name, value) {
      this[name] = String(value);
    },
  };
  const triggerA = createTrigger();
  const triggerB = createTrigger();
  const runtime = createQuickMenuMotionRuntime({
    menuEl: menu,
    triggerEls: [triggerA, triggerB],
    requestFrame: callback => frames.push(callback),
    schedule: callback => {
      timers.push(callback);
      return timers.length;
    },
    cancelSchedule: () => {},
    windowRef: {
      addEventListener(type, handler) {
        windowListeners[type] = handler;
      },
    },
  });

  runtime.open(triggerA);
  assert.equal(menu.classList.contains('hidden'), false);
  assert.equal(menu.classList.contains('is-open'), false);
  assert.equal(triggerA.classList.contains('is-open'), true);
  assert.equal(triggerA.getAttribute('aria-expanded'), 'true');
  assert.equal(triggerB.getAttribute('aria-expanded'), 'false');

  frames.shift()();
  assert.equal(menu.classList.contains('is-open'), true);
  assert.equal(menu['aria-hidden'], 'false');
  assert.equal(runtime.getActiveTrigger(), triggerA);

  runtime.close();
  assert.equal(menu.classList.contains('is-open'), false);
  assert.equal(menu.classList.contains('is-closing'), true);
  assert.equal(menu.classList.contains('hidden'), false);
  assert.equal(triggerA.classList.contains('is-open'), false);
  assert.equal(triggerA.getAttribute('aria-expanded'), 'false');

  timers.shift()();
  assert.equal(menu.classList.contains('hidden'), true);
  assert.equal(menu.classList.contains('is-closing'), false);
  assert.equal(menu['aria-hidden'], 'true');

  runtime.open(triggerB);
  frames.shift()();
  windowListeners.keydown({ key: 'Escape' });
  assert.equal(menu.classList.contains('is-closing'), true);
  console.log('ok - quick menu animates open/close, rotates only its active trigger, and closes on Escape');
}
