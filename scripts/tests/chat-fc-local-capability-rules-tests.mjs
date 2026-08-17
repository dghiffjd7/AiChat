import assert from 'node:assert/strict';
import {
  CHAT_FC_LOCAL_BREAKER_THRESHOLD,
  applyChatFcLocalRuleAttemptOutcome,
  buildChatFcLocalRuleFromProfile,
  getChatFcLocalCapabilityRules,
  normalizeChatFcLocalRule,
  replaceChatFcLocalCapabilityRules,
} from '../../src/scripts/agent/chat-fc-local-capability-rules.js';
import { readChatFcCapability } from '../../src/scripts/agent/chat-fc-capability-catalog.js';
import {
  resolveChatProviderFcRelease,
  resolveProviderFcTransport,
} from '../../src/scripts/agent/provider-fc-transport.js';

const fixedNow = () => 1786752000000;

const customProfile = {
  id: 'profile-custom',
  name: '本地中转',
  provider: 'custom',
  baseUrl: 'https://relay.example.test/v1/',
  model: 'vendor/new-tool-model',
};

{
  const fixtures = [
    [
      {
        id: 'profile-kimi-global',
        name: 'Kimi Global',
        provider: 'kimi',
        baseUrl: 'https://api.moonshot.ai/v1',
        model: 'kimi-k3',
      },
      'local_kimi_chat_completions',
    ],
    [
      {
        id: 'profile-zhipu',
        name: '智谱 GLM',
        provider: 'zhipu',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        model: 'glm-5.2',
      },
      'local_zhipu_chat_completions',
    ],
  ];
  fixtures.forEach(([profile, endpointClass]) => {
    const built = buildChatFcLocalRuleFromProfile(profile, {
      enabled: false,
      now: fixedNow,
    });
    assert.equal(built.ok, true, `${profile.provider}: ${built.reason}`);
    assert.equal(built.rule.identity.endpointClass, endpointClass);
    assert.equal(built.rule.identity.transportAdapter, 'openai_chat_completions');
    assert.equal(built.rule.policy.terminal, 'forced_terminal');
  });
  console.log('ok - direct Kimi and Zhipu profiles can form exact disabled candidate rules');
}

{
  const built = buildChatFcLocalRuleFromProfile(customProfile, {
    enabled: true,
    now: fixedNow,
  });
  assert.equal(built.ok, true, built.reason);
  assert.equal(built.rule.identity.providerId, 'custom');
  assert.equal(built.rule.identity.baseUrl, 'https://relay.example.test/v1');
  assert.equal(built.rule.identity.modelId, 'vendor/new-tool-model');
  assert.equal(built.rule.identity.transportAdapter, 'openai_chat_completions');
  assert.equal(built.rule.identity.endpointClass, 'local_custom_openai_chat_completions');
  assert.deepEqual(built.rule.surfaces, ['private_chat', 'group_chat', 'moment_comment']);
  assert.equal(built.rule.policy.terminal, 'forced_terminal');
  assert.equal(built.rule.capabilities.streamingArguments, false);
  assert.equal(JSON.stringify(built.rule).includes('apiKey'), false);
  console.log('ok - local advanced rule derives a fixed, non-secret identity from a saved profile');
}

{
  for (const [profile, reason] of [
    [{ ...customProfile, baseUrl: 'https://user:secret@relay.example.test/v1' }, 'base_url_credentials_forbidden'],
    [{ ...customProfile, baseUrl: 'https://relay.example.test/v1?route=other' }, 'base_url_query_forbidden'],
    [{ ...customProfile, baseUrl: 'https://relay.example.test/v1#unsafe' }, 'base_url_fragment_forbidden'],
    [{ ...customProfile, model: '' }, 'model_id_required'],
    [{ ...customProfile, provider: 'ollama' }, 'ollama_local_rule_deferred'],
  ]) {
    const built = buildChatFcLocalRuleFromProfile(profile, { now: fixedNow });
    assert.equal(built.ok, false);
    assert.equal(built.reason, reason);
  }
  const injected = normalizeChatFcLocalRule({
    ...(buildChatFcLocalRuleFromProfile(customProfile, { now: fixedNow }).rule || {}),
    schemaProfiles: ['attacker.schema.v1'],
  }, { now: fixedNow });
  assert.equal(injected.ok, false);
  assert.equal(injected.reason, 'schema_profile_unsupported');
  console.log('ok - local rules reject credentialed URLs, non-exact URLs, deferred Ollama, and arbitrary schemas');
}

{
  const built = buildChatFcLocalRuleFromProfile(customProfile, {
    enabled: true,
    now: fixedNow,
  });
  assert.equal(built.ok, true);
  replaceChatFcLocalCapabilityRules([built.rule], { now: fixedNow });

  const matched = readChatFcCapability({
    providerId: 'custom',
    baseUrl: customProfile.baseUrl,
    modelId: customProfile.model,
  });
  assert.equal(matched.matched, true);
  assert.equal(matched.layer, 'local_advanced');
  assert.equal(matched.ruleId, built.rule.ruleId);
  assert.equal(matched.capabilities.basicToolCall, true);

  for (const query of [
    { providerId: 'custom', baseUrl: 'https://other.example.test/v1', modelId: customProfile.model },
    { providerId: 'custom', baseUrl: customProfile.baseUrl, modelId: `${customProfile.model}:latest` },
    { providerId: 'openai', baseUrl: customProfile.baseUrl, modelId: customProfile.model },
  ]) {
    assert.equal(readChatFcCapability(query).matched, false);
  }

  const transport = resolveProviderFcTransport(customProfile);
  assert.equal(transport.supported, true);
  assert.equal(transport.endpoint, 'local_custom_openai_chat_completions');
  const release = resolveChatProviderFcRelease(customProfile);
  assert.equal(release.enabled, true);
  assert.equal(release.capabilitySource, 'local_advanced');
  assert.equal(release.capabilityLayer, 'local_advanced');

  const copy = getChatFcLocalCapabilityRules();
  copy[0].capabilities.schemaSubsets.push('mutated');
  assert.equal(getChatFcLocalCapabilityRules()[0].capabilities.schemaSubsets.includes('mutated'), false);
  console.log('ok - enabled local rules match only the exact provider/base URL/model and can release custom Chat Completions');
}

{
  const openRouterProfile = {
    id: 'profile-openrouter-route',
    name: 'OpenRouter 精确路由',
    provider: 'openrouter',
    baseUrl: 'https://openrouter.example.test/api/v1',
    model: 'google/gemini-3.7-flash',
    providerRoute: 'google-ai-studio/flex',
  };
  const built = buildChatFcLocalRuleFromProfile(openRouterProfile, {
    enabled: true,
    route: openRouterProfile.providerRoute,
    now: fixedNow,
  });
  assert.equal(built.ok, true, built.reason);
  replaceChatFcLocalCapabilityRules([built.rule], { now: fixedNow });
  assert.equal(readChatFcCapability({
    providerId: openRouterProfile.provider,
    baseUrl: openRouterProfile.baseUrl,
    modelId: openRouterProfile.model,
  }).matched, false);
  assert.equal(readChatFcCapability({
    providerId: openRouterProfile.provider,
    baseUrl: openRouterProfile.baseUrl,
    modelId: openRouterProfile.model,
    route: 'other-provider/route',
  }).matched, false);
  assert.equal(readChatFcCapability({
    providerId: openRouterProfile.provider,
    baseUrl: openRouterProfile.baseUrl,
    modelId: openRouterProfile.model,
    route: openRouterProfile.providerRoute,
  }).matched, true);
  const routedRelease = resolveChatProviderFcRelease(openRouterProfile);
  assert.equal(routedRelease.enabled, true);
  assert.equal(routedRelease.capabilityLayer, 'local_advanced');
  const routeOmittedRelease = resolveChatProviderFcRelease({
    ...openRouterProfile,
    providerRoute: '',
  });
  assert.equal(routeOmittedRelease.enabled, false);
  assert.equal(routeOmittedRelease.reason, 'unverified_provider_endpoint');
  replaceChatFcLocalCapabilityRules([], { now: fixedNow });
  console.log('ok - route-bound local rules require the exact route and never match an omitted route');
}

{
  const built = buildChatFcLocalRuleFromProfile(customProfile, {
    enabled: false,
    now: fixedNow,
  });
  replaceChatFcLocalCapabilityRules([built.rule], { now: fixedNow });
  assert.equal(readChatFcCapability({
    providerId: 'custom',
    baseUrl: customProfile.baseUrl,
    modelId: customProfile.model,
  }).matched, false);
  assert.equal(resolveProviderFcTransport(customProfile).reason, 'unverified_custom_endpoint');
  replaceChatFcLocalCapabilityRules([], { now: fixedNow });
  console.log('ok - disabled local rules remain inert and unknown custom endpoints fail closed');
}

{
  const initial = buildChatFcLocalRuleFromProfile(customProfile, {
    enabled: true,
    now: fixedNow,
  }).rule;
  const transient = applyChatFcLocalRuleAttemptOutcome(initial, {
    attempted: true,
    ok: false,
    reason: 'provider_request_failed',
  }, { now: fixedNow });
  assert.equal(transient.changed, false);
  assert.equal(transient.rule.health.consecutiveDeterministicFailures, 0);

  const first = applyChatFcLocalRuleAttemptOutcome(initial, {
    attempted: true,
    ok: false,
    reason: 'no_tool_call',
  }, { now: fixedNow });
  assert.equal(first.changed, true);
  assert.equal(first.action, 'failure_recorded');
  assert.equal(first.rule.health.consecutiveDeterministicFailures, 1);
  assert.equal(first.rule.health.circuitOpen, false);

  const second = applyChatFcLocalRuleAttemptOutcome(first.rule, {
    attempted: true,
    ok: false,
    reason: 'invalid_phone_reply_ir',
  }, { now: fixedNow });
  assert.equal(CHAT_FC_LOCAL_BREAKER_THRESHOLD, 2);
  assert.equal(second.action, 'circuit_opened');
  assert.equal(second.rule.health.consecutiveDeterministicFailures, 2);
  assert.equal(second.rule.health.circuitOpen, true);
  replaceChatFcLocalCapabilityRules([second.rule], { now: fixedNow });
  const blocked = readChatFcCapability({
    providerId: 'custom',
    baseUrl: customProfile.baseUrl,
    modelId: customProfile.model,
  });
  assert.equal(blocked.matched, false);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.blockReason, 'local_rule_circuit_open');
  assert.equal(blocked.ruleId, second.rule.ruleId);
  const blockedRelease = resolveChatProviderFcRelease(customProfile);
  assert.equal(blockedRelease.enabled, false);
  assert.equal(blockedRelease.reason, 'local_rule_circuit_open');
  assert.equal(blockedRelease.capabilityLayer, 'local_advanced');
  assert.equal(blockedRelease.capabilityRuleId, second.rule.ruleId);
  assert.equal(blockedRelease.localRuleHealth.circuitOpen, true);

  const recovered = applyChatFcLocalRuleAttemptOutcome(first.rule, {
    attempted: true,
    ok: true,
    reason: '',
  }, { now: fixedNow });
  assert.equal(recovered.action, 'failure_count_reset');
  assert.equal(recovered.rule.health.consecutiveDeterministicFailures, 0);
  assert.equal(recovered.rule.health.circuitOpen, false);
  replaceChatFcLocalCapabilityRules([], { now: fixedNow });
  console.log('ok - only deterministic FC contract failures open the local rule circuit after two attempts');
}

console.log('chat-fc-local-capability-rules-tests passed');
