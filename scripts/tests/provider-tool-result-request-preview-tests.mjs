import assert from 'node:assert/strict';

import {
  PROVIDER_TOOL_RESULT_PREVIEW_FORMATS,
  buildProviderToolResultRequestPreview,
} from '../../src/scripts/agent/provider-tool-result-request-preview.js';
import { readProviderToolContinuationContext } from '../../src/scripts/agent/provider-tool-continuation-context.js';

{
  const preview = buildProviderToolResultRequestPreview({
    provider: 'openai',
    model: 'gpt-x',
    sessionId: 's1',
    assistantToolCalls: [{
      toolCallId: 'call-1',
      toolName: 'contact_profile.list',
      arguments: { limit: 1 },
    }],
    toolResults: [{
      toolCallId: 'call-1',
      status: 'succeeded',
      output: {
        result: { items: [{ id: 'c1', name: 'Alice' }] },
        summary: '1 contact available',
      },
    }],
  });

  assert.equal(preview.network, false);
  assert.equal(preview.format, PROVIDER_TOOL_RESULT_PREVIEW_FORMATS.openai);
  assert.equal(preview.messages[0].role, 'assistant');
  assert.equal(preview.messages[0].tool_calls[0].id, 'call-1');
  assert.equal(preview.messages[0].tool_calls[0].function.name, 'contact_profile_list');
  assert.equal(preview.messages[0].tool_calls[0].function.arguments, '{"limit":1}');
  assert.equal(preview.messages[1].role, 'tool');
  assert.equal(preview.messages[1].tool_call_id, 'call-1');
  const content = JSON.parse(preview.messages[1].content);
  assert.deepEqual(content, {
    toolName: 'contact_profile_list',
    status: 'succeeded',
    summary: '1 contact available',
  });
  console.log('ok - provider tool result preview formats OpenAI tool result messages and filters fields');
}

{
  const preview = buildProviderToolResultRequestPreview({
    provider: 'anthropic',
    assistantToolCalls: [{
      id: 'toolu-1',
      toolName: 'contact_profile.list',
      arguments: { limit: 1 },
    }],
    toolResults: [{
      toolCallId: 'toolu-1',
      status: 'failed',
      errorMessage: 'lookup failed',
      stack: 'hidden stack',
    }],
  });

  assert.equal(preview.format, PROVIDER_TOOL_RESULT_PREVIEW_FORMATS.anthropic);
  assert.equal(preview.messages[0].role, 'assistant');
  assert.deepEqual(preview.messages[0].content[0], {
    type: 'tool_use',
    id: 'toolu-1',
    name: 'contact_profile_list',
    input: { limit: 1 },
  });
  assert.equal(preview.messages[1].role, 'user');
  assert.equal(preview.messages[1].content[0].type, 'tool_result');
  assert.equal(preview.messages[1].content[0].tool_use_id, 'toolu-1');
  assert.equal(preview.messages[1].content[0].is_error, true);
  assert.deepEqual(JSON.parse(preview.messages[1].content[0].content), {
    toolName: 'contact_profile_list',
    status: 'failed',
    summary: 'lookup failed',
  });
  console.log('ok - provider tool result preview formats Anthropic tool_result messages for failures');
}

{
  const preview = buildProviderToolResultRequestPreview({
    provider: 'vertexai',
    assistantToolCalls: [{
      id: 'gemini-call-1',
      toolName: 'contact_profile.list',
      arguments: { limit: 2 },
    }],
    toolResults: [{
      toolCallId: 'gemini-call-1',
      resultForModel: {
        rows: [{ key: 'mood', value: 'calm' }],
        rawPayload: { full: 'hidden' },
      },
    }],
  });

  assert.equal(preview.format, PROVIDER_TOOL_RESULT_PREVIEW_FORMATS.gemini);
  assert.equal(preview.contents[0].role, 'model');
  assert.deepEqual(preview.contents[0].parts[0].functionCall, {
    name: 'contact_profile_list',
    args: { limit: 2 },
  });
  assert.equal(preview.contents[1].role, 'user');
  assert.deepEqual(preview.contents[1].parts[0].functionResponse, {
    name: 'contact_profile_list',
    response: { rows: [{ key: 'mood', value: 'calm' }] },
  });
  console.log('ok - provider tool result preview formats Gemini functionResponse messages');
}

{
  const responseOutput = [
    { type: 'reasoning', id: 'rs-1', encrypted_content: 'opaque' },
    {
      type: 'function_call',
      id: 'fc-1',
      call_id: 'call-responses-1',
      name: 'contact_profile_list',
      arguments: '{"limit":1}',
    },
  ];
  const historyMessages = [{ role: 'user', content: 'list one contact' }];
  const providerRequestOptions = {
    tools: [{ type: 'function', function: { name: 'contact_profile_list', parameters: { type: 'object' } } }],
  };
  const preview = buildProviderToolResultRequestPreview({
    provider: 'openai',
    assistantToolCalls: [{
      id: 'call-responses-1',
      toolName: 'contact_profile.list',
      arguments: { limit: 1 },
      providerContinuation: {
        api: 'openai_responses',
        assistantOutput: responseOutput,
      },
    }],
    toolResults: [{
      toolCallId: 'call-responses-1',
      resultForModel: { summary: 'listed' },
    }],
    historyMessages,
    providerRequestOptions,
  });
  const context = readProviderToolContinuationContext(preview);

  assert.equal(preview.format, PROVIDER_TOOL_RESULT_PREVIEW_FORMATS.openaiResponses);
  assert.deepEqual(preview.input.slice(0, 2), responseOutput);
  assert.deepEqual(preview.input[2], {
    type: 'function_call_output',
    call_id: 'call-responses-1',
    output: '{"summary":"listed"}',
  });
  assert.deepEqual(context.historyMessages, historyMessages);
  assert.deepEqual(context.providerRequestOptions, providerRequestOptions);
  assert.equal(Object.keys(preview).includes('historyMessages'), false);
  console.log('ok - provider tool result preview builds stateless OpenAI Responses continuation privately');
}

{
  const preview = buildProviderToolResultRequestPreview({
    provider: 'gemini',
    assistantToolCalls: [{
      id: 'gemini-signed-1',
      toolName: 'contact_profile.list',
      arguments: { limit: 1 },
      providerContinuation: {
        api: 'gemini_generate_content',
        assistantContent: {
          role: 'model',
          parts: [{
            thoughtSignature: 'opaque-signature',
            functionCall: {
              id: 'gemini-signed-1',
              name: 'contact_profile_list',
              args: { limit: 1 },
            },
          }],
        },
      },
    }],
    toolResults: [{ toolCallId: 'gemini-signed-1', resultForModel: { summary: 'listed' } }],
  });

  assert.equal(preview.contents[0].parts[0].thoughtSignature, 'opaque-signature');
  assert.equal(preview.contents[1].parts[0].functionResponse.name, 'contact_profile_list');
  console.log('ok - provider tool result preview preserves Gemini thought signatures exactly');
}

{
  const preview = buildProviderToolResultRequestPreview({
    provider: 'unknown-provider',
    assistantToolCalls: [{
      id: 'call-unknown',
      toolName: 'contact_profile.list',
      arguments: { limit: 1 },
    }],
    toolResults: [{
      toolCallId: 'call-unknown',
      resultForModel: {
        text: 'abcdefghijklmnopqrstuvwxyz',
        permission: { checks: ['hidden'] },
      },
    }],
    maxContentChars: 18,
  });

  assert.equal(preview.format, PROVIDER_TOOL_RESULT_PREVIEW_FORMATS.generic);
  assert.equal(preview.toolResults[0].toolCallId, 'call-unknown');
  assert.equal(preview.toolResults[0].result.truncated, true);
  assert.equal(preview.toolResults[0].result.value.length, 18);
  assert.equal(preview.toolResults[0].result.value.includes('permission'), false);
  console.log('ok - provider tool result preview falls back and truncates sanitized results');
}

{
  const preview = buildProviderToolResultRequestPreview({
    provider: 'openai',
    assistantToolCalls: [{
      id: 'call-skip',
      toolName: 'memory.snapshot',
      arguments: { scope: 'session' },
    }],
    toolResults: [{
      toolCallId: 'call-skip',
      output: { result: { rows: [{ secret: 'hidden' }] }, summary: 'memory rows' },
    }],
  });

  assert.equal(preview.format, PROVIDER_TOOL_RESULT_PREVIEW_FORMATS.generic);
  assert.equal(preview.toolResultCount, 0);
  assert.equal(preview.skippedToolResultCount, 1);
  assert.equal(preview.skippedToolResults[0].toolName, 'memory.snapshot');
  assert.equal(preview.skippedToolResults[0].reason.includes('not allowed'), true);
  console.log('ok - provider tool result preview skips tools outside model-context policy');
}

{
  const preview = buildProviderToolResultRequestPreview({
    provider: 'anthropic',
    assistantToolCalls: [
      { id: 'toolu-allowed', toolName: 'contact_profile.list', arguments: {} },
      { id: 'toolu-blocked', toolName: 'memory.snapshot', arguments: {} },
    ],
    toolResults: [
      { toolCallId: 'toolu-allowed', resultForModel: { summary: 'listed' } },
      { toolCallId: 'toolu-blocked', output: { summary: 'must stay private' } },
    ],
  });

  assert.equal(preview.format, PROVIDER_TOOL_RESULT_PREVIEW_FORMATS.generic);
  assert.deepEqual(preview.toolResults, []);
  assert.equal(preview.skippedToolResultCount, 1);
  console.log('ok - a partially disallowed assistant turn fails closed instead of sending an incomplete native continuation');
}
