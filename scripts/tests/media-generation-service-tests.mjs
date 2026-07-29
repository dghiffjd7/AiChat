import assert from 'node:assert/strict';

import {
  createMediaGenerationService,
  getImageExtensionFromMime,
  getImageMimeFromDataUrl,
  normalizeGeneratedImageResult,
  resolveImageReferenceCapability,
} from '../../src/scripts/ui/media-generation-service.js';
import {
  createDefaultImageGenerationPreset,
  getParamsForImageConfig,
  mergeImageGenerationRequestOptions,
  resolveImageGenerationParamSchema,
} from '../../src/scripts/ui/image-generation-params-utils.js';

{
  const normalized = normalizeGeneratedImageResult({
    b64_json: 'abc123',
    mime: 'image/webp',
    index: 2,
  });
  assert.deepEqual(normalized, {
    dataUrl: 'data:image/webp;base64,abc123',
    mime: 'image/webp',
    index: 2,
  });
  assert.equal(getImageMimeFromDataUrl(normalized.dataUrl), 'image/webp');
  assert.equal(getImageExtensionFromMime('image/jpeg'), 'jpg');
  console.log('ok - media generation service normalizes base64 image results');
}

{
  assert.deepEqual(resolveImageReferenceCapability({
    provider: 'makersuite',
    model: 'gemini-2.5-flash-image-preview',
  }), {
    supported: true,
    max: 3,
    reason: '当前 Gemini 图片链路支持最多 3 张参考图',
    source: 'builtin',
  });
  assert.equal(resolveImageReferenceCapability({ provider: 'openai', model: 'gpt-image-1' }).supported, true);
  assert.equal(resolveImageReferenceCapability({ provider: 'openai', model: 'gpt-image-2' }).max, 16);
  assert.equal(resolveImageReferenceCapability({ provider: 'gemini', model: 'nano-banana-pro' }).max, 3);
  assert.equal(resolveImageReferenceCapability({ provider: 'makersuite', model: 'gemini-2.5-flash-image-preview', maxReferenceImages: 2 }).max, 2);
  assert.equal(resolveImageReferenceCapability({ provider: 'custom', model: 'image-model' }).max, 16);
  assert.equal(resolveImageReferenceCapability({ provider: 'custom', model: 'image-model', maxReferenceImages: 2 }).max, 2);
  assert.equal(resolveImageReferenceCapability({ provider: 'custom', model: 'image-model', maxReferenceImages: 0 }).supported, false);
  assert.equal(resolveImageReferenceCapability({ provider: 'novelai', model: 'nai-diffusion-4-5-full' }).supported, false);
  console.log('ok - media generation service resolves image reference capabilities');
}

{
  const schema = resolveImageGenerationParamSchema({ provider: 'openai', model: 'gpt-image-2' });
  assert.equal(schema.fields.some(field => field.key === 'quality'), true);
  const preset = createDefaultImageGenerationPreset();
  preset.paramsByProvider.openai.quality = 'high';
  preset.paramsByProvider.openai.size = '1024x1024';
  preset.paramsByProvider.openai.output_format = 'webp';
  preset.paramsByProvider.openai.output_compression = 80;
  const params = getParamsForImageConfig(preset, { provider: 'openai', model: 'gpt-image-2' });
  assert.deepEqual(params, {
    n: 1,
    quality: 'high',
    size: '1024x1024',
    output_format: 'webp',
    output_compression: 80,
  });
  const merged = mergeImageGenerationRequestOptions({
    config: { provider: 'openai', model: 'gpt-image-2' },
    preset,
    extra: { referenceImages: ['data:image/png;base64,ref'] },
  });
  assert.deepEqual(merged.referenceImages, ['data:image/png;base64,ref']);
  assert.equal(merged.quality, 'high');
  console.log('ok - media generation params schema sanitizes OpenAI image options');
}

{
  const novelSchema = resolveImageGenerationParamSchema({ provider: 'novelai', model: 'nai-diffusion-4-5-full' });
  assert.equal(novelSchema.fields.some(field => field.key === 'sampler'), true);
  const novelParams = getParamsForImageConfig(createDefaultImageGenerationPreset(), { provider: 'novelai', model: 'nai-diffusion-4-5-full' });
  assert.equal(novelParams.steps, 23);
  assert.equal(novelParams.scale, 5);
  assert.equal(novelParams.cfgRescale, 0);
  assert.equal(novelParams.sampler, 'k_euler_ancestral');
  assert.equal(novelParams.qualityToggle, 'true');
  const a1111Params = getParamsForImageConfig(createDefaultImageGenerationPreset(), { provider: 'automatic1111', model: 'default' });
  assert.equal(a1111Params.width, 1024);
  assert.equal(a1111Params.cfg_scale, 7);
  const comfySchema = resolveImageGenerationParamSchema({ provider: 'comfyui', model: 'workflow' });
  assert.equal(comfySchema.fields.some(field => field.key === 'workflowJson' && field.type === 'textarea'), true);
  console.log('ok - media generation params schema supports added image providers');
}

{
  const saved = [];
  let imageOptions = null;
  const service = createMediaGenerationService({
    createClient: () => ({
      generateImage: async (_prompt, options) => {
        imageOptions = options;
        return [{ dataUrl: 'data:image/png;base64,abc123', index: 0 }];
      },
    }),
    saveDataUrl: async (dataUrl, fileName, meta) => {
      saved.push({ dataUrl, fileName, meta });
      return { path: '/tmp/generated.png', bytes: 3 };
    },
    now: () => 123,
    logger: { warn: () => {} },
  });

  const asset = await service.generateImage({
    prompt: 'a cat',
    config: { provider: 'openai', model: 'gpt-image-1' },
    sessionId: 'sid-1',
    options: { referenceImages: ['data:image/png;base64,ref'] },
    retainDataUrl: true,
  });
  assert.equal(asset.kind, 'image');
  assert.equal(asset.status, 'succeeded');
  assert.equal(asset.output.path, '/tmp/generated.png');
  assert.equal(asset.output.bytes, 3);
  assert.equal(asset.output.dataUrl, 'data:image/png;base64,abc123');
  assert.equal(asset.provider, 'openai');
  assert.equal(asset.model, 'gpt-image-1');
  assert.equal(asset.scope.targetId, 'sid-1');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].fileName, 'generated_image_123_1.png');
  assert.equal(Object.hasOwn(imageOptions, 'responseFormat'), false);
  assert.equal(Object.hasOwn(imageOptions, 'response_format'), false);
  assert.deepEqual(imageOptions.referenceImages, ['data:image/png;base64,ref']);
  console.log('ok - media generation service persists generated data urls as assets');
}

{
  const calls = [];
  const service = createMediaGenerationService({
    createClient: () => ({
      generateImage: async () => [{ dataUrl: 'data:image/png;base64,abc123', index: 0 }],
    }),
    saveDataUrl: async () => ({ path: '/tmp/generated-agent.png', bytes: 3 }),
    now: () => 456,
    logger: { warn: () => {} },
    agentTaskRuntime: {
      startRun: (run) => {
        calls.push(['startRun', run.kind, run.sessionId, run.metadata.provider]);
        return { id: 'run-1' };
      },
      startStep: (runId, step) => {
        calls.push(['startStep', runId, step.type, step.input.prompt]);
        return { id: 'step-1' };
      },
      finishStep: (runId, stepId, patch) => {
        calls.push(['finishStep', runId, stepId, patch.status, patch.output.path]);
      },
      finishRun: (runId, patch) => {
        calls.push(['finishRun', runId, patch.status]);
      },
    },
  });

  const asset = await service.generateImage({
    prompt: 'agent image',
    config: { provider: 'openai', model: 'gpt-image-1' },
    sessionId: 'sid-agent',
  });
  assert.equal(asset.output.path, '/tmp/generated-agent.png');
  assert.deepEqual(calls, [
    ['startRun', 'image_generation', 'sid-agent', 'openai'],
    ['startStep', 'run-1', 'image.generate', 'agent image'],
    ['finishStep', 'run-1', 'step-1', 'succeeded', '/tmp/generated-agent.png'],
    ['finishRun', 'run-1', 'succeeded'],
  ]);
  console.log('ok - media generation service records optional agent task lifecycle');
}
