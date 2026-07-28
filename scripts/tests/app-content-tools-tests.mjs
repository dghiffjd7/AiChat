import assert from 'node:assert/strict';

import {
  AGENT_PERMISSION_DECISIONS,
  createAgentPermissionEvaluator,
} from '../../src/scripts/agent/agent-permissions.js';
import { createAgentToolRegistry } from '../../src/scripts/agent/agent-tool-registry.js';
import { createAppContentAgentTools } from '../../src/scripts/agent/tools/app-content-tools.js';

const getTool = (tools, name) => tools.find(tool => tool.name === name);

const createProfileStore = (prefix = 'profile') => {
  const items = new Map();
  let activeId = '';
  let seq = 0;
  return {
    getAll: () => Array.from(items.values()),
    get: id => items.get(id) || null,
    async create(data = {}) {
      seq += 1;
      const item = {
        id: `${prefix}-${seq}`,
        name: data.name,
        description: data.description || '',
        avatar: data.avatar || '',
        source: data.source || null,
      };
      items.set(item.id, item);
      return item;
    },
    async setActive(id) {
      if (!items.has(id)) return false;
      activeId = id;
      return true;
    },
    getActiveId: () => activeId,
    getActive: () => items.get(activeId) || null,
    items,
  };
};

{
  const personaStore = createProfileStore('persona');
  const userStore = createProfileStore('user');
  const switched = [];
  const tools = createAppContentAgentTools({
    personaStore,
    userStore,
    switchPersona: async id => switched.push(['persona', id]),
    switchUserProfile: async id => switched.push(['user', id]),
  });

  const persona = await getTool(tools, 'persona.create').execute({ name: 'Role A', description: 'desc', setActive: true });
  assert.equal(persona.ok, true);
  assert.equal(persona.created, true);
  assert.equal(persona.profile.name, 'Role A');
  assert.equal(personaStore.get(persona.personaId).source.type, 'character_card');

  const user = await getTool(tools, 'user.create').execute({ name: 'User A', setActive: true });
  assert.equal(user.ok, true);
  assert.equal(user.created, true);
  assert.equal(user.profile.name, 'User A');
  assert.deepEqual(switched, [['persona', persona.personaId], ['user', user.userId]]);
  console.log('ok - app content tools create persona and user profiles');
}

{
  const personaStore = createProfileStore('persona');
  const userStore = createProfileStore('user');
  const persona = await personaStore.create({ name: 'Role A' });
  const user = await userStore.create({ name: 'User A' });
  const switched = [];
  const tools = createAppContentAgentTools({
    personaStore,
    userStore,
    switchPersona: async id => {
      switched.push(['persona', id]);
      return id === persona.id;
    },
    switchUserProfile: async id => {
      switched.push(['user', id]);
      return id === user.id;
    },
  });

  const personaResult = await getTool(tools, 'persona.switch').execute({ target: 'Role A' });
  assert.equal(personaResult.ok, true);
  assert.equal(personaResult.switched, true);
  assert.equal(personaResult.personaId, persona.id);

  const userResult = await getTool(tools, 'user.switch').execute({ name: 'User A' });
  assert.equal(userResult.ok, true);
  assert.equal(userResult.switched, true);
  assert.equal(userResult.userId, user.id);
  assert.deepEqual(switched, [['persona', persona.id], ['user', user.id]]);
  console.log('ok - app content tools switch persona and user profiles');
}

{
  const personaStore = createProfileStore('persona');
  const persona = await personaStore.create({ name: 'Role A' });
  await personaStore.setActive(persona.id);
  const saved = new Map();
  const bound = [];
  const boundSessions = [];
  const sessionWorldIds = new Map([['chat-a', ['Role A World']]]);
  const tools = createAppContentAgentTools({
    personaStore,
    saveWorldInfo: async (id, data) => saved.set(id, data),
    getWorldInfo: async id => saved.get(id) || null,
    listWorlds: async () => Array.from(saved.keys()),
    waitForWorldStoreReady: async () => true,
    getWorldIdsForSession: async sessionId => sessionWorldIds.get(sessionId) || [],
    getGlobalWorldId: async () => 'Global World',
    assignWorldToPersona: async (personaId, worldId, options) => bound.push({ personaId, worldId, options }),
    bindWorldToSession: async (sessionId, worldIds, options) => {
      const list = Array.isArray(worldIds) ? worldIds : [worldIds].filter(Boolean);
      sessionWorldIds.set(sessionId, list);
      boundSessions.push({ sessionId, worldIds: list, options });
    },
    now: () => 1000,
  });

  const result = await getTool(tools, 'worldbook.create').execute({
    name: 'Role A World',
    personaName: 'Role A',
    bindToPersona: true,
    entries: [
      { title: '温柔大姐姐', content: '超级温柔，和用户是姐弟关系。', keys: ['姐姐'] },
      { title: '傲娇青梅竹马', content: '傲娇大小姐青梅竹马。' },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.equal(result.entryCount, 2);
  assert.equal(saved.get('Role A World').entries[0].comment, '温柔大姐姐');
  assert.equal(saved.get('Role A World').entries[0].constant, true);
  assert.deepEqual(bound, [{ personaId: persona.id, worldId: 'Role A World', options: { enabled: true } }]);

  const appended = await getTool(tools, 'worldbook.create').execute({
    name: 'Role A World',
    entries: [{ title: '新增条目', content: '不会覆盖旧内容。' }],
  });
  assert.equal(appended.ok, true);
  assert.equal(appended.created, false);
  assert.equal(appended.previousEntryCount, 2);
  assert.equal(appended.addedEntryCount, 1);
  assert.equal(appended.entryCount, 3);
  assert.deepEqual(saved.get('Role A World').entries.map(entry => entry.comment), ['温柔大姐姐', '傲娇青梅竹马', '新增条目']);

  const inferred = await getTool(tools, 'worldbook.create').execute({
    entries: [{ title: '当前角色条目', content: '缺省世界书名。' }],
  });
  assert.equal(inferred.ok, true);
  assert.equal(inferred.worldbookId, 'Role A 世界书');
  assert.equal(saved.get('Role A 世界书').entries[0].comment, '当前角色条目');
  assert.deepEqual(bound.at(-1), { personaId: persona.id, worldId: 'Role A 世界书', options: { enabled: true } });

  saved.set('Global World', { name: 'Global World', entries: [] });
  const listResult = await getTool(tools, 'worldbook.list').execute({ sessionId: 'chat-a' });
  assert.equal(listResult.ok, true);
  assert.ok(listResult.worldbooks.some(item => item.id === 'Role A World' && item.boundToCurrentSession === true));
  assert.ok(listResult.worldbooks.some(item => item.id === 'Global World' && item.global === true));

  const bindResult = await getTool(tools, 'worldbook.bind_session').execute({
    sessionId: 'chat-b',
    worldbookId: 'Role A World',
  });
  assert.equal(bindResult.ok, true);
  assert.equal(bindResult.bound, true);
  assert.deepEqual(sessionWorldIds.get('chat-b'), ['Role A World']);
  assert.deepEqual(boundSessions.at(-1), { sessionId: 'chat-b', worldIds: ['Role A World'], options: { silent: false } });

  const readResult = await getTool(tools, 'worldbook.read').execute({ name: 'Role A World' });
  assert.equal(readResult.ok, true);
  assert.equal(readResult.name, 'Role A World');
  assert.equal(readResult.entries.length, 3);
  assert.equal(readResult.entries[0].title, '温柔大姐姐');
  assert.deepEqual(readResult.entries[0].keys, ['姐姐']);
  assert.equal(readResult.entries[0].content, undefined);
  assert.equal(readResult.entries[0].contentPreview, undefined);
  assert.ok(readResult.entries[0].contentLength > 0);
  assert.equal(readResult.contentMode, 'summary');

  const contentRead = await getTool(tools, 'worldbook.read').execute({ name: 'Role A World', entryTitle: '温柔大姐姐' });
  assert.equal(contentRead.ok, true);
  assert.equal(contentRead.contentMode, 'content');
  assert.equal(contentRead.entries.length, 1);
  assert.match(contentRead.entries[0].content, /超级温柔/);

  const updated = await getTool(tools, 'worldbook.update_entries').execute({
    name: 'Role A World',
    updates: [{
      entryTitle: '温柔大姐姐',
      content: '扩展后的温柔大姐姐设定，仍然和用户是姐弟关系。',
      keys: ['姐姐', '大姐姐'],
    }],
  }, {
    toolSafety: {
      decision: 'allow',
      request: { kind: 'worldbook.update_entries' },
    },
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.updatedEntryCount, 1);
  assert.equal(updated.entryCount, 3);
  assert.deepEqual(saved.get('Role A World').entries.map(entry => entry.comment), ['温柔大姐姐', '傲娇青梅竹马', '新增条目']);
  assert.match(saved.get('Role A World').entries[0].content, /扩展后的温柔大姐姐/);
  assert.deepEqual(saved.get('Role A World').entries[0].key, ['姐姐', '大姐姐']);
  assert.equal(saved.get('Role A World').entries[1].content, '傲娇大小姐青梅竹马。');

  saved.set('Duplicate World', {
    name: 'Duplicate World',
    entries: [
      { id: 'a-1', comment: 'A', content: 'old A' },
      { id: 'a-2', comment: 'A', content: 'latest A' },
      { id: 'b-1', comment: 'B', content: 'old B' },
      { id: 'b-2', comment: 'B', content: 'latest B' },
    ],
  });
  const deduped = await getTool(tools, 'worldbook.delete_entries').execute({
    name: 'Duplicate World',
    dedupeByTitle: true,
    duplicateTitles: ['A', 'B'],
    keep: 'last',
  }, {
    toolSafety: {
      decision: 'allow',
      request: { kind: 'worldbook.delete_entries' },
    },
  });
  assert.equal(deduped.ok, true);
  assert.equal(deduped.deletedEntryCount, 2);
  assert.equal(deduped.entryCount, 2);
  assert.deepEqual(saved.get('Duplicate World').entries.map(entry => entry.id), ['a-2', 'b-2']);

  const currentRead = await getTool(tools, 'worldbook.read').execute({ sessionId: 'chat-a', maxEntries: 1 });
  assert.equal(currentRead.ok, true);
  assert.equal(currentRead.id, 'Role A World');
  assert.equal(currentRead.entries.length, 1);
  assert.equal(currentRead.truncated, true);
  console.log('ok - app content tools create bind list and read worldbooks');
}

{
  const saved = new Map([
    ['Existing World', { name: 'Existing World', entries: [{ id: 'old', comment: '旧条目', content: '保留' }] }],
  ]);
  const confirmations = [];
  const tools = createAppContentAgentTools({
    saveWorldInfo: async (id, data) => saved.set(id, data),
    getWorldInfo: async id => saved.get(id) || null,
    listWorlds: async () => Array.from(saved.keys()),
    confirmDestructiveWrite: async request => {
      confirmations.push(request);
      return false;
    },
    now: () => 2000,
  });
  const result = await getTool(tools, 'worldbook.create').execute({
    name: 'Existing World',
    mode: 'replace',
    entries: [{ title: '新条目', content: '另存' }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.equal(result.fallbackCreated, true);
  assert.equal(result.overwritten, false);
  assert.equal(result.worldbookId, 'Existing World (2)');
  assert.equal(saved.get('Existing World').entries[0].comment, '旧条目');
  assert.equal(saved.get('Existing World (2)').entries[0].comment, '新条目');
  assert.equal(confirmations[0].kind, 'worldbook.replace');
  console.log('ok - app content tools create a new worldbook when replace is not confirmed');
}

{
  const saved = new Map([
    ['Existing World', { name: 'Existing World', entries: [{ id: 'old', comment: '旧条目', content: '会被确认覆盖' }] }],
  ]);
  const tools = createAppContentAgentTools({
    saveWorldInfo: async (id, data) => saved.set(id, data),
    getWorldInfo: async id => saved.get(id) || null,
    listWorlds: async () => Array.from(saved.keys()),
    confirmDestructiveWrite: async () => true,
    now: () => 3000,
  });
  const result = await getTool(tools, 'worldbook.create').execute({
    name: 'Existing World',
    mode: 'replace',
    entries: [{ title: '确认后的新条目', content: '覆盖' }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.created, false);
  assert.equal(result.overwritten, true);
  assert.equal(result.fallbackCreated, false);
  assert.equal(result.worldbookId, 'Existing World');
  assert.deepEqual(saved.get('Existing World').entries.map(entry => entry.comment), ['确认后的新条目']);
  console.log('ok - app content tools replace existing worldbook only after confirmation');
}

{
  const saved = new Map([
    ['Registry World', { name: 'Registry World', entries: [{ id: 'old', comment: '旧条目', content: '保留' }] }],
  ]);
  let confirmations = 0;
  const tools = createAppContentAgentTools({
    saveWorldInfo: async (id, data) => saved.set(id, data),
    getWorldInfo: async id => saved.get(id) || null,
    listWorlds: async () => Array.from(saved.keys()),
    confirmDestructiveWrite: async () => {
      throw new Error('tool-local confirmation should not run after registry safety fallback');
    },
  });
  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.allow,
    }),
    logger: { warn: () => {} },
  });
  registry.registerMany(tools);
  const result = await registry.executeTool('worldbook.create', {
    name: 'Registry World',
    mode: 'replace',
    entries: [{ title: '新条目', content: '另存' }],
  }, {
    requestToolConfirmation: request => {
      confirmations += 1;
      assert.equal(request.kind, 'worldbook.replace');
      return false;
    },
  });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.result.fallbackCreated, true);
  assert.equal(result.result.worldbookId, 'Registry World (2)');
  assert.equal(saved.get('Registry World').entries[0].comment, '旧条目');
  assert.equal(saved.get('Registry World (2)').entries[0].comment, '新条目');
  assert.equal(confirmations, 1);
  console.log('ok - app content tools use registry safety fallback for worldbook replace');
}

{
  const saved = new Map([
    ['Registry Delete World', {
      name: 'Registry Delete World',
      entries: [
        { id: 'keep', comment: '重复条目', content: '保留' },
        { id: 'delete', comment: '重复条目', content: '删除' },
      ],
    }],
  ]);
  const tools = createAppContentAgentTools({
    saveWorldInfo: async (id, data) => saved.set(id, data),
    getWorldInfo: async id => saved.get(id) || null,
    listWorlds: async () => Array.from(saved.keys()),
  });
  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.allow,
    }),
    logger: { warn: () => {} },
  });
  registry.registerMany(tools);
  const confirmations = [];
  const result = await registry.executeTool('worldbook.delete_entries', {
    name: 'Registry Delete World',
    dedupeByTitle: true,
    keep: 'first',
  }, {
    requestToolConfirmation: request => {
      confirmations.push(request);
      return true;
    },
  });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.result.deletedEntryCount, 1);
  assert.deepEqual(saved.get('Registry Delete World').entries.map(entry => entry.id), ['keep']);
  assert.equal(confirmations.length, 1);
  assert.equal(confirmations[0].kind, 'worldbook.delete_entries');
  console.log('ok - app content tools require registry safety confirmation before deleting worldbook entries');
}

{
  const contacts = new Map([
    ['sister', { id: 'sister', name: '温柔大姐姐', avatar: 'a' }],
  ]);
  const messages = new Map();
  const opened = [];
  const active = [];
  const refreshed = [];
  const current = { id: 'default' };
  const tools = createAppContentAgentTools({
    contactsStore: {
      listContacts: () => Array.from(contacts.values()),
      getContact: id => contacts.get(id) || null,
    },
    chatStore: {
      getCurrent: () => current.id,
      switchSession: id => {
        current.id = id;
      },
      appendMessage: (message, sessionId) => {
        const list = messages.get(sessionId) || [];
        list.push(message);
        messages.set(sessionId, list);
      },
    },
    enterChatRoom: async (id, title) => opened.push([id, title]),
    refreshChatAndContacts: options => refreshed.push(options),
    setActiveSession: id => active.push(id),
    getActiveUserName: () => '测试用户',
    getActiveUserAvatar: () => 'u',
    now: () => 1000,
  });

  const result = await getTool(tools, 'chat.send_message').execute({ sessionId: '温柔大姐姐', content: '晚上好' });
  assert.equal(result.ok, true);
  assert.equal(result.sent, true);
  assert.equal(result.sessionId, 'sister');
  assert.equal(messages.get('sister')[0].role, 'user');
  assert.equal(messages.get('sister')[0].content, '晚上好');
  assert.equal(messages.get('sister')[0].name, '测试用户');
  assert.deepEqual(opened, [['sister', '温柔大姐姐']]);
  assert.deepEqual(active, ['sister']);
  assert.deepEqual(refreshed, [{ immediate: true }]);

  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.allow,
    }),
    logger: { warn: () => {} },
  });
  registry.registerMany(tools);
  const aliasResult = await registry.executeTool('chat.send_message', {
    sessionName: '温柔大姐姐',
    message: '妈妈',
  });
  assert.equal(aliasResult.status, 'succeeded');
  assert.equal(aliasResult.result.ok, true);
  assert.equal(aliasResult.result.sent, true);
  assert.equal(aliasResult.result.sessionId, 'sister');
  assert.equal(aliasResult.result.requestTriggered, false);
  assert.equal(messages.get('sister')[1].role, 'user');
  assert.equal(messages.get('sister')[1].content, '妈妈');
  assert.deepEqual(opened.at(-1), ['sister', '温柔大姐姐']);
  console.log('ok - app content tools send chat messages and accept model argument aliases');
}

{
  const contacts = new Map([
    ['elf', { id: 'elf', name: '精灵女王', avatar: 'e' }],
  ]);
  const messages = new Map();
  const opened = [];
  const active = [];
  const sendCalls = [];
  const current = { id: 'default' };
  const chatStore = {
    getCurrent: () => current.id,
    switchSession: id => {
      current.id = id;
    },
    appendMessage: (message, sessionId) => {
      const list = messages.get(sessionId) || [];
      list.push(message);
      messages.set(sessionId, list);
    },
  };
  const tools = createAppContentAgentTools({
    contactsStore: {
      listContacts: () => Array.from(contacts.values()),
      getContact: id => contacts.get(id) || null,
    },
    chatStore,
    enterChatRoom: async (id, title) => opened.push([id, title]),
    setActiveSession: id => active.push(id),
    sendChatMessage: async (content, options) => {
      sendCalls.push({ content, options });
      chatStore.appendMessage({ role: 'user', content, source: 'pipeline' }, options.sessionId);
      return true;
    },
  });

  const result = await getTool(tools, 'chat.send_message').execute({
    sessionName: '精灵女王',
    message: '妈妈',
  });
  assert.equal(result.ok, true);
  assert.equal(result.sent, true);
  assert.equal(result.requestTriggered, true);
  assert.equal(result.sessionId, 'elf');
  assert.deepEqual(sendCalls, [{ content: '妈妈', options: { sessionId: 'elf', source: 'maid', open: true, waitForReply: false } }]);
  assert.deepEqual(messages.get('elf'), [{ role: 'user', content: '妈妈', source: 'pipeline' }]);
  assert.deepEqual(opened, [['elf', '精灵女王']]);
  assert.deepEqual(active, ['elf']);
  console.log('ok - app content tools can route user sends through the reply-triggering send pipeline');
}

{
  // 用户点停止生成时，send 管线返回的中止标记要透传给女仆观察结果
  const contacts = new Map([['elf', { id: 'elf', name: '精灵女王' }]]);
  const tools = createAppContentAgentTools({
    contactsStore: {
      listContacts: () => Array.from(contacts.values()),
      getContact: id => contacts.get(id) || null,
    },
    chatStore: { getCurrent: () => 'elf', switchSession: () => {}, appendMessage: () => {} },
    enterChatRoom: async () => {},
    setActiveSession: () => {},
    sendChatMessage: async () => ({
      ok: false,
      sent: false,
      cancelled: true,
      reason: 'user_aborted',
      message: '用户在生成过程中点击了停止，本次发送/回复被用户中止。',
    }),
  });
  const result = await getTool(tools, 'chat.send_message').execute({
    sessionName: '精灵女王',
    message: '你好',
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'user_aborted');
  assert.equal(result.cancelled, true);
  assert.ok(String(result.message).includes('中止'));
  console.log('ok - app content tools propagate user abort marker from send pipeline');
}

{
  const generated = [];
  const contacts = new Map([['elf', { id: 'elf', name: '精灵女王' }]]);
  const tools = createAppContentAgentTools({
    contactsStore: {
      listContacts: () => Array.from(contacts.values()),
      getContact: id => contacts.get(id) || null,
    },
    chatStore: { getCurrent: () => 'elf' },
    generateChatImage: async payload => {
      generated.push(payload);
      return true;
    },
  });
  const tool = getTool(tools, 'chat.generate_image');
  assert.ok(tool.schema.properties.referenceImages);
  const maidAttachments = [
    { id: 'ref-a', name: 'first.png', kind: 'image', llmUrl: 'data:image/png;base64,QUFB' },
    { id: 'ref-b', name: 'second.png', kind: 'image', llmUrl: 'data:image/png;base64,QkJC' },
  ];
  const result = await tool.execute({
    sessionId: 'elf',
    prompt: '参考构图生成新图',
    referenceImages: [2, 'ref-a', 2],
  }, { maidAttachments });
  assert.equal(result.ok, true);
  assert.equal(result.referenceImageCount, 2);
  assert.deepEqual(generated, [{
    prompt: '参考构图生成新图',
    sessionId: 'elf',
    negativePrompt: '',
    referenceImages: ['data:image/png;base64,QkJC', 'data:image/png;base64,QUFB'],
  }]);

  const missing = await tool.execute({
    sessionId: 'elf',
    prompt: '不要静默退化成文生图',
    referenceImages: ['missing-ref'],
  }, { maidAttachments });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'reference_image_not_found');
  assert.deepEqual(missing.missingReferenceImages, ['missing-ref']);
  assert.equal(generated.length, 1);
  console.log('ok - chat.generate_image resolves referenced maid attachments and rejects missing references');
}

{
  // 模型渠道档：列出 + 模糊匹配切换 + 歧义/不存在/已活跃分支
  const switched = [];
  const profiles = [
    { id: 'p-bp', name: 'byteplus', provider: 'custom', model: 'dola-seedream-5-0-pro' },
    { id: 'p-nai', name: 'NAI', provider: 'novelai', model: 'nai-diffusion-4-5-full' },
    { id: 'p-oai', name: 'oai', provider: 'openai', model: 'gpt-image-2' },
  ];
  const tools = createAppContentAgentTools({
    listModelProfiles: async ({ scope } = {}) => (scope === 'image' ? { activeId: 'p-bp', profiles } : null),
    switchModelProfile: async ({ scope, profileId } = {}) => {
      switched.push({ scope, profileId });
      return { ok: true };
    },
  });

  const listed = await getTool(tools, 'config.list_profiles').execute({ scope: 'image' });
  assert.equal(listed.ok, true);
  assert.equal(listed.activeProfileId, 'p-bp');
  assert.equal(listed.profiles.find(p => p.active)?.name, 'byteplus');

  const badScope = await getTool(tools, 'config.list_profiles').execute({ scope: 'chat' });
  assert.equal(badScope.ok, false);
  assert.equal(badScope.reason, 'unsupported_scope');

  // 大小写不敏感的名称匹配
  const byName = await getTool(tools, 'config.switch_profile').execute({ scope: 'image', profileName: 'nai' });
  assert.equal(byName.ok, true);
  assert.equal(byName.switched, true);
  assert.equal(byName.from.name, 'byteplus');
  assert.equal(byName.to.name, 'NAI');
  assert.deepEqual(switched, [{ scope: 'image', profileId: 'p-nai' }]);

  // 模型名包含匹配
  const byModel = await getTool(tools, 'config.switch_profile').execute({ scope: 'image', profileName: 'gpt-image' });
  assert.equal(byModel.to.name, 'oai');

  // 歧义：'i' 同时命中多个
  const ambiguous = await getTool(tools, 'config.switch_profile').execute({ scope: 'image', profileName: 'a' });
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.reason, 'profile_ambiguous');
  assert.ok(ambiguous.candidates.length > 1);

  // 不存在
  const missing = await getTool(tools, 'config.switch_profile').execute({ scope: 'image', profileName: 'midjourney' });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'profile_not_found');
  assert.deepEqual(missing.available, ['byteplus', 'NAI', 'oai']);

  // 已是活跃档
  const already = await getTool(tools, 'config.switch_profile').execute({ scope: 'image', profileId: 'p-bp' });
  assert.equal(already.ok, true);
  assert.equal(already.switched, false);
  assert.equal(already.alreadyActive, true);
  console.log('ok - app content tools list and switch model profiles with fuzzy matching');
}

{
  // v4f obs-03-026：取消覆盖创建安全副本时，工具摘要必须点名副本与原书状态
  const tools = createAppContentAgentTools({});
  const create = getTool(tools, 'worldbook.create');
  const copySummary = create.summarizeResult({
    ok: true,
    fallbackCreated: true,
    worldbookId: '冻结观察写入-0728 (3)',
    previousWorldbookId: '冻结观察写入-0728',
    entryCount: 2,
  });
  assert.match(copySummary, /safety copy/);
  assert.match(copySummary, /冻结观察写入-0728 \(3\)/);
  assert.match(copySummary, /untouched/);
  const normalSummary = create.summarizeResult({ ok: true, worldbookId: 'A', entryCount: 3 });
  assert.equal(normalSummary.includes('safety copy'), false);
  console.log('ok - worldbook.create summary surfaces cancel-replace safety copies explicitly');
}
