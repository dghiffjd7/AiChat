import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildPrivateChatStructuredPromptMessages,
  buildPrivateChatStructuredTransportInstruction,
  normalizePrivateChatProviderFcCalls,
  preparePrivateChatProviderFcRoute,
  resolvePrivateChatProviderFcEligibility,
  runPrivateChatGenerationWithFallback,
  runPrivateChatProviderFcAttempt,
} from '../../src/scripts/ui/chat/private-chat-provider-fc.js';
import { PHONE_REPLY_IR_PRIVATE_TOOL_NAME } from '../../src/scripts/ui/chat/phone-reply-ir.js';
import { assembleLegacyTextRequest } from '../../src/scripts/ui/chat/chat-semantic-snapshot-utils.js';
import { DialogueStreamParser } from '../../src/scripts/ui/chat/dialogue-stream-parser.js';

const config = {
  provider: 'deepseek',
  model: 'deepseek-v4-flash',
  baseUrl: 'https://api.deepseek.com/v1',
};
const openCodeConfig = {
  provider: 'opencode',
  model: 'glm-5.3',
  baseUrl: 'https://opencode.ai/zen/go/v1',
};
const messages = [
  { role: 'system', content: '你是米娅。请自然、简短地回应当前用户。' },
  { role: 'user', content: '今天辛苦了。' },
];
const target = {
  sessionId: 'session-mia',
  targetName: '米娅',
  speakerId: 'contact-mia',
  speakerName: '米娅',
  userName: '我',
};
const context = {
  uiMode: 'chat',
  surface: 'private_chat',
  responseTarget: 'character',
  usesBuiltinFormat: true,
  usesDefaultPreset: true,
  compatibilityModeEnabled: false,
  protocolParserEnabled: true,
  hasUnsupportedSideEffects: false,
  assistantContinuation: false,
  webSearchEnabled: false,
  hasProviderTools: false,
  formatProfileEnabled: false,
};

{
  const phoneLayer = '<线上格式>\nMiPhone_start\nmsg_start\nmsg_end\nMiPhone_end\n</线上格式>';
  const scenarioLayer = '正在与米娅私聊';
  const outputLayer = `${scenarioLayer}\n\n以下为内建格式合同：\nMiPhone_start\nMiPhone_end`;
  const sourceMessages = [
    { role: 'system', content: '角色与世界设定' },
    { role: 'system', content: `共享语义\n\n${phoneLayer}` },
    { role: 'user', content: '你好' },
    { role: 'system', content: outputLayer },
  ];
  const instruction = buildPrivateChatStructuredTransportInstruction({
    allowedItemTypes: ['text', 'sticker', 'voice'],
    allowedStickerKeywords: ['收到'],
  });
  const result = buildPrivateChatStructuredPromptMessages({
    messages: sourceMessages,
    transportPlan: {
      phoneFormatPromptContent: phoneLayer,
      outputFormatReminder: outputLayer,
      scenarioReminder: scenarioLayer,
    },
    instruction,
  });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.diagnostics.phoneLayerRemoved, 1);
  assert.equal(result.diagnostics.outputLayerRemoved, 1);
  assert.equal(result.messages.some(message => /MiPhone_|msg_start/u.test(String(message?.content || ''))), false);
  assert.equal(result.messages.some(message => String(message?.content || '').includes('共享语义')), true);
  assert.equal(result.messages.some(message => String(message?.content || '').includes(scenarioLayer)), true);
  assert.equal(result.messages.some(message => String(message?.content || '').includes('收到')), true);
  assert.equal(sourceMessages[1].content.includes('MiPhone_start'), true);
  assert.match(result.snapshotFingerprint, /^chat-semantic-v1:/u);
  assert.deepEqual(assembleLegacyTextRequest(result.semanticSnapshot).messages, sourceMessages);

  const unsafe = buildPrivateChatStructuredPromptMessages({
    messages: [...sourceMessages, { role: 'system', content: '外部自定义要求 MiPhone_start' }],
    transportPlan: {
      phoneFormatPromptContent: phoneLayer,
      outputFormatReminder: outputLayer,
      scenarioReminder: scenarioLayer,
    },
    instruction,
  });
  assert.equal(unsafe.ok, false);
  assert.equal(unsafe.reason, 'text_protocol_prompt_present');
  console.log('ok - structured prompt strips only known text transport layers and fails closed on external protocol text');
}

{
  const phoneLayer = '内建完整私聊协议\nMiPhone_start\nmsg_start\nmsg_end\nMiPhone_end';
  const outputLayer = '正在与米娅私聊\n\nMiPhone_start\nMiPhone_end';
  const legacyMessages = [
    { role: 'system', content: `共享角色语义\n\n${phoneLayer}` },
    { role: 'user', content: '你好' },
    { role: 'system', content: outputLayer },
  ];
  const prepared = preparePrivateChatProviderFcRoute({
    enabled: true,
    config,
    client: { chat() {} },
    messages: legacyMessages,
    transportPlan: {
      phoneFormatPromptContent: phoneLayer,
      outputFormatReminder: outputLayer,
      scenarioReminder: '正在与米娅私聊',
    },
    context,
    target,
    allowedItemTypes: ['text', 'sticker'],
    allowedStickerKeywords: ['收到'],
  });
  assert.equal(prepared.eligible, true, prepared.reason);
  assert.equal(prepared.messages.some(message => /MiPhone_|msg_start/u.test(String(message?.content || ''))), false);
  assert.equal(prepared.messages.some(message => String(message?.content || '').includes('共享角色语义')), true);
  assert.equal(legacyMessages[0].content.includes('MiPhone_start'), true);

  const unsafe = preparePrivateChatProviderFcRoute({
    enabled: true,
    config,
    client: { chat() {} },
    messages: [...legacyMessages, { role: 'system', content: '自定义 MiPhone_start 合同' }],
    transportPlan: {
      phoneFormatPromptContent: phoneLayer,
      outputFormatReminder: outputLayer,
      scenarioReminder: '正在与米娅私聊',
    },
    context,
    target,
  });
  assert.equal(unsafe.eligible, false);
  assert.equal(unsafe.reason, 'text_protocol_prompt_present');
  const unsupportedSideEffect = preparePrivateChatProviderFcRoute({
    enabled: true,
    config,
    client: { chat() {} },
    messages: [...legacyMessages, { role: 'system', content: '需要时输出 <tableEdit>...</tableEdit>' }],
    transportPlan: {
      phoneFormatPromptContent: phoneLayer,
      outputFormatReminder: outputLayer,
      scenarioReminder: '正在与米娅私聊',
    },
    context,
    target,
  });
  assert.equal(unsupportedSideEffect.eligible, false);
  assert.equal(unsupportedSideEffect.reason, 'text_protocol_prompt_present');
  console.log('ok - private FC route derives one structured prompt from the already-built legacy prompt and fails closed');
}

{
  const phoneLayer = '内建完整私聊协议\nMiPhone_start\nmsg_start\nmsg_end\nMiPhone_end';
  const outputLayer = '正在与米娅私聊\n\nMiPhone_start\nMiPhone_end';
  const phoneMarker = '\uE000chat-semantic:req-private:phone_format\uE001';
  const outputMarker = '\uE000chat-semantic:req-private:output_format\uE001';
  const prepared = preparePrivateChatProviderFcRoute({
    enabled: true,
    config,
    client: { chat() {} },
    messages: [
      { role: 'system', content: '共享角色语义' },
      { role: 'system', content: phoneMarker },
      { role: 'user', content: '你好' },
      { role: 'system', content: outputMarker },
    ],
    transportPlan: {
      phoneFormatPromptContent: phoneLayer,
      outputFormatReminder: outputLayer,
      scenarioReminder: '正在与米娅私聊',
      transportLayersDeferred: true,
      deferredLegacyLayers: [
        { id: 'phone_format', content: phoneLayer, marker: phoneMarker },
        { id: 'output_format', content: outputLayer, marker: outputMarker },
      ],
    },
    context,
    target,
    snapshotContext: {
      requestId: 'req-private',
      turnId: 'turn-private',
      sessionId: target.sessionId,
    },
  });
  assert.equal(prepared.eligible, true, prepared.reason);
  assert.equal(prepared.messages.some(message => String(message?.content || '').includes('chat-semantic:')), false);
  assert.equal(prepared.semanticSnapshot.identity.requestId, 'req-private');
  assert.equal(prepared.toolSchemaDiagnostics.redacted, true);
  assert.equal(prepared.toolSchemaDiagnostics.toolName, PHONE_REPLY_IR_PRIVATE_TOOL_NAME);
  const legacy = assembleLegacyTextRequest(prepared.semanticSnapshot);
  assert.equal(legacy.messages[1].content, phoneLayer);
  assert.equal(legacy.messages[3].content, outputLayer);
  console.log('ok - private FC direct assembly consumes deferred named anchors and preserves one lazy legacy fallback');
}

const emitToolCall = (options, {
  name = PHONE_REPLY_IR_PRIVATE_TOOL_NAME,
  args = { messages: [{ content: '你也辛苦了。', time: '21:08' }] },
  id = 'call-private-1',
} = {}) => {
  options.onProviderToolCallDelta({
    choices: [{
      message: {
        tool_calls: [{
          id,
          type: 'function',
          function: { name, arguments: JSON.stringify(args) },
        }],
      },
      finish_reason: 'tool_calls',
    }],
  }, { provider: 'deepseek', model: 'deepseek-v4-flash' });
};

{
  const eligible = resolvePrivateChatProviderFcEligibility({
    enabled: true,
    config,
    client: { chat() {} },
    messages,
    context,
    target,
  });
  assert.equal(eligible.eligible, true);
  assert.equal(eligible.reason, '');

  const cases = [
    [{ enabled: false }, 'feature_disabled'],
    [{ config: { ...config, provider: 'custom' } }, 'unverified_custom_endpoint'],
    [{ context: { ...context, uiMode: 'rp' } }, 'creative_mode'],
    [{ context: { ...context, surface: 'group_chat' } }, 'unsupported_surface'],
    [{ context: { ...context, responseTarget: 'user' } }, 'unsupported_response_target'],
    [{ context: { ...context, protocolParserEnabled: false } }, 'protocol_parser_disabled'],
    [{ context: { ...context, hasUnsupportedSideEffects: true } }, 'unsupported_side_effects'],
    [{ context: { ...context, webSearchEnabled: true } }, 'web_search_enabled'],
    [{ context: { ...context, hasProviderTools: true } }, 'provider_tools_present'],
    [{ context: { ...context, hasAssistantPrefill: true } }, 'assistant_prefill_present'],
    [{ context: { ...context, usesDefaultPreset: false } }, 'custom_preset'],
    [{ context: { ...context, formatProfileEnabled: true } }, 'custom_format_profile'],
    [{ context: { ...context, compatibilityModeEnabled: true } }, 'compatibility_mode'],
    [{ messages: [{ role: 'system', content: 'MiPhone_start\nmsg_start' }] }, 'text_protocol_prompt_present'],
    [{ target: { ...target, sessionId: '' } }, 'target_unavailable'],
  ];
  cases.forEach(([patch, reason]) => {
    const result = resolvePrivateChatProviderFcEligibility({
      enabled: true,
      config,
      client: { chat() {} },
      messages,
      context,
      target,
      ...patch,
    });
    assert.equal(result.eligible, false, reason);
    assert.equal(result.reason, reason);
  });
  [
    { provider: 'openai', model: 'gpt-5.6-sol', baseUrl: 'https://api.openai.com/v1' },
    { provider: 'anthropic', model: 'claude-opus-4-8', baseUrl: 'https://api.anthropic.com/v1' },
    { provider: 'makersuite', model: 'gemini-3.6-flash', baseUrl: 'https://generativelanguage.googleapis.com' },
    { provider: 'opencode', model: 'glm-5.3', baseUrl: 'https://opencode.ai/zen/go/v1' },
  ].forEach((providerConfig) => {
    assert.equal(resolvePrivateChatProviderFcEligibility({
      enabled: true,
      config: providerConfig,
      client: { chat() {} },
      messages,
      context,
      target,
    }).eligible, true, providerConfig.provider);
  });
  console.log('ok - private FC eligibility is narrow, provider-safe, and excludes every text/custom/tool conflict');
}

{
  let capturedOptions = null;
  let providerUsageCalls = 0;
  const result = await runPrivateChatProviderFcAttempt({
    client: {
      async chat(_messages, options) {
        capturedOptions = options;
        options.onProviderUsage({ promptTokens: 10, completionTokens: 4, totalTokens: 14 });
        emitToolCall(options);
        return '';
      },
    },
    config,
    messages,
    context,
    target,
    maxTokens: 777,
    requestOptions: {
      top_p: 0.82,
      custom_flag: 'preserved',
      tools: [{ type: 'function', function: { name: 'must_not_survive' } }],
      tool_choice: 'auto',
    },
    onProviderUsage: () => { providerUsageCalls += 1; },
  });
  assert.equal(result.attempted, true);
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.effectiveMode, 'provider_fc');
  assert.equal(result.ir.target.sessionId, 'session-mia');
  assert.equal(result.ir.items[0].speaker.name, '米娅');
  assert.equal(capturedOptions.tools.length, 1);
  assert.equal(capturedOptions.tools[0].function.name, PHONE_REPLY_IR_PRIVATE_TOOL_NAME);
  assert.deepEqual(capturedOptions.tool_choice, {
    type: 'function',
    name: PHONE_REPLY_IR_PRIVATE_TOOL_NAME,
  });
  assert.equal(capturedOptions.openaiApi, 'responses');
  assert.equal(capturedOptions.parallel_tool_calls, false);
  assert.equal(capturedOptions.max_tokens, 777);
  assert.equal(capturedOptions.top_p, 0.82);
  assert.equal(capturedOptions.custom_flag, 'preserved');
  assert.equal(providerUsageCalls, 1);
  assert.deepEqual(capturedOptions.reasoning, { effort: 'none' });
  assert.equal(Object.hasOwn(capturedOptions, 'thinking'), false);
  const parser = new DialogueStreamParser({ userName: '我' });
  const events = [...parser.push(result.raw), ...parser.flush()];
  assert.equal(events.length, 1);
  assert.equal(events[0].otherName, '米娅');
  assert.equal(events[0].messages[0].content, '你也辛苦了。');
  console.log('ok - one DeepSeek FC call becomes a frozen-target IR and canonical parser-compatible raw');
}

{
  let capturedOptions = null;
  const result = await runPrivateChatProviderFcAttempt({
    client: {
      async chat(_messages, options) {
        capturedOptions = options;
        emitToolCall(options);
        return '';
      },
    },
    config: openCodeConfig,
    messages,
    context,
    target,
    temperature: 0,
  });
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(capturedOptions.tool_choice, {
    type: 'function',
    function: { name: PHONE_REPLY_IR_PRIVATE_TOOL_NAME },
  });
  assert.equal(capturedOptions.parallel_tool_calls, false);
  assert.equal(Object.hasOwn(capturedOptions, 'openaiApi'), false);
  assert.equal(capturedOptions.temperature, 0);
  assert.equal(result.ir.source.provider, 'opencode');
  console.log('ok - OpenCode private FC uses the pinned Chat Completions contract and frozen target');
}

{
  const phoneMarker = '\uE000chat-semantic:opencode-fallback:phone_format\uE001';
  const outputMarker = '\uE000chat-semantic:opencode-fallback:output_format\uE001';
  const phoneLayer = 'MiPhone_start\nmsg_start\nmsg_end\nMiPhone_end';
  const outputLayer = '正在与米娅私聊\nMiPhone_start\nMiPhone_end';
  const legacyMessages = [
    { role: 'system', content: '共享角色语义' },
    { role: 'system', content: phoneMarker },
    { role: 'user', content: '你好' },
    { role: 'system', content: outputMarker },
  ];
  const prepared = preparePrivateChatProviderFcRoute({
    enabled: true,
    config: openCodeConfig,
    client: { chat() {} },
    messages: legacyMessages,
    transportPlan: {
      phoneFormatPromptContent: phoneLayer,
      outputFormatReminder: outputLayer,
      scenarioReminder: '正在与米娅私聊',
      transportLayersDeferred: true,
      deferredLegacyLayers: [
        { id: 'phone_format', content: phoneLayer, marker: phoneMarker },
        { id: 'output_format', content: outputLayer, marker: outputMarker },
      ],
    },
    context,
    target,
    snapshotContext: { requestId: 'opencode-fallback', sessionId: target.sessionId },
  });
  assert.equal(prepared.eligible, true, prepared.reason);

  const cases = [
    {
      reason: 'no_tool_call',
      client: { async chat() { return ''; } },
    },
    {
      reason: 'unexpected_response_text',
      client: {
        async chat(_messages, options) {
          emitToolCall(options);
          return 'unexpected text';
        },
      },
    },
    {
      reason: 'multiple_tool_calls',
      client: {
        async chat(_messages, options) {
          options.onProviderToolCallDelta({
            choices: [{
              message: {
                tool_calls: [
                  {
                    id: 'opencode-call-a',
                    type: 'function',
                    function: {
                      name: PHONE_REPLY_IR_PRIVATE_TOOL_NAME,
                      arguments: '{"messages":[{"content":"A"}]}',
                    },
                  },
                  {
                    id: 'opencode-call-b',
                    type: 'function',
                    function: {
                      name: PHONE_REPLY_IR_PRIVATE_TOOL_NAME,
                      arguments: '{"messages":[{"content":"B"}]}',
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            }],
          }, { provider: 'opencode', model: 'glm-5.3' });
          return '';
        },
      },
    },
    {
      reason: 'invalid_arguments_json',
      client: {
        async chat(_messages, options) {
          options.onProviderToolCallDelta({
            choices: [{
              message: {
                tool_calls: [{
                  id: 'opencode-call-bad-json',
                  type: 'function',
                  function: { name: PHONE_REPLY_IR_PRIVATE_TOOL_NAME, arguments: '{bad json' },
                }],
              },
              finish_reason: 'tool_calls',
            }],
          }, { provider: 'opencode', model: 'glm-5.3' });
          return '';
        },
      },
    },
  ];
  for (const fixture of cases) {
    let fallbackCalls = 0;
    const fallback = await runPrivateChatGenerationWithFallback({
      client: fixture.client,
      config: openCodeConfig,
      messages: prepared.messages,
      context,
      target,
      runTextFallback: async () => {
        fallbackCalls += 1;
        return assembleLegacyTextRequest(prepared.semanticSnapshot);
      },
    });
    assert.equal(fallback.ok, true, fixture.reason);
    assert.equal(fallback.effectiveMode, 'legacy_text', fixture.reason);
    assert.equal(fallback.fallbackReason, fixture.reason);
    assert.equal(fallbackCalls, 1, fixture.reason);
    assert.deepEqual(fallback.messages, [
      { role: 'system', content: '共享角色语义' },
      { role: 'system', content: phoneLayer },
      { role: 'user', content: '你好' },
      { role: 'system', content: outputLayer },
    ], fixture.reason);
  }

  let cancellationFallbackCalls = 0;
  const abortError = new Error('Aborted');
  abortError.name = 'AbortError';
  await assert.rejects(() => runPrivateChatGenerationWithFallback({
    client: { async chat() { throw abortError; } },
    config: openCodeConfig,
    messages: prepared.messages,
    context,
    target,
    runTextFallback: async () => { cancellationFallbackCalls += 1; },
  }), error => error?.name === 'AbortError');
  assert.equal(cancellationFallbackCalls, 0);
  console.log('ok - OpenCode rejects malformed terminal outcomes and reuses one frozen snapshot only before commit');
}

{
  const result = await runPrivateChatProviderFcAttempt({
    client: {
      async chat(_messages, options) {
        emitToolCall(options);
        return '不应与工具调用并存的额外正文';
      },
    },
    config,
    messages,
    context,
    target,
  });
  assert.equal(result.attempted, true);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unexpected_response_text');
  assert.equal(result.diagnostics.toolCallCount, 1);
  assert.ok(result.diagnostics.responseChars > 0);
  console.log('ok - private FC rejects extra assistant text instead of silently discarding it');
}

{
  let capturedOptions = null;
  const result = await runPrivateChatProviderFcAttempt({
    client: {
      async chat(_messages, options) {
        capturedOptions = options;
        emitToolCall(options);
        return '';
      },
    },
    config,
    messages,
    context,
    target,
    thinkingEnabled: true,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(capturedOptions.reasoning, { effort: 'none' });
  assert.deepEqual(capturedOptions.tool_choice, {
    type: 'function',
    name: PHONE_REPLY_IR_PRIVATE_TOOL_NAME,
  });
  assert.equal(capturedOptions.openaiApi, 'responses');
  assert.equal(Object.hasOwn(capturedOptions, 'thinking'), false);
  assert.equal(result.diagnostics.thinkingRequested, true);
  assert.equal(result.diagnostics.thinkingEnabled, false);
  assert.equal(result.diagnostics.thinkingOverrideReason, 'deepseek_forced_tool_choice_incompatible');
  console.log('ok - DeepSeek private FC disables incompatible thinking and records the override');
}

{
  const result = await runPrivateChatProviderFcAttempt({
    client: {
      async chat(_messages, options) {
        emitToolCall(options, {
          args: { messages: [{ type: 'sticker', content: '收到' }] },
        });
        return '';
      },
    },
    config,
    messages,
    context,
    target,
    allowedItemTypes: ['text', 'sticker'],
    allowedStickerKeywords: ['收到'],
  });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.ir.items[0].type, 'sticker');
  assert.match(result.raw, /\[bqb-收到\]/u);
  console.log('ok - enabled private special messages retain the same frozen target and canonical transaction boundary');
}

{
  const validCall = {
    toolName: PHONE_REPLY_IR_PRIVATE_TOOL_NAME,
    arguments: { messages: [{ content: '正常回复' }] },
  };
  assert.equal(normalizePrivateChatProviderFcCalls({ completedToolCalls: [], target }).reason, 'no_tool_call');
  assert.equal(normalizePrivateChatProviderFcCalls({
    completedToolCalls: [validCall, { ...validCall, id: 'second' }],
    target,
  }).reason, 'multiple_tool_calls');
  assert.equal(normalizePrivateChatProviderFcCalls({
    completedToolCalls: [{ ...validCall, toolName: 'emit_group_reply' }],
    target,
  }).reason, 'unknown_tool');
  assert.equal(normalizePrivateChatProviderFcCalls({
    completedToolCalls: [{
      ...validCall,
      metadata: { streamingArgumentsText: '{bad json' },
    }],
    target,
  }).reason, 'invalid_arguments_json');
  const repairedQuote = normalizePrivateChatProviderFcCalls({
    completedToolCalls: [{
      ...validCall,
      metadata: {
        streamingArgumentsText: '{"messages":[{"content":"她说"回来吧"。"}]}',
      },
    }],
    target,
  });
  assert.equal(repairedQuote.ok, true, repairedQuote.reason);
  assert.equal(repairedQuote.ir.items[0].content, '她说"回来吧"。');
  assert.equal(repairedQuote.argumentRepairApplied, true);
  assert.deepEqual(repairedQuote.argumentRepairKinds, ['unescaped_quote']);
  assert.equal(normalizePrivateChatProviderFcCalls({
    completedToolCalls: [{
      ...validCall,
      arguments: { messages: [{ content: 'MiPhone_end' }] },
    }],
    target,
  }).reason, 'invalid_phone_reply_ir');
  console.log('ok - private FC rejects zero, multiple, unknown, malformed, and protocol-injection calls');
}

{
  let fallbackCalls = 0;
  const client = { chat: async () => 'plain text without a tool call' };
  const fallback = await runPrivateChatGenerationWithFallback({
    client,
    config,
    messages,
    context,
    target,
    runTextFallback: async ({ reason }) => {
      fallbackCalls += 1;
      return { ok: true, raw: `legacy:${reason}` };
    },
  });
  assert.equal(fallback.ok, true);
  assert.equal(fallback.effectiveMode, 'legacy_text');
  assert.equal(fallback.fallbackReason, 'no_tool_call');
  assert.equal(fallbackCalls, 1);

  const blocked = await runPrivateChatGenerationWithFallback({
    client,
    config,
    messages,
    context,
    target,
    persistentCommitStarted: true,
    runTextFallback: async () => {
      fallbackCalls += 1;
      return { ok: true };
    },
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'fallback_after_commit_forbidden');
  assert.equal(fallbackCalls, 1);
  console.log('ok - text fallback runs only before any persistent commit');
}

{
  let fallbackCalls = 0;
  const malformed = await runPrivateChatGenerationWithFallback({
    client: {
      async chat(_messages, options) {
        emitToolCall(options, { args: { messages: [{ content: 'MiPhone_end' }] } });
        return '';
      },
    },
    config,
    messages,
    context,
    target,
    runTextFallback: async ({ reason }) => {
      fallbackCalls += 1;
      return { ok: true, raw: `legacy:${reason}` };
    },
  });
  assert.equal(malformed.ok, true);
  assert.equal(malformed.effectiveMode, 'legacy_text');
  assert.equal(malformed.fallbackReason, 'invalid_phone_reply_ir');
  assert.equal(fallbackCalls, 1);

  const timeoutError = new Error('Timed out');
  timeoutError.name = 'TimeoutError';
  const timedOut = await runPrivateChatGenerationWithFallback({
    client: { chat: async () => { throw timeoutError; } },
    config,
    messages,
    context,
    target,
    runTextFallback: async ({ reason }) => {
      fallbackCalls += 1;
      return { ok: true, raw: `legacy:${reason}` };
    },
  });
  assert.equal(timedOut.ok, true);
  assert.equal(timedOut.effectiveMode, 'legacy_text');
  assert.equal(timedOut.fallbackReason, 'provider_request_failed');
  assert.equal(fallbackCalls, 2);
  console.log('ok - malformed terminal args and provider timeouts leave no FC commit and fall back exactly once');
}

{
  const abortError = new Error('Aborted');
  abortError.name = 'AbortError';
  await assert.rejects(() => runPrivateChatGenerationWithFallback({
    client: { chat: async () => { throw abortError; } },
    config,
    messages,
    context,
    target,
    runTextFallback: async () => ({ ok: true }),
  }), error => error?.name === 'AbortError');
  console.log('ok - cancellation propagates without invoking legacy fallback');
}

{
  let chatCalls = 0;
  let streamCalls = 0;
  const previewEvents = [];
  const argsText = JSON.stringify({ messages: [{ content: '流式私聊预览', time: '21:18' }] });
  const result = await runPrivateChatProviderFcAttempt({
    client: {
      async chat() {
        chatCalls += 1;
        throw new Error('stream preview must not use chat()');
      },
      async *streamChat(_messages, options) {
        streamCalls += 1;
        options.onProviderToolCallDelta({
          choices: [{ delta: { tool_calls: [{
            index: 0,
            id: 'call-private-stream',
            type: 'function',
            function: { name: PHONE_REPLY_IR_PRIVATE_TOOL_NAME, arguments: '' },
          }] } }],
        }, { provider: 'deepseek', model: 'deepseek-v4-flash' });
        for (const fragment of [argsText.slice(0, 25), argsText.slice(25)]) {
          options.onProviderToolCallDelta({
            choices: [{ delta: { tool_calls: [{
              index: 0,
              function: { arguments: fragment },
            }] } }],
          }, { provider: 'deepseek', model: 'deepseek-v4-flash' });
          yield { type: 'reasoning', content: 'hidden' };
        }
        options.onProviderToolCallDelta({
          choices: [{ delta: {}, finish_reason: 'tool_calls' }],
        }, { provider: 'deepseek', model: 'deepseek-v4-flash' });
      },
    },
    config,
    messages,
    context,
    target,
    streamPreviewEnabled: true,
    onStructuredPreview: event => previewEvents.push(event),
  });
  assert.equal(result.ok, true, result.reason);
  assert.equal(chatCalls, 0);
  assert.equal(streamCalls, 1);
  assert.ok(previewEvents.some(event => event.phase === 'update' && event.text === '流式私聊预览'));
  assert.equal(previewEvents.at(-1)?.phase, 'dispose');
  assert.equal(previewEvents.at(-1)?.outcome, 'accepted');
  assert.equal(result.diagnostics.streamPreviewUsed, true);
  assert.ok(result.diagnostics.previewUpdateCount > 0);
  console.log('ok - private FC streams disposable visible text and accepts only the validated terminal call');
}

{
  let chatCalls = 0;
  let streamCalls = 0;
  let capturedOptions = null;
  const previewEvents = [];
  const argsText = JSON.stringify({ messages: [{ content: 'Responses 私聊回复' }] });
  const result = await runPrivateChatProviderFcAttempt({
    client: {
      async chat() {
        chatCalls += 1;
        throw new Error('Responses stream preview must not use chat()');
      },
      async *streamChat(_messages, options) {
        streamCalls += 1;
        capturedOptions = options;
        options.onProviderToolCallDelta({
          type: 'response.output_item.added',
          output_index: 0,
          item: {
            type: 'function_call',
            id: 'fc-private-responses',
            call_id: 'call-private-responses',
            name: PHONE_REPLY_IR_PRIVATE_TOOL_NAME,
            arguments: '',
          },
        }, { provider: 'openai', model: 'gpt-5.6-sol', api: 'responses' });
        for (const fragment of [argsText.slice(0, 30), argsText.slice(30)]) {
          options.onProviderToolCallDelta({
            type: 'response.function_call_arguments.delta',
            item_id: 'fc-private-responses',
            call_id: 'call-private-responses',
            output_index: 0,
            delta: fragment,
          }, { provider: 'openai', model: 'gpt-5.6-sol', api: 'responses' });
          yield '';
        }
        options.onProviderToolCallDelta({
          type: 'response.output_item.done',
          output_index: 0,
          item: {
            type: 'function_call',
            id: 'fc-private-responses',
            call_id: 'call-private-responses',
            name: PHONE_REPLY_IR_PRIVATE_TOOL_NAME,
            arguments: argsText,
          },
        }, { provider: 'openai', model: 'gpt-5.6-sol', api: 'responses' });
      },
    },
    config: {
      provider: 'openai',
      model: 'gpt-5.6-sol',
      baseUrl: 'https://api.openai.com/v1',
    },
    messages,
    context,
    target,
    streamPreviewEnabled: true,
    onStructuredPreview: event => previewEvents.push(event),
  });
  assert.equal(result.ok, true, result.reason);
  assert.equal(chatCalls, 0);
  assert.equal(streamCalls, 1);
  assert.equal(capturedOptions.openaiApi, 'responses');
  assert.equal(result.diagnostics.streamPreviewUsed, true);
  assert.ok(previewEvents.some(event => (
    event.phase === 'update' && event.text === 'Responses 私聊回复'
  )));
  assert.equal(result.ir.items[0].content, 'Responses 私聊回复');
  console.log('ok - OpenAI Responses private FC streams a disposable argument preview before terminal validation');
}

{
  const bridgeSource = await readFile(
    new URL('../../src/scripts/ui/bridge.js', import.meta.url),
    'utf8',
  );
  const appSource = await readFile(
    new URL('../../src/scripts/ui/app.js', import.meta.url),
    'utf8',
  );
  assert.match(bridgeSource, /preparePrivateChatProviderFcRoute/);
  assert.match(bridgeSource, /const preparedPhoneProviderFcRoute = phoneProviderFcUsesBatch/);
  assert.match(bridgeSource, /resolveChatStructuredRoute\(\{/);
  assert.match(bridgeSource, /preparePhoneReplyJsonRoute\(\{/);
  assert.match(bridgeSource, /preparePhoneBatchProviderFcRoute\(\{/);
  assert.match(bridgeSource, /: preparePrivateChatProviderFcRoute\(\{/);
  assert.match(bridgeSource, /runPhoneBatchProviderFcAttempt\(\{/);
  assert.match(bridgeSource, /runPrivateChatProviderFcAttempt\(\{/);
  assert.match(bridgeSource, /phoneReplyTransport:/);
  assert.match(bridgeSource, /fallbackReason:/);
  assert.match(bridgeSource, /validationErrorCodes:/);
  assert.match(bridgeSource, /argumentRepairApplied:/);
  assert.match(bridgeSource, /argumentRepairKinds:/);
  assert.match(bridgeSource, /thinkingRequested:\s*phoneStructuredThinkingPlan\.thinkingRequested === true/);
  assert.match(bridgeSource, /thinkingEnabled:[\s\S]*?phoneStructuredThinkingPlan\.thinkingEnabled === true/);
  assert.match(bridgeSource, /thinkingOverrideReason:\s*String\(phoneStructuredAttempt\.diagnostics\?\.thinkingOverrideReason/);
  assert.match(bridgeSource, /phoneProviderFcRoute\.eligible/);
  assert.match(bridgeSource, /phoneStructuredPreviewCallback/);
  assert.match(bridgeSource, /streamPreviewEnabled: phoneProviderFcStreamPreviewEnabled/);
  assert.match(appSource, /getPrivateChatProviderFcExperimentStatus/);
  assert.match(appSource, /privateChatProviderFcExperimentEnabled = true/);
  assert.match(bridgeSource, /resolveChatProviderFcRelease/);
  assert.doesNotMatch(bridgeSource, /prepareProviderFcCapabilities/);
  assert.match(bridgeSource, /phoneProviderFcRelease\.capabilities\?\.streamingArguments === true/);
  assert.match(bridgeSource, /providerRolloutReason:/);
  assert.match(appSource, /createDisposableStructuredPreviewRuntime/);
  assert.match(appSource, /showPreviewBubble:\s*false/);
  assert.match(appSource, /onPhoneStructuredPreview: event => structuredPreviewRuntime\.handle\(event\)/);
  console.log('ok - bridge owns the pre-commit four-layer route and one-fallback boundary');
}

console.log('private-chat-provider-fc-tests passed');
