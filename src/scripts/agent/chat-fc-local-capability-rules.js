export const CHAT_FC_LOCAL_CAPABILITY_STORE_KEY = 'chat_fc_local_capability_rules_v1';
export const CHAT_FC_LOCAL_CAPABILITY_SCHEMA_VERSION = 1;
export const CHAT_FC_LOCAL_CAPABILITY_MAX_RULES = 64;
export const CHAT_FC_LOCAL_RULE_EXPORT_TYPE = 'miphone.chat-fc.local-rules';
export const CHAT_FC_LOCAL_BREAKER_THRESHOLD = 2;
export const CHAT_FC_LOCAL_CAPABILITY_SURFACES = Object.freeze([
  'private_chat',
  'group_chat',
  'moment_comment',
]);

const DETERMINISTIC_CONTRACT_FAILURES = new Set([
  'no_tool_call',
  'multiple_tool_calls',
  'unknown_tool',
  'invalid_arguments_json',
  'invalid_phone_reply_ir',
  'unexpected_response_text',
]);

const ALLOWED_SCHEMA_PROFILES = new Set([
  'phone.reply.ir.v1',
  'phone.reply.private.gemini-flat.v1',
  'phone.reply.batch.gemini-flat.v1',
  'phone.reply.openrouter-gemini-flat.v1',
]);

const PROVIDER_TRANSPORTS = Object.freeze({
  deepseek: Object.freeze({
    endpointClass: 'local_deepseek_responses',
    transportAdapter: 'openai_responses',
  }),
  openai: Object.freeze({
    endpointClass: 'local_openai_responses',
    transportAdapter: 'openai_responses',
  }),
  anthropic: Object.freeze({
    endpointClass: 'local_anthropic_messages',
    transportAdapter: 'anthropic_messages',
  }),
  opencode: Object.freeze({
    endpointClass: 'local_opencode_chat_completions',
    transportAdapter: 'openai_chat_completions',
  }),
  kimi: Object.freeze({
    endpointClass: 'local_kimi_chat_completions',
    transportAdapter: 'openai_chat_completions',
  }),
  zhipu: Object.freeze({
    endpointClass: 'local_zhipu_chat_completions',
    transportAdapter: 'openai_chat_completions',
  }),
  openrouter: Object.freeze({
    endpointClass: 'local_openrouter_chat_completions',
    transportAdapter: 'openai_chat_completions',
  }),
  makersuite: Object.freeze({
    endpointClass: 'local_makersuite_generate_content',
    transportAdapter: 'gemini_generate_content',
  }),
  gemini: Object.freeze({
    endpointClass: 'local_gemini_generate_content',
    transportAdapter: 'gemini_generate_content',
  }),
  vertexai: Object.freeze({
    endpointClass: 'local_vertexai_generate_content',
    transportAdapter: 'gemini_generate_content',
  }),
  custom: Object.freeze({
    endpointClass: 'local_custom_openai_chat_completions',
    transportAdapter: 'openai_chat_completions',
  }),
});

const trim = (value, fallback = '') => String(value ?? '').trim() || fallback;
const trimLower = value => trim(value).toLowerCase();

const clone = (value, fallback = null) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
};

const fail = reason => ({ ok: false, reason, rule: null });

const normalizeTime = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : fallback;
};

const makeRuleId = (now) => `local.chat-fc.${now.toString(36)}.${Math.random().toString(36).slice(2, 10)}`;

export const normalizeChatFcRuleBaseUrl = (value = '') => {
  const raw = trim(value);
  if (!raw) return { ok: false, reason: 'base_url_required', value: '' };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'base_url_invalid', value: '' };
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { ok: false, reason: 'base_url_protocol_unsupported', value: '' };
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'base_url_credentials_forbidden', value: '' };
  }
  if (url.search) return { ok: false, reason: 'base_url_query_forbidden', value: '' };
  if (url.hash) return { ok: false, reason: 'base_url_fragment_forbidden', value: '' };
  const pathname = url.pathname.replace(/\/+$/u, '');
  return {
    ok: true,
    reason: '',
    value: `${url.protocol}//${url.host.toLowerCase()}${pathname}`,
  };
};

const schemasFor = ({ providerId, modelId }) => {
  if (providerId === 'makersuite' || providerId === 'gemini' || providerId === 'vertexai') {
    return [
      'phone.reply.private.gemini-flat.v1',
      'phone.reply.batch.gemini-flat.v1',
    ];
  }
  if (providerId === 'openrouter' && /^google\/gemini-/u.test(modelId)) {
    return ['phone.reply.openrouter-gemini-flat.v1'];
  }
  return ['phone.reply.ir.v1'];
};

const sameStrings = (left, right) => (
  left.length === right.length && left.every((value, index) => value === right[index])
);

const normalizeLastTest = (value, now) => {
  const status = ['passed', 'failed'].includes(trimLower(value?.status))
    ? trimLower(value.status)
    : 'not_run';
  const testedAt = status === 'not_run' ? 0 : normalizeTime(value?.testedAt, now);
  return {
    status,
    testedAt,
    modelCallCount: status === 'not_run'
      ? 0
      : Math.max(0, Math.min(3, Math.trunc(Number(value?.modelCallCount) || 0))),
    reason: status === 'failed' ? trim(value?.reason).slice(0, 120) : '',
  };
};

const emptyHealth = () => ({
  consecutiveDeterministicFailures: 0,
  circuitOpen: false,
  lastFailureReason: '',
  lastFailureAt: 0,
  openedAt: 0,
});

const normalizeHealth = (value, now) => {
  const requestedOpen = value?.circuitOpen === true;
  const rawCount = Math.max(0, Math.trunc(Number(value?.consecutiveDeterministicFailures) || 0));
  const count = Math.min(
    CHAT_FC_LOCAL_BREAKER_THRESHOLD,
    requestedOpen ? Math.max(CHAT_FC_LOCAL_BREAKER_THRESHOLD, rawCount) : rawCount,
  );
  if (!count) return emptyHealth();
  const lastFailureAt = normalizeTime(value?.lastFailureAt, now);
  return {
    consecutiveDeterministicFailures: count,
    circuitOpen: requestedOpen,
    lastFailureReason: trim(value?.lastFailureReason).slice(0, 120),
    lastFailureAt,
    openedAt: requestedOpen ? normalizeTime(value?.openedAt, lastFailureAt) : 0,
  };
};

export const normalizeChatFcLocalRule = (input = {}, { now = Date.now } = {}) => {
  const timestamp = Math.max(1, Math.trunc(Number(now?.() || Date.now()) || Date.now()));
  const identity = input?.identity && typeof input.identity === 'object' ? input.identity : {};
  const providerId = trimLower(identity.providerId || input.providerId);
  if (!providerId) return fail('provider_id_required');
  if (providerId === 'ollama') return fail('ollama_local_rule_deferred');
  const transport = PROVIDER_TRANSPORTS[providerId];
  if (!transport) return fail('provider_transport_unsupported');

  const normalizedUrl = normalizeChatFcRuleBaseUrl(identity.baseUrl || input.baseUrl);
  if (!normalizedUrl.ok) return fail(normalizedUrl.reason);
  const modelId = trimLower(identity.modelId || input.modelId);
  if (!modelId) return fail('model_id_required');
  if (modelId.length > 240) return fail('model_id_too_long');

  const route = trimLower(identity.route || input.route);
  if (providerId === 'openrouter' && !route) return fail('openrouter_route_required');
  if (route && (!/^[a-z0-9._/-]+$/u.test(route) || route.length > 180)) {
    return fail('provider_route_invalid');
  }

  const inputAdapter = trimLower(identity.transportAdapter || input.transportAdapter);
  if (inputAdapter && inputAdapter !== transport.transportAdapter) {
    return fail('transport_adapter_mismatch');
  }
  const inputEndpoint = trimLower(identity.endpointClass || input.endpointClass);
  if (inputEndpoint && inputEndpoint !== transport.endpointClass) {
    return fail('endpoint_class_mismatch');
  }

  const expectedSchemas = schemasFor({ providerId, modelId });
  if (input.schemaProfiles !== undefined) {
    const requestedSchemas = Array.isArray(input.schemaProfiles)
      ? input.schemaProfiles.map(trimLower).filter(Boolean)
      : [];
    if (
      requestedSchemas.some(schema => !ALLOWED_SCHEMA_PROFILES.has(schema))
      || !sameStrings(requestedSchemas, expectedSchemas)
    ) return fail('schema_profile_unsupported');
  }

  if (input.surfaces !== undefined) {
    const surfaces = Array.isArray(input.surfaces)
      ? input.surfaces.map(trimLower).filter(Boolean)
      : [];
    if (!sameStrings(surfaces, CHAT_FC_LOCAL_CAPABILITY_SURFACES)) {
      return fail('surface_scope_requires_full_v1');
    }
  }

  const requestedSelection = trimLower(input?.policy?.selection || 'none');
  const requestedTerminal = trimLower(input?.policy?.terminal || 'forced_terminal');
  if (requestedSelection !== 'none' || requestedTerminal !== 'forced_terminal') {
    return fail('policy_unsupported');
  }

  const rawRuleId = trim(input.ruleId);
  const ruleId = /^[a-z0-9._:-]{1,180}$/iu.test(rawRuleId)
    ? rawRuleId
    : makeRuleId(timestamp);
  const createdAt = normalizeTime(input.createdAt, timestamp);
  const updatedAt = normalizeTime(input.updatedAt, timestamp);
  const schemaProfiles = [...expectedSchemas];
  const rule = {
    ruleId,
    name: trim(input.name, `${providerId} / ${modelId}`).slice(0, 100),
    enabled: input.enabled === true,
    profileId: trim(input.profileId).slice(0, 180),
    profileName: trim(input.profileName).slice(0, 100),
    identity: {
      providerId,
      baseUrl: normalizedUrl.value,
      endpointClass: transport.endpointClass,
      transportAdapter: transport.transportAdapter,
      modelId,
      ...(route ? { route } : {}),
    },
    surfaces: [...CHAT_FC_LOCAL_CAPABILITY_SURFACES],
    policy: {
      selection: 'none',
      terminal: 'forced_terminal',
      maxIntermediateRounds: 0,
    },
    schemaProfiles,
    capabilities: {
      basicToolCall: true,
      uniqueTerminalTool: true,
      streamingArguments: false,
      imageInputWithTools: false,
      toolResultContinuation: false,
      ...(route ? { providerRoute: route } : {}),
      schemaSubsets: [...schemaProfiles],
    },
    evidence: {
      source: 'user_local_advanced',
      minimumAppVersion: '0.7.0',
      lastTest: normalizeLastTest(input?.evidence?.lastTest, timestamp),
    },
    health: normalizeHealth(input?.health, timestamp),
    createdAt,
    updatedAt: Math.max(createdAt, updatedAt),
  };
  return { ok: true, reason: '', rule };
};

export const buildChatFcLocalRuleFromProfile = (profile = {}, {
  ruleId = '',
  name = '',
  enabled = false,
  route = '',
  lastTest = null,
  health = null,
  now = Date.now,
} = {}) => normalizeChatFcLocalRule({
  ruleId,
  name: trim(name, `${trim(profile?.name, '设置档')} · ${trim(profile?.model, '模型')}`),
  enabled,
  profileId: trim(profile?.id),
  profileName: trim(profile?.name),
  identity: {
    providerId: profile?.provider,
    baseUrl: profile?.baseUrl,
    modelId: profile?.model,
    route,
  },
  ...(lastTest ? { evidence: { lastTest } } : {}),
  ...(health ? { health } : {}),
}, { now });

export const getChatFcLocalRuleIdentityKey = (rule = {}) => [
  rule?.identity?.providerId,
  rule?.identity?.baseUrl,
  rule?.identity?.modelId,
  rule?.identity?.route,
].map(trimLower).join('\u0000');

export const applyChatFcLocalRuleAttemptOutcome = (
  input = {},
  attempt = {},
  { now = Date.now } = {},
) => {
  const normalized = normalizeChatFcLocalRule(input, { now });
  if (!normalized.ok) {
    return { changed: false, action: 'invalid_rule', reason: normalized.reason, rule: null };
  }
  const rule = normalized.rule;
  const timestamp = Math.max(1, Math.trunc(Number(now?.() || Date.now()) || Date.now()));
  if (attempt?.attempted !== true) {
    return { changed: false, action: 'not_attempted', reason: '', rule };
  }
  if (attempt?.ok === true) {
    if (
      rule.health.circuitOpen !== true
      && rule.health.consecutiveDeterministicFailures === 0
    ) return { changed: false, action: 'none', reason: '', rule };
    const recovered = normalizeChatFcLocalRule({
      ...rule,
      health: emptyHealth(),
      updatedAt: timestamp,
    }, { now });
    return {
      changed: true,
      action: rule.health.circuitOpen ? 'circuit_reset' : 'failure_count_reset',
      reason: '',
      rule: recovered.rule,
    };
  }
  const reason = trimLower(attempt?.reason);
  if (!DETERMINISTIC_CONTRACT_FAILURES.has(reason)) {
    return { changed: false, action: 'ignored_failure', reason, rule };
  }
  if (rule.health.circuitOpen === true) {
    return { changed: false, action: 'circuit_already_open', reason, rule };
  }
  const count = Math.min(
    CHAT_FC_LOCAL_BREAKER_THRESHOLD,
    rule.health.consecutiveDeterministicFailures + 1,
  );
  const circuitOpen = count >= CHAT_FC_LOCAL_BREAKER_THRESHOLD;
  const next = normalizeChatFcLocalRule({
    ...rule,
    health: {
      consecutiveDeterministicFailures: count,
      circuitOpen,
      lastFailureReason: reason,
      lastFailureAt: timestamp,
      openedAt: circuitOpen ? timestamp : 0,
    },
    updatedAt: timestamp,
  }, { now });
  return {
    changed: true,
    action: circuitOpen ? 'circuit_opened' : 'failure_recorded',
    reason,
    rule: next.rule,
  };
};

export const buildChatFcLocalRulesExport = (rules = [], { now = Date.now } = {}) => {
  if (!Array.isArray(rules)) throw new TypeError('chat_fc_local_rules_must_be_array');
  if (rules.length > CHAT_FC_LOCAL_CAPABILITY_MAX_RULES) {
    throw new RangeError('chat_fc_local_rules_limit_exceeded');
  }
  const normalized = rules.map((entry) => {
    const result = normalizeChatFcLocalRule(entry, { now });
    if (!result.ok) {
      const error = new Error(result.reason);
      error.code = result.reason;
      throw error;
    }
    return result.rule;
  });
  const timestamp = Math.max(1, Math.trunc(Number(now?.() || Date.now()) || Date.now()));
  return {
    type: CHAT_FC_LOCAL_RULE_EXPORT_TYPE,
    schemaVersion: CHAT_FC_LOCAL_CAPABILITY_SCHEMA_VERSION,
    exportedAt: new Date(timestamp).toISOString(),
    rules: clone(normalized, []),
  };
};

export const parseChatFcLocalRulesImport = (input = null, { now = Date.now } = {}) => {
  let payload = input;
  if (typeof input === 'string') {
    try {
      payload = JSON.parse(input);
    } catch {
      return { ok: false, reason: 'import_json_invalid', rules: [] };
    }
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, reason: 'import_payload_invalid', rules: [] };
  }
  if (trim(payload.type) !== CHAT_FC_LOCAL_RULE_EXPORT_TYPE) {
    return { ok: false, reason: 'import_type_unsupported', rules: [] };
  }
  if (Number(payload.schemaVersion) !== CHAT_FC_LOCAL_CAPABILITY_SCHEMA_VERSION) {
    return { ok: false, reason: 'import_schema_unsupported', rules: [] };
  }
  if (!Array.isArray(payload.rules)) {
    return { ok: false, reason: 'import_rules_invalid', rules: [] };
  }
  if (payload.rules.length > CHAT_FC_LOCAL_CAPABILITY_MAX_RULES) {
    return { ok: false, reason: 'chat_fc_local_rules_limit_exceeded', rules: [] };
  }
  const timestamp = Math.max(1, Math.trunc(Number(now?.() || Date.now()) || Date.now()));
  const rules = [];
  const identities = new Set();
  for (const entry of payload.rules) {
    const result = normalizeChatFcLocalRule({
      ...entry,
      ruleId: '',
      enabled: false,
      profileId: '',
      profileName: '',
      evidence: { lastTest: { status: 'not_run' } },
      health: emptyHealth(),
      createdAt: timestamp,
      updatedAt: timestamp,
    }, { now });
    if (!result.ok) return { ok: false, reason: result.reason, rules: [] };
    const identityKey = getChatFcLocalRuleIdentityKey(result.rule);
    if (identities.has(identityKey)) {
      return { ok: false, reason: 'import_rule_identity_duplicate', rules: [] };
    }
    identities.add(identityKey);
    rules.push(result.rule);
  }
  return { ok: true, reason: '', rules };
};

let localRules = [];

export const replaceChatFcLocalCapabilityRules = (rules = [], { now = Date.now } = {}) => {
  if (!Array.isArray(rules)) throw new TypeError('chat_fc_local_rules_must_be_array');
  if (rules.length > CHAT_FC_LOCAL_CAPABILITY_MAX_RULES) {
    throw new RangeError('chat_fc_local_rules_limit_exceeded');
  }
  const normalized = [];
  const ids = new Set();
  const identities = new Set();
  for (const input of rules) {
    const result = normalizeChatFcLocalRule(input, { now });
    if (!result.ok) {
      const error = new Error(result.reason);
      error.code = result.reason;
      throw error;
    }
    if (ids.has(result.rule.ruleId)) throw new Error('chat_fc_local_rule_id_duplicate');
    const identityKey = getChatFcLocalRuleIdentityKey(result.rule);
    if (identities.has(identityKey)) throw new Error('chat_fc_local_rule_identity_duplicate');
    ids.add(result.rule.ruleId);
    identities.add(identityKey);
    normalized.push(result.rule);
  }
  localRules = clone(normalized, []);
  return getChatFcLocalCapabilityRules();
};

export const getChatFcLocalCapabilityRules = ({ includeDisabled = true } = {}) => clone(
  includeDisabled ? localRules : localRules.filter(rule => rule.enabled === true),
  [],
);

const localNoMatch = () => ({
  matched: false,
  blocked: false,
  blockReason: '',
  layer: '',
  revision: null,
  ruleId: '',
  identity: {},
  policy: {},
  schemaProfiles: [],
  capabilities: {},
  evidence: {},
});

const matchLocalRule = (rule, query, { requireEnabled = true } = {}) => {
  if (requireEnabled && rule.enabled !== true) return false;
  const identity = rule.identity;
  if (
    identity.providerId !== query.providerId
    || identity.baseUrl !== query.baseUrl
    || identity.modelId !== query.modelId
  ) return false;
  if (query.endpointClass && identity.endpointClass !== query.endpointClass) return false;
  if (trimLower(identity.route) !== query.route) return false;
  return true;
};

const asCapabilityRecord = rule => ({
  matched: true,
  layer: 'local_advanced',
  revision: null,
  ruleId: rule.ruleId,
  identity: clone(rule.identity, {}),
  policy: clone(rule.policy, {}),
  schemaProfiles: clone(rule.schemaProfiles, []),
  capabilities: clone(rule.capabilities, {}),
  evidence: clone(rule.evidence, {}),
  health: clone(rule.health, emptyHealth()),
});

const asBlockedRecord = rule => ({
  ...localNoMatch(),
  blocked: true,
  blockReason: 'local_rule_circuit_open',
  layer: 'local_advanced',
  ruleId: rule.ruleId,
  identity: clone(rule.identity, {}),
  evidence: clone(rule.evidence, {}),
  health: clone(rule.health, emptyHealth()),
});

export const readChatFcLocalCapability = ({
  providerId = '',
  baseUrl = '',
  endpointClass = '',
  modelId = '',
  route = '',
} = {}) => {
  const normalizedUrl = normalizeChatFcRuleBaseUrl(baseUrl);
  const query = {
    providerId: trimLower(providerId),
    baseUrl: normalizedUrl.ok ? normalizedUrl.value : '',
    endpointClass: trimLower(endpointClass),
    modelId: trimLower(modelId),
    route: trimLower(route),
  };
  if (!query.providerId || !query.baseUrl || !query.modelId) return localNoMatch();
  const match = localRules.find(rule => matchLocalRule(rule, query));
  if (!match) return localNoMatch();
  if (match.health?.circuitOpen === true) return asBlockedRecord(match);
  return asCapabilityRecord(match);
};

export const readChatFcLocalCapabilityOverride = (input = {}, queryInput = {}) => {
  const normalized = normalizeChatFcLocalRule(input);
  if (!normalized.ok) return localNoMatch();
  const normalizedUrl = normalizeChatFcRuleBaseUrl(queryInput?.baseUrl);
  const query = {
    providerId: trimLower(queryInput?.providerId),
    baseUrl: normalizedUrl.ok ? normalizedUrl.value : '',
    endpointClass: trimLower(queryInput?.endpointClass),
    modelId: trimLower(queryInput?.modelId),
    route: trimLower(queryInput?.route),
  };
  if (!query.providerId || !query.baseUrl || !query.modelId) return localNoMatch();
  return matchLocalRule(normalized.rule, query, { requireEnabled: false })
    ? asCapabilityRecord(normalized.rule)
    : localNoMatch();
};

const seedFromLocalMirror = () => {
  try {
    const raw = globalThis?.localStorage?.getItem?.(CHAT_FC_LOCAL_CAPABILITY_STORE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Number(parsed?.schemaVersion) !== CHAT_FC_LOCAL_CAPABILITY_SCHEMA_VERSION) return;
    replaceChatFcLocalCapabilityRules(parsed?.rules || []);
  } catch {
    localRules = [];
  }
};

seedFromLocalMirror();
