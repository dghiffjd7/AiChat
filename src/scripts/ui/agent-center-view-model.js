import { buildAgentRunListView } from '../agent/agent-run-view-model.js';

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

const toFiniteNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeLimit = (value, fallback = 50, max = 200) => {
  const numeric = Math.trunc(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.min(max, numeric);
};

const normalizePendingPermission = (entry = {}) => {
  const src = isPlainObject(entry) ? entry : {};
  return {
    kind: 'tool_permission',
    id: trim(src.id),
    status: trim(src.status, 'pending'),
    toolName: trim(src.toolName || src.request?.toolName || src.toolCall?.toolName, 'tool'),
    sessionId: trim(src.sessionId || src.interaction?.sessionId),
    source: trim(src.source, 'provider-tool-permission'),
    riskLevel: trim(src.riskLevel || src.request?.riskLevel, 'low'),
    permissions: list(src.permissions?.length ? src.permissions : src.request?.permissions),
    createdAt: toFiniteNumber(src.createdAt, 0),
    expiresAt: toFiniteNumber(src.expiresAt, 0),
    reason: trim(src.reason),
    resumeStatus: trim(src.resumeStatus, 'idle'),
    continuationStatus: trim(src.continuationStatus, 'idle'),
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
} = {}) => {
  const gate = isPlainObject(sessionGate) ? sessionGate : {};
  const experiment = isPlainObject(experimentStatus) ? experimentStatus : {};
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
  const safety = normalizeSafety({ sessionGate, experimentStatus, permissionRules });
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
