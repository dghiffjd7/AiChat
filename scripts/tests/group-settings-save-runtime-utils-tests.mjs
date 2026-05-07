import assert from 'node:assert/strict';

import { runGroupSettingsSaveFlow } from '../../src/scripts/ui/group-settings-save-runtime-utils.js';

{
  const notifications = [];
  const result = runGroupSettingsSaveFlow({
    groupId: 'group:1',
    panel: {
      querySelector(selector) {
        return selector === '#group-settings-name' ? { value: '重复群聊' } : null;
      },
    },
    avatar: '',
    members: ['friend:1', 'friend:2'],
    contactsStore: {
      getContact: (id) => ({
        id,
        name: '原群聊',
        members: ['friend:1', 'friend:2'],
      }),
      listGroups: () => [
        { id: 'group:1', name: '原群聊' },
        { id: 'group:2', name: '重复群聊' },
      ],
    },
    chatStore: {},
    notifyError: (message) => notifications.push(message),
  });

  assert.equal(result, false);
  assert.deepEqual(notifications, ['已存在同名群组']);
  console.log('ok - runGroupSettingsSaveFlow aborts on duplicate group name and reports error');
}

{
  const appended = [];
  const upserts = [];
  const saved = [];
  const notifications = [];
  let hidden = false;
  const contacts = {
    'group:1': { id: 'group:1', name: '旧群聊', members: ['friend:1', 'friend:2'], avatar: 'old' },
    'friend:1': { id: 'friend:1', name: '甲' },
    'friend:3': { id: 'friend:3', name: '丙' },
  };

  const result = runGroupSettingsSaveFlow({
    groupId: 'group:1',
    panel: {
      querySelector(selector) {
        return selector === '#group-settings-name' ? { value: '新群聊' } : null;
      },
    },
    avatar: 'avatar:new',
    members: ['friend:1', 'friend:3'],
    contactsStore: {
      scopeId: 'scope:1',
      getContact: (id) => contacts[id] || null,
      listGroups: () => [{ id: 'group:1', name: '旧群聊' }],
      upsertContact: (payload) => upserts.push(payload),
    },
    chatStore: {
      getSessionSettings: () => ({ theme: 'blue' }),
      setSessionSettings: (...args) => saved.push(args),
      appendMessage: (...args) => appended.push(args),
    },
    onSaved: (payload) => notifications.push(['saved', payload]),
    hide: () => {
      hidden = true;
    },
    notifySuccess: (message) => notifications.push(['success', message]),
    notifyError: (message) => notifications.push(['error', message]),
    logger: {
      info() {},
      error() {},
    },
  });

  assert.equal(result.groupId, 'group:1');
  assert.equal(result.didAppendSystem, true);
  assert.deepEqual(result.beforeMembers, ['friend:1', 'friend:2']);
  assert.deepEqual(result.afterMembers, ['friend:1', 'friend:3']);
  assert.equal(saved.length, 1);
  assert.equal(upserts[0].name, '新群聊');
  assert.equal(upserts[0].avatar, 'avatar:new');
  assert.deepEqual(upserts[0].members, ['friend:1', 'friend:3']);
  assert.equal(appended.length, 3);
  assert.equal(appended[0][0].content, '群聊名称已更新：旧群聊 → 新群聊');
  assert.equal(appended[1][0].content, '成员加入：丙');
  assert.equal(appended[2][0].content, '成员已移除：friend:2');
  assert.equal(hidden, true);
  assert.deepEqual(notifications, [
    ['success', '已保存群聊设置'],
    ['saved', { id: 'group:1', forceRefresh: true }],
  ]);
  console.log('ok - runGroupSettingsSaveFlow persists renamed group appends member system messages and hides panel');
}
