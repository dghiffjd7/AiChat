import assert from 'node:assert/strict';

import { createGroupCreateRuntime } from '../../src/scripts/ui/group-create-runtime-utils.js';

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
  const listEl = createContainer();
  const createButton = {
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    classList: {
      toggle() {},
    },
  };
  const hint = { style: {} };
  const nameInput = { value: '新群聊' };
  const searchInput = { value: '' };
  const selected = new Set();
  const panel = {
    querySelector(selector) {
      return {
        '#group-contacts': listEl,
        '#group-create': createButton,
        '#group-name-hint': hint,
        '#group-name': nameInput,
        '#group-search': searchInput,
      }[selector] || null;
    },
  };
  const runtime = createGroupCreateRuntime({
    getPanel: () => panel,
    getSelected: () => selected,
    getContactsStore: () => ({
      listFriends: () => [
        { id: 'friend:1', name: 'One' },
        { id: 'rp:skip', name: 'Skip' },
        { id: 'friend:2', name: 'Two' },
      ],
      listGroups: () => [],
    }),
    normalize: (value) => String(value || '').trim(),
    normalizeKey: (value) => String(value || '').trim().toLowerCase(),
    resolveContactAvatar: (_contact, id) => `avatar:${id}`,
    deps: {
      createSelectableContactEmptyState: () => ({ kind: 'empty' }),
      createSelectableContactRow: ({ id, selected, onClick }) => ({ row: { id, selected, onClick } }),
    },
  });

  runtime.renderContacts();
  assert.deepEqual(listEl.children.map((child) => child.id), ['friend:1', 'friend:2']);
  assert.equal(createButton.disabled, false);
  assert.equal(createButton.attributes['aria-disabled'], 'true');
  assert.equal(hint.textContent, '再挑至少 2 位伙伴，群组才热闹得起来');

  const firstRow = listEl.children[0];
  firstRow.onClick();
  assert.equal(
    listEl.children[0],
    firstRow,
    'selecting a member must update the existing keyed row instead of rebuilding the list',
  );
  firstRow.onClick();
  assert.equal(listEl.children[0], firstRow);
  assert.equal(firstRow.selected, false);
  firstRow.onClick();
  assert.equal(listEl.children[0], firstRow);
  assert.equal(firstRow.selected, true);
  listEl.children[1].onClick();
  assert.deepEqual([...selected], ['friend:1', 'friend:2']);
  assert.equal(createButton.disabled, false);
  assert.equal(createButton.attributes['aria-disabled'], 'false');
  assert.equal(hint.textContent, '已选择 2 位成员');

  nameInput.value = '重复群聊';
  const groups = [{ id: 'group:old', name: '重复群聊' }];
  const duplicateRuntime = createGroupCreateRuntime({
    getPanel: () => panel,
    getSelected: () => selected,
    getContactsStore: () => ({
      listFriends: () => [],
      listGroups: () => groups,
    }),
    normalize: (value) => String(value || '').trim(),
    normalizeKey: (value) => String(value || '').trim().toLowerCase(),
  });
  duplicateRuntime.updateCreateEnabled();
  assert.equal(createButton.attributes['aria-disabled'], 'true');
  assert.equal(hint.textContent, '这个群组名已经存在啦，换一个试试');
  console.log('ok - createGroupCreateRuntime renders selectable contacts and updates create-state hints');
}

{
  const panel = {
    querySelector(selector) {
      return selector === '#group-name' ? { value: '开发群' } : null;
    },
  };
  const selected = new Set(['friend:1', 'friend:2']);
  const appended = [];
  const created = [];
  const notifications = [];
  let hidden = false;
  const contactsStore = {
    scopeId: 'scope:test',
    upsertContact(payload) {
      created.push(payload);
    },
    getContact(id) {
      return {
        'friend:1': { name: '阿甲' },
        'friend:2': { name: '阿乙' },
      }[id];
    },
  };
  const runtime = createGroupCreateRuntime({
    getPanel: () => panel,
    getSelected: () => selected,
    getContactsStore: () => contactsStore,
    getChatStore: () => ({
      appendMessage(message, sessionId) {
        appended.push([message, sessionId]);
      },
    }),
    getAvatar: () => 'avatar:data',
    normalize: (value) => String(value || '').trim(),
    normalizeKey: (value) => String(value || '').trim().toLowerCase(),
    genGroupId: () => 'group:new',
    hide: () => {
      hidden = true;
    },
    onCreated: (payload) => notifications.push(['created', payload]),
    notifySuccess: (message) => notifications.push(['success', message]),
    notifyError: (message) => notifications.push(['error', message]),
    logger: {
      info() {},
      error() {},
    },
  });

  const result = runtime.createGroup();
  assert.deepEqual(result, {
    id: 'group:new',
    name: '开发群',
    members: ['friend:1', 'friend:2'],
  });
  assert.equal(created[0].id, 'group:new');
  assert.equal(created[0].avatar, 'avatar:data');
  assert.deepEqual(created[0].members, ['friend:1', 'friend:2']);
  assert.equal(appended.length, 2);
  assert.equal(appended[0][1], 'group:new');
  assert.equal(appended[1][0].content.includes('阿甲、阿乙'), true);
  assert.equal(hidden, true);
  assert.deepEqual(notifications, [
    ['success', '群组已创建'],
    ['created', { id: 'group:new', name: '开发群' }],
  ]);
  console.log('ok - createGroupCreateRuntime persists group creation appends system messages and reports success');
}
