import assert from 'node:assert/strict';

import {
  calculateMessageQueueDelay,
  clearMessageQueueTimerCore,
  enqueueMessagesCore,
  hideTypingCore,
  sampleBenfordUnit,
  showTypingCore,
} from '../../src/scripts/ui/chat/typing-flow-ui-utils.js';

{
  assert.equal(sampleBenfordUnit(() => 0), 0);
  const highSample = sampleBenfordUnit(() => 1);
  assert.ok(highSample < 1);
  assert.ok(highSample > 0.999);
  assert.equal(calculateMessageQueueDelay(10, { random: () => 0 }), 500);
  const tenCharHigh = calculateMessageQueueDelay(10, { random: () => 1 });
  assert.ok(tenCharHigh < 1400);
  assert.ok(tenCharHigh > 1399);
  assert.equal(calculateMessageQueueDelay(30, { random: () => 0 }), 1400);
  console.log('ok - calculateMessageQueueDelay uses shortened Benford-distributed delay ranges');
}

{
  let cleared = 0;
  let nextTimer = 123;
  const removed = clearMessageQueueTimerCore({
    getMessageQueueTimer: () => nextTimer,
    setMessageQueueTimer: value => { nextTimer = value; },
    clearTimer: () => { cleared += 1; },
  });
  assert.equal(removed, true);
  assert.equal(cleared, 1);
  assert.equal(nextTimer, null);
  console.log('ok - clearMessageQueueTimerCore clears active timer handles and resets state');
}

{
  let typingMounted = 0;
  let groupCycle = 0;
  const shown = showTypingCore({
    options: {
      groupMembers: [{ name: 'A', avatar: 'a.png' }],
    },
    isTypingDotsEnabled: () => true,
    uiMode: 'chat',
    typingEl: null,
    clearTypingTimers() {},
    createTypingIndicatorShell: () => ({
      wrap: { id: 'typing' },
      kind: 'group',
      avatarStack: {},
      labelEl: {},
    }),
    documentLike: {},
    runGroupTypingCycle() { groupCycle += 1; },
    renderTypingGroupMembers() {},
    getDefaultAvatar() { return 'default.png'; },
    schedule() {},
    runPrivateThinkPause() {
      throw new Error('group path should not use private pause runtime');
    },
    isNearBottom: () => true,
    applyThinkPause() {},
    removeThinkPause() {},
    scrollToBottom() {},
    setCycleTimer() {},
    setThinkTimer() {},
    setResumeTimer() {},
    mountTypingElement() { typingMounted += 1; },
    scrollEl: {},
    setTypingEl() {},
    setTypingNaturalHeight() {},
    showFloatingTyping() {},
  });
  assert.equal(shown, true);
  assert.equal(groupCycle, 1);
  assert.equal(typingMounted, 1);
  console.log('ok - showTypingCore routes group typing through group cycle runtime and mount flow');
}

{
  let hidden = 0;
  hideTypingCore({
    clearTypingTimers() { hidden += 1; },
    clearMessageQueueTimer() { hidden += 1; },
    removeTypingElement() { hidden += 1; },
  });
  assert.equal(hidden, 3);
  console.log('ok - hideTypingCore clears timers message queue and typing DOM together');
}

{
  let clearedQueue = 0;
  let hidden = 0;
  hideTypingCore({
    clearTypingTimers() { hidden += 1; },
    clearMessageQueueTimer() { clearedQueue += 1; },
    clearMessageQueue: false,
    removeTypingElement() { hidden += 1; },
  });
  assert.equal(hidden, 2);
  assert.equal(clearedQueue, 0);
  console.log('ok - hideTypingCore can preserve active message queue timers');
}

{
  const shown = [];
  const added = [];
  let removedTyping = 0;
  const { promise } = enqueueMessagesCore({
    items: [
      { message: { id: 'm1', content: 'hi' } },
      { message: { id: 'm2', content: 'reply' } },
    ],
    options: {
      avatarUrl: 'avatar.png',
      typingOptions: {},
    },
    clearMessageQueueTimer() {},
    hideTyping() {},
    showTyping: (...args) => shown.push(args),
    getTypingThinkTimer: () => null,
    setTypingThinkTimer() {},
    getTypingThinkResumeTimer: () => null,
    setTypingThinkResumeTimer() {},
    isNearBottom: () => false,
    applyThinkPause() {},
    removeThinkPause() {},
    removeTypingElement() { removedTyping += 1; },
    scrollToBottom() {},
    setMessageQueueTimer() {},
    scheduleTimeout: (handler) => {
      handler();
      return 1;
    },
    scheduleFrame: handler => handler(),
    addMessage: message => added.push(message.id),
    random: () => 0.99,
  });
  await promise;
  assert.deepEqual(added, ['m1', 'm2']);
  assert.equal(shown.length, 1);
  assert.equal(removedTyping, 1);
  console.log('ok - enqueueMessagesCore delays between queued messages and removes typing before next append');
}

{
  let cleared = 0;
  let hidden = 0;
  const queued = enqueueMessagesCore({
    items: [],
    clearMessageQueueTimer() { cleared += 1; },
    hideTyping() { hidden += 1; },
  });
  queued.cancel();
  assert.equal(cleared, 1);
  assert.equal(hidden, 1);
  console.log('ok - enqueueMessagesCore cancel delegates to queue clear and typing hide hooks');
}

{
  const added = [];
  const timers = [];
  const queued = enqueueMessagesCore({
    items: [
      { message: { id: 'm1', content: 'first' } },
      { message: { id: 'm2', content: 'second' } },
    ],
    options: {
      typingOptions: {},
    },
    clearMessageQueueTimer() {},
    hideTyping() {},
    showTyping() {},
    getTypingThinkTimer: () => null,
    setTypingThinkTimer() {},
    getTypingThinkResumeTimer: () => null,
    setTypingThinkResumeTimer() {},
    isNearBottom: () => false,
    applyThinkPause() {},
    removeThinkPause() {},
    removeTypingElement() {},
    scrollToBottom() {},
    setMessageQueueTimer: timer => timers.push(timer),
    scheduleTimeout: handler => ({ handler }),
    scheduleFrame: handler => handler(),
    addMessage: message => added.push(message.id),
    random: () => 0.99,
  });

  await Promise.resolve();
  assert.deepEqual(added, ['m1']);
  queued.cancel();
  await queued.promise;
  assert.deepEqual(added, ['m1']);
  assert.equal(timers.length, 1);
  console.log('ok - enqueueMessagesCore cancel resolves pending delay without appending queued messages');
}

{
  const shown = [];
  const added = [];
  let hidden = 0;
  let paused = 0;
  let removedTyping = 0;
  const randomValues = [0, 0.04, 0, 0];
  const { promise } = enqueueMessagesCore({
    items: [
      { message: { id: 'm1', content: 'first' } },
      { message: { id: 'm2', content: 'second' } },
    ],
    options: {
      avatarUrl: 'avatar.png',
      typingOptions: {
        groupMembers: [{ name: 'A', avatar: 'a.png' }],
      },
    },
    clearMessageQueueTimer() {},
    hideTyping() { hidden += 1; },
    showTyping: (...args) => shown.push(args),
    getTypingThinkTimer: () => null,
    setTypingThinkTimer() {},
    getTypingThinkResumeTimer: () => null,
    setTypingThinkResumeTimer() {},
    isNearBottom: () => false,
    applyThinkPause() { paused += 1; },
    removeThinkPause() {},
    removeTypingElement() { removedTyping += 1; },
    scrollToBottom() {},
    setMessageQueueTimer() {},
    scheduleTimeout: (handler) => {
      handler();
      return 1;
    },
    scheduleFrame: handler => handler(),
    addMessage: message => added.push(message.id),
    random: () => randomValues.shift() ?? 0.99,
  });
  await promise;
  assert.deepEqual(added, ['m1', 'm2']);
  assert.equal(shown.length, 2);
  assert.equal(removedTyping, 1);
  assert.equal(hidden, 1);
  assert.equal(paused, 0);
  console.log('ok - enqueueMessagesCore tail typing hint uses 5 percent gate and hides without pause flicker');
}
