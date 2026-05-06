import assert from 'node:assert/strict';

import {
  createEditableTextareaModal,
  createReadonlyTextareaModal,
} from '../../src/scripts/ui/session-summary-modal-utils.js';

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.style = { cssText: '' };
      this.className = '';
      this.textContent = '';
      this.type = '';
      this.readOnly = false;
      this.value = '';
      this.listeners = {};
      this.parentNode = null;
      this.onclick = null;
    }
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    addEventListener(type, handler) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(handler);
    }
    focus() {
      this.__focused = true;
    }
  }
  const body = new FakeElement('body');
  return {
    body,
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
};

{
  const calls = [];
  const documentRef = createFakeDocument();
  const modal = createReadonlyTextareaModal({
    overlayClass: 'overlay-x',
    panelClass: 'panel-x',
    title: 'Raw',
    documentRef,
    copyText: async (text) => calls.push(['copy', text]),
    toastr: { success: (msg) => calls.push(['success', msg]) },
  });
  modal.setValue('hello');
  modal.show();
  await modal.copyButton.onclick();
  modal.okButton.onclick();
  assert.equal(documentRef.body.children.length, 2);
  assert.equal(modal.overlay.className, 'overlay-x');
  assert.equal(modal.panel.className, 'panel-x');
  assert.equal(modal.overlay.style.display, 'none');
  assert.equal(modal.panel.style.display, 'none');
  assert.deepEqual(calls, [
    ['copy', 'hello'],
    ['success', '已复制原始回复'],
  ]);
  console.log('ok - createReadonlyTextareaModal creates overlay/panel and wires copy/close actions');
}

{
  const documentRef = createFakeDocument();
  const calls = [];
  const modal = createEditableTextareaModal({
    overlayClass: 'overlay-y',
    panelClass: 'panel-y',
    title: 'Edit',
    helperText: 'helper',
    minHeight: '180px',
    documentRef,
  });
  modal.setOnSave((value) => calls.push(['save', value]));
  modal.setValue('draft');
  modal.show();
  modal.saveButton.onclick();
  modal.cancelButton.onclick();
  assert.equal(documentRef.body.children.length, 2);
  assert.equal(modal.overlay.className, 'overlay-y');
  assert.equal(modal.panel.className, 'panel-y');
  assert.equal(modal.textarea.value, 'draft');
  assert.equal(modal.overlay.style.display, 'none');
  assert.equal(modal.panel.style.display, 'none');
  assert.deepEqual(calls, [['save', 'draft']]);
  console.log('ok - createEditableTextareaModal creates editable modal and routes save callback');
}
