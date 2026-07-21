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
    this._innerHTML = '';
    this.focused = false;
    this.scrollHeight = 32;
    this.rect = { left: 100, top: 200, width: 26, height: 26 };
  }

  set innerHTML(value) {
    this._innerHTML = String(value || '');
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
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
  const statusSnapshots = [];
  const runtime = createMaidCommandInputRuntime({
    documentRef,
    modeSwitchEl,
    getViewportSize: () => ({ w: 360, h: 640 }),
    onSubmit: async (text, controls) => {
      submissions.push(text);
      controls.setStatus('模型生成的执行前回应', 'thinking'); // 模型话语 → 正常气泡
      controls.setStatus('我已经取得结果，正在整理给你。', 'progress'); // 写死过程提示 → live 行
      statusSnapshots.push({
        live: runtime.getLiveStatus()?.message || '',
        messages: runtime.getResultMessages().map(item => item.message),
      });
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
  assert.match(documentRef.head.children[0].textContent, /\.maid-command-input:focus-within/);
  assert.doesNotMatch(documentRef.head.children[0].textContent, /\.maid-command-input-field:focus-visible/);
  assert.equal(rootEl.classList.contains('is-open'), true);
  assert.equal(inputEl.tagName, 'TEXTAREA');
  assert.equal(rootEl.dataset.bubbleSide, 'bottom');
  assert.equal(modeSwitchEl.classList.contains('is-maid-input-open'), true);
  assert.match(runtime.getElements().settingsBtn.innerHTML, /svg/);
  assert.match(runtime.getElements().submitBtn.innerHTML, /svg/);
  timeouts.shift()?.();
  assert.equal(inputEl.focused, true);
  assert.equal(inputEl.style.height, '32px');

  inputEl.scrollHeight = 120;
  inputEl.dispatchEvent('input');
  assert.equal(inputEl.style.height, '76px');
  assert.equal(inputEl.style.overflowY, 'auto');
  assert.equal(rootEl.classList.contains('is-multiline'), true);

  inputEl.scrollHeight = 32;
  inputEl.dispatchEvent('input');
  assert.equal(inputEl.style.height, '32px');
  assert.equal(inputEl.style.overflowY, 'hidden');

  inputEl.value = '打开世界书';
  const result = await runtime.submit();
  assert.equal(result.ok, true);
  assert.deepEqual(submissions, ['打开世界书']);
  // 写死过程提示（progress）在 live 单行原位替换；模型话语（thinking）保持气泡
  assert.deepEqual(statusSnapshots, [{ live: '我已经取得结果，正在整理给你。', messages: ['模型生成的执行前回应'] }]);
  assert.deepEqual(runtime.getResultMessages().map(item => item.message), [
    '模型生成的执行前回应',
    'done 打开世界书',
  ]);
  assert.equal(runtime.getLiveStatus(), null, '提交结束 live 行退场');
  assert.equal(runtime.getElements().resultEl.children.length, 2);
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
  let finishSubmit = null;
  const runtime = createMaidCommandInputRuntime({
    documentRef,
    modeSwitchEl,
    getViewportSize: () => ({ w: 360, h: 640 }),
    onSubmit: async (text, controls) => {
      controls.setStatus('步骤 1：读取资料', 'progress');
      await new Promise(resolve => {
        finishSubmit = resolve;
      });
      controls.setStatus('步骤 2：整理结果', 'progress');
      return { ok: true, message: `完成 ${text}` };
    },
    setTimeoutFn: () => 1,
    clearTimeoutFn: () => {},
  });

  assert.equal(runtime.open(), true);
  const { rootEl, inputEl } = runtime.getElements();
  inputEl.value = '检查世界书';
  const pending = runtime.submit();
  assert.equal(runtime.isSubmitting(), true);
  // 过程叙述在 live 单行内原位替换，不进消息列表
  assert.deepEqual(runtime.getResultMessages(), []);
  assert.equal(runtime.getLiveStatus()?.message, '步骤 1：读取资料');

  documentRef.dispatchEvent('pointerdown', { target: outsideEl });
  assert.equal(rootEl.classList.contains('is-open'), false);
  assert.equal(modeSwitchEl.classList.contains('is-maid-input-open'), false);

  assert.equal(runtime.open(), true);
  assert.equal(rootEl.classList.contains('is-open'), true);
  assert.equal(runtime.getLiveStatus()?.message, '步骤 1：读取资料', '重开后 live 行仍在');

  finishSubmit();
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(runtime.isSubmitting(), false);
  assert.deepEqual(runtime.getResultMessages().map(item => item.message), [
    '完成 检查世界书',
  ]);
  assert.equal(runtime.getLiveStatus(), null, '提交结束 live 行退场');
  assert.equal(runtime.getElements().resultEl.children.length, 1);
  console.log('ok - maid command input keeps live progress line across close/reopen');
}

{
  const documentRef = new FakeDocument();
  const submitted = [];
  const runtime = createMaidCommandInputRuntime({
    documentRef,
    getViewportSize: () => ({ w: 360, h: 640 }),
    onAttachFiles: async files => files.map((file, index) => ({
      id: `img-${index}`,
      kind: 'image',
      url: `data:image/png;base64,${index}`,
      name: file.name,
      mime: file.type,
      size: file.size,
    })),
    onSubmit: async (text, controls) => {
      submitted.push({ text, attachments: controls.attachments });
      return { ok: true, message: '看到了。' };
    },
    setTimeoutFn: () => 1,
    clearTimeoutFn: () => {},
  });

  assert.equal(runtime.open(), true);
  await runtime.addFiles([{ name: 'screen.png', type: 'image/png', size: 12 }], { source: 'test' });
  const { rootEl, attachmentsEl, inputEl } = runtime.getElements();
  assert.equal(runtime.getAttachments().length, 1);
  assert.equal(rootEl.classList.contains('has-attachments'), true);
  assert.equal(attachmentsEl.children.length, 1);
  inputEl.value = '';
  const result = await runtime.submit();
  assert.equal(result.ok, true);
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].text, '请看这张图片。');
  assert.equal(submitted[0].attachments.length, 1);
  assert.equal(runtime.getAttachments().length, 0);
  assert.equal(rootEl.classList.contains('has-attachments'), false);
  console.log('ok - maid command input attaches images and submits them with fallback text');
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

  const confirmBtn = new FakeElement('button');
  const confirmModal = new FakeElement('div');
  confirmModal.classList.add('app-confirm-modal');
  confirmModal.appendChild(confirmBtn);
  documentRef.dispatchEvent('pointerdown', {
    target: confirmBtn,
    composedPath: () => [confirmBtn, confirmModal, documentRef.body],
  });
  assert.equal(rootEl.classList.contains('is-open'), true);
  assert.equal(modeSwitchEl.classList.contains('is-maid-input-open'), true);

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

{
  // 指令条盖住悬浮球：非交互区按下 → 转发球拖拽（运行中控件禁用时整条可拖）；交互控件不转发
  const documentRef = new FakeDocument();
  const modeSwitchEl = new FakeElement('div');
  const dragCalls = [];
  const runtime = createMaidCommandInputRuntime({
    documentRef,
    modeSwitchEl,
    getViewportSize: () => ({ w: 360, h: 640 }),
    onSubmit: async () => ({ ok: true }),
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => {},
    getBallDragRuntime: () => ({
      startDrag: (event, options) => {
        dragCalls.push({ event, options });
        return true;
      },
    }),
  });
  assert.equal(runtime.open(), true);
  const { rootEl } = runtime.getElements();
  assert.equal(
    rootEl.children.some(child => child.className === 'maid-command-input-drag'),
    true,
    '指令条带常驻拖柄（touch-action:none 保移动端可拖）',
  );
  rootEl.dispatchEvent('pointerdown', { target: { closest: () => null } });
  assert.equal(dragCalls.length, 1, '非交互区按下转发球拖拽');
  assert.equal(dragCalls[0].options.suppressLongPress, true, '转发拖拽抑制长按');
  assert.equal(dragCalls[0].options.suppressClick, true, '转发区静止单击不得误触模式切换');
  rootEl.dispatchEvent('pointerdown', {
    target: { closest: selector => (String(selector).includes('textarea') ? {} : null) },
  });
  assert.equal(dragCalls.length, 1, '可用交互控件按下不转发拖拽');
  console.log('ok - maid command input 非交互区拖拽转发与控件豁免');
}

{
  // 执行流 trace 卡并入白色结果流：按 id 原位更新、与叙述气泡交错、未打开时不消费
  const documentRef = new FakeDocument();
  const modeSwitchEl = new FakeElement('div');
  const openStates = [];
  const runtime = createMaidCommandInputRuntime({
    documentRef,
    modeSwitchEl,
    getViewportSize: () => ({ w: 360, h: 640 }),
    onSubmit: async () => ({ ok: true }),
    onOpenStateChange: state => openStates.push({ ...state }),
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => {},
  });
  const view = (steps, terminal = false, status = 'running') => ({
    runId: 'run_1',
    title: '整理房间',
    status,
    statusLabel: terminal ? '完成' : '执行中',
    tone: terminal ? 'success' : 'accent',
    terminal,
    doneSummary: terminal ? '搞定了' : '',
    failureCode: '',
    steps,
  });
  const step = (id, seq, status, tone, statusLabel, glyph) => ({
    id, seq, title: `步骤${seq}`, toolName: `tool.${id}`, status, tone, statusLabel, glyph, error: '',
  });

  assert.equal(runtime.applyTraceView(view([])), false, '指令条未打开 → 不消费（面板兜底）');
  assert.equal(runtime.open(), true);
  assert.deepEqual(openStates, [{ open: true, submitting: false }], '打开后应通知执行流重新仲裁');
  assert.equal(runtime.applyTraceView(view([step('a', 1, 'running', 'accent', '执行中', '行')])), true);
  runtime.setStatus('我先看看有哪些会话～', 'thinking'); // 模型话语 → 气泡
  runtime.setStatus('我已经取得结果，正在整理给你。', 'progress'); // 写死提示 → live 行
  assert.equal(runtime.getLiveStatus()?.message, '我已经取得结果，正在整理给你。', '写死过程提示进 live 行');
  assert.equal(runtime.applyTraceView(view([step('a', 1, 'succeeded', 'success', '完成', '成')])), true);
  let items = runtime.getResultMessages();
  assert.deepEqual(items.map(item => item.kind || 'text'), ['trace', 'trace', 'text'], '模型话语气泡与 trace 卡交错保留');
  assert.equal(items[1].glyph, '成', '同 id 步骤原位更新为完成');
  assert.equal(items[1].statusLabel, '完成');

  runtime.applyTraceView(view([step('a', 1, 'succeeded', 'success', '完成', '成')], true, 'succeeded'));
  items = runtime.getResultMessages();
  assert.equal(items[items.length - 1].glyph, '成', '终态卡追加在末尾');
  assert.equal(items[items.length - 1].sub, '搞定了');
  assert.equal(runtime.getLiveStatus(), null, 'run 终态 live 行退场');
  runtime.close();
  assert.deepEqual(openStates, [
    { open: true, submitting: false },
    { open: false, submitting: false },
  ], '关闭后应通知执行流立即接管');
  assert.equal(runtime.applyTraceView(view([])), false, '指令条曾打开但已关闭 → 不再消费后台 run');
  console.log('ok - maid command input 承载执行流 trace 卡（原位更新/交错/未开不消费）');
}

{
  // 终态 trace 与 submit success 可能先后到达；同文最终回复只保留 success 气泡一份。
  const terminalView = runId => ({
    runId,
    title: '查看当前页面',
    status: 'succeeded',
    statusLabel: '完成',
    tone: 'success',
    terminal: true,
    doneSummary: '现在打开的是联系人页面。',
    failureCode: '',
    steps: [],
  });
  let runtime;
  runtime = createMaidCommandInputRuntime({
    documentRef: new FakeDocument(),
    modeSwitchEl: new FakeElement('div'),
    getViewportSize: () => ({ w: 360, h: 640 }),
    onSubmit: async () => {
      runtime.applyTraceView(terminalView('run_trace_first'));
      return { ok: true, message: '现在打开的是联系人页面。' };
    },
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => {},
  });
  runtime.open();
  runtime.getElements().inputEl.value = '帮我看看现在打开的是哪个页面';
  await runtime.submit();
  let items = runtime.getResultMessages();
  assert.equal(
    items.flatMap(item => [item.message, item.sub]).filter(text => text === '现在打开的是联系人页面。').length,
    1,
    'DONE 先到时 success 气泡应清掉卡片里的同文 summary',
  );
  assert.equal(items.find(item => item.id === 'done:run_trace_first')?.sub, '');

  const replayRuntime = createMaidCommandInputRuntime({
    documentRef: new FakeDocument(),
    modeSwitchEl: new FakeElement('div'),
    getViewportSize: () => ({ w: 360, h: 640 }),
    onSubmit: async () => ({ ok: true }),
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => {},
  });
  replayRuntime.open();
  replayRuntime.setStatus('现在打开的是联系人页面。', 'success');
  replayRuntime.applyTraceView(terminalView('run_result_first'));
  items = replayRuntime.getResultMessages();
  assert.equal(items.find(item => item.id === 'done:run_result_first')?.sub, '');
  assert.equal(
    items.flatMap(item => [item.message, item.sub]).filter(text => text === '现在打开的是联系人页面。').length,
    1,
    '终态回放晚到时也不应重新写入重复 summary',
  );
  console.log('ok - maid command input terminal summary dedupes against the final result bubble');
}

{
  // 逐卡推出：同批新卡按序错峰进场；原位补丁不重播进场；live 态状态点带转圈 class
  const documentRef = new FakeDocument();
  const modeSwitchEl = new FakeElement('div');
  const runtime = createMaidCommandInputRuntime({
    documentRef,
    modeSwitchEl,
    getViewportSize: () => ({ w: 360, h: 640 }),
    onSubmit: async () => ({ ok: true }),
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => {},
  });
  runtime.open();
  const mkStep = (id, seq, status, tone, statusLabel, glyph) => ({
    id, seq, title: `步骤${seq}`, toolName: '', status, tone, statusLabel, glyph, error: '',
  });
  const mkView = (steps) => ({
    runId: 'run_s', title: '任务', status: 'running', statusLabel: '执行中', tone: 'accent',
    terminal: false, doneSummary: '', failureCode: '', steps,
  });

  runtime.applyTraceView(mkView([
    mkStep('a', 1, 'running', 'accent', '执行中', '行'),
    mkStep('b', 2, 'queued', 'muted', '排队', '行'),
  ]));
  const { resultEl } = runtime.getElements();
  assert.equal(resultEl.children.length, 3, 'plan + 2 步骤');
  assert.ok(resultEl.children.every(node => node.classList.contains('is-entering')), '首批全部走进场');
  assert.deepEqual(
    resultEl.children.map(node => node.style.animationDelay),
    ['0ms', '150ms', '300ms'],
    '同批新卡按序错峰推出',
  );
  const findStatus = (bubble) => {
    const head = bubble.children[0];
    return (head?.children || []).find(child => String(child.className || '').includes('mci-trace-status')) || null;
  };
  assert.ok(String(findStatus(resultEl.children[1])?.className).includes('is-live'), '执行中带转圈 class');

  const stepNodeBefore = resultEl.children[1];
  runtime.applyTraceView(mkView([
    mkStep('a', 1, 'succeeded', 'success', '完成', '成'),
    mkStep('b', 2, 'running', 'accent', '执行中', '行'),
  ]));
  assert.equal(resultEl.children.length, 3, '原位补丁不新增节点');
  assert.equal(resultEl.children[1], stepNodeBefore, '既有卡节点身份不变（不重播进场）');
  assert.equal(String(findStatus(resultEl.children[1])?.className).includes('is-live'), false, '完成后转圈移除');
  assert.ok(String(findStatus(resultEl.children[2])?.className).includes('is-live'), '轮到的步骤转圈');
  console.log('ok - maid command input 逐卡推出与 live 转圈');
}
