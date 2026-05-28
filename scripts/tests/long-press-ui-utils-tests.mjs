import assert from 'node:assert/strict';

import { createLongPressUiRuntime } from '../../src/scripts/ui/chat/long-press-ui-utils.js';

const createTimerHarness = () => {
  let nextId = 1;
  const timers = new Map();
  return {
    timers,
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
  const harness = createTimerHarness();
  const runtime = createLongPressUiRuntime({
    schedule: harness.schedule,
    clearSchedule: harness.clear,
  });
  let timer = null;
  let start = null;
  let triggered = null;
  const started = runtime.startLongPress({
    selectionMode: false,
    event: { x: 1, y: 2 },
    message: { id: 'm1' },
    getPoint: event => ({ x: event.x, y: event.y }),
    clearExisting: () => {
      timer = null;
      start = null;
    },
    setLongPressStart: value => {
      start = value;
    },
    setLongPressTimer: value => {
      timer = value;
    },
    onTrigger: (event, message) => {
      triggered = [event, message];
    },
  });
  assert.equal(started, true);
  assert.deepEqual(start, { x: 1, y: 2 });
  harness.run(timer);
  assert.deepEqual(triggered, [{ x: 1, y: 2 }, { id: 'm1' }]);
  console.log('ok - startLongPress stores point and triggers callback after delay');
}

{
  const harness = createTimerHarness();
  const runtime = createLongPressUiRuntime({
    schedule: harness.schedule,
    clearSchedule: harness.clear,
    hasActiveTextSelection: () => true,
  });
  let timer = null;
  let delay = 0;
  let triggered = false;
  const selectableTarget = {
    closest(selector) {
      return String(selector || '').includes('.QQ_chat_msgdiv') ? {} : null;
    },
  };
  const started = runtime.startLongPress({
    selectionMode: false,
    event: { type: 'pointerdown', target: selectableTarget },
    message: { id: 'm-select' },
    getPoint: () => ({ x: 0, y: 0 }),
    clearExisting() {},
    setLongPressStart() {},
    setLongPressTimer(value) {
      timer = value;
      delay = harness.timers?.get?.(value)?.delay || 0;
    },
    onTrigger() {
      triggered = true;
    },
  });
  assert.equal(started, true);
  assert.equal(delay, 680);
  harness.run(timer);
  assert.equal(triggered, false);
  console.log('ok - startLongPress lets native text selection win for selectable message text');
}

{
  const runtime = createLongPressUiRuntime();
  let called = false;
  const started = runtime.startLongPress({
    selectionMode: true,
    clearExisting: () => {
      called = true;
    },
  });
  assert.equal(started, false);
  assert.equal(called, false);
  console.log('ok - startLongPress ignores presses while selection mode is active');
}

{
  const harness = createTimerHarness();
  const runtime = createLongPressUiRuntime({
    schedule: harness.schedule,
    clearSchedule: harness.clear,
  });
  let timer = harness.schedule(() => {}, 500);
  let start = { x: 3, y: 4 };
  runtime.clearLongPress({
    getLongPressTimer: () => timer,
    setLongPressTimer: value => {
      timer = value;
    },
    setLongPressStart: value => {
      start = value;
    },
  });
  assert.equal(timer, null);
  assert.equal(start, null);
  console.log('ok - clearLongPress clears pending timer and start point');
}

{
  const runtime = createLongPressUiRuntime();
  const listeners = new Map();
  const wrapper = {
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
  };
  let timerActive = true;
  let start = { x: 0, y: 0 };
  const started = [];
  const cleared = [];
  const menus = [];
  runtime.bindMessageContextInteractions({
    wrapper,
    message: { id: 'm-bind' },
    getLongPressTimer: () => (timerActive ? 1 : null),
    getLongPressStart: () => start,
    getPoint: event => event.point,
    clearLongPress: () => {
      cleared.push('clear');
      timerActive = false;
    },
    startLongPress: (event, message) => started.push([event.type, message.id]),
    showContextMenu: (event, message) => menus.push([event.type, message.id]),
  });
  listeners.get('pointerdown')({ type: 'pointerdown' });
  listeners.get('pointermove')({ point: { x: 20, y: 0 } });
  listeners.get('pointerup')();
  listeners.get('contextmenu')({
    type: 'contextmenu',
    preventDefault() {},
  });
  assert.deepEqual(started, [['pointerdown', 'm-bind']]);
  assert.deepEqual(cleared, ['clear', 'clear', 'clear']);
  assert.deepEqual(menus, [['contextmenu', 'm-bind']]);
  console.log('ok - bindMessageContextInteractions wires press move release and context menu flows');
}

{
  const runtime = createLongPressUiRuntime({
    hasActiveTextSelection: () => true,
  });
  const listeners = new Map();
  const wrapper = {
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
  };
  let prevented = false;
  let cleared = false;
  let menuShown = false;
  const selectableTarget = {
    closest(selector) {
      return String(selector || '').includes('.QQ_chat_msgdiv') ? {} : null;
    },
  };
  runtime.bindMessageContextInteractions({
    wrapper,
    message: { id: 'm-selected' },
    clearLongPress: () => {
      cleared = true;
    },
    startLongPress() {},
    showContextMenu: () => {
      menuShown = true;
    },
  });
  listeners.get('contextmenu')({
    type: 'contextmenu',
    target: selectableTarget,
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(cleared, true);
  assert.equal(prevented, false);
  assert.equal(menuShown, false);
  console.log('ok - context menu yields to native selected text menu');
}
