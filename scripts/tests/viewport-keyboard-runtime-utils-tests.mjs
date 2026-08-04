import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createViewportKeyboardRuntime,
  normalizeViewportSnapshot,
} from '../../src/scripts/ui/viewport-keyboard-runtime-utils.js';

const createStyle = () => {
  const props = new Map();
  return {
    top: '',
    bottom: '',
    height: '',
    setProperty(name, value) {
      props.set(name, String(value));
    },
    removeProperty(name) {
      props.delete(name);
    },
    getPropertyValue(name) {
      return props.get(name) || '';
    },
  };
};

const createClassList = () => {
  const set = new Set();
  return {
    add: (...items) => items.forEach(item => set.add(item)),
    remove: (...items) => items.forEach(item => set.delete(item)),
    toggle: (item, force) => {
      if (force === true) set.add(item);
      else if (force === false) set.delete(item);
      else if (set.has(item)) set.delete(item);
      else set.add(item);
      return set.has(item);
    },
    contains: item => set.has(item),
  };
};

const createElement = ({ tagName = 'div', type = '', id = '' } = {}) => ({
  tagName,
  type,
  id,
  className: '',
  dataset: {},
  clientWidth: 240,
  clientHeight: 48,
  scrollWidth: 240,
  scrollHeight: 48,
  style: createStyle(),
  classList: createClassList(),
  scrollCalls: [],
  getBoundingClientRect() {
    return { top: 100, right: 340, bottom: 148, left: 100, width: 240, height: 48 };
  },
  scrollIntoView(options) {
    this.scrollCalls.push(options);
  },
});

{
  const snapshot = normalizeViewportSnapshot({
    innerWidth: 390,
    innerHeight: 800,
    documentClientWidth: 390,
    documentClientHeight: 800,
    visualViewport: { width: 390, height: 500, offsetTop: 0, offsetLeft: 0 },
    previousBaseHeight: 800,
    previousBaseWidth: 390,
    hasFocusedEditable: true,
  });
  assert.equal(snapshot.keyboardVisible, true);
  assert.equal(snapshot.keyboardInsetBottom, 300);
  assert.equal(snapshot.visualHeight, 500);
  console.log('ok - normalizeViewportSnapshot detects keyboard from visual viewport shrink');
}

{
  const snapshot = normalizeViewportSnapshot({
    innerWidth: 393,
    innerHeight: 560,
    documentClientWidth: 393,
    documentClientHeight: 560,
    visualViewport: { width: 393, height: 560, offsetTop: 0, offsetLeft: 0 },
    screenWidth: 393,
    screenHeight: 900,
    previousBaseHeight: 0,
    previousBaseWidth: 0,
    hasFocusedEditable: true,
  });
  assert.equal(snapshot.keyboardVisible, true);
  assert.equal(snapshot.keyboardInsetBottom, 340);
  console.log('ok - normalizeViewportSnapshot detects adjustResize keyboard from focused screen baseline');
}

{
  const snapshot = normalizeViewportSnapshot({
    innerWidth: 1280,
    innerHeight: 720,
    documentClientWidth: 1280,
    documentClientHeight: 720,
    visualViewport: { width: 1280, height: 720, offsetTop: 0, offsetLeft: 0 },
    screenWidth: 2560,
    screenHeight: 1440,
    previousBaseHeight: 0,
    previousBaseWidth: 0,
    hasFocusedEditable: true,
    useScreenHeightBaseline: false,
  });
  assert.equal(snapshot.keyboardVisible, false);
  assert.equal(snapshot.keyboardInsetBottom, 0);
  assert.equal(snapshot.rawKeyboardInsetBottom, 0);
  console.log('ok - normalizeViewportSnapshot ignores desktop screen baseline when disabled');
}

{
  const snapshot = normalizeViewportSnapshot({
    innerWidth: 360,
    innerHeight: 797,
    documentClientWidth: 360,
    documentClientHeight: 797,
    visualViewport: { width: 360, height: 797, offsetTop: 0, offsetLeft: 0 },
    screenWidth: 360,
    screenHeight: 798,
    previousBaseHeight: 797,
    previousBaseWidth: 360,
    hasFocusedEditable: true,
    nativeIme: {
      visible: true,
      insetBottom: 280,
      rawInsetBottom: 280,
      density: 3,
      source: 'android-window-insets',
    },
  });
  assert.equal(snapshot.keyboardVisible, true);
  assert.equal(snapshot.keyboardInsetBottom, 280);
  assert.equal(snapshot.visualHeight, 517);
  assert.equal(snapshot.rawVisualHeight, 797);
  assert.equal(snapshot.nativeImeVisible, true);
  assert.equal(snapshot.nativeImeInsetBottom, 280);
  console.log('ok - normalizeViewportSnapshot uses native Android IME inset when visual viewport is unchanged');
}

{
  for (const visualOffsetTop of [261, 324]) {
    const snapshot = normalizeViewportSnapshot({
      innerWidth: 393,
      innerHeight: 894,
      documentClientWidth: 393,
      documentClientHeight: 894,
      visualViewport: { width: 393, height: 571, offsetTop: visualOffsetTop, offsetLeft: 0 },
      screenWidth: 393,
      screenHeight: 895,
      previousBaseHeight: 895,
      previousBaseWidth: 393,
      hasFocusedEditable: true,
      nativeIme: {
        visible: true,
        insetBottom: 324,
        rawInsetBottom: 324,
        density: 2.75,
        source: 'android-window-insets',
      },
    });
    assert.equal(snapshot.keyboardVisible, true);
    assert.equal(snapshot.viewportKeyboardInsetBottom, 324);
    assert.equal(snapshot.visualHeight, 571);
  }
  console.log('ok - normalizeViewportSnapshot keeps shrunken Xiaomi visual viewport height while it pans');
}

{
  const snapshot = normalizeViewportSnapshot({
    innerWidth: 393,
    innerHeight: 894,
    documentClientWidth: 393,
    documentClientHeight: 894,
    visualViewport: { width: 393, height: 894, offsetTop: 261, offsetLeft: 0 },
    screenWidth: 393,
    screenHeight: 895,
    previousBaseHeight: 895,
    previousBaseWidth: 393,
    hasFocusedEditable: true,
    nativeIme: {
      visible: true,
      insetBottom: 324,
      rawInsetBottom: 324,
      density: 2.75,
      source: 'android-window-insets',
    },
  });
  assert.equal(snapshot.keyboardVisible, true);
  assert.equal(snapshot.visualHeight, 570);
  assert.equal(snapshot.visualOffsetTop, 261);
  console.log('ok - normalizeViewportSnapshot native fallback does not subtract visual viewport offset');
}

{
  const root = createElement({ tagName: 'html' });
  const body = { dataset: {} };
  const input = createElement({ tagName: 'input', type: 'text', id: 'composer-input' });
  const chatRoom = createElement({ tagName: 'div', id: 'chat-room' });
  const listeners = new Map();
  const visualListeners = new Map();
  const documentRef = {
    documentElement: root,
    body,
    activeElement: input,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    defaultView: null,
  };
  root.ownerDocument = {
    defaultView: {
      getComputedStyle: element => element.style,
    },
  };
  const windowRef = {
    innerWidth: 390,
    innerHeight: 800,
    devicePixelRatio: 2,
    navigator: { userAgent: 'test-webview', platform: 'android' },
    screen: { width: 390, height: 800, availWidth: 390, availHeight: 800, orientation: { type: 'portrait-primary' } },
    visualViewport: {
      width: 390,
      height: 500,
      offsetTop: 0,
      offsetLeft: 0,
      scale: 1,
      addEventListener(type, handler) {
        visualListeners.set(type, handler);
      },
      removeEventListener(type) {
        visualListeners.delete(type);
      },
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };

  const runtime = createViewportKeyboardRuntime({
    windowRef,
    documentRef,
    rootEl: root,
    bodyEl: body,
    targets: [{ element: chatRoom, activeClass: 'keyboard-visible', fixedToVisualViewport: true }],
    getFocusedElement: () => documentRef.activeElement,
    requestAnimationFrameFn: fn => fn(),
  });
  const opened = runtime.start();
  assert.equal(opened.keyboardVisible, true);
  assert.equal(root.style.getPropertyValue('--app-visual-height'), '500px');
  assert.equal(root.style.getPropertyValue('--app-keyboard-inset-bottom'), '300px');
  assert.equal(body.dataset.keyboardVisible, 'true');
  assert.equal(chatRoom.classList.contains('keyboard-visible'), true);
  assert.equal(chatRoom.style.bottom, 'auto');
  assert.equal(chatRoom.style.height, '500px');
  assert.deepEqual(input.scrollCalls, [{ block: 'nearest', inline: 'nearest' }]);

  visualListeners.get('scroll')?.();
  assert.deepEqual(input.scrollCalls, [{ block: 'nearest', inline: 'nearest' }]);

  windowRef.visualViewport.height = 800;
  documentRef.activeElement = createElement();
  const closed = runtime.refresh();
  assert.equal(closed.keyboardVisible, false);
  assert.equal(root.style.getPropertyValue('--app-keyboard-inset-bottom'), '0px');
  assert.equal(body.dataset.keyboardVisible, 'false');
  assert.equal(chatRoom.classList.contains('keyboard-visible'), false);
  assert.equal(chatRoom.style.height, '');
  assert.equal(runtime.getDebugInfo().visualViewport.height, 800);
  console.log('ok - createViewportKeyboardRuntime applies CSS vars target layout and debug info');
}

{
  const root = createElement({ tagName: 'html' });
  const body = { dataset: {} };
  const input = createElement({ tagName: 'textarea', id: 'composer-input' });
  input.dataset.viewportKeyboardDiagnostic = 'maid-persona-prompt';
  input.value = '不得进入诊断文件的私密提示词';
  const globalTraceEvents = [];
  const chatRoom = createElement({ tagName: 'div', id: 'chat-room' });
  const listeners = new Map();
  const visualListeners = new Map();
  const documentRef = {
    documentElement: root,
    body,
    activeElement: input,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };
  root.ownerDocument = {
    defaultView: {
      getComputedStyle: element => element.style,
    },
  };
  const windowRef = {
    innerWidth: 360,
    innerHeight: 797,
    devicePixelRatio: 3,
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 16; wv)', platform: 'Linux aarch64' },
    screen: { width: 360, height: 798, availWidth: 360, availHeight: 798, orientation: { type: 'portrait-primary' } },
    visualViewport: {
      width: 360,
      height: 797,
      offsetTop: 0,
      offsetLeft: 0,
      scale: 1,
      addEventListener(type, handler) {
        visualListeners.set(type, handler);
      },
      removeEventListener(type) {
        visualListeners.delete(type);
      },
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };

  const runtime = createViewportKeyboardRuntime({
    windowRef,
    documentRef,
    rootEl: root,
    bodyEl: body,
    targets: [{ element: chatRoom, activeClass: 'keyboard-visible', fixedToVisualViewport: true }],
    getFocusedElement: () => documentRef.activeElement,
    requestAnimationFrameFn: fn => fn(),
    recordTraceEvent: event => globalTraceEvents.push(event),
  });
  const closed = runtime.start();
  assert.equal(closed.keyboardVisible, false);
  listeners.get('focusin')?.({ target: input });
  input.scrollHeight = 96;
  input.style.height = '96px';
  listeners.get('input')?.({ target: input });
  listeners.get('input')?.({ target: input });
  listeners.get('compositionstart')?.({ target: input });
  listeners.get('compositionend')?.({ target: input });
  windowRef.__chatappAndroidImeInsets({
    visible: true,
    insetBottom: 280,
    rawInsetBottom: 280,
    density: 3,
    source: 'android-window-insets',
    timestamp: 't1',
  });
  const opened = runtime.getSnapshot();
  assert.equal(opened.keyboardVisible, true);
  assert.equal(root.style.getPropertyValue('--app-visual-height'), '517px');
  assert.equal(root.style.getPropertyValue('--app-keyboard-inset-bottom'), '280px');
  assert.equal(chatRoom.style.height, '517px');
  const debugInfo = runtime.getDebugInfo();
  assert.equal(debugInfo.nativeIme.source, 'android-window-insets');
  assert.equal(debugInfo.eventTimeline.capturesText, false);
  assert.equal(debugInfo.eventTimeline.maxEvents, 120);
  assert.deepEqual(
    debugInfo.eventTimeline.events.map(event => event.phase),
    [
      'runtime-start',
      'surface-focusin',
      'surface-input-layout',
      'surface-compositionstart',
      'surface-compositionend',
      'native-ime-insets',
    ],
  );
  const inputEvent = debugInfo.eventTimeline.events.find(event => event.phase === 'surface-input-layout');
  assert.equal(inputEvent.details.surface, 'maid-persona-prompt');
  assert.equal(inputEvent.details.element.scrollHeight, 96);
  assert.equal(inputEvent.details.element.inlineHeight, '96px');
  assert.deepEqual(
    globalTraceEvents.map(event => event.phase),
    debugInfo.eventTimeline.events.map(event => event.phase),
  );
  assert.equal(globalTraceEvents.every(event => event.category === 'viewport-keyboard'), true);
  assert.equal(JSON.stringify(debugInfo).includes('不得进入诊断文件的私密提示词'), false);
  assert.equal(JSON.stringify(globalTraceEvents).includes('不得进入诊断文件的私密提示词'), false);
  runtime.stop();
  assert.equal(typeof windowRef.__chatappAndroidImeInsets, 'undefined');
  console.log('ok - createViewportKeyboardRuntime bridges native Android IME inset into visible layout');
}

{
  const root = createElement({ tagName: 'html' });
  const body = { dataset: {} };
  const input = createElement({ tagName: 'input', type: 'text', id: 'composer-input' });
  const chatRoom = createElement({ tagName: 'div', id: 'chat-room' });
  const listeners = new Map();
  const visualListeners = new Map();
  const documentRef = {
    documentElement: root,
    body,
    activeElement: input,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };
  root.ownerDocument = {
    defaultView: {
      getComputedStyle: element => element.style,
    },
  };
  const windowRef = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32' },
    screen: { width: 2560, height: 1440, availWidth: 2560, availHeight: 1400, orientation: { type: 'landscape-primary' } },
    visualViewport: {
      width: 1280,
      height: 720,
      offsetTop: 0,
      offsetLeft: 0,
      scale: 1,
      addEventListener(type, handler) {
        visualListeners.set(type, handler);
      },
      removeEventListener(type) {
        visualListeners.delete(type);
      },
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };

  const runtime = createViewportKeyboardRuntime({
    windowRef,
    documentRef,
    rootEl: root,
    bodyEl: body,
    targets: [{ element: chatRoom, activeClass: 'keyboard-visible', fixedToVisualViewport: true }],
    getFocusedElement: () => documentRef.activeElement,
    requestAnimationFrameFn: fn => fn(),
  });
  const snapshot = runtime.start();
  listeners.get('input')?.({ target: input });
  assert.equal(snapshot.keyboardVisible, false);
  assert.equal(snapshot.keyboardInsetBottom, 0);
  assert.equal(body.dataset.keyboardVisible, 'false');
  assert.equal(chatRoom.classList.contains('keyboard-visible'), false);
  assert.equal(chatRoom.style.height, '');
  assert.deepEqual(input.scrollCalls, []);
  assert.equal(runtime.getDebugInfo().keyboard.visible, false);
  assert.equal(
    runtime.getDebugInfo().eventTimeline.events.some(event => event.phase === 'surface-input-layout'),
    false,
  );
  console.log('ok - createViewportKeyboardRuntime does not treat desktop refocus as keyboard open');
}

{
  const appSource = fs.readFileSync(
    new URL('../../src/scripts/ui/app.js', import.meta.url),
    'utf8',
  );
  const runtimeStart = appSource.indexOf('const viewportKeyboardRuntime = createViewportKeyboardRuntime({');
  const runtimeEnd = appSource.indexOf('getFocusedElement:', runtimeStart);
  const targetApplyBlock = appSource.slice(runtimeStart, runtimeEnd);
  assert.ok(runtimeStart >= 0 && runtimeEnd > runtimeStart);
  assert.match(targetApplyBlock, /activeElement\s*!==\s*composerInput/);
  assert.match(targetApplyBlock, /chatInputContainer\?\.contains\?\.\(activeElement\)/);
  assert.ok(targetApplyBlock.indexOf('activeElement !== composerInput') < targetApplyBlock.indexOf('chatScroll?.scrollTo?.'));
  console.log('ok - app only scrolls chat to bottom for the main composer area');
}
