import assert from 'node:assert/strict';

import {
  createDeliveryStatusUiRuntime,
  resolveDeliveryStatusTargets,
  syncDeliveryTextToMessages,
} from '../../src/scripts/ui/chat/delivery-status-ui-utils.js';

const createStatusEl = (text = '', msgId = 'm1') => {
  const wrapper = {
    dataset: { msgId },
    __chatappMessage: { meta: {} },
  };
  return {
    textContent: text,
    closest(selector) {
      return selector === '[data-msg-id]' ? wrapper : null;
    },
    __wrapper: wrapper,
  };
};

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
    list() {
      return [...timers.entries()];
    },
  };
};

{
  const matched = resolveDeliveryStatusTargets({
    querySelectorAll: () => [
      createStatusEl('✔ 已送出'),
      createStatusEl('已读3'),
      createStatusEl(''),
    ],
  });
  assert.equal(matched.length, 2);
  console.log('ok - resolveDeliveryStatusTargets keeps sent and read delivery states');
}

{
  const target = createStatusEl('', 'u1');
  const changes = [];
  syncDeliveryTextToMessages([target], '已读', {
    onDeliveryTextChange: (msgId, text) => changes.push([msgId, text]),
  });
  assert.equal(target.textContent, '已读');
  assert.equal(target.__wrapper.__chatappMessage.meta.deliveryText, '已读');
  assert.deepEqual(changes, [['u1', '已读']]);
  console.log('ok - syncDeliveryTextToMessages updates DOM meta and callback payloads');
}

{
  const timers = createTimerHarness();
  const runtime = createDeliveryStatusUiRuntime({
    schedule: timers.schedule,
    clearSchedule: timers.clear,
    random: () => 0,
  });
  const empty = createStatusEl('', 'a1');
  const sent = createStatusEl('✔ 已送出', 'a2');
  runtime.showDeliveryStatus({
    scrollEl: {
      querySelectorAll: () => [empty, sent],
    },
  });
  assert.equal(empty.textContent, '✔ 已送出');
  assert.equal(sent.textContent, '✔ 已送出');

  const changes = [];
  let readTimer = null;
  let readCountCurrent = 0;
  let readCountTargets = null;
  let readCountMax = 0;
  runtime.markAsRead({
    scrollEl: {
      querySelectorAll: () => [sent],
    },
    groupMemberCount: 4,
    onSyncText: (targets, text) => {
      changes.push(text);
      syncDeliveryTextToMessages(targets, text);
    },
    getReadCountCurrent: () => readCountCurrent,
    setReadCountCurrent: value => {
      readCountCurrent = value;
    },
    setReadCountTargets: value => {
      readCountTargets = value;
    },
    setReadCountMax: value => {
      readCountMax = value;
    },
    getReadCountTimer: () => readTimer,
    setReadCountTimer: value => {
      readTimer = value;
    },
  });
  assert.equal(sent.textContent, '已读1');
  assert.equal(readCountCurrent, 1);
  assert.equal(readCountMax, 4);
  assert.equal(Array.isArray(readCountTargets), true);
  assert.equal(changes[0], '已读1');
  timers.run(readTimer);
  assert.equal(sent.textContent, '已读2');
  assert.equal(readCountCurrent, 2);
  console.log('ok - showDeliveryStatus and markAsRead cover empty sent state and group read increments');
}

{
  const timers = createTimerHarness();
  const runtime = createDeliveryStatusUiRuntime({
    schedule: timers.schedule,
    clearSchedule: timers.clear,
    random: () => 0,
  });
  const target = createStatusEl('已读1', 'b1');
  let readCountTimer = null;
  let readCountCurrent = 1;
  runtime.bumpReadCount({
    speakerCount: 2,
    onSyncText: (targets, text) => syncDeliveryTextToMessages(targets, text),
    getReadCountTargets: () => [target],
    getReadCountCurrent: () => readCountCurrent,
    setReadCountCurrent: value => {
      readCountCurrent = value;
    },
    getReadCountMax: () => 5,
    getReadCountTimer: () => readCountTimer,
    setReadCountTimer: value => {
      readCountTimer = value;
    },
  });
  assert.equal(target.textContent, '已读2');
  timers.run(readCountTimer);
  assert.equal(target.textContent, '已读3');
  assert.equal(readCountCurrent, 3);
  console.log('ok - bumpReadCount raises group read counts and continues gradual increments');
}

{
  const timers = createTimerHarness();
  const runtime = createDeliveryStatusUiRuntime({
    schedule: timers.schedule,
    clearSchedule: timers.clear,
    random: () => 0,
  });
  let readTimer = null;
  let typingTimer = null;
  let done = true;
  const calls = [];
  runtime.startDeliverySequence({
    avatarUrl: 'avatar.png',
    typingOptions: { mode: 'private' },
    readOptions: { groupMemberCount: 2 },
    clearDeliverySequence: () => calls.push('clear'),
    setDeliverySequenceDone: value => {
      done = value;
      calls.push(['done', value]);
    },
    markAsRead: options => calls.push(['read', options]),
    showTyping: (avatarUrl, typingOptions) => calls.push(['typing', avatarUrl, typingOptions]),
    setReadTimer: value => {
      readTimer = value;
    },
    setTypingTimer: value => {
      typingTimer = value;
    },
  });
  assert.equal(done, false);
  timers.run(readTimer);
  assert.deepEqual(calls[2], ['read', { groupMemberCount: 2 }]);
  timers.run(typingTimer);
  assert.deepEqual(calls.at(-1), ['typing', 'avatar.png', { mode: 'private' }]);
  assert.equal(done, true);

  runtime.fastForwardDeliverySequence({
    readOptions: { groupMemberCount: 3 },
    clearDeliverySequence: () => calls.push('fast-clear'),
    markAsRead: options => calls.push(['fast-read', options]),
    setDeliverySequenceDone: value => {
      done = value;
    },
  });
  assert.equal(done, true);
  assert.deepEqual(calls.at(-1), ['fast-read', { groupMemberCount: 3 }]);
  console.log('ok - delivery runtime schedules read typing and fast-forward completion flows');
}
