import assert from 'node:assert/strict';

import {
  createAppBackNavigationRuntime,
  resolveAppBackNavigationAction,
} from '../../src/scripts/ui/app-back-navigation-runtime-utils.js';

const createInput = () => ({
  tagName: 'input',
  type: 'text',
  blurred: false,
  blur() {
    this.blurred = true;
  },
});

{
  assert.equal(resolveAppBackNavigationAction({ hasFocusedEditable: true }), 'blur-active-element');
  assert.equal(resolveAppBackNavigationAction({ hasClosableLayer: true }), 'close-layer');
  assert.equal(resolveAppBackNavigationAction({ isChatRoomVisible: true }), 'exit-chat-room');
  assert.equal(resolveAppBackNavigationAction({ activePage: 'moments', rootPage: 'chat' }), 'switch-root-page');
  assert.equal(resolveAppBackNavigationAction({
    activePage: 'chat',
    rootPage: 'chat',
    now: 2000,
    lastRootBackAt: 1000,
    doublePressMs: 1400,
  }), 'allow-native-exit');
  assert.equal(resolveAppBackNavigationAction({ activePage: 'chat', rootPage: 'chat' }), 'show-root-exit-hint');
  console.log('ok - resolveAppBackNavigationAction orders app back actions');
}

{
  const listeners = new Map();
  const pushedStates = [];
  const historyRef = {
    state: null,
    pushState(state) {
      this.state = state;
      pushedStates.push(state);
    },
  };
  const windowRef = {
    history: historyRef,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };
  const input = createInput();
  const documentRef = { activeElement: input };
  const runtime = createAppBackNavigationRuntime({
    windowRef,
    historyRef,
    documentRef,
    getFocusedElement: () => documentRef.activeElement,
  });
  assert.equal(runtime.start(), true);
  assert.equal(pushedStates.length, 1);
  assert.equal(pushedStates[0].__chatappBackSentinel, true);
  const result = runtime.handleBack('test');
  assert.deepEqual(result, { handled: true, action: 'blur-active-element', source: 'test' });
  assert.equal(input.blurred, true);
  console.log('ok - createAppBackNavigationRuntime installs sentinel and blurs focused editor first');
}

{
  let activePage = 'moments';
  let inChatRoom = true;
  let closeDryRunCalls = 0;
  let closeCalls = 0;
  const actions = [];
  const historyRef = {
    state: null,
    pushState(state) {
      this.state = state;
      actions.push(['pushState', state.__chatappBackSentinel]);
    },
  };
  const listeners = new Map();
  const windowRef = {
    history: historyRef,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };
  const runtime = createAppBackNavigationRuntime({
    windowRef,
    historyRef,
    documentRef: { activeElement: { tagName: 'div' } },
    getActivePage: () => activePage,
    rootPage: 'chat',
    switchPage: (page, options) => {
      actions.push(['switchPage', page, options]);
      activePage = page;
    },
    isChatRoomVisible: () => inChatRoom,
    exitChatRoom: () => {
      actions.push(['exitChatRoom']);
      inChatRoom = false;
    },
    closeTopLayer: ({ dryRun }) => {
      if (dryRun) closeDryRunCalls += 1;
      else closeCalls += 1;
      return closeDryRunCalls <= 1;
    },
    showExitHint: () => actions.push(['hint']),
    nowFn: () => 1000,
  });
  runtime.start();

  assert.equal(runtime.handleBack('test').action, 'close-layer');
  assert.equal(closeCalls, 1);
  assert.equal(runtime.handleBack('test').action, 'exit-chat-room');
  assert.equal(inChatRoom, false);
  assert.equal(runtime.handleBack('test').action, 'switch-root-page');
  assert.equal(activePage, 'chat');
  assert.equal(runtime.handleBack('test').action, 'show-root-exit-hint');
  assert.equal(runtime.handleBack('test').action, 'allow-native-exit');
  assert.deepEqual(actions.filter(item => item[0] !== 'pushState'), [
    ['exitChatRoom'],
    ['switchPage', 'chat', { animate: false }],
    ['hint'],
  ]);
  console.log('ok - createAppBackNavigationRuntime closes layers exits chat switches tabs and arms exit hint');
}

{
  const listeners = new Map();
  const pushedStates = [];
  const timers = [];
  const historyRef = {
    state: null,
    pushState(state) {
      this.state = state;
      pushedStates.push(state);
    },
  };
  const runtime = createAppBackNavigationRuntime({
    windowRef: {
      history: historyRef,
      addEventListener(type, handler) {
        listeners.set(type, handler);
      },
      removeEventListener(type) {
        listeners.delete(type);
      },
    },
    historyRef,
    documentRef: { activeElement: { tagName: 'div' } },
    getActivePage: () => 'chat',
    isChatRoomVisible: () => false,
    closeTopLayer: () => false,
    showExitHint: () => {},
    nowFn: () => 5000,
    setTimeoutFn: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimeoutFn: () => {},
    doublePressMs: 1400,
  });
  runtime.start();
  assert.equal(pushedStates.length, 1);
  historyRef.state = {};
  const result = listeners.get('popstate')?.({});
  assert.equal(result.action, 'show-root-exit-hint');
  assert.equal(pushedStates.length, 1);
  assert.equal(timers[0].ms, 1480);
  timers[0].fn();
  assert.equal(pushedStates.length, 2);
  console.log('ok - popstate root exit hint delays sentinel rearm so the next native back can exit');
}
