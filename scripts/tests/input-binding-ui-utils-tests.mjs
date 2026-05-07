import assert from 'node:assert/strict';

import {
  bindDebouncedInputChangeCore,
  bindFocusScrollCore,
  bindInputAutosizeCore,
  bindOptionalClickCore,
  bindSendCore,
  bindSendWithModeCore,
  createNetworkStatusRuntime,
  setSessionLabelCore,
} from '../../src/scripts/ui/chat/input-binding-ui-utils.js';

const createEmitter = () => ({
  listeners: new Map(),
  style: {},
  value: '',
  scrollHeight: 88,
  textContent: '',
  setAttribute(name, value) {
    if (!this.attributes) this.attributes = new Map();
    this.attributes.set(name, value);
  },
  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  },
  dispatch(type, event = {}) {
    const list = this.listeners.get(type) || [];
    list.forEach((handler) => handler({
      preventDefault() {},
      key: '',
      shiftKey: false,
      ...event,
    }));
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
  const inputEl = createEmitter();
  const timers = createTimerHarness();
  bindInputAutosizeCore(inputEl, {
    schedule: timers.schedule,
  });
  assert.equal(inputEl.attributes.get('rows'), '1');
  timers.run(2);
  assert.equal(inputEl.style.height, '88px');
  inputEl.scrollHeight = 120;
  inputEl.dispatch('input');
  assert.equal(inputEl.style.height, '120px');
  console.log('ok - bindInputAutosizeCore initializes rows and resizes on input');
}

{
  const inputEl = createEmitter();
  const timers = createTimerHarness();
  let scrolled = 0;
  bindFocusScrollCore(inputEl, {
    schedule: timers.schedule,
    onFocusScroll: () => {
      scrolled += 1;
    },
  });
  inputEl.dispatch('focus');
  timers.run(2);
  assert.equal(scrolled, 1);
  console.log('ok - bindFocusScrollCore schedules delayed scroll on focus');
}

{
  const sendBtn = createEmitter();
  const inputEl = createEmitter();
  let count = 0;
  bindSendCore(sendBtn, inputEl, () => {
    count += 1;
  });
  sendBtn.dispatch('click');
  inputEl.dispatch('keydown', { key: 'Enter', shiftKey: false });
  assert.equal(count, 2);
  console.log('ok - bindSendCore wires click and enter-submit handlers');
}

{
  const sendBtn = createEmitter();
  const inputEl = createEmitter();
  let sendCount = 0;
  let enterCount = 0;
  let blocked = true;
  bindSendWithModeCore(sendBtn, inputEl, {
    onEnter: () => {
      enterCount += 1;
    },
    onSendButton: () => {
      sendCount += 1;
    },
    getSendClickGuard: () => () => blocked,
  });
  sendBtn.dispatch('click');
  blocked = false;
  sendBtn.dispatch('click');
  inputEl.dispatch('keydown', { key: 'Enter', shiftKey: false });
  assert.equal(sendCount, 1);
  assert.equal(enterCount, 1);
  console.log('ok - bindSendWithModeCore respects click guard and separates enter/send flows');
}

{
  const buttonEl = createEmitter();
  let clicks = 0;
  assert.equal(bindOptionalClickCore(buttonEl, () => { clicks += 1; }), true);
  buttonEl.dispatch('click');
  assert.equal(clicks, 1);
  assert.equal(bindOptionalClickCore(null, () => {}), false);
  console.log('ok - bindOptionalClickCore binds only when both element and handler exist');
}

{
  const events = new Map();
  const windowLike = {
    addEventListener(type, handler) {
      events.set(type, handler);
    },
  };
  const navigatorLike = { onLine: false };
  const calls = [];
  const runtime = createNetworkStatusRuntime({
    navigatorLike,
    windowLike,
    onOffline: () => calls.push('offline'),
    onOnline: () => calls.push('online'),
  });
  runtime.bind();
  navigatorLike.onLine = true;
  events.get('online')();
  assert.deepEqual(calls, ['offline', 'online']);
  console.log('ok - createNetworkStatusRuntime binds online/offline listeners and applies initial status');
}

{
  const labelEl = createEmitter();
  const badgeEl = createEmitter();
  setSessionLabelCore(labelEl, badgeEl, 'group:demo');
  assert.equal(labelEl.textContent, 'group:demo');
  assert.equal(badgeEl.textContent, '群聊');
  setSessionLabelCore(labelEl, badgeEl, 'chat:demo');
  assert.equal(badgeEl.textContent, '单聊');
  console.log('ok - setSessionLabelCore updates label and session badge text');
}

{
  const inputEl = createEmitter();
  const timers = createTimerHarness();
  const values = [];
  bindDebouncedInputChangeCore(inputEl, (value) => {
    values.push(value);
  }, {
    schedule: timers.schedule,
    clearSchedule: timers.clear,
    delay: 500,
  });
  inputEl.value = 'a';
  inputEl.dispatch('input');
  inputEl.value = 'ab';
  inputEl.dispatch('input');
  timers.run(3);
  assert.deepEqual(values, ['ab']);
  console.log('ok - bindDebouncedInputChangeCore debounces successive input updates');
}
