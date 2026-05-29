import { buildAgentRunListView } from '../agent/agent-run-view-model.js';
import { buildChatEmitCommitPreview } from '../agent/tools/chat-emit-commit-plan.js';

export const AGENT_CENTER_TABS = Object.freeze([
  { id: 'pending', label: '待确认' },
  { id: 'activity', label: '活动' },
  { id: 'tools', label: '工具' },
  { id: 'safety', label: '安全' },
]);

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const list = value => (Array.isArray(value) ? value : [value])
  .map(item => trim(item))
  .filter(Boolean);

const truncate = (value = '', maxLength = 160) => {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  const limit = Math.max(20, Math.trunc(Number(maxLength) || 160));
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
};

const toFiniteNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeLimit = (value, fallback = 50, max = 200) => {
  const numeric = Math.trunc(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.min(max, numeric);
};

const readArgsPreview = (src = {}) => {
  const candidates = [
    src.argsPreview,
    src.request?.argsPreview,
    src.toolCall?.arguments,
  ];
  return candidates.find(isPlainObject) || {};
};

const buildChatEmitPendingPreview = (toolName = '', args = {}) => {
  const name = trim(toolName);
  if (!name.startsWith('chat.emit_')) return null;
  const src = isPlainObject(args) ? args : {};
  if (name === 'chat.emit_private') {
    return {
      kind: '私聊候选',
      target: trim(src.targetName || src.targetId),
      speaker: trim(src.speakerName || src.speakerId),
      time: trim(src.time),
      contentPreview: truncate(src.content),
    };
  }
  if (name === 'chat.emit_group') {
    return {
      kind: src.system === true ? '群系统候选' : '群聊候选',
      target: trim(src.groupName || src.groupId),
      speaker: trim(src.speakerName || src.speakerId),
      time: trim(src.time),
      contentPreview: truncate(src.content),
    };
  }
  if (name === 'chat.emit_moment_comment') {
    return {
      kind: '动态评论候选',
      target: trim(src.momentId),
      speaker: trim(src.author),
      time: trim(src.time),
      contentPreview: truncate(src.content),
    };
  }
  if (name === 'chat.emit_moment_post') {
    return {
      kind: '动态发布候选',
      target: trim(src.momentId || src.author),
      speaker: trim(src.author),
      time: trim(src.time),
      contentPreview: truncate(src.content),
    };
  }
  return null;
};

const summarizeChatEmitCommitResult = (result = {}) => {
  const refs = isPlainObject(result?.refs) ? result.refs : {};
  const createdMessages = Array.isArray(refs.createdMessages) ? refs.createdMessages.length : 0;
  const createdMessageIds = Array.isArray(refs.createdMessageIds) ? refs.createdMessageIds.length : 0;
  const createdComments = Array.isArray(refs.createdCommentIds) ? refs.createdCommentIds.length : 0;
  const createdMoments = Array.isArray(refs.createdMomentIds) ? refs.createdMomentIds.length : 0;
  const parts = [];
  if (createdMessages || createdMessageIds) parts.push(`消息 ${createdMessages || createdMessageIds}`);
  if (createdComments) parts.push(`评论 ${createdComments}`);
  if (createdMoments) parts.push(`动态 ${createdMoments}`);
  return parts.join(' · ');
};

const buildChatEmitCommitState = (entry = {}, chatEmitPreview = null, chatEmitCommitPreview = null) => {
  if (!chatEmitPreview && !chatEmitCommitPreview) return null;
  const commitStatus = trim(entry.commitStatus, 'idle');
  const undoStatus = trim(entry.commitUndoStatus, 'idle');
  const resumeStatus = trim(entry.resumeStatus, 'idle');
  const commitResult = isPlainObject(entry.commitResult) ? entry.commitResult : null;
  const undoResult = isPlainObject(entry.commitUndoResult) ? entry.commitUndoResult : null;
  return {
    status: commitStatus,
    undoStatus,
    canCommit: resumeStatus === 'succeeded' && commitStatus !== 'running' &&
      commitStatus !== 'committed' && commitStatus !== 'undone',
    canUndo: commitStatus === 'committed' && undoStatus !== 'running' && undoStatus !== 'undone',
    resultSummary: summarizeChatEmitCommitResult(commitResult),
    undoSummary: summarizeChatEmitCommitResult(undoResult),
    message: trim(commitResult?.displayMessage || commitResult?.reason),
    undoMessage: trim(undoResult?.displayMessage || undoResult?.reason),
    errorMessage: trim(entry.commitErrorMessage),
    undoErrorMessage: trim(entry.commitUndoErrorMessage),
  };
};

const normalizePendingPermission = (entry = {}) => {
  const src = isPlainObject(entry) ? entry : {};
  const toolName = trim(src.toolName || src.request?.toolName || src.toolCall?.toolName, 'tool');
  const argsPreview = readArgsPreview(src);
  const chatEmitPreview = buildChatEmitPendingPreview(toolName, argsPreview);
  const chatEmitCommitPreview = buildChatEmitCommitPreview({
    toolName,
    args: argsPreview,
    sessionId: trim(src.sessionId || src.interaction?.sessionId),
  });
  return {
    kind: 'tool_permission',
    id: trim(src.id),
    status: trim(src.status, 'pending'),
    toolName,
    sessionId: trim(src.sessionId || src.interaction?.sessionId),
    source: trim(src.source, 'provider-tool-permission'),
    riskLevel: trim(src.riskLevel || src.request?.riskLevel, 'low'),
    permissions: list(src.permissions?.length ? src.permissions : src.request?.permissions),
    createdAt: toFiniteNumber(src.createdAt, 0),
    expiresAt: toFiniteNumber(src.expiresAt, 0),
    reason: trim(src.reason),
    resumeStatus: trim(src.resumeStatus, 'idle'),
    continuationStatus: trim(src.continuationStatus, 'idle'),
    chatEmitPreview,
    chatEmitCommitPreview,
    chatEmitCommit: buildChatEmitCommitState(src, chatEmitPreview, chatEmitCommitPreview),
  };
};

const summarizeProfileCandidate = (profile = null) => {
  const src = isPlainObject(profile) ? profile : {};
  const parts = [];
  if (src.displayName) parts.push(trim(src.displayName));
  const traits = Array.isArray(src.stable_traits) ? src.stable_traits : [];
  const focus = Array.isArray(src.interaction_focus) ? src.interaction_focus : [];
  if (traits.length) parts.push(`特征 ${traits.length}`);
  if (focus.length) parts.push(`互动重点 ${focus.length}`);
  return parts.filter(Boolean).join(' · ');
};

const normalizeContactProfilePendingUpdate = (entry = {}) => {
  const src = isPlainObject(entry) ? entry : {};
  const contactId = trim(src.contactId || src.contact_id || src.profile?.contactId || src.profile?.id);
  return {
    kind: 'contact_profile_update',
    id: trim(src.id),
    status: trim(src.status, 'pending'),
    toolName: '联系人画像更新',
    sessionId: contactId,
    source: 'contact-profiler-agent',
    riskLevel: 'medium',
    permissions: ['storage:write'],
    createdAt: toFiniteNumber(src.createdAt || src.created_at, 0),
    expiresAt: 0,
    reason: trim(src.reason),
    resumeStatus: 'idle',
    continuationStatus: 'idle',
    contactId,
    profileSummary: summarizeProfileCandidate(src.profile),
  };
};

const normalizeTool = (tool = {}) => {
  const src = isPlainObject(tool) ? tool : {};
  const capabilities = isPlainObject(src.capabilities) ? src.capabilities : {};
  return {
    name: trim(src.name, 'tool'),
    title: trim(src.title || src.label, trim(src.name, 'tool')),
    description: trim(src.description),
    source: trim(src.source, 'internal'),
    riskLevel: trim(src.riskLevel || src.risk, 'low'),
    permissions: list(src.permissions),
    executionMode: trim(src.executionMode, 'sequential'),
    capabilities: {
      read: capabilities.read === true,
      write: capabilities.write === true,
      network: capabilities.network === true,
      cost: trim(capabilities.cost, 'none'),
      undo: trim(capabilities.undo, 'none'),
      modelContext: trim(capabilities.modelContext, 'none'),
      confirmation: trim(capabilities.confirmation, 'allow_once'),
    },
  };
};

const normalizeSafety = ({
  sessionGate = null,
  experimentStatus = null,
  permissionRules = [],
  continuationCommitPolicy = null,
} = {}) => {
  const gate = isPlainObject(sessionGate) ? sessionGate : {};
  const experiment = isPlainObject(experimentStatus) ? experimentStatus : {};
  const policy = isPlainObject(continuationCommitPolicy) ? continuationCommitPolicy : {};
  return {
    sessionGate: {
      enabled: gate.enabled === true,
      networkAllowed: gate.networkAllowed === true,
      realRunnerAllowed: gate.realRunnerAllowed === true,
      source: trim(gate.source),
      allowedTools: list(gate.allowedTools),
    },
    providerTools: {
      enabled: experiment.enabled === true,
      allowedTools: list(experiment.allowedTools),
    },
    permissionRules: Array.isArray(permissionRules) ? permissionRules.slice() : [],
    continuationCommitPolicy: {
      defaultStrategy: trim(policy.defaultStrategy, 'preview_only'),
      strategies: list(policy.strategies),
    },
  };
};

const buildTabs = ({
  pending = [],
  runView = {},
  tools = [],
} = {}) => AGENT_CENTER_TABS.map((tab) => {
  let count = 0;
  if (tab.id === 'pending') count = pending.filter(item => item.status === 'pending').length;
  if (tab.id === 'activity') count = Number(runView?.meta?.scopedActive ?? runView?.meta?.active ?? 0);
  if (tab.id === 'tools') count = tools.length;
  if (tab.id === 'safety') count = 0;
  return { ...tab, count };
});

export const buildAgentCenterView = ({
  pendingPermissions = [],
  contactProfilePendingUpdates = [],
  agentRunView = null,
  agentRuns = [],
  agentRunEvents = [],
  tools = [],
  permissionRules = [],
  sessionGate = null,
  experimentStatus = null,
  continuationCommitPolicy = null,
  limit = 50,
} = {}) => {
  const pending = (Array.isArray(pendingPermissions) ? pendingPermissions : [])
    .map(normalizePendingPermission)
    .concat((Array.isArray(contactProfilePendingUpdates) ? contactProfilePendingUpdates : [])
      .map(normalizeContactProfilePendingUpdate))
    .sort((a, b) => toFiniteNumber(b.createdAt, 0) - toFiniteNumber(a.createdAt, 0));
  const runView = isPlainObject(agentRunView)
    ? agentRunView
    : buildAgentRunListView(agentRuns, {
      events: agentRunEvents,
      limit: normalizeLimit(limit),
    });
  const normalizedTools = (Array.isArray(tools) ? tools : [])
    .map(normalizeTool)
    .sort((a, b) => a.name.localeCompare(b.name));
  const safety = normalizeSafety({
    sessionGate,
    experimentStatus,
    permissionRules,
    continuationCommitPolicy,
  });
  const tabs = buildTabs({ pending, runView, tools: normalizedTools });
  return {
    tabs,
    meta: {
      pending: pending.filter(item => item.status === 'pending').length,
      activeRuns: Number(runView?.meta?.scopedActive ?? runView?.meta?.active ?? 0),
      failedRuns: Number(runView?.meta?.scopedFailures ?? runView?.meta?.failures ?? 0),
      unreadFailedRuns: Number(runView?.meta?.scopedUnreadFailures ?? runView?.meta?.unreadFailures ?? runView?.meta?.scopedFailures ?? runView?.meta?.failures ?? 0),
      newestFailureAt: Number(runView?.meta?.scopedNewestFailureAt ?? runView?.meta?.newestFailureAt ?? 0),
      tools: normalizedTools.length,
      providerToolsEnabled: safety.providerTools.enabled,
      sessionGateEnabled: safety.sessionGate.enabled,
    },
    pending,
    activity: {
      meta: runView?.meta || {},
      filters: runView?.filters || {},
      runs: Array.isArray(runView?.runs) ? runView.runs : [],
    },
    tools: normalizedTools,
    safety,
  };
};
