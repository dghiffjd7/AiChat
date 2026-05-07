import assert from 'node:assert/strict';

import { createTypingIndicatorScheduleRuntime } from '../../src/scripts/ui/chat/typing-indicator-schedule-utils.js';

const createTimerHarness = () => {
  let nextId = 1;
  const timers = new Map();
  const frames = [];
  return {
    schedule(handler, delay) {
      const id = nextId += 1;
      timers.set(id, { handler, delay });
      return id;
    },
    run(id) {
      const entry = timers.get(id);
      if (!entry) return;
      timers.delete(id);
      entry.handler();
    },
    scheduleFrame(handler) {
      frames.push(handler);
      return frames.length;
    },
    runFrame(index = 0) {
      const handler = frames[index];
      if (typeof handler === 'function') handler();
    },
  };
};

{
  const harness = createTimerHarness();
  const runtime = createTypingIndicatorScheduleRuntime({
    schedule: harness.schedule,
    scheduleFrame: harness.scheduleFrame,
    random: () => 0,
  });
  let cycleTimer = null;
  let renderCount = 0;
  runtime.runGroupTypingCycle({
    members: [{ name: '甲' }],
    renderCycle: () => {
      renderCount += 1;
    },
    setCycleTimer: value => {
      cycleTimer = value;
    },
  });
  assert.equal(renderCount, 1);
  harness.run(cycleTimer);
  assert.equal(renderCount, 2);
  console.log('ok - runGroupTypingCycle renders immediately and reschedules subsequent cycles');
}

{
  const harness = createTimerHarness();
  const runtime = createTypingIndicatorScheduleRuntime({
    schedule: harness.schedule,
    scheduleFrame: harness.scheduleFrame,
    random: () => 0,
  });
  const typingEl = {};
  let thinkTimer = null;
  let resumeTimer = null;
  let applyCount = 0;
  let removeCount = 0;
  let scrollCount = 0;
  runtime.runPrivateThinkPause({
    getTypingEl: () => typingEl,
    isNearBottom: () => true,
    applyThinkPause: () => {
      applyCount += 1;
    },
    removeThinkPause: () => {
      removeCount += 1;
    },
    scrollToBottom: () => {
      scrollCount += 1;
    },
    setThinkTimer: value => {
      thinkTimer = value;
    },
    setResumeTimer: value => {
      resumeTimer = value;
    },
  });
  harness.run(thinkTimer);
  assert.equal(applyCount, 1);
  harness.run(resumeTimer);
  harness.runFrame();
  assert.equal(removeCount, 1);
  assert.equal(scrollCount, 1);
  console.log('ok - runPrivateThinkPause schedules pause resume and near-bottom scroll restoration');
}

{
  const runtime = createTypingIndicatorScheduleRuntime();
  const host = {
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  };
  const wrap = {
    style: {},
    offsetHeight: 52,
  };
  let typingEl = null;
  let naturalHeight = 0;
  let floating = 0;
  let scrolled = 0;
  const wasNearBottom = runtime.mountTypingElement({
    scrollEl: { parentElement: host, appendChild: host.appendChild.bind(host) },
    wrap,
    isNearBottom: () => false,
    setTypingEl: value => {
      typingEl = value;
    },
    setTypingNaturalHeight: value => {
      naturalHeight = value;
    },
    showFloatingTyping: () => {
      floating += 1;
    },
    scrollToBottom: () => {
      scrolled += 1;
    },
  });
  assert.equal(wasNearBottom, false);
  assert.equal(host.children[0], wrap);
  assert.equal(typingEl, wrap);
  assert.equal(naturalHeight, 52);
  assert.equal(floating, 1);
  assert.equal(scrolled, 0);
  console.log('ok - mountTypingElement appends shell stores height and opens floating typing when away from bottom');
}
