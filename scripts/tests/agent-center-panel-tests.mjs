import assert from 'node:assert/strict';

import {
  AgentCenterPanel,
  formatAgentCenterExportText,
} from '../../src/scripts/ui/agent-center-panel.js';

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
      getAgentFeatureSettings: () => ({
        features: {
          reply_check: { enabled: true },
        },
      }),
      listAgentPermissionRules: () => [{ toolName: 'contact_profile.list' }],
      getProviderToolSessionGate: () => ({ enabled: false, allowedTools: ['contact_profile.list'] }),
      getProviderToolExperimentStatus: () => ({ enabled: false, allowedTools: ['contact_profile.list'] }),
      getProviderContinuationCommitPolicy: () => ({ defaultStrategy: 'preview_only', strategies: ['preview_only', 'append_to_previous_bubble'] }),
      listAgentModelProfiles: () => [
        { id: 'profile-a', name: '轻量检查', provider: 'openrouter', model: 'model-a' },
      ],
    }),
  });
  const view = await panel.collectView();
  assert.equal(view.meta.pending, 2);
  assert.equal(view.meta.activeRuns, 1);
  assert.equal(view.meta.enabledAgents, 1);
  assert.equal(view.meta.tools, 1);
  assert.equal(view.pending[0].kind, 'contact_profile_update');
  assert.equal(view.agents.find(agent => agent.id === 'reply_check').enabled, true);
  assert.equal(view.agentModelProfiles[0].label, '轻量检查 · openrouter / model-a');
  assert.equal(view.safety.permissionRules.length, 1);
  console.log('ok - agent center panel collects existing agent debug registry actions into a user view');
}

{
  const panel = new AgentCenterPanel();
  panel.view = {
    agents: [
      {
        id: 'reply_check',
        title: '检查回复格式',
        summary: 'AI 回复后检查私聊、群聊、动态等格式问题，结果显示在消息旁。',
        detail: ['检查私聊、群聊、动态等输出格式。'],
        enabled: false,
        implemented: true,
        supportsModel: true,
        supportsTriggerMode: true,
        modelMode: 'profile',
        modelProfileId: 'profile-a',
        modelLabel: '轻量检查 · openrouter / model-a',
        triggerLabel: '自动触发',
      },
      {
        id: 'text_completion',
        title: '文本补全',
        summary: '为输入和选中文本提供写作补全建议。',
        enabled: false,
        implemented: false,
        supportsModel: true,
        modelLabel: '不调用模型',
      },
    ],
    agentModelProfiles: [
      { id: 'profile-a', label: '轻量检查 · openrouter / model-a' },
    ],
  };
  const html = panel.renderAgents();
  assert.match(html, /检查回复格式/);
  assert.match(html, /AI 回复后检查私聊、群聊、动态等格式问题/);
  assert.match(html, /data-agent-feature-action="enable"/);
  assert.match(html, /data-agent-feature-id="reply_check"/);
  assert.match(html, /data-agent-feature-model-select="reply_check"/);
  assert.match(html, /data-agent-feature-model-button="reply_check"/);
  assert.match(html, /data-agent-feature-model-manage="reply_check"/);
  assert.match(html, /world-app-select-btn/);
  assert.doesNotMatch(html, /data-agent-feature-model="reply_check"/);
  assert.match(html, /轻量检查 · openrouter \/ model-a/);
  assert.match(html, /value="profile:profile-a" selected/);
  assert.match(html, /data-agent-feature-trigger="reply_check"/);
  assert.match(html, /自动触发/);
  assert.match(html, /文本补全/);
  assert.match(html, /disabled/);
  assert.match(html, /规划中/);
  console.log('ok - agent center panel renders available agent feature cards');
}

{
  let modelPayload = null;
  const panel = new AgentCenterPanel({
    getActions: () => ({
      setAgentFeatureModel: payload => {
        modelPayload = payload;
        return { ok: true };
      },
    }),
  });
  panel.view = {
    agents: [{
      id: 'reply_check',
      title: '检查回复格式',
      enabled: true,
      implemented: true,
      supportsModel: true,
      modelMode: 'none',
    }],
  };
  panel.refresh = async () => {};
  await panel.handleAgentFeatureModelSelect('reply_check', 'profile:profile-a');
  assert.deepEqual(modelPayload, {
    id: 'reply_check',
    modelMode: 'profile',
    modelProfileId: 'profile-a',
  });
  console.log('ok - agent center agent model selector updates feature model');
}

{
  let triggerPayload = null;
  let triggerChoice = null;
  const panel = new AgentCenterPanel({
    choice: async (options) => {
      triggerChoice = options;
      return 'manual';
    },
    getActions: () => ({
      setAgentFeatureTriggerMode: payload => {
        triggerPayload = payload;
        return { ok: true };
      },
    }),
  });
  panel.view = {
    agents: [{
      id: 'reply_check',
      title: '检查回复格式',
      enabled: true,
      implemented: true,
      supportsTriggerMode: true,
      triggerMode: 'auto',
    }],
  };
  panel.refresh = async () => {};
  await panel.handleAgentFeatureTriggerMode('reply_check');
  assert.deepEqual(triggerChoice.actions.map(action => action.id), ['auto', 'manual']);
  assert.deepEqual(triggerPayload, {
    id: 'reply_check',
    triggerMode: 'manual',
  });
  console.log('ok - agent center agent trigger selector updates feature trigger mode');
}

{
  let updatePayload = null;
  let guideChoice = null;
  let openedConfig = null;
  const panel = new AgentCenterPanel({
    confirm: async () => true,
    choice: async (options) => {
      guideChoice = options;
      return 'manage_api';
    },
    openConfig: (options = {}) => {
      openedConfig = options;
    },
    getActions: () => ({
      setAgentFeatureEnabled: payload => {
        updatePayload = payload;
        return { ok: true };
      },
    }),
  });
  panel.view = {
    agents: [{
      id: 'reply_check',
      title: '检查回复格式',
      summary: 'AI 回复后检查格式问题。',
      enabled: false,
      implemented: true,
      supportsModel: true,
      modelMode: 'none',
    }],
  };
  panel.refresh = async () => {};
  await panel.handleAgentFeatureToggle('enable', 'reply_check');
  assert.deepEqual(updatePayload, {
    id: 'reply_check',
    enabled: true,
    reason: 'agent center feature toggle',
  });
  assert.equal(guideChoice.title, '配置检查模型');
  assert.deepEqual(guideChoice.actions.map(action => action.id), ['select_model', 'manage_api', 'keep_local']);
  assert.equal(openedConfig.tab, 'chat');
  console.log('ok - agent center prompts model configuration when enabling reply check with no model');
}

{
  let refreshed = 0;
  const panel = new AgentCenterPanel();
  panel.activeTab = 'agents';
  panel.overlayElement = { style: { display: 'flex' } };
  panel.refresh = async () => {
    refreshed += 1;
  };
  await panel.handleConfigProfileChanged({ detail: { tab: 'chat' } });
  assert.equal(refreshed, 1);
  await panel.handleConfigProfileChanged({ detail: { tab: 'image' } });
  assert.equal(refreshed, 1);
  panel.overlayElement.style.display = 'none';
  await panel.handleConfigProfileChanged({ detail: { tab: 'chat' } });
  assert.equal(refreshed, 1);
  console.log('ok - agent center refreshes model profiles when visible chat API config changes');
}

{
  let updatePayload = null;
  let gatePayload = null;
  const panel = new AgentCenterPanel({
    confirm: async () => true,
    getActions: () => ({
      setAgentFeatureEnabled: payload => {
        updatePayload = payload;
        return { ok: true };
      },
      setProviderToolSessionGate: payload => {
        gatePayload = payload;
        return { ok: true };
      },
    }),
  });
  panel.view = {
    agents: [{
      id: 'write_preview',
      title: '预览记忆和变量变更',
      summary: 'AI 请求修改记忆、变量或世界书时，先显示可撤销预览。',
      enabled: false,
      implemented: true,
    }],
    safety: {
      sessionGate: {
        enabled: false,
        allowedTools: ['contact_profile.list'],
      },
    },
  };
  panel.refresh = async () => {};
  await panel.handleAgentFeatureToggle('enable', 'write_preview');
  assert.deepEqual(updatePayload, {
    id: 'write_preview',
    enabled: true,
    reason: 'agent center feature toggle',
  });
  assert.equal(gatePayload.enabled, true);
  assert.deepEqual(gatePayload.allowedTools, [
    'contact_profile.list',
    'memory.preview_actions',
    'variable.preview_commands',
    'worldbook.preview_actions',
  ]);
  console.log('ok - agent center agent toggle can enable write preview tools as a shortcut');
}

{
  const panel = new AgentCenterPanel();
  panel.view = { pending: [] };
  const html = panel.renderPending();
  assert.match(html, /没有待确认请求/);
  assert.match(html, /AI 请求工具、画像保存或变更提交前/);
  console.log('ok - agent center pending empty state explains when requests appear');
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
  assert.match(html, /执行一次/);
  assert.match(html, /data-provider-permission-action="allow_once"/);
  assert.match(html, /data-provider-permission-action="deny"/);
  assert.match(html, /data-provider-permission-action="remember_allow"/);
  assert.match(html, /不会重放聊天、不会自动继续生成、不会直接写聊天正文/);
  console.log('ok - agent center panel renders provider tool pending permission actions');
}

{
  const panel = new AgentCenterPanel();
  panel.view = {
    pending: [
      {
        kind: 'tool_permission',
        id: 'worldbook-preview-pending-1',
        status: 'allowed',
        toolName: 'worldbook.preview_actions',
        sessionId: 'contact:firen',
        source: 'provider-tool-permission',
        riskLevel: 'low',
        permissions: ['worldbook.read'],
        resumeStatus: 'succeeded',
        continuationStatus: 'idle',
        writePreview: {
          kind: '世界书写入预览',
          targetLabel: '世界书',
          target: 'world:firen',
          requestSummary: '1 action',
          previewReady: true,
          resultSummary: '变更 1 · 跳过 0 · updated 1',
          rollbackReady: true,
          entries: ['update · e1 · 字段：content'],
          entryOverflow: 0,
        },
      },
    ],
  };
  const html = panel.renderPending();
  assert.match(html, /写入预览：世界书写入预览/);
  assert.match(html, /世界书：world:firen/);
  assert.match(html, /预览结果：变更 1 · 跳过 0 · updated 1/);
  assert.match(html, /撤销记录：已准备好/);
  assert.match(html, /不会写入记忆、变量、世界书或聊天正文/);
  assert.doesNotMatch(html, /提交候选/);
  assert.doesNotMatch(html, /提交变更/);
  console.log('ok - agent center panel renders write preview tool diffs before commit action is ready');
}

{
  const panel = new AgentCenterPanel();
  panel.view = {
    pending: [
      {
        kind: 'tool_permission',
        id: 'chat-emit-pending-1',
        status: 'pending',
        toolName: 'chat.emit_private',
        sessionId: 'contact:firen',
        source: 'provider-tool-permission',
        riskLevel: 'low',
        permissions: ['chat:emit_candidate'],
        resumeStatus: 'idle',
        continuationStatus: 'idle',
        chatEmitPreview: {
          kind: '私聊候选',
          target: '菲伦',
          speaker: '菲伦',
          time: '22:12',
          contentPreview: '今晚别一个人走。',
        },
        chatEmitCommitPreview: {
          effect: '新增 1 条私聊消息到「菲伦」',
          undoSummary: '提交后撤销应删除该新增私聊消息或回滚提交快照',
        },
      },
    ],
  };
  const html = panel.renderPending();
  assert.match(html, /候选预览：私聊候选/);
  assert.match(html, /目标：菲伦/);
  assert.match(html, /说话人：菲伦/);
  assert.match(html, /今晚别一个人走。/);
  assert.match(html, /后续提交预览：新增 1 条私聊消息到「菲伦」/);
  assert.match(html, /撤销边界：提交后撤销应删除该新增私聊消息或回滚提交快照/);
  assert.match(html, /不会直接写聊天正文/);
  assert.doesNotMatch(html, /提交候选/);
  console.log('ok - agent center panel renders chat emit pending previews before approval');
}

{
  const panel = new AgentCenterPanel();
  panel.view = {
    pending: [
      {
        kind: 'tool_permission',
        id: 'chat-emit-pending-2',
        status: 'allowed',
        toolName: 'chat.emit_private',
        sessionId: 'contact:firen',
        source: 'provider-tool-permission',
        riskLevel: 'low',
        permissions: ['chat:emit_candidate'],
        resumeStatus: 'succeeded',
        continuationStatus: 'ready',
        chatEmitPreview: {
          kind: '私聊候选',
          target: '菲伦',
          speaker: '菲伦',
          contentPreview: '今晚别一个人走。',
        },
        chatEmitCommitPreview: {
          effect: '新增 1 条私聊消息到「菲伦」',
          undoSummary: '提交后撤销应删除该新增私聊消息或回滚提交快照',
        },
        chatEmitCommit: {
          status: 'idle',
          undoStatus: 'idle',
          canCommit: true,
          canUndo: false,
        },
      },
    ],
  };
  const html = panel.renderPending();
  assert.match(html, /data-chat-emit-commit-action="commit"/);
  assert.match(html, /data-chat-emit-commit-action="reject"/);
  assert.match(html, /执行/);
  assert.match(html, /打回/);
  assert.doesNotMatch(html, /data-chat-emit-commit-action="undo"/);
  console.log('ok - agent center panel renders explicit chat emit commit action after tool resume');
}

{
  const panel = new AgentCenterPanel();
  panel.view = {
    pending: [
      {
        kind: 'tool_permission',
        id: 'chat-emit-pending-3',
        status: 'allowed',
        toolName: 'chat.emit_private',
        sessionId: 'contact:firen',
        source: 'provider-tool-permission',
        riskLevel: 'low',
        permissions: ['chat:emit_candidate'],
        resumeStatus: 'succeeded',
        continuationStatus: 'ready',
        chatEmitPreview: {
          kind: '私聊候选',
          target: '菲伦',
          speaker: '菲伦',
          contentPreview: '今晚别一个人走。',
        },
        chatEmitCommitPreview: {
          effect: '新增 1 条私聊消息到「菲伦」',
          undoSummary: '提交后撤销应删除该新增私聊消息或回滚提交快照',
        },
        chatEmitCommit: {
          status: 'committed',
          undoStatus: 'idle',
          canCommit: false,
          canUndo: true,
          resultSummary: '消息 1',
          message: '已提交 1 条消息。',
        },
      },
    ],
  };
  const html = panel.renderPending();
  assert.match(html, /提交：已提交/);
  assert.match(html, /提交结果：消息 1/);
  assert.match(html, /提交说明：已提交 1 条消息。/);
  assert.match(html, /data-chat-emit-commit-action="undo"/);
  assert.match(html, /撤销提交/);
  console.log('ok - agent center panel renders explicit chat emit undo action after commit');
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
  assert.equal(confirmOptions.confirmText, '执行一次');
  assert.equal(resolverOptions.id, 'provider-pending-1');
  assert.equal(resolverOptions.action, 'allow_once');
  assert.equal(resolverOptions.reason, 'agent center pending action');
  assert.equal(refreshed, true);
  console.log('ok - agent center provider permission action resolves through debug registry contract');
}

{
  let confirmOptions = null;
  let resolverOptions = null;
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
        id: 'memory-preview-pending-1',
        status: 'pending',
        toolName: 'memory.preview_actions',
        writePreview: {
          kind: '记忆表写入预览',
          targetLabel: '会话',
          target: 'chat:firen',
          requestSummary: '2 actions',
        },
      },
    ],
  };
  panel.refresh = async () => {};
  await panel.handleProviderPermissionAction('allow_once', 'memory-preview-pending-1');
  assert.match(confirmOptions.message, /变更预览/);
  assert.match(confirmOptions.message, /不会写入记忆、变量、世界书或聊天正文/);
  assert.equal(resolverOptions.id, 'memory-preview-pending-1');
  assert.equal(resolverOptions.action, 'allow_once');
  console.log('ok - agent center provider permission action describes write preview safety');
}

{
  let confirmOptions = null;
  let actionOptions = null;
  let refreshed = false;
  const panel = new AgentCenterPanel({
    confirm: async options => {
      confirmOptions = options;
      return true;
    },
    getActions: () => ({
      commitChatEmitPendingPermission: options => {
        actionOptions = options;
        return { ok: true, status: 'committed' };
      },
    }),
  });
  panel.view = {
    pending: [
      {
        kind: 'tool_permission',
        id: 'chat-emit-pending-2',
        toolName: 'chat.emit_private',
      },
    ],
  };
  panel.refresh = async () => {
    refreshed = true;
  };
  await panel.handleChatEmitCommitAction('commit', 'chat-emit-pending-2');
  assert.equal(confirmOptions.confirmText, '执行');
  assert.equal(actionOptions.id, 'chat-emit-pending-2');
  assert.equal(actionOptions.confirmed, true);
  assert.equal(refreshed, true);
  console.log('ok - agent center chat emit commit action requires confirmation and calls debug registry');
}

{
  let confirmOptions = null;
  let actionOptions = null;
  let refreshed = false;
  const panel = new AgentCenterPanel({
    confirm: async options => {
      confirmOptions = options;
      return true;
    },
    getActions: () => ({
      rejectChatEmitPendingCommit: options => {
        actionOptions = options;
        return { ok: true, status: 'skipped' };
      },
    }),
  });
  panel.view = {
    pending: [
      {
        kind: 'tool_permission',
        id: 'chat-emit-pending-reject',
        toolName: 'chat.emit_private',
      },
    ],
  };
  panel.refresh = async () => {
    refreshed = true;
  };
  await panel.handleChatEmitCommitAction('reject', 'chat-emit-pending-reject');
  assert.equal(confirmOptions.confirmText, '打回');
  assert.match(confirmOptions.message, /不会写入聊天或动态/);
  assert.equal(actionOptions.id, 'chat-emit-pending-reject');
  assert.equal(actionOptions.confirmed, true);
  assert.equal(refreshed, true);
  console.log('ok - agent center chat emit reject action marks candidates as handled');
}

{
  const panel = new AgentCenterPanel({
    confirm: async () => true,
    getActions: () => ({
      commitChatEmitPendingPermission: () => ({
        ok: false,
        status: 'blocked',
        reason: 'target_session_not_found',
        message: '找不到候选目标会话，请检查目标名称或 ID 后重试。',
      }),
    }),
  });
  panel.view = {
    pending: [
      {
        kind: 'tool_permission',
        id: 'chat-emit-pending-blocked',
        toolName: 'chat.emit_private',
      },
    ],
  };
  panel.refresh = async () => {};
  await panel.handleChatEmitCommitAction('commit', 'chat-emit-pending-blocked');
  assert.equal(panel.lastError, '找不到候选目标会话，请检查目标名称或 ID 后重试。');
  console.log('ok - agent center chat emit commit action surfaces readable failure messages');
}

{
  let confirmOptions = null;
  let actionOptions = null;
  let refreshed = false;
  const panel = new AgentCenterPanel({
    confirm: async options => {
      confirmOptions = options;
      return true;
    },
    getActions: () => ({
      commitAgentWritePreviewPendingPermission: options => {
        actionOptions = options;
        return { ok: true, status: 'committed' };
      },
    }),
  });
  panel.view = {
    pending: [
      {
        kind: 'tool_permission',
        id: 'variable-preview-pending-1',
        toolName: 'variable.preview_commands',
      },
    ],
  };
  panel.refresh = async () => {
    refreshed = true;
  };
  await panel.handleWritePreviewCommitAction('commit', 'variable-preview-pending-1');
  assert.equal(confirmOptions.confirmText, '执行');
  assert.match(confirmOptions.message, /会写入记忆、变量或世界书/);
  assert.equal(actionOptions.id, 'variable-preview-pending-1');
  assert.equal(actionOptions.confirmed, true);
  assert.equal(refreshed, true);
  console.log('ok - agent center write preview commit action requires confirmation and calls debug registry');
}

{
  let confirmOptions = null;
  let actionOptions = null;
  let refreshed = false;
  const panel = new AgentCenterPanel({
    confirm: async options => {
      confirmOptions = options;
      return true;
    },
    getActions: () => ({
      rejectAgentWritePreviewPendingCommit: options => {
        actionOptions = options;
        return { ok: true, status: 'skipped' };
      },
    }),
  });
  panel.view = {
    pending: [
      {
        kind: 'tool_permission',
        id: 'variable-preview-pending-reject',
        toolName: 'variable.preview_commands',
      },
    ],
  };
  panel.refresh = async () => {
    refreshed = true;
  };
  await panel.handleWritePreviewCommitAction('reject', 'variable-preview-pending-reject');
  assert.equal(confirmOptions.confirmText, '打回');
  assert.match(confirmOptions.message, /不会写入记忆、变量或世界书/);
  assert.equal(actionOptions.id, 'variable-preview-pending-reject');
  assert.equal(actionOptions.confirmed, true);
  assert.equal(refreshed, true);
  console.log('ok - agent center write preview reject action marks candidates as handled');
}

{
  const panel = new AgentCenterPanel({
    confirm: async () => true,
    getActions: () => ({
      commitAgentWritePreviewPendingPermission: () => ({
        ok: false,
        status: 'blocked',
        reason: 'preview_result_missing',
        message: '找不到已生成的变更预览，请先允许一次执行预览。',
      }),
    }),
  });
  panel.view = {
    pending: [
      {
        kind: 'tool_permission',
        id: 'variable-preview-pending-blocked',
        toolName: 'variable.preview_commands',
      },
    ],
  };
  panel.refresh = async () => {};
  await panel.handleWritePreviewCommitAction('commit', 'variable-preview-pending-blocked');
  assert.equal(panel.lastError, '找不到已生成的变更预览，请先允许一次执行预览。');
  console.log('ok - agent center write preview commit action surfaces readable failure messages');
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
  assert.match(html, /查看后会从顶部提醒移除，不会删除活动记录/);
  assert.match(html, /data-failure-read-action="mark"/);
  assert.match(html, /错误：provider unavailable/);
  assert.match(html, /agent-center-card is-failure/);
  console.log('ok - agent center panel renders failed activity filter and error detail');
}

{
  let marked = null;
  const panel = new AgentCenterPanel({
    markFailureSeen: options => {
      marked = options;
    },
  });
  panel.surface = 'moments';
  panel.view = {
    meta: { unreadFailedRuns: 1, newestFailureAt: 5000 },
    activity: {
      meta: { unreadFailures: 1, scopedUnreadFailures: 1, scopedNewestFailureAt: 5000 },
      runs: [],
    },
  };
  panel.render = () => {};
  panel.handleFailureReadAction();
  assert.equal(marked.surface, 'moments');
  assert.equal(marked.at >= 5000, true);
  assert.equal(panel.view.meta.unreadFailedRuns, 0);
  assert.equal(panel.view.activity.meta.unreadFailures, 0);
  assert.equal(panel.view.activity.meta.scopedUnreadFailures, 0);
  console.log('ok - agent center failure read action removes failures from top reminder without deleting activity');
}

{
  let actionPayload = null;
  let confirmOptions = null;
  let refreshed = false;
  const panel = new AgentCenterPanel({
    confirm: async options => {
      confirmOptions = options;
      return true;
    },
    getActions: () => ({
      resolveAgentRunReview: payload => {
        actionPayload = payload;
        return { ok: true, status: 'cancelled' };
      },
    }),
  });
  panel.view = {
    activity: {
      runs: [{
        id: 'run-format-review',
        kind: 'chat_format_guardian',
        title: '聊天格式待确认',
        status: 'waiting_permission',
      }],
    },
  };
  panel.refresh = async () => {
    refreshed = true;
  };
  await panel.handleAgentRunReviewAction('reject', 'run-format-review');
  assert.equal(confirmOptions.confirmText, '打回');
  assert.equal(actionPayload.runId, 'run-format-review');
  assert.equal(actionPayload.decision, 'reject');
  assert.equal(refreshed, true);
  console.log('ok - agent center activity can reject waiting agent runs');
}

{
  const panel = new AgentCenterPanel();
  panel.activeTab = 'activity';
  panel.view = {
    activity: {
      meta: { total: 1, active: 1, failures: 0, statusCounts: { waiting_permission: 1 } },
      runs: [
        {
          id: 'run-format',
          kind: 'chat_format_guardian',
          title: '聊天格式待确认',
          status: 'waiting_permission',
          summary: '1 event draft · 0 errors · 1 warning',
          review: {
            sourceTextKind: 'rawOriginal',
            hasRawOriginal: true,
            eventCount: 1,
            errors: [],
            warnings: ['time is missing'],
            repairCandidate: {
              available: true,
              title: '补齐时间',
              summary: '补齐 1 条缺失时间',
            },
            autoRepair: {
              autoApplyRepair: true,
              attempted: true,
              didAnything: false,
              reason: 'no_events',
              eventCount: 0,
            },
            modelReviewDetail: {
              status: 'needs_repair',
              canRepair: true,
              repairSummary: '补齐结束标签。',
              rawPreview: '{"status":"needs_repair"...',
              rawText: '{"status":"needs_repair","correctedText":"完整模型返回"}',
              correctedText: 'MiPhone_start\nmsg_start\n<{{user}}和好友乙的私聊>\n</{{user}}和好友乙的私聊>',
              linePatches: [{
                startLine: 3,
                endLine: 3,
                reason: '补闭合标签',
                originalLines: ['<{{user}}和好友乙的私聊>'],
                replacementLines: ['<{{user}}和好友乙的私聊>', '</{{user}}和好友乙的私聊>'],
              }],
            },
            actionLabels: ['应用修复', '重试生成', '查看原文'],
          },
        },
      ],
    },
  };
  const html = panel.renderActivity();
  assert.match(html, /data-activity-status="waiting_permission"/);
  assert.match(html, /格式检查：发现 1 条提醒/);
  assert.match(html, /检查原始回复/);
  assert.match(html, /提醒：time is missing/);
  assert.match(html, /修复候选：补齐时间/);
  assert.match(html, /自动应用：自动应用开启 · 已尝试 · 未写入聊天 · no_events/);
  assert.match(html, /可在消息旁处理：应用修复、重试生成、查看原文/);
  assert.match(html, /模型修复返回/);
  assert.match(html, /修复后文本/);
  assert.match(html, /模型原始返回预览/);
  assert.match(html, /点击查看完整/);
  assert.match(html, /完整模型返回/);
  assert.match(html, /补闭合标签/);
  assert.doesNotMatch(html, /replacementText/);
  assert.match(html, /data-agent-run-review-action="reject"/);
  assert.match(html, /打回/);
  console.log('ok - agent center panel renders chat format review details without write actions');
}

{
  const panel = new AgentCenterPanel();
  panel.activeTab = 'activity';
  panel.view = {
    activity: {
      meta: { total: 1, active: 1, failures: 0, statusCounts: { waiting_permission: 1 } },
      runs: [
        {
          id: 'run-body',
          kind: 'chat_body_quality_guardian',
          title: '正文可优化',
          status: 'waiting_permission',
          summary: '1 body quality issue(s)',
          review: {
            type: 'body_quality',
            sourceTextKind: 'rawOriginal',
            hasRawOriginal: true,
            issueCount: 1,
            issues: [{
              title: '连续重复句段',
              summary: '发现 1 行连续重复正文。',
              risk: 'low',
            }],
            patchCandidate: {
              available: true,
              title: '清理重复正文',
              summary: '移除 1 行连续重复',
              risk: 'low',
            },
            actionLabels: ['查看原文', 'Agent Center'],
          },
        },
      ],
    },
  };
  const html = panel.renderActivity();
  assert.match(html, /正文检查：发现 1 个问题/);
  assert.match(html, /检查原始回复/);
  assert.match(html, /问题：连续重复句段/);
  assert.match(html, /优化候选：清理重复正文/);
  assert.match(html, /可在消息旁处理：查看原文、Agent Center/);
  assert.doesNotMatch(html, /replacementText/);
  console.log('ok - agent center panel renders chat body quality review details without write actions');
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
  assert.match(html, /读取联系人画像/);
  assert.match(html, /可读取/);
  assert.match(html, /只读/);
  assert.match(html, /本地执行/);
  assert.match(html, /AI 可请求/);
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
        writePreviewTools: {
          enabled: false,
          activeTools: [],
          availableTools: ['memory.preview_actions', 'variable.preview_commands', 'worldbook.preview_actions'],
        },
      },
      providerTools: { enabled: false, allowedTools: ['contact_profile.list'] },
      permissionRules: [],
      continuationCommitPolicy: { defaultStrategy: 'preview_only' },
    },
  };
  const html = panel.renderSafety();
  assert.match(html, /开启当前会话 Agent 工具/);
  assert.match(html, /data-session-gate-action="enable"/);
  assert.match(html, /不会自动继续生成/);
  assert.match(html, /不会自动写聊天/);
  assert.match(html, /读取联系人列表/);
  assert.match(html, /记忆\/变量\/世界书预览/);
  assert.match(html, /data-write-preview-model-context-action="enable"/);
  assert.match(html, /继续生成后的处理方式/);
  assert.match(html, /data-continuation-policy-strategy="append_to_previous_bubble"/);
  console.log('ok - agent center safety renders session gate controls and execution boundaries');
}

{
  const panel = new AgentCenterPanel();
  panel.view = {
    safety: {
      sessionGate: {
        enabled: true,
        allowedTools: ['contact_profile.list', 'memory.preview_actions', 'variable.preview_commands', 'worldbook.preview_actions'],
        networkAllowed: false,
        realRunnerAllowed: false,
        writesChat: false,
        writePreviewTools: {
          enabled: true,
          activeTools: ['memory.preview_actions', 'variable.preview_commands', 'worldbook.preview_actions'],
          availableTools: ['memory.preview_actions', 'variable.preview_commands', 'worldbook.preview_actions'],
        },
      },
      providerTools: { enabled: false, allowedTools: ['contact_profile.list'] },
      permissionRules: [],
      continuationCommitPolicy: { defaultStrategy: 'append_to_previous_bubble' },
    },
  };
  const html = panel.renderSafety();
  assert.match(html, /关闭当前会话 Agent 工具/);
  assert.match(html, /data-session-gate-action="disable"/);
  assert.match(html, /AI 可以请求已允许的工具/);
  assert.match(html, /data-write-preview-model-context-action="disable"/);
  assert.match(html, /记忆变更预览/);
  assert.match(html, /接到上一气泡/);
  console.log('ok - agent center safety renders the enabled session gate state');
}

{
  const panel = new AgentCenterPanel();
  panel.view = {
    safety: {
      sessionGate: {
        enabled: false,
        allowedTools: [],
        networkAllowed: false,
        realRunnerAllowed: false,
        writesChat: false,
        writePreviewTools: { enabled: false, activeTools: [], availableTools: [] },
      },
      providerTools: { enabled: false, allowedTools: [] },
      permissionRules: [],
      permissionRuleSummary: {
        total: 2,
        decisionCounts: { allow: 1, deny: 1, ask: 0 },
        conflictCount: 1,
        orderText: '全局 > 角色卡 > 当前会话 > Agent > 插件 > 默认',
        tieBreakText: '同层先看优先级，仍相同则以后添加的规则生效。',
        visibleRules: [
          {
            id: 'rule-1',
            layerLabel: '当前会话',
            decision: 'allow',
            decisionLabel: '允许',
            toolName: 'contact_profile.list',
            permission: 'storage',
            source: 'provider-tool-permission',
            sessionId: 'chat:a',
          },
        ],
        overflow: 1,
      },
      continuationCommitPolicy: { defaultStrategy: 'preview_only' },
    },
  };
  const html = panel.renderSafety();
  assert.match(html, /已记住的允许规则/);
  assert.match(html, /优先顺序：全局 &gt; 角色卡 &gt; 当前会话 &gt; Agent &gt; 插件 &gt; 默认/);
  assert.match(html, /同层先看优先级/);
  assert.match(html, /检测到 1 组同范围不同决定/);
  assert.match(html, /读取联系人列表/);
  assert.match(html, /允许 1/);
  assert.match(html, /拒绝 1/);
  assert.match(html, /还有 1 条未显示/);
  console.log('ok - agent center safety explains remembered permission precedence');
}

{
  const text = formatAgentCenterExportText({
    meta: { pending: 1, activeRuns: 0, unreadFailedRuns: 1, tools: 1 },
    pending: [{
      toolName: 'contact_profile.list',
      status: 'pending',
      sessionId: 'chat:a',
      resumeStatus: 'idle',
    }],
    activity: {
      runs: [{
        title: '正文检查',
        kind: 'chat_body_quality_guardian',
        status: 'failed',
        sessionId: 'chat:a',
        summary: '发现问题',
      }],
    },
    agents: [{
      id: 'reply_check',
      title: '检查回复格式',
      enabled: true,
      implemented: true,
      modelLabel: '不调用模型',
    }],
    tools: [{
      name: 'contact_profile.list',
      riskLevel: 'low',
      permissions: ['storage'],
      capabilities: { read: true, write: false, network: false, cost: 'none', undo: 'none', modelContext: 'allowlist', confirmation: 'allow_once' },
    }],
    safety: {
      sessionGate: {
        enabled: true,
        networkAllowed: false,
        realRunnerAllowed: false,
        allowedTools: ['contact_profile.list'],
      },
      permissionRuleSummary: {
        total: 2,
        conflictCount: 1,
        orderText: '全局 > 角色卡 > 当前会话 > Agent > 插件 > 默认',
      },
    },
  });
  assert.match(text, /Agent Center 导出/);
  assert.match(text, /待确认 1/);
  assert.match(text, /读取联系人列表 · 待确认 · 范围：chat:a/);
  assert.match(text, /正文检查 · 失败 · 范围：chat:a · 发现问题/);
  assert.match(text, /检查回复格式 · 已开启 · 可使用 · 模型：不调用模型/);
  assert.match(text, /工具白名单：读取联系人列表/);
  assert.match(text, /规则冲突：1 组/);
  assert.doesNotMatch(text, /rawOriginal|replacementText|runnerFacade/);
  console.log('ok - agent center export text stays user-facing and lightweight');
}

{
  const calls = [];
  const panel = new AgentCenterPanel({
    exportTextFile: async (text, filename, successLabel) => {
      calls.push({ text, filename, successLabel });
      return true;
    },
  });
  panel.view = {
    meta: { pending: 0, activeRuns: 0, unreadFailedRuns: 0, tools: 0 },
    pending: [],
    activity: { runs: [] },
    tools: [],
    safety: { sessionGate: { enabled: false, allowedTools: [] }, permissionRuleSummary: { total: 0 } },
  };
  const ok = await panel.handleExport();
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].filename, /^agent-center-\d{8}-\d{6}\.txt$/);
  assert.equal(calls[0].successLabel, 'Agent Center 已导出');
  assert.match(calls[0].text, /Agent Center 导出/);
  console.log('ok - agent center export action delegates lightweight text export');
}

{
  let saved = null;
  let refreshed = false;
  let confirmOptions = null;
  const panel = new AgentCenterPanel({
    confirm: async options => {
      confirmOptions = options;
      return true;
    },
    getActions: () => ({
      setProviderToolSessionGate: options => {
        saved = options;
        return options;
      },
    }),
  });
  panel.view = {
    safety: {
      sessionGate: {
        enabled: true,
        allowedTools: ['contact_profile.list'],
        networkAllowed: false,
        realRunnerAllowed: false,
        writesChat: false,
      },
    },
  };
  panel.refresh = async () => {
    refreshed = true;
  };
  await panel.handleWritePreviewModelContextAction('enable');
  assert.equal(confirmOptions.confirmText, '加入预览工具');
  assert.equal(saved.enabled, true);
  assert.equal(saved.networkAllowed, false);
  assert.equal(saved.realRunnerAllowed, false);
  assert.deepEqual(saved.allowedTools, [
    'contact_profile.list',
    'memory.preview_actions',
    'variable.preview_commands',
    'worldbook.preview_actions',
  ]);
  assert.equal(refreshed, true);
  console.log('ok - agent center safety toggles write preview model-context tools');
}

{
  let saved = null;
  let refreshed = false;
  const panel = new AgentCenterPanel({
    getActions: () => ({
      setProviderContinuationCommitPolicy: options => {
        saved = options;
        return { defaultStrategy: options.defaultStrategy };
      },
    }),
  });
  panel.refresh = async () => {
    refreshed = true;
  };
  await panel.handleContinuationPolicyAction('append_to_previous_bubble');
  assert.equal(saved.defaultStrategy, 'append_to_previous_bubble');
  assert.equal(refreshed, true);
  console.log('ok - agent center safety updates provider continuation default strategy');
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
