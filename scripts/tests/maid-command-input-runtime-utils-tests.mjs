import assert from 'node:assert/strict';

import { createMaidCommandInputRuntime } from '../../src/scripts/ui/maid-command-input-runtime-utils.js';

const createClassList = () => {
  const set = new Set();
  return {
    add: (...tokens) => tokens.forEach(token => set.add(token)),
    remove: (...tokens) => tokens.forEach(token => set.delete(token)),
    contains: token => set.has(token),
    toggle: (token, force) => {
      if (force === true) set.add(token);
      else if (force === false) set.delete(token);
      else if (set.has(token)) set.delete(token);
      else set.add(token);
    },
  };
};

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.className = '';
    this.classList = createClassList();
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.listeners = new Map();
    this.value = '';
    this.disabled = false;
    this.textContent = '';
    this.focused = false;
    this.rect = { left: 100, top: 200, width: 26, height: 26 };
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(item => item !== this);
    this.parentNode = null;
  }

  contains(target) {
    let node = target;
    while (node) {
      if (node === this) return true;
      node = node.parentNode || null;
    }
    return false;
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  dispatchEvent(type, event = {}) {
    for (const handler of this.listeners.get(type) || []) {
      handler(event);
    }
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  focus() {
    this.focused = true;
  }

  getBoundingClientRect() {
    return { ...this.rect };
  }
}

class FakeDocument {
  constructor() {
    this.head = new FakeElement('head');
    this.body = new FakeElement('body');
    this.byId = new Map();
    this.listeners = new Map();
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  getElementById(id) {
    return this.byId.get(id) || null;
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  removeEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    this.listeners.set(type, list.filter(item => item !== handler));
  }

  dispatchEvent(type, event = {}) {
    for (const handler of this.listeners.get(type) || []) {
      handler(event);
    }
  }
}

{
  const documentRef = new FakeDocument();
  const modeSwitchEl = new FakeElement('div');
  const timeouts = [];
  const submissions = [];
  const runtime = createMaidCommandInputRuntime({
    documentRef,
    modeSwitchEl,
    getViewportSize: () => ({ w: 360, h: 640 }),
    onSubmit: async (text) => {
      submissions.push(text);
      return { ok: true, message: `done ${text}` };
    },
    setTimeoutFn: (fn) => {
      timeouts.push(fn);
      return timeouts.length;
    },
    clearTimeoutFn: () => {},
  });

  assert.equal(runtime.open(), true);
  const { rootEl, inputEl } = runtime.getElements();
  assert.equal(rootEl.classList.contains('is-open'), true);
  assert.equal(rootEl.dataset.bubbleSide, 'bottom');
  assert.equal(modeSwitchEl.classList.contains('is-maid-input-open'), true);
  assert.match(runtime.getElements().settingsBtn.innerHTML, /svg/);
  assert.match(runtime.getElements().submitBtn.innerHTML, /svg/);
  timeouts.shift()?.();
  assert.equal(inputEl.focused, true);

  inputEl.value = '打开世界书';
  const result = await runtime.submit();
  assert.equal(result.ok, true);
  assert.deepEqual(submissions, ['打开世界书']);
  assert.equal(runtime.getElements().resultEl.textContent, 'done 打开世界书');
  assert.equal(runtime.getElements().resultEl.dataset.tone, 'success');
  assert.equal(rootEl.classList.contains('has-result'), true);
  assert.equal(rootEl.classList.contains('is-open'), true);
  assert.equal(modeSwitchEl.classList.contains('is-maid-input-open'), true);
  console.log('ok - maid command input opens submits and keeps reply bubble visible');
}

{
  const documentRef = new FakeDocument();
  const modeSwitchEl = new FakeElement('div');
  const outsideEl = new FakeElement('main');
  documentRef.body.appendChild(outsideEl);
  const runtime = createMaidCommandInputRuntime({
    documentRef,
    modeSwitchEl,
    getViewportSize: () => ({ w: 360, h: 640 }),
    setTimeoutFn: () => 1,
    clearTimeoutFn: () => {},
  });

  assert.equal(runtime.open(), true);
  const { rootEl, inputEl } = runtime.getElements();
  documentRef.dispatchEvent('pointerdown', { target: inputEl });
  assert.equal(rootEl.classList.contains('is-open'), true);
  assert.equal(modeSwitchEl.classList.contains('is-maid-input-open'), true);

  documentRef.dispatchEvent('pointerdown', { target: modeSwitchEl });
  assert.equal(rootEl.classList.contains('is-open'), true);

  documentRef.dispatchEvent('pointerdown', { target: outsideEl });
  assert.equal(rootEl.classList.contains('is-open'), false);
  assert.equal(modeSwitchEl.classList.contains('is-maid-input-open'), false);
  assert.equal(documentRef.listeners.get('pointerdown')?.length || 0, 0);
  console.log('ok - maid command input closes on outside pointer');
}

{
  const documentRef = new FakeDocument();
  const settingsCalls = [];
  const runtime = createMaidCommandInputRuntime({
    documentRef,
    getViewportSize: () => ({ w: 360, h: 640 }),
    onSettings: payload => settingsCalls.push(payload),
    setTimeoutFn: () => 1,
    clearTimeoutFn: () => {},
  });

  assert.equal(runtime.open(), true);
  const { settingsBtn } = runtime.getElements();
  settingsBtn.dispatchEvent('click', {
    preventDefault() {},
    stopPropagation() {},
  });
  assert.equal(settingsCalls.length, 1);
  assert.equal(settingsCalls[0].source, 'command_input');
  console.log('ok - maid command input settings button forwards callback');
}
