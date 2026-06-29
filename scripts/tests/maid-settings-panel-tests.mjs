import assert from 'node:assert/strict';

import { createMaidSettingsPanel } from '../../src/scripts/ui/maid-settings-panel.js';

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
    this.textContent = '';
    this.type = '';
    this.readOnly = false;
    this.spellcheck = true;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...items) {
    items.forEach(item => this.appendChild(item));
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
}

class FakeDocument {
  constructor() {
    this.head = new FakeElement('head');
    this.body = new FakeElement('body');
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  getElementById() {
    return null;
  }
}

const findByText = (root, text) => {
  if (!root) return null;
  if (root.textContent === text) return root;
  for (const child of root.children || []) {
    const found = findByText(child, text);
    if (found) return found;
  }
  return null;
};

const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0));

{
  const documentRef = new FakeDocument();
  const apiCalls = [];
  const copied = [];
  const store = {
    maidPrompt: '旧提示词',
    lastAppContext: '检索：已执行\n命中：打开世界书',
    lastPrompt: 'system:\n本次提示词',
    lastResponse: '完整回复',
    getMaidPrompt() {
      return this.maidPrompt;
    },
    async setMaidPrompt(value) {
      this.maidPrompt = value;
      return value;
    },
    getLastRequestPrompt() {
      return this.lastPrompt;
    },
    getLastAppContext() {
      return this.lastAppContext;
    },
    getLastFullResponse() {
      return this.lastResponse;
    },
  };
  const panel = createMaidSettingsPanel({
    documentRef,
    settingsStore: store,
    getAppKnowledgeText: () => '打开世界书 (worldbook.open)\n工具：app.open_panel',
    getHistoryContextText: () => '- 用户: 创建角色卡 A\n  结果: 已完成',
    getMemoryTableText: () => '| 1 | 摘要 |\n| 内容 | 用户创建了角色卡 A。 |',
    onOpenApiConfig: payload => apiCalls.push(payload),
    copyText: async text => copied.push(text),
    logger: { warn() {}, debug() {} },
  });

  assert.equal(panel.show({ tab: 'prompt' }), true);
  const elements = panel.getElements();
  assert.equal(elements.tabButtons.has('lastResponse'), false);
  assert.equal(elements.tabButtons.get('prompt').classList.contains('is-active'), true);
  assert.equal(elements.promptTabButtons.get('persona').classList.contains('is-active'), true);
  assert.equal(elements.promptTabButtons.has('historyContext'), true);
  assert.equal(elements.promptTabButtons.has('memoryTable'), true);
  assert.equal(elements.promptTabButtons.has('lastResponse'), true);
  assert.equal(elements.promptTextarea.value, '旧提示词');
  elements.promptTextarea.value = '新提示词';
  findByText(elements.sections.get('prompt'), '保存').dispatchEvent('click', {});
  await flushMicrotasks();
  assert.equal(store.maidPrompt, '新提示词');
  assert.equal(elements.statusEl.textContent, '提示词已保存');

  panel.switchTab('appKnowledge');
  assert.equal(elements.tabButtons.get('prompt').classList.contains('is-active'), true);
  assert.equal(elements.promptTabButtons.get('appKnowledge').classList.contains('is-active'), true);
  assert.equal(elements.promptPanes.get('appKnowledge').classList.contains('is-active'), true);
  assert.match(elements.appKnowledgeTextarea.value, /worldbook\.open/);
  assert.match(elements.lastAppContextTextarea.value, /检索：已执行/);

  panel.switchTab('historyContext');
  assert.equal(elements.promptTabButtons.get('historyContext').classList.contains('is-active'), true);
  assert.equal(elements.historyContextTextarea.value, '- 用户: 创建角色卡 A\n  结果: 已完成');
  findByText(elements.promptPanes.get('historyContext'), '复制').dispatchEvent('click', {});
  await flushMicrotasks();
  assert.deepEqual(copied, ['- 用户: 创建角色卡 A\n  结果: 已完成']);

  panel.switchTab('memoryTable');
  assert.equal(elements.promptTabButtons.get('memoryTable').classList.contains('is-active'), true);
  assert.match(elements.memoryTableTextarea.value, /用户创建了角色卡 A/);
  findByText(elements.promptPanes.get('memoryTable'), '复制').dispatchEvent('click', {});
  await flushMicrotasks();
  assert.deepEqual(copied, [
    '- 用户: 创建角色卡 A\n  结果: 已完成',
    '| 1 | 摘要 |\n| 内容 | 用户创建了角色卡 A。 |',
  ]);

  panel.switchTab('lastPrompt');
  assert.equal(elements.lastPromptTextarea.value, 'system:\n本次提示词');
  findByText(elements.promptPanes.get('lastPrompt'), '复制').dispatchEvent('click', {});
  await flushMicrotasks();
  assert.deepEqual(copied, [
    '- 用户: 创建角色卡 A\n  结果: 已完成',
    '| 1 | 摘要 |\n| 内容 | 用户创建了角色卡 A。 |',
    'system:\n本次提示词',
  ]);

  panel.switchTab('lastResponse');
  assert.equal(elements.tabButtons.get('prompt').classList.contains('is-active'), true);
  assert.equal(elements.promptTabButtons.get('lastResponse').classList.contains('is-active'), true);
  assert.equal(elements.promptPanes.get('lastResponse').classList.contains('is-active'), true);
  assert.equal(elements.lastResponseTextarea.value, '完整回复');
  findByText(elements.promptPanes.get('lastResponse'), '复制').dispatchEvent('click', {});
  await flushMicrotasks();
  assert.deepEqual(copied, [
    '- 用户: 创建角色卡 A\n  结果: 已完成',
    '| 1 | 摘要 |\n| 内容 | 用户创建了角色卡 A。 |',
    'system:\n本次提示词',
    '完整回复',
  ]);

  panel.switchTab('api');
  findByText(elements.sections.get('api'), '打开 API 设定').dispatchEvent('click', {});
  assert.equal(apiCalls.length, 1);
  assert.equal(apiCalls[0].source, 'maid_settings');
  assert.equal(panel.isOpen(), false);
  console.log('ok - maid settings panel saves prompt and exposes debug tabs');
}
