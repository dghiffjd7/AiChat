import assert from 'node:assert/strict';

import {
  PROVIDER_TOOL_RESULT_PREVIEW_FORMATS,
  buildProviderToolResultRequestPreview,
} from '../../src/scripts/agent/provider-tool-result-request-preview.js';

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
  assert.equal(preview.messages[0].tool_calls[0].function.name, 'contact_profile.list');
  assert.equal(preview.messages[0].tool_calls[0].function.arguments, '{"limit":1}');
  assert.equal(preview.messages[1].role, 'tool');
  assert.equal(preview.messages[1].tool_call_id, 'call-1');
  const content = JSON.parse(preview.messages[1].content);
  assert.deepEqual(content, {
    toolName: 'contact_profile.list',
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
    name: 'contact_profile.list',
    input: { limit: 1 },
  });
  assert.equal(preview.messages[1].role, 'user');
  assert.equal(preview.messages[1].content[0].type, 'tool_result');
  assert.equal(preview.messages[1].content[0].tool_use_id, 'toolu-1');
  assert.equal(preview.messages[1].content[0].is_error, true);
  assert.deepEqual(JSON.parse(preview.messages[1].content[0].content), {
    toolName: 'contact_profile.list',
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
    name: 'contact_profile.list',
    args: { limit: 2 },
  });
  assert.equal(preview.contents[1].role, 'user');
  assert.deepEqual(preview.contents[1].parts[0].functionResponse, {
    name: 'contact_profile.list',
    response: { rows: [{ key: 'mood', value: 'calm' }] },
  });
  console.log('ok - provider tool result preview formats Gemini functionResponse messages');
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
