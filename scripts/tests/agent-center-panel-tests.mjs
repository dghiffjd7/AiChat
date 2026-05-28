import assert from 'node:assert/strict';

import { AgentCenterPanel } from '../../src/scripts/ui/agent-center-panel.js';

{
  const panel = new AgentCenterPanel({
    getActions: () => ({
      listProviderToolPendingPermissions: () => [
        { id: 'pending-1', status: 'pending', toolName: 'contact_profile.list', createdAt: 2 },
      ],
      listContactProfilePendingUpdates: () => [
        { id: 'profile-pending-1', status: 'pending', contactId: 'chat:bob', createdAt: 3, profile: { contactId: 'chat:bob', displayName: 'Bob' } },
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
  assert.equal(view.meta.pending, 2);
  assert.equal(view.meta.activeRuns, 1);
  assert.equal(view.meta.tools, 1);
  assert.equal(view.pending[0].kind, 'contact_profile_update');
  assert.equal(view.safety.permissionRules.length, 1);
  console.log('ok - agent center panel collects existing agent debug registry actions into a user view');
}

{
  const panel = new AgentCenterPanel();
  panel.view = {
    pending: [
      {
        kind: 'contact_profile_update',
        id: 'profile-pending-1',
        status: 'pending',
        toolName: '联系人画像更新',
        sessionId: 'chat:bob',
        source: 'contact-profiler-agent',
        contactId: 'chat:bob',
        riskLevel: 'medium',
        permissions: ['storage:write'],
        profileSummary: 'Bob · 特征 1',
      },
    ],
  };
  const html = panel.renderPending();
  assert.match(html, /保存画像/);
  assert.match(html, /data-profile-action="approve"/);
  assert.match(html, /忽略只清除本次候选/);
  console.log('ok - agent center panel renders contact profile pending update actions');
}

{
  const panel = new AgentCenterPanel();
  panel.view = {
    pending: [
      {
        kind: 'tool_permission',
        id: 'provider-pending-1',
        status: 'pending',
        toolName: 'contact_profile.list',
        sessionId: 'chat:bob',
        source: 'provider-tool-permission',
        riskLevel: 'low',
        permissions: ['storage'],
        resumeStatus: 'idle',
        continuationStatus: 'idle',
      },
    ],
  };
  const html = panel.renderPending();
  assert.match(html, /允许一次/);
  assert.match(html, /data-provider-permission-action="allow_once"/);
  assert.match(html, /data-provider-permission-action="deny"/);
  assert.match(html, /data-provider-permission-action="remember_allow"/);
  assert.match(html, /不会重放聊天、不会自动续跑 provider、不会直接写聊天正文/);
  console.log('ok - agent center panel renders provider tool pending permission actions');
}

{
  let confirmOptions = null;
  let resolverOptions = null;
  let refreshed = false;
  const panel = new AgentCenterPanel({
    confirm: async options => {
      confirmOptions = options;
      return true;
    },
    getActions: () => ({
      resolveProviderToolPendingPermission: options => {
        resolverOptions = options;
        return { pending: { status: 'allowed' }, resume: { status: 'succeeded' } };
      },
    }),
  });
  panel.view = {
    pending: [
      {
        kind: 'tool_permission',
        id: 'provider-pending-1',
        status: 'pending',
        toolName: 'contact_profile.list',
      },
    ],
  };
  panel.refresh = async () => {
    refreshed = true;
  };
  await panel.handleProviderPermissionAction('allow_once', 'provider-pending-1');
  assert.equal(confirmOptions.confirmText, '允许一次');
  assert.equal(resolverOptions.id, 'provider-pending-1');
  assert.equal(resolverOptions.action, 'allow_once');
  assert.equal(resolverOptions.reason, 'agent center pending action');
  assert.equal(refreshed, true);
  console.log('ok - agent center provider permission action resolves through debug registry contract');
}

{
  let listOptions = null;
  const panel = new AgentCenterPanel({
    getFailureSeenAt: () => 900,
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
  assert.equal(listOptions.failureSeenAt, 900);
  assert.equal(view.activity.runs[0].id, 'run-failed');
  console.log('ok - agent center panel requests filtered failed activity when opened from failure chip');
}

{
  let marked = null;
  const panel = new AgentCenterPanel({
    markFailureSeen: options => {
      marked = options;
    },
    getActions: () => ({
      listAgentRunView: () => ({
        meta: {
          total: 1,
          active: 0,
          failures: 1,
          unreadFailures: 1,
          newestFailureAt: 2000,
        },
        filters: { status: 'failure' },
        runs: [{ id: 'run-failed', kind: 'image_generation', status: 'failed', updatedAt: 2000 }],
      }),
    }),
  });
  panel.ensureDom = () => {};
  panel.render = () => {};
  panel.activeTab = 'activity';
  panel.activityStatus = 'failure';
  await panel.refresh();
  assert.equal(marked.surface, '');
  assert.equal(marked.at >= 2000, true);
  assert.equal(panel.view.meta.unreadFailedRuns, 0);
  console.log('ok - agent center panel marks failures as read after opening failure activity');
}

{
  let listOptions = null;
  const panel = new AgentCenterPanel({
    getActions: () => ({
      listAgentRunView: options => {
        listOptions = options;
        return {
          meta: { total: 3, active: 1, failures: 1, scoped: 1, scopedActive: 1, scopedFailures: 0 },
          filters: options,
          runs: [{ id: 'run-moment', kind: 'moment_summary', status: 'running', surface: 'moments' }],
        };
      },
    }),
  });
  panel.surface = 'moments';
  const view = await panel.collectView();
  assert.equal(listOptions.surface, 'moments');
  assert.equal(view.meta.activeRuns, 1);
  assert.equal(view.meta.failedRuns, 0);
  assert.equal(view.activity.runs[0].surface, 'moments');
  console.log('ok - agent center panel can collect surface scoped activity');
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
  const panel = new AgentCenterPanel();
  panel.view = {
    tools: [
      {
        name: 'contact_profile.get',
        title: 'Get contact profile',
        source: 'contact-profile-store',
        description: 'Get one profile',
        riskLevel: 'low',
        permissions: ['storage'],
        executionMode: 'sequential',
        capabilities: {
          read: true,
          write: false,
          network: false,
          cost: 'none',
          undo: 'none',
          modelContext: 'allowlist',
          confirmation: 'allow_once',
        },
      },
    ],
  };
  const html = panel.renderTools();
  assert.match(html, /contact_profile\.get/);
  assert.match(html, /read/);
  assert.match(html, /read-only/);
  assert.match(html, /local/);
  assert.match(html, /model: allowlist/);
  console.log('ok - agent center panel renders tool capability chips');
}

{
  const panel = new AgentCenterPanel();
  panel.view = {
    safety: {
      sessionGate: {
        enabled: false,
        allowedTools: ['contact_profile.list'],
        networkAllowed: false,
        realRunnerAllowed: false,
        writesChat: false,
      },
      providerTools: { enabled: false, allowedTools: ['contact_profile.list'] },
      permissionRules: [],
    },
  };
  const html = panel.renderSafety();
  assert.match(html, /启用当前会话 Gate/);
  assert.match(html, /data-session-gate-action="enable"/);
  assert.match(html, /不会自动续跑 provider/);
  assert.match(html, /writes chat blocked/);
  assert.match(html, /contact_profile\.list/);
  console.log('ok - agent center safety renders session gate controls and execution boundaries');
}

{
  const panel = new AgentCenterPanel();
  panel.view = {
    safety: {
      sessionGate: {
        enabled: true,
        allowedTools: ['contact_profile.list'],
        networkAllowed: false,
        realRunnerAllowed: false,
        writesChat: false,
      },
      providerTools: { enabled: false, allowedTools: ['contact_profile.list'] },
      permissionRules: [],
    },
  };
  const html = panel.renderSafety();
  assert.match(html, /关闭当前会话 Gate/);
  assert.match(html, /data-session-gate-action="disable"/);
  assert.match(html, /当前会话允许白名单工具进入待确认执行链路/);
  console.log('ok - agent center safety renders the enabled session gate state');
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
