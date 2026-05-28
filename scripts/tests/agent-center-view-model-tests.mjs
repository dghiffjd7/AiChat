import assert from 'node:assert/strict';

import {
  AGENT_CENTER_TABS,
  buildAgentCenterView,
} from '../../src/scripts/ui/agent-center-view-model.js';

{
  assert.deepEqual(AGENT_CENTER_TABS.map(tab => tab.id), ['pending', 'activity', 'tools', 'safety']);
  console.log('ok - agent center exposes user-facing tabs');
}

{
  const view = buildAgentCenterView({
    pendingPermissions: [
      {
        id: 'permission-1',
        status: 'pending',
        toolName: 'contact_profile.list',
        sessionId: 'chat:alice',
        permissions: ['storage'],
        riskLevel: 'low',
        createdAt: 2,
      },
      {
        id: 'permission-2',
        status: 'denied',
        toolName: 'memory.update_after_chat',
        permissions: ['storage:write'],
        riskLevel: 'medium',
        createdAt: 1,
      },
    ],
    contactProfilePendingUpdates: [
      {
        id: 'profile-pending-1',
        status: 'pending',
        contactId: 'chat:bob',
        reason: 'background',
        createdAt: 3,
        profile: {
          contactId: 'chat:bob',
          displayName: 'Bob',
          stable_traits: [{ label: '喜欢咖啡' }],
          interaction_focus: [{ topic: 'daily' }],
        },
      },
    ],
    agentRuns: [
      {
        id: 'run-1',
        kind: 'memory_update',
        title: 'Memory update',
        status: 'running',
        createdAt: 10,
        updatedAt: 12,
      },
      {
        id: 'run-2',
        kind: 'lineage_layout',
        title: 'Lineage layout',
        status: 'failed',
        createdAt: 8,
        updatedAt: 9,
      },
    ],
    tools: [
      { name: 'memory.update_after_chat', title: 'Memory update', permissions: ['storage:write'], riskLevel: 'medium' },
      { name: 'contact_profile.list', title: 'Contact profile list', permissions: ['storage'], riskLevel: 'low' },
    ],
    sessionGate: { enabled: false, allowedTools: ['contact_profile.list'] },
    experimentStatus: { enabled: false, allowedTools: ['contact_profile.list'] },
  });
  assert.equal(view.meta.pending, 2);
  assert.equal(view.meta.activeRuns, 1);
  assert.equal(view.meta.failedRuns, 1);
  assert.equal(view.meta.unreadFailedRuns, 1);
  assert.equal(view.meta.newestFailureAt, 9);
  assert.equal(view.meta.tools, 2);
  assert.equal(view.pending[0].id, 'profile-pending-1');
  assert.equal(view.pending[0].kind, 'contact_profile_update');
  assert.equal(view.pending[0].profileSummary, 'Bob · 特征 1 · 互动重点 1');
  assert.deepEqual(view.tools.map(tool => tool.name), ['contact_profile.list', 'memory.update_after_chat']);
  assert.deepEqual(view.tools[0].capabilities, {
    read: false,
    write: false,
    network: false,
    cost: 'none',
    undo: 'none',
    modelContext: 'none',
    confirmation: 'allow_once',
  });
  assert.equal(view.tabs.find(tab => tab.id === 'pending').count, 2);
  assert.equal(view.tabs.find(tab => tab.id === 'activity').count, 1);
  assert.equal(view.tabs.find(tab => tab.id === 'tools').count, 2);
  console.log('ok - agent center view summarizes pending activity tools and safety state');
}

{
  const view = buildAgentCenterView({
    agentRunView: {
      meta: { total: 3, active: 2, failures: 1 },
      filters: { limit: 3 },
      runs: [{ id: 'run-3', status: 'running', kind: 'image_generation' }],
    },
    tools: null,
    pendingPermissions: null,
  });
  assert.equal(view.activity.runs.length, 1);
  assert.equal(view.meta.activeRuns, 2);
  assert.equal(view.meta.unreadFailedRuns, 1);
  assert.equal(view.meta.tools, 0);
  console.log('ok - agent center accepts prebuilt agent run views');
}
