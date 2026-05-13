import assert from 'node:assert/strict';

import { OpenAIProvider } from '../../src/scripts/api/providers/openai.js';
import { CustomProvider } from '../../src/scripts/api/providers/custom.js';
import {
  Automatic1111ImageProvider,
  NovelAIImageProvider,
  PollinationsImageProvider,
  StabilityAIImageProvider,
  TogetherAIImageProvider,
} from '../../src/scripts/api/providers/image-generation-providers.js';

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

{
  const provider = new TogetherAIImageProvider({
    provider: 'togetherai',
    apiKey: 'test',
    model: 'black-forest-labs/FLUX.1-schnell',
  });
  let body = null;
  provider.requestJson = async request => {
    body = JSON.parse(request.body);
    return { data: [{ b64_json: 'abc123' }] };
  };
  await provider.generateImage('cat', {
    width: 768,
    height: 1024,
    steps: 6,
    guidance_scale: 3.2,
    negativePrompt: 'blur',
    output_format: 'webp',
  });
  assert.equal(body.model, 'black-forest-labs/FLUX.1-schnell');
  assert.equal(body.width, 768);
  assert.equal(body.height, 1024);
  assert.equal(body.steps, 6);
  assert.equal(body.guidance_scale, 3.2);
  assert.equal(body.negative_prompt, 'blur');
  console.log('ok - Together AI image provider maps common generation params');
}

{
  const provider = new NovelAIImageProvider({
    provider: 'novelai',
    apiKey: 'test',
    model: 'nai-diffusion-4-5-full',
  });
  const payload = provider.buildPayload('cat', {
    steps: 23,
    scale: 5,
    cfgRescale: 0.2,
    sampler: 'k_euler_ancestral',
    qualityToggle: 'true',
    sm: 'true',
    sm_dyn: 'true',
  });
  assert.equal(payload.parameters.steps, 23);
  assert.equal(payload.parameters.scale, 5);
  assert.equal(payload.parameters.cfg_rescale, 0.2);
  assert.equal(payload.parameters.sampler, 'k_euler_ancestral');
  assert.equal(payload.parameters.qualityToggle, true);
  assert.equal(payload.parameters.sm, true);
  assert.equal(payload.parameters.sm_dyn, true);
  const ddimPayload = provider.buildPayload('cat', {
    sampler: 'ddim',
    sm: 'true',
    sm_dyn: 'true',
  });
  assert.equal(ddimPayload.parameters.sm, false);
  assert.equal(ddimPayload.parameters.sm_dyn, false);
  console.log('ok - NovelAI image provider maps guidance and SMEA params');
}

{
  const provider = new StabilityAIImageProvider({
    provider: 'stability',
    apiKey: 'test',
    model: 'stable-image-core',
  });
  let body = '';
  let headers = {};
  provider.request = async request => {
    body = request.body;
    headers = request.headers;
    return { ok: true, status: 200, body: 'abc123', headers: { 'content-type': 'image/png' } };
  };
  const images = await provider.generateImage('cat', {
    aspectRatio: '16:9',
    output_format: 'png',
    negativePrompt: 'blur',
  });
  assert.equal(headers.Accept, 'image/*');
  assert.match(headers['Content-Type'], /multipart\/form-data/);
  assert.match(body, /name="prompt"/);
  assert.match(body, /cat/);
  assert.match(body, /name="aspect_ratio"/);
  assert.equal(images[0].dataUrl, 'data:image/png;base64,abc123');
  console.log('ok - Stability AI image provider sends multipart text-to-image request');
}

{
  const provider = new PollinationsImageProvider({
    provider: 'pollinations',
    model: 'flux',
  });
  let url = '';
  provider.request = async request => {
    url = request.url;
    return { ok: true, status: 200, body: 'abc123', headers: { 'content-type': 'image/jpeg' } };
  };
  await provider.generateImage('a cat', { width: 512, height: 768, enhance: 'true' });
  assert.match(url, /gen\.pollinations\.ai\/image\/a%20cat/);
  assert.match(url, /width=512/);
  assert.match(url, /height=768/);
  assert.match(url, /enhance=true/);
  console.log('ok - Pollinations image provider builds image URL params');
}

{
  const provider = new Automatic1111ImageProvider({
    provider: 'automatic1111',
    baseUrl: 'http://127.0.0.1:7860',
    model: 'anime.safetensors',
  });
  let body = null;
  provider.requestJson = async request => {
    body = JSON.parse(request.body);
    return { images: ['abc123'] };
  };
  await provider.generateImage('cat', {
    negativePrompt: 'blur',
    width: 512,
    height: 512,
    cfg_scale: 6.5,
    sampler_name: 'Euler a',
  });
  assert.equal(body.prompt, 'cat');
  assert.equal(body.negative_prompt, 'blur');
  assert.equal(body.cfg_scale, 6.5);
  assert.equal(body.sampler_name, 'Euler a');
  assert.deepEqual(body.override_settings, { sd_model_checkpoint: 'anime.safetensors' });
  console.log('ok - AUTOMATIC1111 image provider maps txt2img payload');
}
