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
  let listOptions = null;
  const panel = new AgentCenterPanel({
    getActions: () => ({
      listAgentRunView: options => {
        listOptions = options;
        return {
          meta: { total: 2, active: 0, failures: 1 },
          filters: options,
          runs: [{ id: 'run-failed', kind: 'image_generation', status: 'failed', errorMessage: 'provider unavailable' }],
        };
      },
    }),
  });
  panel.activityStatus = 'failure';
  const view = await panel.collectView();
  assert.equal(listOptions.status, 'failure');
  assert.equal(view.activity.runs[0].id, 'run-failed');
  console.log('ok - agent center panel requests filtered failed activity when opened from failure chip');
}

{
  const panel = new AgentCenterPanel();
  panel.activityStatus = 'failure';
  panel.view = {
    activity: {
      meta: { total: 2, active: 0, failures: 1, statusCounts: { succeeded: 1, failed: 1 } },
      runs: [
        {
          id: 'run-failed',
          kind: 'image_generation',
          title: 'Image generation',
          status: 'failed',
          summary: 'generation failed',
          errorMessage: 'provider unavailable',
          lastStep: { type: 'image.generate', status: 'failed', errorMessage: 'provider unavailable' },
        },
      ],
    },
  };
  const html = panel.renderActivity();
  assert.match(html, /data-activity-status="failure"/);
  assert.match(html, /is-danger/);
  assert.match(html, /错误：provider unavailable/);
  assert.match(html, /agent-center-card is-failure/);
  console.log('ok - agent center panel renders failed activity filter and error detail');
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
