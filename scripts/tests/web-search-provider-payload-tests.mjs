import assert from 'node:assert/strict';

import { splitRequestOptions } from '../../src/scripts/api/abort.js';
import { buildWebSearchRequestPlan } from '../../src/scripts/api/web-search-runtime.js';
import { AnthropicProvider } from '../../src/scripts/api/providers/anthropic.js';
import { GeminiProvider } from '../../src/scripts/api/providers/gemini.js';
import { MakersuiteProvider } from '../../src/scripts/api/providers/makersuite.js';
import { OpenRouterProvider } from '../../src/scripts/api/providers/openrouter.js';
import { VertexAIProvider } from '../../src/scripts/api/providers/vertexai.js';

const messages = [{ role: 'user', content: 'latest news' }];
const sourceCallback = () => {};

{
  const split = splitRequestOptions({
    tools: [{ type: 'test' }],
    onProviderSources: sourceCallback,
  });
  assert.equal(split.onProviderSources, sourceCallback);
  assert.deepEqual(split.options, { tools: [{ type: 'test' }] });
}

{
  const plan = buildWebSearchRequestPlan({ enabled: true, provider: 'openrouter' });
  const provider = new OpenRouterProvider({ apiKey: 'test', model: 'openrouter/auto' });
  const prepared = provider.prepareChatRequest(messages, {
    ...plan.requestOptions,
    onProviderSources: sourceCallback,
  });
  assert.deepEqual(prepared.payload.tools, plan.requestOptions.tools);
  assert.equal(prepared.payload.max_tool_calls, 3);
  assert.equal(Object.prototype.hasOwnProperty.call(prepared.payload, 'onProviderSources'), false);
}

{
  const aiStudioPlan = buildWebSearchRequestPlan({ enabled: true, provider: 'makersuite' });
  const makersuite = new MakersuiteProvider({ apiKey: 'test', model: 'gemini-test' });
  const gemini = new GeminiProvider({ apiKey: 'test', model: 'gemini-test' });
  assert.deepEqual(makersuite.buildRequestBody(messages, aiStudioPlan.requestOptions).tools, [{ google_search: {} }]);
  assert.deepEqual(gemini.buildRequestBody(messages, aiStudioPlan.requestOptions).tools, [{ google_search: {} }]);

  const vertexPlan = buildWebSearchRequestPlan({ enabled: true, provider: 'vertexai' });
  const vertex = new VertexAIProvider({
    apiKey: 'test',
    model: 'gemini-test',
    baseUrl: 'https://us-central1-aiplatform.googleapis.com',
    vertexaiProjectId: 'project-test',
  });
  assert.deepEqual(vertex.buildRequestBody(messages, vertexPlan.requestOptions).tools, [{ googleSearch: {} }]);
}

{
  const plan = buildWebSearchRequestPlan({ enabled: true, provider: 'anthropic' });
  const provider = new AnthropicProvider({ apiKey: 'test', model: 'claude-test' });
  let requestBody = null;
  provider.requestJson = async (request) => {
    requestBody = JSON.parse(request.body);
    return { content: [{ type: 'text', text: 'answer' }], usage: {} };
  };
  assert.equal(await provider.chat(messages, {
    ...plan.requestOptions,
    onProviderSources: sourceCallback,
  }), 'answer');
  assert.deepEqual(requestBody.tools, plan.requestOptions.tools);
  assert.equal(Object.prototype.hasOwnProperty.call(requestBody, 'onProviderSources'), false);
}

console.log('ok - native web search schemas reach each provider payload without leaking callbacks');
