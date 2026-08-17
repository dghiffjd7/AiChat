import assert from 'node:assert/strict';

import { createProviderToolLlmClientNativeRunner } from '../../src/scripts/agent/provider-tool-llmclient-native-runner.js';
import { runProviderToolRealRunnerAdapter } from '../../src/scripts/agent/provider-tool-real-runner-adapter.js';
import { attachProviderToolContinuationContext } from '../../src/scripts/agent/provider-tool-continuation-context.js';

const buildAnthropicRequest = () => ({
  provider: 'anthropic',
  model: 'claude-native',
  sessionId: 's-native',
  format: 'anthropic_messages_tool_result',
  messages: [
    {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'toolu-1', name: 'contact_profile.list', input: { limit: 1 } }],
    },
    {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'toolu-1', content: '{"summary":"listed"}' }],
    },
  ],
});

const buildGeminiRequest = (provider = 'gemini') => ({
  provider,
  model: 'gemini-native',
  sessionId: 's-native',
  format: 'gemini_function_response',
  contents: [
    { role: 'model', parts: [{ functionCall: { name: 'contact_profile.list', args: { limit: 1 } } }] },
    { role: 'user', parts: [{ functionResponse: { name: 'contact_profile.list', response: { summary: 'listed' } } }] },
  ],
});

const buildDraft = (request) => ({
  ok: true,
  status: 'ready',
  output: 'provider_stream_events',
  network: false,
  writesChat: false,
  provider: request.provider,
  model: request.model,
  sessionId: request.sessionId,
  payloadKind: Array.isArray(request.contents) ? 'contents' : 'messages',
  requestPreviewFormat: request.format,
  payloadCount: Array.isArray(request.contents) ? request.contents.length : request.messages.length,
  request,
});

{
  const calls = [];
  const provider = {
    model: 'claude-provider',
    baseUrl: 'https://anthropic.test/v1',
    timeout: 1234,
    getHeaders: () => ({ 'x-api-key': 'test-key' }),
    requestJson: async (payload) => {
      calls.push(payload);
      const body = JSON.parse(payload.body);
      assert.equal(body.model, 'claude-native');
      assert.equal(body.max_tokens, 99);
      assert.equal(body.messages[1].content[0].type, 'tool_result');
      assert.equal(body.nativeRunnerContract, undefined);
      return { content: [{ type: 'text', text: 'anthropic native ok' }] };
    },
  };
  const runner = createProviderToolLlmClientNativeRunner({
    llmClient: { provider },
    now: () => 1000,
  });
  const result = await runner.runProviderToolRequest(buildAnthropicRequest(), {
    requestId: 'anthropic-native-test',
    maxTokens: 99,
    nativeRunnerContract: { shouldNotLeak: true },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.adapter, 'anthropic_messages_tool_result');
  assert.equal(result.finalText, 'anthropic native ok');
  assert.equal(result.eventCount, 3);
  assert.equal(result.events[1].textDelta, 'anthropic native ok');
  assert.equal(calls[0].requestId, 'anthropic-native-test');
  console.log('ok - LLMClient native runner shim sends Anthropic tool_result messages');
}

{
  const provider = {
    model: 'claude-history',
    baseUrl: 'https://anthropic.test/v1',
    getHeaders: () => ({ 'x-api-key': 'test-key' }),
    convertMessages: () => ({
      system: 'history system',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'history user' }] }],
    }),
    requestJson: async (payload) => {
      const body = JSON.parse(payload.body);
      assert.equal(body.system, 'history system');
      assert.equal(body.messages[0].content[0].text, 'history user');
      assert.equal(body.messages[1].content[0].type, 'tool_use');
      assert.equal(body.messages[2].content[0].type, 'tool_result');
      assert.equal(body.tools[0].name, 'contact_profile.list');
      return { content: [{ type: 'text', text: 'anthropic history ok' }] };
    },
  };
  const request = attachProviderToolContinuationContext(buildAnthropicRequest(), {
    historyMessages: [
      { role: 'system', content: 'history system' },
      { role: 'user', content: 'history user' },
    ],
    providerRequestOptions: {
      tools: [{ name: 'contact_profile.list', input_schema: { type: 'object', properties: {} } }],
    },
  });
  const runner = createProviderToolLlmClientNativeRunner({ provider, now: () => 1250 });
  const result = await runner.runProviderToolRequest(request);
  assert.equal(result.ok, true);
  assert.equal(result.finalText, 'anthropic history ok');
  console.log('ok - LLMClient native runner shim preserves Anthropic history and tool schema');
}

{
  const calls = [];
  const provider = {
    provider: 'openai',
    model: 'gpt-responses',
    baseUrl: 'https://api.openai.test/v1',
    getHeaders: () => ({ Authorization: 'Bearer test-key' }),
    requestJson: async (payload) => {
      calls.push(payload);
      const body = JSON.parse(payload.body);
      assert.equal(payload.url, 'https://api.openai.test/v1/responses');
      assert.equal(body.input[0].role, 'system');
      assert.equal(body.input[1].role, 'user');
      assert.equal(body.input[2].type, 'reasoning');
      assert.equal(body.input[3].type, 'function_call');
      assert.equal(body.input[4].type, 'function_call_output');
      assert.equal(body.tools[0].name, 'contact_profile_list');
      assert.equal(body.tools[0].function, undefined);
      assert.equal(body.max_output_tokens, 77);
      assert.equal(body.store, false);
      return {
        id: 'resp-final',
        output: [{
          type: 'message',
          content: [{ type: 'output_text', text: 'openai responses ok' }],
        }],
      };
    },
  };
  const request = attachProviderToolContinuationContext({
    provider: 'openai',
    model: 'gpt-responses',
    sessionId: 's-native',
    format: 'openai_responses_function_call_output',
    input: [
      { type: 'reasoning', id: 'rs-1', encrypted_content: 'opaque' },
      { type: 'function_call', id: 'fc-1', call_id: 'call-1', name: 'contact_profile_list', arguments: '{}' },
      { type: 'function_call_output', call_id: 'call-1', output: '{"summary":"ok"}' },
    ],
  }, {
    historyMessages: [
      { role: 'system', content: 'Use tools.' },
      { role: 'user', content: 'List contacts.' },
    ],
    providerRequestOptions: {
      tools: [{
        type: 'function',
        function: {
          name: 'contact_profile_list',
          description: 'List contacts',
          parameters: { type: 'object', additionalProperties: false, properties: {} },
        },
      }],
    },
  });
  const runner = createProviderToolLlmClientNativeRunner({ provider, now: () => 1500 });
  const result = await runner.runProviderToolRequest(request, { maxTokens: 77 });

  assert.equal(result.ok, true);
  assert.equal(result.adapter, 'openai_responses_function_call_output');
  assert.equal(result.finalText, 'openai responses ok');
  assert.equal(calls.length, 1);
  console.log('ok - LLMClient native runner shim sends stateless OpenAI Responses function output');
}

{
  const calls = [];
  const provider = {
    model: 'gemini-provider',
    timeout: 1234,
    buildUrl: () => 'https://gemini.test/v1/models/gemini-native:generateContent',
    getHeaders: () => ({ 'Content-Type': 'application/json' }),
    request: async (payload) => {
      calls.push(payload);
      const body = JSON.parse(payload.body);
      assert.equal(body.contents[1].parts[0].functionResponse.name, 'contact_profile.list');
      assert.equal(body.generationConfig.maxOutputTokens, 321);
      assert.equal(body.fetchFn, undefined);
      return {
        ok: true,
        status: 200,
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'gemini native ok' }] } }] }),
      };
    },
  };
  const runner = createProviderToolLlmClientNativeRunner({
    provider,
    now: () => 2000,
  });
  const result = await runner.runProviderToolRequest(buildGeminiRequest('gemini'), {
    requestId: 'gemini-native-test',
    maxTokens: 321,
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.adapter, 'gemini_function_response');
  assert.equal(result.finalText, 'gemini native ok');
  assert.equal(result.events[0].provider, 'gemini');
  assert.equal(calls[0].requestId, 'gemini-native-test');
  console.log('ok - LLMClient native runner shim sends Gemini functionResponse contents');
}

{
  const calls = [];
  const provider = {
    model: 'gemini-signed',
    buildUrl: () => 'https://gemini.test/v1/models/gemini-signed:generateContent',
    getHeaders: () => ({ 'Content-Type': 'application/json' }),
    convertMessages: messages => ({
      contents: messages.filter(message => message.role !== 'system').map(message => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      })),
      systemInstruction: messages.find(message => message.role === 'system')?.content || '',
    }),
    request: async (payload) => {
      calls.push(payload);
      const body = JSON.parse(payload.body);
      assert.equal(body.contents[0].parts[0].text, 'history user');
      assert.equal(body.contents[1].parts[0].thoughtSignature, 'opaque-signature');
      assert.equal(body.contents[2].parts[0].functionResponse.name, 'contact_profile.list');
      assert.equal(body.systemInstruction.parts[0].text, 'history system');
      assert.equal(body.tools[0].functionDeclarations[0].name, 'contact_profile.list');
      return {
        ok: true,
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'gemini signed ok' }] } }] }),
      };
    },
  };
  const request = attachProviderToolContinuationContext({
    ...buildGeminiRequest('gemini'),
    contents: [
      {
        role: 'model',
        parts: [{
          thoughtSignature: 'opaque-signature',
          functionCall: { name: 'contact_profile.list', args: { limit: 1 } },
        }],
      },
      { role: 'user', parts: [{ functionResponse: { name: 'contact_profile.list', response: { summary: 'listed' } } }] },
    ],
  }, {
    historyMessages: [
      { role: 'system', content: 'history system' },
      { role: 'user', content: 'history user' },
    ],
    providerRequestOptions: {
      tools: [{ functionDeclarations: [{ name: 'contact_profile.list', parameters: { type: 'OBJECT' } }] }],
    },
  });
  const runner = createProviderToolLlmClientNativeRunner({ provider, now: () => 2500 });
  const result = await runner.runProviderToolRequest(request);

  assert.equal(result.ok, true);
  assert.equal(result.finalText, 'gemini signed ok');
  assert.equal(calls.length, 1);
  console.log('ok - LLMClient native runner shim preserves Gemini history and thought signature');
}

{
  const fetchCalls = [];
  const provider = {
    model: 'gemini-vertex',
    region: 'us-central1',
    baseHost: 'https://us-central1-aiplatform.googleapis.com',
    projectId: 'project-a',
    timeout: 1234,
    buildUrlFor: ({ stream, region, baseHost, model }) => {
      assert.equal(stream, false);
      return `${baseHost}/v1/projects/project-a/locations/${region}/publishers/google/models/${model}:generateContent`;
    },
    getHeaders: async () => ({ Authorization: 'Bearer test', 'Content-Type': 'application/json' }),
  };
  const runner = createProviderToolLlmClientNativeRunner({
    provider,
    now: () => 3000,
    fetchFn: async (url, payload) => {
      fetchCalls.push({ url, payload });
      const body = JSON.parse(payload.body);
      assert.equal(body.contents[1].parts[0].functionResponse.response.summary, 'listed');
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: 'vertex native ok' }] } }] }),
      };
    },
  });
  const result = await runner.runProviderToolRequest(buildGeminiRequest('vertexai'), {
    requestId: 'vertex-native-test',
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.adapter, 'gemini_function_response');
  assert.equal(result.finalText, 'vertex native ok');
  assert.equal(result.events[0].provider, 'vertexai');
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].payload.headers.Authorization, 'Bearer test');
  console.log('ok - LLMClient native runner shim supports Vertex-style native contents');
}

{
  let called = false;
  const runner = createProviderToolLlmClientNativeRunner({
    provider: {
      requestJson: async () => {
        called = true;
        return {};
      },
    },
  });
  const result = await runner.runProviderToolRequest({
    ...buildAnthropicRequest(),
    messages: [{ role: 'assistant', content: [{ type: 'tool_use', id: 'toolu-1' }] }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'unsupported');
  assert.equal(result.reason.includes('tool_result'), true);
  assert.equal(called, false);
  console.log('ok - LLMClient native runner shim blocks malformed native requests before network');
}

{
  const runner = createProviderToolLlmClientNativeRunner({
    provider: {
      streamChat: async function* () {
        yield 'unused';
      },
    },
  });
  const result = await runner.runProviderToolRequest({
    provider: 'openai',
    model: 'gpt-native',
    sessionId: 's-native',
    format: 'openai_chat_completions_tool_result',
    messages: [
      { role: 'assistant', tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'contact_profile.list', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'call-1', content: '{"summary":"listed"}' },
    ],
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'unsupported');
  assert.equal(result.reason.includes('streamChat'), true);
  console.log('ok - LLMClient native runner shim leaves OpenAI payloads to streamChat runner');
}

{
  const provider = {
    model: 'claude-provider',
    baseUrl: 'https://anthropic.test/v1',
    getHeaders: () => ({ 'x-api-key': 'test-key' }),
    requestJson: async () => ({ content: [{ type: 'text', text: 'facade native ok' }] }),
  };
  const providerClient = createProviderToolLlmClientNativeRunner({
    llmClient: { provider },
    now: () => 4000,
  });
  const result = await runProviderToolRealRunnerAdapter({
    runnerRequestDraft: buildDraft(buildAnthropicRequest()),
    providerClient,
    enabled: true,
    allowNetwork: true,
    requestOptions: {
      requestId: 'facade-native-test',
    },
    now: () => 4000,
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.finalText, 'facade native ok');
  assert.equal(result.runnerBoundary.clientMethod, 'runProviderToolRequest');
  assert.equal(result.runnerBoundary.nativeRunnerContract.contractKind, 'anthropic_messages_tool_result');
  console.log('ok - LLMClient native runner shim passes through the real runner adapter');
}
