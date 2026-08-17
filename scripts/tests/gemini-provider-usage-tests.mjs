import assert from 'node:assert/strict';

import { GeminiProvider } from '../../src/scripts/api/providers/gemini.js';
import { MakersuiteProvider } from '../../src/scripts/api/providers/makersuite.js';
import { VertexAIProvider } from '../../src/scripts/api/providers/vertexai.js';

const originalFetch = globalThis.fetch;

const responseBody = ({ responseId = 'gemini-response', modelVersion = 'gemini-version' } = {}) => ({
  candidates: [{
    finishReason: 'STOP',
    content: { role: 'model', parts: [{ text: 'ok' }] },
  }],
  usageMetadata: {
    promptTokenCount: 30,
    candidatesTokenCount: 7,
    totalTokenCount: 37,
  },
  modelVersion,
  responseId,
});

const assertUsage = (usage, provider, responseId) => {
  assert.equal(usage.provider, provider);
  assert.equal(usage.promptTokens, 30);
  assert.equal(usage.completionTokens, 7);
  assert.equal(usage.totalTokens, 37);
  assert.equal(usage.finishReason, 'STOP');
  assert.equal(usage.modelVersion, 'gemini-version');
  assert.equal(usage.responseId, responseId);
};

try {
  for (const [providerName, provider] of [
    ['gemini', new GeminiProvider({ apiKey: 'test', model: 'gemini-test' })],
    ['makersuite', new MakersuiteProvider({ apiKey: 'test', model: 'gemini-test' })],
    ['vertexai', new VertexAIProvider({
      apiKey: 'test',
      model: 'gemini-test',
      vertexaiProjectId: 'project-test',
      vertexaiRegion: 'global',
    })],
  ]) {
    const expectedResponseId = `${providerName}-response`;
    globalThis.fetch = async () => new Response(JSON.stringify(responseBody({ responseId: expectedResponseId })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    if (providerName === 'vertexai') provider.getHeaders = async () => ({ 'Content-Type': 'application/json' });
    let usage = null;
    const result = await provider.chat([{ role: 'user', content: 'test' }], {
      onProviderUsage: value => { usage = value; },
    });
    assert.equal(result, 'ok');
    assertUsage(usage, providerName, expectedResponseId);
  }

  globalThis.fetch = async () => {
    const final = responseBody({ responseId: 'makersuite-stream-response' });
    return new Response(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'o' }] } }] })}\n\ndata: ${JSON.stringify(final)}\n\n`, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };
  const streamProvider = new MakersuiteProvider({ apiKey: 'test', model: 'gemini-test' });
  let streamUsage = null;
  let streamed = '';
  for await (const chunk of streamProvider.streamChat([{ role: 'user', content: 'test' }], {
    onProviderUsage: value => { streamUsage = value; },
  })) {
    if (typeof chunk === 'string') streamed += chunk;
  }
  assert.equal(streamed, 'ook');
  assertUsage(streamUsage, 'makersuite', 'makersuite-stream-response');
  console.log('gemini-provider-usage-tests passed');
} finally {
  globalThis.fetch = originalFetch;
}
