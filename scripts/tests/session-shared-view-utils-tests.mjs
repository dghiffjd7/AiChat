import assert from 'node:assert/strict';

import {
  createMemberManageRow,
  createMemoryShareEmptyState,
  createMemoryShareEntryRow,
  createSessionMemoryShareModal,
  createSelectableContactEmptyState,
  createSelectableContactRow,
  createSessionArchiveEmptyState,
  createSessionArchiveRow,
} from '../../src/scripts/ui/session-shared-view-utils.js';

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.style = { cssText: '' };
      this.className = '';
      this.textContent = '';
      this.type = '';
      this.value = '';
      this.checked = false;
      this.disabled = false;
      this.listeners = {};
      this.onclick = null;
      this.parentNode = null;
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
    setAttribute(name, value) {
      this[name] = value;
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
  const documentRef = createFakeDocument();
  const empty = createSessionArchiveEmptyState({ documentRef });
  assert.equal(empty.textContent, '暂无历史存档');
  assert.equal(empty.style.cssText.includes('text-align:center;'), true);
  console.log('ok - createSessionArchiveEmptyState builds shared archive empty placeholder');
}

{
  const calls = [];
  const documentRef = createFakeDocument();
  const { row, info, title, meta, deleteButton } = createSessionArchiveRow({
    documentRef,
    archiveName: '归档A',
    isCurrent: true,
    dateText: '2026/05/06 21:00:00',
    messageCount: 12,
    onSelect: async () => calls.push(['select']),
    onDelete: async (event) => calls.push(['delete', event?.type || 'manual']),
  });
  await info.onclick();
  await deleteButton.onclick({ type: 'click' });
  assert.equal(row.children.length, 2);
  assert.equal(title.textContent, '归档A (当前)');
  assert.equal(meta.textContent, '2026/05/06 21:00:00 · 12条消息');
  assert.equal(row.style.cssText.includes('3px solid var(--app-accent-primary, #019aff)'), true);
  assert.deepEqual(calls, [['select'], ['delete', 'click']]);
  console.log('ok - createSessionArchiveRow builds shared archive row and wires select/delete callbacks');
}

{
  const documentRef = createFakeDocument();
  const empty = createMemoryShareEmptyState({ documentRef });
  assert.equal(empty.className, 'memory-share-empty');
  assert.equal(empty.textContent, '当前来源没有可配置的跨模式记忆表格。');
  console.log('ok - createMemoryShareEmptyState builds shared memory-share empty placeholder');
}

{
  const calls = [];
  const documentRef = createFakeDocument();
  const { row, toggle, limitInput, desc } = createMemoryShareEntryRow({
    documentRef,
    entry: {
      tableId: 't1',
      shortLabel: '记忆表1',
      rowCount: 5,
      enabled: true,
      limit: 3,
    },
    onToggle: ({ entry, toggle, limitInput }) => {
      calls.push(['toggle', entry.tableId, toggle.checked, limitInput.disabled]);
    },
    onLimitInput: ({ entry, limitInput }) => {
      calls.push(['limit', entry.tableId, limitInput.value]);
    },
  });
  toggle.checked = false;
  toggle.listeners.change[0]();
  limitInput.value = '7';
  limitInput.listeners.input[0]();
  assert.equal(row.className, 'memory-share-row');
  assert.equal(desc.textContent, '当前可注入 5 条；0 代表全部注入。');
  assert.equal(limitInput.disabled, true);
  assert.deepEqual(calls, [
    ['toggle', 't1', false, true],
    ['limit', 't1', '7'],
  ]);
  console.log('ok - createMemoryShareEntryRow builds shared memory-share row and preserves toggle/limit hooks');
}

{
  const documentRef = createFakeDocument();
  const empty = createSelectableContactEmptyState({
    documentRef,
    text: '暂无可添加联系人',
  });
  assert.equal(empty.textContent, '暂无可添加联系人');
  assert.equal(empty.style.cssText.includes('font-size:13px;'), true);
  console.log('ok - createSelectableContactEmptyState builds shared selectable-list empty placeholder');
}

{
  const calls = [];
  const documentRef = createFakeDocument();
  const { row, nameEl, tag } = createSelectableContactRow({
    documentRef,
    id: 'c1',
    name: '联系人1',
    avatar: 'avatar://1',
    selected: true,
    selectedText: '已选',
    onClick: () => calls.push('click'),
  });
  row.onclick();
  assert.equal(row.tagName, 'button');
  assert.equal(nameEl.textContent, '联系人1');
  assert.equal(tag.textContent, '已选');
  assert.equal(row.style.cssText.includes('#93c5fd'), true);
  assert.deepEqual(calls, ['click']);
  console.log('ok - createSelectableContactRow builds shared selectable contact row and preserves click hook');
}

{
  const calls = [];
  const documentRef = createFakeDocument();
  const { row, nameEl, removeButton } = createMemberManageRow({
    documentRef,
    memberId: 'm1',
    name: '成员1',
    avatar: 'avatar://2',
    onRemove: () => calls.push('remove'),
  });
  removeButton.onclick();
  assert.equal(row.tagName, 'div');
  assert.equal(nameEl.textContent, '成员1');
  assert.equal(removeButton.textContent, '移除');
  assert.equal(removeButton.style.cssText.includes('#fee2e2'), true);
  assert.deepEqual(calls, ['remove']);
  console.log('ok - createMemberManageRow builds shared member management row and preserves remove hook');
}

{
  const documentRef = createFakeDocument();
  const modal = createSessionMemoryShareModal({
    documentRef,
    variant: 'contact',
  });
  assert.equal(modal.overlay.className, 'app-themed-overlay contact-inline-modal-overlay');
  assert.equal(modal.panel.className, 'app-themed-panel contact-inline-modal-panel');
  assert.equal(modal.sourceWrap?.tagName, 'label');
  assert.equal(modal.sourceSelect?.tagName, 'select');
  assert.equal(modal.sourceButton?.className, 'world-app-select-btn');
  assert.equal(modal.sourceStatic?.style.cssText.includes('display:none;'), true);
  assert.equal(modal.rows.tagName, 'div');
  assert.equal(typeof modal.panel.listeners.click[0], 'function');
  console.log('ok - createSessionMemoryShareModal builds shared contact memory-share modal shell');
}

{
  const documentRef = createFakeDocument();
  const modal = createSessionMemoryShareModal({
    documentRef,
    variant: 'group',
    hintText: '群聊提示',
  });
  assert.equal(modal.overlay.className, 'app-themed-overlay group-inline-modal-overlay');
  assert.equal(modal.panel.className, 'app-themed-panel group-inline-modal-panel');
  assert.equal(modal.hint.textContent, '群聊提示');
  assert.equal(modal.sourceWrap, null);
  assert.equal(modal.sourceSelect, null);
  assert.equal(modal.sourceButton, null);
  assert.equal(modal.sourceStatic?.style.display, 'block');
  assert.equal(modal.cancelButton.textContent, '取消');
  assert.equal(modal.saveButton.textContent, '保存');
  console.log('ok - createSessionMemoryShareModal builds shared group memory-share modal shell');
}
