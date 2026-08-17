import assert from 'node:assert/strict';
import {
  CHAT_STRUCTURED_CONTRACT_REVISION,
  CHAT_STRUCTURED_EVIDENCE_HALF_OPEN_TTL_MS,
  CHAT_STRUCTURED_EVIDENCE_OBSERVED_THRESHOLD,
  CHAT_STRUCTURED_ROUTE_MODES,
  applyChatStructuredEvidenceOutcome,
  buildChatStructuredEvidenceIdentity,
  classifyChatStructuredAttemptFailure,
  createEmptyChatStructuredEvidenceCell,
  getChatStructuredEvidenceKey,
  getChatStructuredEvidenceAvailability,
  normalizeChatStructuredEvidenceCell,
  resolveChatStructuredRoute,
} from '../../src/scripts/agent/chat-structured-route-evidence.js';
import {
  buildChatStructuredRequestEvidenceIdentity,
  resolveChatStructuredHardBoundary,
  resolveChatStructuredTextTransport,
} from '../../src/scripts/agent/chat-structured-route-request.js';
import { extractSafeProviderErrorMetadata } from '../../src/scripts/api/provider-error-metadata.js';

const now = 1_786_752_000_000;
const baseIdentity = {
  provider: 'opencode',
  endpoint: 'official_opencode_go_chat_completions',
  adapter: 'openai_chat_completions',
  model: 'future-model-1',
  route: 'opencode-go',
  schemaProfile: 'phone.reply.ir.v1',
  surface: 'private_chat',
  capabilitySet: ['basic_chat'],
  contractRevision: CHAT_STRUCTURED_CONTRACT_REVISION,
};

const strictSuccess = {
  attempted: true,
  ok: true,
  committed: true,
  fallbackUsed: false,
  argumentRepairApplied: false,
  canonicalRoundTrip: true,
  frozenTargetMatched: true,
  domainValidated: true,
  responseIdentityStable: true,
  latencyMs: 120,
};

{
  const metadata = extractSafeProviderErrorMetadata(JSON.stringify({
    error: {
      code: 'unsupported_tool_choice',
      param: 'tool_choice',
      message: 'secret body must not be copied',
    },
  }));
  assert.deepEqual(metadata, {
    providerCode: 'unsupported_tool_choice',
    providerCategory: 'tool_choice',
  });
  assert.equal(JSON.stringify(metadata).includes('secret body'), false);
  console.log('ok - provider error classification retains stable codes without retaining response bodies');
}

{
  const sanitized = buildChatStructuredEvidenceIdentity({
    ...baseIdentity,
    baseUrl: 'https://user:API_KEY@example.test/v1?token=API_KEY#secret',
  });
  assert.equal(sanitized.ok, true);
  assert.equal(JSON.stringify(sanitized.identity).includes('API_KEY'), false);
  assert.equal(sanitized.identity.endpointIdentity, 'https://example.test/v1');
  console.log('ok - evidence endpoint identity strips credentials, query, and fragment');
}

{
  const privateIdentity = buildChatStructuredRequestEvidenceIdentity({
    config: {
      provider: 'kimi',
      baseUrl: 'https://api.moonshot.ai/v1',
      model: 'kimi-k3',
    },
    mode: CHAT_STRUCTURED_ROUTE_MODES.jsonTerminal,
    adapter: 'private_reply',
    surface: 'private_chat',
    capabilities: {},
  });
  const batchIdentity = buildChatStructuredRequestEvidenceIdentity({
    config: {
      provider: 'kimi',
      baseUrl: 'https://api.moonshot.ai/v1',
      model: 'kimi-k3',
    },
    mode: CHAT_STRUCTURED_ROUTE_MODES.jsonTerminal,
    adapter: 'phone_batch',
    surface: 'private_chat',
    capabilities: { tableEdit: true },
  });
  assert.equal(privateIdentity.ok, true, privateIdentity.reason);
  assert.equal(batchIdentity.ok, true, batchIdentity.reason);
  assert.notEqual(
    getChatStructuredEvidenceKey(privateIdentity.identity, CHAT_STRUCTURED_ROUTE_MODES.jsonTerminal),
    getChatStructuredEvidenceKey(batchIdentity.identity, CHAT_STRUCTURED_ROUTE_MODES.jsonTerminal),
  );
  assert.equal(resolveChatStructuredTextTransport({ provider: 'unknown' }).supported, false);
  assert.deepEqual(resolveChatStructuredTextTransport({
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
  }), {
    supported: true,
    reason: '',
    endpoint: 'official_deepseek_chat_completions',
    adapter: 'openai_chat_completions',
  });
  assert.deepEqual(resolveChatStructuredTextTransport({
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
  }, { preferProviderFc: true }), {
    supported: true,
    reason: '',
    endpoint: 'official_deepseek_responses',
    adapter: 'openai_responses',
  });
  assert.equal(resolveChatStructuredHardBoundary({
    enabled: true,
    context: { compatibilityModeEnabled: true },
  }), 'compatibility_mode');
  console.log('ok - request identity records actual capability exposure and hard boundaries remain explicit');
}

{
  const privateKey = getChatStructuredEvidenceKey(baseIdentity, CHAT_STRUCTURED_ROUTE_MODES.providerFc);
  const groupKey = getChatStructuredEvidenceKey({
    ...baseIdentity,
    surface: 'group_chat',
  }, CHAT_STRUCTURED_ROUTE_MODES.providerFc);
  const tableKey = getChatStructuredEvidenceKey({
    ...baseIdentity,
    capabilitySet: ['basic_chat', 'table_edit'],
  }, CHAT_STRUCTURED_ROUTE_MODES.providerFc);
  const nextRevisionKey = getChatStructuredEvidenceKey({
    ...baseIdentity,
    contractRevision: `${CHAT_STRUCTURED_CONTRACT_REVISION}.next`,
  }, CHAT_STRUCTURED_ROUTE_MODES.providerFc);
  assert.notEqual(privateKey, groupKey);
  assert.notEqual(privateKey, tableKey);
  assert.notEqual(privateKey, nextRevisionKey);
  assert.notEqual(
    privateKey,
    getChatStructuredEvidenceKey(baseIdentity, CHAT_STRUCTURED_ROUTE_MODES.jsonTerminal),
  );
  console.log('ok - evidence identity isolates surface, capability, contract, and transport mode');
}

{
  let cell = createEmptyChatStructuredEvidenceCell({
    identity: baseIdentity,
    mode: CHAT_STRUCTURED_ROUTE_MODES.providerFc,
    now: () => now,
  });
  for (let index = 0; index < CHAT_STRUCTURED_EVIDENCE_OBSERVED_THRESHOLD; index += 1) {
    cell = applyChatStructuredEvidenceOutcome(cell, strictSuccess, { now: () => now + index }).cell;
  }
  assert.equal(cell.health.strictSuccessCount, CHAT_STRUCTURED_EVIDENCE_OBSERVED_THRESHOLD);
  assert.equal(cell.health.observedCompatible, true);
  assert.equal(cell.health.status, 'local_observed_compatible');

  const repaired = applyChatStructuredEvidenceOutcome(cell, {
    ...strictSuccess,
    argumentRepairApplied: true,
  }, { now: () => now + 100 }).cell;
  assert.equal(repaired.health.strictSuccessCount, 0);
  assert.equal(repaired.health.observedCompatible, false);
  assert.equal(repaired.health.repairCount, 1);
  const repairedAgain = applyChatStructuredEvidenceOutcome(repaired, {
    ...strictSuccess,
    argumentRepairApplied: true,
  }, { now: () => now + 101 }).cell;
  assert.equal(repairedAgain.health.circuitOpen, true);

  const fallback = applyChatStructuredEvidenceOutcome(cell, {
    ...strictSuccess,
    fallbackUsed: true,
  }, { now: () => now + 102 }).cell;
  assert.equal(fallback.health.strictSuccessCount, cell.health.strictSuccessCount);
  console.log('ok - only strict committed, unrepaired, no-fallback successes count toward local observation');
}

{
  const aliasIdentity = buildChatStructuredEvidenceIdentity({
    ...baseIdentity,
    model: 'vendor/latest',
  });
  assert.equal(aliasIdentity.ok, true);
  assert.equal(aliasIdentity.identity.autoPromotionEligible, false);
  let cell = createEmptyChatStructuredEvidenceCell({
    identity: aliasIdentity.identity,
    mode: CHAT_STRUCTURED_ROUTE_MODES.providerFc,
    now: () => now,
  });
  for (let index = 0; index < 25; index += 1) {
    cell = applyChatStructuredEvidenceOutcome(cell, strictSuccess, { now: () => now + index }).cell;
  }
  assert.equal(cell.health.strictSuccessCount, 25);
  assert.equal(cell.health.observedCompatible, false);

  const drifted = applyChatStructuredEvidenceOutcome(
    createEmptyChatStructuredEvidenceCell({
      identity: baseIdentity,
      mode: CHAT_STRUCTURED_ROUTE_MODES.providerFc,
      now: () => now,
    }),
    { ...strictSuccess, responseIdentityStable: false },
    { now: () => now },
  ).cell;
  assert.equal(drifted.health.strictSuccessCount, 0);
  assert.equal(drifted.identity.autoPromotionEligible, false);
  let afterDrift = normalizeChatStructuredEvidenceCell(
    JSON.parse(JSON.stringify(drifted)),
    { now: () => now + 1 },
  );
  assert.equal(afterDrift.identity.autoPromotionEligible, false);
  for (let index = 0; index < 25; index += 1) {
    afterDrift = applyChatStructuredEvidenceOutcome(afterDrift, strictSuccess, {
      now: () => now + 100 + index,
    }).cell;
  }
  assert.equal(afterDrift.health.observedCompatible, false);
  console.log('ok - aliases and response identity drift never auto-promote');
}

{
  const observed = applyChatStructuredEvidenceOutcome(
    createEmptyChatStructuredEvidenceCell({
      identity: baseIdentity,
      mode: CHAT_STRUCTURED_ROUTE_MODES.providerFc,
      now: () => now,
    }),
    {
      ...strictSuccess,
      responseModel: 'FUTURE-MODEL-1',
      systemFingerprint: 'fp_safe_20260815',
    },
    { now: () => now + 1 },
  ).cell;
  assert.equal(observed.health.lastResponseModel, 'future-model-1');
  assert.equal(observed.health.lastSystemFingerprint, 'fp_safe_20260815');
  const persisted = normalizeChatStructuredEvidenceCell(JSON.parse(JSON.stringify(observed)), {
    now: () => now + 2,
  });
  assert.equal(persisted.health.lastResponseModel, 'future-model-1');
  assert.equal(persisted.health.lastSystemFingerprint, 'fp_safe_20260815');
  console.log('ok - safe response model and fingerprint observations persist without storing response content');
}

{
  let fc = createEmptyChatStructuredEvidenceCell({
    identity: baseIdentity,
    mode: CHAT_STRUCTURED_ROUTE_MODES.providerFc,
    now: () => now,
  });
  const json = createEmptyChatStructuredEvidenceCell({
    identity: baseIdentity,
    mode: CHAT_STRUCTURED_ROUTE_MODES.jsonTerminal,
    now: () => now,
  });
  fc = applyChatStructuredEvidenceOutcome(fc, {
    attempted: true,
    ok: false,
    reason: 'no_tool_call',
  }, { now: () => now }).cell;
  fc = applyChatStructuredEvidenceOutcome(fc, {
    attempted: true,
    ok: false,
    reason: 'invalid_phone_reply_ir',
  }, { now: () => now + 1 }).cell;
  assert.equal(fc.health.circuitOpen, true);
  assert.equal(json.health.circuitOpen, false);

  const route = resolveChatStructuredRoute({
    enabled: true,
    verifiedFc: { enabled: false },
    fcProbation: { eligible: true },
    jsonTerminal: { eligible: true },
    fcEvidence: fc,
    jsonEvidence: json,
    now: () => now + 2,
  });
  assert.equal(route.mode, CHAT_STRUCTURED_ROUTE_MODES.jsonTerminal);
  assert.equal(route.layer, 'json_after_fc_circuit');

  const jsonBroken = {
    ...json,
    health: { ...json.health, circuitOpen: true, status: 'circuit_open' },
  };
  assert.equal(resolveChatStructuredRoute({
    enabled: true,
    verifiedFc: { enabled: false },
    fcProbation: { eligible: true },
    jsonTerminal: { eligible: true },
    fcEvidence: fc,
    jsonEvidence: jsonBroken,
    now: () => now + 2,
  }).mode, CHAT_STRUCTURED_ROUTE_MODES.legacyText);

  const fcCooling = {
    ...fc,
    health: { ...fc.health, circuitOpen: false, cooldownUntil: now + 60_000 },
  };
  const cooldownRoute = resolveChatStructuredRoute({
    enabled: true,
    verifiedFc: { enabled: true, capabilitySource: 'verified_seed' },
    fcProbation: { eligible: true },
    jsonTerminal: { eligible: true },
    fcEvidence: fcCooling,
    jsonEvidence: json,
    now: () => now + 2,
  });
  assert.equal(cooldownRoute.mode, CHAT_STRUCTURED_ROUTE_MODES.legacyText);
  assert.equal(cooldownRoute.reason, 'fc_cooldown');
  console.log('ok - FC and JSON breakers are independent and downgrade in the fixed order');
}

{
  const cases = [
    [{ reason: 'multiple_tool_calls' }, 'deterministic_contract'],
    [{ diagnostics: { httpStatus: 400, providerCode: 'unsupported_tool_choice' } }, 'negative_capability'],
    [{ diagnostics: { httpStatus: 400 } }, 'unclassified_provider'],
    [{ diagnostics: { httpStatus: 401 } }, 'configuration'],
    [{ diagnostics: { httpStatus: 403 } }, 'configuration'],
    [{ diagnostics: { httpStatus: 408 } }, 'transient'],
    [{ diagnostics: { httpStatus: 429 } }, 'transient'],
    [{ diagnostics: { httpStatus: 502 } }, 'transient'],
    [{ reason: 'provider_request_failed', diagnostics: { errorCode: 'TypeError' } }, 'unclassified_provider'],
    [{ reason: 'aborted' }, 'cancelled'],
  ];
  cases.forEach(([attempt, expected]) => {
    assert.equal(classifyChatStructuredAttemptFailure(attempt).category, expected);
  });
  console.log('ok - structured failure classification distinguishes contract, capability, auth, transient, and unknown');
}

{
  const verified = resolveChatStructuredRoute({
    enabled: true,
    verifiedFc: { enabled: true, capabilitySource: 'verified_seed' },
    fcProbation: { eligible: true },
    jsonTerminal: { eligible: true },
  });
  assert.equal(verified.mode, CHAT_STRUCTURED_ROUTE_MODES.providerFc);
  assert.equal(verified.layer, 'verified_native_fc');

  const probation = resolveChatStructuredRoute({
    enabled: true,
    verifiedFc: { enabled: false },
    fcProbation: { eligible: true },
    jsonTerminal: { eligible: true },
  });
  assert.equal(probation.mode, CHAT_STRUCTURED_ROUTE_MODES.providerFc);
  assert.equal(probation.layer, 'fc_probation');

  const thinkingJson = resolveChatStructuredRoute({
    enabled: true,
    verifiedFc: { enabled: false, reason: 'thinking_preservation_requires_json' },
    fcProbation: { eligible: false, reason: 'thinking_preservation_requires_json' },
    jsonTerminal: { eligible: true },
  });
  assert.equal(thinkingJson.mode, CHAT_STRUCTURED_ROUTE_MODES.jsonTerminal);
  assert.equal(thinkingJson.reason, 'thinking_preservation_requires_json');

  const hardBoundary = resolveChatStructuredRoute({
    enabled: true,
    hardBoundaryReason: 'compatibility_mode',
    verifiedFc: { enabled: true },
    fcProbation: { eligible: true },
    jsonTerminal: { eligible: true },
  });
  assert.equal(hardBoundary.mode, CHAT_STRUCTURED_ROUTE_MODES.legacyText);
  assert.equal(hardBoundary.reason, 'compatibility_mode');
  console.log('ok - router chooses verified FC, probation, JSON, or text without bypassing hard boundaries');
}

{
  let cell = createEmptyChatStructuredEvidenceCell({
    identity: baseIdentity,
    mode: CHAT_STRUCTURED_ROUTE_MODES.providerFc,
    now: () => now,
  });
  cell = applyChatStructuredEvidenceOutcome(cell, {
    attempted: true,
    ok: false,
    reason: 'invalid_phone_reply_ir',
    diagnostics: {
      failureShape: {
        finishReason: 'length',
        characterCount: 987,
        startsWithObject: true,
        endsWithObject: false,
        hasCodeFence: false,
        hasTableEdit: true,
        hasProtocolMarker: false,
        truncationSuspected: true,
        validationCodes: ['items.0.messages.required', '不得留存的正文'],
      },
    },
  }, { now: () => now + 1 }).cell;
  const opened = applyChatStructuredEvidenceOutcome(cell, {
    attempted: true,
    ok: false,
    reason: 'invalid_phone_reply_ir',
  }, { now: () => now + 2 });
  cell = opened.cell;
  assert.equal(opened.action, 'circuit_opened');
  assert.equal(cell.health.circuitEpoch, 1);
  assert.equal(cell.health.circuitOpenedAt, now + 2);
  assert.equal(cell.health.lastFailureShape.characterCount, 987);
  assert.deepEqual(cell.health.lastFailureShape.validationCodes, ['items.0.messages.required']);
  assert.equal(JSON.stringify(cell).includes('不得留存'), false);

  const beforeTtl = getChatStructuredEvidenceAvailability(cell, {
    now: () => now + CHAT_STRUCTURED_EVIDENCE_HALF_OPEN_TTL_MS,
  });
  assert.equal(beforeTtl.available, false);
  const afterTtl = getChatStructuredEvidenceAvailability(cell, {
    now: () => now + 2 + CHAT_STRUCTURED_EVIDENCE_HALF_OPEN_TTL_MS,
  });
  assert.equal(afterTtl.halfOpen, true);
  const halfOpenRoute = resolveChatStructuredRoute({
    enabled: true,
    verifiedFc: { enabled: true, capabilitySource: 'verified_seed' },
    fcProbation: { eligible: true },
    jsonTerminal: { eligible: true },
    fcEvidence: cell,
    now: () => now + 2 + CHAT_STRUCTURED_EVIDENCE_HALF_OPEN_TTL_MS,
  });
  assert.equal(halfOpenRoute.mode, CHAT_STRUCTURED_ROUTE_MODES.providerFc);
  assert.equal(halfOpenRoute.halfOpen, true);

  const commitFailed = applyChatStructuredEvidenceOutcome(cell, {
    ...strictSuccess,
    committed: false,
  }, { now: () => now + 3 + CHAT_STRUCTURED_EVIDENCE_HALF_OPEN_TTL_MS });
  assert.equal(commitFailed.action, 'half_open_not_committed');
  assert.equal(commitFailed.cell.health.circuitOpen, true);
  assert.equal(commitFailed.cell.health.deterministicFailureCount, 2);

  const closed = applyChatStructuredEvidenceOutcome(commitFailed.cell, strictSuccess, {
    now: () => now + 4 + CHAT_STRUCTURED_EVIDENCE_HALF_OPEN_TTL_MS,
  });
  assert.equal(closed.action, 'circuit_closed');
  assert.equal(closed.cell.health.circuitOpen, false);
  assert.equal(closed.cell.health.circuitOpenedAt, 0);
  console.log('ok - breaker epochs retain redacted failure shape and close only after strict committed half-open success');
}

{
  let cell = createEmptyChatStructuredEvidenceCell({
    identity: baseIdentity,
    mode: CHAT_STRUCTURED_ROUTE_MODES.providerFc,
    now: () => now,
  });
  cell = applyChatStructuredEvidenceOutcome(cell, {
    attempted: true,
    ok: false,
    reason: 'no_tool_call',
  }, { now: () => now + 1 }).cell;
  cell = applyChatStructuredEvidenceOutcome(cell, {
    attempted: true,
    ok: false,
    reason: 'invalid_phone_reply_ir',
  }, { now: () => now + 2 }).cell;
  const reopenedAt = now + 2 + CHAT_STRUCTURED_EVIDENCE_HALF_OPEN_TTL_MS;
  const reopened = applyChatStructuredEvidenceOutcome(cell, {
    attempted: true,
    ok: false,
    reason: 'multiple_tool_calls',
  }, { now: () => reopenedAt });
  assert.equal(reopened.action, 'circuit_reopened');
  assert.equal(reopened.cell.health.circuitEpoch, 1);
  assert.equal(reopened.cell.health.circuitOpenedAt, reopenedAt);
  assert.equal(getChatStructuredEvidenceAvailability(reopened.cell, {
    now: () => reopenedAt + CHAT_STRUCTURED_EVIDENCE_HALF_OPEN_TTL_MS - 1,
  }).available, false);
  assert.equal(getChatStructuredEvidenceAvailability(reopened.cell, {
    now: () => reopenedAt + CHAT_STRUCTURED_EVIDENCE_HALF_OPEN_TTL_MS,
  }).halfOpen, true);
  console.log('ok - deterministic half-open failure reopens the circuit and restarts its TTL');
}

{
  let cell = createEmptyChatStructuredEvidenceCell({
    identity: baseIdentity,
    mode: CHAT_STRUCTURED_ROUTE_MODES.providerFc,
    now: () => now,
  });
  for (const [offset, reason] of [[1, 'no_tool_call'], [2, 'invalid_phone_reply_ir']]) {
    cell = applyChatStructuredEvidenceOutcome(cell, {
      attempted: true,
      ok: false,
      reason,
    }, { now: () => now + offset }).cell;
  }
  const halfOpenAt = now + 2 + CHAT_STRUCTURED_EVIDENCE_HALF_OPEN_TTL_MS;
  const cancelled = applyChatStructuredEvidenceOutcome(cell, {
    attempted: true,
    ok: false,
    reason: 'aborted',
  }, { now: () => halfOpenAt });
  assert.equal(cancelled.action, 'cancelled');
  assert.equal(cancelled.cell.health.circuitOpen, true);
  assert.equal(cancelled.cell.health.circuitOpenedAt, cell.health.circuitOpenedAt);

  const transient = applyChatStructuredEvidenceOutcome(cell, {
    attempted: true,
    ok: false,
    reason: 'provider_request_failed',
    diagnostics: { httpStatus: 429 },
  }, { now: () => halfOpenAt });
  assert.equal(transient.action, 'transient_cooldown');
  assert.equal(transient.cell.health.circuitOpen, true);
  assert.equal(transient.cell.health.circuitOpenedAt, cell.health.circuitOpenedAt);
  console.log('ok - cancelled and transient half-open attempts never close or restart the circuit');
}

{
  let json = createEmptyChatStructuredEvidenceCell({
    identity: baseIdentity,
    mode: CHAT_STRUCTURED_ROUTE_MODES.jsonTerminal,
    now: () => now,
  });
  json = applyChatStructuredEvidenceOutcome(json, {
    attempted: true,
    ok: false,
    reason: 'invalid_terminal_json',
  }, { now: () => now + 1 }).cell;
  json = applyChatStructuredEvidenceOutcome(json, {
    attempted: true,
    ok: false,
    reason: 'invalid_terminal_envelope',
  }, { now: () => now + 2 }).cell;
  const route = resolveChatStructuredRoute({
    enabled: true,
    verifiedFc: { enabled: false, reason: 'not_verified' },
    fcProbation: { eligible: false, reason: 'not_verified' },
    jsonTerminal: { eligible: true },
    jsonEvidence: json,
    now: () => now + 2 + CHAT_STRUCTURED_EVIDENCE_HALF_OPEN_TTL_MS,
  });
  assert.equal(route.mode, CHAT_STRUCTURED_ROUTE_MODES.jsonTerminal);
  assert.equal(route.layer, 'json_half_open');
  assert.equal(route.halfOpen, true);
  console.log('ok - JSON terminal uses the same bounded half-open route after TTL');
}

console.log('chat-structured-route-evidence-tests passed');
