import assert from 'node:assert/strict';

import {
  createAppBackNavigationRuntime,
  isAppBackLayerVisible,
  resolveAppBackNavigationAction,
} from '../../src/scripts/ui/app-back-navigation-runtime-utils.js';
import {
  requestTauriNativeExit,
  resolveTauriNativeBackButtonRegistrar,
} from '../../src/scripts/ui/app-native-back-button-utils.js';

const createInput = () => ({
  tagName: 'input',
  type: 'text',
  blurred: false,
  blur() {
    this.blurred = true;
  },
});

{
  const styleFor = element => element.style;
  const visibleLayer = {
    classList: { contains: () => false },
    style: { display: 'flex', visibility: 'visible', opacity: '1', position: 'fixed' },
    getClientRects: () => [{}],
  };
  const embeddedLayer = {
    ...visibleLayer,
    classList: { contains: name => name === 'extensions-embedded-root' },
  };
  const hiddenLayer = {
    ...visibleLayer,
    style: { ...visibleLayer.style, display: 'none' },
  };
  assert.equal(isAppBackLayerVisible(visibleLayer, { getComputedStyleFn: styleFor }), true);
  assert.equal(isAppBackLayerVisible(embeddedLayer, { getComputedStyleFn: styleFor }), false);
  assert.equal(isAppBackLayerVisible(hiddenLayer, { getComputedStyleFn: styleFor }), false);
  console.log('ok - Android back visibility ignores extension-embedded child panels');
}

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
  assert.equal(resolveTauriNativeBackButtonRegistrar({ isAndroid: false }), null);

  let appBackHandler = null;
  const appRegistrar = resolveTauriNativeBackButtonRegistrar({
    isAndroid: true,
    globalRef: {
      __TAURI__: {
        app: {
          onBackButtonPress(handler) {
            appBackHandler = handler;
            return 'app-listener';
          },
        },
      },
    },
  });
  assert.equal(appRegistrar(() => {}), 'app-listener');
  assert.equal(typeof appBackHandler, 'function');

  const registrarCalls = [];
  const pluginRegistrar = resolveTauriNativeBackButtonRegistrar({
    isAndroid: true,
    globalRef: {
      __TAURI__: {
        app: {
          onBackButtonPress() {
            registrarCalls.push('app');
            return 'app-listener';
          },
        },
        core: {
          addPluginListener(plugin, event, handler) {
            registrarCalls.push(['core', plugin, event, typeof handler]);
            return 'core-listener';
          },
        },
      },
    },
  });
  assert.equal(pluginRegistrar(() => {}), 'core-listener');
  assert.deepEqual(registrarCalls, [['core', 'app', 'back-button', 'function']]);

  let channelCallback = null;
  let unregisteredCallback = null;
  const invokeCalls = [];
  const invokeRegistrar = resolveTauriNativeBackButtonRegistrar({
    isAndroid: true,
    globalRef: {
      __TAURI_INTERNALS__: {
        transformCallback(callback) {
          channelCallback = callback;
          return 42;
        },
        unregisterCallback(id) {
          unregisteredCallback = id;
        },
      },
    },
    safeInvokeFn: async (cmd, args) => {
      invokeCalls.push({ cmd, args });
    },
  });
  const messages = [];
  const unlisten = await invokeRegistrar(message => messages.push(message));
  assert.equal(invokeCalls[0].cmd, 'plugin:app|register_listener');
  assert.equal(invokeCalls[0].args.event, 'back-button');
  assert.equal(invokeCalls[0].args.handler.toJSON(), '__CHANNEL__:42');
  channelCallback({ index: 0, message: { payload: { canGoBack: false } } });
  channelCallback({ index: 1, end: true });
  assert.deepEqual(messages, [{ payload: { canGoBack: false } }]);
  assert.equal(unregisteredCallback, 42);
  await unlisten();
  assert.equal(invokeCalls[1].cmd, 'plugin:app|remove_listener');

  assert.equal(requestTauriNativeExit({ safeInvokeFn: async (cmd) => invokeCalls.push({ cmd }) }), true);
  assert.equal(invokeCalls[2].cmd, 'plugin:app|exit');
  console.log('ok - native Android back registrar resolves global and invoke fallback paths');
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
  const hiddenInput = {
    ...createInput(),
    getClientRects: () => [],
  };
  let closed = 0;
  const runtime = createAppBackNavigationRuntime({
    windowRef: { history: { state: null, pushState() {} }, addEventListener() {}, removeEventListener() {} },
    historyRef: { state: null, pushState() {} },
    documentRef: { activeElement: hiddenInput },
    getFocusedElement: () => hiddenInput,
    closeTopLayer: ({ dryRun }) => {
      if (!dryRun) closed += 1;
      return true;
    },
  });
  const result = runtime.handleBack('test');
  assert.equal(result.action, 'close-layer');
  assert.equal(closed, 1);
  assert.equal(hiddenInput.blurred, false);
  console.log('ok - hidden focused editors cannot swallow Android back from a visible layer');
}

{
  const transparentAncestorInput = {
    ...createInput(),
    getClientRects: () => [{}],
    checkVisibility: () => false,
  };
  let closed = 0;
  const runtime = createAppBackNavigationRuntime({
    windowRef: { history: { state: null, pushState() {} }, addEventListener() {}, removeEventListener() {} },
    historyRef: { state: null, pushState() {} },
    documentRef: { activeElement: transparentAncestorInput },
    getFocusedElement: () => transparentAncestorInput,
    closeTopLayer: ({ dryRun }) => {
      if (!dryRun) closed += 1;
      return true;
    },
  });
  assert.equal(runtime.handleBack('test').action, 'close-layer');
  assert.equal(closed, 1);
  console.log('ok - editors inside transparent animation shells cannot swallow Android back');
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

{
  let nativeHandler = null;
  let nativeUnregistered = false;
  let exitRequests = 0;
  let hints = 0;
  let now = 10000;
  const pushedStates = [];
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
      addEventListener() {},
      removeEventListener() {},
    },
    historyRef,
    documentRef: { activeElement: { tagName: 'div' } },
    getActivePage: () => 'chat',
    isChatRoomVisible: () => false,
    closeTopLayer: () => false,
    showExitHint: () => { hints += 1; },
    nowFn: () => now,
    registerNativeBackButton: (handler) => {
      nativeHandler = handler;
      return { unregister: () => { nativeUnregistered = true; } };
    },
    exitNativeApp: () => { exitRequests += 1; },
    doublePressMs: 1400,
  });
  runtime.start();
  assert.equal(typeof nativeHandler, 'function');
  assert.equal(pushedStates.length, 1);

  const first = nativeHandler({ payload: { canGoBack: false } });
  assert.equal(first.action, 'show-root-exit-hint');
  assert.equal(first.handled, true);
  assert.equal(hints, 1);
  assert.equal(exitRequests, 0);

  now += 300;
  const second = nativeHandler({ payload: { canGoBack: false } });
  assert.equal(second.action, 'allow-native-exit');
  assert.equal(second.handled, false);
  assert.equal(second.nativeExitRequested, true);
  assert.equal(exitRequests, 1);

  runtime.stop();
  assert.equal(nativeUnregistered, true);
  console.log('ok - native Android back listener uses app back runtime and exits only after root confirmation');
}

{
  const listeners = new Map();
  let exitRequests = 0;
  let hints = 0;
  let now = 20000;
  const historyRef = {
    state: null,
    pushState(state) {
      this.state = state;
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
    showExitHint: () => { hints += 1; },
    nowFn: () => now,
    exitNativeApp: () => { exitRequests += 1; },
    doublePressMs: 1400,
  });
  runtime.start();
  const customBack = listeners.get('chatapp-android-back');
  assert.equal(typeof customBack, 'function');

  let prevented = 0;
  const first = customBack({
    detail: { source: 'native-main-activity' },
    preventDefault: () => { prevented += 1; },
  });
  assert.equal(first.action, 'show-root-exit-hint');
  assert.equal(first.handled, true);
  assert.equal(hints, 1);
  assert.equal(prevented, 1);
  assert.equal(exitRequests, 0);

  now += 300;
  const second = customBack({
    detail: { source: 'native-main-activity' },
    preventDefault: () => { prevented += 1; },
  });
  assert.equal(second.action, 'allow-native-exit');
  assert.equal(second.handled, false);
  assert.equal(second.nativeExitRequested, true);
  assert.equal(exitRequests, 1);
  assert.equal(prevented, 1);
  console.log('ok - custom Android back bridge exits only after root confirmation');
}
