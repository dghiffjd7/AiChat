import assert from 'node:assert/strict';

import { runContactSettingsSaveFlow } from '../../src/scripts/ui/contact-settings-runtime-utils.js';
import { runGroupSettingsSaveFlow } from '../../src/scripts/ui/group-settings-save-runtime-utils.js';

const contacts = new Map([
  ['contact:2', { id: 'contact:2', name: '旧好友', avatar: 'old-avatar', labels: ['旧'] }],
  ['friend:1', { id: 'friend:1', name: '甲' }],
  ['friend:2', { id: 'friend:2', name: '乙' }],
  ['group:1', { id: 'group:1', name: '旧群聊', avatar: 'old-group', isGroup: true, members: ['friend:1', 'friend:2'] }],
]);
const sessionSettings = new Map([
  ['contact:2', { templateEnabled: false, scriptEnabled: true }],
  ['group:1', { theme: 'blue' }],
]);
const appended = [];
const notifications = [];
let contactHidden = false;
let groupHidden = false;

const contactsStore = {
  scopeId: 'integration',
  getContact(id) {
    return contacts.get(id) || null;
  },
  upsertContact(payload) {
    contacts.set(payload.id, { ...(contacts.get(payload.id) || {}), ...payload });
    return contacts.get(payload.id);
  },
  listGroups() {
    return [...contacts.values()].filter(contact => contact?.isGroup);
  },
};
const chatStore = {
  getSessionSettings(id) {
    return { ...(sessionSettings.get(id) || {}) };
  },
  setSessionSettings(id, settings) {
    sessionSettings.set(id, { ...(settings || {}) });
  },
  appendMessage(message, sessionId) {
    appended.push({ message, sessionId });
  },
};

const contactResult = runContactSettingsSaveFlow({
  sessionId: 'contact:2',
  contactsStore,
  chatStore,
  nameInput: { value: '新好友' },
  labelsInput: { value: ' 标签A, 标签B, 标签A ' },
  voiceSelect: { value: 'voice-new' },
  currentAvatar: 'new-avatar',
  templateToggle: { checked: true },
  scriptToggle: { checked: false },
  onSaved: payload => notifications.push(['contact-saved', payload]),
  hide: () => { contactHidden = true; },
  notifySuccess: message => notifications.push(['contact-success', message]),
  notifyError: message => notifications.push(['contact-error', message]),
  logger: { error() {} },
});

const groupResult = runGroupSettingsSaveFlow({
  groupId: 'group:1',
  panel: {
    querySelector(selector) {
      return selector === '#group-settings-name' ? { value: '新群聊' } : null;
    },
  },
  avatar: 'new-group-avatar',
  members: ['friend:1', 'contact:2'],
  contactsStore,
  chatStore,
  onSaved: payload => notifications.push(['group-saved', payload]),
  hide: () => { groupHidden = true; },
  notifySuccess: message => notifications.push(['group-success', message]),
  notifyError: message => notifications.push(['group-error', message]),
  logger: { info() {}, error() {} },
});

assert.equal(contactResult.name, '新好友');
assert.deepEqual(contacts.get('contact:2').labels, ['标签A', '标签B']);
assert.equal(sessionSettings.get('contact:2').templateEnabled, true);
assert.equal(sessionSettings.get('contact:2').scriptEnabled, false);
assert.equal(contactHidden, true);

assert.equal(groupResult.nextName, '新群聊');
assert.deepEqual(groupResult.beforeMembers, ['friend:1', 'friend:2']);
assert.deepEqual(groupResult.afterMembers, ['friend:1', 'contact:2']);
assert.equal(contacts.get('group:1').avatar, 'new-group-avatar');
assert.equal(groupHidden, true);
assert.deepEqual(
  appended.map(item => [item.sessionId, item.message.content]),
  [
    ['group:1', '群聊名称已更新：旧群聊 → 新群聊'],
    ['group:1', '成员加入：新好友'],
    ['group:1', '成员已移除：乙'],
  ],
);
assert.deepEqual(notifications, [
  ['contact-success', '已保存好友设置'],
  ['contact-saved', {
    id: 'contact:2',
    name: '新好友',
    avatar: 'new-avatar',
    labels: ['标签A', '标签B'],
    voiceRef: 'voice-new',
  }],
  ['group-success', '已保存群聊设置'],
  ['group-saved', { id: 'group:1', forceRefresh: true }],
]);

console.log('ok - settings lifecycle integration saves contact then group using shared store state');
