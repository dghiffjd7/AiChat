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

const normalizeTool = (tool = {}) => {
  const src = isPlainObject(tool) ? tool : {};
  return {
    name: trim(src.name, 'tool'),
    title: trim(src.title || src.label, trim(src.name, 'tool')),
    description: trim(src.description),
    source: trim(src.source, 'internal'),
    riskLevel: trim(src.riskLevel || src.risk, 'low'),
    permissions: list(src.permissions),
    executionMode: trim(src.executionMode, 'sequential'),
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
  if (tab.id === 'activity') count = Number(runView?.meta?.active || 0);
  if (tab.id === 'tools') count = tools.length;
  if (tab.id === 'safety') count = 0;
  return { ...tab, count };
});

export const buildAgentCenterView = ({
  pendingPermissions = [],
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
      activeRuns: Number(runView?.meta?.active || 0),
      failedRuns: Number(runView?.meta?.failures || 0),
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
