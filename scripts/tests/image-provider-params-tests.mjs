import assert from 'node:assert/strict';

import { OpenAIProvider } from '../../src/scripts/api/providers/openai.js';
import { CustomProvider } from '../../src/scripts/api/providers/custom.js';

{
  const provider = new OpenAIProvider({
    provider: 'openai',
    apiKey: 'test',
    model: 'gpt-image-1',
  });
  let body = null;
  provider.requestJson = async request => {
    body = JSON.parse(request.body);
    return { data: [{ b64_json: 'abc123' }] };
  };
  await provider.generateImage('cat', { responseFormat: 'b64_json' });
  assert.equal(body.model, 'gpt-image-1');
  assert.equal(Object.hasOwn(body, 'response_format'), false);
  console.log('ok - OpenAI image provider omits response_format for gpt-image models');
}

{
  const provider = new OpenAIProvider({
    provider: 'openai',
    apiKey: 'test',
    model: 'dall-e-3',
  });
  let body = null;
  provider.requestJson = async request => {
    body = JSON.parse(request.body);
    return { data: [{ b64_json: 'abc123' }] };
  };
  await provider.generateImage('cat', { responseFormat: 'b64_json' });
  assert.equal(body.response_format, 'b64_json');
  console.log('ok - OpenAI image provider keeps response_format for legacy image models');
}

{
  const provider = new CustomProvider({
    provider: 'custom',
    apiKey: 'test',
    baseUrl: 'https://example.com/v1',
    model: 'image-model',
  });
  let body = null;
  provider.requestJson = async request => {
    body = JSON.parse(request.body);
    return { data: [{ url: 'https://example.com/image.png' }] };
  };
  await provider.generateImage('cat');
  assert.equal(Object.hasOwn(body, 'response_format'), false);
  console.log('ok - custom image provider does not force response_format by default');
}
