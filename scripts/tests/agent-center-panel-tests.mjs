import assert from 'node:assert/strict';

import { AgentCenterPanel } from '../../src/scripts/ui/agent-center-panel.js';

{
  const panel = new AgentCenterPanel({
    getActions: () => ({
      listProviderToolPendingPermissions: () => [
        { id: 'pending-1', status: 'pending', toolName: 'contact_profile.list', createdAt: 2 },
      ],
      listAgentRunView: () => ({
        meta: { total: 1, active: 1, failures: 0 },
        filters: { limit: 50 },
        runs: [{ id: 'run-1', kind: 'memory_update', title: 'Memory update', status: 'running' }],
      }),
      listAgentTools: () => [
        { name: 'contact_profile.list', title: 'Contact list', riskLevel: 'low', permissions: ['storage'] },
      ],
      listAgentPermissionRules: () => [{ toolName: 'contact_profile.list' }],
      getProviderToolSessionGate: () => ({ enabled: false, allowedTools: ['contact_profile.list'] }),
      getProviderToolExperimentStatus: () => ({ enabled: false, allowedTools: ['contact_profile.list'] }),
    }),
  });
  const view = await panel.collectView();
  assert.equal(view.meta.pending, 1);
  assert.equal(view.meta.activeRuns, 1);
  assert.equal(view.meta.tools, 1);
  assert.equal(view.safety.permissionRules.length, 1);
  console.log('ok - agent center panel collects existing agent debug registry actions into a user view');
}

{
  const panel = new AgentCenterPanel({
    getActions: () => ({
      listAgentRunView: () => {
        throw new Error('run view unavailable');
      },
    }),
  });
  const view = await panel.collectView();
  assert.equal(view.activity.runs.length, 0);
  assert.equal(panel.lastError, 'run view unavailable');
  console.log('ok - agent center panel degrades to empty view when optional actions fail');
}
