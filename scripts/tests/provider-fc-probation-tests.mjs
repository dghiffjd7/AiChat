import assert from 'node:assert/strict';
import {
  buildProviderFcRequestPlan,
  resolveChatStructuredThinkingPreference,
  resolveProviderFcProbationEligibility,
} from '../../src/scripts/agent/provider-fc-transport.js';

const tool = {
  type: 'function',
  function: {
    name: 'emit_private_reply',
    description: 'terminal',
    parameters: {
      type: 'object',
      required: ['messages'],
      properties: { messages: { type: 'array', items: { type: 'string' } } },
    },
  },
};

{
  const openai = resolveProviderFcProbationEligibility({
    config: {
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'future-exact-model',
    },
  });
  assert.equal(openai.eligible, true, openai.reason);
  assert.equal(openai.transportAdapter, 'openai_responses');

  const deepseek = resolveProviderFcProbationEligibility({
    config: {
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v5-preview',
    },
  });
  assert.equal(deepseek.eligible, true, deepseek.reason);
  const plan = buildProviderFcRequestPlan({
    config: {
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v5-preview',
    },
    tools: [tool],
    probationMode: true,
  });
  assert.equal(plan.ok, true, plan.reason);
  assert.equal(
    plan.requestOptions.tool_choice.function?.name ?? plan.requestOptions.tool_choice.name,
    'emit_private_reply',
  );
  console.log('ok - trusted official Responses transports can try an exact unverified model without a probe');
}

{
  const config = {
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v5-preview',
  };
  const preserve = resolveChatStructuredThinkingPreference({
    config,
    thinkingEnabled: true,
    preference: 'preserve',
  });
  assert.equal(preserve.switchesRequestMode, true);
  assert.equal(preserve.thinkingEnabled, true);
  assert.equal(preserve.probation.reason, 'thinking_preservation_requires_json');
  const stable = resolveChatStructuredThinkingPreference({
    config,
    thinkingEnabled: true,
    preference: 'stable_format',
  });
  assert.equal(stable.switchesRequestMode, false);
  assert.equal(stable.thinkingRequested, true);
  assert.equal(stable.thinkingEnabled, false);
  assert.equal(stable.thinkingOverrideReason, 'user_prefers_stable_format');
  assert.equal(stable.probation.eligible, true);
  console.log('ok - thinking route preference preserves thinking by default and can explicitly favor stable format');
}

{
  const opencodeConfig = {
    provider: 'opencode',
    connectionMode: 'direct',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    model: 'future-chat-completions-model',
  };
  assert.equal(resolveProviderFcProbationEligibility({ config: opencodeConfig }).eligible, true);
  assert.equal(buildProviderFcRequestPlan({
    config: opencodeConfig,
    tools: [tool],
    probationMode: true,
  }).ok, true);
  assert.equal(buildProviderFcRequestPlan({
    config: opencodeConfig,
    tools: [tool],
  }).reason, 'opencode_go_model_unsupported');
  console.log('ok - probation relaxation is explicit and does not weaken the verified release path');
}

{
  for (const [provider, baseUrl] of [
    ['kimi', 'https://api.moonshot.ai/v1'],
    ['zhipu', 'https://open.bigmodel.cn/api/paas/v4'],
  ]) {
    const result = resolveProviderFcProbationEligibility({
      config: { provider, baseUrl, model: 'future-model' },
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, 'forced_terminal_unavailable');
  }
  assert.equal(resolveProviderFcProbationEligibility({
    config: {
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v5-preview',
    },
    thinkingEnabled: true,
  }).reason, 'thinking_preservation_requires_json');
  console.log('ok - auto-only terminal providers and preserved thinking route to JSON instead of fake FC');
}

{
  assert.equal(resolveProviderFcProbationEligibility({
    config: {
      provider: 'custom',
      baseUrl: 'https://unknown.example/v1',
      model: 'model',
    },
  }).reason, 'unverified_custom_endpoint');
  assert.equal(resolveProviderFcProbationEligibility({
    config: {
      provider: 'ollama',
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'local-model',
    },
  }).reason, 'ollama_probation_deferred');
  console.log('ok - unknown custom transports and deferred Ollama remain fail-closed');
}

console.log('provider-fc-probation-tests passed');
