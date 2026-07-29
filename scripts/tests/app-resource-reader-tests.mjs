import assert from 'node:assert/strict';

import {
  createAppResourceReader,
  normalizeAppResourceName,
  sanitizeAppResourceValue,
} from '../../src/scripts/agent/app-resource-reader.js';

const makeDeps = () => {
  const messagesBySession = {
    s1: [
      { id: 'm1', role: 'user', content: '你好', time: '20:00' },
      {
        id: 'm2',
        role: 'assistant',
        content: '界面显示回复',
        rawOriginal: '供应商完整回复',
        reasoning: '内部推理',
        displayText: '渲染后的回复',
        swipes: [{ content: '备用回复' }],
        time: '20:01',
      },
    ],
    s2: [{ id: 'm3', role: 'user', content: 'hi' }],
  };
  const chatStore = {
    getCurrent: () => 's1',
    getMessages: sid => messagesBySession[sid] || [],
    getSummaries: sid => [{ sessionId: sid, summary: '压缩摘要', apiKey: 'secret' }],
    getCompactedSummary: () => '长期摘要',
    getSessionSettings: sid => ({ sessionId: sid, temperature: 0.7, token: 'secret' }),
    listSessions: () => ['s1', 's2'],
    listVariables: sid => ({ mood: 'calm', sid }),
    listInitialVariables: () => ({ hp: 10 }),
    listVariableSchemas: () => ({ mood: { type: 'string' } }),
    listVariableRules: () => [{ path: 'mood', operation: 'set' }],
    listGlobalVariables: () => ({ app: 'phone' }),
    getStageSchema: () => ({ stage: 'opening' }),
  };
  const worlds = {
    w1: {
      name: '精灵世界书',
      entries: [
        {
          id: 'e1',
          comment: '精灵女王',
          key: ['精灵'],
          keysecondary: ['森林'],
          position: 4,
          order: 10,
          depth: 2,
          constant: true,
          content: '超级温柔特别会照顾人的大姐姐。',
        },
      ],
    },
    global: { name: '全局世界书', entries: [] },
  };
  const appBridge = {
    waitForWorldStoreReady: async () => true,
    getWorldIdsForSession: () => ['w1'],
    getCurrentWorldIds: async () => [{ id: 'w1' }],
    getCurrentWorldId: () => '',
    getGlobalWorldId: () => 'global',
    listWorlds: async () => ['w1', 'global'],
    getWorldInfo: async id => worlds[id],
    getWorldGlobalSettings: () => ({ scanDepth: 5, apiKey: 'secret' }),
    waitForRegexStoreReady: () => true,
    getRegexSession: sid => ({ sessionId: sid, enabledSetIds: ['r1'] }),
    listRegexLocalSets: () => [
      { id: 'r1', name: '输出清理', scripts: [{ findRegex: '<think>.*?</think>', replaceString: '' }] },
      { id: 'r2', name: '显示增强', scripts: [] },
    ],
    getConfig: () => ({ provider: 'fallback', model: 'fallback-model', apiKey: 'secret' }),
    config: {
      getActiveProfileId: () => 'profile-1',
    },
  };
  return {
    appBridge,
    chatStore,
    contactsStore: {
      getContact: id => ({ id, name: id === 's1' ? '精灵女王' : '暗夜女王', isGroup: false }),
    },
    personaStore: {
      getActive: () => ({ id: 'p1', name: '精灵女王' }),
      getAll: () => [
        {
          id: 'p1',
          name: '精灵女王',
          avatar: `data:image/png;base64,${'A'.repeat(20_000)}`,
          description: '温柔而坚定的精灵女王',
          source: {
            worldbookId: 'w1',
            worldbookEnabled: true,
            systemPresetId: 'sysprompt-elf',
            regexSetId: 'r1',
            originalCardStored: true,
          },
          originalCard: { data: { character_book: { entries: [{ content: '不应进入轻量投影' }] } } },
        },
        {
          id: 'p2',
          name: '暗夜女王',
          avatar: `data:image/png;base64,${'B'.repeat(20_000)}`,
          description: '统治暗夜王国',
          source: { worldbookEnabled: false },
        },
      ],
    },
    userStore: {
      getActive: () => ({ id: 'u1', name: '测试用户' }),
      getAll: () => [
        {
          id: 'u1',
          name: '测试用户',
          avatar: `data:image/png;base64,${'C'.repeat(20_000)}`,
          description: '当前用户档案',
        },
        {
          id: 'u2',
          name: '备用用户',
          avatar: '',
          description: '备用档案',
        },
      ],
    },
    memoryTemplateStore: {
      getTemplates: async () => [{ id: 't1', name: '关系表', password: 'secret' }],
    },
    memoryTableStore: {
      scopeId: 'scope-p1',
      getMemories: async ({ template_id: templateId }) => [{ id: 'row1', template_id: templateId || 't1', data: { relation: '姐弟' } }],
    },
    presetStore: {
      getResolvedActive: (type, context) => ({ type, context, preset: { prompt: `${type} prompt` } }),
      getResolvedActiveId: type => ({ presetId: `${type}-active` }),
      getActiveId: type => `${type}-fallback`,
    },
    configPanel: {
      getDraftConfig: () => ({ provider: 'openai', model: 'gpt-test', baseUrl: 'https://example.test', apiKey: 'secret' }),
    },
    getUiMode: () => 'chat',
  };
};

{
  assert.equal(normalizeAppResourceName('messages'), 'chat');
  assert.equal(normalizeAppResourceName('world-info'), 'worldbook');
  assert.equal(normalizeAppResourceName('worldbook-template'), 'worldbook');
  assert.equal(normalizeAppResourceName('character-card'), 'persona');
  assert.deepEqual(sanitizeAppResourceValue({ token: 'secret', nested: { apiKey: 'secret', ok: true } }), {
    token: '[redacted]',
    nested: { apiKey: '[redacted]', ok: true },
  });
  console.log('ok - app resource helpers normalize aliases and redact secrets');
}

{
  const readResource = createAppResourceReader(makeDeps());
  const result = await readResource({ resource: 'chat', sessionId: 's1' });
  assert.equal(result.ok, true);
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[1].rawOriginal, '供应商完整回复');
  assert.equal(result.messages[1].reasoning, '内部推理');
  assert.equal(result.messages[1].displayText, '渲染后的回复');
  assert.equal(result.summaries[0].apiKey, '[redacted]');
  assert.equal(result.settings.token, '[redacted]');
  console.log('ok - app resource reader returns chat display, raw reply, reasoning, summaries, and settings');
}

{
  const readResource = createAppResourceReader(makeDeps());
  const result = await readResource({ resource: 'chat', sessionName: '精灵女王' });
  assert.equal(result.ok, true);
  assert.equal(result.sessionId, 's1');
  assert.equal(result.sessionLookup.source, 'sessionName');
  assert.equal(result.sessionLookup.matched, true);
  assert.equal(result.messages[1].rawOriginal, '供应商完整回复');
  console.log('ok - app resource reader resolves chat resources by session name');
}

{
  const readResource = createAppResourceReader(makeDeps());
  const result = await readResource({ resource: 'worldbook', sessionName: '精灵女王' });
  assert.equal(result.ok, true);
  assert.equal(result.sessionId, 's1');
  assert.equal(result.worldbooks[0].id, 'w1');
  assert.equal(result.worldbooks[0].entries[0].title, '精灵女王');
  assert.equal(result.worldbooks[0].entries[0].position, 4);
  assert.equal(result.worldbooks[0].entries[0].content, undefined);
  assert.equal(result.worldbooks[0].entries[0].contentPreview, undefined);
  assert.ok(result.worldbooks[0].entries[0].contentLength > 0);
  assert.equal(result.contentMode, 'summary');
  assert.equal(result.globalSettings.apiKey, '[redacted]');
  assert.equal(result.aiGeneration.templateStorageKey, 'world_ai_template_v1');
  assert.match(result.aiGeneration.template, /dialogue_examples/);
  console.log('ok - app resource reader returns worldbook entry index, injection fields, and global settings');
}

{
  const readResource = createAppResourceReader(makeDeps());
  const result = await readResource({
    resource: 'worldbook',
    name: 'w1',
    query: '精灵女王',
    includeContent: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.contentMode, 'content');
  assert.equal(result.worldbooks[0].entries.length, 1);
  assert.match(result.worldbooks[0].entries[0].content, /超级温柔/);
  console.log('ok - app resource reader returns worldbook content only when explicitly requested');
}

{
  const readResource = createAppResourceReader(makeDeps());
  const result = await readResource({ resource: 'regex', id: 'r1' });
  assert.equal(result.ok, true);
  assert.equal(result.session.enabledSetIds[0], 'r1');
  assert.equal(result.sets.length, 1);
  assert.equal(result.sets[0].name, '输出清理');
  console.log('ok - app resource reader returns regex session and local sets');
}

{
  const readResource = createAppResourceReader(makeDeps());
  const result = await readResource({ resource: 'variables' });
  assert.equal(result.ok, true);
  assert.equal(result.variables.mood, 'calm');
  assert.equal(result.globalVariables.app, 'phone');
  assert.equal(result.stageSchema.stage, 'opening');
  console.log('ok - app resource reader returns variables, schemas, rules, and stage schema');
}

{
  const readResource = createAppResourceReader(makeDeps());
  const result = await readResource({ resource: 'memory', id: 't1' });
  assert.equal(result.ok, true);
  assert.equal(result.scopeId, 'scope-p1');
  assert.equal(result.templates[0].password, '[redacted]');
  assert.equal(result.rows[0].data.relation, '姐弟');
  console.log('ok - app resource reader returns memory templates and table rows');
}

{
  const readResource = createAppResourceReader(makeDeps());
  const result = await readResource({ resource: 'preset', scope: 'sysprompt' });
  assert.equal(result.ok, true);
  assert.equal(result.context.uiMode, 'chat');
  assert.equal(result.presets.sysprompt.activeId, 'sysprompt-active');
  assert.equal(result.presets.sysprompt.resolved.preset.prompt, 'sysprompt prompt');
  console.log('ok - app resource reader returns resolved preset prompt state');
}

{
  const readResource = createAppResourceReader(makeDeps());
  const result = await readResource({ resource: 'config' });
  assert.equal(result.ok, true);
  assert.equal(result.config.provider, 'openai');
  assert.equal(result.config.model, 'gpt-test');
  assert.equal(result.config.activeProfileId, 'profile-1');
  assert.equal(Object.hasOwn(result.config, 'apiKey'), false);
  console.log('ok - app resource reader returns active config without secrets');
}

{
  const readResource = createAppResourceReader(makeDeps());
  const result = await readResource({ resource: 'session', target: '精灵女王' });
  assert.equal(result.ok, true);
  assert.equal(result.count, 2);
  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0].name, '精灵女王');
  assert.equal(result.sessions[0].messageCount, 2);
  console.log('ok - app resource reader returns session list with contact and message summaries');
}

{
  const readResource = createAppResourceReader(makeDeps());
  const personas = await readResource({ resource: 'persona', query: '暗夜女王' });
  const users = await readResource({ resource: 'user' });
  assert.equal(personas.ok, true);
  assert.equal(personas.items.length, 1);
  assert.equal(personas.items[0].id, 'p2');
  assert.deepEqual(personas.items[0], {
    id: 'p2',
    name: '暗夜女王',
    active: false,
  });
  assert.equal(personas.projection, 'compact');
  assert.match(personas.contentHint, /include/);
  assert.equal(users.activeId, 'u1');
  assert.equal(users.items.length, 2);
  assert.deepEqual(users.items[0], {
    id: 'u1',
    name: '测试用户',
    active: true,
  });
  assert.equal(JSON.stringify(users).includes('base64'), false);
  assert.equal(JSON.stringify(users).includes('当前用户档案'), false);
  console.log('ok - app resource reader returns compact personas and users by default');
}

{
  const readResource = createAppResourceReader(makeDeps());
  const descriptions = await readResource({
    resource: 'persona',
    query: '精灵女王',
    include: ['description'],
  });
  const avatar = await readResource({
    resource: 'user',
    id: 'u1',
    include: ['avatar'],
  });
  const details = await readResource({
    resource: 'persona',
    name: '暗夜女王',
    include: ['details'],
  });

  assert.equal(descriptions.projection, 'selected');
  assert.equal(descriptions.items[0].description, '温柔而坚定的精灵女王');
  assert.equal(Object.hasOwn(descriptions.items[0], 'avatar'), false);
  assert.match(avatar.items[0].avatar, /^data:image\/png;base64,C+$/);
  assert.equal(Object.hasOwn(avatar.items[0], 'description'), false);
  assert.equal(details.projection, 'full');
  assert.equal(details.items.length, 1);
  assert.equal(details.items[0].description, '统治暗夜王国');
  assert.match(details.items[0].avatar, /^data:image\/png;base64,B+$/);
  assert.deepEqual(details.items[0].source, { worldbookEnabled: false });
  assert.equal(details.items[0].active, false);
  console.log('ok - app resource reader expands only explicitly included profile fields');
}

{
  const readResource = createAppResourceReader(makeDeps());
  const personas = await readResource({
    resource: 'persona',
    id: 'p1',
    include: ['associations'],
  });

  assert.equal(personas.projection, 'selected');
  assert.deepEqual(personas.includedFields, ['associations']);
  assert.deepEqual(personas.items[0], {
    id: 'p1',
    name: '精灵女王',
    active: true,
    associations: {
      worldbookId: 'w1',
      worldbookEnabled: true,
      systemPresetId: 'sysprompt-elf',
      regexSetId: 'r1',
    },
  });
  assert.equal(Object.hasOwn(personas.items[0], 'source'), false);
  assert.equal(JSON.stringify(personas).includes('base64'), false);
  assert.equal(JSON.stringify(personas).includes('originalCardStored'), false);
  assert.equal(JSON.stringify(personas).includes('不应进入轻量投影'), false);

  const worldbook = await readResource({
    resource: 'worldbook',
    worldbookId: personas.items[0].associations.worldbookId,
  });
  assert.equal(worldbook.ok, true);
  assert.equal(worldbook.worldbooks[0].id, 'w1');
  assert.equal(worldbook.worldbooks[0].contentMode, 'summary');
  assert.equal(Object.hasOwn(worldbook.worldbooks[0].entries[0], 'content'), false);
  console.log('ok - persona associations expose only binding refs and can resolve a worldbook summary');
}

{
  const readResource = createAppResourceReader(makeDeps());
  const result = await readResource({ resource: 'unknown' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unsupported_resource');
  assert.ok(result.supportedResources.includes('worldbook'));
  console.log('ok - app resource reader reports unsupported resources');
}
