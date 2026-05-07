import assert from 'node:assert/strict';

import { createGroupMemberManagementRuntime } from '../../src/scripts/ui/group-member-management-runtime-utils.js';

const createContainer = () => {
  let html = '';
  return {
    style: {},
    children: [],
    appendChild(node) {
      this.children.push(node);
    },
    get innerHTML() {
      return html;
    },
    set innerHTML(value) {
      html = value;
      this.children = [];
    },
  };
};

{
  let members = ['friend:1', 'friend:2'];
  const membersEl = createContainer();
  const runtime = createGroupMemberManagementRuntime({
    getPanel: () => ({
      querySelector(selector) {
        return selector === '#group-settings-members' ? membersEl : null;
      },
    }),
    getMembers: () => members,
    setMembers: (next) => {
      members = next;
    },
    getContactsStore: () => ({
      getContact: (id) => ({ id, name: id.toUpperCase() }),
    }),
    resolveContactAvatar: (_contact, id) => `avatar:${id}`,
    deps: {
      createSelectableContactEmptyState: ({ text }) => ({ kind: 'empty', text }),
      createMemberManageRow: ({ memberId, onRemove }) => ({ row: { kind: 'member', memberId, onRemove } }),
    },
  });

  runtime.renderMembers();
  assert.equal(membersEl.style.maxHeight, '260px');
  assert.deepEqual(membersEl.children.map((child) => child.memberId), ['friend:1', 'friend:2']);

  membersEl.children[0].onRemove();
  assert.deepEqual(members, ['friend:2']);
  assert.deepEqual(membersEl.children.map((child) => child.memberId), ['friend:2']);

  members = [];
  runtime.renderMembers();
  assert.equal(membersEl.children[0].text, '暂无成员');
  console.log('ok - createGroupMemberManagementRuntime renders members removes entries and falls back to empty state');
}

{
  let members = ['friend:1'];
  const addSelected = new Set(['stale']);
  const membersEl = createContainer();
  const addListEl = createContainer();
  const searchEl = {
    value: '',
    addEventListener(_type, handler) {
      this.onInput = handler;
    },
  };
  const overlay = {
    style: {},
    addEventListener(_type, handler) {
      this.onClick = handler;
    },
  };
  const closeBtn = {};
  const cancelBtn = {};
  const confirmBtn = {};
  const panelNodes = {
    '#group-add-list': addListEl,
    '#group-add-search': searchEl,
    '#group-add-close': closeBtn,
    '#group-add-cancel': cancelBtn,
    '#group-add-confirm': confirmBtn,
  };
  const addPanel = {
    style: {},
    querySelector(selector) {
      return panelNodes[selector] || null;
    },
  };
  let runtimeOverlay = null;
  let runtimePanel = null;
  const bodyEl = {
    appended: [],
    appendChild(node) {
      this.appended.push(node);
    },
  };
  const notifications = [];

  const runtime = createGroupMemberManagementRuntime({
    getPanel: () => ({
      querySelector(selector) {
        return selector === '#group-settings-members' ? membersEl : null;
      },
    }),
    getMembers: () => members,
    setMembers: (next) => {
      members = next;
    },
    getContactsStore: () => ({
      listFriends: () => [
        { id: 'friend:1', name: 'One' },
        { id: 'friend:2', name: 'Two' },
        { id: 'rp:skip', name: 'Skip' },
        { id: 'friend:3', name: 'Three' },
      ],
      getContact: (id) => ({ id, name: id }),
    }),
    getAddOverlay: () => runtimeOverlay,
    setAddOverlay: (next) => {
      runtimeOverlay = next;
    },
    getAddPanel: () => runtimePanel,
    setAddPanel: (next) => {
      runtimePanel = next;
    },
    getAddSelected: () => addSelected,
    documentRef: {},
    bodyEl,
    normalize: (value) => String(value || '').trim(),
    normalizeKey: (value) => String(value || '').trim().toLowerCase(),
    resolveContactAvatar: (_contact, id) => `avatar:${id}`,
    notifyInfo: (message) => notifications.push(message),
    deps: {
      createSessionContactPickerModal: () => ({ overlay, panel: addPanel }),
      createSelectableContactEmptyState: ({ text }) => ({ kind: 'empty', text }),
      createSelectableContactRow: ({ id, selected, onClick }) => ({ row: { kind: 'candidate', id, selected, onClick } }),
      createMemberManageRow: ({ memberId, onRemove }) => ({ row: { kind: 'member', memberId, onRemove } }),
    },
  });

  runtime.openAddMembers();
  assert.equal(runtimeOverlay, overlay);
  assert.equal(runtimePanel, addPanel);
  assert.equal(overlay.style.display, 'block');
  assert.equal(addPanel.style.display, 'flex');
  assert.equal(addSelected.size, 0);
  assert.deepEqual(addListEl.children.map((child) => child.id), ['friend:2', 'friend:3']);

  addListEl.children[0].onClick();
  assert.deepEqual([...addSelected], ['friend:2']);
  assert.equal(addListEl.children[0].selected, true);

  confirmBtn.onclick();
  assert.deepEqual(members, ['friend:1', 'friend:2']);
  assert.equal(overlay.style.display, 'none');
  assert.equal(addPanel.style.display, 'none');
  assert.deepEqual(membersEl.children.map((child) => child.memberId), ['friend:1', 'friend:2']);

  runtime.openAddMembers();
  confirmBtn.onclick();
  assert.deepEqual(notifications, ['未选择任何成员']);
  console.log('ok - createGroupMemberManagementRuntime opens add-member modal filters candidates toggles selection and confirms additions');
}
