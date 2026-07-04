import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildAppFeatureKnowledgeText,
  buildAppFeatureDoc,
  buildAppFeatureSearchContextText,
  findAppFeature,
  listAppFeatures,
  searchAppFeatures,
} from '../../src/scripts/agent/app-feature-catalog.js';
import { createAppNavigationAgentTools } from '../../src/scripts/agent/tools/app-navigation-tools.js';
import { createAppSessionAgentTools } from '../../src/scripts/agent/tools/app-session-tools.js';
import { createAppContentAgentTools } from '../../src/scripts/agent/tools/app-content-tools.js';
import { createMaidMediaAssetTools } from '../../src/scripts/agent/tools/media-asset-tools.js';
import { createWebSearchAgentTools } from '../../src/scripts/agent/tools/web-search-tools.js';
import { createMaidTodoTools } from '../../src/scripts/agent/tools/maid-todo-tools.js';
import { createChatFormatRepairTools } from '../../src/scripts/agent/tools/chat-format-tools.js';

const getTool = (tools, name) => tools.find(tool => tool.name === name);

const __dirname = dirname(fileURLToPath(import.meta.url));
const readRepoFile = relativePath => readFileSync(resolve(__dirname, '../..', relativePath), 'utf8');
const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

{
  const results = searchAppFeatures('我想设置 API', { limit: 3 });
  assert.equal(results[0].id, 'config.api.open');
  assert.equal(results[0].panel, 'config');
  console.log('ok - app feature catalog matches API configuration wording');
}

{
  const feature = findAppFeature('会话配置');
  assert.equal(feature.id, 'session.config.open');
  const doc = buildAppFeatureDoc(feature.id);
  assert.match(doc.doc, /界面路径/);
  assert.match(doc.doc, /session\.open_config/);
  console.log('ok - app feature catalog resolves aliases and builds concise docs');
}

{
  const results = searchAppFeatures('帮我联网搜索最新资讯', { limit: 3 });
  assert.equal(results[0].id, 'web.search');
  assert.deepEqual(results[0].tools, ['web.search', 'web.fetch_url', 'web.research', 'web.search_images']);
  const doc = buildAppFeatureDoc('web.search');
  assert.match(doc.doc, /web\.search/);
  assert.match(doc.doc, /web\.fetch_url/);
  assert.match(doc.doc, /web\.research/);
  console.log('ok - app feature catalog exposes web search feature');
}

{
  const results = searchAppFeatures('把这张图设为角色头像', { limit: 3 });
  assert.equal(results[0].id, 'persona.avatar.set');
  const wallpaper = findAppFeature('设置聊天室壁纸');
  assert.equal(wallpaper.id, 'session.wallpaper.set');
  assert.ok(wallpaper.tools.includes('session.set_wallpaper'));
  console.log('ok - app feature catalog exposes maid image asset features');
}

{
  const appJs = readRepoFile('src/scripts/ui/app.js');
  const start = appJs.indexOf('registerAppNavigationAgentTools(agentToolRegistry, {');
  const end = appJs.indexOf('registerAppSessionAgentTools(agentToolRegistry, {');
  assert.ok(start >= 0 && end > start, 'app navigation tool registration block not found');
  const registrationBlock = appJs.slice(start, end);
  const appPanelFeatures = listAppFeatures()
    .filter(feature => (feature.tools || []).includes('app.open_panel') && feature.panel);
  for (const feature of appPanelFeatures) {
    const panel = escapeRegex(feature.panel);
    const keyPattern = /^[A-Za-z_$][\w$]*$/.test(feature.panel)
      ? new RegExp(`(?:${panel}|['"]${panel}['"])\\s*:`)
      : new RegExp(`['"]${panel}['"]\\s*:`);
    assert.match(registrationBlock, keyPattern, `${feature.id} panel ${feature.panel} is not wired in app.js`);
  }
  console.log('ok - app feature catalog panel entries are wired in app.js');
}

{
  const knowledge = buildAppFeatureKnowledgeText([
    {
      id: 'worldbook.open',
      title: '打开世界书',
      summary: '打开当前会话世界书管理界面。',
      uiPath: ['聊天室右上角菜单', '世界书'],
      tools: ['app.open_panel'],
    },
  ]);
  assert.match(knowledge, /- id: worldbook\.open/);
  assert.match(knowledge, /title: 打开世界书/);
  assert.match(knowledge, /path: 聊天室右上角菜单 -> 世界书/);
  assert.match(knowledge, /tools: \[app\.open_panel\]/);

  const context = buildAppFeatureSearchContextText('世界书在哪里', { limit: 2 });
  assert.match(context, /检索：已执行/);
  assert.match(context, /命中：打开世界书/);
  assert.match(context, /worldbook\.open/);
  console.log('ok - app feature catalog builds maid knowledge and search context text');
}

{
  const openedPanels = [];
  const openedSessions = [];
  const openedConfigs = [];
  const activeSessions = [];
  const refreshed = [];
  const savedWorlds = new Map();
  const boundWorlds = [];
  const personas = new Map();
  const users = new Map();
  const sessionSettings = new Map();
  let personaSeq = 0;
  let userSeq = 0;
  let current = 'B';
  const contacts = new Map([
    ['B', { id: 'B', name: 'Beta', isGroup: false }],
  ]);
  const messages = new Map();
  const navTools = createAppNavigationAgentTools({
    actions: {
      'agent-center': options => openedPanels.push(['agent-center', options]),
      config: options => openedPanels.push(['config', options]),
      session: options => openedPanels.push(['session', options]),
      'session-config': options => openedPanels.push(['session-config', options]),
      worldbook: options => openedPanels.push(['worldbook', options]),
      memory: options => openedPanels.push(['memory', options]),
      variables: options => openedPanels.push(['variables', options]),
      regex: options => openedPanels.push(['regex', options]),
    },
    getCurrentState: () => ({ activePage: 'chat', uiMode: 'chat', sessionId: current }),
    getVisiblePanelSummary: () => ({
      ok: true,
      activePage: 'chat',
      uiMode: 'chat',
      sessionId: current,
      panels: [{ id: 'chat', title: '聊天室', text: 'Beta 聊天室' }],
    }),
    readResource: args => ({
      ok: true,
      resource: args.resource,
      sessionId: args.sessionId || current,
    }),
    listRecentErrors: () => [],
  });
  const sessionTools = createAppSessionAgentTools({
    contactsStore: {
      listContacts: () => Array.from(contacts.values()),
      getContact: id => contacts.get(id) || null,
      upsertContact: contact => {
        contacts.set(contact.id, { ...contact });
        return contacts.get(contact.id);
      },
    },
    chatStore: {
      getCurrent: () => current,
      switchSession: id => {
        current = id;
      },
      appendMessage: (message, id = current) => {
        const list = messages.get(id) || [];
        list.push({ ...message });
        messages.set(id, list);
      },
    },
    enterChatRoom: async id => {
      openedSessions.push(id);
      return { blocked: false };
    },
    refreshChatAndContacts: options => refreshed.push(options),
    setActiveSession: id => activeSessions.push(id),
    showSessionConfig: options => openedConfigs.push(options),
    renderSessionNameHtml: (id, contact) => contact?.name || id,
    now: () => 1000,
  });
  const contentTools = createAppContentAgentTools({
    personaStore: {
      getAll: () => Array.from(personas.values()),
      get: id => personas.get(id) || null,
      create: async (data = {}) => {
        personaSeq += 1;
        const item = { id: `persona-${personaSeq}`, ...data };
        personas.set(item.id, item);
        return item;
      },
      setActive: async id => personas.has(id),
    },
    userStore: {
      getAll: () => Array.from(users.values()),
      get: id => users.get(id) || null,
      create: async (data = {}) => {
        userSeq += 1;
        const item = { id: `user-${userSeq}`, ...data };
        users.set(item.id, item);
        return item;
      },
      setActive: async id => users.has(id),
    },
    contactsStore: {
      listContacts: () => Array.from(contacts.values()),
      getContact: id => contacts.get(id) || null,
    },
    chatStore: {
      getCurrent: () => current,
      switchSession: id => {
        current = id;
      },
      appendMessage: (message, id = current) => {
        const list = messages.get(id) || [];
        list.push({ ...message });
        messages.set(id, list);
      },
    },
    saveWorldInfo: async (id, data) => savedWorlds.set(id, data),
    getWorldInfo: async id => savedWorlds.get(id) || null,
    listWorlds: async () => Array.from(savedWorlds.keys()),
    waitForWorldStoreReady: async () => true,
    getWorldIdsForSession: async () => ['CatalogWorld'],
    getGlobalWorldId: async () => '',
    assignWorldToPersona: async (personaId, worldId, options) => boundWorlds.push({ personaId, worldId, options }),
    bindWorldToSession: async (sessionId, worldIds, options) => boundWorlds.push({ sessionId, worldIds, options }),
    enterChatRoom: async id => {
      openedSessions.push(id);
      return { blocked: false };
    },
    refreshChatAndContacts: options => refreshed.push(options),
    setActiveSession: id => activeSessions.push(id),
    renderSessionNameHtml: (id, contact) => contact?.name || id,
    getActiveUserName: () => 'CatalogUser',
    now: () => 1000,
  });
  const webTools = createWebSearchAgentTools({
    httpRequest: async () => ({
      ok: true,
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        Heading: 'Catalog Web',
        AbstractText: 'Catalog web result.',
        AbstractURL: 'https://example.com/catalog',
        AbstractSource: 'Example',
      }),
    }),
  });
  const mediaTools = createMaidMediaAssetTools({
    personaStore: {
      getAll: () => Array.from(personas.values()),
      get: id => personas.get(id) || null,
      getActive: () => Array.from(personas.values())[0] || null,
      update: async (id, patch) => {
        const next = { ...personas.get(id), ...patch };
        personas.set(id, next);
        return next;
      },
    },
    userStore: {
      getAll: () => Array.from(users.values()),
      get: id => users.get(id) || null,
      getActive: () => Array.from(users.values())[0] || null,
      update: async (id, patch) => {
        const next = { ...users.get(id), ...patch };
        users.set(id, next);
        return next;
      },
    },
    contactsStore: {
      listContacts: () => Array.from(contacts.values()),
      getContact: id => contacts.get(id) || null,
      upsertContact: contact => contacts.set(contact.id, { ...contacts.get(contact.id), ...contact }),
    },
    chatStore: {
      getSessionSettings: id => sessionSettings.get(id) || {},
      setSessionSettings: (id, next) => sessionSettings.set(id, next),
    },
    getCurrentSessionId: () => current,
    prepareImage: async ({ purpose }) => ({
      dataUrl: `data:image/webp;base64,${purpose}`,
      width: purpose === 'avatar' ? 256 : 1280,
      height: purpose === 'avatar' ? 256 : 720,
      mime: purpose === 'avatar' ? 'image/webp' : 'image/jpeg',
      bytes: 120,
      transformed: true,
    }),
    saveWallpaper: async payload => ({ path: `wallpapers/${payload.sessionId}/wallpaper.jpg`, bytes: 120 }),
    refreshChatAndContacts: options => refreshed.push(options),
    applyChatSettings: () => {},
    now: () => 1000,
  });
  const todoRuns = new Map([['run-1', { id: 'run-1', metadata: { todos: [] } }]]);
  const todoTools = createMaidTodoTools({
    getRun: runId => todoRuns.get(runId) || null,
    updateRun: (runId, patch) => {
      const run = todoRuns.get(runId);
      if (run) run.metadata = { ...run.metadata, ...(patch?.metadata || {}) };
      return run;
    },
  });
  const formatProfiles = new Map();
  const formatTools = createChatFormatRepairTools({
    repairMessageFormat: async args => ({ ok: true, applied: true, formatHint: args.formatHint }),
    optimizeMessage: async args => ({ ok: true, applied: true, instruction: args.instruction }),
    formatProfileStore: {
      get: sid => formatProfiles.get(sid) || null,
      set: (sid, profile) => {
        const saved = { sessionId: sid, guide: profile.guide, sources: profile.sources || [] };
        formatProfiles.set(sid, saved);
        return saved;
      },
    },
    resolveSessionId: ({ sessionId, sessionName }) => sessionId || sessionName || current,
  });
  const tools = [...navTools, ...sessionTools, ...contentTools, ...mediaTools, ...webTools, ...todoTools, ...formatTools];
  const maidAttachments = [{ id: 'catalog-image', kind: 'image', url: 'data:image/png;base64,AAAA', name: 'catalog.png' }];

  for (const feature of listAppFeatures()) {
    for (const toolName of feature.tools || []) {
      assert.ok(getTool(tools, toolName), `${feature.id} references missing tool ${toolName}`);
    }
  }

  const runFeature = async (feature) => {
    if (feature.id === 'session.create') {
      const result = await getTool(tools, 'session.create').execute({ name: 'CatalogRoom', open: true });
      assert.equal(result.ok, true);
      assert.equal(result.created, true);
      return;
    }
    if (feature.id === 'session.open') {
      const result = await getTool(tools, 'session.open').execute({ sessionId: 'Beta' });
      assert.equal(result.ok, true);
      assert.equal(result.sessionId, 'B');
      return;
    }
    if (feature.id === 'session.config.open') {
      const result = await getTool(tools, 'session.open_config').execute({ sessionId: 'Beta' });
      assert.equal(result.ok, true);
      assert.equal(result.opened, true);
      return;
    }
    if (feature.id === 'persona.create') {
      const result = await getTool(tools, 'persona.create').execute({ name: 'CatalogRole', setActive: true });
      assert.equal(result.ok, true);
      assert.equal(result.created, true);
      return;
    }
    if (feature.id === 'persona.switch') {
      const result = await getTool(tools, 'persona.switch').execute({ target: 'CatalogRole' });
      assert.equal(result.ok, true);
      assert.equal(result.switched, true);
      return;
    }
    if (feature.id === 'persona.avatar.set') {
      const result = await getTool(tools, 'persona.set_avatar').execute({ target: 'CatalogRole' }, { maidAttachments });
      assert.equal(result.ok, true);
      assert.match(personas.get('persona-1').avatar, /data:image\/webp/);
      return;
    }
    if (feature.id === 'user.create') {
      const result = await getTool(tools, 'user.create').execute({ name: 'CatalogUser', setActive: true });
      assert.equal(result.ok, true);
      assert.equal(result.created, true);
      return;
    }
    if (feature.id === 'user.switch') {
      const result = await getTool(tools, 'user.switch').execute({ target: 'CatalogUser' });
      assert.equal(result.ok, true);
      assert.equal(result.switched, true);
      return;
    }
    if (feature.id === 'user.avatar.set') {
      const result = await getTool(tools, 'user.set_avatar').execute({ target: 'CatalogUser' }, { maidAttachments });
      assert.equal(result.ok, true);
      assert.match(users.get('user-1').avatar, /data:image\/webp/);
      return;
    }
    if (feature.id === 'contact.avatar.set') {
      const result = await getTool(tools, 'contact.set_avatar').execute({ target: 'Beta' }, { maidAttachments });
      assert.equal(result.ok, true);
      assert.match(contacts.get('B').avatar, /data:image\/webp/);
      return;
    }
    if (feature.id === 'session.wallpaper.set') {
      const result = await getTool(tools, 'session.set_wallpaper').execute({ target: 'Beta' }, { maidAttachments });
      assert.equal(result.ok, true);
      assert.equal(sessionSettings.get('B').wallpaper.path, 'wallpapers/B/wallpaper.jpg');
      return;
    }
    if (feature.id === 'worldbook.create') {
      const result = await getTool(tools, 'worldbook.create').execute({
        name: 'CatalogWorld',
        personaName: 'CatalogRole',
        bindToPersona: true,
        entries: [{ title: 'CatalogEntry', content: 'Catalog content.' }],
      });
      assert.equal(result.ok, true);
      assert.equal(result.entryCount, 1);
      return;
    }
    if (feature.id === 'worldbook.update_entries') {
      const result = await getTool(tools, 'worldbook.update_entries').execute({
        name: 'CatalogWorld',
        updates: [{ entryTitle: 'CatalogEntry', content: 'Updated catalog content.' }],
      }, {
        toolSafety: {
          decision: 'allow',
          request: { kind: 'worldbook.update_entries' },
        },
      });
      assert.equal(result.ok, true);
      assert.equal(result.updatedEntryCount, 1);
      return;
    }
    if (feature.id === 'worldbook.delete_entries') {
      savedWorlds.set('CatalogDeleteWorld', {
        name: 'CatalogDeleteWorld',
        entries: [
          { id: 'old', comment: 'Duplicate', content: 'old' },
          { id: 'latest', comment: 'Duplicate', content: 'latest' },
        ],
      });
      const result = await getTool(tools, 'worldbook.delete_entries').execute({
        name: 'CatalogDeleteWorld',
        dedupeByTitle: true,
        duplicateTitles: ['Duplicate'],
        keep: 'last',
      }, {
        toolSafety: {
          decision: 'allow',
          request: { kind: 'worldbook.delete_entries' },
        },
      });
      assert.equal(result.ok, true);
      assert.equal(result.deletedEntryCount, 1);
      assert.deepEqual(savedWorlds.get('CatalogDeleteWorld').entries.map(entry => entry.id), ['latest']);
      return;
    }
    if (feature.id === 'worldbook.list') {
      const result = await getTool(tools, 'worldbook.list').execute({ sessionId: current });
      assert.equal(result.ok, true);
      assert.ok(result.worldbooks.some(item => item.id === 'CatalogWorld'));
      return;
    }
    if (feature.id === 'worldbook.bind_session') {
      const result = await getTool(tools, 'worldbook.bind_session').execute({ sessionId: current, worldbookId: 'CatalogWorld' });
      assert.equal(result.ok, true);
      assert.equal(result.bound, true);
      assert.deepEqual(boundWorlds.at(-1), { sessionId: current, worldIds: ['CatalogWorld'], options: { silent: false } });
      return;
    }
    if (feature.id === 'worldbook.read') {
      const result = await getTool(tools, 'worldbook.read').execute({ name: 'CatalogWorld' });
      assert.equal(result.ok, true);
      assert.equal(result.entries[0].title, 'CatalogEntry');
      return;
    }
    if (feature.id === 'chat.send_message') {
      const result = await getTool(tools, 'chat.send_message').execute({ sessionId: 'Beta', content: 'hi' });
      assert.equal(result.ok, true);
      assert.equal(result.sent, true);
      return;
    }
    if (feature.id === 'app.state.read') {
      const result = await getTool(tools, 'app.get_current_state').execute({});
      assert.equal(result.activePage, 'chat');
      return;
    }
    if (feature.id === 'app.visible_panel.read') {
      const result = await getTool(tools, 'app.ui.inspect').execute({});
      assert.equal(result.ok, true);
      assert.equal(result.panels[0].id, 'chat');
      return;
    }
    if (feature.id === 'app.resource.read') {
      const result = await getTool(tools, 'app.read_resource').execute({ resource: 'chat', sessionId: current });
      assert.equal(result.ok, true);
      assert.equal(result.resource, 'chat');
      return;
    }
    if (feature.id === 'web.search') {
      const result = await getTool(tools, 'web.search').execute({ query: 'Catalog Web', limit: 1 });
      assert.equal(result.ok, true);
      assert.equal(result.results[0].url, 'https://example.com/catalog');
      return;
    }
    if (feature.id === 'chat.format.repair') {
      const result = await getTool(tools, 'chat.repair_message_format').execute({ formatHint: '状态栏格式' });
      assert.equal(result.ok, true);
      assert.equal(result.applied, true);
      return;
    }
    if (feature.id === 'chat.format.profile') {
      const saved = await getTool(tools, 'chat.save_format_profile').execute({ sessionId: 'B', guide: '状态块格式规范内容' });
      assert.equal(saved.ok, true);
      const read = await getTool(tools, 'chat.read_format_profile').execute({ sessionId: 'B' });
      assert.equal(read.hasProfile, true);
      return;
    }
    if (feature.id === 'chat.message.optimize') {
      const result = await getTool(tools, 'chat.optimize_message').execute({ instruction: '更简洁' });
      assert.equal(result.ok, true);
      assert.equal(result.applied, true);
      return;
    }
    if (feature.id === 'maid.todo') {
      const wrote = await getTool(tools, 'maid.todo.write').execute(
        { todos: [{ content: '创建聊天室', status: 'in_progress' }] },
        { runId: 'run-1' },
      );
      assert.equal(wrote.ok, true);
      const read = await getTool(tools, 'maid.todo.read').execute({}, { runId: 'run-1' });
      assert.equal(read.ok, true);
      assert.equal(read.todos[0].content, '创建聊天室');
      return;
    }
    if (feature.id === 'app.errors.read') {
      const result = await getTool(tools, 'app.read_recent_errors').execute({});
      assert.equal(result.ok, true);
      assert.ok(Array.isArray(result.errors));
      return;
    }
    if (feature.id === 'app.capabilities.search') {
      const result = await getTool(tools, 'app.search_feature').execute({ query: '世界书' });
      assert.ok(result.features.length > 0);
      const doc = await getTool(tools, 'app.read_feature_doc').execute({ featureId: result.features[0].id });
      assert.equal(doc.ok, true);
      assert.ok(doc.feature.doc.length > 0);
      return;
    }
    const panel = feature.panel;
    const result = await getTool(tools, 'app.open_panel').execute({
      panel,
      ...(feature.id === 'config.api.open' ? { tab: 'chat' } : {}),
    });
    assert.equal(result.ok, true);
    assert.equal(result.opened, true);
    assert.equal(result.panel, panel);
  };

  for (const feature of listAppFeatures()) {
    await runFeature(feature);
  }

  assert.ok(openedPanels.some(([panel]) => panel === 'config'));
  assert.ok(openedPanels.some(([panel]) => panel === 'worldbook'));
  assert.ok(openedConfigs.some(item => item.sessionId === 'B'));
  assert.ok(openedSessions.includes('B'));
  assert.ok(openedSessions.includes('CatalogRoom'));
  assert.ok(activeSessions.includes('CatalogRoom'));
  assert.ok(personas.has('persona-1'));
  assert.ok(users.has('user-1'));
  assert.ok(savedWorlds.has('CatalogWorld'));
  assert.ok(boundWorlds.some(item => item.worldId === 'CatalogWorld'));
  assert.ok(messages.get('B')?.some(message => message.content === 'hi'));
  assert.ok(refreshed.length > 0);
  console.log('ok - app feature catalog entries map to executable maid tools');
}
