export const CHAT_STRUCTURED_EVIDENCE_SCHEMA_VERSION = 2;
export const CHAT_STRUCTURED_CONTRACT_REVISION = 'phone.reply.transport.v2';
export const CHAT_STRUCTURED_EVIDENCE_OBSERVED_THRESHOLD = 20;
export const CHAT_STRUCTURED_EVIDENCE_BREAKER_THRESHOLD = 2;
export const CHAT_STRUCTURED_EVIDENCE_MAX_CELLS = 512;
export const CHAT_STRUCTURED_EVIDENCE_HALF_OPEN_TTL_MS = 24 * 60 * 60 * 1000;

export const CHAT_STRUCTURED_ROUTE_MODES = Object.freeze({
  providerFc: 'provider_fc',
  jsonTerminal: 'json_terminal',
  legacyText: 'legacy_text',
});

const STRUCTURED_MODES = new Set([
  CHAT_STRUCTURED_ROUTE_MODES.providerFc,
  CHAT_STRUCTURED_ROUTE_MODES.jsonTerminal,
]);

const DETERMINISTIC_CONTRACT_FAILURES = new Set([
  'no_tool_call',
  'multiple_tool_calls',
  'unknown_tool',
  'invalid_arguments_json',
  'invalid_terminal_json',
  'invalid_terminal_envelope',
  'invalid_phone_reply_ir',
  'canonical_serialization_failed',
  'unexpected_response_text',
  'terminal_version_unsupported',
]);

const CAPABILITY_ERROR_PATTERN = /(?:unsupported|not[_ -]?supported|unknown|invalid).{0,48}(?:tool[_ -]?choice|tools?|response[_ -]?format|json[_ -]?schema)|(?:tool[_ -]?choice|tools?|response[_ -]?format|json[_ -]?schema).{0,48}(?:unsupported|not[_ -]?supported|unknown|invalid)/iu;
const MODEL_ALIAS_PATTERN = /(?:^|[/:._-])(?:auto|latest|default)$/iu;

const trim = (value, fallback = '') => String(value ?? '').trim() || fallback;
const trimLower = value => trim(value).toLowerCase();

const clone = (value, fallback = null) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
};

const normalizeTimestamp = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : fallback;
};

const normalizePositiveInt = (value, maximum = Number.MAX_SAFE_INTEGER) => {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(maximum, number);
};

const normalizeHttpStatus = value => {
  const status = Math.trunc(Number(value));
  return Number.isFinite(status) && status >= 100 && status <= 599 ? status : 0;
};

const normalizeFailureShape = (input = null) => {
  if (!input || typeof input !== 'object') return null;
  const finishReason = trimLower(input.finishReason)
    .replace(/[^a-z0-9._:-]+/gu, '_').slice(0, 96);
  const validationCodes = Array.from(new Set(
    (Array.isArray(input.validationCodes) ? input.validationCodes : [])
      .map(value => trim(value).slice(0, 96))
      .filter(value => /^[a-z0-9._:-]+$/iu.test(value))
      .filter(Boolean),
  )).slice(0, 20);
  return {
    finishReason,
    characterCount: normalizePositiveInt(input.characterCount, 100_000_000),
    startsWithObject: input.startsWithObject === true,
    endsWithObject: input.endsWithObject === true,
    hasCodeFence: input.hasCodeFence === true,
    hasTableEdit: input.hasTableEdit === true,
    hasProtocolMarker: input.hasProtocolMarker === true,
    truncationSuspected: input.truncationSuspected === true,
    validationCodes,
  };
};

const normalizeCapabilitySet = (value = []) => {
  const out = new Set();
  (Array.isArray(value) ? value : [value]).forEach((item) => {
    const capability = trimLower(item).replace(/[^a-z0-9._:-]+/gu, '_').slice(0, 80);
    if (capability) out.add(capability);
  });
  return Array.from(out).sort();
};

const normalizeEndpointIdentity = (value = '') => {
  const raw = trim(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const pathname = url.pathname.replace(/\/+$/u, '');
    return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${pathname}`.slice(0, 500);
  } catch {
    if (/[?#@]/u.test(raw)) return '';
    return raw.toLowerCase().replace(/\s+/gu, '').replace(/\/+$/u, '').slice(0, 500);
  }
};

const failIdentity = reason => ({ ok: false, reason, identity: null });

export const buildChatStructuredEvidenceIdentity = (input = {}) => {
  const provider = trimLower(input?.provider || input?.providerId);
  const endpoint = trimLower(input?.endpoint || input?.endpointClass);
  const adapter = trimLower(input?.adapter || input?.transportAdapter);
  const model = trimLower(input?.model || input?.modelId);
  const schemaProfile = trimLower(input?.schemaProfile);
  const surface = trimLower(input?.surface);
  const contractRevision = trim(input?.contractRevision, CHAT_STRUCTURED_CONTRACT_REVISION);
  const capabilitySet = normalizeCapabilitySet(input?.capabilitySet);
  if (!provider) return failIdentity('provider_required');
  if (!endpoint) return failIdentity('endpoint_required');
  if (!adapter) return failIdentity('adapter_required');
  if (!model) return failIdentity('model_required');
  if (!schemaProfile) return failIdentity('schema_profile_required');
  if (!surface) return failIdentity('surface_required');
  if (!contractRevision) return failIdentity('contract_revision_required');
  if (!capabilitySet.length) return failIdentity('capability_set_required');
  const route = trimLower(input?.route || input?.upstream || input?.providerRoute).slice(0, 240);
  const endpointIdentity = normalizeEndpointIdentity(
    input?.endpointIdentity || input?.baseUrl || input?.authority,
  );
  const ollamaVersion = trim(input?.ollamaVersion).slice(0, 160);
  const modelDigest = trimLower(input?.modelDigest || input?.digest).slice(0, 240);
  const responseModel = trimLower(input?.responseModel).slice(0, 240);
  const systemFingerprint = trim(input?.systemFingerprint).slice(0, 240);
  const autoRouted = input?.autoRouted === true || !route && provider === 'openrouter';
  const autoPromotionEligible = !MODEL_ALIAS_PATTERN.test(model)
    && !autoRouted
    && input?.autoPromotionEligible !== false
    && input?.responseIdentityStable !== false;
  return {
    ok: true,
    reason: '',
    identity: {
      provider,
      endpoint,
      adapter,
      model,
      ...(endpointIdentity ? { endpointIdentity } : {}),
      ...(route ? { route } : {}),
      schemaProfile,
      surface,
      capabilitySet,
      contractRevision,
      ...(ollamaVersion ? { ollamaVersion } : {}),
      ...(modelDigest ? { modelDigest } : {}),
      ...(responseModel ? { responseModel } : {}),
      ...(systemFingerprint ? { systemFingerprint } : {}),
      autoPromotionEligible,
    },
  };
};

const stableIdentityTuple = identity => [
  identity.provider,
  identity.endpoint,
  identity.adapter,
  identity.model,
  identity.endpointIdentity || '',
  identity.route || '',
  identity.schemaProfile,
  identity.surface,
  identity.capabilitySet,
  identity.contractRevision,
  identity.ollamaVersion || '',
  identity.modelDigest || '',
  identity.responseModel || '',
  identity.systemFingerprint || '',
];

export const getChatStructuredEvidenceKey = (identityInput = {}, modeInput = '') => {
  const normalized = buildChatStructuredEvidenceIdentity(identityInput);
  const mode = trimLower(modeInput);
  if (!normalized.ok || !STRUCTURED_MODES.has(mode)) return '';
  return `chat-structured:v2:${JSON.stringify([mode, ...stableIdentityTuple(normalized.identity)])}`;
};

const emptyHealth = () => ({
  status: 'unobserved',
  strictSuccessCount: 0,
  repairCount: 0,
  fallbackCount: 0,
  consecutiveDeterministicFailures: 0,
  deterministicFailureCount: 0,
  transientFailureCount: 0,
  observedCompatible: false,
  circuitOpen: false,
  circuitEpoch: 0,
  circuitOpenedAt: 0,
  halfOpenReady: false,
  negativeCapability: false,
  cooldownUntil: 0,
  lastAttemptAt: 0,
  lastSuccessAt: 0,
  lastFailureAt: 0,
  lastFailureReason: '',
  lastFailureCategory: '',
  lastLatencyMs: 0,
  lastResponseModel: '',
  lastSystemFingerprint: '',
  lastFailureShape: null,
});

const normalizeHealth = (input = {}) => {
  const circuitOpen = input?.circuitOpen === true;
  const negativeCapability = input?.negativeCapability === true;
  const observedCompatible = input?.observedCompatible === true;
  const status = circuitOpen
    ? (negativeCapability ? 'negative_capability' : 'circuit_open')
    : (observedCompatible ? 'local_observed_compatible' : trimLower(input?.status, 'unobserved'));
  return {
    status,
    strictSuccessCount: normalizePositiveInt(input?.strictSuccessCount, 1_000_000),
    repairCount: normalizePositiveInt(input?.repairCount, 1_000_000),
    fallbackCount: normalizePositiveInt(input?.fallbackCount, 1_000_000),
    consecutiveDeterministicFailures: normalizePositiveInt(
      input?.consecutiveDeterministicFailures,
      CHAT_STRUCTURED_EVIDENCE_BREAKER_THRESHOLD,
    ),
    deterministicFailureCount: normalizePositiveInt(input?.deterministicFailureCount, 1_000_000),
    transientFailureCount: normalizePositiveInt(input?.transientFailureCount, 1_000_000),
    observedCompatible,
    circuitOpen,
    circuitEpoch: normalizePositiveInt(input?.circuitEpoch, 1_000_000),
    circuitOpenedAt: normalizeTimestamp(input?.circuitOpenedAt),
    halfOpenReady: input?.halfOpenReady === true,
    negativeCapability,
    cooldownUntil: normalizeTimestamp(input?.cooldownUntil),
    lastAttemptAt: normalizeTimestamp(input?.lastAttemptAt),
    lastSuccessAt: normalizeTimestamp(input?.lastSuccessAt),
    lastFailureAt: normalizeTimestamp(input?.lastFailureAt),
    lastFailureReason: trim(input?.lastFailureReason).slice(0, 120),
    lastFailureCategory: trimLower(input?.lastFailureCategory).slice(0, 80),
    lastLatencyMs: normalizePositiveInt(input?.lastLatencyMs, 86_400_000),
    lastResponseModel: trimLower(input?.lastResponseModel).slice(0, 240),
    lastSystemFingerprint: trim(input?.lastSystemFingerprint).slice(0, 240),
    lastFailureShape: normalizeFailureShape(input?.lastFailureShape),
  };
};

export const createEmptyChatStructuredEvidenceCell = ({
  identity: identityInput = {},
  mode: modeInput = '',
  now = Date.now,
} = {}) => {
  const normalized = buildChatStructuredEvidenceIdentity(identityInput);
  const mode = trimLower(modeInput);
  if (!normalized.ok) throw new TypeError(normalized.reason);
  if (!STRUCTURED_MODES.has(mode)) throw new TypeError('structured_mode_unsupported');
  const timestamp = normalizeTimestamp(now?.(), Date.now());
  return {
    schemaVersion: CHAT_STRUCTURED_EVIDENCE_SCHEMA_VERSION,
    key: getChatStructuredEvidenceKey(normalized.identity, mode),
    mode,
    identity: normalized.identity,
    health: emptyHealth(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const normalizeChatStructuredEvidenceCell = (input = {}, { now = Date.now } = {}) => {
  if (!input || typeof input !== 'object') return null;
  if (Number(input.schemaVersion) !== CHAT_STRUCTURED_EVIDENCE_SCHEMA_VERSION) return null;
  const normalized = buildChatStructuredEvidenceIdentity(input.identity || {});
  const mode = trimLower(input.mode);
  if (!normalized.ok || !STRUCTURED_MODES.has(mode)) return null;
  const key = getChatStructuredEvidenceKey(normalized.identity, mode);
  if (trim(input.key) && trim(input.key) !== key) return null;
  const timestamp = normalizeTimestamp(now?.(), Date.now());
  const createdAt = normalizeTimestamp(input.createdAt, timestamp);
  const health = normalizeHealth(input.health);
  if (health.circuitOpen && !health.circuitOpenedAt) {
    health.circuitOpenedAt = normalizeTimestamp(
      health.lastFailureAt,
      Math.max(createdAt, normalizeTimestamp(input.updatedAt, createdAt)),
    );
  }
  return {
    schemaVersion: CHAT_STRUCTURED_EVIDENCE_SCHEMA_VERSION,
    key,
    mode,
    identity: normalized.identity,
    health,
    createdAt,
    updatedAt: Math.max(createdAt, normalizeTimestamp(input.updatedAt, createdAt)),
  };
};

export const classifyChatStructuredAttemptFailure = (attempt = {}) => {
  const reason = trimLower(attempt?.reason || attempt?.diagnostics?.reason);
  const diagnostics = attempt?.diagnostics && typeof attempt.diagnostics === 'object'
    ? attempt.diagnostics
    : {};
  const httpStatus = normalizeHttpStatus(
    diagnostics.httpStatus ?? diagnostics.status ?? attempt?.httpStatus ?? attempt?.status,
  );
  const providerCode = trimLower(
    diagnostics.providerCode
    || diagnostics.providerErrorCode
    || diagnostics.errorCategory
    || attempt?.providerCode,
  ).slice(0, 160);
  const providerCategory = trimLower(
    diagnostics.providerCategory || diagnostics.errorCategory || attempt?.providerCategory,
  ).slice(0, 160);
  const providerSignal = [providerCode, providerCategory].filter(Boolean).join(':');
  if (reason === 'aborted' || reason === 'cancelled' || attempt?.cancelled === true) {
    return { category: 'cancelled', reason: reason || 'cancelled', httpStatus, providerCode, providerCategory, fallbackAllowed: false };
  }
  if (DETERMINISTIC_CONTRACT_FAILURES.has(reason)) {
    return { category: 'deterministic_contract', reason, httpStatus, providerCode, providerCategory, fallbackAllowed: true };
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return { category: 'configuration', reason: reason || `http_${httpStatus}`, httpStatus, providerCode, providerCategory, fallbackAllowed: false };
  }
  if ([408, 425, 429].includes(httpStatus) || httpStatus >= 500) {
    return { category: 'transient', reason: reason || `http_${httpStatus}`, httpStatus, providerCode, providerCategory, fallbackAllowed: true };
  }
  if ([400, 404, 409, 415, 422].includes(httpStatus) && CAPABILITY_ERROR_PATTERN.test(providerSignal)) {
    return {
      category: 'negative_capability',
      reason: providerSignal,
      httpStatus,
      providerCode,
      providerCategory,
      fallbackAllowed: true,
    };
  }
  return {
    category: 'unclassified_provider',
    reason: reason || providerCode || (httpStatus ? `http_${httpStatus}` : 'provider_request_failed'),
    httpStatus,
    providerCode,
    providerCategory,
    fallbackAllowed: true,
  };
};

const isStrictEvidenceSuccess = (_cell, outcome) => outcome?.attempted === true
  && outcome?.ok === true
  && outcome?.committed === true
  && outcome?.fallbackUsed !== true
  && outcome?.argumentRepairApplied !== true
  && outcome?.canonicalRoundTrip === true
  && outcome?.frozenTargetMatched === true
  && outcome?.domainValidated === true
  && outcome?.responseIdentityStable !== false;

const calculateCooldown = (transientFailureCount) => Math.min(
  10 * 60 * 1000,
  30 * 1000 * (2 ** Math.max(0, Math.min(5, transientFailureCount - 1))),
);

export const applyChatStructuredEvidenceOutcome = (cellInput = {}, outcome = {}, {
  now = Date.now,
} = {}) => {
  const normalized = normalizeChatStructuredEvidenceCell(cellInput, { now });
  if (!normalized) throw new TypeError('structured_evidence_cell_invalid');
  if (outcome?.attempted !== true) return { changed: false, action: 'not_attempted', cell: normalized };
  const timestamp = normalizeTimestamp(now?.(), Date.now());
  const health = { ...normalized.health, lastAttemptAt: timestamp };
  const wasCircuitOpen = health.circuitOpen === true;
  health.lastLatencyMs = normalizePositiveInt(outcome?.latencyMs, 86_400_000);
  if (trim(outcome?.responseModel)) {
    health.lastResponseModel = trimLower(outcome.responseModel).slice(0, 240);
  }
  if (trim(outcome?.systemFingerprint)) {
    health.lastSystemFingerprint = trim(outcome.systemFingerprint).slice(0, 240);
  }
  let action = 'attempt_recorded';

  if (outcome?.ok === true) {
    health.transientFailureCount = 0;
    health.cooldownUntil = 0;
    health.lastSuccessAt = timestamp;
    const strictSuccess = isStrictEvidenceSuccess(normalized, outcome);
    if (!wasCircuitOpen || strictSuccess) {
      health.lastFailureReason = '';
      health.lastFailureCategory = '';
      health.lastFailureShape = null;
    }
    if (outcome?.argumentRepairApplied === true) {
      health.repairCount += 1;
      health.strictSuccessCount = 0;
      health.observedCompatible = false;
      health.deterministicFailureCount += 1;
      health.consecutiveDeterministicFailures = Math.min(
        CHAT_STRUCTURED_EVIDENCE_BREAKER_THRESHOLD,
        health.consecutiveDeterministicFailures + 1,
      );
      health.lastFailureAt = timestamp;
      health.lastFailureReason = 'argument_repair_required';
      health.lastFailureCategory = 'deterministic_contract';
      if (health.consecutiveDeterministicFailures >= CHAT_STRUCTURED_EVIDENCE_BREAKER_THRESHOLD) {
        health.circuitOpen = true;
        health.halfOpenReady = false;
        health.circuitOpenedAt = timestamp;
        if (!wasCircuitOpen) health.circuitEpoch += 1;
        health.status = 'circuit_open';
        action = wasCircuitOpen ? 'circuit_reopened' : 'circuit_opened';
      } else {
        health.status = 'contract_failure';
        action = 'repair_success_not_observed';
      }
    } else if (outcome?.responseIdentityStable === false) {
      health.consecutiveDeterministicFailures = 0;
      health.strictSuccessCount = 0;
      health.observedCompatible = false;
      health.status = 'identity_drift';
      action = 'identity_drift_not_observed';
    } else {
      health.consecutiveDeterministicFailures = 0;
    }
    if (outcome?.fallbackUsed === true) health.fallbackCount += 1;
    if (outcome?.argumentRepairApplied !== true && strictSuccess) {
      if (wasCircuitOpen) {
        health.circuitOpen = false;
        health.negativeCapability = false;
        health.circuitOpenedAt = 0;
        health.halfOpenReady = false;
      }
      health.strictSuccessCount += 1;
      action = wasCircuitOpen ? 'circuit_closed' : 'strict_success_recorded';
      if (
        normalized.identity.autoPromotionEligible === true
        && health.strictSuccessCount >= CHAT_STRUCTURED_EVIDENCE_OBSERVED_THRESHOLD
      ) {
        health.observedCompatible = true;
        health.status = 'local_observed_compatible';
        action = wasCircuitOpen ? 'circuit_closed' : 'local_observed_compatible';
      } else {
        health.status = 'observing';
      }
    } else if (wasCircuitOpen) {
      health.circuitOpen = true;
      health.status = health.negativeCapability ? 'negative_capability' : 'circuit_open';
      action = 'half_open_not_committed';
    } else if (outcome?.argumentRepairApplied !== true && outcome?.responseIdentityStable !== false) {
      action = outcome?.argumentRepairApplied === true
        ? 'repair_success_not_observed'
        : (outcome?.fallbackUsed === true ? 'fallback_success_not_observed' : 'non_strict_success');
    }
  } else {
    const failure = classifyChatStructuredAttemptFailure(outcome);
    health.lastFailureAt = timestamp;
    health.lastFailureReason = failure.reason;
    health.lastFailureCategory = failure.category;
    const failureShape = normalizeFailureShape(outcome?.diagnostics?.failureShape);
    if (failureShape) health.lastFailureShape = failureShape;
    if (failure.category === 'cancelled' || failure.category === 'configuration') {
      action = failure.category;
    } else if (failure.category === 'deterministic_contract') {
      health.strictSuccessCount = 0;
      health.observedCompatible = false;
      health.deterministicFailureCount += 1;
      health.consecutiveDeterministicFailures = Math.min(
        CHAT_STRUCTURED_EVIDENCE_BREAKER_THRESHOLD,
        health.consecutiveDeterministicFailures + 1,
      );
      if (health.consecutiveDeterministicFailures >= CHAT_STRUCTURED_EVIDENCE_BREAKER_THRESHOLD) {
        health.circuitOpen = true;
        health.halfOpenReady = false;
        health.circuitOpenedAt = timestamp;
        if (!wasCircuitOpen) health.circuitEpoch += 1;
        health.status = 'circuit_open';
        action = wasCircuitOpen ? 'circuit_reopened' : 'circuit_opened';
      } else {
        health.status = 'contract_failure';
        action = 'deterministic_failure_recorded';
      }
    } else if (failure.category === 'negative_capability') {
      health.strictSuccessCount = 0;
      health.observedCompatible = false;
      health.negativeCapability = true;
      health.circuitOpen = true;
      health.halfOpenReady = false;
      health.circuitOpenedAt = timestamp;
      if (!wasCircuitOpen) health.circuitEpoch += 1;
      health.status = 'negative_capability';
      action = wasCircuitOpen ? 'negative_capability_reconfirmed' : 'negative_capability_recorded';
    } else {
      health.transientFailureCount += 1;
      const cooldownMs = failure.category === 'transient'
        ? calculateCooldown(health.transientFailureCount)
        : 30 * 1000;
      health.cooldownUntil = timestamp + cooldownMs;
      health.status = 'cooldown';
      action = failure.category === 'transient' ? 'transient_cooldown' : 'unknown_cooldown';
    }
  }

  return {
    changed: true,
    action,
    cell: {
      ...normalized,
      identity: outcome?.responseIdentityStable === false
        ? { ...normalized.identity, autoPromotionEligible: false }
        : normalized.identity,
      health,
      updatedAt: timestamp,
    },
  };
};

export const getChatStructuredEvidenceAvailability = (cell, {
  now = Date.now,
  halfOpenLeaseAvailable = true,
} = {}) => {
  const timestamp = normalizeTimestamp(now?.(), Date.now());
  const health = cell?.health && typeof cell.health === 'object' ? cell.health : {};
  if (normalizeTimestamp(health.cooldownUntil) > timestamp) return { available: false, reason: 'cooldown' };
  if (health.circuitOpen !== true) return { available: true, reason: '', halfOpen: false };
  const openedAt = normalizeTimestamp(health.circuitOpenedAt, normalizeTimestamp(health.lastFailureAt));
  const ttlElapsed = openedAt > 0 && timestamp >= openedAt + CHAT_STRUCTURED_EVIDENCE_HALF_OPEN_TTL_MS;
  const eligible = health.halfOpenReady === true || ttlElapsed;
  if (!eligible) {
    return {
      available: false,
      reason: health.negativeCapability ? 'negative_capability' : 'circuit_open',
      halfOpen: false,
      retryAt: openedAt ? openedAt + CHAT_STRUCTURED_EVIDENCE_HALF_OPEN_TTL_MS : 0,
    };
  }
  if (halfOpenLeaseAvailable !== true) {
    return { available: false, reason: 'half_open_busy', halfOpen: false, retryAt: 0 };
  }
  return { available: true, reason: 'half_open', halfOpen: true, retryAt: 0 };
};

export const resolveChatStructuredRoute = ({
  enabled = false,
  hardBoundaryReason = '',
  verifiedFc = {},
  fcProbation = {},
  jsonTerminal = {},
  fcEvidence = null,
  jsonEvidence = null,
  fcHalfOpenLeaseAvailable = true,
  jsonHalfOpenLeaseAvailable = true,
  now = Date.now,
} = {}) => {
  const timestamp = normalizeTimestamp(now?.(), Date.now());
  const boundary = trimLower(hardBoundaryReason);
  if (enabled !== true || boundary) {
    return {
      mode: CHAT_STRUCTURED_ROUTE_MODES.legacyText,
      layer: 'legacy_text',
      reason: boundary || 'feature_disabled',
      fallbackFrom: '',
    };
  }
  const fcHealth = getChatStructuredEvidenceAvailability(fcEvidence, {
    now: () => timestamp,
    halfOpenLeaseAvailable: fcHalfOpenLeaseAvailable,
  });
  const verifiedNative = verifiedFc?.enabled === true
    && trimLower(verifiedFc?.capabilitySource) !== 'local_advanced';
  if (verifiedNative && fcHealth.available) {
    return {
      mode: CHAT_STRUCTURED_ROUTE_MODES.providerFc,
      layer: fcHealth.halfOpen ? 'fc_half_open' : 'verified_native_fc',
      reason: '',
      fallbackFrom: '',
      halfOpen: fcHealth.halfOpen === true,
    };
  }
  if (fcProbation?.eligible === true && fcHealth.available) {
    return {
      mode: CHAT_STRUCTURED_ROUTE_MODES.providerFc,
      layer: fcEvidence?.health?.observedCompatible === true
        ? 'local_observed_compatible'
        : (fcHealth.halfOpen ? 'fc_half_open' : 'fc_probation'),
      reason: '',
      fallbackFrom: '',
      halfOpen: fcHealth.halfOpen === true,
    };
  }
  const jsonHealth = getChatStructuredEvidenceAvailability(jsonEvidence, {
    now: () => timestamp,
    halfOpenLeaseAvailable: jsonHalfOpenLeaseAvailable,
  });
  const fcCandidate = verifiedNative || fcProbation?.eligible === true;
  const fcInTransientCooldown = fcCandidate && fcHealth.reason === 'cooldown';
  if (jsonTerminal?.eligible === true && jsonHealth.available && !fcInTransientCooldown) {
    const fcUnavailable = fcCandidate && !fcHealth.available;
    const fcEligibilityReason = !fcCandidate
      ? trimLower(fcProbation?.reason || verifiedFc?.reason)
      : '';
    return {
      mode: CHAT_STRUCTURED_ROUTE_MODES.jsonTerminal,
      layer: jsonHealth.halfOpen
        ? 'json_half_open'
        : (fcUnavailable ? 'json_after_fc_circuit' : 'json_terminal'),
      reason: fcUnavailable ? fcHealth.reason : fcEligibilityReason,
      fallbackFrom: fcUnavailable ? CHAT_STRUCTURED_ROUTE_MODES.providerFc : '',
      halfOpen: jsonHealth.halfOpen === true,
    };
  }
  return {
    mode: CHAT_STRUCTURED_ROUTE_MODES.legacyText,
    layer: 'legacy_text',
    reason: fcInTransientCooldown
      ? 'fc_cooldown'
      : (!jsonHealth.available
      ? `json_${jsonHealth.reason}`
      : (trimLower(jsonTerminal?.reason) || trimLower(fcProbation?.reason) || 'structured_route_unavailable')),
    fallbackFrom: !fcHealth.available
      ? CHAT_STRUCTURED_ROUTE_MODES.providerFc
      : (!jsonHealth.available ? CHAT_STRUCTURED_ROUTE_MODES.jsonTerminal : ''),
  };
};

export const cloneChatStructuredEvidenceCell = cell => clone(cell, null);
