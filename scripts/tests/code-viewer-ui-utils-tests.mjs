import assert from 'node:assert/strict';

import { createCodeViewerUiRuntime } from '../../src/scripts/ui/chat/code-viewer-ui-utils.js';

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = String(tagName || '').toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.dataset = {};
      this.style = {};
      this.textContent = '';
      this.type = '';
      this.value = '';
      this.disabled = false;
      this.listeners = new Map();
      this.focused = false;
      this.attributes = {};
      const classes = new Set();
      this.classList = {
        add: value => classes.add(value),
        remove: value => classes.delete(value),
        contains: value => classes.has(value),
        toggle: (value, force) => {
          const next = force === undefined ? !classes.has(value) : Boolean(force);
          if (next) classes.add(value);
          else classes.delete(value);
          return next;
        },
      };
    }
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    }
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
    emit(type, event = {}) {
      return this.listeners.get(type)?.(event);
    }
    focus() {
      this.focused = true;
    }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }
    getAttribute(name) {
      return this.attributes[name] ?? null;
    }
  }
  const listeners = new Map();
  return {
    body: new FakeElement('body'),
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type);
    },
    emit(type, event = {}) {
      return listeners.get(type)?.(event);
    },
  };
};

{
  const documentLike = createFakeDocument();
  const keydown = [];
  const scheduled = [];
  const runtime = createCodeViewerUiRuntime({
    documentLike,
    windowLike: {
      addEventListener(type, handler) {
        keydown.push([type, handler]);
      },
    },
    schedule: cb => scheduled.push(cb),
    onSaveEdit: async () => {},
  });
  const overlay = runtime.openCodeViewer(null, {
    message: { role: 'assistant', id: 'm1' },
    text: 'hello',
    canSave: true,
  });
  assert.equal(documentLike.body.children[0], overlay);
  assert.equal(overlay.style.display, 'block');
  assert.equal(overlay.__chatappRefs.codeEl.value, 'hello');
  assert.equal(overlay.__chatappRefs.saveBtn.style.display, 'inline-block');
  scheduled[0]();
  assert.equal(overlay.__chatappRefs.codeEl.focused, true);
  keydown[0][1]({ key: 'Escape' });
  assert.equal(overlay.style.display, 'none');
  console.log('ok - openCodeViewer mounts overlay populates content and supports escape hide');
}

{
  const documentLike = createFakeDocument();
  const saves = [];
  const runtime = createCodeViewerUiRuntime({
    documentLike,
    windowLike: { addEventListener() {} },
    schedule: cb => cb(),
    onSaveEdit: async (message, text) => saves.push([message.id, text]),
  });
  const overlay = runtime.openCodeViewer(null, {
    message: { role: 'assistant', id: 'm2' },
    text: 'before',
    canSave: true,
  });
  overlay.__chatappRefs.codeEl.value = 'after';
  await overlay.__chatappRefs.saveBtn.emit('click');
  assert.deepEqual(saves, [['m2', 'after']]);
  assert.equal(overlay.style.display, 'none');
  console.log('ok - code viewer save forwards edited assistant raw text and hides viewer');
}

{
  const documentLike = createFakeDocument();
  const keydown = [];
  const runtime = createCodeViewerUiRuntime({
    documentLike,
    windowLike: {
      addEventListener(type, handler) {
        keydown.push([type, handler]);
      },
    },
    schedule: cb => cb(),
    onSaveEdit: async () => true,
  });
  const overlay = runtime.openCodeViewer(null, {
    message: { role: 'assistant', id: 'creative-reply' },
    text: 'creative raw reply',
    canSave: true,
    context: { sourceKind: 'creative_raw_original' },
  });
  const { panel, maximizeBtn } = overlay.__chatappRefs;
  assert.equal(maximizeBtn.style.display, 'inline-flex');
  assert.equal(maximizeBtn.getAttribute('aria-label'), '放大原回复编辑器');
  assert.equal(maximizeBtn.getAttribute('aria-pressed'), 'false');
  assert.match(maximizeBtn.innerHTML, /code-viewer-maximize-expand/);
  assert.match(maximizeBtn.innerHTML, /code-viewer-maximize-restore/);

  maximizeBtn.emit('click', { stopPropagation() {} });
  assert.equal(overlay.dataset.maximized, '1');
  assert.equal(panel.style.maxWidth, 'none');
  assert.equal(panel.style.borderRadius, '0px');
  assert.equal(maximizeBtn.getAttribute('aria-pressed'), 'true');
  assert.equal(maximizeBtn.getAttribute('aria-label'), '还原原回复编辑器');

  keydown[0][1]({ key: 'Escape', preventDefault() {} });
  assert.equal(overlay.style.display, 'block', '全屏时第一次 Escape 应只还原面板');
  assert.equal(overlay.dataset.maximized, '0');
  assert.equal(panel.style.maxWidth, '920px');

  maximizeBtn.emit('click', { stopPropagation() {} });
  overlay.__chatappRefs.closeBtn.emit('click');
  assert.equal(overlay.style.display, 'none');
  assert.equal(overlay.dataset.maximized, '0', '关闭编辑器时不得遗留全屏状态');

  runtime.openCodeViewer(overlay, {
    message: { role: 'assistant', id: 'social-reply' },
    text: 'social raw reply',
    canSave: true,
    context: { sourceKind: 'social_turn_raw' },
  });
  assert.equal(maximizeBtn.style.display, 'none', '非创意写作 AI 回复不应扩张此次功能范围');
  console.log('ok - creative reply editor maximizes, restores on Escape, and resets outside its target scope');
}

{
  const documentLike = createFakeDocument();
  const runtime = createCodeViewerUiRuntime({
    documentLike,
    windowLike: { addEventListener() {} },
    schedule: cb => cb(),
    onSaveEdit: async () => {},
  });
  const overlay = runtime.openCodeViewer(null, {
    message: { role: 'user', id: 'u1' },
    text: 'readonly',
    canSave: false,
  });
  assert.equal(overlay.__chatappRefs.saveBtn.style.display, 'none');
  documentLike.emit('pointerdown', { target: overlay, pointerId: 1 });
  documentLike.emit('pointerup', { target: overlay, pointerId: 1 });
  overlay.emit('click', { target: overlay });
  assert.equal(overlay.style.display, 'none');
  console.log('ok - code viewer hides save button for non-editable messages and closes on backdrop click');
}

{
  const documentLike = createFakeDocument();
  const runtime = createCodeViewerUiRuntime({
    documentLike,
    windowLike: { addEventListener() {} },
    schedule: cb => cb(),
    onSaveEdit: async () => true,
  });
  const overlay = runtime.openCodeViewer(null, {
    message: { role: 'assistant', id: 'm-drag' },
    text: 'select this text',
    canSave: true,
  });
  const textarea = overlay.__chatappRefs.codeEl;
  documentLike.emit('pointerdown', { target: textarea, pointerId: 2 });
  documentLike.emit('pointerup', { target: overlay, pointerId: 2 });
  overlay.emit('click', { target: overlay });
  assert.equal(overlay.style.display, 'block');

  documentLike.emit('pointerdown', { target: overlay, pointerId: 3 });
  documentLike.emit('pointerup', { target: overlay, pointerId: 3 });
  overlay.emit('click', { target: overlay });
  assert.equal(overlay.style.display, 'none');
  console.log('ok - code viewer keeps editing open when text selection drags out and closes on a genuine backdrop click');
}

{
  const documentLike = createFakeDocument();
  const contexts = [];
  const runtime = createCodeViewerUiRuntime({
    documentLike,
    windowLike: { addEventListener() {} },
    schedule: cb => cb(),
    confirmDiscard: () => false,
    onSaveEdit: async (_message, _text, context) => {
      contexts.push(context);
      return false;
    },
  });
  const overlay = runtime.openCodeViewer(null, {
    message: { role: 'assistant', id: 'm3' },
    text: 'before',
    canSave: true,
    context: { sourceSnapshot: 'before', turnId: 'turn-1' },
  });
  overlay.__chatappRefs.codeEl.value = 'after';
  overlay.__chatappRefs.codeEl.emit('input');
  overlay.__chatappRefs.closeBtn.emit('click');
  assert.equal(overlay.style.display, 'block');
  await overlay.__chatappRefs.saveBtn.emit('click');
  assert.deepEqual(contexts, [{ sourceSnapshot: 'before', turnId: 'turn-1' }]);
  assert.equal(overlay.style.display, 'block');
  assert.match(overlay.__chatappRefs.hint.textContent, /失败/);
  console.log('ok - dirty source edits require discard confirmation and failed saves stay open');
}

{
  const documentLike = createFakeDocument();
  const validations = [];
  const runtime = createCodeViewerUiRuntime({
    documentLike,
    windowLike: { addEventListener() {} },
    schedule: cb => cb(),
  });
  const opened = runtime.openPatchReview(null, {
    message: { role: 'assistant', id: 'm4' },
    originalText: 'line 1\nbad close',
    linePatches: [{
      startLine: 2,
      endLine: 2,
      originalLines: ['bad close'],
      replacementLines: ['</rule>'],
      reason: '补齐闭合标签',
    }],
    formatSources: ['privateChat'],
    warning: '正文疑似严重截断，可考虑重新生成',
    validateCandidate: async ({ candidateText }) => {
      validations.push(candidateText);
      return { canApply: true, statusText: '本地复查通过' };
    },
  });
  await Promise.resolve();
  await Promise.resolve();
  const overlay = opened.overlay;
  assert.equal(overlay.__chatappMode, 'review');
  assert.match(overlay.__chatappRefs.reviewSummary.textContent, /私聊格式/);
  assert.match(overlay.__chatappRefs.reviewSummary.textContent, /疑似严重截断/);
  assert.equal(overlay.__chatappRefs.reviewHunks.children.length, 1);
  assert.equal(overlay.__chatappRefs.applyReviewBtn.disabled, false);
  overlay.__chatappRefs.applyReviewBtn.emit('click');
  const result = await opened.promise;
  assert.equal(result.confirmed, true);
  assert.equal(result.candidateText, 'line 1\n</rule>');
  assert.equal(result.acceptedPatches.length, 1);
  assert.deepEqual(validations, ['line 1\n</rule>']);
  console.log('ok - patch review renders validated hunks and resolves the accepted candidate once');
}
