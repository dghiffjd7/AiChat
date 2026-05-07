import assert from 'node:assert/strict';

import { createLongPressUiRuntime } from '../../src/scripts/ui/chat/long-press-ui-utils.js';

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
