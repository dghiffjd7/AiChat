import assert from 'node:assert/strict';

import {
  AGENT_PERMISSION_DECISIONS,
  createAgentPermissionEvaluator,
} from '../../src/scripts/agent/agent-permissions.js';
import { createAgentToolRegistry } from '../../src/scripts/agent/agent-tool-registry.js';
import { createGroupChatAgentTools } from '../../src/scripts/agent/tools/group-chat-agent-tools.js';

const createHarness = () => {
  const contacts = new Map([
    ['friend:yukino', { id: 'friend:yukino', name: '雪之下雪乃', avatar: 'data:image/png;base64,YUKINO', isGroup: false }],
    ['friend:yui', { id: 'friend:yui', name: '由比滨结衣', avatar: 'data:image/png;base64,YUI', isGroup: false }],
    ['friend:hachiman', { id: 'friend:hachiman', name: '比企谷八幡', avatar: 'data:image/png;base64,HACHIMAN', isGroup: false }],
  ]);
  const messages = new Map();
  let current = 'room:current';
  const entered = [];
  const refreshed = [];
  const active = [];
  const contactsStore = {
    listContacts: () => Array.from(contacts.values()),
    getContact: id => contacts.get(id) || null,
    upsertContact: contact => {
      const next = { ...(contacts.get(contact.id) || {}), ...contact };
      contacts.set(contact.id, next);
      return next;
    },
  };
  const chatStore = {
    getCurrent: () => current,
    switchSession: id => {
      current = id;
    },
    appendMessage: (message, id = current) => {
      const list = messages.get(id) || [];
      list.push({ ...message });
      messages.set(id, list);
    },
  };
  const tools = createGroupChatAgentTools({
    contactsStore,
    chatStore,
    enterChatRoom: async (id, title) => {
      entered.push([id, title]);
      return { blocked: false };
    },
    refreshChatAndContacts: options => refreshed.push(options),
    setActiveSession: id => active.push(id),
    renderSessionNameHtml: (id, contact) => contact?.name || id,
    createGroupId: () => 'group:service-club',
    now: () => 1000,
  });
  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.allow,
    }),
    logger: { warn() {} },
  });
  registry.registerMany(tools);
  return {
    contacts,
    messages,
    entered,
    refreshed,
    active,
    contactsStore,
    chatStore,
    tools,
    registry,
  };
};

{
  const h = createHarness();
  const confirmations = [];
  const output = await h.registry.executeTool('group.create', {
    name: '侍奉部',
    members: ['雪之下雪乃', '由比滨结衣', '比企谷八幡'],
    open: false,
  }, {
    operationIntentPolicy: { mode: 'write_allowed' },
    requestToolConfirmation: request => {
      confirmations.push(request);
      return true;
    },
  });
  assert.equal(output.status, 'succeeded');
  assert.equal(output.result.ok, true);
  assert.equal(output.result.created, true);
  assert.equal(output.result.verified, true);
  assert.equal(output.result.group.id, 'group:service-club');
  assert.deepEqual(h.contacts.get('group:service-club').members, [
    'friend:yukino',
    'friend:yui',
    'friend:hachiman',
  ]);
  assert.equal(h.contacts.get('group:service-club').isGroup, true);
  assert.equal(confirmations.length, 1);
  assert.equal(confirmations[0].kind, 'group.create');
  assert.equal(confirmations[0].allowAlways, false);
  assert.deepEqual(
    confirmations[0].details.items.map(item => [item.id, item.label, item.status]),
    [
      ['friend:yukino', '雪之下雪乃', 'planned'],
      ['friend:yui', '由比滨结衣', 'planned'],
      ['friend:hachiman', '比企谷八幡', 'planned'],
    ],
  );
  assert.match(confirmations[0].details.items[0].avatar, /^data:image/);
  assert.equal(JSON.stringify(output.result).includes('data:image'), false, 'member avatars stay in confirmation UI only');
  assert.equal(h.chatStore.getCurrent(), 'room:current', 'background group creation must not navigate');
  assert.deepEqual(h.entered, []);
  assert.match(h.messages.get('group:service-club')[0].content, /创建了群聊/);
  assert.match(h.messages.get('group:service-club')[1].content, /雪之下雪乃.*由比滨结衣.*比企谷八幡/);
  console.log('ok - group.create freezes member ids, confirms once, persists a real group, and verifies readback');
}

{
  const h = createHarness();
  const preview = await h.registry.executeTool('group.create', {
    name: '预览群',
    members: ['雪之下雪乃', '不存在的人'],
    preview: true,
  }, {
    operationIntentPolicy: { mode: 'write_allowed' },
  });
  assert.equal(preview.result.preview, true);
  assert.equal(preview.result.ok, false);
  assert.equal(preview.result.reason, 'group_members_unresolved');
  assert.equal(preview.result.results.find(item => item.target === '不存在的人').reason, 'member_not_found');
  assert.equal(h.contacts.has('group:service-club'), false);
  console.log('ok - group.create preview fails closed when requested members cannot be resolved');
}

{
  const h = createHarness();
  h.contacts.set('private:club', { id: 'private:club', name: '侍奉部', isGroup: false });
  const result = await h.registry.executeTool('group.create', {
    name: '侍奉部',
    members: ['雪之下雪乃', '由比滨结衣'],
  }, {
    operationIntentPolicy: { mode: 'write_allowed' },
  });
  assert.equal(result.result.ok, false);
  assert.equal(result.result.reason, 'group_name_conflict');
  assert.equal(h.contacts.has('group:service-club'), false);
  console.log('ok - group.create never treats a same-name private chat as a completed group');
}

{
  const h = createHarness();
  h.contacts.set('group:service-club', {
    id: 'group:service-club',
    name: '侍奉部',
    isGroup: true,
    members: ['friend:yukino', 'friend:yui'],
  });
  const confirmations = [];
  const output = await h.registry.executeTool('group.update_members', {
    group: '侍奉部',
    addMembers: ['比企谷八幡'],
    removeMembers: ['由比滨结衣'],
  }, {
    operationIntentPolicy: { mode: 'write_allowed' },
    requestToolConfirmation: request => {
      confirmations.push(request);
      return true;
    },
  });
  assert.equal(output.result.ok, true);
  assert.equal(output.result.changed, true);
  assert.equal(output.result.verified, true);
  assert.deepEqual(h.contacts.get('group:service-club').members, ['friend:yukino', 'friend:hachiman']);
  assert.deepEqual(output.result.addedMembers.map(item => item.id), ['friend:hachiman']);
  assert.deepEqual(output.result.removedMembers.map(item => item.id), ['friend:yui']);
  assert.equal(confirmations.length, 1);
  assert.deepEqual(
    confirmations[0].details.items.map(item => [item.id, item.meta]),
    [
      ['friend:hachiman', '加入'],
      ['friend:yui', '移出'],
    ],
  );
  assert.equal(JSON.stringify(output.result).includes('data:image'), false);
  console.log('ok - group.update_members applies a confirmed add/remove set and verifies exact membership');
}

{
  const h = createHarness();
  h.contacts.set('group:service-club', {
    id: 'group:service-club',
    name: '侍奉部',
    isGroup: true,
    members: ['friend:yukino', 'friend:yui'],
  });
  const output = await h.registry.executeTool('group.update_members', {
    group: '侍奉部',
    addMembers: ['比企谷八幡'],
  }, {
    operationIntentPolicy: { mode: 'write_allowed' },
    requestToolConfirmation: () => {
      h.contacts.get('group:service-club').members = ['friend:yukino'];
      return true;
    },
  });
  assert.equal(output.result.ok, false);
  assert.equal(output.result.reason, 'group_members_changed_during_confirmation');
  assert.deepEqual(h.contacts.get('group:service-club').members, ['friend:yukino']);
  console.log('ok - group.update_members aborts when the frozen baseline changes during confirmation');
}

{
  const h = createHarness();
  const output = await h.registry.executeTool('group.create', {
    name: '侍奉部',
    members: ['雪之下雪乃', '由比滨结衣'],
    open: true,
  }, {
    operationIntentPolicy: { mode: 'write_allowed' },
    requestToolConfirmation: () => true,
  });
  assert.equal(output.result.opened.ok, true);
  assert.equal(h.chatStore.getCurrent(), 'group:service-club');
  assert.deepEqual(h.active, ['group:service-club']);
  assert.deepEqual(h.entered, [['group:service-club', '侍奉部']]);
  console.log('ok - group.create reveals only the created group when open is explicitly true');
}

console.log('group-chat-agent-tools-tests passed');
