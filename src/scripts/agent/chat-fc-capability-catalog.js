import {
  readChatFcLocalCapability,
  readChatFcLocalCapabilityOverride,
} from './chat-fc-local-capability-rules.js';

const trimLower = value => String(value ?? '').trim().toLowerCase();

const clone = (value, fallback = null) => {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
};

const freezeEntry = (entry) => {
  const schemaProfiles = Object.freeze([...(entry.schemaProfiles || [])]);
  const capabilities = Object.freeze({
    ...entry.capabilities,
    schemaSubsets: Object.freeze([...(entry.capabilities?.schemaSubsets || [])]),
  });
  return Object.freeze({
    ...entry,
    identity: Object.freeze({ ...entry.identity }),
    policy: Object.freeze({ ...entry.policy }),
    schemaProfiles,
    capabilities,
    evidence: Object.freeze({ ...entry.evidence }),
  });
};

const forcedTerminalEntry = ({
  ruleId,
  providerId,
  endpointClass,
  transportAdapter,
  modelId,
  route = '',
  toolResultContinuation,
  schemaProfiles,
  verifiedAt = '2026-08-14',
  evidence = {},
}) => freezeEntry({
  ruleId,
  identity: {
    providerId,
    endpointClass,
    transportAdapter,
    modelId,
    ...(route ? { route } : {}),
  },
  policy: {
    selection: 'none',
    terminal: 'forced_terminal',
    maxIntermediateRounds: 0,
  },
  schemaProfiles,
  capabilities: {
    basicToolCall: true,
    uniqueTerminalTool: true,
    streamingArguments: true,
    imageInputWithTools: false,
    toolResultContinuation,
    ...(route ? { providerRoute: route } : {}),
    schemaSubsets: schemaProfiles,
  },
  evidence: {
    verifiedAt,
    minimumAppVersion: '0.7.0',
    ...evidence,
  },
});

const BUNDLED_ENTRIES = Object.freeze([
  forcedTerminalEntry({
    ruleId: 'bundled.deepseek.responses.deepseek-v4-flash',
    providerId: 'deepseek',
    endpointClass: 'official_deepseek_responses',
    transportAdapter: 'openai_responses',
    modelId: 'deepseek-v4-flash',
    toolResultContinuation: false,
    schemaProfiles: ['phone.reply.ir.v1'],
  }),
  forcedTerminalEntry({
    ruleId: 'bundled.openai.responses.gpt-5.6-sol',
    providerId: 'openai',
    endpointClass: 'official_openai_responses',
    transportAdapter: 'openai_responses',
    modelId: 'gpt-5.6-sol',
    toolResultContinuation: true,
    schemaProfiles: ['phone.reply.ir.v1'],
  }),
  forcedTerminalEntry({
    ruleId: 'bundled.anthropic.messages.claude-opus-4-8',
    providerId: 'anthropic',
    endpointClass: 'official_anthropic_messages',
    transportAdapter: 'anthropic_messages',
    modelId: 'claude-opus-4-8',
    toolResultContinuation: true,
    schemaProfiles: ['phone.reply.ir.v1'],
  }),
  forcedTerminalEntry({
    ruleId: 'bundled.opencode.chat-completions.glm-5.3',
    providerId: 'opencode',
    endpointClass: 'official_opencode_go_chat_completions',
    transportAdapter: 'openai_chat_completions',
    modelId: 'glm-5.3',
    toolResultContinuation: false,
    schemaProfiles: ['phone.reply.ir.v1'],
  }),
  forcedTerminalEntry({
    ruleId: 'bundled.opencode.chat-completions.glm-5.2',
    providerId: 'opencode',
    endpointClass: 'official_opencode_go_chat_completions',
    transportAdapter: 'openai_chat_completions',
    modelId: 'glm-5.2',
    toolResultContinuation: false,
    schemaProfiles: ['phone.reply.ir.v1'],
    verifiedAt: '2026-08-15',
  }),
  forcedTerminalEntry({
    ruleId: 'bundled.opencode.chat-completions.glm-5',
    providerId: 'opencode',
    endpointClass: 'official_opencode_go_chat_completions',
    transportAdapter: 'openai_chat_completions',
    modelId: 'glm-5',
    toolResultContinuation: false,
    schemaProfiles: ['phone.reply.ir.v1'],
    verifiedAt: '2026-08-15',
    evidence: {
      fixtureVersion: 'opencode-fc-matrix-v1',
      catalogFingerprint: 'sha256:f6fc895cc1b0f84aa82fc2158fdc6b3b8d28201b4f0c9b40adcc515cb7a7c409',
      transportPassed: 2,
      strictSurfaceSamplesPassed: 30,
      cancellationPassed: true,
      fallbackBoundaryPassed: true,
      realSessionPassed: true,
    },
  }),
  forcedTerminalEntry({
    ruleId: 'bundled.opencode.chat-completions.mimo-v2.5-pro',
    providerId: 'opencode',
    endpointClass: 'official_opencode_go_chat_completions',
    transportAdapter: 'openai_chat_completions',
    modelId: 'mimo-v2.5-pro',
    toolResultContinuation: false,
    schemaProfiles: ['phone.reply.ir.v1'],
    verifiedAt: '2026-08-15',
    evidence: {
      fixtureVersion: 'opencode-fc-matrix-v1',
      catalogFingerprint: 'sha256:f6fc895cc1b0f84aa82fc2158fdc6b3b8d28201b4f0c9b40adcc515cb7a7c409',
      transportPassed: 2,
      strictSurfaceSamplesPassed: 30,
      cancellationPassed: true,
      fallbackBoundaryPassed: true,
      realSessionPassed: true,
    },
  }),
  forcedTerminalEntry({
    ruleId: 'bundled.makersuite.generate-content.gemini-3.7-flash',
    providerId: 'makersuite',
    endpointClass: 'official_gemini_generate_content',
    transportAdapter: 'gemini_generate_content',
    modelId: 'gemini-3.7-flash',
    toolResultContinuation: false,
    schemaProfiles: [
      'phone.reply.private.gemini-flat.v1',
      'phone.reply.batch.gemini-flat.v1',
    ],
  }),
  forcedTerminalEntry({
    ruleId: 'bundled.openrouter.chat-completions.google-gemini-3.7-flash.google-ai-studio-flex',
    providerId: 'openrouter',
    endpointClass: 'official_openrouter_chat_completions',
    transportAdapter: 'openai_chat_completions',
    modelId: 'google/gemini-3.7-flash',
    route: 'google-ai-studio/flex',
    toolResultContinuation: false,
    schemaProfiles: ['phone.reply.openrouter-gemini-flat.v1'],
  }),
  forcedTerminalEntry({
    ruleId: 'bundled.zhipu.chat-completions.glm-5.2',
    providerId: 'zhipu',
    endpointClass: 'official_zhipu_chat_completions',
    transportAdapter: 'openai_chat_completions',
    modelId: 'glm-5.2',
    toolResultContinuation: false,
    schemaProfiles: ['phone.reply.ir.v1'],
    verifiedAt: '2026-08-15',
    evidence: {
      fixtureVersion: 'direct-provider-k7-candidate-cohort-v1',
      transportPassed: 2,
      strictSurfaceSamplesPassed: 30,
      cancellationPassed: true,
      fallbackBoundaryPassed: true,
      realSessionPassed: true,
    },
  }),
  // 2026-08-16 Stage L 官渠候选批测（provider-l-official-candidate-cohort-v1，
  // 每模型 30+ 零写入样本、严格题意 ≥95%）。真实临时会话按 transport 家族在
  // H.4/J.7 完成，本批未逐模型重复，故不声明 realSessionPassed。
  ...[
    { providerId: 'deepseek', endpointClass: 'official_deepseek_responses', transportAdapter: 'openai_responses', continuation: false, schemaProfiles: ['phone.reply.ir.v1'], models: [
      { id: 'deepseek-v4-pro', passed: 30, attempted: 30 },
    ] },
    { providerId: 'openai', endpointClass: 'official_openai_responses', transportAdapter: 'openai_responses', continuation: true, schemaProfiles: ['phone.reply.ir.v1'], models: [
      { id: 'gpt-5.6-terra', passed: 30, attempted: 30 },
      { id: 'gpt-5.6-luna', passed: 30, attempted: 30 },
      { id: 'gpt-5.4', passed: 30, attempted: 30 },
      { id: 'gpt-5.4-mini', passed: 30, attempted: 30 },
      { id: 'gpt-5.4-nano', passed: 30, attempted: 30 },
    ] },
    { providerId: 'anthropic', endpointClass: 'official_anthropic_messages', transportAdapter: 'anthropic_messages', continuation: true, schemaProfiles: ['phone.reply.ir.v1'], models: [
      { id: 'claude-opus-5', passed: 30, attempted: 30 },
      { id: 'claude-sonnet-5', passed: 30, attempted: 31 },
      { id: 'claude-fable-5', passed: 30, attempted: 30 },
      { id: 'claude-opus-4-7', passed: 30, attempted: 30 },
      { id: 'claude-sonnet-4-6', passed: 30, attempted: 30 },
      { id: 'claude-haiku-4-5-20251001', passed: 30, attempted: 30 },
    ] },
    { providerId: 'makersuite', endpointClass: 'official_gemini_generate_content', transportAdapter: 'gemini_generate_content', continuation: false, schemaProfiles: [
      'phone.reply.private.gemini-flat.v1',
      'phone.reply.batch.gemini-flat.v1',
    ], models: [
      { id: 'gemini-3.6-flash', passed: 30, attempted: 30 },
      { id: 'gemini-3.5-flash', passed: 30, attempted: 30 },
      { id: 'gemini-3.1-flash-lite', passed: 30, attempted: 30 },
      { id: 'gemini-3-flash-preview', passed: 31, attempted: 32 },
      { id: 'gemini-2.5-flash', passed: 30, attempted: 30 },
    ] },
  ].flatMap(({ providerId, endpointClass, transportAdapter, continuation, schemaProfiles, models }) => models.map(model => forcedTerminalEntry({
    ruleId: `bundled.${providerId}.stage-l.${model.id.replace(/[^a-z0-9.-]+/gu, '-')}`,
    providerId,
    endpointClass,
    transportAdapter,
    modelId: model.id,
    toolResultContinuation: continuation,
    schemaProfiles,
    verifiedAt: '2026-08-16',
    evidence: {
      fixtureVersion: 'provider-l-official-candidate-cohort-v1',
      strictSurfaceSamplesPassed: model.passed,
      strictSurfaceSamplesAttempted: model.attempted,
    },
  }))),
]);

export const BUNDLED_CHAT_FC_CAPABILITY_CATALOG = Object.freeze({
  schemaVersion: 1,
  revision: 5,
  catalogId: 'miphone.chat-fc.bundled',
  entries: BUNDLED_ENTRIES,
});

const noMatch = () => ({
  matched: false,
  layer: '',
  revision: null,
  ruleId: '',
  identity: {},
  policy: {},
  schemaProfiles: [],
  capabilities: {},
  evidence: {},
});

export const readChatFcCapability = ({
  providerId = '',
  baseUrl = '',
  endpointClass = '',
  modelId = '',
  route = '',
  ollamaCapabilityIdentity = '',
  localRuleOverride = null,
} = {}) => {
  if (localRuleOverride) {
    const override = readChatFcLocalCapabilityOverride(localRuleOverride, {
      providerId,
      baseUrl,
      endpointClass,
      modelId,
      route,
    });
    if (override.matched) return override;
  }
  const local = readChatFcLocalCapability({
    providerId,
    baseUrl,
    endpointClass,
    modelId,
    route,
  });
  if (local.matched || local.blocked) return local;
  const query = {
    providerId: trimLower(providerId),
    endpointClass: trimLower(endpointClass),
    modelId: trimLower(modelId),
    route: trimLower(route),
    ollamaCapabilityIdentity: trimLower(ollamaCapabilityIdentity),
  };
  if (!query.providerId || !query.endpointClass || !query.modelId) return noMatch();

  const entry = BUNDLED_ENTRIES.find((candidate) => {
    const identity = candidate.identity;
    if (
      identity.providerId !== query.providerId
      || identity.endpointClass !== query.endpointClass
      || identity.modelId !== query.modelId
    ) return false;
    if (query.route && trimLower(identity.route) !== query.route) return false;
    if (query.providerId !== 'ollama') return true;
    return trimLower(identity.ollamaCapabilityIdentity) === query.ollamaCapabilityIdentity;
  });
  if (!entry) return noMatch();

  return {
    matched: true,
    layer: 'bundled',
    revision: BUNDLED_CHAT_FC_CAPABILITY_CATALOG.revision,
    ruleId: entry.ruleId,
    identity: clone(entry.identity, {}),
    policy: clone(entry.policy, {}),
    schemaProfiles: clone(entry.schemaProfiles, []),
    capabilities: clone(entry.capabilities, {}),
    evidence: clone(entry.evidence, {}),
  };
};
