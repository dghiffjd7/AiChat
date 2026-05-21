import {
  AGENT_PERMISSION_DECISIONS,
  normalizeAgentPermissionDecision,
} from './agent-permissions.js';

export const PROVIDER_TOOL_PERMISSION_ACTIONS = Object.freeze({
  allowOnce: 'allow_once',
  deny: 'deny',
  rememberAllow: 'remember_allow',
});

const ACTION_SET = new Set(Object.values(PROVIDER_TOOL_PERMISSION_ACTIONS));

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const list = value => (Array.isArray(value) ? value : [value])
  .map(item => trim(item))
  .filter(Boolean);

const readFirstCheckContext = (request = {}) => {
  const checks = Array.isArray(request.checks) ? request.checks : [];
  return checks.find(check => isPlainObject(check?.context))?.context || {};
};

export const normalizeProviderToolPermissionAction = (action = '', fallback = PROVIDER_TOOL_PERMISSION_ACTIONS.deny) => {
  const token = trim(action).toLowerCase();
  if (ACTION_SET.has(token)) return token;
  if (token === 'allow' || token === 'once') return PROVIDER_TOOL_PERMISSION_ACTIONS.allowOnce;
  if (token === 'remember' || token === 'remember_rule' || token === 'always_allow') {
    return PROVIDER_TOOL_PERMISSION_ACTIONS.rememberAllow;
  }
  return ACTION_SET.has(fallback) ? fallback : PROVIDER_TOOL_PERMISSION_ACTIONS.deny;
};

export const buildProviderToolPermissionPromptMessage = (request = {}) => {
  const context = readFirstCheckContext(request);
  const toolName = trim(request.toolName || context.toolName, 'unknown tool');
  const permissions = list(request.permissions).join(', ') || '-';
  const riskLevel = trim(request.riskLevel, 'low');
  let argsPreview = '';
  if (request.argsPreview !== undefined) {
    try {
      argsPreview = JSON.stringify(request.argsPreview);
    } catch {
      argsPreview = String(request.argsPreview || '');
    }
  }
  const lines = [
    `Tool: ${toolName}`,
    `Permissions: ${permissions}`,
    `Risk: ${riskLevel}`,
  ];
  if (argsPreview) {
    lines.push(`Args: ${argsPreview.length > 240 ? `${argsPreview.slice(0, 240)}...` : argsPreview}`);
  }
  return lines.join('\n');
};

export const buildProviderToolPermissionRule = (request = {}, {
  decision = AGENT_PERMISSION_DECISIONS.allow,
  layer = 'session',
  sessionId = '',
  reason = 'remembered provider tool permission',
} = {}) => {
  const context = readFirstCheckContext(request);
  const permissions = list(request.permissions);
  return {
    layer,
    decision: normalizeAgentPermissionDecision(decision, AGENT_PERMISSION_DECISIONS.allow),
    toolName: trim(request.toolName || context.toolName, '*'),
    permission: permissions.length === 1 ? permissions[0] : '*',
    source: trim(context.source || request.source, '*'),
    sessionId: trim(sessionId || context.sessionId, '*'),
    agentId: trim(context.agentId, '*'),
    pluginId: trim(context.pluginId, '*'),
    roleCardId: trim(context.roleCardId, '*'),
    reason,
  };
};

export const applyProviderToolPermissionAction = (action = '', request = {}, {
  permissionEvaluator = null,
  sessionId = '',
  layer = 'session',
} = {}) => {
  const normalizedAction = normalizeProviderToolPermissionAction(action);
  if (normalizedAction === PROVIDER_TOOL_PERMISSION_ACTIONS.allowOnce) {
    return {
      decision: AGENT_PERMISSION_DECISIONS.allow,
      action: normalizedAction,
    };
  }
  if (normalizedAction === PROVIDER_TOOL_PERMISSION_ACTIONS.rememberAllow) {
    const rule = buildProviderToolPermissionRule(request, {
      decision: AGENT_PERMISSION_DECISIONS.allow,
      layer,
      sessionId,
    });
    const savedRule = typeof permissionEvaluator?.addRule === 'function'
      ? permissionEvaluator.addRule(rule)
      : rule;
    return {
      decision: AGENT_PERMISSION_DECISIONS.allow,
      action: normalizedAction,
      rule: savedRule,
    };
  }
  return {
    decision: AGENT_PERMISSION_DECISIONS.deny,
    action: PROVIDER_TOOL_PERMISSION_ACTIONS.deny,
  };
};
