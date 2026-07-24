import assert from 'node:assert/strict';

const createClassList = () => {
  const values = new Set();
  return {
    add: (...items) => items.forEach(item => values.add(item)),
    toggle: (item, force) => {
      if (force === true) values.add(item);
      else if (force === false) values.delete(item);
      else if (values.has(item)) values.delete(item);
      else values.add(item);
    },
    contains: item => values.has(item),
  };
};

const createChip = () => ({
  classList: createClassList(),
  dataset: {},
  style: {},
  textContent: '',
  type: '',
  onclick: null,
});

const modelInput = { value: '' };
const modelOptions = {
  children: [],
  style: {},
  _innerHTML: '',
  set innerHTML(value) {
    this._innerHTML = value;
    this.children = [];
  },
  get innerHTML() {
    return this._innerHTML;
  },
  appendChild(child) {
    this.children.push(child);
  },
};

const previousDocument = globalThis.document;
const previousLocalStorage = globalThis.localStorage;
const previousWindow = globalThis.window;
const previousSetTimeout = globalThis.setTimeout;
const previousClearTimeout = globalThis.clearTimeout;
globalThis.document = {
  createElement: () => createChip(),
};
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
globalThis.window = {};

try {
  const { ConfigPanel } = await import('../../src/scripts/ui/config-panel.js');
  const panel = Object.create(ConfigPanel.prototype);
  panel.modelOptions = [];
  panel.element = {
    querySelector(selector) {
      if (selector === '#config-model') return modelInput;
      if (selector === '#model-options') return modelOptions;
      return null;
    },
  };

  const original = [
    'zeta-model',
    'gpt-mini',
    'deepseek-chat',
    'chat-gpt-pro',
  ];

  panel.renderModelOptions(original);
  assert.deepEqual(
    modelOptions.children.map(chip => chip.textContent),
    original,
    '空输入时保持服务端原始顺序',
  );

  modelInput.value = 'gpt';
  panel.renderModelOptions(panel.modelOptions);
  assert.deepEqual(
    modelOptions.children.map(chip => chip.textContent),
    ['gpt-mini', 'chat-gpt-pro', 'zeta-model', 'deepseek-chat'],
    '前缀与包含关键词的模型应稳定排在未命中项之前',
  );
  assert.deepEqual(panel.modelOptions, original, '排序不应破坏原始模型候选顺序');
  assert.equal(modelOptions.children.length, original.length, '未命中的模型仍应保留在列表中');
  assert.equal(modelOptions.children[0].classList.contains('is-match'), true);
  assert.equal(modelOptions.children[1].classList.contains('is-match'), true);
  assert.equal(modelOptions.children[2].classList.contains('is-match'), false);

  console.log('ok - config model candidates rank matches first without hiding nonmatches');

  let nextTimerId = 0;
  const pendingTimers = new Map();
  const scheduledDelays = [];
  globalThis.setTimeout = (callback, delay) => {
    const timerId = ++nextTimerId;
    pendingTimers.set(timerId, () => {
      pendingTimers.delete(timerId);
      callback();
    });
    scheduledDelays.push(delay);
    return timerId;
  };
  globalThis.clearTimeout = timerId => pendingTimers.delete(timerId);

  let renderCount = 0;
  panel.modelFilterDebounceTimer = null;
  panel.modelOptions = ['gpt-mini', 'chat-gpt-pro'];
  panel.renderModelOptions = () => {
    renderCount += 1;
  };

  panel.scheduleModelOptionsRender();
  panel.scheduleModelOptionsRender();
  panel.scheduleModelOptionsRender();
  assert.equal(renderCount, 0, '连续输入期间不应立即重建 chips');
  assert.equal(pendingTimers.size, 1, '连续输入应只保留最后一个待执行渲染');
  assert.deepEqual(scheduledDelays, [80, 80, 80], '模型筛选 debounce 应保持约 80ms');

  const [runScheduledRender] = pendingTimers.values();
  runScheduledRender();
  assert.equal(renderCount, 1, '输入停顿后应只重建一次 chips');
  assert.equal(panel.modelFilterDebounceTimer, null);

  panel.scheduleModelOptionsRender();
  panel.clearModelOptions();
  assert.equal(pendingTimers.size, 0, '清空模型列表时应取消待执行渲染');

  console.log('ok - config model chip rebuilds are debounced and lifecycle-safe');
} finally {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
  if (previousLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousLocalStorage;
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
  globalThis.setTimeout = previousSetTimeout;
  globalThis.clearTimeout = previousClearTimeout;
}
