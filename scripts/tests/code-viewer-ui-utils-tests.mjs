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
  }
  return {
    body: new FakeElement('body'),
    createElement(tagName) {
      return new FakeElement(tagName);
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
  overlay.emit('click');
  assert.equal(overlay.style.display, 'none');
  console.log('ok - code viewer hides save button for non-editable messages and closes on backdrop click');
}
