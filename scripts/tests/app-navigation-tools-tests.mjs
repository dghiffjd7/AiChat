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
  });
  const state = await getTool(tools, 'app.get_current_state').execute({});
  assert.deepEqual(state, { activePage: 'chat', sessionId: 'A' });

  const search = await getTool(tools, 'app.search_feature').execute({ query: '世界书' });
  assert.equal(search.features[0].id, 'worldbook.open');

  const doc = await getTool(tools, 'app.read_feature_doc').execute({ featureId: 'worldbook.open' });
  assert.equal(doc.ok, true);
  assert.equal(doc.feature.panel, 'worldbook');
  console.log('ok - app navigation tools read state and feature catalog');
}
