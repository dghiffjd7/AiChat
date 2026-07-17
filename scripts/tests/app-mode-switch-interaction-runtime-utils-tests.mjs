import assert from 'node:assert/strict';

import { createModeSwitchInteractionRuntime } from '../../src/scripts/ui/app-mode-switch-interaction-runtime-utils.js';

const createClassList = (initial = []) => {
  const set = new Set(initial);
  return {
    add: (...tokens) => tokens.forEach(token => set.add(token)),
    remove: (...tokens) => tokens.forEach(token => set.delete(token)),
    contains: token => set.has(token),
  };
};

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.classList = createClassList();
    this.style = {};
    this.listeners = new Map();
    this.removed = false;
    this.captureIds = [];
    this.releaseIds = [];
    this.rect = { left: 90, top: 190, width: 48, height: 48 };
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove() {
    this.removed = true;
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(item => item !== this);
    this.parentNode = null;
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  trigger(type, event = {}) {
    const handlers = this.listeners.get(type) || [];
    handlers.forEach(handler => handler({
      pointerType: 'mouse',
      button: 0,
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      preventDefault() {},
      stopPropagation() {},
      ...event,
    }));
  }

  getBoundingClientRect() {
    return { ...this.rect };
  }

  setPointerCapture(pointerId) {
    this.captureIds.push(pointerId);
  }

  releasePointerCapture(pointerId) {
    this.releaseIds.push(pointerId);
  }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body');
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }
}

{
  const modeSwitchEl = new FakeElement('div');
  let pinned = false;
  let saved = 0;
  const runtime = createModeSwitchInteractionRuntime({
    modeSwitchEl,
    modeSwitchBtnEl: new FakeElement('button'),
    setModeSwitchPinned: value => {
      pinned = value;
    },
    saveModeSwitchPos: () => {
      saved += 1;
    },
    matchMediaFn: () => ({ matches: true }),
  });
  assert.equal(runtime.animateBounce(100, 120, 9, 4), false);
  assert.equal(pinned, true);
  assert.equal(saved, 1);
  console.log('ok - createModeSwitchInteractionRuntime respects reduced-motion bounce fallback');
}

{
  const documentRef = new FakeDocument();
  const modeSwitchEl = new FakeElement('div');
  const buttonEl = new FakeElement('button');
  const frames = [];
  const timeouts = [];
  let now = 0;
  const runtime = createModeSwitchInteractionRuntime({
    documentRef,
    modeSwitchEl,
    modeSwitchBtnEl: buttonEl,
    getViewportSize: () => ({ w: 320, h: 480 }),
    getModeSwitchSize: () => 48,
    getSafeInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    normalizeModeSwitchPos: (x, y) => ({ xRatio: x / 320, yRatio: y / 480 }),
    setModeSwitchPos: () => {},
    requestAnimationFrameFn: fn => {
      frames.push(fn);
      return frames.length;
    },
    setTimeoutFn: (fn) => {
      timeouts.push(fn);
      return timeouts.length;
    },
    nowFn: () => now,
    randomFn: () => 0.5,
  });

  for (let i = 0; i < 6; i += 1) {
    now += 100;
    runtime.animateBounce(120, 220, 12, 6);
  }
  assert.equal(documentRef.body.children.length > 0, true);
  const maid = documentRef.body.children[0];
  assert.equal(maid.tagName, 'IMG');
  frames.splice(0).forEach(fn => fn());
  timeouts.splice(0).forEach(fn => fn());
  console.log('ok - createModeSwitchInteractionRuntime spawns maid tumble after repeated bounce triggers');
}

{
  const modeSwitchEl = new FakeElement('div');
  const buttonEl = new FakeElement('button');
  const wakeCalls = [];
  const syncCalls = [];
  const saved = [];
  const scheduled = [];
  let pinned = false;
  let pos = null;
  let enterCalls = 0;
  let now = 1000;
  const runtime = createModeSwitchInteractionRuntime({
    modeSwitchEl,
    modeSwitchBtnEl: buttonEl,
    getViewportSize: () => ({ w: 360, h: 640 }),
    getModeSwitchSize: () => 48,
    getSafeInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    normalizeModeSwitchPos: (x, y) => ({ xRatio: x / 360, yRatio: y / 640 }),
    setModeSwitchPos: value => {
      pos = value;
    },
    setModeSwitchPinned: value => {
      pinned = value;
    },
    saveModeSwitchPos: () => saved.push(pos),
    wakeModeSwitch: () => wakeCalls.push('wake'),
    scheduleModeSwitchSync: () => syncCalls.push('sync'),
    setTimeoutFn: (fn) => {
      scheduled.push(fn);
      return scheduled.length;
    },
    nowFn: () => now,
    enterRpMode: () => {
      enterCalls += 1;
    },
    getUiMode: () => 'chat',
  });

  runtime.bind();
  buttonEl.trigger('pointerdown', { clientX: 100, clientY: 200 });
  now += 200;
  buttonEl.trigger('pointermove', { clientX: 106, clientY: 206 });
  now += 200;
  buttonEl.trigger('pointerup', { clientX: 106, clientY: 206 });

  assert.equal(modeSwitchEl.classList.contains('is-dragging'), false);
  assert.equal(pinned, true);
  assert.deepEqual(saved[0], pos);
  assert.equal(buttonEl.captureIds[0], 1);
  assert.equal(buttonEl.releaseIds[0], 1);
  assert.equal(runtime.isSuppressingClick(), true);
  assert.equal(runtime.handleClick(), false);
  scheduled.splice(0).forEach(fn => fn());
  assert.equal(runtime.isSuppressingClick(), false);
  assert.equal(runtime.handleClick(), true);
  assert.equal(enterCalls, 1);
  assert.equal(wakeCalls.length >= 3, true);
  assert.deepEqual(syncCalls, ['sync']);
  console.log('ok - createModeSwitchInteractionRuntime drag flow saves position suppresses click and resumes mode toggle');
}

{
  const modeSwitchEl = new FakeElement('div');
  const buttonEl = new FakeElement('button');
  const scheduled = [];
  const longPresses = [];
  let enterCalls = 0;
  const runtime = createModeSwitchInteractionRuntime({
    modeSwitchEl,
    modeSwitchBtnEl: buttonEl,
    setTimeoutFn: (fn) => {
      scheduled.push(fn);
      return scheduled.length;
    },
    clearTimeoutFn: () => {},
    nowFn: () => 1000,
    getUiMode: () => 'chat',
    enterRpMode: () => {
      enterCalls += 1;
    },
    onLongPress: payload => {
      longPresses.push(payload);
      return true;
    },
  });

  runtime.bind();
  buttonEl.trigger('pointerdown', { clientX: 100, clientY: 200 });
  assert.equal(runtime.hasLongPressTimer(), true);
  scheduled.shift()?.();
  assert.equal(longPresses.length, 1);
  buttonEl.trigger('pointerup', { clientX: 100, clientY: 200 });
  assert.equal(runtime.isSuppressingClick(), true);
  assert.equal(runtime.handleClick(), false);
  scheduled.shift()?.();
  assert.equal(runtime.isSuppressingClick(), false);
  assert.equal(runtime.handleClick(), true);
  assert.equal(enterCalls, 1);
  console.log('ok - createModeSwitchInteractionRuntime triggers long press and suppresses mode toggle click');
}

{
  // 指令条转发的拖拽（suppressLongPress）不得再触发长按呼出
  const modeSwitchEl = new FakeElement('div');
  const buttonEl = new FakeElement('button');
  const scheduled = [];
  const longPresses = [];
  const runtime = createModeSwitchInteractionRuntime({
    modeSwitchEl,
    modeSwitchBtnEl: buttonEl,
    setTimeoutFn: (fn) => {
      scheduled.push(fn);
      return scheduled.length;
    },
    clearTimeoutFn: () => {},
    nowFn: () => 1000,
    onLongPress: payload => {
      longPresses.push(payload);
      return true;
    },
  });

  const started = runtime.startDrag({
    pointerType: 'mouse',
    button: 0,
    pointerId: 7,
    clientX: 100,
    clientY: 200,
    preventDefault() {},
    stopPropagation() {},
  }, { suppressLongPress: true });
  assert.equal(started, true);
  assert.equal(runtime.hasLongPressTimer(), false, '转发拖拽不注册长按计时器');
  assert.equal(longPresses.length, 0);
  assert.equal(Boolean(runtime.getDragState()), true, '拖拽状态照常建立');
  console.log('ok - createModeSwitchInteractionRuntime suppressLongPress 转发拖拽不触发长按');
}

{
  // 外部标题/拖柄转发给模式球的按压，即使没有移动，也不能落成模式切换 click。
  const modeSwitchEl = new FakeElement('div');
  const buttonEl = new FakeElement('button');
  const scheduled = [];
  let enterCalls = 0;
  const runtime = createModeSwitchInteractionRuntime({
    modeSwitchEl,
    modeSwitchBtnEl: buttonEl,
    setTimeoutFn: (fn) => {
      scheduled.push(fn);
      return scheduled.length;
    },
    clearTimeoutFn: () => {},
    nowFn: () => 1000,
    getUiMode: () => 'chat',
    enterRpMode: () => {
      enterCalls += 1;
    },
  });

  runtime.startDrag({
    pointerType: 'mouse',
    button: 0,
    pointerId: 9,
    clientX: 100,
    clientY: 200,
    preventDefault() {},
    stopPropagation() {},
  }, { suppressLongPress: true, suppressClick: true });
  runtime.endDrag({ pointerId: 9 });
  assert.equal(runtime.isSuppressingClick(), true, '外部转发的静止按压应抑制下一次模式球 click');
  assert.equal(runtime.handleClick(), false);
  assert.equal(enterCalls, 0, '标题单击不得进入创意写作');
  scheduled.splice(0).forEach(fn => fn());
  assert.equal(runtime.handleClick(), true, '抑制窗口结束后直接点击小球仍可切换模式');
  assert.equal(enterCalls, 1);
  console.log('ok - createModeSwitchInteractionRuntime 外部拖拽标题单击不切换模式');
}
