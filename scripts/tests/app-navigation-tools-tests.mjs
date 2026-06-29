import assert from 'node:assert/strict';

import { createAppNavigationAgentTools } from '../../src/scripts/agent/tools/app-navigation-tools.js';

const getTool = (tools, name) => tools.find(tool => tool.name === name);

{
  const opened = [];
  const tools = createAppNavigationAgentTools({
    actions: {
      config: options => {
        opened.push(['config', options.tab]);
        return { opened: true };
      },
    },
  });
  const result = await getTool(tools, 'app.open_panel').execute({ panel: 'api', tab: 'chat' });
  assert.equal(result.opened, true);
  assert.equal(result.panel, 'config');
  assert.deepEqual(opened, [['config', 'chat']]);
  console.log('ok - app navigation tool normalizes panel aliases and opens whitelisted panels');
}

{
  const tools = createAppNavigationAgentTools({
    getCurrentState: () => ({ activePage: 'chat', sessionId: 'A' }),
    getVisiblePanelSummary: () => ({
      ok: true,
      activePage: 'chat',
      sessionId: 'A',
      panels: [{ id: 'chat', title: '聊天室', text: '当前聊天内容' }],
    }),
    readResource: args => ({
      ok: true,
      resource: args.resource,
      items: [{ id: 'm1', content: '完整回复' }],
    }),
  });
  const state = await getTool(tools, 'app.get_current_state').execute({});
  assert.deepEqual(state, { activePage: 'chat', sessionId: 'A' });

  const visible = await getTool(tools, 'app.read_visible_panel_summary').execute({});
  assert.equal(visible.ok, true);
  assert.equal(visible.panels[0].id, 'chat');

  const resource = await getTool(tools, 'app.read_resource').execute({ resource: 'chat', sessionName: 'A' });
  assert.equal(resource.ok, true);
  assert.equal(resource.resource, 'chat');
  assert.equal(resource.items[0].content, '完整回复');

  const search = await getTool(tools, 'app.search_feature').execute({ query: '世界书' });
  assert.equal(search.features[0].id, 'worldbook.open');

  const doc = await getTool(tools, 'app.read_feature_doc').execute({ featureId: 'worldbook.open' });
  assert.equal(doc.ok, true);
  assert.equal(doc.feature.panel, 'worldbook');
  console.log('ok - app navigation tools read state and feature catalog');
}
