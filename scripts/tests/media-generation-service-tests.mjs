import assert from 'node:assert/strict';

import {
  createMediaGenerationService,
  getImageExtensionFromMime,
  getImageMimeFromDataUrl,
  normalizeGeneratedImageResult,
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
  console.log('ok - media generation service persists generated data urls as assets');
}
