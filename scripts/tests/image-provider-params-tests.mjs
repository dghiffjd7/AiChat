import assert from 'node:assert/strict';

import {
  buildReasoningRequestOptions,
  getReasoningCapability,
  getReasoningSamplerPolicy,
} from '../../src/scripts/api/model-capabilities.js';
import { OpenAIProvider } from '../../src/scripts/api/providers/openai.js';
import { CustomProvider } from '../../src/scripts/api/providers/custom.js';
import {
  Automatic1111ImageProvider,
  ComfyUIImageProvider,
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
  const provider = new OpenAIProvider({
    provider: 'openai',
    apiKey: 'test',
    model: 'gpt-4o-mini',
  });
  assert.equal(Object.hasOwn(provider.normalizeOptions({ seed: -1 }), 'seed'), false);
  assert.equal(provider.normalizeOptions({ seed: 123 }).seed, 123);
  console.log('ok - OpenAI chat provider treats seed -1 as random omission');
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
  const provider = new CustomProvider({
    provider: 'custom',
    apiKey: 'test',
    baseUrl: 'https://example.com/v1',
    model: 'image-model',
  });
  let request = null;
  provider.requestJson = async nextRequest => {
    request = nextRequest;
    return { data: [{ b64_json: 'abc123' }] };
  };
  await provider.generateImage('cat', {
    referenceImages: [
      'data:image/png;base64,cmVmMQ==',
      { dataUrl: 'data:image/jpeg;base64,cmVmMg==', name: 'ref-two.jpg' },
    ],
    size: '1024x1024',
    quality: 'high',
    output_format: 'webp',
    output_compression: 75,
    seed: 42,
  });
  assert.equal(request.url, 'https://example.com/v1/images/edits');
  assert.match(request.headers['Content-Type'], /^multipart\/form-data; boundary=MiPhoneCustomImage/);
  assert.equal(typeof request.bodyBase64, 'string');
  assert.equal(request.bodyBase64.length > 0, true);
  assert.equal(Buffer.compare(Buffer.from(request.body), Buffer.from(request.bodyBase64, 'base64')), 0);
  const bodyText = Buffer.from(request.bodyBase64, 'base64').toString('utf8');
  assert.match(bodyText, /name="model"\r\n\r\nimage-model/);
  assert.match(bodyText, /name="prompt"\r\n\r\ncat/);
  assert.match(bodyText, /name="image\[\]"; filename="reference_1\.png"/);
  assert.match(bodyText, /Content-Type: image\/png/);
  assert.match(bodyText, /name="image\[\]"; filename="ref-two\.jpg"/);
  assert.match(bodyText, /Content-Type: image\/jpeg/);
  assert.match(bodyText, /name="output_format"\r\n\r\nwebp/);
  assert.match(bodyText, /name="output_compression"\r\n\r\n75/);
  assert.match(bodyText, /name="seed"\r\n\r\n42/);
  console.log('ok - custom image provider sends reference images as multipart image edits');
}

{
  const provider = new CustomProvider({
    provider: 'custom',
    apiKey: 'test',
    baseUrl: 'https://example.com/v1',
    model: 'chat-model',
  });
  let body = null;
  provider.requestJson = async request => {
    body = JSON.parse(request.body);
    return { choices: [{ message: { content: 'ok' } }] };
  };
  await provider.chat([{ role: 'user', content: 'hi' }], { seed: -1, temperature: 0.7 });
  assert.equal(Object.hasOwn(body, 'seed'), false);
  assert.equal(body.temperature, 0.7);
  await provider.chat([{ role: 'user', content: 'hi' }], { seed: 42 });
  assert.equal(body.seed, 42);
  console.log('ok - custom chat provider omits seed -1 and keeps fixed non-negative seeds');
}

{
  const provider = new CustomProvider({
    provider: 'custom',
    apiKey: 'test',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-3.5-flash',
  });
  const request = provider.prepareChatRequest(
    [{ role: 'user', content: 'hi' }],
    {
      temperature: 1,
      top_p: 0.95,
      presence_penalty: 0,
      frequency_penalty: 0,
      seed: 42,
      n: 1,
      max_tokens: 8192,
      stream: false,
      reasoning_effort: 'medium',
      thinkingLevel: 'high',
      thinkingBudget: 1024,
    },
  );
  assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  assert.equal(request.payload.reasoning_effort, 'medium');
  assert.equal(request.payload.max_tokens, 8192);
  assert.equal(Object.hasOwn(request.payload, 'presence_penalty'), false);
  assert.equal(Object.hasOwn(request.payload, 'frequency_penalty'), false);
  assert.equal(Object.hasOwn(request.payload, 'seed'), false);
  assert.equal(Object.hasOwn(request.payload, 'n'), false);
  assert.equal(Object.hasOwn(request.payload, 'stream'), false);
  assert.equal(Object.hasOwn(request.payload, 'thinkingLevel'), false);
  assert.equal(Object.hasOwn(request.payload, 'thinkingBudget'), false);
  console.log('ok - custom Gemini chat request matches OpenAI-compatible payload shape');
}

{
  const capability = getReasoningCapability({
    provider: 'anthropic',
    model: 'claude-fable-5',
  });
  assert.equal(capability.supported, true);
  assert.equal(capability.strategy, 'anthropic-adaptive');
  assert.equal(capability.samplingRestricted, true);
  assert.equal(capability.effortOptions.some((option) => option.value === 'minimal'), false);
  assert.deepEqual(
    buildReasoningRequestOptions({
      provider: 'anthropic',
      model: 'claude-fable-5',
      requestReasoning: true,
      reasoningEffort: 'xhigh',
      maxOutputTokens: 8192,
    }),
    {
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: 'xhigh' },
    },
  );
  assert.deepEqual(
    buildReasoningRequestOptions({
      provider: 'anthropic',
      model: 'claude-fable-5',
      requestReasoning: true,
      reasoningEffort: 'auto',
      maxOutputTokens: 8192,
    }),
    { thinking: { type: 'adaptive', display: 'summarized' } },
  );
  assert.deepEqual(
    getReasoningSamplerPolicy({
      provider: 'anthropic',
      model: 'claude-fable-5',
      requestReasoning: false,
    }).disabledFields.sort(),
    ['temperature', 'top_k', 'top_p'].sort(),
  );
  console.log('ok - Claude Fable 5 uses adaptive thinking and always-restricted sampling');
}

{
  const capability = getReasoningCapability({
    provider: 'anthropic',
    model: 'claude-opus-4-8',
  });
  assert.equal(capability.supported, true);
  assert.equal(capability.strategy, 'anthropic-adaptive');
  assert.equal(capability.samplingRestricted, false);
  assert.deepEqual(
    buildReasoningRequestOptions({
      provider: 'anthropic',
      model: 'claude-opus-4-8',
      requestReasoning: true,
      reasoningEffort: 'high',
      maxOutputTokens: 8192,
    }),
    {
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: 'high' },
    },
  );
  assert.equal(
    getReasoningSamplerPolicy({
      provider: 'anthropic',
      model: 'claude-opus-4-8',
      requestReasoning: false,
    }).active,
    false,
  );
  console.log('ok - adaptive-only Claude models do not use manual budget_tokens');
}

{
  const capability = getReasoningCapability({
    provider: 'custom',
    model: 'gemini-3.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  });
  assert.equal(capability.supported, true);
  assert.equal(capability.strategy, 'gemini-openai-effort');
  assert.deepEqual(
    buildReasoningRequestOptions({
      provider: 'custom',
      model: 'gemini-3.5-flash',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      requestReasoning: true,
      reasoningEffort: 'medium',
      maxOutputTokens: 8192,
    }),
    { reasoning_effort: 'medium' },
  );
  assert.deepEqual(
    buildReasoningRequestOptions({
      provider: 'custom',
      model: 'gemini-3.5-flash',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      requestReasoning: true,
      reasoningEffort: 'auto',
      maxOutputTokens: 8192,
    }),
    {},
  );
  console.log('ok - custom Gemini models map reasoning settings to reasoning_effort');
}

{
  const provider = new CustomProvider({
    provider: 'custom',
    apiKey: 'test',
    baseUrl: 'https://example-vercel-proxy.vercel.app/v1',
    model: 'gemini-3.5-flash',
  });
  const request = provider.prepareChatRequest(
    [{ role: 'user', content: 'hi' }],
    {
      presence_penalty: 0,
      frequency_penalty: 0,
      seed: 42,
      n: 1,
    },
  );
  assert.equal(request.url, 'https://example-vercel-proxy.vercel.app/v1/chat/completions');
  assert.equal(request.payload.presence_penalty, 0);
  assert.equal(request.payload.frequency_penalty, 0);
  assert.equal(request.payload.seed, 42);
  assert.equal(request.payload.n, 1);
  assert.equal(
    getReasoningCapability({
      provider: 'custom',
      model: 'gemini-3.5-flash',
      baseUrl: 'https://example-vercel-proxy.vercel.app/v1',
    }).supported,
    false,
  );
  assert.deepEqual(
    buildReasoningRequestOptions({
      provider: 'custom',
      model: 'gemini-3.5-flash',
      baseUrl: 'https://example-vercel-proxy.vercel.app/v1',
      requestReasoning: true,
      reasoningEffort: 'medium',
      maxOutputTokens: 8192,
    }),
    {},
  );
  console.log('ok - custom Vercel Gemini endpoints keep generic custom payload behavior');
}

{
  const previousTauri = globalThis.__TAURI__;
  const calls = [];
  let readCount = 0;
  globalThis.__TAURI__ = {
    core: {
      invoke: async (cmd, args) => {
        calls.push({ cmd, args });
        if (cmd === 'http_stream_request_start') {
          const body = JSON.parse(args.body);
          assert.equal(args.url, 'https://example.com/v1/chat/completions');
          assert.equal(args.headers.Accept, 'text/event-stream');
          assert.equal(body.stream, true);
          assert.equal(body.model, 'chat-model');
          return true;
        }
        if (cmd === 'http_stream_request_read') {
          readCount += 1;
          if (readCount === 1) {
            return {
              status: 200,
              ok: true,
              done: false,
              chunks: ['data:{"choices":[{"delta":{"content":"Hi"}}]}\n'],
            };
          }
          return {
            status: 200,
            ok: true,
            done: false,
            chunks: ['\ndata: {"choices":[{"delta":{"content":" there"}}]}\r\n\r\ndata: [DONE]\n\n'],
          };
        }
        if (cmd === 'http_stream_request_close') return true;
        throw new Error(`unexpected command ${cmd}`);
      },
    },
  };
  try {
    const provider = new CustomProvider({
      provider: 'custom',
      apiKey: 'test',
      baseUrl: 'https://example.com/v1',
      model: 'chat-model',
    });
    const chunks = [];
    for await (const chunk of provider.streamChat([{ role: 'user', content: 'hi' }], {
      requestId: 'custom-native-stream-test',
    })) {
      chunks.push(chunk);
    }
    assert.deepEqual(chunks, ['Hi', ' there']);
    assert.deepEqual(calls.map(call => call.cmd), [
      'http_stream_request_start',
      'http_stream_request_read',
      'http_stream_request_read',
      'http_stream_request_close',
    ]);
  } finally {
    if (previousTauri === undefined) {
      delete globalThis.__TAURI__;
    } else {
      globalThis.__TAURI__ = previousTauri;
    }
  }
  console.log('ok - custom chat provider streams through native SSE chunks');
}

{
  const previousTauri = globalThis.__TAURI__;
  let nativeArgs = null;
  globalThis.__TAURI__ = {
    core: {
      invoke: async (cmd, args) => {
        assert.equal(cmd, 'http_request');
        nativeArgs = args;
        return {
          status: 200,
          ok: true,
          headers: {},
          body: JSON.stringify({ data: [{ b64_json: 'abc123' }] }),
        };
      },
    },
  };
  try {
    const provider = new CustomProvider({
      provider: 'custom',
      apiKey: 'test',
      baseUrl: 'https://example.com/v1',
      model: 'image-model',
    });
    await provider.generateImage('cat', {
      referenceImages: ['data:image/png;base64,cmVm'],
    });
    assert.equal(nativeArgs.url, 'https://example.com/v1/images/edits');
    assert.equal(nativeArgs.body, null);
    assert.equal(typeof nativeArgs.bodyBase64, 'string');
    assert.equal(nativeArgs.bodyBase64.length > 0, true);
    assert.match(nativeArgs.headers['Content-Type'], /^multipart\/form-data; boundary=MiPhoneCustomImage/);
  } finally {
    if (previousTauri === undefined) {
      delete globalThis.__TAURI__;
    } else {
      globalThis.__TAURI__ = previousTauri;
    }
  }
  console.log('ok - custom image provider passes multipart bytes through native bodyBase64');
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
  await provider.generateImage('cat', { seed: -1 });
  assert.equal(Object.hasOwn(body, 'seed'), false);
  await provider.generateImage('cat', { seed: 42 });
  assert.equal(body.seed, 42);
  console.log('ok - custom image provider omits random seed sentinel and keeps fixed seeds');
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
  await provider.generateImage('cat', { seed: -1 });
  assert.equal(Object.hasOwn(body, 'seed'), false);
  await provider.generateImage('cat', { seed: 7 });
  assert.equal(body.seed, 7);
  console.log('ok - Together AI image provider treats seed -1 as service random');
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
  const provider = new NovelAIImageProvider({
    provider: 'novelai',
    apiKey: 'test',
    model: 'nai-diffusion-4-5-full',
  });
  const oldRandom = Math.random;
  Math.random = () => 0.123;
  try {
    const payload = provider.buildPayload('cat', { seed: -1 });
    assert.equal(payload.parameters.seed, 1229999999);
  } finally {
    Math.random = oldRandom;
  }
  console.log('ok - NovelAI image provider turns seed -1 into a random non-negative seed');
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
  const provider = new StabilityAIImageProvider({
    provider: 'stability',
    apiKey: 'test',
    model: 'stable-image-core',
  });
  let body = '';
  provider.request = async request => {
    body = request.body;
    return { ok: true, status: 200, body: 'abc123', headers: { 'content-type': 'image/png' } };
  };
  await provider.generateImage('cat', { seed: -1 });
  assert.doesNotMatch(body, /name="seed"/);
  await provider.generateImage('cat', { seed: 9 });
  assert.match(body, /name="seed"/);
  assert.match(body, /9/);
  console.log('ok - Stability AI image provider omits seed -1 and keeps fixed seeds');
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
  const provider = new PollinationsImageProvider({
    provider: 'pollinations',
    model: 'flux',
  });
  let url = '';
  provider.request = async request => {
    url = request.url;
    return { ok: true, status: 200, body: 'abc123', headers: { 'content-type': 'image/jpeg' } };
  };
  await provider.generateImage('a cat', { seed: -1 });
  assert.doesNotMatch(url, /[?&]seed=/);
  await provider.generateImage('a cat', { seed: 11 });
  assert.match(url, /seed=11/);
  console.log('ok - Pollinations image provider omits seed -1 and keeps fixed seeds');
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

{
  const provider = new Automatic1111ImageProvider({
    provider: 'automatic1111',
    baseUrl: 'http://127.0.0.1:7860',
    model: 'default',
  });
  let body = null;
  provider.requestJson = async request => {
    body = JSON.parse(request.body);
    return { images: ['abc123'] };
  };
  await provider.generateImage('cat', { seed: -1 });
  assert.equal(body.seed, -1);
  await provider.generateImage('cat', { seed: -9 });
  assert.equal(body.seed, -1);
  console.log('ok - AUTOMATIC1111 image provider preserves random seed sentinel');
}

{
  const provider = new ComfyUIImageProvider({
    provider: 'comfyui',
    baseUrl: 'http://127.0.0.1:8188',
    model: 'workflow',
  });
  const oldRandom = Math.random;
  Math.random = () => 0.5;
  try {
    const workflow = provider.buildWorkflow('cat', {
      seed: -1,
      workflowJson: '{"1":{"inputs":{"seed":%seed%,"prompt":"%prompt%"}}}',
    });
    assert.equal(workflow['1'].inputs.seed, Math.floor(Number.MAX_SAFE_INTEGER * 0.5));
  } finally {
    Math.random = oldRandom;
  }
  console.log('ok - ComfyUI image provider turns seed -1 into a random non-negative seed');
}
