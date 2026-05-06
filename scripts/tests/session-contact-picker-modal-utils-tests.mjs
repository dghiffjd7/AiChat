import assert from 'node:assert/strict';

import { createSessionContactPickerModal } from '../../src/scripts/ui/session-contact-picker-modal-utils.js';

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.style = { cssText: '' };
      this.className = '';
      this.id = '';
      this.textContent = '';
      this.type = '';
      this.placeholder = '';
      this.listeners = {};
      this.parentNode = null;
    }
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    }
    addEventListener(type, handler) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(handler);
    }
  }
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
};

{
  const documentRef = createFakeDocument();
  const topContent = documentRef.createElement('div');
  topContent.id = 'top-content';
  const modal = createSessionContactPickerModal({
    documentRef,
    overlayId: 'group-create-overlay',
    panelId: 'group-create-panel',
    title: '创建群组',
    subtitle: '从联系人中选择成员',
    closeId: 'group-close',
    cancelId: 'group-cancel',
    confirmId: 'group-create',
    confirmLabel: '创建',
    searchId: 'group-search',
    listId: 'group-contacts',
    sectionTitle: '选择成员',
    topContent,
    overlayZIndex: 20000,
    panelZIndex: 21000,
    inset: 10,
  });
  assert.equal(modal.overlay.id, 'group-create-overlay');
  assert.equal(modal.panel.id, 'group-create-panel');
  assert.equal(modal.titleEl.textContent, '创建群组');
  assert.equal(modal.subtitleEl.textContent, '从联系人中选择成员');
  assert.equal(modal.body.children[0].id, 'top-content');
  assert.equal(modal.body.children[1].textContent, '选择成员');
  assert.equal(modal.searchInput.id, 'group-search');
  assert.equal(modal.list.id, 'group-contacts');
  assert.equal(modal.confirmButton.textContent, '创建');
  assert.equal(modal.panel.style.cssText.includes('z-index:21000;'), true);
  console.log('ok - createSessionContactPickerModal builds group-create style picker shell');
}

{
  const documentRef = createFakeDocument();
  const modal = createSessionContactPickerModal({
    documentRef,
    overlayId: 'group-add-overlay',
    panelId: 'group-add-panel',
    title: '添加成员',
    subtitle: '从联系人中选择',
    closeId: 'group-add-close',
    cancelId: 'group-add-cancel',
    confirmId: 'group-add-confirm',
    confirmLabel: '添加',
    searchId: 'group-add-search',
    listId: 'group-add-list',
    inset: 18,
    panelZIndex: 23000,
  });
  assert.equal(modal.closeButton.id, 'group-add-close');
  assert.equal(modal.cancelButton.id, 'group-add-cancel');
  assert.equal(modal.confirmButton.id, 'group-add-confirm');
  assert.equal(modal.searchInput.placeholder, '搜索联系人...');
  assert.equal(modal.body.children.length, 2);
  assert.equal(modal.footer.style.cssText.includes('display:flex; gap:10px;'), true);
  assert.equal(typeof modal.panel.listeners.click[0], 'function');
  console.log('ok - createSessionContactPickerModal builds add-member picker shell without extra top content');
}
