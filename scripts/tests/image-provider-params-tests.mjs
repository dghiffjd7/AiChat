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
    model: 'gpt-image-2',
  });
  let body = null;
  provider.requestJson = async request => {
    body = JSON.parse(request.body);
    return { data: [{ b64_json: 'abc123' }] };
  };
  await provider.generateImage('cat', {
    quality: 'medium',
    size: '1024x1536',
    output_format: 'webp',
    output_compression: 75,
    background: 'opaque',
    moderation: 'low',
  });
  assert.equal(body.quality, 'medium');
  assert.equal(body.size, '1024x1536');
  assert.equal(body.output_format, 'webp');
  assert.equal(body.output_compression, 75);
  assert.equal(body.background, 'opaque');
  assert.equal(body.moderation, 'low');
  console.log('ok - OpenAI gpt-image generation forwards supported image params');
}

{
  const provider = new OpenAIProvider({
    provider: 'openai',
    apiKey: 'test',
    model: 'gpt-image-2',
  });
  let body = null;
  let url = '';
  provider.requestJson = async request => {
    url = request.url;
    body = JSON.parse(request.body);
    return { data: [{ b64_json: 'abc123' }] };
  };
  await provider.generateImage('cat', {
    referenceImages: [
      'data:image/png;base64,ref1',
      { dataUrl: 'data:image/jpeg;base64,ref2' },
    ],
    size: '1024x1024',
    quality: 'high',
    responseFormat: 'b64_json',
  });
  assert.equal(url, 'https://api.openai.com/v1/images/edits');
  assert.equal(body.model, 'gpt-image-2');
  assert.equal(body.prompt, 'cat');
  assert.deepEqual(body.images, [
    { image_url: 'data:image/png;base64,ref1' },
    { image_url: 'data:image/jpeg;base64,ref2' },
  ]);
  assert.equal(body.size, '1024x1024');
  assert.equal(body.quality, 'high');
  assert.equal(Object.hasOwn(body, 'response_format'), false);
  console.log('ok - OpenAI image provider routes reference images through image edits JSON');
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
