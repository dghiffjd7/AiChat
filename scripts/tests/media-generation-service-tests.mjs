import assert from 'node:assert/strict';

import {
  createMediaGenerationService,
  getImageExtensionFromMime,
  getImageMimeFromDataUrl,
  normalizeGeneratedImageResult,
  resolveImageReferenceCapability,
} from '../../src/scripts/ui/media-generation-service.js';

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
  assert.equal(resolveImageReferenceCapability({ provider: 'custom', model: 'image-model', maxReferenceImages: 2 }).supported, false);
  console.log('ok - media generation service resolves image reference capabilities');
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
  });
  assert.equal(asset.kind, 'image');
  assert.equal(asset.status, 'succeeded');
  assert.equal(asset.output.path, '/tmp/generated.png');
  assert.equal(asset.output.bytes, 3);
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
