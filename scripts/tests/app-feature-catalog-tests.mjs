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
  assert.match(knowledge, /打开世界书/);
  assert.match(knowledge, /路径：聊天室右上角菜单 -> 世界书/);
  assert.match(knowledge, /工具：app\.open_panel/);

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
  const tools = [...navTools, ...sessionTools];

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
    if (feature.id === 'app.state.read') {
      const result = await getTool(tools, 'app.get_current_state').execute({});
      assert.equal(result.activePage, 'chat');
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
  assert.ok(refreshed.length > 0);
  console.log('ok - app feature catalog entries map to executable maid tools');
}
