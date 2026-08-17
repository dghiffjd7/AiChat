import assert from 'node:assert/strict';
import {
  BUNDLED_CHAT_FC_CAPABILITY_CATALOG,
  readChatFcCapability,
} from '../../src/scripts/agent/chat-fc-capability-catalog.js';

{
  assert.equal(BUNDLED_CHAT_FC_CAPABILITY_CATALOG.schemaVersion, 1);
  assert.equal(BUNDLED_CHAT_FC_CAPABILITY_CATALOG.revision, 5);
  assert.equal(BUNDLED_CHAT_FC_CAPABILITY_CATALOG.entries.length, 27);

  const fixtures = [
    ['deepseek', 'official_deepseek_responses', 'deepseek-v4-flash'],
    ['deepseek', 'official_deepseek_responses', 'deepseek-v4-pro'],
    ['openai', 'official_openai_responses', 'gpt-5.6-sol'],
    ['openai', 'official_openai_responses', 'gpt-5.6-terra'],
    ['openai', 'official_openai_responses', 'gpt-5.6-luna'],
    ['openai', 'official_openai_responses', 'gpt-5.4'],
    ['openai', 'official_openai_responses', 'gpt-5.4-mini'],
    ['openai', 'official_openai_responses', 'gpt-5.4-nano'],
    ['anthropic', 'official_anthropic_messages', 'claude-opus-4-8'],
    ['anthropic', 'official_anthropic_messages', 'claude-opus-5'],
    ['anthropic', 'official_anthropic_messages', 'claude-sonnet-5'],
    ['anthropic', 'official_anthropic_messages', 'claude-fable-5'],
    ['anthropic', 'official_anthropic_messages', 'claude-opus-4-7'],
    ['anthropic', 'official_anthropic_messages', 'claude-sonnet-4-6'],
    ['anthropic', 'official_anthropic_messages', 'claude-haiku-4-5-20251001'],
    ['opencode', 'official_opencode_go_chat_completions', 'glm-5.3'],
    ['opencode', 'official_opencode_go_chat_completions', 'glm-5.2'],
    ['opencode', 'official_opencode_go_chat_completions', 'glm-5'],
    ['opencode', 'official_opencode_go_chat_completions', 'mimo-v2.5-pro'],
    ['makersuite', 'official_gemini_generate_content', 'gemini-3.7-flash'],
    ['makersuite', 'official_gemini_generate_content', 'gemini-3.6-flash'],
    ['makersuite', 'official_gemini_generate_content', 'gemini-3.5-flash'],
    ['makersuite', 'official_gemini_generate_content', 'gemini-3.1-flash-lite'],
    ['makersuite', 'official_gemini_generate_content', 'gemini-3-flash-preview'],
    ['makersuite', 'official_gemini_generate_content', 'gemini-2.5-flash'],
    ['openrouter', 'official_openrouter_chat_completions', 'google/gemini-3.7-flash'],
    ['zhipu', 'official_zhipu_chat_completions', 'glm-5.2'],
  ];

  fixtures.forEach(([providerId, endpointClass, modelId]) => {
    const result = readChatFcCapability({ providerId, endpointClass, modelId });
    assert.equal(result.matched, true, `${providerId}/${modelId} should match`);
    assert.equal(result.layer, 'bundled');
    assert.equal(result.revision, 5);
    assert.ok(result.ruleId.startsWith('bundled.'));
    assert.equal(result.identity.providerId, providerId);
    assert.equal(result.identity.endpointClass, endpointClass);
    assert.equal(result.identity.modelId, modelId);
    assert.equal(result.capabilities.basicToolCall, true);
    assert.equal(result.capabilities.uniqueTerminalTool, true);
    assert.equal(result.capabilities.streamingArguments, true);
  });

  console.log('ok - bundled FC catalog preserves all ten exact released combinations');
}

{
  for (const modelId of ['glm-5', 'mimo-v2.5-pro']) {
    const result = readChatFcCapability({
      providerId: 'opencode',
      endpointClass: 'official_opencode_go_chat_completions',
      modelId,
    });
    assert.equal(result.evidence.fixtureVersion, 'opencode-fc-matrix-v1');
    assert.equal(result.evidence.transportPassed, 2);
    assert.equal(result.evidence.strictSurfaceSamplesPassed, 30);
    assert.equal(result.evidence.cancellationPassed, true);
    assert.equal(result.evidence.realSessionPassed, true);
  }
  console.log('ok - newly released OpenCode entries retain their exact matrix evidence');
}

{
  const result = readChatFcCapability({
    providerId: 'zhipu',
    endpointClass: 'official_zhipu_chat_completions',
    modelId: 'glm-5.2',
  });
  assert.equal(result.evidence.fixtureVersion, 'direct-provider-k7-candidate-cohort-v1');
  assert.equal(result.evidence.transportPassed, 2);
  assert.equal(result.evidence.strictSurfaceSamplesPassed, 30);
  assert.equal(result.evidence.fallbackBoundaryPassed, true);
  assert.equal(result.evidence.realSessionPassed, true);
  console.log('ok - released Zhipu GLM 5.2 retains its exact direct-provider evidence');
}

{
  for (const modelId of ['glm-5.1', 'mimo-v2.5', 'deepseek-v4-pro']) {
    const result = readChatFcCapability({
      providerId: 'opencode',
      endpointClass: 'official_opencode_go_chat_completions',
      modelId,
    });
    assert.equal(result.matched, false, `${modelId} must remain fail-closed`);
  }
  assert.equal(readChatFcCapability({
    providerId: 'zhipu',
    endpointClass: 'official_zhipu_chat_completions',
    modelId: 'glm-5.1',
  }).matched, false);
  assert.equal(readChatFcCapability({
    providerId: 'kimi',
    endpointClass: 'official_kimi_global_chat_completions',
    modelId: 'kimi-k3',
  }).matched, false);
  console.log('ok - neighboring and failed candidates remain outside the bundled catalog');
}

{
  const openRouter = readChatFcCapability({
    providerId: 'openrouter',
    endpointClass: 'official_openrouter_chat_completions',
    modelId: 'google/gemini-3.7-flash',
  });
  assert.equal(openRouter.identity.route, 'google-ai-studio/flex');
  assert.equal(openRouter.capabilities.providerRoute, 'google-ai-studio/flex');

  for (const query of [
    {
      providerId: 'openrouter',
      endpointClass: 'official_openrouter_chat_completions',
      modelId: 'google/gemini-3.7-flash:latest',
    },
    {
      providerId: 'openai',
      endpointClass: 'official_openai_responses',
      modelId: 'gpt-5.6',
    },
    {
      providerId: 'openai',
      endpointClass: 'official_opencode_go_chat_completions',
      modelId: 'gpt-5.6-sol',
    },
  ]) {
    const result = readChatFcCapability(query);
    assert.equal(result.matched, false);
    assert.equal(result.layer, '');
    assert.deepEqual(result.capabilities, {});
  }

  console.log('ok - catalog lookup is exact and keeps the verified OpenRouter route pinned');
}

{
  const first = readChatFcCapability({
    providerId: 'openai',
    endpointClass: 'official_openai_responses',
    modelId: 'gpt-5.6-sol',
  });
  first.capabilities.schemaSubsets.push('mutated-by-caller');
  const second = readChatFcCapability({
    providerId: 'openai',
    endpointClass: 'official_openai_responses',
    modelId: 'gpt-5.6-sol',
  });
  assert.deepEqual(second.capabilities.schemaSubsets, ['phone.reply.ir.v1']);
  console.log('ok - catalog readers cannot mutate bundled capability evidence');
}
