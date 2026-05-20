export const AGENT_PERMISSION_DECISIONS = Object.freeze({
  allow: 'allow',
  deny: 'deny',
  ask: 'ask',
});

export const AGENT_PERMISSION_LAYERS = Object.freeze([
  'default',
  'plugin',
  'agent',
  'session',
  'roleCard',
  'global',
]);

const DECISION_SET = new Set(Object.values(AGENT_PERMISSION_DECISIONS));
const LAYER_PRIORITY = new Map(AGENT_PERMISSION_LAYERS.map((layer, index) => [layer, index]));

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const list = value => (Array.isArray(value) ? value : [value])
  .map(item => trim(item))
  .filter(Boolean);

export const normalizeAgentPermissionDecision = (value = '', fallback = AGENT_PERMISSION_DECISIONS.ask) => {
  const token = trim(value).toLowerCase();
  if (DECISION_SET.has(token)) return token;
  return DECISION_SET.has(fallback) ? fallback : AGENT_PERMISSION_DECISIONS.ask;
};

export const normalizeAgentPermissionLayer = (value = '', fallback = 'default') => {
  const raw = trim(value, fallback);
  const exact = AGENT_PERMISSION_LAYERS.find(layer => layer === raw);
  if (exact) return exact;
  const lower = raw.toLowerCase();
  if (lower === 'rolecard' || lower === 'role_card' || lower === 'character') return 'roleCard';
  if (lower === 'global') return 'global';
  if (lower === 'session') return 'session';
  if (lower === 'agent') return 'agent';
  if (lower === 'plugin') return 'plugin';
  return fallback;
};

export const normalizeAgentPermissionRule = (rule = {}, index = 0) => {
  const src = isPlainObject(rule) ? rule : {};
  return {
    id: trim(src.id, `rule-${index}`),
    layer: normalizeAgentPermissionLayer(src.layer, 'default'),
    decision: normalizeAgentPermissionDecision(src.decision || src.effect, AGENT_PERMISSION_DECISIONS.ask),
    toolName: trim(src.toolName || src.tool || '*', '*'),
    permission: trim(src.permission || '*', '*'),
    source: trim(src.source || '*', '*'),
    sessionId: trim(src.sessionId || '*', '*'),
    roleCardId: trim(src.roleCardId || src.characterId || '*', '*'),
    agentId: trim(src.agentId || '*', '*'),
    pluginId: trim(src.pluginId || '*', '*'),
    reason: trim(src.reason),
    priority: Number.isFinite(Number(src.priority)) ? Number(src.priority) : 0,
    index,
  };
};

const wildcardToRegExp = (pattern = '*') => {
  const raw = trim(pattern, '*');
  if (raw === '*') return /^.*$/;
  const escaped = raw.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
};

export const matchesAgentPermissionPattern = (value = '', pattern = '*') =>
  wildcardToRegExp(pattern).test(trim(value));

const ruleMatchesContext = (rule, context = {}) => {
  if (!matchesAgentPermissionPattern(context.toolName || '', rule.toolName)) return false;
  if (!matchesAgentPermissionPattern(context.permission || '', rule.permission)) return false;
  if (!matchesAgentPermissionPattern(context.source || '', rule.source)) return false;
  if (!matchesAgentPermissionPattern(context.sessionId || '', rule.sessionId)) return false;
  if (!matchesAgentPermissionPattern(context.roleCardId || '', rule.roleCardId)) return false;
  if (!matchesAgentPermissionPattern(context.agentId || '', rule.agentId)) return false;
  if (!matchesAgentPermissionPattern(context.pluginId || '', rule.pluginId)) return false;
  return true;
};

const compareRules = (a, b) => {
  const layerDelta = (LAYER_PRIORITY.get(a.layer) ?? 0) - (LAYER_PRIORITY.get(b.layer) ?? 0);
  if (layerDelta) return layerDelta;
  const priorityDelta = Number(a.priority || 0) - Number(b.priority || 0);
  if (priorityDelta) return priorityDelta;
  return Number(a.index || 0) - Number(b.index || 0);
};

export const evaluateAgentPermission = ({
  rules = [],
  defaultDecision = AGENT_PERMISSION_DECISIONS.ask,
  context = {},
} = {}) => {
  const normalizedRules = (Array.isArray(rules) ? rules : [])
    .map(normalizeAgentPermissionRule);
  const normalizedContext = {
    toolName: trim(context.toolName),
    permission: trim(context.permission),
    source: trim(context.source),
    sessionId: trim(context.sessionId),
    roleCardId: trim(context.roleCardId),
    agentId: trim(context.agentId),
    pluginId: trim(context.pluginId),
  };
  const matches = normalizedRules
    .filter(rule => ruleMatchesContext(rule, normalizedContext))
    .sort(compareRules);
  const winner = matches[matches.length - 1] || null;
  return {
    decision: winner
      ? winner.decision
      : normalizeAgentPermissionDecision(defaultDecision, AGENT_PERMISSION_DECISIONS.ask),
    rule: winner,
    matchedRules: matches,
    context: normalizedContext,
    reason: winner?.reason || '',
  };
};

export const createAgentPermissionEvaluator = ({
  rules = [],
  defaultDecision = AGENT_PERMISSION_DECISIONS.ask,
} = {}) => {
  let currentRules = (Array.isArray(rules) ? rules : []).map(normalizeAgentPermissionRule);

  const setRules = (nextRules = []) => {
    currentRules = (Array.isArray(nextRules) ? nextRules : []).map(normalizeAgentPermissionRule);
    return currentRules.slice();
  };

  const addRule = (rule = {}) => {
    const normalized = normalizeAgentPermissionRule(rule, currentRules.length);
    currentRules.push(normalized);
    return normalized;
  };

  const evaluate = (context = {}) => evaluateAgentPermission({
    rules: currentRules,
    defaultDecision,
    context,
  });

  const evaluateTool = (tool = {}, context = {}) => {
    const permissions = list(tool.permissions);
    if (!permissions.length) {
      return {
        decision: AGENT_PERMISSION_DECISIONS.allow,
        checks: [],
      };
    }
    const checks = permissions.map(permission => evaluate({
      ...context,
      toolName: context.toolName || tool.name,
      permission,
      source: context.source || tool.source || '',
    }));
    if (checks.some(check => check.decision === AGENT_PERMISSION_DECISIONS.deny)) {
      return { decision: AGENT_PERMISSION_DECISIONS.deny, checks };
    }
    if (checks.some(check => check.decision === AGENT_PERMISSION_DECISIONS.ask)) {
      return { decision: AGENT_PERMISSION_DECISIONS.ask, checks };
    }
    return { decision: AGENT_PERMISSION_DECISIONS.allow, checks };
  };

  return {
    addRule,
    evaluate,
    evaluateTool,
    getRules: () => currentRules.slice(),
    setRules,
  };
};
